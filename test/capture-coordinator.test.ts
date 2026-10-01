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
  const dependencies = {
    captureWindow: { webContents: {
      isLoading: () => false, send() {},
      async executeJavaScript(script: string) {
        if (!script.startsWith('window.captureProbeRuntime.start(')) return;
        const options = JSON.parse(script.slice(script.indexOf('(') + 1, -1));
        generation = options.captureGeneration;
        starts.push(options.sourceId);
        return startReport;
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
    clear() { state = reduceControlState(state, { type: 'clear-overlays' }); dependencies.overlayWindow.hide(); },
    frame(overrides: Partial<Extract<CaptureWorkerReport, { kind: 'frame' }>> = {}) {
      coordinator.handleWorkerReport({ kind: 'frame', captureGeneration: generation, blank: false, frameCount: 1,
        width: 800, height: 600, timestamp: Date.now(), ...overrides });
    },
    setStartReport(report: CaptureWorkerReport) { startReport = report; }
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
    f.frame({ width: width + 1 });
    assert.equal(f.visible, false);
    f.frame({ width });
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
