import { isRecord, type OcrBox, type OcrOrientation } from '../shared/contracts';

// Frame layout shared with sidecar/rosecr_ocr/protocol.py:
// frame := u32be payloadLength, payload
// payload := u32be headerLength, UTF-8 JSON header object, binary body
export const OCR_PROTOCOL_VERSION = 1;
export const MAX_SIDECAR_PAYLOAD = 16 * 1024 * 1024;
const U32 = 4;

export class FrameError extends Error {}

export interface Frame {
  header: unknown;
  body: Buffer;
}

export function encodeFrame(header: Record<string, unknown>, body: Uint8Array = new Uint8Array()): Buffer {
  const encodedHeader = Buffer.from(JSON.stringify(header), 'utf8');
  const prefix = Buffer.alloc(U32 * 2);
  prefix.writeUInt32BE(U32 + encodedHeader.length + body.length, 0);
  prefix.writeUInt32BE(encodedHeader.length, U32);
  return Buffer.concat([prefix, encodedHeader, body]);
}

export class FrameDecoder {
  private buffered: Buffer = Buffer.alloc(0);

  constructor(private readonly maxPayload = MAX_SIDECAR_PAYLOAD) {}

  /** Returns every frame completed by this chunk. Throws FrameError once the stream is unusable. */
  push(chunk: Buffer): Frame[] {
    this.buffered = this.buffered.length ? Buffer.concat([this.buffered, chunk]) : chunk;
    const frames: Frame[] = [];
    while (this.buffered.length >= U32) {
      const payloadLength = this.buffered.readUInt32BE(0);
      if (payloadLength < U32 || payloadLength > this.maxPayload) throw new FrameError('Frame length is out of range.');
      if (this.buffered.length < U32 + payloadLength) break;
      const payload = this.buffered.subarray(U32, U32 + payloadLength);
      this.buffered = this.buffered.subarray(U32 + payloadLength);
      const headerLength = payload.readUInt32BE(0);
      if (headerLength > payloadLength - U32) throw new FrameError('Header length exceeds the frame.');
      let header: unknown;
      try {
        header = JSON.parse(payload.subarray(U32, U32 + headerLength).toString('utf8'));
      } catch {
        throw new FrameError('Header is not valid JSON.');
      }
      frames.push({ header, body: payload.subarray(U32 + headerLength) });
    }
    return frames;
  }
}

export type SidecarRequestErrorCode = 'invalid-request' | 'invalid-image' | 'engine-failed';
const SIDECAR_REQUEST_ERROR_CODES = ['invalid-request', 'invalid-image', 'engine-failed'] as const satisfies readonly SidecarRequestErrorCode[];
const ORIENTATIONS = ['horizontal', 'vertical'] as const satisfies readonly OcrOrientation[];

export type SidecarMessage =
  | { type: 'ready'; protocolVersion: number; engine: { name: string; version: string }; startupMs: number }
  | { type: 'startup-failed'; code: string }
  | { type: 'ocr-result'; requestId: number; captureGeneration: number; boxes: OcrBox[]; ocrMs: number }
  | { type: 'error'; requestId: number | null; code: SidecarRequestErrorCode };

export function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function parseBox(value: unknown): OcrBox {
  if (
    isRecord(value) &&
    isCount(value.x) && isCount(value.y) && isCount(value.width) && isCount(value.height) &&
    value.width > 0 && value.height > 0 &&
    typeof value.text === 'string' && value.text.length > 0 &&
    typeof value.confidence === 'number' && value.confidence >= 0 && value.confidence <= 1 &&
    ORIENTATIONS.includes(value.orientation as OcrOrientation) &&
    isCount(value.readingOrder)
  ) {
    return {
      rect: { x: value.x, y: value.y, width: value.width, height: value.height },
      text: value.text,
      confidence: value.confidence,
      orientation: value.orientation as OcrOrientation,
      readingOrder: value.readingOrder
    };
  }
  throw new TypeError('Sidecar returned an invalid OCR box.');
}

/** Validates a decoded header. Error text never includes header contents, which may hold recognized text. */
export function parseSidecarMessage(header: unknown): SidecarMessage {
  if (!isRecord(header)) throw new TypeError('Sidecar message must be an object.');
  switch (header.type) {
    case 'ready': {
      const engine = header.engine;
      if (
        isCount(header.protocolVersion) && isDuration(header.startupMs) && isRecord(engine) &&
        typeof engine.name === 'string' && typeof engine.version === 'string'
      ) {
        return {
          type: 'ready',
          protocolVersion: header.protocolVersion,
          engine: { name: engine.name, version: engine.version },
          startupMs: header.startupMs
        };
      }
      break;
    }
    case 'startup-failed':
      if (typeof header.code === 'string') return { type: 'startup-failed', code: header.code };
      break;
    case 'ocr-result':
      if (
        isCount(header.requestId) && isCount(header.captureGeneration) &&
        isDuration(header.ocrMs) && Array.isArray(header.boxes)
      ) {
        const boxes = header.boxes.map(parseBox);
        const orders = new Set(boxes.map((box) => box.readingOrder));
        if (orders.size !== boxes.length || boxes.some((box) => box.readingOrder >= boxes.length)) {
          throw new TypeError('Sidecar returned an invalid reading order.');
        }
        return {
          type: 'ocr-result',
          requestId: header.requestId,
          captureGeneration: header.captureGeneration,
          boxes,
          ocrMs: header.ocrMs
        };
      }
      break;
    case 'error':
      if (
        (header.requestId === null || isCount(header.requestId)) &&
        SIDECAR_REQUEST_ERROR_CODES.includes(header.code as SidecarRequestErrorCode)
      ) {
        return { type: 'error', requestId: header.requestId, code: header.code as SidecarRequestErrorCode };
      }
      break;
  }
  throw new TypeError('Sidecar sent an invalid message.');
}
