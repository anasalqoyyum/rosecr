import { isRecord } from '../shared/contracts';
import type { NormalizedRegion } from '../shared/region';
import { parseNormalizedRegion, regionToClientRect } from '../shared/region';
import type { NativeWindow } from './capture-source';
import type { PhysicalClientRect } from './geometry';

export const MAX_HEADER_BYTES = 64 * 1024;
export const MAX_FRAME_BYTES = 128 * 1024 * 1024;
export const MAX_DIMENSION = 32768;

export interface WindowMetadata {
  exists: boolean;
  visible: boolean;
  minimized: boolean;
  capturable: boolean;
  dpi: number;
  foregroundHandle: string;
  targetIsForeground: boolean;
  clientRect: PhysicalClientRect | null;
  timestamp: number;
}

export interface CaptureIdentity {
  target: string;
  captureGeneration: number;
  sessionEpoch: number;
}

export interface FrameHeader extends CaptureIdentity {
  version: 1;
  kind: 'frame';
  requestId: number;
  pixelFormat: 'BGRA8';
  width: number;
  height: number;
  stride: number;
  payloadBytes: number;
  sequence: number;
  timestamp: number;
  qpcTimestamp100ns: number;
  clientRect: PhysicalClientRect;
  dpi: number;
  cropOrigin: { x: number; y: number };
}

export type CaptureEvent = CaptureIdentity & {
  kind: 'event';
  timestamp: number;
  qpcTimestamp100ns: number;
  event: 'closed' | 'minimized' | 'geometryChanged' | 'deviceLost' | 'deviceRecovered' | 'blank' | 'unavailable';
  message: string;
};

export type HelperHeader =
  | FrameHeader
  | ({ version: 1; requestId: number } & (
    | { kind: 'list'; windows: NativeWindow[] }
    | { kind: 'metadata'; metadata: WindowMetadata }
    | ({ kind: 'started'; borderDisabled: boolean; cursorDisabled: true; minUpdateInterval100ns: number | null } & CaptureIdentity)
    | { kind: 'stopped' }
    | { kind: 'waiting'; message: string }
    | { kind: 'error'; message: string }))
  | ({ version: 1 } & CaptureEvent);

function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

export function validHandle(value: unknown, allowZero = false): value is string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(value)) return false;
  const numeric = Number(value);
  return integer(numeric, allowZero ? 0 : 1);
}

function rectangle(value: unknown): value is PhysicalClientRect {
  return isRecord(value) && integer(value.left, -2147483648, 2147483647) && integer(value.top, -2147483648, 2147483647) &&
    integer(value.right, -2147483648, 2147483647) && integer(value.bottom, -2147483648, 2147483647) &&
    integer(value.right - value.left, 1, MAX_DIMENSION) && integer(value.bottom - value.top, 1, MAX_DIMENSION);
}

function identity(value: Record<string, unknown>): boolean {
  return validHandle(value.target) && integer(value.captureGeneration, 1) && integer(value.sessionEpoch, 1);
}

function metadata(value: unknown): value is WindowMetadata {
  if (!isRecord(value)) return false;
  return typeof value.exists === 'boolean' && typeof value.visible === 'boolean' && typeof value.minimized === 'boolean' &&
    typeof value.capturable === 'boolean' && integer(value.dpi, 1, 9600) && validHandle(value.foregroundHandle, true) &&
    typeof value.targetIsForeground === 'boolean' && integer(value.timestamp, 1) &&
    (value.clientRect === null || rectangle(value.clientRect)) &&
    (!value.capturable || (value.exists && value.visible && !value.minimized && value.clientRect !== null));
}

function nativeWindow(value: unknown): value is NativeWindow {
  return isRecord(value) && validHandle(value.handle) && integer(value.processId, 1, 0xffffffff) &&
    typeof value.title === 'string' && value.title.length <= 32768 &&
    typeof value.executableName === 'string' && value.executableName.length <= 32768 &&
    typeof value.className === 'string' && value.className.length <= 256;
}

function frame(value: Record<string, unknown>): boolean {
  if (!identity(value) || value.pixelFormat !== 'BGRA8' || !integer(value.width, 1, MAX_DIMENSION) ||
      !integer(value.height, 1, MAX_DIMENSION) || !integer(value.stride, 4, MAX_FRAME_BYTES) ||
      !integer(value.payloadBytes, 4, MAX_FRAME_BYTES) || !integer(value.sequence, 1) ||
      !integer(value.timestamp, 1) || !integer(value.qpcTimestamp100ns, 1) || !integer(value.dpi, 1, 9600) ||
      !rectangle(value.clientRect) || !isRecord(value.cropOrigin) ||
      !integer(value.cropOrigin.x, 0, MAX_DIMENSION) || !integer(value.cropOrigin.y, 0, MAX_DIMENSION)) return false;
  return value.stride === value.width * 4 && value.payloadBytes === value.stride * value.height &&
    value.cropOrigin.x + value.width <= value.clientRect.right - value.clientRect.left &&
    value.cropOrigin.y + value.height <= value.clientRect.bottom - value.clientRect.top;
}

function isHeader(value: unknown): value is HelperHeader {
  if (!isRecord(value) || value.version !== 1) return false;
  if (value.kind !== 'frame' && 'payloadBytes' in value) return false;
  if (value.kind === 'event') return identity(value) && integer(value.timestamp, 1) && integer(value.qpcTimestamp100ns, 1) && typeof value.message === 'string' &&
    ['closed', 'minimized', 'geometryChanged', 'deviceLost', 'deviceRecovered', 'blank', 'unavailable'].includes(String(value.event));
  if (!integer(value.requestId, 1)) return false;
  switch (value.kind) {
    case 'frame': return frame(value);
    case 'metadata': return metadata(value.metadata);
    case 'list': return Array.isArray(value.windows) && value.windows.every(nativeWindow);
    case 'started': return identity(value) && typeof value.borderDisabled === 'boolean' && value.cursorDisabled === true &&
      (value.minUpdateInterval100ns === null || integer(value.minUpdateInterval100ns, 1));
    case 'stopped': return true;
    case 'waiting':
    case 'error': return typeof value.message === 'string';
    default: return false;
  }
}

export function validateFrameRequest(header: FrameHeader, expected: { target: string; captureGeneration: number; region: NormalizedRegion | null }): void {
  if (header.target !== expected.target || header.captureGeneration !== expected.captureGeneration) throw new Error('Native frame target or generation mismatch.');
  const client = header.clientRect;
  const crop = expected.region ? regionToClientRect(expected.region, client) : client;
  if (header.cropOrigin.x !== crop.left - client.left || header.cropOrigin.y !== crop.top - client.top ||
      header.width !== crop.right - crop.left || header.height !== crop.bottom - crop.top) throw new Error('Native frame crop mismatch.');
}

export function encodeRequest(value: Record<string, unknown>): Buffer {
  if ('region' in value && value.region !== null && !parseNormalizedRegion(value.region)) throw new Error('Invalid capture region.');
  const json = Buffer.from(JSON.stringify({ ...value, version: 1 }), 'utf8');
  if (json.length === 0 || json.length > MAX_HEADER_BYTES) throw new Error('Native request exceeds header limit.');
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(json.length);
  return Buffer.concat([prefix, json]);
}

// Each allocation follows header validation; pipe fragments never accumulate in an unbounded buffer.
export class HelperDecoder {
  private prefix = Buffer.alloc(4);
  private offset = 0;
  private headerBytes: Buffer | null = null;
  private header: HelperHeader | null = null;
  private payload: Buffer | null = null;
  private failed = false;

  constructor(private readonly validate: (header: HelperHeader) => void, private readonly receive: (header: HelperHeader, pixels: Buffer) => void) {}

  push(chunk: Buffer): void {
    if (this.failed) throw new Error('Native decoder is closed.');
    try {
      while (chunk.length > 0) {
        const destination = this.payload ?? this.headerBytes ?? this.prefix;
        const count = Math.min(destination.length - this.offset, chunk.length);
        chunk.copy(destination, this.offset, 0, count);
        this.offset += count;
        chunk = chunk.subarray(count);
        if (this.offset !== destination.length) continue;
        this.offset = 0;
        if (this.payload && this.header) {
          const header = this.header;
          const pixels = this.payload;
          this.reset();
          this.receive(header, pixels);
        } else if (this.headerBytes) {
          const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(this.headerBytes));
          if (!isHeader(value)) throw new Error('Invalid native helper header.');
          this.validate(value);
          this.header = value;
          this.headerBytes = null;
          if (value.kind === 'frame') this.payload = Buffer.allocUnsafe(value.payloadBytes);
          else { this.reset(); this.receive(value, Buffer.alloc(0)); }
        } else {
          const length = this.prefix.readUInt32LE();
          if (length === 0 || length > MAX_HEADER_BYTES) throw new Error('Invalid native header length.');
          this.headerBytes = Buffer.allocUnsafe(length);
        }
      }
    } catch (error) { this.failed = true; this.reset(); throw error; }
  }

  end(): void {
    if (this.offset !== 0 || this.headerBytes || this.header || this.payload) throw new Error('Truncated native helper message.');
  }

  private reset(): void { this.offset = 0; this.headerBytes = null; this.header = null; this.payload = null; }
}
