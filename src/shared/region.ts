import type { PhysicalClientRect } from '../main/geometry';
import { isRecord } from './contracts';

/** A rectangle expressed as fractions of the target window's client area. */
export interface NormalizedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

export const MIN_REGION_SIZE = 0.02;
export const REGION_KEYBOARD_STEP = 0.01;
export const DEFAULT_REGION: Readonly<NormalizedRegion> = Object.freeze({ x: 0.1, y: 0.68, width: 0.8, height: 0.26 });

// Persisted values stay short and stable; four decimals is finer than one physical pixel on an 8K client.
const PRECISION = 10_000;
const BOUNDS_TOLERANCE = 1e-9;

const round = (value: number): number => Math.round(value * PRECISION) / PRECISION;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function regionFromPoints(start: NormalizedPoint, end: NormalizedPoint): NormalizedRegion {
  // Rounding the edges rather than the size keeps x + width within the client area.
  const x1 = round(clamp(start.x, 0, 1));
  const y1 = round(clamp(start.y, 0, 1));
  const x2 = round(clamp(end.x, 0, 1));
  const y2 = round(clamp(end.y, 0, 1));
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: round(Math.abs(x2 - x1)),
    height: round(Math.abs(y2 - y1))
  };
}

export function meetsMinimumSize(region: NormalizedRegion): boolean {
  return region.width >= MIN_REGION_SIZE && region.height >= MIN_REGION_SIZE;
}

export function adjustRegion(
  region: NormalizedRegion,
  { dx, dy, resize }: { dx: number; dy: number; resize: boolean }
): NormalizedRegion {
  if (resize) {
    return {
      ...region,
      width: round(clamp(region.width + dx, MIN_REGION_SIZE, 1 - region.x)),
      height: round(clamp(region.height + dy, MIN_REGION_SIZE, 1 - region.y))
    };
  }
  return {
    ...region,
    x: round(clamp(region.x + dx, 0, 1 - region.width)),
    y: round(clamp(region.y + dy, 0, 1 - region.height))
  };
}

/** Maps a normalized region onto the client's current physical rectangle. */
export function regionToClientRect(region: NormalizedRegion, client: PhysicalClientRect): PhysicalClientRect {
  const width = client.right - client.left;
  const height = client.bottom - client.top;
  return {
    left: client.left + Math.round(region.x * width),
    top: client.top + Math.round(region.y * height),
    right: client.left + Math.round((region.x + region.width) * width),
    bottom: client.top + Math.round((region.y + region.height) * height)
  };
}

export function parseNormalizedRegion(value: unknown): NormalizedRegion | null {
  if (!isRecord(value)) return null;
  const { x, y, width, height } = value;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') return null;
  const region = { x, y, width, height };
  if (!Object.values(region).every(Number.isFinite)) return null;
  if (x < 0 || y < 0 || !meetsMinimumSize(region)) return null;
  if (x + width > 1 + BOUNDS_TOLERANCE || y + height > 1 + BOUNDS_TOLERANCE) return null;
  return region;
}

export function formatRegion(region: NormalizedRegion): string {
  return `x ${region.x.toFixed(2)} · y ${region.y.toFixed(2)} · w ${region.width.toFixed(2)} · h ${region.height.toFixed(2)}`;
}
