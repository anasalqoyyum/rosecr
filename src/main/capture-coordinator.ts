import type { BrowserWindow, Rectangle, Screen } from 'electron';
import { regionToClientRect } from '../shared/region';
import { CaptureHealth } from './capture-health';
import {
  type CaptureTarget,
  type ControlState,
  attachedWindow,
  captureFrameReported,
  captureStarting,
  runtimeError,
  savedGameTarget,
  targetResolved,
  targetUnavailable
} from './control-state';
import { resolveGameWindow, type GameWindowCatalog, type TargetResolution } from './game-target';
import { physicalClientRectToDip } from './geometry';
import { TargetCaptureUnavailable, type CapturedFrame, type FrameSource, type FrameSourceEvent, type WindowMetadataSource, type WindowMetadata } from './native-capture-client';

const USABLE_FRAME_DEADLINE_MS = 5000;
// Listing every top-level window costs more than querying one handle, so a closed game is polled less often.
const RECONNECT_INTERVAL_MS = 1000;
const AMBIGUOUS_TARGET_REASON = 'choose which game window to capture';

/**
 * How a waiting target can recover: poll the same window until it is capturable again, search for
 * the saved game after its window closed, or wait for the user to pick between matching windows.
 */
type TargetRecovery = 'poll-window' | 'find-game' | 'choose-window';
type GeometryRefresh = 'ready' | 'closed' | 'failed';

export type CaptureWorkerReport = { captureGeneration?: number } & (
  | ({ kind: 'frame'; blank: boolean } & import('./control-state').CaptureFrameReport)
  | { kind: 'ended' | 'muted'; timestamp: number }
  | { kind: 'error'; message: string; timestamp: number });

interface CaptureCoordinatorDependencies {
  frameSource: FrameSource;
  overlayWindow: Pick<BrowserWindow, 'hide' | 'showInactive' | 'isVisible' | 'setBounds'>;
  metadataClient: Pick<WindowMetadataSource, 'query'>;
  catalog: GameWindowCatalog;
  screen: Pick<Screen, 'screenToDipPoint'>;
  getState(): ControlState;
  updateState(updater: (state: ControlState) => ControlState): void;
  onGeometryChanged?: () => void;
}

export class CaptureCoordinator {
  private readonly frameSource: FrameSource;
  private readonly overlayWindow: CaptureCoordinatorDependencies['overlayWindow'];
  private readonly metadataClient: CaptureCoordinatorDependencies['metadataClient'];
  private readonly catalog: GameWindowCatalog;
  private readonly screen: CaptureCoordinatorDependencies['screen'];
  private readonly getState: () => ControlState;
  private readonly updateState: (updater: (state: ControlState) => ControlState) => void;
  private readonly onGeometryChanged: () => void;
  private readonly health = new CaptureHealth();
  private metadataTimer: NodeJS.Timeout | null = null;
  private usableFrameDeadline: NodeJS.Timeout | null = null;
  private generation = 0;
  private metadataQueryGeneration: number | null = null;
  private active = false;
  private outputClearGeneration = 0;
  private frameTimer: NodeJS.Timeout | null = null;
  private frameQueryGeneration: number | null = null;
  private sessionEpoch = 0;
  private deviceReady = false;
  private lastSequence = 0;
  private lastQpc = 0;
  private minimumFrameQpc = 0;
  private frameCount = 0;
  private startedAt = 0;
  private latestFrame: CapturedFrame | null = null;
  private readonly unsubscribe: () => void;
  private overlayReady = false;
  private mode: 'one-shot' | 'continuous' = 'continuous';
  private lastMetadata: WindowMetadata | null = null;
  private lastDipBounds: Rectangle | null = null;

  constructor(dependencies: CaptureCoordinatorDependencies) {
    this.frameSource = dependencies.frameSource;
    this.overlayWindow = dependencies.overlayWindow;
    this.metadataClient = dependencies.metadataClient;
    this.catalog = dependencies.catalog;
    this.screen = dependencies.screen;
    this.getState = dependencies.getState;
    this.updateState = dependencies.updateState;
    this.onGeometryChanged = dependencies.onGeometryChanged ?? (() => {});
    this.unsubscribe = this.frameSource.subscribe((event) => this.handleSourceEvent(event));
  }

  async start(mode: 'one-shot' | 'continuous'): Promise<void> {
    await this.startCapture(mode, true);
  }

  private async startCapture(mode: 'one-shot' | 'continuous', mayReattach: boolean): Promise<void> {
    if (this.getState().gameTarget.kind === 'unselected') {
      this.updateState((state) => targetUnavailable(state, 'choose a game window'));
      return;
    }
    this.stop();
    this.mode = mode;
    const generation = this.generation;
    const attached = attachedWindow(this.getState());
    // Taken before any lookup so a Clear pressed while the saved game is located still suppresses this output.
    const outputClearGeneration = this.getState().clearGeneration;
    // An attached window starts synchronously so a replacement target cannot slip in first.
    const target = attached ?? await this.findSavedGame(generation);
    if (!target || generation !== this.generation) return;
    this.updateState(captureStarting);
    this.active = true;
    this.outputClearGeneration = outputClearGeneration;
    this.overlayReady = false;
    this.lastMetadata = null;
    this.lastDipBounds = null;
    this.overlayWindow.hide();
    this.health.reset();
    if (generation !== this.generation) return;
    const refresh = await this.refreshGeometry(target.nativeHandle, generation);
    // A handle kept from an earlier session may belong to a game that restarted since; look it up once.
    if (refresh === 'closed' && attached && mayReattach) return this.startCapture(mode, false);
    if (refresh !== 'ready') return;
    this.armFrameDeadline();
    this.metadataTimer = setInterval(() => void this.refreshGeometry(target.nativeHandle, generation), 200);
    this.startedAt = performance.now();
    this.frameCount = 0;
    this.lastSequence = 0;
    this.lastQpc = 0;
    this.sessionEpoch = 0;
    this.minimumFrameQpc = 0;
    this.deviceReady = true;
    try {
      const session = await this.frameSource.start(target, generation);
      if (generation !== this.generation) return;
      this.sessionEpoch = Math.max(this.sessionEpoch, session.sessionEpoch);
      this.frameTimer = setInterval(() => void this.grabFrame(generation), 250);
      await this.grabFrame(generation);
    } catch (error) {
      if (generation !== this.generation) return;
      if (error instanceof TargetCaptureUnavailable) this.waitForTarget(error.message);
      else this.fail(error);
    }
  }

  stop(clearOverlay = true): void {
    this.generation++;
    this.active = false;
    if (this.metadataTimer) clearInterval(this.metadataTimer);
    this.metadataTimer = null;
    if (this.usableFrameDeadline) clearTimeout(this.usableFrameDeadline);
    this.usableFrameDeadline = null;
    if (this.frameTimer) clearInterval(this.frameTimer);
    this.frameTimer = null;
    if (clearOverlay) this.latestFrame = null;
    const stoppedGeneration = this.generation;
    void this.frameSource.stopCapture().catch((error: unknown) => {
      if (stoppedGeneration === this.generation) this.updateState((state) => runtimeError(state, error instanceof Error ? error.message : 'native capture stop failed'));
    });
    if (clearOverlay) {
      this.overlayReady = false;
      this.overlayWindow.hide();
    } else if (this.overlayReady) {
      this.watchRetainedOverlay();
    }
    this.updateState((state) => ({ ...state, captureProbe: { ...state.captureProbe, active: false } }));
  }

  private async findSavedGame(generation: number): Promise<CaptureTarget | null> {
    const saved = savedGameTarget(this.getState().gameTarget);
    if (!saved) return null;
    let resolution: TargetResolution;
    try {
      resolution = resolveGameWindow(saved, await this.catalog.listTargets());
    } catch (error) {
      if (generation === this.generation) this.fail(error);
      return null;
    }
    if (generation !== this.generation) return null;
    if (resolution.kind === 'missing') {
      this.waitForTarget('game window not found', 'find-game');
      return null;
    }
    this.updateState((state) => targetResolved(state, resolution));
    if (resolution.kind === 'ambiguous') this.waitForTarget(AMBIGUOUS_TARGET_REASON, 'choose-window');
    return resolution.kind === 'unique' ? resolution.window : null;
  }

  private async refreshGeometry(nativeHandle: string, generation: number): Promise<GeometryRefresh> {
    if (generation !== this.generation) return 'failed';
    if (this.metadataQueryGeneration === generation) return 'ready';
    this.metadataQueryGeneration = generation;
    try {
      const metadata = await this.metadataClient.query(nativeHandle);
      if (generation !== this.generation) return 'failed';
      if (!metadata.capturable || !metadata.clientRect) {
        if (!metadata.exists) {
          this.waitForTarget('target window was closed', 'find-game');
          return 'closed';
        }
        this.waitForTarget(metadata.minimized ? 'target is minimized' : 'target is blank or uncapturable');
        return 'failed';
      }
      const { scope, region } = this.getState();
      const captureRect = scope === 'region' && region ? regionToClientRect(region, metadata.clientRect) : metadata.clientRect;
      const bounds = physicalClientRectToDip(captureRect, (point) => this.screen.screenToDipPoint(point));
      if (!this.lastMetadata || !sameClientGeometry(this.lastMetadata, metadata) ||
          this.lastDipBounds?.x !== bounds.x || this.lastDipBounds?.y !== bounds.y ||
          this.lastDipBounds?.width !== bounds.width || this.lastDipBounds?.height !== bounds.height) {
        this.overlayReady = false;
        this.latestFrame = null;
        this.overlayWindow.hide();
        if (this.active) this.armFrameDeadline();
      }
      this.lastMetadata = metadata;
      this.lastDipBounds = bounds;
      this.overlayWindow.setBounds(bounds, false);
      this.onGeometryChanged();
      return 'ready';
    } catch (error) {
      if (generation === this.generation) this.fail(error);
      return 'failed';
    } finally {
      if (this.metadataQueryGeneration === generation) this.metadataQueryGeneration = null;
    }
  }

  // A retained result (one-shot, or Auto turned off) is no longer refreshed, so hide it once the target changes.
  private watchRetainedOverlay(): void {
    const nativeHandle = attachedWindow(this.getState())?.nativeHandle;
    const retained = this.lastMetadata;
    if (!nativeHandle || !retained) return;
    const generation = this.generation;
    this.metadataTimer = setInterval(() => void this.checkRetainedOverlay(nativeHandle, retained, generation), 200);
  }

  private async checkRetainedOverlay(nativeHandle: string, retained: WindowMetadata, generation: number): Promise<void> {
    if (generation !== this.generation || this.metadataQueryGeneration === generation) return;
    this.metadataQueryGeneration = generation;
    try {
      const metadata = await this.metadataClient.query(nativeHandle);
      if (generation === this.generation && !sameClientGeometry(retained, metadata)) this.stop();
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    } finally {
      if (this.metadataQueryGeneration === generation) this.metadataQueryGeneration = null;
    }
  }

  private fail(error: unknown): void {
    this.stop();
    this.updateState((state) => runtimeError(state, error instanceof Error ? error.message : 'window metadata unavailable'));
  }

  private waitForTarget(reason: string, recovery: TargetRecovery = 'poll-window'): void {
    this.stop();
    if (recovery === 'find-game') this.updateState((state) => targetResolved(state, { kind: 'missing' }));
    this.updateState((state) => targetUnavailable(state, reason));
    if (recovery === 'choose-window' || this.mode !== 'continuous' || !this.getState().autoEnabled) return;
    const generation = this.generation;
    if (recovery === 'find-game') {
      this.metadataTimer = setInterval(() => void this.reconnect(generation), RECONNECT_INTERVAL_MS);
      return;
    }
    const target = attachedWindow(this.getState());
    if (target) this.metadataTimer = setInterval(() => void this.retryTarget(target.nativeHandle, generation), 200);
  }

  private async reconnect(generation: number): Promise<void> {
    if (generation !== this.generation || this.metadataQueryGeneration === generation) return;
    const saved = savedGameTarget(this.getState().gameTarget);
    if (!this.getState().autoEnabled || !saved) {
      this.stop();
      return;
    }
    this.metadataQueryGeneration = generation;
    let resolution: TargetResolution;
    try {
      resolution = resolveGameWindow(saved, await this.catalog.listTargets());
    } catch (error) {
      if (generation === this.generation) this.fail(error);
      return;
    } finally {
      if (this.metadataQueryGeneration === generation) this.metadataQueryGeneration = null;
    }
    if (generation !== this.generation || resolution.kind === 'missing') return;
    this.updateState((state) => targetResolved(state, resolution));
    if (resolution.kind === 'unique') await this.start('continuous');
    else this.waitForTarget(AMBIGUOUS_TARGET_REASON, 'choose-window');
  }

  private async retryTarget(nativeHandle: string, generation: number): Promise<void> {
    if (generation !== this.generation || this.metadataQueryGeneration === generation) return;
    if (!this.getState().autoEnabled) {
      this.stop();
      return;
    }
    this.metadataQueryGeneration = generation;
    try {
      const metadata = await this.metadataClient.query(nativeHandle);
      if (generation !== this.generation) return;
      if (!metadata.exists) {
        this.waitForTarget('target window was closed', 'find-game');
      } else if (metadata.capturable && metadata.clientRect) {
        await this.start('continuous');
      }
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    } finally {
      if (this.metadataQueryGeneration === generation) this.metadataQueryGeneration = null;
    }
  }

  private async grabFrame(generation: number): Promise<void> {
    if (!this.active || generation !== this.generation || this.frameQueryGeneration === generation) return;
    this.frameQueryGeneration = generation;
    const { scope, region } = this.getState();
    try {
      const frame = await this.frameSource.grab(scope === 'region' ? region : null);
      if (frame && generation === this.generation) this.handleFrame(frame);
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    } finally {
      if (this.frameQueryGeneration === generation) this.frameQueryGeneration = null;
    }
  }

  handleSourceEvent(event: FrameSourceEvent): void {
    if (event.kind === 'failure') { this.fail(event.error); return; }
    if (!this.active || event.captureGeneration !== this.generation || event.target !== attachedWindow(this.getState())?.nativeHandle || event.sessionEpoch < this.sessionEpoch) return;
    if (event.sessionEpoch > this.sessionEpoch) {
      this.sessionEpoch = event.sessionEpoch;
      this.lastSequence = 0;
      this.lastQpc = 0;
    }
    this.overlayReady = false;
    this.latestFrame = null;
    this.overlayWindow.hide();
    if (event.event === 'geometryChanged' || event.event === 'deviceRecovered') this.minimumFrameQpc = Math.max(this.minimumFrameQpc, event.qpcTimestamp100ns);
    if (event.event === 'deviceLost') this.deviceReady = false;
    if (event.event === 'deviceRecovered') this.deviceReady = true;
    if (event.event === 'geometryChanged' || event.event === 'deviceLost' || event.event === 'deviceRecovered') {
      this.armFrameDeadline();
      return;
    }
    this.waitForTarget(event.message || event.event, event.event === 'closed' ? 'find-game' : 'poll-window');
  }

  private armFrameDeadline(): void {
    if (this.usableFrameDeadline) clearTimeout(this.usableFrameDeadline);
    this.usableFrameDeadline = setTimeout(() => this.waitForTarget('no usable frames from target'), USABLE_FRAME_DEADLINE_MS);
  }

  handleFrame(frame: CapturedFrame): void {
    if (!this.active || !this.deviceReady || frame.captureGeneration !== this.generation || frame.target !== attachedWindow(this.getState())?.nativeHandle ||
        frame.sessionEpoch !== this.sessionEpoch || frame.sequence <= this.lastSequence || frame.qpcTimestamp100ns <= this.lastQpc || frame.qpcTimestamp100ns < this.minimumFrameQpc) return;
    const metadata = this.lastMetadata;
    const client = metadata?.clientRect;
    if (!client || !metadata || metadata.dpi !== frame.dpi || !sameRect(client, frame.clientRect)) return;
    const { scope, region } = this.getState();
    const crop = scope === 'region' && region ? regionToClientRect(region, client) : client;
    if (frame.cropOrigin.x !== crop.left - client.left || frame.cropOrigin.y !== crop.top - client.top ||
        frame.width !== crop.right - crop.left || frame.height !== crop.bottom - crop.top) return;
    this.lastSequence = frame.sequence;
    this.lastQpc = frame.qpcTimestamp100ns;
    let blank = true;
    for (let index = 0; index < frame.pixels.length; index += 4) {
      if (frame.pixels[index] || frame.pixels[index + 1] || frame.pixels[index + 2]) { blank = false; break; }
    }
    const assessment = this.health.assess({ ...frame, blank });
    if (!assessment.valid) { this.waitForTarget(assessment.reason); return; }
    if (blank) { this.overlayReady = false; this.overlayWindow.hide(); return; }
    this.latestFrame = frame;
    this.frameCount++;
    if (this.usableFrameDeadline) clearTimeout(this.usableFrameDeadline);
    this.usableFrameDeadline = null;
    if (this.mode === 'continuous') this.armFrameDeadline();
    this.overlayReady = this.getState().clearGeneration === this.outputClearGeneration;
    if (this.overlayReady && this.getState().overlayVisible && !this.overlayWindow.isVisible()) this.overlayWindow.showInactive();
    this.updateState((state) => captureFrameReported(state, {
      frameCount: this.frameCount, width: frame.width, height: frame.height, timestamp: frame.timestamp,
      firstFrameLatencyMs: this.frameCount === 1 ? performance.now() - this.startedAt : undefined
    }, this.mode));
    if (this.mode === 'one-shot') this.stop(false);
  }

  getLatestFrame(): CapturedFrame | null { return this.latestFrame; }

  dispose(): void { this.stop(); this.unsubscribe(); }

  setOverlayVisibility(visible: boolean): void {
    if (!visible) this.overlayWindow.hide();
    else if (this.overlayReady && this.getState().clearGeneration === this.outputClearGeneration) this.overlayWindow.showInactive();
  }

  getEvidence(): { metadata: WindowMetadata | null; overlayDipBounds: Rectangle | null } {
    return { metadata: this.lastMetadata, overlayDipBounds: this.lastDipBounds };
  }
}

function sameClientGeometry(previous: WindowMetadata, next: WindowMetadata): boolean {
  const a = previous.clientRect;
  const b = next.clientRect;
  return next.capturable && previous.dpi === next.dpi && a !== null && b !== null &&
    a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
}

function sameRect(a: NonNullable<WindowMetadata['clientRect']>, b: NonNullable<WindowMetadata['clientRect']>): boolean {
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
}
