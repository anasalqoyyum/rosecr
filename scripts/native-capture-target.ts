import { app, BrowserWindow, screen } from 'electron';

app.whenReady().then(() => {
  const display = screen.getPrimaryDisplay();
  const window = new BrowserWindow({
    title: 'Rosecr Native Capture Target', useContentSize: true,
    width: Math.round(2560 / display.scaleFactor), height: Math.round(1440 / display.scaleFactor),
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  window.setContentProtection(process.env.ROSECR_PROTECTED_TARGET === '1');
  const html = `<!doctype html><meta charset="utf-8"><title>Rosecr Native Capture Target</title>
    <style>
      body { margin: 0; background: #173b52; color: white; font: 32px monospace; overflow: hidden; }
      canvas { position: fixed; inset: 0; width: 100%; height: 100%; }
      p { position: fixed; top: 20px; left: 30px; background: #102734; padding: 20px; }
    </style><canvas></canvas><p>Native WGC target. Drag and resize this window across displays.</p>
    <script>
      const canvas = document.querySelector('canvas');
      const context = canvas.getContext('2d');
      function draw(time) {
        canvas.width = Math.round(innerWidth * devicePixelRatio); canvas.height = Math.round(innerHeight * devicePixelRatio);
        context.fillStyle = '#173b52'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = '#5fb4b0';
        for (let x = 0; x < canvas.width; x += 100) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke(); }
        for (let y = 0; y < canvas.height; y += 100) { context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke(); }
        context.fillStyle = '#ffd166'; context.fillRect((time / 8) % canvas.width, canvas.height / 2, 80, 80);
        context.font = '40px monospace'; context.fillText(canvas.width + 'x' + canvas.height + ' physical, DPR ' + devicePixelRatio, 40, canvas.height - 40);
        requestAnimationFrame(draw);
      }
      requestAnimationFrame(draw);
    </script>`;
  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
});
app.on('window-all-closed', () => app.quit());
