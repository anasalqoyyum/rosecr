import type { BrowserWindow, Rectangle, Screen } from 'electron';
import { CaptureHealth } from './capture-health';
import {
  type CaptureFrameReport,
  type ControlState,
  captureFrameReported,
  runtimeError,
  targetUnavailable
} from './control-state';
import { physicalClientRectToDip } from './geometry';
import { Win32MetadataClient, type WindowMetadata } from './win32-metadata-client';

export type CaptureWorkerReport = { captureGeneration?: number } & (
  | ({ kind: 'frame'; blank: boolean } & CaptureFrameReport)
  | { kind: 'ended' | 'muted'; timestamp: number }
  | { kind: 'error'; message: string; timestamp: number });

interface CaptureCoordinatorDependencies {
  captureWindow: BrowserWindow;
  overlayWindow: BrowserWindow;
  metadataClient: Win32MetadataClient;
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
  private readonly screen: Screen;
  private readonly getState: () => ControlState;
  private readonly updateState: (updater: (state: ControlState) => ControlState) => void;
  private readonly workerStopChannel: string;
  private readonly onGeometryChanged: () => void;
  private readonly health = new CaptureHealth();
  private metadataTimer: NodeJS.Timeout | null = null;
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
    this.screen = dependencies.screen;
    this.getState = dependencies.getState;
    this.updateState = dependencies.updateState;
    this.workerStopChannel = dependencies.workerStopChannel;
    this.onGeometryChanged = dependencies.onGeometryChanged ?? (() => {});
  }

  async start(mode: 'one-shot' | 'continuous'): Promise<void> {
    const target = this.getState().selectedTarget;
    if (!target) {
      this.updateState((state) => targetUnavailable(state, 'choose a game window'));
      return;
    }
    this.stop(false);
    const generation = this.generation;
    this.active = true;
    this.outputClearGeneration = this.getState().clearGeneration;
    this.overlayReady = false;
    this.lastMetadata = null;
    this.lastDipBounds = null;
    this.overlayWindow.hide();
    this.mode = mode;
    this.health.reset();
    if (this.captureWindow.webContents.isLoading()) {
      await new Promise<void>((resolve) => this.captureWindow.webContents.once('did-finish-load', () => resolve()));
    }
    if (generation !== this.generation || !(await this.refreshGeometry(target.nativeHandle, generation))) return;
    try {
      const report = await this.captureWindow.webContents.executeJavaScript(
        `window.captureProbeRuntime.start(${JSON.stringify({ frameRate: 60, sourceId: target.id, captureGeneration: generation })})`
      ) as CaptureWorkerReport | undefined;
      if (generation !== this.generation) return;
      if (report) this.handleWorkerReport(report);
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      this.updateState((state) => runtimeError(state, error instanceof Error ? error.message : 'capture worker failed to start'));
      return;
    }
    if (generation === this.generation && mode === 'continuous') this.metadataTimer = setInterval(() => void this.refreshGeometry(target.nativeHandle, generation), 200);
  }

  stop(clearOverlay = true): void {
    this.generation++;
    this.active = false;
    if (this.metadataTimer) clearInterval(this.metadataTimer);
    this.metadataTimer = null;
    this.captureWindow.webContents.send(this.workerStopChannel);
    void this.captureWindow.webContents.executeJavaScript('window.captureProbeRuntime?.stop()').catch(() => {});
    if (clearOverlay) {
      this.overlayReady = false;
      this.overlayWindow.hide();
    }
    this.updateState((state) => ({ ...state, captureProbe: { ...state.captureProbe, active: false } }));
  }

  private async refreshGeometry(nativeHandle: string, generation: number): Promise<boolean> {
    if (generation !== this.generation) return false;
    if (this.metadataQueryGeneration === generation) return true;
    this.metadataQueryGeneration = generation;
    try {
      const metadata = await this.metadataClient.query(nativeHandle);
      if (generation !== this.generation) return false;
      if (!metadata.capturable || !metadata.clientRect) {
        const reason = metadata.minimized ? 'target is minimized' : metadata.exists ? 'target is blank or uncapturable' : 'target window was closed';
        this.waitForTarget(reason, metadata.exists);
        return false;
      }
      const bounds = physicalClientRectToDip(metadata.clientRect, (point) => this.screen.screenToDipPoint(point));
      const previous = this.lastMetadata;
      if (!previous || previous.dpi !== metadata.dpi ||
          previous.clientRect?.left !== metadata.clientRect.left ||
          previous.clientRect?.top !== metadata.clientRect.top ||
          previous.clientRect?.right !== metadata.clientRect.right ||
          previous.clientRect?.bottom !== metadata.clientRect.bottom ||
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
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      this.stop();
      this.updateState((state) => runtimeError(state, error instanceof Error ? error.message : 'window metadata unavailable'));
      return false;
    } finally {
      if (this.metadataQueryGeneration === generation) this.metadataQueryGeneration = null;
    }
  }

  private waitForTarget(reason: string, targetExists = true): void {
    this.stop();
    this.updateState((state) => targetUnavailable(state, reason));
    const target = this.getState().selectedTarget;
    if (!targetExists || !target || this.mode !== 'continuous' || !this.getState().autoEnabled) return;
    const generation = this.generation;
    this.metadataTimer = setInterval(() => void this.retryTarget(target.nativeHandle, generation), 200);
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
        this.waitForTarget('target window was closed', false);
      } else if (metadata.capturable && metadata.clientRect) {
        await this.start('continuous');
      }
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      this.updateState((state) => runtimeError(state, error instanceof Error ? error.message : 'window metadata unavailable'));
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
