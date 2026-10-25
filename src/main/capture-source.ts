import type { CaptureTarget } from './control-state';

export interface NativeWindow {
  handle: string;
  title: string;
  processId: number;
  executableName: string;
  className: string;
}

export function nativeWindowsToCaptureTargets(windows: NativeWindow[], ownProcessId: number): CaptureTarget[] {
  return windows
    .filter((window) => window.processId !== ownProcessId)
    .map((window) => ({
      id: `window:${window.handle}:0`, name: window.title, nativeHandle: window.handle,
      processId: window.processId, executableName: window.executableName, className: window.className,
      thumbnailDataUrl: null, iconDataUrl: null
    }));
}
