import type { BrowserWindow, WebPreferences } from 'electron';

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
