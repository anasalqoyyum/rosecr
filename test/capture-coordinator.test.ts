import assert from 'node:assert/strict';
import test from 'node:test';
import { CaptureCoordinator, type CaptureWorkerReport } from '../src/main/capture-coordinator';
import { createInitialState, reduceControlState, selectTarget } from '../src/main/control-state';
import { cloneDefaults } from '../src/main/settings-store';
import type { WindowMetadata } from '../src/main/win32-metadata-client';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function metadata(left = 0, width = 800, dpi = 96): WindowMetadata {
  return {
    requestId: 1, exists: true, visible: true, minimized: false, capturable: true,
    dpi, foregroundHandle: '42', targetIsForeground: true,
    clientRect: { left, top: 0, right: left + width, bottom: 600 }, timestamp: Date.now()
  };
}

function fixture() {
  let state = selectTarget(createInitialState(cloneDefaults()), { id: 'window:42:0', name: 'Game', nativeHandle: '42' });
  let visible = false;
  let generation = 0;
  const queries: string[] = [];
  const starts: string[] = [];
  const bounds: unknown[] = [];
  let query = async (_handle: string) => metadata();
  let startReport: CaptureWorkerReport | undefined;
  let startResult: (() => Promise<CaptureWorkerReport | undefined>) | undefined;
  const dependencies = {
    captureWindow: { webContents: {
      isLoading: () => false, send() {},
      async executeJavaScript(script: string) {
        if (!script.startsWith('window.captureProbeRuntime.start(')) return;
        const options = JSON.parse(script.slice(script.indexOf('(') + 1, -1));
        generation = options.captureGeneration;
        starts.push(options.sourceId);
        return startResult ? startResult() : startReport;
      }
    } },
    overlayWindow: {
      hide() { visible = false; }, showInactive() { visible = true; },
      isVisible: () => visible, setBounds(value: unknown) { bounds.push(value); }
    },
    metadataClient: { query(handle: string) { queries.push(handle); return query(handle); } },
    screen: { screenToDipPoint: (point: unknown) => point },
    getState: () => state,
    updateState: (update: (current: typeof state) => typeof state) => { state = update(state); },
    workerStopChannel: 'stop'
  };
  const coordinator = new CaptureCoordinator(dependencies as unknown as ConstructorParameters<typeof CaptureCoordinator>[0]);
  return {
    coordinator, queries, starts, bounds,
    get state() { return state; }, get visible() { return visible; },
    setQuery(next: typeof query) { query = next; },
    select(handle: string) { state = selectTarget(state, { id: `window:${handle}:0`, name: 'Game', nativeHandle: handle }); },
    auto(enabled = true) { state = reduceControlState(state, { type: 'set-auto', enabled }); },
    clear() { state = reduceControlState(state, { type: 'clear-overlays' }); dependencies.overlayWindow.hide(); },
    frame(overrides: Partial<Extract<CaptureWorkerReport, { kind: 'frame' }>> = {}) {
      coordinator.handleWorkerReport({ kind: 'frame', captureGeneration: generation, blank: false, frameCount: 1,
        width: 800, height: 600, timestamp: Date.now(), ...overrides });
    },
    setStartReport(report: CaptureWorkerReport) { startReport = report; },
    setStartResult(next: typeof startResult) { startResult = next; }
  };
}

test('a replacement target queries immediately and ignores old metadata success, loss, and rejection', async (t) => {
  for (const outcome of ['bounds', 'lost', 'error']) {
    const f = fixture();
    t.after(() => f.coordinator.stop());
    const pending = deferred<WindowMetadata>();
    f.setQuery((handle) => handle === '42' ? pending.promise : Promise.resolve(metadata(100)));
    const oldStart = f.coordinator.start('continuous');
    f.select('43');
    await f.coordinator.start('continuous');
    assert.deepEqual(f.queries, ['42', '43']);
    if (outcome === 'error') pending.reject(new Error('old helper failure'));
    else pending.resolve(outcome === 'lost' ? { ...metadata(), capturable: false, exists: false } : metadata(900));
    await oldStart;
    assert.deepEqual(f.starts, ['window:43:0']);
    assert.equal(f.coordinator.getEvidence().metadata?.clientRect?.left, 100);
    assert.equal(f.state.status, 'idle');
    f.frame();
    assert.equal(f.state.status, 'running');
  }
});

test('Clear suppresses continuous and pending one-shot output until a new capture starts', async (t) => {
  for (const mode of ['continuous', 'one-shot'] as const) {
    const f = fixture();
    t.after(() => f.coordinator.stop());
    const pending = deferred<WindowMetadata>();
    f.setQuery(() => pending.promise);
    const startup = f.coordinator.start(mode);
    f.clear();
    pending.resolve(metadata());
    await startup;
    f.frame();
    assert.equal(f.visible, false);
    f.coordinator.setOverlayVisibility(true);
    assert.equal(f.visible, false);
    if (mode === 'continuous') {
      f.frame({ frameCount: 2 });
      assert.equal(f.state.captureProbe.active, true);
      assert.equal(f.visible, false);
    }
    await f.coordinator.start(mode);
    f.frame();
    assert.equal(f.visible, true);
  }
});

test('continuous probe stays running with Auto off and stops explicitly', async (t) => {
  const f = fixture();
  t.after(() => f.coordinator.stop());
  await f.coordinator.start('continuous');
  f.frame();
  assert.equal(f.state.autoEnabled, false);
  assert.equal(f.state.status, 'running');
  assert.equal(f.state.captureProbe.active, true);
  f.coordinator.stop();
  assert.equal(f.state.captureProbe.active, false);
  f.frame({ frameCount: 2 });
  assert.equal(f.state.captureProbe.frameCount, 1);
});

test('geometry changes hide output until a fresh matching frame, including movement and DPI changes', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1000 });
  const f = fixture();
  t.after(() => f.coordinator.stop());
  await f.coordinator.start('continuous');
  f.frame();
  assert.equal(f.visible, true);
  for (const next of [metadata(50), metadata(50, 900), metadata(50, 900, 120)]) {
    f.setQuery(async () => next);
    t.mock.timers.tick(200);
    await Promise.resolve();
    assert.equal(f.visible, false);
    f.coordinator.setOverlayVisibility(true);
    assert.equal(f.visible, false);
    const width = next.clientRect!.right - next.clientRect!.left;
    f.frame({ width, timestamp: Date.now() - 1 });
    assert.equal(f.visible, false);
    f.frame({ width: width + 2 });
    assert.equal(f.visible, false);
    f.frame({ width: width + 1 });
    assert.equal(f.visible, true);
  }
});

test('stopping during startup prevents worker startup and late reports cannot revive capture', async () => {
  const f = fixture();
  const pending = deferred<WindowMetadata>();
  f.setQuery(() => pending.promise);
  const startup = f.coordinator.start('continuous');
  f.coordinator.stop();
  pending.resolve(metadata());
  await startup;
  assert.deepEqual(f.starts, []);
  f.frame();
  assert.equal(f.visible, false);
  assert.equal(f.state.captureProbe.active, false);
});

test('a pending polling query cannot stop or move the replacement capture', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture();
  t.after(() => f.coordinator.stop());
  await f.coordinator.start('continuous');
  const pending = deferred<WindowMetadata>();
  f.setQuery((handle) => handle === '42' ? pending.promise : Promise.resolve(metadata(100)));
  t.mock.timers.tick(200);
  f.select('43');
  await f.coordinator.start('continuous');
  f.frame();
  assert.equal(f.visible, true);
  pending.resolve({ ...metadata(), capturable: false, minimized: true });
  await Promise.resolve();
  assert.equal(f.state.status, 'running');
  assert.equal(f.state.captureProbe.active, true);
  assert.equal(f.visible, true);
  assert.equal(f.coordinator.getEvidence().metadata?.clientRect?.left, 100);
  f.frame({ captureGeneration: 1, kind: 'frame', blank: true });
  assert.equal(f.state.status, 'running');
});


test('one-shot accepts a one-pixel rounding offset and rejects larger dimension differences', async (t) => {
  for (const [clientWidth, frameWidth] of [[1263, 1264], [1049, 1050], [800, 799]]) {
    const f = fixture();
    t.after(() => f.coordinator.stop());
    f.setQuery(async () => metadata(0, clientWidth));
    await f.coordinator.start('one-shot');
    f.frame({ width: frameWidth + (frameWidth > clientWidth ? 1 : -1) });
    f.frame({ width: frameWidth, height: 602 });
    assert.equal(f.state.captureProbe.frameCount, 0);
    assert.equal(f.visible, false);
    f.frame({ width: frameWidth, height: 601 });
    assert.equal(f.visible, true);
    assert.equal(f.state.statusMessage, 'Idle · capture probe passed');
    assert.equal(f.state.captureProbe.frameCount, 1);
    assert.equal(f.state.captureProbe.active, false);
  }
});

test('one-shot keeps sampling blank frames until a nonblank frame completes capture', async (t) => {
  const f = fixture();
  t.after(() => f.coordinator.stop());
  await f.coordinator.start('one-shot');
  for (const frameCount of [1, 2]) {
    f.frame({ blank: true, frameCount });
    assert.equal(f.visible, false);
    assert.equal(f.state.captureProbe.frameCount, 0);
  }
  f.frame({ frameCount: 3 });
  assert.equal(f.visible, true);
  assert.equal(f.state.statusMessage, 'Idle · capture probe passed');
  assert.equal(f.state.captureProbe.frameCount, 3);
  f.frame({ blank: true, frameCount: 4 });
  assert.equal(f.state.captureProbe.frameCount, 3);
});

test('three blank one-shot samples enter waiting without showing or passing capture', async (t) => {
  const f = fixture();
  t.after(() => f.coordinator.stop());
  await f.coordinator.start('one-shot');
  for (const frameCount of [1, 2, 3]) f.frame({ blank: true, frameCount });
  assert.equal(f.state.status, 'waiting');
  assert.equal(f.state.statusMessage, 'Waiting: target emitted repeated blank frames');
  assert.equal(f.state.captureProbe.frameCount, 0);
  assert.equal(f.visible, false);
  f.frame({ frameCount: 4 });
  assert.equal(f.state.status, 'waiting');
  assert.equal(f.state.captureProbe.frameCount, 0);
});

test('Auto polls an initially unavailable target and reattaches when it returns', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1000 });
  for (const minimized of [true, false]) {
    const f = fixture();
    t.after(() => f.coordinator.stop());
    f.auto();
    f.setQuery(async () => ({ ...metadata(), capturable: false, minimized }));
    await f.coordinator.start('continuous');
    assert.equal(f.state.status, 'waiting');
    assert.equal(f.state.autoEnabled, true);
    assert.equal(f.visible, false);
    assert.equal(f.starts.length, 0);
    t.mock.timers.tick(200);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(f.queries.length, 2);
    assert.equal(f.starts.length, 0);
    f.setQuery(async () => metadata());
    t.mock.timers.tick(200);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(f.starts, ['window:42:0']);
    f.frame();
    assert.equal(f.state.status, 'running');
    assert.equal(f.state.captureProbe.active, true);
    assert.equal(f.visible, true);
    f.coordinator.stop();
  }
});

test('Auto recovers after polling or worker reports suspend a running capture', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1000 });
  for (const loss of ['metadata', 'muted', 'ended', 'error', 'blank'] as const) {
    const f = fixture();
    t.after(() => f.coordinator.stop());
    f.auto();
    await f.coordinator.start('continuous');
    f.frame();
    if (loss === 'metadata') {
      f.setQuery(async () => ({ ...metadata(), capturable: false, minimized: true }));
      t.mock.timers.tick(200);
      await new Promise<void>((resolve) => setImmediate(resolve));
    } else if (loss === 'blank') {
      for (const frameCount of [2, 3, 4]) f.frame({ blank: true, frameCount });
    } else {
      f.coordinator.handleWorkerReport({ kind: loss, message: 'temporarily unavailable', captureGeneration: 1, timestamp: Date.now() });
    }
    assert.equal(f.state.status, 'waiting');
    assert.equal(f.visible, false);
    f.frame({ frameCount: 99 });
    assert.equal(f.state.status, 'waiting');
    f.setQuery(async () => metadata());
    t.mock.timers.tick(200);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(f.starts.length, 2);
    f.frame();
    assert.equal(f.state.status, 'running');
    assert.equal(f.visible, true);
    f.coordinator.stop();
  }
});

test('retry queries do not overlap and cancelled or replaced watchers cannot restart old targets', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  for (const action of ['stop', 'disable-auto', 'replace'] as const) {
    const f = fixture();
    t.after(() => f.coordinator.stop());
    f.auto();
    f.setQuery(async () => ({ ...metadata(), capturable: false, minimized: true }));
    await f.coordinator.start('continuous');
    const pending = deferred<WindowMetadata>();
    f.setQuery(() => pending.promise);
    t.mock.timers.tick(200);
    t.mock.timers.tick(400);
    assert.equal(f.queries.length, 2);
    if (action === 'disable-auto') f.auto(false);
    f.coordinator.stop();
    if (action === 'replace') {
      f.select('43');
      f.setQuery(async () => metadata(100));
      await f.coordinator.start('continuous');
    }
    pending.resolve(metadata(900));
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(f.starts, action === 'replace' ? ['window:43:0'] : []);
    const count = f.queries.length;
    if (action === 'replace') f.coordinator.stop();
    t.mock.timers.tick(400);
    assert.equal(f.queries.length, count);
  }
});

test('closed targets, one-shots, and Auto-off probes do not keep retry watchers', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  for (const scenario of ['closed', 'closed-while-waiting', 'one-shot', 'probe'] as const) {
    const f = fixture();
    t.after(() => f.coordinator.stop());
    if (scenario.startsWith('closed')) f.auto();
    f.setQuery(async () => ({ ...metadata(), capturable: false, exists: scenario !== 'closed' }));
    await f.coordinator.start(scenario === 'one-shot' ? 'one-shot' : 'continuous');
    if (scenario === 'closed-while-waiting') {
      f.setQuery(async () => ({ ...metadata(), capturable: false, exists: false }));
      t.mock.timers.tick(200);
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(f.state.statusMessage, 'Waiting: target window was closed');
    }
    const count = f.queries.length;
    t.mock.timers.tick(600);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(f.queries.length, count);
    assert.equal(f.starts.length, 0);
    assert.equal(f.state.captureProbe.active, false);
  }
});

test('stale-size frames neither increment nor reset blank health after a resize', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1000 });
  const f = fixture();
  t.after(() => f.coordinator.stop());
  await f.coordinator.start('continuous');
  f.frame();
  f.setQuery(async () => metadata(0, 900));
  t.mock.timers.tick(200);
  await Promise.resolve();
  for (const frameCount of [2, 3, 4]) f.frame({ blank: true, frameCount });
  assert.equal(f.state.status, 'running');
  assert.equal(f.visible, false);
  assert.equal(f.state.captureProbe.frameCount, 1);
  f.frame({ width: 901, frameCount: 5 });
  assert.equal(f.visible, true);
  assert.equal(f.state.captureProbe.frameCount, 5);
  f.frame({ width: 900, blank: true, frameCount: 6 });
  f.frame({ width: 900, blank: true, frameCount: 7 });
  f.frame({ width: 800, blank: false, frameCount: 8 });
  f.frame({ width: 900, blank: true, frameCount: 9 });
  assert.equal(f.state.statusMessage, 'Waiting: target emitted repeated blank frames');
});

test('a retained one-shot or Auto-off overlay hides once the target moves, resizes, or disappears', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1000 });
  for (const change of [metadata(50), metadata(0, 900), metadata(0, 800, 120), { ...metadata(), capturable: false, minimized: true }, { ...metadata(), capturable: false, exists: false }]) {
    for (const retainedBy of ['one-shot', 'auto-off'] as const) {
      const f = fixture();
      t.after(() => f.coordinator.stop());
      if (retainedBy === 'auto-off') f.auto();
      await f.coordinator.start(retainedBy === 'one-shot' ? 'one-shot' : 'continuous');
      f.frame();
      if (retainedBy === 'auto-off') {
        f.auto(false);
        f.coordinator.stop(false);
      }
      t.mock.timers.tick(200);
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(f.visible, true);
      f.setQuery(async () => change);
      t.mock.timers.tick(200);
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(f.visible, false);
      f.coordinator.setOverlayVisibility(true);
      assert.equal(f.visible, false);
      const count = f.queries.length;
      t.mock.timers.tick(600);
      assert.equal(f.queries.length, count);
    }
  }
});

test('a capture with no usable frame enters waiting instead of running indefinitely', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1000 });
  for (const mode of ['one-shot', 'continuous'] as const) {
    const f = fixture();
    t.after(() => f.coordinator.stop());
    await f.coordinator.start(mode);
    f.frame({ width: 1600 });
    t.mock.timers.tick(4999);
    assert.equal(f.state.status, 'idle');
    t.mock.timers.tick(1);
    assert.equal(f.state.statusMessage, 'Waiting: no usable frames from target');
    assert.equal(f.state.captureProbe.active, false);

    await f.coordinator.start(mode);
    f.frame();
    t.mock.timers.tick(10000);
    assert.notEqual(f.state.status, 'waiting');
  }
});

test('a stalled worker startup times out and Auto keeps polling the target meanwhile', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1000 });
  const f = fixture();
  t.after(() => f.coordinator.stop());
  f.auto();
  f.setStartResult(() => new Promise(() => {}));
  void f.coordinator.start('continuous');
  await new Promise<void>((resolve) => setImmediate(resolve));
  f.setQuery(async () => ({ ...metadata(), capturable: false, minimized: true }));
  t.mock.timers.tick(200);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(f.state.statusMessage, 'Waiting: target is minimized');

  f.auto(false);
  f.coordinator.stop();
  f.setQuery(async () => metadata());
  void f.coordinator.start('one-shot');
  await new Promise<void>((resolve) => setImmediate(resolve));
  t.mock.timers.tick(5000);
  assert.equal(f.state.statusMessage, 'Waiting: no usable frames from target');
});

test('a rejected worker startup waits and lets Auto reattach', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1000 });
  const f = fixture();
  t.after(() => f.coordinator.stop());
  f.auto();
  f.setStartResult(async () => { throw new Error('Could not start video source'); });
  await f.coordinator.start('continuous');
  assert.equal(f.state.statusMessage, 'Waiting: Could not start video source');
  assert.equal(f.state.autoEnabled, true);
  f.setStartResult(undefined);
  t.mock.timers.tick(200);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(f.starts.length, 2);
  f.frame();
  assert.equal(f.state.status, 'running');
});

test('each capture starts with fresh frame metrics', async (t) => {
  const f = fixture();
  t.after(() => f.coordinator.stop());
  await f.coordinator.start('continuous');
  f.frame({ frameCount: 5, firstFrameLatencyMs: 90 });
  f.select('43');
  f.setQuery(async () => ({ ...metadata(), capturable: false, exists: false }));
  await f.coordinator.start('continuous');
  assert.equal(f.state.status, 'waiting');
  assert.deepEqual(f.state.captureProbe, { active: false, frameCount: 0, firstFrameLatencyMs: null, frameSize: null, lastFrameAt: null });
});
