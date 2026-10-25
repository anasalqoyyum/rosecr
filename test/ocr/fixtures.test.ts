import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { developmentSidecarLaunch, OcrSidecar } from '../../src/main/ocr-sidecar';
import type { OcrBox, OcrOrientation, PhysicalRect } from '../../src/shared/contracts';
import { decodePngToBgra } from '../helpers/png';

const REPOSITORY_ROOT = path.join(__dirname, '..', '..');
const FIXTURES = path.join(__dirname, '..', 'fixtures', 'ocr');

interface ExpectedBox {
  text: string;
  orientation: OcrOrientation;
  rect: [number, number, number, number];
}

const manifest = JSON.parse(readFileSync(path.join(FIXTURES, 'expected.json'), 'utf8')) as Record<string, {
  width: number;
  height: number;
  boxes: ExpectedBox[];
}>;

function intersectionOverUnion(a: PhysicalRect, [x, y, width, height]: ExpectedBox['rect']): number {
  const overlapWidth = Math.max(0, Math.min(a.x + a.width, x + width) - Math.max(a.x, x));
  const overlapHeight = Math.max(0, Math.min(a.y + a.height, y + height) - Math.max(a.y, y));
  const intersection = overlapWidth * overlapHeight;
  return intersection / (a.width * a.height + width * height - intersection);
}

function assertMatches(name: string, boxes: OcrBox[], expected: ExpectedBox[]): void {
  const matched = expected.map((want) => {
    const box = boxes.find((candidate) => intersectionOverUnion(candidate.rect, want.rect) >= 0.5);
    assert.ok(box, `${name}: no box overlaps "${want.text}"; got ${JSON.stringify(boxes)}`);
    assert.equal(box.text, want.text, name);
    assert.equal(box.orientation, want.orientation, `${name}: ${want.text}`);
    assert.ok(box.confidence >= 0.9, `${name}: ${want.text} confidence ${box.confidence}`);
    return box;
  });
  assert.deepEqual(
    matched.map((box) => box.readingOrder),
    expected.map((_, index) => index),
    `${name}: reading order`
  );
}

test('the bundled sidecar recognizes horizontal and vertical Japanese and English fixtures', async (t) => {
  const sidecar = new OcrSidecar({ launch: developmentSidecarLaunch(REPOSITORY_ROOT), requestTimeoutMs: 20_000 });
  t.after(() => sidecar.stop());
  const status = await sidecar.start();
  assert.equal(status.state, 'ready', JSON.stringify(status));

  let captureGeneration = 0;
  for (const [name, fixture] of Object.entries(manifest)) {
    const png = readFileSync(path.join(FIXTURES, `${name}.png`));
    const raw = decodePngToBgra(png);
    assert.deepEqual([raw.width, raw.height], [fixture.width, fixture.height]);

    captureGeneration += 1;
    const fromRaw = await sidecar.recognize({
      captureGeneration,
      image: { format: 'bgra8', width: raw.width, height: raw.height, data: raw.bgra }
    });
    assert.ok(fromRaw.status === 'ok', `${name}: ${JSON.stringify(fromRaw)}`);
    assert.equal(fromRaw.result.captureGeneration, captureGeneration);
    assertMatches(name, fromRaw.result.boxes, fixture.boxes);

    const fromPng = await sidecar.recognize({
      captureGeneration,
      image: { format: 'png', width: raw.width, height: raw.height, data: png }
    });
    assert.deepEqual(fromPng.status === 'ok' && fromPng.result.boxes, fromRaw.result.boxes, `${name}: PNG and BGRA disagree`);
  }
});
