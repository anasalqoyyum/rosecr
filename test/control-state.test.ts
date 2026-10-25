import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureFrameReported,
  createInitialState,
  reduceControlState,
  regionSaved,
  runtimeError,
  savedGameTarget,
  selectTarget,
  targetResolved,
  targetUnavailable
} from '../src/main/control-state';
import { savedTargetFrom } from '../src/main/game-target';
import { cloneDefaults } from '../src/main/settings-store';

const target = { id: 'window:42:0', name: 'Game', nativeHandle: '42', processId: 7, executableName: 'game.exe', className: 'GameWindow' };

test('startup restores durable preferences but never restores Auto', () => {
  const settings = cloneDefaults();
  settings.direction = 'en-ja';
  settings.scope = 'window';
  settings.overlayVisible = false;
  const state = createInitialState(settings);

  assert.equal(state.status, 'idle');
  assert.equal(state.autoEnabled, false);
  assert.equal(state.direction, 'en-ja');
  assert.equal(state.scope, 'window');
  assert.equal(state.overlayVisible, false);
});

test('Play is one-shot while Play during Auto requests an immediate refresh', () => {
  let state = selectTarget(createInitialState(cloneDefaults()), target);
  state = reduceControlState(state, { type: 'play' });
  assert.equal(state.status, 'running');
  assert.equal(state.autoEnabled, false);
  const firstRefresh = state.refreshGeneration;

  state = captureFrameReported(state, {
    frameCount: 1,
    firstFrameLatencyMs: 80,
    width: 1920,
    height: 1080,
    timestamp: 1
  });
  assert.equal(state.status, 'idle');
  assert.equal(state.captureProbe.firstFrameLatencyMs, 80);

  state = reduceControlState(state, { type: 'set-auto', enabled: true });
  state = reduceControlState(state, { type: 'play' });
  assert.equal(state.autoEnabled, true);
  assert.equal(state.status, 'running');
  assert.equal(state.refreshGeneration, firstRefresh + 1);
});

test('Auto starts immediately, visibility is independent, and disabling returns idle', () => {
  let state = selectTarget(createInitialState(cloneDefaults()), target);
  state = reduceControlState(state, { type: 'set-auto', enabled: true });
  state = reduceControlState(state, { type: 'set-overlay-visible', visible: false });
  assert.equal(state.status, 'running');
  assert.equal(state.autoEnabled, true);
  assert.equal(state.overlayVisible, false);

  state = reduceControlState(state, { type: 'set-auto', enabled: false });
  assert.equal(state.status, 'idle');
  assert.equal(state.autoEnabled, false);
  assert.equal(state.overlayVisible, false);
});

test('missing, minimized, and nonrecoverable runtime failures have distinct visible states', () => {
  let state = reduceControlState(createInitialState(cloneDefaults()), { type: 'play' });
  assert.equal(state.status, 'waiting');

  state = targetUnavailable(selectTarget(state, target), 'target is minimized');
  assert.equal(state.status, 'waiting');
  assert.match(state.statusMessage, /minimized/);

  state = runtimeError(state, 'metadata helper stopped');
  assert.equal(state.status, 'error');
  assert.equal(state.autoEnabled, false);
});

test('direction, scope, and Clear invalidate visible work without starting Auto', () => {
  let state = selectTarget(createInitialState(cloneDefaults()), target);
  state = reduceControlState(state, { type: 'set-direction', direction: 'en-ja' });
  state = reduceControlState(state, { type: 'set-scope', scope: 'window' });
  state = reduceControlState(state, { type: 'clear-overlays' });

  assert.equal(state.direction, 'en-ja');
  assert.equal(state.scope, 'window');
  assert.equal(state.clearGeneration, 4);
  assert.equal(state.autoEnabled, false);
});

test('each capture records its own first-frame latency', () => {
  let state = selectTarget(createInitialState(cloneDefaults()), target);
  const frame = { frameCount: 1, width: 800, height: 600, timestamp: 1 };
  state = captureFrameReported(state, { ...frame, firstFrameLatencyMs: 80 }, 'continuous');
  state = captureFrameReported(state, { ...frame, frameCount: 2 }, 'continuous');
  assert.equal(state.captureProbe.firstFrameLatencyMs, 80);
  state = captureFrameReported(state, { ...frame, firstFrameLatencyMs: 300 }, 'one-shot');
  assert.equal(state.captureProbe.firstFrameLatencyMs, 300);
});

test('a restored game starts detached with its region, and no failure or lookup discards either', () => {
  const settings = cloneDefaults();
  settings.target = savedTargetFrom(target);
  settings.region = { x: 0.1, y: 0.6, width: 0.8, height: 0.3 };
  const restored = createInitialState(settings);
  assert.deepEqual(restored.gameTarget, { kind: 'detached', saved: settings.target });
  assert.equal(restored.status, 'idle');

  const twin = { ...target, id: 'window:43:0', nativeHandle: '43' };
  const states = [
    targetUnavailable(restored, 'target window was closed'),
    runtimeError(restored, 'metadata helper crashed'),
    targetResolved(restored, { kind: 'missing' }),
    targetResolved(restored, { kind: 'ambiguous', candidates: [target, twin] }),
    targetResolved(targetResolved(restored, { kind: 'unique', window: twin }), { kind: 'missing' })
  ];
  for (const state of states) {
    assert.deepEqual(state.region, settings.region);
    assert.equal(savedGameTarget(state.gameTarget)?.executableName, 'game.exe');
  }
  assert.deepEqual(states.at(-1)?.gameTarget, { kind: 'detached', saved: savedTargetFrom(twin) });
  assert.deepEqual(targetResolved(createInitialState(cloneDefaults()), { kind: 'unique', window: target }).gameTarget, { kind: 'unselected' });
});

test('choosing a window resolves ambiguity without touching the region, and saving a region clears old output', () => {
  const region = { x: 0.1, y: 0.6, width: 0.8, height: 0.3 };
  const ambiguous = targetResolved(
    regionSaved(selectTarget(createInitialState(cloneDefaults()), target), region),
    { kind: 'ambiguous', candidates: [target, { ...target, nativeHandle: '43' }] }
  );
  const chosen = selectTarget(ambiguous, target);
  assert.deepEqual(chosen.gameTarget, { kind: 'attached', window: target });
  assert.deepEqual(chosen.region, region);

  const resaved = regionSaved(chosen, { ...region, y: 0.5 });
  assert.equal(resaved.clearGeneration, chosen.clearGeneration + 1);
  assert.equal(resaved.refreshGeneration, chosen.refreshGeneration + 1);
});
