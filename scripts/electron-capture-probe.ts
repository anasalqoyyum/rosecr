import path from 'node:path';
import { app, BrowserWindow, desktopCapturer } from 'electron';

app.whenReady().then(async () => {
  const targetTitle = process.env.ROSECR_CAPTURE_TARGET;
  try {
    if (!targetTitle) throw new Error('ROSECR_CAPTURE_TARGET is required.');
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
    const source = sources.find(({ name }) => name.toLowerCase().includes(targetTitle.toLowerCase()));
    if (!source) throw new Error(`No Electron capture source matched '${targetTitle}'.`);
    const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
    await window.loadFile(path.join(__dirname, 'electron-capture-probe.html'));
    const startedAt = Date.now();
    const result = await Promise.race<{ width: number; height: number }>([
      window.webContents.executeJavaScript(`
        new Promise(async (resolve, reject) => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: '${source.id}', maxFrameRate: 60 } }
            });
            const video = document.querySelector('video');
            video.srcObject = stream;
            video.onloadeddata = () => resolve({ width: video.videoWidth, height: video.videoHeight });
            video.onerror = () => reject(new Error('Video element rejected the capture stream.'));
          } catch (error) {
            reject(error);
          }
        })
      `),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Electron capture timed out after 10 seconds.')), 10000))
    ]);
    process.stdout.write(`${JSON.stringify({ source: { id: source.id, name: source.name }, firstFrameLatencyMs: Date.now() - startedAt, ...result }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
