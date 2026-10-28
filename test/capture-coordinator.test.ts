import assert from 'node:assert/strict';
import test from 'node:test';
import { CaptureCoordinator } from '../src/main/capture-coordinator';
import { createInitialState, reduceControlState, regionSaved, selectTarget, type CaptureTarget, type ControlState } from '../src/main/control-state';
import { savedTargetFrom } from '../src/main/game-target';
import { cloneDefaults } from '../src/main/settings-store';
import { TargetCaptureUnavailable, type CapturedFrame, type FrameSourceEvent, type WindowMetadata } from '../src/main/native-capture-client';
import type { NormalizedRegion } from '../src/shared/region';
import { regionToClientRect } from '../src/shared/region';

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function metadata(left = 0, width = 800, dpi = 96): WindowMetadata {
  return { exists: true, visible: true, minimized: false, capturable: true, dpi, foregroundHandle: '42', targetIsForeground: true,
    clientRect: { left, top: 0, right: left + width, bottom: 600 }, timestamp: Date.now() };
}
function gameWindow(handle: string): CaptureTarget {
  return { id: `window:${handle}:0`, name: 'Game', nativeHandle: handle, processId: 7, executableName: 'game.exe', className: 'GameWindow' };
}
const savedRegion = { x: 0.25, y: 0.5, width: 0.5, height: 0.25 };
function fixture(initial = selectTarget(createInitialState(cloneDefaults()), gameWindow('42'))) {
  let state = initial; let visible = false; let generation = 0; let target = '42'; let sequence = 0; let epoch = 1;
  const queries: string[] = []; const starts: string[] = []; const bounds: unknown[] = []; const regions: (NormalizedRegion | null)[] = [];
  let query = async (_handle: string) => metadata();
  let listTargets = async (): Promise<CaptureTarget[]> => []; let lists = 0;
  let startResult: (() => Promise<void>) | undefined;
  let grabResult: (() => Promise<CapturedFrame | null>) | undefined;
  let listener: ((event: FrameSourceEvent) => void) | null = null;
  const overlay = { hide() { visible = false; }, showInactive() { visible = true; }, isVisible: () => visible, setBounds(value: unknown) { bounds.push(value); } };
  const coordinator = new CaptureCoordinator({
    frameSource: {
      subscribe(next) { listener = next; return () => { listener = null; }; },
      async start(window, nextGeneration) { generation = nextGeneration; target = window.nativeHandle; sequence = 0; epoch = 1; starts.push(window.id); await startResult?.(); return { target, captureGeneration: generation, sessionEpoch: epoch }; },
      async grab(region) { regions.push(region); return grabResult ? grabResult() : null; },
      async stopCapture() {}
    },
    overlayWindow: overlay,
    metadataClient: { query(handle) { queries.push(handle); return query(handle); } },
    catalog: { listTargets() { lists++; return listTargets(); } },
    screen: { screenToDipPoint: (point) => point },
    getState: () => state,
    updateState: (update) => { state = update(state); }
  });
  function frame(overrides: Partial<CapturedFrame> = {}, blank = false): CapturedFrame {
    const latest = coordinator.getEvidence().metadata ?? metadata();
    const client = latest.clientRect ?? metadata().clientRect!;
    const crop = state.scope === 'region' && state.region ? regionToClientRect(state.region, client) : client;
    const width = crop.right - crop.left; const height = crop.bottom - crop.top;
    const count = ++sequence;
    return { version: 1, kind: 'frame', requestId: count, target, captureGeneration: generation, sessionEpoch: epoch,
      width, height, stride: width * 4, payloadBytes: width * height * 4, pixelFormat: 'BGRA8', sequence: count,
      timestamp: Date.now(), qpcTimestamp100ns: count * 100000, clientRect: client, dpi: latest.dpi,
      cropOrigin: { x: crop.left - client.left, y: crop.top - client.top }, pixels: Buffer.alloc(width * height * 4, blank ? 0 : 255), grabLatencyMs: 1, ...overrides };
  }
  return {
    coordinator, queries, starts, bounds, regions, frame,
    get state() { return state; }, get visible() { return visible; }, get lists() { return lists; },
    setQuery(next: typeof query) { query = next; },
    setWindows(next: CaptureTarget[] | (() => Promise<CaptureTarget[]>)) { listTargets = Array.isArray(next) ? async () => next : next; },
    select(handle: string) { state = selectTarget(state, gameWindow(handle)); },
    setRegion(region: NormalizedRegion) { state = regionSaved(state, region); },
    auto(enabled = true) { state = reduceControlState(state, { type: 'set-auto', enabled }); },
    clear() { state = reduceControlState(state, { type: 'clear-overlays' }); overlay.hide(); },
    emit(overrides: Partial<CapturedFrame> = {}, blank = false) { coordinator.handleFrame(frame(overrides, blank)); },
    event(event: Extract<FrameSourceEvent, { kind: 'event' }>['event'], sessionEpoch = epoch) {
      epoch = sessionEpoch; listener?.({ kind: 'event', event, sessionEpoch, target, captureGeneration: generation, message: event, timestamp: Date.now(), qpcTimestamp100ns: 100000 });
    },
    failure() { listener?.({ kind: 'failure', error: new Error('helper crashed') }); },
    setStartResult(next: typeof startResult) { startResult = next; },
    setGrabResult(next: typeof grabResult) { grabResult = next; }
  };
}
async function settle() { for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve)); }

test('saved-region capture exposes bytes to main and aligns the click-through marker', async (t) => {
  const f = fixture(); t.after(() => f.coordinator.dispose()); f.setRegion(savedRegion);
  await f.coordinator.start('continuous'); f.emit();
  assert.deepEqual(f.regions, [savedRegion]);
  assert.deepEqual(f.bounds.at(-1), { x: 200, y: 300, width: 400, height: 150 });
  assert.equal(f.visible, true); assert.equal(f.state.status, 'running');
  assert.equal(f.coordinator.getLatestFrame()?.pixels.length, 400 * 150 * 4);
});

test('replacement capture ignores old metadata results and failures, and queries immediately', async (t) => {
  for (const fail of [false, true]) {
    const f = fixture(); t.after(() => f.coordinator.dispose());
    const pending = deferred<WindowMetadata>(); f.setQuery((handle) => handle === '42' ? pending.promise : Promise.resolve(metadata(100)));
    const old = f.coordinator.start('continuous'); f.select('43'); await f.coordinator.start('continuous');
    if (fail) pending.reject(new Error('old failure')); else pending.resolve({ ...metadata(), capturable: false });
    await old; f.emit();
    assert.deepEqual(f.queries, ['42', '43']); assert.deepEqual(f.starts, ['window:43:0']);
    assert.equal(f.coordinator.getEvidence().metadata?.clientRect?.left, 100); assert.equal(f.visible, true);
  }
});

test('move, resize, and DPI changes hide output until exact matching geometry and epoch arrive', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture(); t.after(() => f.coordinator.dispose()); await f.coordinator.start('continuous'); f.emit();
  let epoch = 1;
  for (const next of [metadata(50), metadata(50, 900), metadata(50, 900, 120)]) {
    const old = f.frame(); f.setQuery(async () => next); f.event('geometryChanged', ++epoch);
    assert.equal(f.visible, false); assert.equal(f.coordinator.getLatestFrame(), null);
    t.mock.timers.tick(200); await settle();
    f.coordinator.handleFrame(old); assert.equal(f.visible, false);
    f.emit({ width: next.clientRect!.right - next.clientRect!.left + 1 }); assert.equal(f.visible, false);
    f.emit({ dpi: next.dpi + 1 }); assert.equal(f.visible, false);
    f.emit(); assert.equal(f.visible, true);
  }
});

test('device loss blocks same-epoch frames; recovery alone cannot show the marker', async (t) => {
  const f = fixture(); t.after(() => f.coordinator.dispose()); await f.coordinator.start('continuous'); f.emit();
  f.event('deviceLost'); f.emit(); assert.equal(f.visible, false);
  f.coordinator.setOverlayVisibility(true); assert.equal(f.visible, false);
  f.event('deviceRecovered', 2); assert.equal(f.visible, false);
  f.emit({ sessionEpoch: 1 }); assert.equal(f.visible, false);
  f.emit(); assert.equal(f.visible, true);
});

test('stale target, generation, sequence, timestamp, and crop never replace the accepted frame', async (t) => {
  const f = fixture(); t.after(() => f.coordinator.dispose()); await f.coordinator.start('continuous'); f.emit();
  const accepted = f.coordinator.getLatestFrame(); assert.ok(accepted);
  for (const override of [{ target: '43' }, { captureGeneration: 999 }, { sequence: accepted.sequence }, { qpcTimestamp100ns: accepted.qpcTimestamp100ns }, { cropOrigin: { x: 1, y: 0 } }]) {
    f.emit(override); assert.equal(f.coordinator.getLatestFrame(), accepted); assert.equal(f.state.captureProbe.frameCount, 1);
  }
});

test('Clear suppresses pending output until a new capture starts', async (t) => {
  for (const mode of ['continuous', 'one-shot'] as const) {
    const f = fixture(); t.after(() => f.coordinator.dispose()); const pending = deferred<WindowMetadata>();
    f.setQuery(() => pending.promise); const starting = f.coordinator.start(mode); f.clear(); pending.resolve(metadata()); await starting;
    f.emit(); f.coordinator.setOverlayVisibility(true); assert.equal(f.visible, false);
    await f.coordinator.start(mode); f.emit(); assert.equal(f.visible, true);
  }
});

test('stopping during metadata or frame startup cannot revive output', async (t) => {
  const f = fixture(); t.after(() => f.coordinator.dispose()); const pending = deferred<WindowMetadata>();
  f.setQuery(() => pending.promise); const starting = f.coordinator.start('continuous'); f.coordinator.stop(); pending.resolve(metadata()); await starting;
  assert.deepEqual(f.starts, []); f.emit(); assert.equal(f.visible, false);
  f.setQuery(async () => metadata()); const frame = deferred<CapturedFrame | null>(); f.setGrabResult(() => frame.promise);
  const next = f.coordinator.start('continuous'); await settle(); const old = f.frame(); f.coordinator.stop(); frame.resolve(old); await next;
  assert.equal(f.visible, false); assert.equal(f.state.captureProbe.frameCount, 0);
});

test('blank, protected, minimized, closed, and target capture failures preserve the game and region', async (t) => {
  for (const cause of ['blank', 'unavailable', 'minimized', 'closed', 'start'] as const) {
    const f = fixture(); t.after(() => f.coordinator.dispose()); f.setRegion(savedRegion);
    if (cause === 'start') f.setStartResult(async () => { throw new TargetCaptureUnavailable('protected target'); });
    await f.coordinator.start('continuous');
    if (cause !== 'start') { f.emit(); f.event(cause); }
    assert.equal(f.state.status, 'waiting'); assert.equal(f.visible, false); assert.deepEqual(f.state.region, savedRegion);
    assert.deepEqual(savedTargetFrom(gameWindow('42')), f.state.gameTarget.kind === 'attached' ? savedTargetFrom(f.state.gameTarget.window) : f.state.gameTarget.kind === 'detached' ? f.state.gameTarget.saved : null);
  }
});

test('helper failure is a runtime error that preserves settings and prevents late frames', async (t) => {
  const f = fixture(); t.after(() => f.coordinator.dispose()); f.setRegion(savedRegion); f.auto();
  await f.coordinator.start('continuous'); f.emit(); f.failure(); f.emit();
  assert.equal(f.state.status, 'error'); assert.equal(f.state.autoEnabled, false); assert.equal(f.visible, false);
  assert.deepEqual(f.state.region, savedRegion); assert.equal(f.state.gameTarget.kind, 'attached');
});

test('one-shot retains accepted bytes and marker until geometry changes', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture(); t.after(() => f.coordinator.dispose()); await f.coordinator.start('one-shot'); f.emit();
  assert.equal(f.state.status, 'idle'); assert.equal(f.visible, true); assert.ok(f.coordinator.getLatestFrame());
  f.setQuery(async () => metadata(100)); t.mock.timers.tick(200); await settle();
  assert.equal(f.visible, false); assert.equal(f.coordinator.getLatestFrame(), null);
});

test('Auto retries an unavailable target; pending retries cannot restart a replaced game', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture(); t.after(() => f.coordinator.dispose()); f.auto();
  f.setQuery(async () => ({ ...metadata(), capturable: false, minimized: true })); await f.coordinator.start('continuous');
  assert.equal(f.state.status, 'waiting'); const pending = deferred<WindowMetadata>(); f.setQuery(() => pending.promise);
  t.mock.timers.tick(600); await settle(); assert.equal(f.queries.length, 2);
  f.select('43'); f.setQuery(async () => metadata()); await f.coordinator.start('continuous');
  pending.resolve(metadata(900)); await settle(); assert.deepEqual(f.starts, ['window:43:0']); f.emit(); assert.equal(f.visible, true);
});

test('saved game reconnects after closing and keeps its normalized region', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture(); t.after(() => f.coordinator.dispose()); f.setRegion(savedRegion); f.auto();
  await f.coordinator.start('continuous'); f.event('closed'); f.setWindows([gameWindow('99')]);
  t.mock.timers.tick(1000); await settle();
  assert.deepEqual(f.starts, ['window:42:0', 'window:99:0']); assert.deepEqual(f.state.region, savedRegion); f.emit(); assert.equal(f.visible, true);
});

test('ambiguous reconnect waits for a window choice and a failed helper listing is a runtime error', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  for (const error of [false, true]) {
    const f = fixture(); t.after(() => f.coordinator.dispose()); f.setRegion(savedRegion); f.auto();
    await f.coordinator.start('continuous'); f.event('closed');
    f.setWindows(error ? async () => { throw new Error('helper exited'); } : [gameWindow('98'), gameWindow('99')]);
    t.mock.timers.tick(1000); await settle();
    assert.equal(f.state.status, error ? 'error' : 'waiting'); assert.deepEqual(f.state.region, savedRegion);
    if (!error) assert.equal(f.state.gameTarget.kind, 'ambiguous');
    f.coordinator.stop();
  }
});

test('Play locates a persisted game and Clear during lookup suppresses its pending result', async (t) => {
  const settings = { ...cloneDefaults(), target: savedTargetFrom(gameWindow('42')), region: savedRegion };
  const f = fixture(createInitialState(settings)); t.after(() => f.coordinator.dispose());
  const pending = deferred<CaptureTarget[]>(); f.setWindows(() => pending.promise);
  const starting = f.coordinator.start('one-shot'); f.clear(); pending.resolve([gameWindow('55')]); await starting; f.emit();
  assert.deepEqual(f.starts, ['window:55:0']); assert.equal(f.visible, false); assert.deepEqual(f.state.region, savedRegion);
});

test('no usable frame and stalled capture enter Waiting without dropping settings', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  for (const received of [false, true]) {
    const f = fixture(); t.after(() => f.coordinator.dispose()); f.setRegion(savedRegion);
    await f.coordinator.start('continuous'); if (received) f.emit();
    t.mock.timers.tick(5000); await settle();
    assert.equal(f.state.status, 'waiting'); assert.equal(f.visible, false); assert.deepEqual(f.state.region, savedRegion);
    f.coordinator.stop();
  }
});
