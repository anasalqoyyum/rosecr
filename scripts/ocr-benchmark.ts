import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { developmentSidecarLaunch, OcrSidecar } from '../src/main/ocr-sidecar';
import { decodePngToBgra, type RawImage } from '../test/helpers/png';

// Usage: pnpm bench:ocr [cold-starts] [runs-per-fixture]
const COLD_STARTS = Number(process.argv[2] ?? 3);
const RUNS = Number(process.argv[3] ?? 20);
const REPOSITORY_ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(REPOSITORY_ROOT, 'test', 'fixtures', 'ocr');

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]);
}

/** Places a crop at the bottom center of an otherwise flat frame, like a dialogue box in a game window. */
function embedAtBottom(crop: RawImage, width: number, height: number): RawImage {
  const bgra = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < bgra.length; offset += 4) bgra.set([48, 28, 24, 255], offset);
  const left = Math.floor((width - crop.width) / 2);
  const top = height - crop.height - 40;
  for (let row = 0; row < crop.height; row++) {
    bgra.set(crop.bgra.subarray(row * crop.width * 4, (row + 1) * crop.width * 4), ((top + row) * width + left) * 4);
  }
  return { width, height, bgra };
}

async function main(): Promise<void> {
  const launch = developmentSidecarLaunch(REPOSITORY_ROOT);
  console.log(`${os.type()} ${os.release()} ${os.arch()}, ${os.cpus().length}x ${os.cpus()[0]?.model}, Node ${process.version}`);

  for (let index = 0; index < COLD_STARTS; index++) {
    const sidecar = new OcrSidecar({ launch });
    const started = performance.now();
    const status = await sidecar.start();
    const wall = Math.round(performance.now() - started);
    await sidecar.stop();
    if (status.state !== 'ready') throw new Error(`Sidecar failed: ${JSON.stringify(status)}`);
    console.log(`cold start ${index + 1}: spawn-to-ready ${wall} ms (in-process ${Math.round(status.startupMs)} ms)`);
  }

  const sidecar = new OcrSidecar({ launch, requestTimeoutMs: 30_000 });
  await sidecar.start();
  const manifest = JSON.parse(readFileSync(path.join(FIXTURES, 'expected.json'), 'utf8')) as Record<string, unknown>;
  const cases: Array<[string, RawImage]> = Object.keys(manifest).map((name) =>
    [name, decodePngToBgra(readFileSync(path.join(FIXTURES, `${name}.png`)))]);
  const dialogue = cases.find(([name]) => name === 'ja-horizontal')![1];
  cases.push(['ja-horizontal in 1080p frame', embedAtBottom(dialogue, 1920, 1080)]);
  cases.push(['ja-horizontal in 4K frame', embedAtBottom(dialogue, 3840, 2160)]);

  console.log('\n| Case | Size | Boxes | Round trip p50 | Round trip p90 | Engine p50 |\n| --- | --- | --- | --- | --- | --- |');
  for (const [name, raw] of cases) {
    const image = { format: 'bgra8' as const, width: raw.width, height: raw.height, data: raw.bgra };
    const roundTrips: number[] = [];
    const engine: number[] = [];
    let boxes = 0;
    for (let run = 0; run <= RUNS; run++) {
      const started = performance.now();
      const outcome = await sidecar.recognize({ captureGeneration: 1, image });
      if (outcome.status !== 'ok') throw new Error(`${name}: ${JSON.stringify(outcome)}`);
      boxes = outcome.result.boxes.length;
      if (run === 0) continue;
      roundTrips.push(performance.now() - started);
      engine.push(outcome.result.ocrMs);
    }
    console.log(`| ${name} | ${raw.width}x${raw.height} | ${boxes} | ${percentile(roundTrips, 0.5)} ms | ${percentile(roundTrips, 0.9)} ms | ${percentile(engine, 0.5)} ms |`);
  }
  await sidecar.stop();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
