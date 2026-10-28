import assert from 'node:assert/strict';
import test from 'node:test';
import { HelperDecoder, MAX_FRAME_BYTES, MAX_HEADER_BYTES, encodeRequest, validateFrameRequest, type FrameHeader } from '../src/main/native-capture-protocol';

export function frameHeader(overrides: Partial<FrameHeader> = {}): FrameHeader {
  return { version: 1, kind: 'frame', requestId: 1, target: '42', captureGeneration: 1, sessionEpoch: 1,
    pixelFormat: 'BGRA8', width: 4, height: 3, stride: 16, payloadBytes: 48, sequence: 1,
    timestamp: 1000, qpcTimestamp100ns: 100000, clientRect: { left: -10, top: 20, right: -6, bottom: 23 },
    dpi: 120, cropOrigin: { x: 0, y: 0 }, ...overrides };
}

function wire(header: unknown, pixels = Buffer.alloc(0)): Buffer {
  const json = Buffer.from(JSON.stringify(header));
  const prefix = Buffer.alloc(4); prefix.writeUInt32LE(json.length);
  return Buffer.concat([prefix, json, pixels]);
}

test('decoder handles byte fragments, coalesced messages, and raw bytes containing JSON delimiters', () => {
  const received: unknown[] = [];
  const pixels = Buffer.alloc(48, 123);
  const decoder = new HelperDecoder(() => {}, (header, bytes) => received.push({ header, bytes }));
  const bytes = Buffer.concat([wire(frameHeader(), pixels), wire({ version: 1, kind: 'stopped', requestId: 2 })]);
  for (const byte of bytes) decoder.push(Buffer.from([byte]));
  decoder.end();
  assert.deepEqual(received, [{ header: frameHeader(), bytes: pixels }, { header: { version: 1, kind: 'stopped', requestId: 2 }, bytes: Buffer.alloc(0) }]);
});

test('malformed frame headers fail before payload allocation or delivery', () => {
  const invalid: Record<string, unknown>[] = [
    { width: 0 }, { height: 32769 }, { width: Number.MAX_SAFE_INTEGER }, { stride: 15 }, { stride: 20 },
    { payloadBytes: 44 }, { payloadBytes: MAX_FRAME_BYTES + 1 }, { payloadBytes: -1 }, { pixelFormat: 'RGBA8' },
    { target: '0' }, { target: '9007199254740992' }, { captureGeneration: 0 }, { sessionEpoch: 0 }, { sequence: 0 },
    { sequence: 1.5 }, { timestamp: 0 }, { qpcTimestamp100ns: Number.MAX_SAFE_INTEGER + 1 }, { dpi: 0 },
    { clientRect: { left: 0, top: 0, right: 3, bottom: 3 } }, { cropOrigin: { x: 1, y: 0 } },
    { cropOrigin: { x: -1, y: 0 } }, { version: 2 }
  ];
  for (const override of invalid) {
    let delivered = false;
    const decoder = new HelperDecoder(() => {}, () => { delivered = true; });
    assert.throws(() => decoder.push(wire({ ...frameHeader(), ...override })), /Invalid native helper header/);
    assert.equal(delivered, false);
  }
});

test('decoder bounds headers and rejects truncated headers, payloads, and invalid UTF-8', () => {
  for (const size of [0, MAX_HEADER_BYTES + 1, 0xffffffff]) {
    const prefix = Buffer.alloc(4); prefix.writeUInt32LE(size);
    assert.throws(() => new HelperDecoder(() => {}, () => {}).push(prefix), /header length/);
  }
  for (const bytes of [Buffer.from([1]), Buffer.from([10, 0, 0, 0, 123]), wire(frameHeader(), Buffer.alloc(47))]) {
    const decoder = new HelperDecoder(() => {}, () => {}); decoder.push(bytes);
    assert.throws(() => decoder.end(), /Truncated/);
  }
  assert.throws(() => new HelperDecoder(() => {}, () => {}).push(Buffer.from([1, 0, 0, 0, 255])), /encoded data/);
});

test('request identity and normalized crop are checked by the decoder before reading pixels', () => {
  const expected = { target: '42', captureGeneration: 1, region: { x: 0.25, y: 0, width: 0.5, height: 1 } };
  const crop = frameHeader({ width: 2, stride: 8, payloadBytes: 24, cropOrigin: { x: 1, y: 0 } });
  validateFrameRequest(crop, expected);
  for (const bad of [frameHeader(), { ...crop, target: '43' }, { ...crop, captureGeneration: 2 }]) {
    const decoder = new HelperDecoder((header) => { if (header.kind === 'frame') validateFrameRequest(header, expected); }, () => assert.fail('must reject header'));
    assert.throws(() => decoder.push(wire(bad)), /mismatch/);
  }
});

test('metadata, catalogs, and events validate external data and never carry a pixel payload', () => {
  for (const header of [
    { version: 1, kind: 'list', requestId: 1, windows: [{ handle: '42', processId: 0 }] },
    { version: 1, kind: 'metadata', requestId: 1, metadata: { capturable: true } },
    { version: 1, kind: 'stopped', requestId: 1, payloadBytes: 4 },
    { version: 1, kind: 'event', target: '42', captureGeneration: 1, sessionEpoch: 1, event: 'geometryChanged', message: '', payloadBytes: 4 }
  ]) assert.throws(() => new HelperDecoder(() => {}, () => {}).push(wire(header)), /Invalid/);
  assert.throws(() => encodeRequest({ region: { x: 1, y: 0, width: 1, height: 1 } }), /region/);
});
