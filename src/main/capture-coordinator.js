const { CaptureHealth } = require('./capture-health');
const { physicalClientRectToDip } = require('./geometry');

class CaptureCoordinator {
  /**
   * @param {{
   *  captureWindow: Electron.BrowserWindow,
   *  overlayWindow: Electron.BrowserWindow,
   *  metadataClient: import('./win32-metadata-client').Win32MetadataClient,
   *  screen: Electron.Screen,
   *  getState: () => import('./control-state').ControlState,
   *  updateState: (updater: (state: import('./control-state').ControlState) => import('./control-state').ControlState) => void,
   *  captureFrameReported: typeof import('./control-state').captureFrameReported,
   *  targetUnavailable: typeof import('./control-state').targetUnavailable,
   *  runtimeError: typeof import('./control-state').runtimeError,
   *  workerStartChannel: string,
   *  workerStopChannel: string,
   *  onGeometryChanged?: () => void
   * }} dependencies
   */
  constructor(dependencies) {
    this.captureWindow = dependencies.captureWindow;
    this.overlayWindow = dependencies.overlayWindow;
    this.metadataClient = dependencies.metadataClient;
    this.screen = dependencies.screen;
    this.getState = dependencies.getState;
    this.updateState = dependencies.updateState;
    this.captureFrameReported = dependencies.captureFrameReported;
    this.targetUnavailable = dependencies.targetUnavailable;
    this.runtimeError = dependencies.runtimeError;
    this.workerStartChannel = dependencies.workerStartChannel;
    this.workerStopChannel = dependencies.workerStopChannel;
    this.onGeometryChanged = dependencies.onGeometryChanged ?? (() => {});
    this.health = new CaptureHealth();
    this.metadataTimer = null;
    this.metadataQueryActive = false;
    this.mode = 'continuous';
    this.lastMetadata = null;
    this.lastDipBounds = null;
  }

  /** @param {'one-shot' | 'continuous'} mode */
  async start(mode) {
    const target = this.getState().selectedTarget;
    if (!target) {
      this.updateState((state) => this.targetUnavailable(state, 'choose a game window'));
      return;
    }
    this.stop(false);
    this.mode = mode;
    this.health.reset();
    if (this.captureWindow.webContents.isLoading()) {
      await new Promise((resolve) => this.captureWindow.webContents.once('did-finish-load', () => resolve(undefined)));
    }
    if (!(await this.refreshGeometry(target.nativeHandle))) return;
    try {
      const report = await this.captureWindow.webContents.executeJavaScript(
        `window.captureProbeRuntime.start(${JSON.stringify({ frameRate: 60, sourceId: target.id })})`
      );
      if (report) this.handleWorkerReport(report);
    } catch (error) {
      this.updateState((state) =>
        this.runtimeError(state, error instanceof Error ? error.message : 'capture worker failed to start')
      );
      return;
    }
    if (mode === 'continuous') this.metadataTimer = setInterval(() => this.refreshGeometry(target.nativeHandle), 200);
  }

  /** @param {boolean} clearOverlay */
  stop(clearOverlay = true) {
    if (this.metadataTimer) clearInterval(this.metadataTimer);
    this.metadataTimer = null;
    this.captureWindow.webContents.send(this.workerStopChannel);
    void this.captureWindow.webContents.executeJavaScript('window.captureProbeRuntime?.stop()').catch(() => {});
    if (clearOverlay) this.overlayWindow.hide();
  }

  /** @param {string} nativeHandle */
  async refreshGeometry(nativeHandle) {
    if (this.metadataQueryActive) return true;
    this.metadataQueryActive = true;
    try {
      const metadata = /** @type {any} */ (await this.metadataClient.query(nativeHandle));
      this.lastMetadata = metadata;
      if (!metadata.capturable || !metadata.clientRect) {
        const reason = metadata.minimized
          ? 'target is minimized'
          : metadata.exists
            ? 'target is blank or uncapturable'
            : 'target window was closed';
        this.stop();
        this.updateState((state) => this.targetUnavailable(state, reason));
        return false;
      }
      const bounds = physicalClientRectToDip(metadata.clientRect, (point) => this.screen.screenToDipPoint(point));
      this.lastDipBounds = bounds;
      this.overlayWindow.setBounds(bounds, false);
      this.onGeometryChanged();
      return true;
    } catch (error) {
      this.stop();
      this.updateState((state) =>
        this.runtimeError(state, error instanceof Error ? error.message : 'window metadata unavailable')
      );
      return false;
    } finally {
      this.metadataQueryActive = false;
    }
  }

  /** @param {any} report */
  handleWorkerReport(report) {
    if (report.kind === 'frame') {
      const health = this.health.assess(report);
      if (!health.valid) {
        this.stop();
        this.updateState((state) => this.targetUnavailable(state, health.reason ?? 'capture frame rejected'));
        return;
      }
      if (this.getState().overlayVisible && !this.overlayWindow.isVisible()) this.overlayWindow.showInactive();
      this.updateState((state) => this.captureFrameReported(state, report));
      if (this.mode === 'one-shot') this.stop(false);
      return;
    }
    if (report.kind === 'ended' || report.kind === 'muted') {
      this.stop();
      this.updateState((state) => this.targetUnavailable(state, 'capture stream stopped'));
      return;
    }
    if (report.kind === 'error') {
      this.stop();
      this.updateState((state) => this.targetUnavailable(state, report.message || 'capture failed'));
    }
  }

  /** @param {boolean} visible */
  setOverlayVisibility(visible) {
    if (!visible) this.overlayWindow.hide();
    else if (this.getState().captureProbe.frameCount > 0) this.overlayWindow.showInactive();
  }

  getEvidence() {
    return { metadata: this.lastMetadata, overlayDipBounds: this.lastDipBounds };
  }
}

module.exports = { CaptureCoordinator };
