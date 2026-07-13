import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/contracts';
import type { CaptureWorkerReport } from '../main/capture-coordinator';

export interface CaptureStartOptions {
  sourceId: string;
  frameRate?: number;
}

contextBridge.exposeInMainWorld(
  'captureProbe',
  Object.freeze({
    onStart: (listener: (options: CaptureStartOptions) => void): void => {
      ipcRenderer.on(IPC.captureWorkerStart, (_event, options: CaptureStartOptions) => listener(options));
    },
    onStop: (listener: () => void): void => {
      ipcRenderer.on(IPC.captureWorkerStop, () => listener());
    },
    report: (report: CaptureWorkerReport): void => ipcRenderer.send(IPC.captureWorkerReport, report)
  })
);
