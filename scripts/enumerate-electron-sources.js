const { app, desktopCapturer } = require('electron');

app.whenReady().then(async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
    process.stdout.write(`${JSON.stringify(sources.map(({ id, name }) => ({ id, name })), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
