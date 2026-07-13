const path = require('node:path');
const fs = require('node:fs');
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen
} = require('electron');
const { CaptureCoordinator } = require('./capture-coordinator');
const {
  captureFrameReported,
  createInitialState,
  reduceControlState,
  runtimeError,
  selectTarget,
  targetUnavailable
} = require('./control-state');
const { nativeWindowsToCaptureTargets } = require('./capture-source');
const { SettingsStore } = require('./settings-store');
const { ShortcutManager } = require('./shortcut-manager');
const { Win32MetadataClient } = require('./win32-metadata-client');
const { protectWindow, secureWebPreferences } = require('./window-utils');
const { IPC, parseControlCommand } = require('../shared/contracts');

if (!app.requestSingleInstanceLock()) app.quit();

/** @type {Electron.BrowserWindow | null} */
let utilityWindow = null;
/** @type {Electron.BrowserWindow | null} */
let settingsWindow = null;
/** @type {Electron.BrowserWindow | null} */
let overlayWindow = null;
/** @type {Electron.BrowserWindow | null} */
let captureWindow = null;
/** @type {CaptureCoordinator | null} */
let captureCoordinator = null;
/** @type {ReturnType<SettingsStore['load']>} */
let durableSettings;
/** @type {ReturnType<typeof createInitialState>} */
let state;
/** @type {SettingsStore} */
let settingsStore;
/** @type {ShortcutManager} */
let shortcutManager;
/** @type {Win32MetadataClient} */
let metadataClient;
let quitting = false;
let smokeEvidenceWritten = false;

function broadcastState() {
  for (const window of [utilityWindow, settingsWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send(IPC.stateChanged, state);
  }
}

/** @param {(current: typeof state) => typeof state} updater */
function updateState(updater) {
  state = updater(state);
  broadcastState();
  writeSmokeEvidence();
}

/** @param {boolean} [force] */
function writeSmokeEvidence(force = false) {
  const evidencePath = process.env.ROSECR_CAPTURE_EVIDENCE;
  const continuousSmoke = process.env.ROSECR_CAPTURE_CONTINUOUS === '1';
  const probeFailed = state.selectedTarget && (state.status === 'waiting' || state.status === 'error');
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
    target: state.selectedTarget,
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

function persistDurableState() {
  durableSettings = {
    ...durableSettings,
    direction: state.direction,
    scope: state.scope,
    overlayVisible: state.overlayVisible
  };
  settingsStore.save(durableSettings);
}

async function listCaptureTargets() {
  const response = /** @type {any} */ (await metadataClient.list());
  const windows = /** @type {{ handle: string, title: string, processId: number }[]} */ (response.windows);
  return nativeWindowsToCaptureTargets(windows, process.pid);
}

/** @param {import('../shared/contracts').ShortcutAction} action */
function dispatchShortcut(action) {
  const commands = {
    play: { type: 'play' },
    auto: { type: 'set-auto', enabled: !state.autoEnabled },
    overlay: { type: 'set-overlay-visible', visible: !state.overlayVisible },
    clear: { type: 'clear-overlays' }
  };
  void dispatchCommand(commands[action]);
}

function registerShortcuts() {
  const shortcutConflicts = shortcutManager.register(durableSettings.shortcuts);
  updateState((current) => ({ ...current, shortcutConflicts }));
}

/** @param {unknown} rawCommand */
async function dispatchCommand(rawCommand) {
  const command = parseControlCommand(rawCommand);
  state = reduceControlState(state, command);

  switch (command.type) {
    case 'play':
      if (state.selectedTarget) await captureCoordinator?.start(state.autoEnabled ? 'continuous' : 'one-shot');
      break;
    case 'set-auto':
      if (command.enabled && state.selectedTarget) await captureCoordinator?.start('continuous');
      if (!command.enabled) captureCoordinator?.stop(false);
      break;
    case 'set-overlay-visible':
      persistDurableState();
      captureCoordinator?.setOverlayVisibility(command.visible);
      break;
    case 'clear-overlays':
      overlayWindow?.hide();
      break;
    case 'set-direction':
    case 'set-scope':
      persistDurableState();
      overlayWindow?.hide();
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

/** @param {unknown} sourceId */
async function selectCaptureTarget(sourceId) {
  if (typeof sourceId !== 'string') throw new TypeError('Capture source id must be a string.');
  const targets = await listCaptureTargets();
  const target = targets.find((candidate) => candidate.id === sourceId);
  if (!target) throw new Error('The selected window is no longer available or belongs to Rosecr.');
  updateState((current) => selectTarget(current, target));
  return state;
}

function createWindows() {
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

  captureCoordinator = new CaptureCoordinator({
    captureWindow,
    overlayWindow,
    metadataClient,
    screen,
    getState: () => state,
    updateState,
    captureFrameReported,
    targetUnavailable,
    runtimeError,
    workerStartChannel: IPC.captureWorkerStart,
    workerStopChannel: IPC.captureWorkerStop,
    onGeometryChanged: () => writeSmokeEvidence(true)
  });
}

function registerIpc() {
  ipcMain.handle(IPC.getState, () => state);
  ipcMain.handle(IPC.command, (_event, command) => dispatchCommand(command));
  ipcMain.handle(IPC.listTargets, () => listCaptureTargets());
  ipcMain.handle(IPC.selectTarget, (_event, sourceId) => selectCaptureTarget(sourceId));
  ipcMain.handle(IPC.startCaptureProbe, async () => {
    if (!state.selectedTarget) throw new Error('Choose a target before starting the capture probe.');
    state = { ...state, status: 'running', statusMessage: 'Capture probe starting' };
    broadcastState();
    await captureCoordinator?.start('continuous');
    return state;
  });
  ipcMain.handle(IPC.stopCaptureProbe, () => {
    captureCoordinator?.stop();
    updateState((current) => ({ ...current, status: 'idle', statusMessage: 'Idle' }));
    return state;
  });
  ipcMain.on(IPC.captureWorkerReport, (event, report) => {
    if (event.sender !== captureWindow?.webContents) return;
    captureCoordinator?.handleWorkerReport(report);
  });
}

async function runSmokeProbe() {
  const targetTitle = process.env.ROSECR_CAPTURE_TARGET;
  if (!targetTitle) return;
  const evidencePath = process.env.ROSECR_CAPTURE_EVIDENCE;
  try {
    /** @param {string} stage */
    const writeStage = (stage) => {
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
      if (state.captureProbe.frameCount === 0 && state.selectedTarget?.id === target.id) {
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
  captureCoordinator?.stop();
});

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('window-all-closed', () => app.quit());
