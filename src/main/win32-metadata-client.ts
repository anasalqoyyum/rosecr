import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import type { NativeWindow } from './capture-source';
import type { PhysicalClientRect } from './geometry';

interface HelperResponse {
  requestId: number;
  error?: string;
}

export interface WindowMetadata extends HelperResponse {
  exists: boolean;
  visible: boolean;
  minimized: boolean;
  capturable: boolean;
  dpi: number;
  foregroundHandle: string;
  targetIsForeground: boolean;
  clientRect: PhysicalClientRect | null;
  timestamp: number;
}

export interface WindowListResponse extends HelperResponse {
  windows: NativeWindow[];
}

interface PendingRequest {
  resolve(value: HelperResponse): void;
  reject(reason: Error): void;
  timer: NodeJS.Timeout;
}

export class Win32MetadataClient {
  private nextRequestId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private process: ChildProcessWithoutNullStreams | null = null;

  constructor(private readonly applicationRoot: string) {}

  start(): void {
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
    this.process.stderr.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      if (message) this.failAll(new Error(message));
    });
  }

  private handleLine(line: string): void {
    let response: HelperResponse;
    try {
      response = JSON.parse(line) as HelperResponse;
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

  private request<T extends HelperResponse>(payload: Record<string, unknown>): Promise<T> {
    this.start();
    const requestId = this.nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('Win32 metadata query timed out.'));
      }, 1500);
      this.pending.set(requestId, { resolve: (value) => resolve(value as T), reject, timer });
      this.process?.stdin.write(`${JSON.stringify({ requestId, ...payload })}\n`);
    });
  }

  query(handle: string): Promise<WindowMetadata> {
    return this.request({ action: 'query', handle });
  }

  list(): Promise<WindowListResponse> {
    return this.request({ action: 'list' });
  }

  private failAll(error: Error): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
    this.process = null;
  }

  stop(): void {
    this.process?.stdin.end();
    this.process?.kill();
    this.process = null;
  }
}
