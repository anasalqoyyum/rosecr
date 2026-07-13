import type { BrowserWindow, WebPreferences } from 'electron';

export function nativeHandleDecimal(window: BrowserWindow): string {
  const buffer = window.getNativeWindowHandle();
  if (buffer.length >= 8) return buffer.readBigUInt64LE(0).toString(10);
  return BigInt(buffer.readUInt32LE(0)).toString(10);
}

export function secureWebPreferences(
  preload?: string,
  overrides: Partial<WebPreferences> = {}
): WebPreferences {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    ...overrides
  };
}

export function protectWindow(window: BrowserWindow): void {
  window.setContentProtection(true);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) event.preventDefault();
  });
}
