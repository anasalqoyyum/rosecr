const { app, screen } = require('electron');

app.whenReady().then(() => {
  process.stdout.write(`${JSON.stringify(screen.getAllDisplays(), null, 2)}\n`);
  app.quit();
});
