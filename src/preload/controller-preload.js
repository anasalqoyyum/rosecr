const { contextBridge, ipcRenderer } = require('electron');
const IPC = Object.freeze({
  command: 'rosecr:command',
  getState: 'rosecr:get-state',
  stateChanged: 'rosecr:state-changed',
  listTargets: 'rosecr:list-targets',
  selectTarget: 'rosecr:select-target',
  startCaptureProbe: 'rosecr:start-capture-probe',
  stopCaptureProbe: 'rosecr:stop-capture-probe'
});

contextBridge.exposeInMainWorld(
  'rosecr',
  Object.freeze({
    getState: () => ipcRenderer.invoke(IPC.getState),
    command: (command) => ipcRenderer.invoke(IPC.command, command),
    listTargets: () => ipcRenderer.invoke(IPC.listTargets),
    selectTarget: (sourceId) => ipcRenderer.invoke(IPC.selectTarget, sourceId),
    startCaptureProbe: () => ipcRenderer.invoke(IPC.startCaptureProbe),
    stopCaptureProbe: () => ipcRenderer.invoke(IPC.stopCaptureProbe),
    onStateChanged: (listener) => {
      const wrapped = (_event, state) => listener(state);
      ipcRenderer.on(IPC.stateChanged, wrapped);
      return () => ipcRenderer.removeListener(IPC.stateChanged, wrapped);
    }
  })
);
