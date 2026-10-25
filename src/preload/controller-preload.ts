import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type ControlCommand } from '../shared/contracts';
import type { CaptureTarget, ControlState } from '../main/control-state';

contextBridge.exposeInMainWorld(
  'rosecr',
  Object.freeze({
    getState: (): Promise<ControlState> => ipcRenderer.invoke(IPC.getState),
    command: (command: ControlCommand): Promise<ControlState> => ipcRenderer.invoke(IPC.command, command),
    listTargets: (): Promise<CaptureTarget[]> => ipcRenderer.invoke(IPC.listTargets),
    selectTarget: (sourceId: string): Promise<ControlState> => ipcRenderer.invoke(IPC.selectTarget, sourceId),
    selectRegion: (): Promise<ControlState> => ipcRenderer.invoke(IPC.selectRegion),
    startCaptureProbe: (): Promise<ControlState> => ipcRenderer.invoke(IPC.startCaptureProbe),
    stopCaptureProbe: (): Promise<ControlState> => ipcRenderer.invoke(IPC.stopCaptureProbe),
    onStateChanged: (listener: (state: ControlState) => void): (() => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, state: ControlState): void => listener(state);
      ipcRenderer.on(IPC.stateChanged, wrapped);
      return () => ipcRenderer.removeListener(IPC.stateChanged, wrapped);
    }
  })
);
