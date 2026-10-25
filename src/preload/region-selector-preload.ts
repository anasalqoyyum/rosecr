import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/contracts';
import type { RegionSelection, RegionSelectorInit } from '../main/region-selector';

contextBridge.exposeInMainWorld(
  'regionSelector',
  Object.freeze({
    initial: (): Promise<RegionSelectorInit | null> => ipcRenderer.invoke(IPC.regionSelectorInit),
    finish: (selection: RegionSelection): void => ipcRenderer.send(IPC.regionSelectorFinish, selection)
  })
);
