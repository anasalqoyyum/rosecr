const test = require('node:test');
const assert = require('node:assert/strict');
const { CaptureHealth } = require('../src/main/capture-health');
const { nativeWindowsToCaptureTargets, parseWindowSourceId, publicCaptureTargets } = require('../src/main/capture-source');
const { markerBounds, physicalClientRectToDip } = require('../src/main/geometry');

const image = { isEmpty: () => true, toDataURL: () => '' };

test('source ids expose HWNDs and Rosecr-owned windows never become targets', () => {
  assert.deepEqual(parseWindowSourceId('window:123456:0'), {
    nativeHandle: '123456',
    ownedByCurrentProcess: false
  });
  const targets = publicCaptureTargets(
    [
      { id: 'window:10:1', name: 'Rosecr', thumbnail: image, appIcon: null },
      { id: 'window:11:0', name: 'Rosecr overlay', thumbnail: image, appIcon: null },
      { id: 'window:12:0', name: 'Game', thumbnail: image, appIcon: null }
    ],
    new Set(['11']),
    new Set(['Rosecr settings'])
  );
  assert.deepEqual(targets.map((target) => target.name), ['Game']);
});

test('native target enumeration rejects every window owned by Rosecr', () => {
  const targets = nativeWindowsToCaptureTargets(
    [
      { handle: '10', title: 'Rosecr', processId: 100 },
      { handle: '11', title: 'Rosecr settings', processId: 100 },
      { handle: '12', title: 'Game', processId: 200 }
    ],
    100
  );
  assert.deepEqual(targets, [
    {
      id: 'window:12:0',
      name: 'Game',
      nativeHandle: '12',
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
  assert.deepEqual(markerBounds(bounds), { x: 64, y: 60, width: 48, height: 48 });
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
