import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeFrame, FrameDecoder, FrameError, parseSidecarMessage } from '../src/main/ocr-sidecar-protocol';

function box(overrides: Record<string, unknown> = {}) {
  return { x: 1, y: 2, width: 3, height: 4, text: '猫', confidence: 0.9, orientation: 'vertical', readingOrder: 0, ...overrides };
}

test('frames survive arbitrary chunk boundaries', () => {
  const bytes = Buffer.concat([
    encodeFrame({ type: 'ocr', text: '日本語' }, Buffer.from([1, 2, 3])),
    encodeFrame({ type: 'next' })
  ]);
  const decoder = new FrameDecoder();
  const frames = [...bytes].flatMap((byte) => decoder.push(Buffer.from([byte])));

  assert.deepEqual(frames.map((frame) => [frame.header, [...frame.body]]), [
    [{ type: 'ocr', text: '日本語' }, [1, 2, 3]],
    [{ type: 'next' }, []]
  ]);
});

test('oversized, inconsistent, and non-JSON frames are rejected', () => {
  const oversized = Buffer.alloc(4);
  oversized.writeUInt32BE(101);
  assert.throws(() => new FrameDecoder(100).push(oversized), FrameError);

  const inconsistent = Buffer.alloc(8);
  inconsistent.writeUInt32BE(4, 0);
  inconsistent.writeUInt32BE(1, 4);
  assert.throws(() => new FrameDecoder().push(inconsistent), FrameError);

  const garbage = Buffer.concat([Buffer.alloc(8), Buffer.from('{')]);
  garbage.writeUInt32BE(5, 0);
  garbage.writeUInt32BE(1, 4);
  assert.throws(() => new FrameDecoder().push(garbage), FrameError);
});

test('valid OCR results parse into physical-pixel boxes', () => {
  assert.deepEqual(parseSidecarMessage({ type: 'ocr-result', requestId: 1, captureGeneration: 2, ocrMs: 3.5, boxes: [box()] }), {
    type: 'ocr-result',
    requestId: 1,
    captureGeneration: 2,
    ocrMs: 3.5,
    boxes: [{ rect: { x: 1, y: 2, width: 3, height: 4 }, text: '猫', confidence: 0.9, orientation: 'vertical', readingOrder: 0 }]
  });
});

test('malformed messages are rejected without echoing their contents', () => {
  const malformed: unknown[] = [
    null,
    { type: 'unknown' },
    { type: 'ocr-result', requestId: 1, captureGeneration: -1, ocrMs: 1, boxes: [] },
    { type: 'ocr-result', requestId: 1, captureGeneration: 1, ocrMs: 1, boxes: [box({ x: 1.5 })] },
    { type: 'ocr-result', requestId: 1, captureGeneration: 1, ocrMs: 1, boxes: [box({ confidence: 2 })] },
    { type: 'ocr-result', requestId: 1, captureGeneration: 1, ocrMs: 1, boxes: [box({ orientation: 'diagonal' })] },
    { type: 'ocr-result', requestId: 1, captureGeneration: 1, ocrMs: 1, boxes: [box({ text: '' })] },
    { type: 'ocr-result', requestId: 1, captureGeneration: 1, ocrMs: 1, boxes: [box(), box()] },
    { type: 'ocr-result', requestId: 1, captureGeneration: 1, ocrMs: 1, boxes: [box({ readingOrder: 1 })] },
    { type: 'error', requestId: 1, code: 'anything' }
  ];
  for (const message of malformed) {
    assert.throws(() => parseSidecarMessage(message), (error: Error) => error instanceof TypeError && !error.message.includes('猫'));
  }
});
