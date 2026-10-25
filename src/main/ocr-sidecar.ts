import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import type { OcrResult } from '../shared/contracts';
import {
  encodeFrame,
  FrameDecoder,
  isCount,
  OCR_PROTOCOL_VERSION,
  parseSidecarMessage,
  type SidecarRequestErrorCode
} from './ocr-sidecar-protocol';

export interface SidecarLaunch {
  command: string;
  args: readonly string[];
  cwd?: string;
}

export type OcrImageFormat = 'png' | 'rgba8' | 'bgra8';

/** A frame in physical pixels. Raw formats are tightly packed, 4 bytes per pixel. */
export interface OcrImage {
  format: OcrImageFormat;
  width: number;
  height: number;
  data: Uint8Array;
}

export interface OcrRequest {
  captureGeneration: number;
  image: OcrImage;
}

export type OcrFailureCode = 'unavailable' | 'timeout' | 'sidecar-failed' | 'stopped' | SidecarRequestErrorCode;

export type OcrOutcome =
  | { status: 'ok'; result: OcrResult }
  | { status: 'stale' }
  | { status: 'superseded' }
  | { status: 'failed'; code: OcrFailureCode };

export type OcrSidecarFailureReason =
  | 'engine-unavailable'
  | 'incompatible-protocol'
  | 'spawn-failed'
  | 'crashed'
  | 'startup-timeout'
  | 'request-timeout'
  | 'protocol-error';

export type OcrSidecarStatus =
  | { state: 'stopped' }
  | { state: 'starting'; restart: boolean }
  | { state: 'ready'; engine: { name: string; version: string }; startupMs: number }
  | { state: 'failed'; reason: OcrSidecarFailureReason; message: string };

export interface OcrSidecarOptions {
  launch: SidecarLaunch;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  /** After the sidecar has stayed ready this long, a later failure may restart it again. */
  restartRefillMs?: number;
  onStatusChange?(status: OcrSidecarStatus): void;
}

const REPEATED_FAILURE = 'OCR stopped after repeated failures. Retry OCR; capture settings are unchanged.';
const FAILURE_MESSAGES: Record<OcrSidecarFailureReason, string> = {
  'engine-unavailable': 'OCR models are missing or failed to load. Reinstall OCR assets, then retry OCR.',
  'incompatible-protocol': 'The OCR runtime does not match this version of Rosecr. Reinstall Rosecr.',
  'spawn-failed': 'The bundled OCR runtime could not be started. Reinstall Rosecr, then retry OCR.',
  crashed: REPEATED_FAILURE,
  'startup-timeout': REPEATED_FAILURE,
  'request-timeout': REPEATED_FAILURE,
  'protocol-error': REPEATED_FAILURE
};
/** One 8K frame. The sidecar enforces the same limit (sidecar/rosecr_ocr/image.py). */
export const MAX_IMAGE_PIXELS = 7680 * 4320;
const NOT_RESTARTABLE: ReadonlySet<OcrSidecarFailureReason> = new Set(['engine-unavailable', 'incompatible-protocol', 'spawn-failed']);

interface InFlightRequest {
  requestId: number;
  captureGeneration: number;
  width: number;
  height: number;
  timer: NodeJS.Timeout;
  /** Null once the caller has been answered early (stale) while the sidecar still works on it. */
  resolve: ((outcome: OcrOutcome) => void) | null;
}

interface WaitingRequest {
  request: OcrRequest;
  resolve: (outcome: OcrOutcome) => void;
}

function assertValidRequest({ captureGeneration, image }: OcrRequest): void {
  if (!isCount(captureGeneration)) throw new TypeError('captureGeneration must be a non-negative integer.');
  if (!isCount(image.width) || !isCount(image.height) || image.width === 0 || image.height === 0) {
    throw new TypeError('Image dimensions must be positive integers.');
  }
  if (image.width * image.height > MAX_IMAGE_PIXELS || image.data.length > MAX_IMAGE_PIXELS * 4) {
    throw new TypeError('Image exceeds the 8K OCR limit.');
  }
  if (image.format !== 'png' && image.data.length !== image.width * image.height * 4) {
    throw new TypeError('Raw image data must be width * height * 4 bytes.');
  }
}

export function developmentSidecarLaunch(repositoryRoot: string): SidecarLaunch {
  const sidecarDirectory = path.join(repositoryRoot, 'sidecar');
  const python = process.platform === 'win32'
    ? path.join(sidecarDirectory, '.venv', 'Scripts', 'python.exe')
    : path.join(sidecarDirectory, '.venv', 'bin', 'python');
  // -E and -s ignore PYTHON* variables and user site-packages; -m resolves the package from cwd.
  return { command: python, args: ['-E', '-s', '-m', 'rosecr_ocr'], cwd: sidecarDirectory };
}

/**
 * Owns the OCR sidecar process. After an unexpected failure it restarts once; a second
 * failure leaves it failed until the user retries. Staying ready for restartRefillMs earns
 * the restart back, so unrelated crashes in a long session do not stop OCR.
 *
 * The sidecar handles one request at a time and the timeout measures processing time only.
 * A frame that arrives while a request is in flight waits in a single slot and is sent next;
 * a newer frame replaces it, answering the older one 'superseded'. A waiting frame keeps a
 * reference to its image data until it is sent, so callers must not reuse the buffer.
 * Seeing a newer capture generation answers older requests as stale at once; the result of
 * one already in flight is dropped. Timeouts and malformed output terminate the process,
 * because the sidecar cannot cancel work or resynchronize a corrupt stream.
 */
export class OcrSidecar {
  private readonly launch: SidecarLaunch;
  private readonly startupTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly restartRefillMs: number;
  private readonly onStatusChange: (status: OcrSidecarStatus) => void;
  private currentStatus: OcrSidecarStatus = { state: 'stopped' };
  private child: ChildProcessWithoutNullStreams | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private inFlight: InFlightRequest | null = null;
  private waiting: WaitingRequest | null = null;
  private readonly settledWaiters: Array<(status: OcrSidecarStatus) => void> = [];
  private nextRequestId = 1;
  private latestGeneration = 0;
  private restartAvailable = true;
  private readySince: number | null = null;

  constructor(options: OcrSidecarOptions) {
    this.launch = options.launch;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 60_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
    this.restartRefillMs = options.restartRefillMs ?? 5 * 60_000;
    this.onStatusChange = options.onStatusChange ?? (() => {});
  }

  get status(): OcrSidecarStatus {
    return this.currentStatus;
  }

  /** Starts the sidecar, or retries after a failure, and resolves once it is ready or has failed. */
  start(): Promise<OcrSidecarStatus> {
    if (this.currentStatus.state === 'ready') return Promise.resolve(this.currentStatus);
    const settled = new Promise<OcrSidecarStatus>((resolve) => this.settledWaiters.push(resolve));
    if (this.currentStatus.state !== 'starting') {
      this.restartAvailable = true;
      this.spawnSidecar(false);
    }
    return settled;
  }

  async recognize(request: OcrRequest): Promise<OcrOutcome> {
    assertValidRequest(request);
    if (request.captureGeneration < this.latestGeneration) return { status: 'stale' };
    this.advanceGeneration(request.captureGeneration);
    const child = this.child;
    if (this.currentStatus.state !== 'ready' || !child) return { status: 'failed', code: 'unavailable' };

    return new Promise<OcrOutcome>((resolve) => {
      if (!this.inFlight) return this.send(child, { request, resolve });
      this.waiting?.resolve({ status: 'superseded' });
      this.waiting = { request, resolve };
    });
  }

  /** Answers requests for older capture generations as stale now. */
  advanceGeneration(captureGeneration: number): void {
    if (!isCount(captureGeneration)) throw new TypeError('captureGeneration must be a non-negative integer.');
    if (captureGeneration <= this.latestGeneration) return;
    this.latestGeneration = captureGeneration;
    if (this.waiting && this.waiting.request.captureGeneration < captureGeneration) {
      this.waiting.resolve({ status: 'stale' });
      this.waiting = null;
    }
    if (this.inFlight && this.inFlight.captureGeneration < captureGeneration) this.answerEarly({ status: 'stale' });
  }

  async stop(): Promise<void> {
    const child = this.detach();
    this.abandonRequests('stopped');
    this.setStatus({ state: 'stopped' });
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    // 'close' also fires when the spawn itself failed, which never emits 'exit'.
    const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
    child.stdin.end();
    const killTimer = setTimeout(() => child.kill(), 2_000);
    await closed;
    clearTimeout(killTimer);
  }

  private send(child: ChildProcessWithoutNullStreams, { request, resolve }: WaitingRequest): void {
    const { captureGeneration, image } = request;
    const requestId = this.nextRequestId++;
    const timer = setTimeout(() => {
      this.answerEarly({ status: 'failed', code: 'timeout' });
      this.fail(child, 'request-timeout');
    }, this.requestTimeoutMs);
    this.inFlight = { requestId, captureGeneration, width: image.width, height: image.height, timer, resolve };
    child.stdin.write(encodeFrame({
      type: 'ocr',
      requestId,
      captureGeneration,
      width: image.width,
      height: image.height,
      format: image.format
    }, image.data));
  }

  private spawnSidecar(restart: boolean): void {
    this.readySince = null;
    this.setStatus({ state: 'starting', restart });
    const child = spawn(this.launch.command, [...this.launch.args], {
      cwd: this.launch.cwd,
      stdio: 'pipe',
      windowsHide: true
    });
    this.child = child;
    this.startupTimer = setTimeout(() => this.fail(child, 'startup-timeout'), this.startupTimeoutMs);

    const decoder = new FrameDecoder();
    child.stdout.on('data', (chunk: Buffer) => {
      let frames;
      try {
        frames = decoder.push(chunk);
      } catch {
        this.fail(child, 'protocol-error');
        return;
      }
      for (const frame of frames) {
        if (child !== this.child) return;
        this.handleMessage(child, frame.header);
      }
    });
    // Drained and discarded: Python tracebacks can quote recognized text.
    child.stderr.resume();
    // Writes after the process dies raise EPIPE here; the exit handler reports the failure.
    child.stdin.on('error', () => {});
    child.on('error', () => this.fail(child, this.currentStatus.state === 'starting' ? 'spawn-failed' : 'crashed'));
    child.on('exit', () => this.fail(child, 'crashed'));
  }

  private handleMessage(child: ChildProcessWithoutNullStreams, header: unknown): void {
    let message;
    try {
      message = parseSidecarMessage(header);
    } catch {
      this.fail(child, 'protocol-error');
      return;
    }

    if (message.type === 'ready' || message.type === 'startup-failed') {
      if (this.currentStatus.state !== 'starting') return this.fail(child, 'protocol-error');
      if (message.type === 'startup-failed') return this.fail(child, 'engine-unavailable');
      if (message.protocolVersion !== OCR_PROTOCOL_VERSION) return this.fail(child, 'incompatible-protocol');
      this.clearStartupTimer();
      this.readySince = Date.now();
      this.setStatus({ state: 'ready', engine: message.engine, startupMs: message.startupMs });
      return;
    }

    const request = this.inFlight;
    if (!request || message.requestId !== request.requestId) return this.fail(child, 'protocol-error');
    if (message.type === 'error') {
      this.finishInFlight({ status: 'failed', code: message.code });
      return;
    }
    const outOfBounds = message.boxes.some(({ rect }) =>
      rect.x + rect.width > request.width || rect.y + rect.height > request.height);
    if (message.captureGeneration !== request.captureGeneration || outOfBounds) {
      return this.fail(child, 'protocol-error');
    }
    this.finishInFlight({
      status: 'ok',
      result: { captureGeneration: message.captureGeneration, boxes: message.boxes, ocrMs: message.ocrMs }
    });
  }

  /** Answers the caller without freeing the sidecar, which is still working on the request. */
  private answerEarly(outcome: OcrOutcome): void {
    if (!this.inFlight) return;
    this.inFlight.resolve?.(outcome);
    this.inFlight.resolve = null;
  }

  /** Frees the sidecar and sends the waiting frame, if any. */
  private finishInFlight(outcome: OcrOutcome): void {
    const request = this.inFlight;
    if (!request) return;
    this.inFlight = null;
    clearTimeout(request.timer);
    request.resolve?.(outcome);
    const next = this.waiting;
    this.waiting = null;
    if (!next) return;
    if (this.child) this.send(this.child, next);
    else next.resolve({ status: 'failed', code: 'unavailable' });
  }

  private abandonRequests(code: 'sidecar-failed' | 'stopped'): void {
    this.waiting?.resolve({ status: 'failed', code });
    this.waiting = null;
    this.finishInFlight({ status: 'failed', code });
  }

  private fail(child: ChildProcessWithoutNullStreams, reason: OcrSidecarFailureReason): void {
    if (child !== this.child) return;
    this.detach();
    child.kill();
    this.abandonRequests('sidecar-failed');
    if (this.readySince !== null && Date.now() - this.readySince >= this.restartRefillMs) this.restartAvailable = true;
    if (this.restartAvailable && !NOT_RESTARTABLE.has(reason)) {
      this.restartAvailable = false;
      this.spawnSidecar(true);
      return;
    }
    this.setStatus({ state: 'failed', reason, message: FAILURE_MESSAGES[reason] });
  }

  private detach(): ChildProcessWithoutNullStreams | null {
    const child = this.child;
    this.child = null;
    this.clearStartupTimer();
    return child;
  }

  private clearStartupTimer(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = null;
  }

  private setStatus(status: OcrSidecarStatus): void {
    this.currentStatus = status;
    this.onStatusChange(status);
    if (status.state === 'starting') return;
    for (const resolve of this.settledWaiters.splice(0)) resolve(status);
  }
}
