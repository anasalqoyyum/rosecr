/** @param {Electron.BrowserWindow} window */
function nativeHandleDecimal(window) {
  const buffer = window.getNativeWindowHandle();
  if (buffer.length >= 8) return buffer.readBigUInt64LE(0).toString(10);
  return BigInt(buffer.readUInt32LE(0)).toString(10);
}

/** @param {string | undefined} preload @param {Partial<Electron.WebPreferences>} overrides */
function secureWebPreferences(preload, overrides = {}) {
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

/** @param {Electron.BrowserWindow} window */
function protectWindow(window) {
  window.setContentProtection(true);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) event.preventDefault();
  });
}

module.exports = { nativeHandleDecimal, protectWindow, secureWebPreferences };
