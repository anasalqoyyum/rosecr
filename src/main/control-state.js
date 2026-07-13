/**
 * @typedef {ReturnType<import('./settings-store').SettingsStore['load']>} DurableSettings
 * @typedef {{ id: string, name: string, nativeHandle: string } | null} SelectedTarget
 * @typedef {{
 *   status: import('../shared/contracts').ControlStatus,
 *   statusMessage: string,
 *   autoEnabled: boolean,
 *   overlayVisible: boolean,
 *   direction: import('../shared/contracts').Direction,
 *   scope: import('../shared/contracts').CaptureScope,
 *   selectedTarget: SelectedTarget,
 *   clearGeneration: number,
 *   refreshGeneration: number,
 *   shortcuts: Record<import('../shared/contracts').ShortcutAction, string | null>,
 *   shortcutConflicts: Partial<Record<import('../shared/contracts').ShortcutAction, string>>,
 *   captureProbe: { active: boolean, frameCount: number, firstFrameLatencyMs: number | null, frameSize: { width: number, height: number } | null, lastFrameAt: number | null }
 * }} ControlState
 */

/** @param {DurableSettings} settings @returns {ControlState} */
function createInitialState(settings) {
  return {
    status: 'idle',
    statusMessage: 'Idle',
    autoEnabled: false,
    overlayVisible: settings.overlayVisible,
    direction: settings.direction,
    scope: settings.scope,
    selectedTarget: null,
    clearGeneration: 0,
    refreshGeneration: 0,
    shortcuts: { ...settings.shortcuts },
    shortcutConflicts: {},
    captureProbe: {
      active: false,
      frameCount: 0,
      firstFrameLatencyMs: null,
      frameSize: null,
      lastFrameAt: null
    }
  };
}

/** @param {ControlState} state @param {import('../shared/contracts').ControlCommand} command @returns {ControlState} */
function reduceControlState(state, command) {
  switch (command.type) {
    case 'play':
      if (!state.selectedTarget) {
        return { ...state, status: 'waiting', statusMessage: 'Waiting: choose a game window' };
      }
      if (state.autoEnabled) {
        return {
          ...state,
          status: 'running',
          statusMessage: 'Watching · refresh requested',
          refreshGeneration: state.refreshGeneration + 1
        };
      }
      return {
        ...state,
        status: 'running',
        statusMessage: 'One-shot capture running',
        refreshGeneration: state.refreshGeneration + 1
      };
    case 'set-auto':
      if (!command.enabled) {
        return { ...state, autoEnabled: false, status: 'idle', statusMessage: 'Idle' };
      }
      if (!state.selectedTarget) {
        return {
          ...state,
          autoEnabled: true,
          status: 'waiting',
          statusMessage: 'Waiting: choose a game window'
        };
      }
      return { ...state, autoEnabled: true, status: 'running', statusMessage: 'Watching' };
    case 'set-overlay-visible':
      return { ...state, overlayVisible: command.visible };
    case 'clear-overlays':
      return { ...state, clearGeneration: state.clearGeneration + 1 };
    case 'set-direction':
      return {
        ...state,
        direction: command.direction,
        clearGeneration: state.clearGeneration + 1,
        refreshGeneration: state.refreshGeneration + 1
      };
    case 'set-scope':
      return {
        ...state,
        scope: command.scope,
        clearGeneration: state.clearGeneration + 1,
        refreshGeneration: state.refreshGeneration + 1
      };
    case 'open-settings':
      return state;
    case 'set-shortcut':
      return { ...state, shortcuts: { ...state.shortcuts, [command.action]: command.accelerator } };
  }
}

/** @param {ControlState} state @param {NonNullable<SelectedTarget>} target @returns {ControlState} */
function selectTarget(state, target) {
  /** @type {import('../shared/contracts').ControlStatus} */
  const status = state.autoEnabled ? 'running' : 'idle';
  return {
    ...state,
    selectedTarget: target,
    status,
    statusMessage: state.autoEnabled ? 'Watching' : 'Idle',
    clearGeneration: state.clearGeneration + 1
  };
}

/** @param {ControlState} state @param {string} reason @returns {ControlState} */
function targetUnavailable(state, reason) {
  return {
    ...state,
    status: 'waiting',
    statusMessage: `Waiting: ${reason}`,
    captureProbe: { ...state.captureProbe, active: false },
    clearGeneration: state.clearGeneration + 1
  };
}

/** @param {ControlState} state @param {string} reason @returns {ControlState} */
function runtimeError(state, reason) {
  return {
    ...state,
    status: 'error',
    statusMessage: `Error: ${reason}`,
    autoEnabled: false,
    captureProbe: { ...state.captureProbe, active: false },
    clearGeneration: state.clearGeneration + 1
  };
}

/** @param {ControlState} state @param {{ frameCount: number, firstFrameLatencyMs?: number, width: number, height: number, timestamp: number }} report @returns {ControlState} */
function captureFrameReported(state, report) {
  const oneShotFinished = !state.autoEnabled && report.frameCount >= 1;
  return {
    ...state,
    status: oneShotFinished ? 'idle' : 'running',
    statusMessage: oneShotFinished ? 'Idle · capture probe passed' : 'Watching · capture frames received',
    captureProbe: {
      active: !oneShotFinished,
      frameCount: report.frameCount,
      firstFrameLatencyMs: state.captureProbe.firstFrameLatencyMs ?? report.firstFrameLatencyMs ?? null,
      frameSize: { width: report.width, height: report.height },
      lastFrameAt: report.timestamp
    }
  };
}

module.exports = {
  captureFrameReported,
  createInitialState,
  reduceControlState,
  runtimeError,
  selectTarget,
  targetUnavailable
};
