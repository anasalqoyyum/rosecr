import assert from 'node:assert/strict';
import test from 'node:test';
import { CaptureHealth } from '../src/main/capture-health';
import { nativeWindowsToCaptureTargets } from '../src/main/capture-source';
import { physicalClientRectToDip } from '../src/main/geometry';

test('native target enumeration rejects every window owned by Rosecr', () => {
  const targets = nativeWindowsToCaptureTargets(
    [
      { handle: '10', title: 'Rosecr', processId: 100, executableName: 'rosecr.exe', className: 'Chrome_WidgetWin_1' },
      { handle: '11', title: 'Rosecr settings', processId: 100, executableName: 'rosecr.exe', className: 'Chrome_WidgetWin_1' },
      { handle: '12', title: 'Game', processId: 200, executableName: 'game.exe', className: 'UnityWndClass' }
    ],
    100
  );
  assert.deepEqual(targets, [
    {
      id: 'window:12:0',
      name: 'Game',
      nativeHandle: '12',
      processId: 200,
      executableName: 'game.exe',
      className: 'UnityWndClass',
      thumbnailDataUrl: null,
      iconDataUrl: null
    }
  ]);
});

test('physical target geometry converts both corners for mixed-DPI alignment', () => {
  const bounds = physicalClientRectToDip(
    { left: 2000, top: 100, right: 3200, bottom: 1000 },
    ({ x, y }) => ({ x: Math.round(x / 1.5), y: Math.round(y / 1.5) })
  );
  assert.deepEqual(bounds, { x: 1333, y: 67, width: 800, height: 600 });
});

test('blank and invalid frames enter waiting instead of appearing valid', () => {
  const health = new CaptureHealth();
  assert.deepEqual(health.assess({ blank: false, width: 0, height: 1080 }), {
    valid: false,
    reason: 'target emitted an invalid frame size'
  });
  assert.equal(health.assess({ blank: true, width: 1920, height: 1080 }).valid, true);
  assert.equal(health.assess({ blank: true, width: 1920, height: 1080 }).valid, true);
  assert.deepEqual(health.assess({ blank: true, width: 1920, height: 1080 }), {
    valid: false,
    reason: 'target emitted repeated blank frames'
  });
});
