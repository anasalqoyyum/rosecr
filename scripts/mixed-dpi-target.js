const { app, BrowserWindow, screen } = require("electron");

app.whenReady().then(() => {
  const primary = screen.getPrimaryDisplay();
  const secondary = screen
    .getAllDisplays()
    .find((display) => display.id !== primary.id);

  const window = new BrowserWindow({
    width: 640,
    height: 480,
    x: primary.workArea.x + 320,
    y: primary.workArea.y + 180,
    title: "M0 Mixed-DPI Target",
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadURL(
    `data:text/html,${encodeURIComponent(`<!doctype html>
      <meta charset="utf-8">
      <title>M0 Mixed-DPI Target</title>
      <style>
        :root { color-scheme: dark; font-family: system-ui, sans-serif; }
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: repeating-linear-gradient(0deg, #111 0 31px, #252525 32px), repeating-linear-gradient(90deg, transparent 0 31px, #252525 32px); }
        main { padding: 32px; border: 2px solid #69d5ff; background: #111; }
        h1 { margin: 0 0 8px; font-size: 32px; }
        p { margin: 0; color: #a8b4bc; }
      </style>
      <main><h1>Mixed-DPI capture target</h1><p>Moves between displays without changing content.</p></main>`)};charset=utf-8`,
  );

  if (!secondary) {
    return;
  }

  setTimeout(() => {
    window.setBounds({
      x: secondary.workArea.x + Math.max(24, Math.floor((secondary.workArea.width - 640) / 2)),
      y: secondary.workArea.y + Math.max(24, Math.floor((secondary.workArea.height - 480) / 2)),
      width: 640,
      height: 480,
    });
  }, 10_000);

  setTimeout(() => {
    window.setBounds({
      x: primary.workArea.x + 320,
      y: primary.workArea.y + 180,
      width: 640,
      height: 480,
    });
  }, 60_000);
});

app.on("window-all-closed", () => app.quit());
