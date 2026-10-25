type WorkerReport = import('../main/capture-coordinator').CaptureWorkerReport;
type WorkerStartOptions = import('../preload/capture-preload').CaptureStartOptions;
type FrameWorkerReport = Extract<WorkerReport, { kind: 'frame' }>;

(() => {
  const getElement = <T extends Element>(selector: string): T => {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Missing capture worker element: ${selector}`);
    return element;
  };
  const getContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Capture sampling canvas is unavailable.');
    return context;
  };

  const video = getElement<HTMLVideoElement>('#capture');
  const canvas = getElement<HTMLCanvasElement>('#sample');
  const context = getContext(canvas);

  let stream: MediaStream | null = null;
  let startedAt = 0;
  let frameCount = 0;
  let lastReportAt = 0;
  let stopRequested = false;
  let workerGeneration = 0;

  function stopCapture(): void {
    stopRequested = true;
    workerGeneration++;
    if (stream) for (const track of stream.getTracks()) track.stop();
    stream = null;
    video.srcObject = null;
  }

  function isBlankFrame(): boolean {
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

  function reportFrame(now: number, captureGeneration: number | undefined): void {
    frameCount += 1;
    if (frameCount !== 1 && now - lastReportAt < 250) return;
    lastReportAt = now;
    window.captureProbe.report({
      kind: 'frame', captureGeneration, frameCount,
      firstFrameLatencyMs: frameCount === 1 ? Math.round(performance.now() - startedAt) : undefined,
      width: video.videoWidth, height: video.videoHeight, blank: isBlankFrame(), timestamp: Date.now()
    });
  }

  function watchFrames(generation: number, captureGeneration: number | undefined): void {
    if (generation !== workerGeneration || stopRequested || !stream) return;
    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback((now) => {
        if (generation !== workerGeneration || stopRequested) return;
        reportFrame(now, captureGeneration);
        watchFrames(generation, captureGeneration);
      });
    } else {
      requestAnimationFrame((now) => {
        if (generation !== workerGeneration || stopRequested) return;
        reportFrame(now, captureGeneration);
        watchFrames(generation, captureGeneration);
      });
    }
  }

  async function startCapture(options: WorkerStartOptions): Promise<FrameWorkerReport> {
    stopCapture();
    const generation = workerGeneration;
    const captureGeneration = options.captureGeneration;
    stopRequested = false;
    frameCount = 0;
    lastReportAt = 0;
    startedAt = performance.now();
    try {
      const desktopConstraints = {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: options.sourceId,
          maxFrameRate: options.frameRate ?? 60
        }
      } as MediaTrackConstraints;
      const acquiredStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: desktopConstraints });
      if (generation !== workerGeneration) {
        for (const track of acquiredStream.getTracks()) track.stop();
        throw new Error('Capture startup was cancelled.');
      }
      stream = acquiredStream;
      const track = stream.getVideoTracks()[0];
      track.addEventListener('ended', () => window.captureProbe.report({ kind: 'ended', captureGeneration, timestamp: Date.now() }));
      track.addEventListener('mute', () => window.captureProbe.report({ kind: 'muted', captureGeneration, timestamp: Date.now() }));
      video.srcObject = stream;
      await video.play();
      if (generation !== workerGeneration) throw new Error('Capture startup was cancelled.');
      watchFrames(generation, captureGeneration);
      return {
        kind: 'frame', captureGeneration, frameCount: 1,
        firstFrameLatencyMs: Math.round(performance.now() - startedAt),
        width: video.videoWidth, height: video.videoHeight, blank: isBlankFrame(), timestamp: Date.now()
      };
    } catch (error) {
      window.captureProbe.report({ kind: 'error', captureGeneration, message: error instanceof Error ? error.message : String(error), timestamp: Date.now() });
      throw error;
    }
  }

  window.captureProbe.onStop(stopCapture);
  window.captureProbeRuntime = Object.freeze({ start: startCapture, stop: stopCapture });
})();
