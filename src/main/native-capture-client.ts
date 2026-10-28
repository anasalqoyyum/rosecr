import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import type { CaptureTarget } from './control-state';
import type { NativeWindow } from './capture-source';
import type { NormalizedRegion } from '../shared/region';
import { HelperDecoder, encodeRequest, validHandle, validateFrameRequest, type CaptureEvent, type CaptureIdentity, type FrameHeader, type HelperHeader, type WindowMetadata } from './native-capture-protocol';

export type { WindowMetadata, CaptureEvent } from './native-capture-protocol';
export interface WindowMetadataSource {
  list(): Promise<{ windows: NativeWindow[] }>;
  query(handle: string): Promise<WindowMetadata>;
}
export type CapturedFrame = FrameHeader & { pixels: Buffer; grabLatencyMs: number };
export class TargetCaptureUnavailable extends Error {}
export type FrameSourceEvent = CaptureEvent | { kind: 'failure'; error: Error };
export interface FrameSource {
  start(target: CaptureTarget, captureGeneration: number): Promise<CaptureIdentity>;
  grab(region: NormalizedRegion | null): Promise<CapturedFrame | null>;
  stopCapture(): Promise<void>;
  subscribe(listener: (event: FrameSourceEvent) => void): () => void;
}

export interface HelperProcess {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  once(event: 'error', listener: (error: Error) => void): unknown;
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  kill(): unknown;
}
interface Pending {
  action: string;
  expected: { target: string; captureGeneration: number; region: NormalizedRegion | null } | null;
  resolve(value: { header: HelperHeader; pixels: Buffer }): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

export function nativeHelperPath(applicationRoot: string, resourcesPath?: string): string {
  return path.join(resourcesPath ?? applicationRoot, 'native', 'rosecr-capture-helper.exe');
}

export class NativeCaptureClient implements WindowMetadataSource, FrameSource {
  private child: HelperProcess | null = null;
  private nextRequestId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(event: FrameSourceEvent) => void>();
  private active: CaptureIdentity | null = null;
  private sequence = 0;
  private qpc = 0;
  private minimumFrameQpc = 0;
  private maxEpoch = 0;
  private stderr = '';
  private sessionDiagnostics: Extract<HelperHeader, { kind: 'started' }> | null = null;
  private readonly recentEvents: CaptureEvent[] = [];

  constructor(private readonly executable: string, private readonly launch: () => HelperProcess = () => {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Native capture requires Windows 11 x64.');
    return spawn(executable, ['--parent-pid', String(process.pid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  }) {}

  subscribe(listener: (event: FrameSourceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: FrameSourceEvent): void { for (const listener of this.listeners) listener(event); }

  private ensureProcess(): HelperProcess {
    if (this.child) return this.child;
    const child = this.launch();
    this.child = child;
    this.maxEpoch = 0;
    this.stderr = '';
    this.sessionDiagnostics = null;
    this.qpc = 0; this.minimumFrameQpc = 0;
    const decoder = new HelperDecoder((header) => this.validate(header), (header, pixels) => this.receive(header, pixels));
    child.stdout.on('data', (chunk: Buffer) => {
      if (this.child !== child) return;
      try { decoder.push(chunk); } catch (error) { this.fail(child, error instanceof Error ? error : new Error('Invalid native protocol.')); }
    });
    child.stdout.once('end', () => {
      if (this.child !== child) return;
      try { decoder.end(); this.fail(child, new Error('Native capture helper closed stdout.')); }
      catch (error) { this.fail(child, error instanceof Error ? error : new Error('Truncated native protocol.')); }
    });
    child.stderr.on('data', (chunk: Buffer) => { if (this.child === child) this.stderr = (this.stderr + chunk.toString('utf8')).slice(-4096); });
    child.stdin.on('error', (error) => this.fail(child, error));
    child.stdout.on('error', (error) => this.fail(child, error));
    child.stderr.on('error', (error) => this.fail(child, error));
    child.once('error', (error) => this.fail(child, error));
    child.once('exit', (code, signal) => this.fail(child, new Error(`Native capture helper exited (${signal ?? code}). ${this.stderr}`.trim())));
    return child;
  }

  private validate(header: HelperHeader): void {
    if (header.kind === 'event') {
      const advancesEpoch = header.event === 'geometryChanged' || header.event === 'deviceRecovered';
      if (!this.active || header.target !== this.active.target || header.captureGeneration !== this.active.captureGeneration ||
          (advancesEpoch ? header.sessionEpoch <= this.active.sessionEpoch : header.sessionEpoch !== this.active.sessionEpoch) || header.qpcTimestamp100ns < this.qpc) throw new Error('Native event identity mismatch.');
      return;
    }
    const pending = this.pending.get(header.requestId);
    if (!pending) throw new Error('Unexpected native response id.');
    if (header.kind === 'waiting' || header.kind === 'error') return;
    const expectedKind = { list: 'list', query: 'metadata', start: 'started', stop: 'stopped', grab: 'frame' }[pending.action];
    if (header.kind !== expectedKind) throw new Error('Unexpected native response kind.');
    if (header.kind === 'started') {
      if (!pending.expected || header.target !== pending.expected.target || header.captureGeneration !== pending.expected.captureGeneration || header.sessionEpoch <= this.maxEpoch) throw new Error('Native session identity mismatch.');
      this.active = { target: header.target, captureGeneration: header.captureGeneration, sessionEpoch: header.sessionEpoch };
      this.maxEpoch = header.sessionEpoch;
      this.sessionDiagnostics = header;
      this.sequence = 0;
    }
    if (header.kind === 'list' && header.windows.some((window) => window.processId === process.pid)) throw new Error('Native helper returned a Rosecr window.');
    if (header.kind === 'frame') {
      if (!pending.expected) throw new Error('Unrequested native frame.');
      validateFrameRequest(header, pending.expected);
      if (!this.active || header.target !== this.active.target || header.captureGeneration !== this.active.captureGeneration ||
          header.sessionEpoch !== this.active.sessionEpoch || header.sequence <= this.sequence || header.qpcTimestamp100ns <= this.qpc || header.qpcTimestamp100ns < this.minimumFrameQpc) throw new Error('Stale native frame.');
      this.sequence = header.sequence; this.qpc = header.qpcTimestamp100ns;
    }
  }

  private receive(header: HelperHeader, pixels: Buffer): void {
    if (header.kind === 'event') {
      if (this.active && header.sessionEpoch > this.active.sessionEpoch) {
        this.active = { ...this.active, sessionEpoch: header.sessionEpoch };
        this.maxEpoch = Math.max(this.maxEpoch, header.sessionEpoch);
        this.sequence = 0;
      }
      if (header.event === 'geometryChanged' || header.event === 'deviceRecovered') this.minimumFrameQpc = Math.max(this.minimumFrameQpc, header.qpcTimestamp100ns);
      this.recentEvents.push(header);
      if (this.recentEvents.length > 64) this.recentEvents.shift();
      this.emit(header);
      return;
    }
    if (header.kind === 'stopped') this.active = null;
    const pending = this.pending.get(header.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(header.requestId);
    if (pending.action === 'start' && header.kind === 'waiting') this.active = null;
    if (header.kind === 'error') pending.reject(new Error(header.message));
    else pending.resolve({ header, pixels });
  }

  private request(action: string, payload: Record<string, unknown> = {}, expected: Pending['expected'] = null): Promise<{ header: HelperHeader; pixels: Buffer }> {
    const bytes = encodeRequest({ action, requestId: this.nextRequestId, ...payload });
    const child = this.ensureProcess();
    if (this.pending.size >= 16) throw new Error('Too many native capture requests.');
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(child, new Error(`Native capture ${action} timed out.`)), 5000);
      this.pending.set(requestId, { action, expected, resolve, reject, timer });
      child.stdin.write(bytes, (error) => { if (error) this.fail(child, error); });
    });
  }

  async list(): Promise<{ windows: NativeWindow[] }> {
    const { header } = await this.request('list');
    if (header.kind !== 'list') throw new Error('Native window listing unavailable.');
    return { windows: header.windows };
  }

  async query(handle: string): Promise<WindowMetadata> {
    if (!validHandle(handle)) throw new Error('Invalid native target handle.');
    const { header } = await this.request('query', { target: handle });
    if (header.kind !== 'metadata') throw new Error('Native metadata unavailable.');
    return header.metadata;
  }

  async start(target: CaptureTarget, captureGeneration: number): Promise<CaptureIdentity> {
    if (!validHandle(target.nativeHandle) || target.processId === process.pid || !Number.isSafeInteger(target.processId) || target.processId < 1 || target.processId > 0xffffffff || !Number.isSafeInteger(captureGeneration) || captureGeneration < 1) throw new Error('Invalid native capture target or generation.');
    const expected = { target: target.nativeHandle, captureGeneration, region: null };
    const { header } = await this.request('start', { target: target.nativeHandle, processId: target.processId, captureGeneration }, expected);
    if (header.kind === 'waiting') throw new TargetCaptureUnavailable(header.message);
    if (header.kind !== 'started') throw new Error('Native capture did not start.');
    return { target: header.target, captureGeneration: header.captureGeneration, sessionEpoch: header.sessionEpoch };
  }

  async grab(region: NormalizedRegion | null): Promise<CapturedFrame | null> {
    if (!this.active) return null;
    const expected = { target: this.active.target, captureGeneration: this.active.captureGeneration, region };
    const started = performance.now();
    const { header, pixels } = await this.request('grab', { ...this.active, region }, expected);
    if (header.kind === 'waiting') return null;
    if (header.kind !== 'frame') throw new Error('Native capture did not return a frame.');
    return { ...header, pixels, grabLatencyMs: performance.now() - started };
  }

  async stopCapture(): Promise<void> {
    if (!this.child) return;
    const { header } = await this.request('stop');
    if (header.kind !== 'stopped') throw new Error('Native capture did not stop.');
  }

  private fail(child: HelperProcess, error: Error): void {
    if (this.child !== child) return;
    this.child = null;
    this.active = null;
    child.kill();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.emit({ kind: 'failure', error });
  }

  getDiagnostics(): { executable: string; session: Extract<HelperHeader, { kind: 'started' }> | null; events: CaptureEvent[] } {
    return { executable: this.executable, session: this.sessionDiagnostics, events: [...this.recentEvents] };
  }

  stop(): void {
    const child = this.child;
    if (!child) return;
    this.child = null; this.active = null;
    child.stdin.end(); child.kill();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Native capture helper stopped.')); }
    this.pending.clear();
  }
}
