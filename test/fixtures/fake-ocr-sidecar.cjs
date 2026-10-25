// Scriptable stand-in for sidecar/rosecr_ocr. Usage: fake-ocr-sidecar.cjs <state-dir> <behavior>[,<behavior>...]
// Launch N follows behavior N (the last behavior repeats) and records the launch count in <state-dir>/launches.
const fs = require('node:fs');
const path = require('node:path');

const [stateDirectory, plan] = process.argv.slice(2);
const launchFile = path.join(stateDirectory, 'launches');
const launch = fs.existsSync(launchFile) ? Number(fs.readFileSync(launchFile, 'utf8')) : 0;
fs.writeFileSync(launchFile, String(launch + 1));
const behaviors = plan.split(',');
const behavior = behaviors[Math.min(launch, behaviors.length - 1)];

function frame(header) {
  const encoded = Buffer.from(JSON.stringify(header));
  const prefix = Buffer.alloc(8);
  prefix.writeUInt32BE(4 + encoded.length, 0);
  prefix.writeUInt32BE(encoded.length, 4);
  return Buffer.concat([prefix, encoded]);
}

function send(header) {
  process.stdout.write(frame(header));
}

function result(request, body, overrides = {}) {
  return {
    type: 'ocr-result',
    requestId: request.requestId,
    captureGeneration: request.captureGeneration,
    ocrMs: 1,
    boxes: [{
      x: 0, y: 0, width: request.width, height: request.height,
      text: `${request.format}:${body.length}`, confidence: 0.5, orientation: 'horizontal', readingOrder: 0
    }],
    ...overrides
  };
}

function respond(request, body) {
  switch (behavior) {
    case 'crash-on-ocr': process.exit(1); break;
    case 'hang': break;
    case 'malformed-frame': process.stdout.write(Buffer.from([0xff, 0xff, 0xff, 0xff])); break;
    case 'invalid-box': send(result(request, body, { boxes: [{ x: request.width, y: 0, width: 1, height: 1, text: 'x', confidence: 0.5, orientation: 'horizontal', readingOrder: 0 }] })); break;
    case 'wrong-generation': send(result(request, body, { captureGeneration: request.captureGeneration + 1 })); break;
    case 'error-response': send({ type: 'error', requestId: request.requestId, code: 'invalid-image', message: 'bad' }); break;
    case 'delayed': setTimeout(() => send(result(request, body)), 50); break;
    default: send(result(request, body));
  }
}

if (behavior === 'never-ready') {
  setInterval(() => {}, 1000);
} else if (behavior === 'startup-failed') {
  send({ type: 'startup-failed', code: 'engine-unavailable' });
  process.exitCode = 3;
} else {
  send({ type: 'ready', protocolVersion: behavior === 'old-protocol' ? 99 : 1, engine: { name: 'fake', version: '0' }, startupMs: 1 });
}

let buffered = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buffered = Buffer.concat([buffered, chunk]);
  while (buffered.length >= 4 && buffered.length >= 4 + buffered.readUInt32BE(0)) {
    const payloadLength = buffered.readUInt32BE(0);
    const payload = buffered.subarray(4, 4 + payloadLength);
    buffered = buffered.subarray(4 + payloadLength);
    const headerLength = payload.readUInt32BE(0);
    respond(JSON.parse(payload.subarray(4, 4 + headerLength).toString('utf8')), payload.subarray(4 + headerLength));
  }
});
process.stdin.on('end', () => process.exit(0));
