import type { CaptureScope, ControlCommand, ControlStatus, Direction, ShortcutAction } from '../shared/contracts';
import type { NormalizedRegion } from '../shared/region';
import { savedTargetFrom, type SavedGameTarget, type TargetResolution } from './game-target';
import type { DurableSettings } from './settings-store';

export interface CaptureTarget {
  id: string;
  name: string;
  nativeHandle: string;
  processId: number;
  executableName: string;
  className: string;
  thumbnailDataUrl?: string | null;
  iconDataUrl?: string | null;
}

/** The saved game survives every state below; only the user choosing another window replaces it. */
export type GameTargetState =
  | { kind: 'unselected' }
  | { kind: 'attached'; window: CaptureTarget }
  | { kind: 'detached'; saved: SavedGameTarget }
  | { kind: 'ambiguous'; saved: SavedGameTarget; candidates: CaptureTarget[] };

export interface CaptureFrameReport {
  frameCount: number;
  firstFrameLatencyMs?: number;
  width: number;
  height: number;
  timestamp: number;
}

export interface ControlState {
  status: ControlStatus;
  statusMessage: string;
  autoEnabled: boolean;
  overlayVisible: boolean;
  direction: Direction;
  scope: CaptureScope;
  gameTarget: GameTargetState;
  region: NormalizedRegion | null;
  clearGeneration: number;
  refreshGeneration: number;
  shortcuts: Record<ShortcutAction, string | null>;
  shortcutConflicts: Partial<Record<ShortcutAction, string>>;
  captureProbe: {
    active: boolean;
    frameCount: number;
    firstFrameLatencyMs: number | null;
    frameSize: { width: number; height: number } | null;
    lastFrameAt: number | null;
  };
}

const emptyCaptureProbe: ControlState['captureProbe'] = { active: false, frameCount: 0, firstFrameLatencyMs: null, frameSize: null, lastFrameAt: null };

export function createInitialState(settings: DurableSettings): ControlState {
  return {
    status: 'idle', statusMessage: 'Idle', autoEnabled: false,
    overlayVisible: settings.overlayVisible, direction: settings.direction, scope: settings.scope,
    gameTarget: settings.target ? { kind: 'detached', saved: settings.target } : { kind: 'unselected' },
    region: settings.region, clearGeneration: 0, refreshGeneration: 0,
    shortcuts: { ...settings.shortcuts }, shortcutConflicts: {},
    captureProbe: emptyCaptureProbe
  };
}

export function reduceControlState(state: ControlState, command: ControlCommand): ControlState {
  switch (command.type) {
    case 'play':
      if (state.gameTarget.kind === 'unselected') return { ...state, status: 'waiting', statusMessage: 'Waiting: choose a game window' };
      if (state.autoEnabled) return { ...state, status: 'running', statusMessage: 'Watching · refresh requested', refreshGeneration: state.refreshGeneration + 1 };
      return { ...state, status: 'running', statusMessage: 'One-shot capture running', refreshGeneration: state.refreshGeneration + 1 };
    case 'set-auto':
      if (!command.enabled) return { ...state, autoEnabled: false, status: 'idle', statusMessage: 'Idle' };
      if (state.gameTarget.kind === 'unselected') return { ...state, autoEnabled: true, status: 'waiting', statusMessage: 'Waiting: choose a game window' };
      return { ...state, autoEnabled: true, status: 'running', statusMessage: 'Watching' };
    case 'set-overlay-visible': return { ...state, overlayVisible: command.visible };
    case 'clear-overlays': return { ...state, clearGeneration: state.clearGeneration + 1 };
    case 'set-direction': return { ...state, direction: command.direction, clearGeneration: state.clearGeneration + 1, refreshGeneration: state.refreshGeneration + 1 };
    case 'set-scope': return { ...state, scope: command.scope, clearGeneration: state.clearGeneration + 1, refreshGeneration: state.refreshGeneration + 1 };
    case 'open-settings': return state;
    case 'set-shortcut': return { ...state, shortcuts: { ...state.shortcuts, [command.action]: command.accelerator } };
  }
}

export function attachedWindow(state: ControlState): CaptureTarget | null {
  return state.gameTarget.kind === 'attached' ? state.gameTarget.window : null;
}

export function savedGameTarget(target: GameTargetState): SavedGameTarget | null {
  switch (target.kind) {
    case 'unselected': return null;
    case 'attached': return savedTargetFrom(target.window);
    case 'detached':
    case 'ambiguous': return target.saved;
  }
}

export function selectTarget(state: ControlState, target: CaptureTarget): ControlState {
  const status: ControlStatus = state.autoEnabled ? 'running' : 'idle';
  return { ...state, gameTarget: { kind: 'attached', window: target }, status, statusMessage: state.autoEnabled ? 'Watching' : 'Idle', clearGeneration: state.clearGeneration + 1 };
}

/** Applies a lookup of the saved game without touching the region or the runtime status. */
export function targetResolved(state: ControlState, resolution: TargetResolution): ControlState {
  const saved = savedGameTarget(state.gameTarget);
  if (!saved) return state;
  switch (resolution.kind) {
    case 'unique': return { ...state, gameTarget: { kind: 'attached', window: resolution.window } };
    case 'ambiguous': return { ...state, gameTarget: { kind: 'ambiguous', saved, candidates: resolution.candidates } };
    case 'missing': return { ...state, gameTarget: { kind: 'detached', saved } };
  }
}

export function regionSaved(state: ControlState, region: NormalizedRegion): ControlState {
  return { ...state, region, clearGeneration: state.clearGeneration + 1, refreshGeneration: state.refreshGeneration + 1 };
}

export function captureStarting(state: ControlState): ControlState {
  return { ...state, captureProbe: emptyCaptureProbe };
}

export function targetUnavailable(state: ControlState, reason: string): ControlState {
  return { ...state, status: 'waiting', statusMessage: `Waiting: ${reason}`, captureProbe: { ...state.captureProbe, active: false }, clearGeneration: state.clearGeneration + 1 };
}

export function runtimeError(state: ControlState, reason: string): ControlState {
  return { ...state, status: 'error', statusMessage: `Error: ${reason}`, autoEnabled: false, captureProbe: { ...state.captureProbe, active: false }, clearGeneration: state.clearGeneration + 1 };
}

export function captureFrameReported(state: ControlState, report: CaptureFrameReport, mode: 'one-shot' | 'continuous' = state.autoEnabled ? 'continuous' : 'one-shot'): ControlState {
  const oneShotFinished = mode === 'one-shot' && report.frameCount >= 1;
  return {
    ...state,
    status: oneShotFinished ? 'idle' : 'running',
    statusMessage: oneShotFinished ? 'Idle · capture probe passed' : 'Watching · capture frames received',
    captureProbe: {
      active: !oneShotFinished,
      frameCount: report.frameCount,
      firstFrameLatencyMs: report.firstFrameLatencyMs ?? state.captureProbe.firstFrameLatencyMs,
      frameSize: { width: report.width, height: report.height },
      lastFrameAt: report.timestamp
    }
  };
}
