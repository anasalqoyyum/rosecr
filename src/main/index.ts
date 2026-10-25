import fs from 'node:fs';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen
} from 'electron';
import { CaptureCoordinator, type CaptureWorkerReport } from './capture-coordinator';
import {
  attachedWindow,
  createInitialState,
  reduceControlState,
  regionSaved,
  runtimeError,
  savedGameTarget,
  selectTarget,
  targetResolved,
  type CaptureTarget,
  type ControlState
} from './control-state';
import { nativeWindowsToCaptureTargets } from './capture-source';
import { resolveGameWindow } from './game-target';
import { physicalClientRectToDip } from './geometry';
import { RegionSelector } from './region-selector';
import { SettingsStore, type DurableSettings } from './settings-store';
import { ShortcutManager } from './shortcut-manager';
import { Win32MetadataClient } from './win32-metadata-client';
import { protectWindow, secureWebPreferences } from './window-utils';
import { IPC, parseControlCommand, type ControlCommand, type ShortcutAction } from '../shared/contracts';

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

let utilityWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let captureWindow: BrowserWindow | null = null;
let captureCoordinator: CaptureCoordinator | null = null;
let regionSelector: RegionSelector | null = null;
let durableSettings: DurableSettings;
let state: ControlState;
let settingsStore: SettingsStore;
let shortcutManager: ShortcutManager;
let metadataClient: Win32MetadataClient;
let quitting = false;
let smokeEvidenceWritten = false;

function broadcastState() {
  for (const window of [utilityWindow, settingsWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send(IPC.stateChanged, state);
  }
}

function updateState(updater: (current: ControlState) => ControlState): void {
  state = updater(state);
  syncDurableSettings();
  broadcastState();
  writeSmokeEvidence();
}

function writeSmokeEvidence(force = false): void {
  const evidencePath = process.env.ROSECR_CAPTURE_EVIDENCE;
  const continuousSmoke = process.env.ROSECR_CAPTURE_CONTINUOUS === '1';
  const probeFailed = state.gameTarget.kind !== 'unselected' && (state.status === 'waiting' || state.status === 'error');
  const probePassed = state.captureProbe.frameCount >= 1;
  if (
    !evidencePath ||
    (smokeEvidenceWritten && !force && !continuousSmoke) ||
    (!probePassed && !probeFailed) ||
    !captureCoordinator
  ) return;
  smokeEvidenceWritten = true;
  const ownWindowNames = BrowserWindow.getAllWindows().map((window) => window.getTitle());
  const evidence = {
    recordedAt: new Date().toISOString(),
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    platform: `${process.platform}-${process.arch}`,
    target: attachedWindow(state),
    outcome: probePassed ? 'frames-received' : 'failed',
    status: { state: state.status, message: state.statusMessage },
    runtime: state.captureProbe,
    geometry: captureCoordinator.getEvidence(),
    overlay: {
      focusable: overlayWindow?.isFocusable(),
      contentProtected: overlayWindow?.isContentProtected(),
      visible: overlayWindow?.isVisible(),
      ignoreMouseEventsConfigured: true
    },
    controller: {
      contentProtected: utilityWindow?.isContentProtected()
    },
    rosecrWindowNamesRejected: ownWindowNames
  };
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

// Every state change passes through here, so no failure path can drop the saved game or region.
function syncDurableSettings(): void {
  const next: DurableSettings = {
    ...durableSettings,
    direction: state.direction,
    scope: state.scope,
    overlayVisible: state.overlayVisible,
    target: savedGameTarget(state.gameTarget),
    region: state.region
  };
  if (JSON.stringify(next) === JSON.stringify(durableSettings)) return;
  settingsStore.save(next);
  durableSettings = next;
}

async function listCaptureTargets(): Promise<CaptureTarget[]> {
  const response = await metadataClient.list();
  return nativeWindowsToCaptureTargets(response.windows, process.pid);
}

async function listAndResolveTargets(): Promise<CaptureTarget[]> {
  const targets = await listCaptureTargets();
  const saved = state.gameTarget.kind === 'attached' ? null : savedGameTarget(state.gameTarget);
  if (saved) updateState((current) => targetResolved(current, resolveGameWindow(saved, targets)));
  return targets;
}

async function attachSavedTarget(): Promise<CaptureTarget> {
  if (state.gameTarget.kind !== 'attached') await listAndResolveTargets();
  const target = attachedWindow(state);
  if (target) return target;
  switch (state.gameTarget.kind) {
    case 'unselected': throw new Error('Choose a game window first.');
    case 'ambiguous': throw new Error('Choose which game window to use, then select the region.');
    case 'detached':
    case 'attached': throw new Error('Open the game window, then select the region.');
  }
}

async function selectRegion(): Promise<ControlState> {
  let target = await attachSavedTarget();
  let metadata = await metadataClient.query(target.nativeHandle);
  if (!metadata.exists) {
    // The saved handle may predate a game restart.
    updateState((current) => targetResolved(current, { kind: 'missing' }));
    target = await attachSavedTarget();
    metadata = await metadataClient.query(target.nativeHandle);
  }
  if (!metadata.capturable || !metadata.clientRect || !regionSelector) {
    throw new Error('Restore the game window, then select the region.');
  }
  const bounds = physicalClientRectToDip(metadata.clientRect, (point) => screen.screenToDipPoint(point));
  const selection = await regionSelector.open({ clientBounds: bounds, savedRegion: state.region, covering: settingsWindow });
  if (selection.kind === 'cancelled') return state;
  updateState((current) => regionSaved(current, selection.region));
  overlayWindow?.hide();
  if (state.autoEnabled) await captureCoordinator?.start('continuous');
  return state;
}

function dispatchShortcut(action: ShortcutAction): void {
  const commands: Record<ShortcutAction, ControlCommand> = {
    play: { type: 'play' },
    auto: { type: 'set-auto', enabled: !state.autoEnabled },
    overlay: { type: 'set-overlay-visible', visible: !state.overlayVisible },
    clear: { type: 'clear-overlays' }
  };
  void dispatchCommand(commands[action]);
}

function registerShortcuts(): void {
  const shortcutConflicts = shortcutManager.register(durableSettings.shortcuts);
  updateState((current) => ({ ...current, shortcutConflicts }));
}

async function dispatchCommand(rawCommand: unknown): Promise<ControlState> {
  const command = parseControlCommand(rawCommand);
  state = reduceControlState(state, command);
  syncDurableSettings();
  broadcastState();

  switch (command.type) {
    case 'play':
      if (state.gameTarget.kind !== 'unselected') await captureCoordinator?.start(state.autoEnabled ? 'continuous' : 'one-shot');
      break;
    case 'set-auto':
      if (command.enabled && state.gameTarget.kind !== 'unselected') await captureCoordinator?.start('continuous');
      if (!command.enabled) captureCoordinator?.stop(false);
      break;
    case 'set-overlay-visible':
      captureCoordinator?.setOverlayVisibility(command.visible);
      break;
    case 'clear-overlays':
      overlayWindow?.hide();
      break;
    case 'set-direction':
    case 'set-scope':
      overlayWindow?.hide();
      if (state.autoEnabled && state.gameTarget.kind !== 'unselected') await captureCoordinator?.start('continuous');
      break;
    case 'open-settings':
      settingsWindow?.show();
      settingsWindow?.focus();
      break;
    case 'set-shortcut':
      durableSettings.shortcuts[command.action] = command.accelerator;
      settingsStore.save(durableSettings);
      registerShortcuts();
      break;
  }

  broadcastState();
  return state;
}

async function selectCaptureTarget(sourceId: unknown): Promise<ControlState> {
  if (typeof sourceId !== 'string') throw new TypeError('Capture source id must be a string.');
  const targets = await listCaptureTargets();
  const target = targets.find((candidate) => candidate.id === sourceId);
  if (!target) throw new Error('The selected window is no longer available or belongs to Rosecr.');
  captureCoordinator?.stop();
  updateState((current) => selectTarget(current, target));
  if (state.autoEnabled) await captureCoordinator?.start('continuous');
  return state;
}

function createWindows(): void {
  const controllerPreload = path.join(__dirname, '..', 'preload', 'controller-preload.js');
  utilityWindow = new BrowserWindow({
    width: 1060,
    height: 58,
    minWidth: 860,
    useContentSize: true,
    frame: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    backgroundColor: '#0f0f0f',
    title: 'Rosecr',
    webPreferences: secureWebPreferences(controllerPreload)
  });
  utilityWindow.on('closed', () => {
    utilityWindow = null;
    app.quit();
  });
  protectWindow(utilityWindow);
  utilityWindow.loadFile(path.join(__dirname, '..', 'renderer', 'controller.html'));

  settingsWindow = new BrowserWindow({
    width: 860,
    height: 640,
    minWidth: 760,
    minHeight: 560,
    show: false,
    backgroundColor: '#0f0f0f',
    title: 'Rosecr settings',
    webPreferences: secureWebPreferences(controllerPreload)
  });
  protectWindow(settingsWindow);
  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
  settingsWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      settingsWindow?.hide();
    }
  });

  overlayWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,
    title: 'Rosecr overlay',
    webPreferences: secureWebPreferences(path.join(__dirname, '..', 'preload', 'overlay-preload.js'))
  });
  overlayWindow.setIgnoreMouseEvents(true);
  overlayWindow.setFocusable(false);
  protectWindow(overlayWindow);
  overlayWindow.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));

  captureWindow = new BrowserWindow({
    show: false,
    webPreferences: secureWebPreferences(path.join(__dirname, '..', 'preload', 'capture-preload.js'), {
      partition: 'rosecr-capture',
      backgroundThrottling: false
    })
  });
  protectWindow(captureWindow);
  captureWindow.loadFile(path.join(__dirname, '..', 'renderer', 'capture-worker.html'));

  regionSelector = new RegionSelector(() => {
    const selectorWindow = new BrowserWindow({
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      hasShadow: false,
      alwaysOnTop: true,
      title: 'Rosecr region selector',
      webPreferences: secureWebPreferences(path.join(__dirname, '..', 'preload', 'region-selector-preload.js'))
    });
    protectWindow(selectorWindow);
    selectorWindow.loadFile(path.join(__dirname, '..', 'renderer', 'region-selector.html'));
    return selectorWindow;
  });

  captureCoordinator = new CaptureCoordinator({
    captureWindow,
    overlayWindow,
    metadataClient,
    catalog: { listTargets: listCaptureTargets },
    screen,
    getState: () => state,
    updateState,
    workerStopChannel: IPC.captureWorkerStop,
    onGeometryChanged: () => writeSmokeEvidence(true)
  });
}

function registerIpc(): void {
  ipcMain.handle(IPC.getState, () => state);
  ipcMain.handle(IPC.command, (_event, command) => dispatchCommand(command));
  ipcMain.handle(IPC.listTargets, () => listAndResolveTargets());
  ipcMain.handle(IPC.selectTarget, (_event, sourceId) => selectCaptureTarget(sourceId));
  ipcMain.handle(IPC.selectRegion, () => selectRegion());
  ipcMain.handle(IPC.regionSelectorInit, (event) => regionSelector?.initFor(event.sender) ?? null);
  ipcMain.on(IPC.regionSelectorFinish, (event, selection) => regionSelector?.finish(event.sender, selection));
  ipcMain.handle(IPC.startCaptureProbe, async () => {
    if (state.gameTarget.kind === 'unselected') throw new Error('Choose a target before starting the capture probe.');
    state = { ...state, status: 'running', statusMessage: 'Capture probe starting' };
    broadcastState();
    await captureCoordinator?.start('continuous');
    return state;
  });
  ipcMain.handle(IPC.stopCaptureProbe, () => {
    captureCoordinator?.stop();
    updateState((current) => reduceControlState(current, { type: 'set-auto', enabled: false }));
    return state;
  });
  ipcMain.on(IPC.captureWorkerReport, (event, report) => {
    if (event.sender !== captureWindow?.webContents) return;
    captureCoordinator?.handleWorkerReport(report as CaptureWorkerReport);
  });
}

async function runSmokeProbe(): Promise<void> {
  const targetTitle = process.env.ROSECR_CAPTURE_TARGET;
  if (!targetTitle) return;
  const evidencePath = process.env.ROSECR_CAPTURE_EVIDENCE;
  try {
    const writeStage = (stage: string): void => {
      if (evidencePath) fs.writeFileSync(evidencePath, `${JSON.stringify({ stage }, null, 2)}\n`);
    };
    if (evidencePath) {
      fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
      writeStage('enumerating-targets');
    }
    const targets = await listCaptureTargets();
    writeStage('targets-enumerated');
    const target = targets.find((candidate) => candidate.name.toLowerCase().includes(targetTitle.toLowerCase()));
    if (!target) throw new Error(`No capture target matched '${targetTitle}'.`);
    await selectCaptureTarget(target.id);
    writeStage('target-selected');
    const continuous = process.env.ROSECR_CAPTURE_CONTINUOUS === '1';
    state = {
      ...state,
      autoEnabled: continuous,
      status: 'running',
      statusMessage: 'Automated capture probe starting'
    };
    broadcastState();
    writeStage('capture-starting');
    setTimeout(() => {
      if (state.captureProbe.frameCount === 0 && attachedWindow(state)?.id === target.id) {
        captureCoordinator?.stop();
        updateState((current) => runtimeError(current, 'capture probe timed out before the first frame'));
      }
    }, 10000);
    await captureCoordinator?.start(continuous ? 'continuous' : 'one-shot');
  } catch (error) {
    if (evidencePath) {
      fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
      fs.writeFileSync(evidencePath, `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`);
    }
  }
}

if (hasSingleInstanceLock) {
  app.whenReady().then(() => {
    settingsStore = new SettingsStore(app.getPath('userData'));
    metadataClient = new Win32MetadataClient(app.getAppPath());
    durableSettings = settingsStore.load();
    state = createInitialState(durableSettings);
    createWindows();
    shortcutManager = new ShortcutManager(globalShortcut, dispatchShortcut);
    registerIpc();
    registerShortcuts();
    if (process.env.ROSECR_CAPTURE_TARGET) setTimeout(() => void runSmokeProbe(), 2000);
  });

  app.on('second-instance', () => {
    utilityWindow?.show();
    utilityWindow?.focus();
  });

  app.on('before-quit', () => {
    quitting = true;
    regionSelector?.cancel();
    captureCoordinator?.stop();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    metadataClient?.stop();
  });

  app.on('window-all-closed', () => app.quit());
}
