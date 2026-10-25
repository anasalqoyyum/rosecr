import type { CaptureTarget } from './control-state';

export interface NativeWindow {
  handle: string;
  title: string;
  processId: number;
}

export function nativeWindowsToCaptureTargets(windows: NativeWindow[], ownProcessId: number): CaptureTarget[] {
  return windows
    .filter((window) => window.processId !== ownProcessId)
    .map((window) => ({
      id: `window:${window.handle}:0`, name: window.title, nativeHandle: window.handle,
      thumbnailDataUrl: null, iconDataUrl: null
    }));
}
