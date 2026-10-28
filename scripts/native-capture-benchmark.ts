import { writeFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import path from 'node:path';
import { NativeCaptureClient, nativeHelperPath, type CapturedFrame } from '../src/main/native-capture-client';
import { nativeWindowsToCaptureTargets } from '../src/main/capture-source';
import type { NormalizedRegion } from '../src/shared/region';

async function run(): Promise<void> {
  const title = process.env.ROSECR_CAPTURE_TARGET;
  if (!title) throw new Error('Set ROSECR_CAPTURE_TARGET to a unique window title fragment.');
  const client = new NativeCaptureClient(nativeHelperPath(path.resolve(__dirname, '..')));
  const events: unknown[] = [];
  const unsubscribe = client.subscribe((event) => events.push(event.kind === 'failure' ? { kind: event.kind, message: event.error.message } : event));
  try {
    const targets = nativeWindowsToCaptureTargets((await client.list()).windows, process.pid)
      .filter((target) => target.name.toLowerCase().includes(title.toLowerCase()));
    if (targets.length !== 1) throw new Error(`Expected one matching window, found ${targets.length}.`);
    const target = targets[0];
    const results = [];
    let generation = 0;
    for (const region of [null, { x: 0.25, y: 0.5, width: 0.5, height: 0.25 }] satisfies (NormalizedRegion | null)[]) {
      const started = performance.now();
      await client.start(target, ++generation);
      let frame: CapturedFrame | null = null;
      while (!frame && performance.now() - started < 5000) { frame = await client.grab(region); if (!frame) await setTimeout(50); }
      if (!frame) throw new Error('No first frame within five seconds.');
      const firstFrameLatencyMs = performance.now() - started;
      if (frame.clientRect.right - frame.clientRect.left !== 2560 || frame.clientRect.bottom - frame.clientRect.top !== 1440) throw new Error('Issue #9 latency acceptance requires a 2560x1440 physical client area.');
      const grabLatencyMs = [frame.grabLatencyMs];
      for (let sample = 0; sample < 20; sample++) {
        await setTimeout(250);
        const next = await client.grab(region);
        if (next) grabLatencyMs.push(next.grabLatencyMs);
      }
      const sorted = [...grabLatencyMs].sort((a, b) => a - b);
      results.push({ scope: region ? 'region' : 'window', region, firstFrameLatencyMs, grabLatencyMs,
        medianGrabLatencyMs: sorted[Math.floor(sorted.length / 2)], p95GrabLatencyMs: sorted[Math.ceil(sorted.length * 0.95) - 1],
        width: frame.width, height: frame.height, clientRect: frame.clientRect, dpi: frame.dpi, cropOrigin: frame.cropOrigin,
        payloadBytes: frame.payloadBytes, session: client.getDiagnostics().session });
      await client.stopCapture();
    }
    const output = process.env.ROSECR_CAPTURE_EVIDENCE ?? 'native-capture-latency.json';
    writeFileSync(output, `${JSON.stringify({ recordedAt: new Date().toISOString(), platform: `${process.platform}-${process.arch}`, target, results, events }, null, 2)}\n`);
    process.stdout.write(`${output}\n`);
  } finally { unsubscribe(); client.stop(); }
}

void run().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
