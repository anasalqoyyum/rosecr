import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_REGION,
  adjustRegion,
  formatRegion,
  meetsMinimumSize,
  parseNormalizedRegion,
  regionFromPoints,
  regionToClientRect
} from '../src/shared/region';

test('a dragged region is clamped to the client area in either drag direction', () => {
  assert.deepEqual(regionFromPoints({ x: 0.8, y: 0.9 }, { x: 0.2, y: 0.6 }), { x: 0.2, y: 0.6, width: 0.6, height: 0.3 });
  assert.deepEqual(regionFromPoints({ x: -0.5, y: 0.5 }, { x: 1.4, y: 2 }), { x: 0, y: 0.5, width: 1, height: 0.5 });
  assert.equal(meetsMinimumSize(regionFromPoints({ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.9 })), false);
  assert.equal(meetsMinimumSize(DEFAULT_REGION), true);
});

test('every drag to a client edge stays within bounds after rounding', () => {
  const width = 1280;
  for (let start = 0; start < width; start++) {
    const region = regionFromPoints({ x: start / width, y: start / width }, { x: 1, y: 1 });
    if (meetsMinimumSize(region)) assert.ok(parseNormalizedRegion(region), JSON.stringify(region));
  }
});

test('keyboard adjustment moves and resizes without leaving the client area', () => {
  const region = { x: 0.9, y: 0, width: 0.1, height: 0.5 };
  assert.deepEqual(adjustRegion(region, { dx: 0.01, dy: -0.01, resize: false }), region);
  assert.deepEqual(adjustRegion(region, { dx: -0.01, dy: 0.01, resize: false }), { x: 0.89, y: 0.01, width: 0.1, height: 0.5 });
  assert.deepEqual(adjustRegion(region, { dx: 0.01, dy: 0.01, resize: true }), { x: 0.9, y: 0, width: 0.1, height: 0.51 });
  assert.deepEqual(
    adjustRegion({ x: 0.1, y: 0.1, width: 0.02, height: 0.02 }, { dx: -0.01, dy: -0.01, resize: true }),
    { x: 0.1, y: 0.1, width: 0.02, height: 0.02 }
  );
});

test('the same normalized region follows client movement and scaling in physical pixels', () => {
  const region = { x: 0.25, y: 0.5, width: 0.5, height: 0.25 };
  assert.deepEqual(regionToClientRect(region, { left: 0, top: 0, right: 1280, bottom: 720 }), { left: 320, top: 360, right: 960, bottom: 540 });
  assert.deepEqual(regionToClientRect(region, { left: 500, top: 200, right: 1780, bottom: 920 }), { left: 820, top: 560, right: 1460, bottom: 740 });
  assert.deepEqual(regionToClientRect(region, { left: -2560, top: 0, right: 0, bottom: 1440 }), { left: -1920, top: 720, right: -640, bottom: 1080 });
  const odd = regionToClientRect({ x: 1 / 3, y: 0, width: 2 / 3, height: 1 }, { left: 0, top: 0, right: 1001, bottom: 10 });
  assert.equal(odd.right, 1001);
});

test('only in-bounds regions of usable size survive the persistence and IPC boundary', () => {
  assert.deepEqual(parseNormalizedRegion({ x: 0.41, y: 0.67, width: 0.53, height: 0.21, extra: true }), { x: 0.41, y: 0.67, width: 0.53, height: 0.21 });
  for (const invalid of [
    null, 'region', { x: 0.5, y: 0.5, width: 0.6, height: 0.1 }, { x: -0.1, y: 0, width: 0.5, height: 0.5 },
    { x: 0, y: 0, width: 0.01, height: 0.5 }, { x: 0, y: 0, width: Number.NaN, height: 0.5 }, { x: '0', y: 0, width: 1, height: 1 }
  ]) assert.equal(parseNormalizedRegion(invalid), null, JSON.stringify(invalid));
});

test('regions are described with two-decimal client fractions', () => {
  assert.equal(formatRegion({ x: 0.41, y: 0.672, width: 0.53, height: 0.2149 }), 'x 0.41 · y 0.67 · w 0.53 · h 0.21');
});
