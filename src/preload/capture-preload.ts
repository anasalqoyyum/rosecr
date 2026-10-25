import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/contracts';
import type { CaptureWorkerReport } from '../main/capture-coordinator';

export interface CaptureStartOptions {
  sourceId: string;
  frameRate?: number;
  captureGeneration?: number;
}

contextBridge.exposeInMainWorld(
  'captureProbe',
  Object.freeze({
    onStop: (listener: () => void): void => {
      ipcRenderer.on(IPC.captureWorkerStop, () => listener());
    },
    report: (report: CaptureWorkerReport): void => ipcRenderer.send(IPC.captureWorkerReport, report)
  })
);
