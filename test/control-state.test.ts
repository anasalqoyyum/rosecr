import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureFrameReported,
  createInitialState,
  reduceControlState,
  runtimeError,
  selectTarget,
  targetUnavailable
} from '../src/main/control-state';
import { cloneDefaults } from '../src/main/settings-store';

const target = { id: 'window:42:0', name: 'Game', nativeHandle: '42' };

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
