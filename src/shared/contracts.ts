export type Direction = 'ja-en' | 'en-ja';
export type CaptureScope = 'region' | 'window';
export type ControlStatus = 'idle' | 'running' | 'waiting' | 'error';
export type ShortcutAction = 'play' | 'auto' | 'overlay' | 'clear';

export type ControlCommand =
  | { type: 'play' }
  | { type: 'set-auto'; enabled: boolean }
  | { type: 'set-overlay-visible'; visible: boolean }
  | { type: 'clear-overlays' }
  | { type: 'set-direction'; direction: Direction }
  | { type: 'set-scope'; scope: CaptureScope }
  | { type: 'open-settings' }
  | { type: 'set-shortcut'; action: ShortcutAction; accelerator: string | null };

export type OcrOrientation = 'horizontal' | 'vertical';

/** Physical pixels relative to the top-left of the image that was recognized. */
export interface PhysicalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrBox {
  rect: PhysicalRect;
  text: string;
  /** Engine recognition score from 0 to 1. */
  confidence: number;
  orientation: OcrOrientation;
  /** Zero-based position in visual reading order within one result. */
  readingOrder: number;
}

export interface OcrResult {
  captureGeneration: number;
  boxes: OcrBox[];
  /** Sidecar time spent inside the OCR engine, excluding transport and decoding. */
  ocrMs: number;
}

export const DIRECTIONS = ['ja-en', 'en-ja'] as const satisfies readonly Direction[];
export const CAPTURE_SCOPES = ['region', 'window'] as const satisfies readonly CaptureScope[];
export const CONTROL_STATUSES = ['idle', 'running', 'waiting', 'error'] as const satisfies readonly ControlStatus[];
export const SHORTCUT_ACTIONS = ['play', 'auto', 'overlay', 'clear'] as const satisfies readonly ShortcutAction[];

export const IPC = Object.freeze({
  command: 'rosecr:command',
  getState: 'rosecr:get-state',
  stateChanged: 'rosecr:state-changed',
  listTargets: 'rosecr:list-targets',
  selectTarget: 'rosecr:select-target',
  startCaptureProbe: 'rosecr:start-capture-probe',
  stopCaptureProbe: 'rosecr:stop-capture-probe',
  captureWorkerStop: 'rosecr:capture-worker-stop',
  captureWorkerReport: 'rosecr:capture-worker-report'
});

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseControlCommand(value: unknown): ControlCommand {
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
      if (DIRECTIONS.includes(value.direction as Direction)) {
        return { type: value.type, direction: value.direction as Direction };
      }
      break;
    case 'set-scope':
      if (CAPTURE_SCOPES.includes(value.scope as CaptureScope)) {
        return { type: value.type, scope: value.scope as CaptureScope };
      }
      break;
    case 'set-shortcut':
      if (
        SHORTCUT_ACTIONS.includes(value.action as ShortcutAction) &&
        (value.accelerator === null || typeof value.accelerator === 'string')
      ) {
        return {
          type: value.type,
          action: value.action as ShortcutAction,
          accelerator: value.accelerator === '' ? null : value.accelerator
        };
      }
      break;
  }

  throw new TypeError(`Invalid payload for control command '${value.type}'.`);
}
