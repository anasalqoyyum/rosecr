import type { CaptureScope, ControlCommand, ControlStatus, Direction, ShortcutAction } from '../shared/contracts';
import type { DurableSettings } from './settings-store';

export interface CaptureTarget {
  id: string;
  name: string;
  nativeHandle: string;
  thumbnailDataUrl?: string | null;
  iconDataUrl?: string | null;
}

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
  selectedTarget: CaptureTarget | null;
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

export function createInitialState(settings: DurableSettings): ControlState {
  return {
    status: 'idle', statusMessage: 'Idle', autoEnabled: false,
    overlayVisible: settings.overlayVisible, direction: settings.direction, scope: settings.scope,
    selectedTarget: null, clearGeneration: 0, refreshGeneration: 0,
    shortcuts: { ...settings.shortcuts }, shortcutConflicts: {},
    captureProbe: { active: false, frameCount: 0, firstFrameLatencyMs: null, frameSize: null, lastFrameAt: null }
  };
}

export function reduceControlState(state: ControlState, command: ControlCommand): ControlState {
  switch (command.type) {
    case 'play':
      if (!state.selectedTarget) return { ...state, status: 'waiting', statusMessage: 'Waiting: choose a game window' };
      if (state.autoEnabled) return { ...state, status: 'running', statusMessage: 'Watching · refresh requested', refreshGeneration: state.refreshGeneration + 1 };
      return { ...state, status: 'running', statusMessage: 'One-shot capture running', refreshGeneration: state.refreshGeneration + 1 };
    case 'set-auto':
      if (!command.enabled) return { ...state, autoEnabled: false, status: 'idle', statusMessage: 'Idle' };
      if (!state.selectedTarget) return { ...state, autoEnabled: true, status: 'waiting', statusMessage: 'Waiting: choose a game window' };
      return { ...state, autoEnabled: true, status: 'running', statusMessage: 'Watching' };
    case 'set-overlay-visible': return { ...state, overlayVisible: command.visible };
    case 'clear-overlays': return { ...state, clearGeneration: state.clearGeneration + 1 };
    case 'set-direction': return { ...state, direction: command.direction, clearGeneration: state.clearGeneration + 1, refreshGeneration: state.refreshGeneration + 1 };
    case 'set-scope': return { ...state, scope: command.scope, clearGeneration: state.clearGeneration + 1, refreshGeneration: state.refreshGeneration + 1 };
    case 'open-settings': return state;
    case 'set-shortcut': return { ...state, shortcuts: { ...state.shortcuts, [command.action]: command.accelerator } };
  }
}

export function selectTarget(state: ControlState, target: CaptureTarget): ControlState {
  const status: ControlStatus = state.autoEnabled ? 'running' : 'idle';
  return { ...state, selectedTarget: target, status, statusMessage: state.autoEnabled ? 'Watching' : 'Idle', clearGeneration: state.clearGeneration + 1 };
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
