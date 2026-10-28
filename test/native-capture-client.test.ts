import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { NativeCaptureClient, TargetCaptureUnavailable, nativeHelperPath, type HelperProcess } from '../src/main/native-capture-client';
import { encodeRequest } from '../src/main/native-capture-protocol';
import type { CaptureTarget } from '../src/main/control-state';

const target: CaptureTarget = { id: 'window:42:0', nativeHandle: '42', name: 'Game', processId: 7, executableName: 'game.exe', className: 'Game' };
class PipeHelper extends EventEmitter implements HelperProcess {
  stdin = new PassThrough(); stdout = new PassThrough(); stderr = new PassThrough();
  requests: Record<string, unknown>[] = [];
  killed = false;
  constructor() {
    super();
    this.stdin.on('data', (bytes: Buffer) => { this.requests.push(JSON.parse(bytes.subarray(4).toString('utf8'))); });
  }
  kill() { this.killed = true; }
  reply(header: Record<string, unknown>, pixels = Buffer.alloc(0)) { this.stdout.write(Buffer.concat([encodeRequest(header), pixels])); }
  started(epoch = 1) {
    const request = this.requests.at(-1)!;
    this.reply({ kind: 'started', requestId: request.requestId, target: '42', captureGeneration: request.captureGeneration, sessionEpoch: epoch, borderDisabled: true, cursorDisabled: true, minUpdateInterval100ns: 1500000 });
  }
  frame(overrides: Record<string, unknown> = {}, pixels = Buffer.alloc(48, 255)) {
    this.reply({ kind: 'frame', requestId: this.requests.at(-1)!.requestId, target: '42', captureGeneration: 1, sessionEpoch: 1,
      pixelFormat: 'BGRA8', width: 4, height: 3, stride: 16, payloadBytes: 48, sequence: 1,
      timestamp: 1000, qpcTimestamp100ns: 100000, clientRect: { left: -10, top: 20, right: -6, bottom: 23 },
      dpi: 120, cropOrigin: { x: 0, y: 0 }, ...overrides }, pixels);
  }
}
function fixture(t: test.TestContext) {
  const helper = new PipeHelper();
  const client = new NativeCaptureClient('helper.exe', () => helper);
  t.after(() => client.stop());
  return { helper, client };
}
async function start(client: NativeCaptureClient, helper: PipeHelper) {
  const promise = client.start(target, 1); helper.started(); await promise;
}

test('client uses private framed requests and exposes exact BGRA frame bytes', async (t) => {
  const { client, helper } = fixture(t);
  await start(client, helper);
  assert.deepEqual(helper.requests[0], { version: 1, action: 'start', requestId: 1, target: '42', processId: 7, captureGeneration: 1 });
  const grabbing = client.grab(null); helper.frame();
  const frame = await grabbing;
  assert.ok(frame); assert.deepEqual(frame.pixels, Buffer.alloc(48, 255));
  assert.equal(frame.stride, 16); assert.ok(frame.grabLatencyMs >= 0);
  assert.equal(nativeHelperPath('/app'), path.join('/app', 'native', 'rosecr-capture-helper.exe'));
  assert.equal(nativeHelperPath('/app', '/resources'), path.join('/resources', 'native', 'rosecr-capture-helper.exe'));
});

test('target rejection waits, while helper exit, invalid protocol, and timeout fail pending work', async (t) => {
  for (const failure of ['waiting', 'exit', 'protocol', 'timeout'] as const) {
    const { client, helper } = fixture(t);
    const failures: string[] = []; client.subscribe((event) => { if (event.kind === 'failure') failures.push(event.error.message); });
    if (failure === 'timeout') t.mock.timers.enable({ apis: ['setTimeout'] });
    const starting = client.start(target, 1);
    const rejection = assert.rejects(starting, failure === 'waiting' ? TargetCaptureUnavailable : Error);
    if (failure === 'waiting') helper.reply({ kind: 'waiting', requestId: 1, message: 'protected target' });
    if (failure === 'exit') helper.emit('exit', 1, null);
    if (failure === 'protocol') helper.stdout.write(Buffer.from([255, 255, 255, 255]));
    if (failure === 'timeout') t.mock.timers.tick(5000);
    await rejection;
    assert.equal(failures.length, failure === 'waiting' ? 0 : 1);
    assert.equal(helper.killed, failure !== 'waiting');
  }
});

test('client rejects incorrect identity, stale sequence/time, and mismatched crops before payloads', async (t) => {
  for (const override of [{ target: '43' }, { captureGeneration: 2 }, { sessionEpoch: 2 }, { sequence: 1 }, { qpcTimestamp100ns: 100000 }, { cropOrigin: { x: 1, y: 0 }, clientRect: { left: -10, top: 20, right: -5, bottom: 23 } }]) {
    const { client, helper } = fixture(t);
    await start(client, helper);
    const first = client.grab(null); helper.frame(); await first;
    const second = client.grab(null); const rejection = assert.rejects(second);
    helper.frame({ sequence: 2, qpcTimestamp100ns: 200000, ...override }, Buffer.alloc(0));
    await rejection;
    assert.equal(helper.killed, true);
  }
});

test('device recovery advances the epoch and requires fresh frames', async (t) => {
  const { client, helper } = fixture(t);
  await start(client, helper);
  const events: string[] = []; client.subscribe((event) => events.push(event.kind === 'failure' ? 'failure' : event.event));
  for (const [event, sessionEpoch] of [['deviceLost', 1], ['deviceRecovered', 2]] as const) helper.reply({ kind: 'event', event, target: '42', captureGeneration: 1, sessionEpoch, message: event, timestamp: 1000, qpcTimestamp100ns: 100000 });
  assert.deepEqual(events, ['deviceLost', 'deviceRecovered']);
  const pending = client.grab(null);
  assert.equal(helper.requests.at(-1)?.sessionEpoch, 2);
  helper.frame({ sessionEpoch: 2 });
  assert.equal((await pending)?.sessionEpoch, 2);
});

test('coalesced stop/start responses cannot erase the newer session', async (t) => {
  const { client, helper } = fixture(t);
  await start(client, helper);
  const stopped = client.stopCapture(); const stoppingId = helper.requests.at(-1)!.requestId;
  const starting = client.start(target, 2); const startingId = helper.requests.at(-1)!.requestId;
  helper.stdout.write(Buffer.concat([
    encodeRequest({ kind: 'stopped', requestId: stoppingId }),
    encodeRequest({ kind: 'started', requestId: startingId, target: '42', captureGeneration: 2, sessionEpoch: 2, borderDisabled: true, cursorDisabled: true, minUpdateInterval100ns: null })
  ]));
  await Promise.all([stopped, starting]);
  const pending = client.grab(null); helper.frame({ captureGeneration: 2, sessionEpoch: 2, borderDisabled: true, cursorDisabled: true, minUpdateInterval100ns: null });
  assert.equal((await pending)?.captureGeneration, 2);
});

test('truncated payload and process errors reject all work once and permit a later relaunch', async (t) => {
  const first = new PipeHelper(); const second = new PipeHelper(); let launches = 0;
  const client = new NativeCaptureClient('helper.exe', () => ++launches === 1 ? first : second);
  t.after(() => client.stop());
  await start(client, first);
  const pending = client.grab(null); const rejection = assert.rejects(pending, /Truncated/);
  first.frame({}, Buffer.alloc(47)); first.stdout.end(); await rejection;
  const restarting = client.start(target, 2); second.started(); await restarting;
  assert.equal(launches, 2);
});

test('Rosecr targets and own-window enumeration fail closed', async (t) => {
  const { client, helper } = fixture(t);
  await assert.rejects(client.start({ ...target, processId: process.pid }, 1), /Invalid/);
  const listing = client.list(); const rejection = assert.rejects(listing, /Rosecr/);
  helper.reply({ kind: 'list', requestId: 1, windows: [{ handle: '42', processId: process.pid, title: 'Rosecr', executableName: 'rosecr.exe', className: 'Window' }] });
  await rejection;
});


test('a frame predating geometry invalidation is rejected before payload allocation', async (t) => {
  const { client, helper } = fixture(t);
  await start(client, helper);
  helper.reply({ kind: 'event', event: 'geometryChanged', target: '42', captureGeneration: 1, sessionEpoch: 2,
    timestamp: 1000, qpcTimestamp100ns: 200000, message: 'moved' });
  const pending = client.grab(null); const rejection = assert.rejects(pending, /Stale/);
  helper.frame({ sessionEpoch: 2, qpcTimestamp100ns: 100000 }, Buffer.alloc(0));
  await rejection;
});

test('unsolicited response ids fail pending requests', async (t) => {
  const { client, helper } = fixture(t);
  const listing = client.list(); const rejection = assert.rejects(listing, /response id/);
  helper.reply({ kind: 'list', requestId: 99, windows: [] });
  await rejection;
});
