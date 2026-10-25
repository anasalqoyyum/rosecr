import { isRecord } from '../shared/contracts';
import type { CaptureTarget } from './control-state';

/**
 * Durable identity for a game window. Window handles change whenever the game restarts, so
 * reconnection matches on executable and window class, using the last handle and title only to
 * tell apart several open windows of the same game.
 */
export interface SavedGameTarget {
  executableName: string;
  className: string;
  title: string;
  lastKnownHandle: string;
}

export type TargetResolution =
  | { kind: 'unique'; window: CaptureTarget }
  | { kind: 'ambiguous'; candidates: CaptureTarget[] }
  | { kind: 'missing' };

/** Lists the current capturable windows. Swappable so a native helper can replace the PowerShell probe. */
export interface GameWindowCatalog {
  listTargets(): Promise<CaptureTarget[]>;
}

export function savedTargetFrom(window: CaptureTarget): SavedGameTarget {
  return {
    executableName: window.executableName,
    className: window.className,
    title: window.name,
    lastKnownHandle: window.nativeHandle
  };
}

// WPF windows embed a per-launch GUID in their class, e.g. `HwndWrapper[App;Main;<guid>]`.
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const stableClassName = (className: string): string => className.replace(GUID, '');

function matchesIdentity(saved: SavedGameTarget, window: CaptureTarget): boolean {
  if (stableClassName(window.className) !== stableClassName(saved.className)) return false;
  // Without a readable executable, only an exact title is specific enough to trust.
  if (!saved.executableName) return !window.executableName && window.name === saved.title;
  return window.executableName.toLowerCase() === saved.executableName.toLowerCase();
}

export function resolveGameWindow(saved: SavedGameTarget, windows: readonly CaptureTarget[]): TargetResolution {
  const candidates = windows.filter((window) => matchesIdentity(saved, window));
  if (candidates.length === 0) return { kind: 'missing' };
  if (candidates.length === 1) return { kind: 'unique', window: candidates[0] };

  const sameWindow = candidates.find((window) => window.nativeHandle === saved.lastKnownHandle);
  if (sameWindow) return { kind: 'unique', window: sameWindow };
  const sameTitle = candidates.filter((window) => window.name === saved.title);
  if (sameTitle.length === 1) return { kind: 'unique', window: sameTitle[0] };
  return { kind: 'ambiguous', candidates };
}

export function parseSavedGameTarget(value: unknown): SavedGameTarget | null {
  if (!isRecord(value)) return null;
  const { executableName, className, title, lastKnownHandle } = value;
  if (typeof executableName !== 'string' || typeof className !== 'string' || typeof title !== 'string' ||
      typeof lastKnownHandle !== 'string') return null;
  return { executableName, className, title, lastKnownHandle };
}
