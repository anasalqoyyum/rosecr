import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { OcrSidecar, type OcrOutcome, type OcrRequest, type OcrSidecarOptions, type OcrSidecarStatus } from '../src/main/ocr-sidecar';

const FAKE_SIDECAR = path.join(__dirname, 'fixtures', 'fake-ocr-sidecar.cjs');

function request(captureGeneration: number, width = 2): OcrRequest {
  return { captureGeneration, image: { format: 'bgra8', width, height: 1, data: new Uint8Array(width * 4) } };
}

/** The fake sidecar answers with the format and byte length it received. */
function recognizedText(outcome: OcrOutcome): string {
  assert.ok(outcome.status === 'ok');
  return `${outcome.result.captureGeneration}/${outcome.result.boxes[0]?.text}`;
}

function harness(t: TestContext, plan: string, options: Partial<OcrSidecarOptions> = {}) {
  const stateDirectory = mkdtempSync(path.join(tmpdir(), 'rosecr-fake-ocr-'));
  const statuses: OcrSidecarStatus[] = [];
  const sidecar = new OcrSidecar({
    launch: { command: process.execPath, args: [FAKE_SIDECAR, stateDirectory, plan] },
    requestTimeoutMs: 1_000,
    startupTimeoutMs: 1_000,
    onStatusChange: (status) => statuses.push(status),
    ...options
  });
  t.after(async () => {
    await sidecar.stop();
    rmSync(stateDirectory, { recursive: true, force: true });
  });
  return {
    sidecar,
    statuses,
    launches: () => Number(readFileSync(path.join(stateDirectory, 'launches'), 'utf8')),
    states: () => statuses.map((status) => status.state === 'starting' && status.restart ? 'restarting' : status.state)
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('recognizes a frame over stdio once the sidecar reports ready', async (t) => {
  const { sidecar } = harness(t, 'ok');
  assert.deepEqual(await sidecar.start(), { state: 'ready', engine: { name: 'fake', version: '0' }, startupMs: 1 });

  const outcome = await sidecar.recognize(request(3));

  assert.deepEqual(outcome, {
    status: 'ok',
    result: {
      captureGeneration: 3,
      ocrMs: 1,
      boxes: [{
        rect: { x: 0, y: 0, width: 2, height: 1 },
        text: 'bgra8:8',
        confidence: 0.5,
        orientation: 'horizontal',
        readingOrder: 0
      }]
    }
  });
});

test('requests before ready fail fast and invalid images are rejected before reaching the sidecar', async (t) => {
  const { sidecar } = harness(t, 'ok');
  assert.deepEqual(await sidecar.recognize(request(1)), { status: 'failed', code: 'unavailable' });
  await sidecar.start();
  await assert.rejects(
    sidecar.recognize({ captureGeneration: 1, image: { format: 'rgba8', width: 2, height: 2, data: new Uint8Array(8) } }),
    TypeError
  );
  await assert.rejects(
    sidecar.recognize({ captureGeneration: 1, image: { format: 'png', width: 7680, height: 4321, data: new Uint8Array(1) } }),
    TypeError
  );
});

test('stale capture generations never produce results', async (t) => {
  const { sidecar } = harness(t, 'delayed');
  await sidecar.start();

  const invalidated = sidecar.recognize(request(1));
  sidecar.advanceGeneration(2);
  assert.deepEqual(await invalidated, { status: 'stale' });
  assert.deepEqual(await sidecar.recognize(request(1)), { status: 'stale' });

  // The sidecar is still working on generation 1, so newer frames wait their turn.
  const overtaken = sidecar.recognize(request(3));
  const newest = sidecar.recognize(request(4));
  assert.deepEqual(await overtaken, { status: 'stale' });
  assert.equal(recognizedText(await newest), '4/bgra8:8');
});

test('a frame that arrives while the sidecar is busy waits, and a newer frame replaces it', async (t) => {
  const { sidecar } = harness(t, 'delayed');
  await sidecar.start();

  const first = sidecar.recognize(request(1, 1));
  const replaced = sidecar.recognize(request(1, 2));
  const newest = sidecar.recognize(request(1, 3));

  assert.deepEqual(await replaced, { status: 'superseded' });
  assert.equal(recognizedText(await first), '1/bgra8:4');
  assert.equal(recognizedText(await newest), '1/bgra8:12');
});

test('one crash restarts the sidecar once and in-flight work fails', async (t) => {
  const { sidecar, launches, states } = harness(t, 'crash-on-ocr,ok');
  await sidecar.start();

  assert.deepEqual(await sidecar.recognize(request(1)), { status: 'failed', code: 'sidecar-failed' });
  await waitFor(() => sidecar.status.state === 'ready');

  assert.equal((await sidecar.recognize(request(2))).status, 'ok');
  assert.equal(launches(), 2);
  assert.deepEqual(states(), ['starting', 'ready', 'restarting', 'ready']);
});

test('a second failure stops with an actionable status until the user retries', async (t) => {
  const { sidecar, launches } = harness(t, 'crash-on-ocr,crash-on-ocr,ok');
  await sidecar.start();
  await sidecar.recognize(request(1));
  await waitFor(() => sidecar.status.state === 'ready');
  await sidecar.recognize(request(2));
  await waitFor(() => sidecar.status.state === 'failed');

  assert.deepEqual(sidecar.status, {
    state: 'failed',
    reason: 'crashed',
    message: 'OCR stopped after repeated failures. Retry OCR; capture settings are unchanged.'
  });
  assert.equal(launches(), 2);
  assert.deepEqual(await sidecar.recognize(request(3)), { status: 'failed', code: 'unavailable' });

  assert.equal((await sidecar.start()).state, 'ready');
  assert.equal((await sidecar.recognize(request(4))).status, 'ok');
});

test('staying ready earns the restart back', async (t) => {
  const { sidecar, launches } = harness(t, 'crash-on-ocr,crash-on-ocr,ok', { restartRefillMs: 100 });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
  await sidecar.start();

  await settle();
  await sidecar.recognize(request(1));
  await waitFor(() => sidecar.status.state === 'ready');
  await settle();
  assert.deepEqual(await sidecar.recognize(request(2)), { status: 'failed', code: 'sidecar-failed' });
  await waitFor(() => sidecar.status.state === 'ready');

  assert.equal(recognizedText(await sidecar.recognize(request(3))), '3/bgra8:8');
  assert.equal(launches(), 3);
});

test('a request timeout fails the request and replaces the hung sidecar', async (t) => {
  const { sidecar, launches } = harness(t, 'hang,ok', { requestTimeoutMs: 100 });
  await sidecar.start();

  const hung = sidecar.recognize(request(1));
  const waiting = sidecar.recognize(request(1));
  assert.deepEqual(await hung, { status: 'failed', code: 'timeout' });
  assert.deepEqual(await waiting, { status: 'failed', code: 'sidecar-failed' });
  await waitFor(() => sidecar.status.state === 'ready');
  assert.equal(launches(), 2);
});

for (const behavior of ['malformed-frame', 'invalid-box', 'wrong-generation']) {
  test(`${behavior} output is discarded and treated as a sidecar failure`, async (t) => {
    const { sidecar, launches } = harness(t, `${behavior},ok`);
    await sidecar.start();

    assert.deepEqual(await sidecar.recognize(request(1)), { status: 'failed', code: 'sidecar-failed' });
    await waitFor(() => sidecar.status.state === 'ready');
    assert.equal(launches(), 2);
  });
}

test('a request error leaves the sidecar running', async (t) => {
  const { sidecar, launches } = harness(t, 'error-response');
  await sidecar.start();
  assert.deepEqual(await sidecar.recognize(request(1)), { status: 'failed', code: 'invalid-image' });
  assert.equal(sidecar.status.state, 'ready');
  assert.equal(launches(), 1);
});

test('startup failures that a restart cannot fix stop without retrying', async (t) => {
  for (const [plan, reason] of [['startup-failed', 'engine-unavailable'], ['old-protocol', 'incompatible-protocol']] as const) {
    const { sidecar, launches } = harness(t, plan);
    const status = await sidecar.start();
    assert.equal(status.state === 'failed' && status.reason, reason);
    assert.equal(launches(), 1);
  }

  const missing = new OcrSidecar({ launch: { command: path.join(tmpdir(), 'rosecr-missing-python'), args: [] } });
  const status = await missing.start();
  assert.equal(status.state === 'failed' && status.reason, 'spawn-failed');
});

test('a sidecar that never becomes ready is restarted once, then stops', async (t) => {
  const { sidecar, launches } = harness(t, 'never-ready', { startupTimeoutMs: 100 });
  const status = await sidecar.start();
  assert.equal(status.state === 'failed' && status.reason, 'startup-timeout');
  assert.equal(launches(), 2);
});

test('stop ends the process and resolves pending work without restarting', async (t) => {
  const { sidecar, launches } = harness(t, 'hang');
  await sidecar.start();
  const pending = sidecar.recognize(request(1));
  const waiting = sidecar.recognize(request(1));

  await sidecar.stop();

  assert.deepEqual(await pending, { status: 'failed', code: 'stopped' });
  assert.deepEqual(await waiting, { status: 'failed', code: 'stopped' });
  assert.deepEqual(sidecar.status, { state: 'stopped' });
  assert.equal(launches(), 1);
});
