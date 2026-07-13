import type { CaptureTarget } from './control-state';

interface WindowSourceId {
  nativeHandle: string;
  ownedByCurrentProcess: boolean;
}

interface CaptureSource {
  id: string;
  name: string;
  thumbnail?: { isEmpty(): boolean; toDataURL(): string };
  appIcon?: { isEmpty(): boolean; toDataURL(): string } | null;
}

export interface NativeWindow {
  handle: string;
  title: string;
  processId: number;
}

export function parseWindowSourceId(sourceId: string): WindowSourceId | null {
  const match = /^window:(\d+):(0|1)$/.exec(sourceId);
  if (!match) return null;
  return { nativeHandle: match[1], ownedByCurrentProcess: match[2] === '1' };
}

export function isRosecrSource(source: Pick<CaptureSource, 'id'>, ownedHandles: Set<string>): boolean {
  const parsed = parseWindowSourceId(source.id);
  return parsed?.ownedByCurrentProcess === true || (parsed ? ownedHandles.has(parsed.nativeHandle) : false);
}

export function publicCaptureTargets(
  sources: CaptureSource[],
  ownedHandles: Set<string>,
  ownedNames = new Set<string>()
): CaptureTarget[] {
  return sources
    .filter((source) => !isRosecrSource(source, ownedHandles) && !ownedNames.has(source.name))
    .map((source) => {
      const parsed = parseWindowSourceId(source.id);
      return {
        id: source.id,
        name: source.name,
        nativeHandle: parsed?.nativeHandle ?? '',
        thumbnailDataUrl: source.thumbnail && !source.thumbnail.isEmpty() ? source.thumbnail.toDataURL() : null,
        iconDataUrl: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null
      };
    });
}

export function nativeWindowsToCaptureTargets(windows: NativeWindow[], ownProcessId: number): CaptureTarget[] {
  return windows
    .filter((window) => window.processId !== ownProcessId)
    .map((window) => ({
      id: `window:${window.handle}:0`, name: window.title, nativeHandle: window.handle,
      thumbnailDataUrl: null, iconDataUrl: null
    }));
}
