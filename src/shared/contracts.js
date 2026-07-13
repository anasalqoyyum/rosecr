/** @typedef {'ja-en' | 'en-ja'} Direction */
/** @typedef {'region' | 'window'} CaptureScope */
/** @typedef {'idle' | 'running' | 'waiting' | 'error'} ControlStatus */
/** @typedef {'play' | 'auto' | 'overlay' | 'clear'} ShortcutAction */

/** @type {readonly Direction[]} */
const DIRECTIONS = ['ja-en', 'en-ja'];
/** @type {readonly CaptureScope[]} */
const CAPTURE_SCOPES = ['region', 'window'];
/** @type {readonly ControlStatus[]} */
const CONTROL_STATUSES = ['idle', 'running', 'waiting', 'error'];
/** @type {readonly ShortcutAction[]} */
const SHORTCUT_ACTIONS = ['play', 'auto', 'overlay', 'clear'];

const IPC = Object.freeze({
  command: 'rosecr:command',
  getState: 'rosecr:get-state',
  stateChanged: 'rosecr:state-changed',
  listTargets: 'rosecr:list-targets',
  selectTarget: 'rosecr:select-target',
  startCaptureProbe: 'rosecr:start-capture-probe',
  stopCaptureProbe: 'rosecr:stop-capture-probe',
  captureWorkerStart: 'rosecr:capture-worker-start',
  captureWorkerStop: 'rosecr:capture-worker-stop',
  captureWorkerReport: 'rosecr:capture-worker-report'
});

/**
 * @typedef {{ type: 'play' }
 * | { type: 'set-auto', enabled: boolean }
 * | { type: 'set-overlay-visible', visible: boolean }
 * | { type: 'clear-overlays' }
 * | { type: 'set-direction', direction: Direction }
 * | { type: 'set-scope', scope: CaptureScope }
 * | { type: 'open-settings' }
 * | { type: 'set-shortcut', action: ShortcutAction, accelerator: string | null }} ControlCommand
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {ControlCommand} */
function parseControlCommand(value) {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new TypeError('Control command must be an object with a type.');
  }

  switch (value.type) {
    case 'play':
    case 'clear-overlays':
    case 'open-settings':
      return { type: value.type };
    case 'set-auto':
      if (typeof value.enabled === 'boolean') return { type: value.type, enabled: value.enabled };
      break;
    case 'set-overlay-visible':
      if (typeof value.visible === 'boolean') return { type: value.type, visible: value.visible };
      break;
    case 'set-direction':
      if (DIRECTIONS.includes(/** @type {Direction} */ (value.direction))) {
        return { type: value.type, direction: /** @type {Direction} */ (value.direction) };
      }
      break;
    case 'set-scope':
      if (CAPTURE_SCOPES.includes(/** @type {CaptureScope} */ (value.scope))) {
        return { type: value.type, scope: /** @type {CaptureScope} */ (value.scope) };
      }
      break;
    case 'set-shortcut':
      if (
        SHORTCUT_ACTIONS.includes(/** @type {ShortcutAction} */ (value.action)) &&
        (value.accelerator === null || typeof value.accelerator === 'string')
      ) {
        return {
          type: value.type,
          action: /** @type {ShortcutAction} */ (value.action),
          accelerator: value.accelerator === '' ? null : value.accelerator
        };
      }
      break;
  }

  throw new TypeError(`Invalid payload for control command '${value.type}'.`);
}

module.exports = {
  CAPTURE_SCOPES,
  CONTROL_STATUSES,
  DIRECTIONS,
  IPC,
  SHORTCUT_ACTIONS,
  isRecord,
  parseControlCommand
};
