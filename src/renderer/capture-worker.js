const video = document.querySelector('#capture');
const canvas = document.querySelector('#sample');
const context = canvas.getContext('2d', { willReadFrequently: true });

let stream = null;
let startedAt = 0;
let frameCount = 0;
let lastReportAt = 0;
let stopRequested = false;

function stopCapture() {
  stopRequested = true;
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
  }
  stream = null;
  video.srcObject = null;
}

function isBlankFrame() {
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let total = 0;
  let squareTotal = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
    total += luminance;
    squareTotal += luminance * luminance;
  }
  const count = pixels.length / 4;
  const mean = total / count;
  const variance = squareTotal / count - mean * mean;
  return mean < 1 && variance < 0.5;
}

function reportFrame(now) {
  frameCount += 1;
  if (frameCount !== 1 && now - lastReportAt < 250) return;
  lastReportAt = now;
  window.captureProbe.report({
    kind: 'frame',
    frameCount,
    firstFrameLatencyMs: frameCount === 1 ? Math.round(performance.now() - startedAt) : undefined,
    width: video.videoWidth,
    height: video.videoHeight,
    blank: isBlankFrame(),
    timestamp: Date.now()
  });
}

function watchFrames() {
  if (stopRequested || !stream) return;
  if (typeof video.requestVideoFrameCallback === 'function') {
    video.requestVideoFrameCallback((now) => {
      reportFrame(now);
      watchFrames();
    });
  } else {
    requestAnimationFrame((now) => {
      reportFrame(now);
      watchFrames();
    });
  }
}

async function startCapture(options) {
  stopCapture();
  stopRequested = false;
  frameCount = 0;
  lastReportAt = 0;
  startedAt = performance.now();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: options.sourceId,
          maxFrameRate: options.frameRate ?? 60
        }
      }
    });
    const track = stream.getVideoTracks()[0];
    track.addEventListener('ended', () => window.captureProbe.report({ kind: 'ended', timestamp: Date.now() }));
    track.addEventListener('mute', () => window.captureProbe.report({ kind: 'muted', timestamp: Date.now() }));
    video.srcObject = stream;
    await video.play();
    watchFrames();
    return {
      kind: 'frame',
      frameCount: 1,
      firstFrameLatencyMs: Math.round(performance.now() - startedAt),
      width: video.videoWidth,
      height: video.videoHeight,
      blank: isBlankFrame(),
      timestamp: Date.now()
    };
  } catch (error) {
    window.captureProbe.report({
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    });
    throw error;
  }
}

window.captureProbe.onStop(stopCapture);
window.captureProbeRuntime = Object.freeze({ start: startCapture, stop: stopCapture });
