import type { BrowserWindow, Rectangle, Screen } from 'electron';
import { regionToClientRect } from '../shared/region';
import { CaptureHealth } from './capture-health';
import {
  type CaptureFrameReport,
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
import { Win32MetadataClient, type WindowMetadata } from './win32-metadata-client';

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
  | ({ kind: 'frame'; blank: boolean } & CaptureFrameReport)
  | { kind: 'ended' | 'muted'; timestamp: number }
  | { kind: 'error'; message: string; timestamp: number });

interface CaptureCoordinatorDependencies {
  captureWindow: BrowserWindow;
  overlayWindow: BrowserWindow;
  metadataClient: Win32MetadataClient;
  catalog: GameWindowCatalog;
  screen: Screen;
  getState(): ControlState;
  updateState(updater: (state: ControlState) => ControlState): void;
  workerStopChannel: string;
  onGeometryChanged?: () => void;
}

export class CaptureCoordinator {
  private readonly captureWindow: BrowserWindow;
  private readonly overlayWindow: BrowserWindow;
  private readonly metadataClient: Win32MetadataClient;
  private readonly catalog: GameWindowCatalog;
  private readonly screen: Screen;
  private readonly getState: () => ControlState;
  private readonly updateState: (updater: (state: ControlState) => ControlState) => void;
  private readonly workerStopChannel: string;
  private readonly onGeometryChanged: () => void;
  private readonly health = new CaptureHealth();
  private metadataTimer: NodeJS.Timeout | null = null;
  private usableFrameDeadline: NodeJS.Timeout | null = null;
  private generation = 0;
  private metadataQueryGeneration: number | null = null;
  private active = false;
  private outputClearGeneration = 0;
  private geometryRefreshedAt = 0;
  private overlayReady = false;
  private mode: 'one-shot' | 'continuous' = 'continuous';
  private lastMetadata: WindowMetadata | null = null;
  private lastDipBounds: Rectangle | null = null;

  constructor(dependencies: CaptureCoordinatorDependencies) {
    this.captureWindow = dependencies.captureWindow;
    this.overlayWindow = dependencies.overlayWindow;
    this.metadataClient = dependencies.metadataClient;
    this.catalog = dependencies.catalog;
    this.screen = dependencies.screen;
    this.getState = dependencies.getState;
    this.updateState = dependencies.updateState;
    this.workerStopChannel = dependencies.workerStopChannel;
    this.onGeometryChanged = dependencies.onGeometryChanged ?? (() => {});
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
    // An attached window starts synchronously so Clear or a replacement target cannot slip in first.
    const target = attached ?? await this.findSavedGame(generation);
    if (!target || generation !== this.generation) return;
    this.updateState(captureStarting);
    this.active = true;
    this.outputClearGeneration = this.getState().clearGeneration;
    this.overlayReady = false;
    this.lastMetadata = null;
    this.lastDipBounds = null;
    this.overlayWindow.hide();
    this.health.reset();
    if (this.captureWindow.webContents.isLoading()) {
      await new Promise<void>((resolve) => this.captureWindow.webContents.once('did-finish-load', () => resolve()));
    }
    if (generation !== this.generation) return;
    const refresh = await this.refreshGeometry(target.nativeHandle, generation);
    // A handle kept from an earlier session may belong to a game that restarted since; look it up once.
    if (refresh === 'closed' && attached && mayReattach) return this.startCapture(mode, false);
    if (refresh !== 'ready') return;
    this.usableFrameDeadline = setTimeout(() => this.waitForTarget('no usable frames from target'), USABLE_FRAME_DEADLINE_MS);
    if (mode === 'continuous') this.metadataTimer = setInterval(() => void this.refreshGeometry(target.nativeHandle, generation), 200);
    try {
      const report = await this.captureWindow.webContents.executeJavaScript(
        `window.captureProbeRuntime.start(${JSON.stringify({ frameRate: 60, sourceId: target.id, captureGeneration: generation })})`
      ) as CaptureWorkerReport | undefined;
      if (generation === this.generation && report) this.handleWorkerReport(report);
    } catch (error) {
      if (generation === this.generation) this.waitForTarget(error instanceof Error ? error.message : 'capture worker failed to start');
    }
  }

  stop(clearOverlay = true): void {
    this.generation++;
    this.active = false;
    if (this.metadataTimer) clearInterval(this.metadataTimer);
    this.metadataTimer = null;
    if (this.usableFrameDeadline) clearTimeout(this.usableFrameDeadline);
    this.usableFrameDeadline = null;
    this.captureWindow.webContents.send(this.workerStopChannel);
    void this.captureWindow.webContents.executeJavaScript('window.captureProbeRuntime?.stop()').catch(() => {});
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
        this.geometryRefreshedAt = Date.now();
        this.overlayWindow.hide();
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
    } catch {
      // The game is already unavailable, so a failed listing is another miss; Auto keeps waiting.
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

  handleWorkerReport(report: CaptureWorkerReport): void {
    if (!this.active || report.captureGeneration !== this.generation) return;
    if (report.kind === 'frame') {
      const rect = this.lastMetadata?.clientRect;
      if (!rect || report.timestamp < this.geometryRefreshedAt) return;
      // Electron frames and Win32 client bounds can differ by one physical pixel.
      if (Math.abs(report.width - (rect.right - rect.left)) > 1 ||
          Math.abs(report.height - (rect.bottom - rect.top)) > 1) return;
      const health = this.health.assess(report);
      if (!health.valid) {
        this.waitForTarget(health.reason);
        return;
      }
      if (this.mode === 'one-shot' && report.blank) return;
      if (this.usableFrameDeadline) clearTimeout(this.usableFrameDeadline);
      this.usableFrameDeadline = null;
      this.overlayReady = this.getState().clearGeneration === this.outputClearGeneration;
      if (this.overlayReady && this.getState().overlayVisible && !this.overlayWindow.isVisible()) this.overlayWindow.showInactive();
      this.updateState((state) => captureFrameReported(state, report, this.mode));
      if (this.mode === 'one-shot') this.stop(false);
      return;
    }
    if (report.kind === 'ended' || report.kind === 'muted') {
      this.waitForTarget('capture stream stopped');
      return;
    }
    if (report.kind === 'error') {
      this.waitForTarget(report.message || 'capture failed');
    }
  }

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
