const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

class Win32MetadataClient {
  /** @param {string} applicationRoot */
  constructor(applicationRoot) {
    this.applicationRoot = applicationRoot;
    this.nextRequestId = 1;
    /** @type {Map<number, { resolve: (value: unknown) => void, reject: (reason: Error) => void, timer: NodeJS.Timeout }>} */
    this.pending = new Map();
    /** @type {import('node:child_process').ChildProcessWithoutNullStreams | null} */
    this.process = null;
  }

  start() {
    if (process.platform !== 'win32') throw new Error('The capture metadata spike requires Windows.');
    if (this.process) return;
    const script = path.join(this.applicationRoot, 'scripts', 'win32-window-metadata.ps1');
    this.process = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
      { windowsHide: true }
    );
    readline.createInterface({ input: this.process.stdout }).on('line', (line) => this.handleLine(line));
    this.process.once('exit', () => this.failAll(new Error('Win32 metadata helper stopped.')));
    this.process.stderr.on('data', (data) => {
      const message = data.toString().trim();
      if (message) this.failAll(new Error(message));
    });
  }

  /** @param {string} line */
  handleLine(line) {
    let response;
    try {
      response = JSON.parse(line);
    } catch {
      return;
    }
    const entry = this.pending.get(response.requestId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(response.requestId);
    if (response.error) entry.reject(new Error(response.error));
    else entry.resolve(response);
  }

  /** @param {Record<string, unknown>} payload */
  request(payload) {
    this.start();
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('Win32 metadata query timed out.'));
      }, 1500);
      this.pending.set(requestId, { resolve, reject, timer });
      this.process?.stdin.write(`${JSON.stringify({ requestId, ...payload })}\n`);
    });
  }

  /** @param {string} handle */
  query(handle) {
    return this.request({ action: 'query', handle });
  }

  list() {
    return this.request({ action: 'list' });
  }

  /** @param {Error} error */
  failAll(error) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
    this.process = null;
  }

  stop() {
    this.process?.stdin.end();
    this.process?.kill();
    this.process = null;
  }
}

module.exports = { Win32MetadataClient };
