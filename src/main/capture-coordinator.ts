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

export type CaptureWorkerReport =
  | ({ kind: 'frame'; blank: boolean } & CaptureFrameReport)
  | { kind: 'ended' | 'muted'; timestamp: number }
  | { kind: 'error'; message: string; timestamp: number };

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
  private metadataQueryActive = false;
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
    this.mode = mode;
    this.health.reset();
    if (this.captureWindow.webContents.isLoading()) {
      await new Promise<void>((resolve) => this.captureWindow.webContents.once('did-finish-load', () => resolve()));
    }
    if (!(await this.refreshGeometry(target.nativeHandle))) return;
    try {
      const report = await this.captureWindow.webContents.executeJavaScript(
        `window.captureProbeRuntime.start(${JSON.stringify({ frameRate: 60, sourceId: target.id })})`
      ) as CaptureWorkerReport | undefined;
      if (report) this.handleWorkerReport(report);
    } catch (error) {
      this.updateState((state) => runtimeError(state, error instanceof Error ? error.message : 'capture worker failed to start'));
      return;
    }
    if (mode === 'continuous') this.metadataTimer = setInterval(() => void this.refreshGeometry(target.nativeHandle), 200);
  }

  stop(clearOverlay = true): void {
    if (this.metadataTimer) clearInterval(this.metadataTimer);
    this.metadataTimer = null;
    this.captureWindow.webContents.send(this.workerStopChannel);
    void this.captureWindow.webContents.executeJavaScript('window.captureProbeRuntime?.stop()').catch(() => {});
    if (clearOverlay) this.overlayWindow.hide();
  }

  private async refreshGeometry(nativeHandle: string): Promise<boolean> {
    if (this.metadataQueryActive) return true;
    this.metadataQueryActive = true;
    try {
      const metadata = await this.metadataClient.query(nativeHandle);
      this.lastMetadata = metadata;
      if (!metadata.capturable || !metadata.clientRect) {
        const reason = metadata.minimized ? 'target is minimized' : metadata.exists ? 'target is blank or uncapturable' : 'target window was closed';
        this.stop();
        this.updateState((state) => targetUnavailable(state, reason));
        return false;
      }
      const bounds = physicalClientRectToDip(metadata.clientRect, (point) => this.screen.screenToDipPoint(point));
      this.lastDipBounds = bounds;
      this.overlayWindow.setBounds(bounds, false);
      this.onGeometryChanged();
      return true;
    } catch (error) {
      this.stop();
      this.updateState((state) => runtimeError(state, error instanceof Error ? error.message : 'window metadata unavailable'));
      return false;
    } finally {
      this.metadataQueryActive = false;
    }
  }

  handleWorkerReport(report: CaptureWorkerReport): void {
    if (report.kind === 'frame') {
      const health = this.health.assess(report);
      if (!health.valid) {
        this.stop();
        this.updateState((state) => targetUnavailable(state, health.reason));
        return;
      }
      if (this.getState().overlayVisible && !this.overlayWindow.isVisible()) this.overlayWindow.showInactive();
      this.updateState((state) => captureFrameReported(state, report));
      if (this.mode === 'one-shot') this.stop(false);
      return;
    }
    if (report.kind === 'ended' || report.kind === 'muted') {
      this.stop();
      this.updateState((state) => targetUnavailable(state, 'capture stream stopped'));
      return;
    }
    if (report.kind === 'error') {
      this.stop();
      this.updateState((state) => targetUnavailable(state, report.message || 'capture failed'));
    }
  }

  setOverlayVisibility(visible: boolean): void {
    if (!visible) this.overlayWindow.hide();
    else if (this.getState().captureProbe.frameCount > 0) this.overlayWindow.showInactive();
  }

  getEvidence(): { metadata: WindowMetadata | null; overlayDipBounds: Rectangle | null } {
    return { metadata: this.lastMetadata, overlayDipBounds: this.lastDipBounds };
  }
}
