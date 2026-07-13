const { contextBridge, ipcRenderer } = require('electron');
const IPC = Object.freeze({
  captureWorkerStart: 'rosecr:capture-worker-start',
  captureWorkerStop: 'rosecr:capture-worker-stop',
  captureWorkerReport: 'rosecr:capture-worker-report'
});

contextBridge.exposeInMainWorld(
  'captureProbe',
  Object.freeze({
    onStart: (listener) => ipcRenderer.on(IPC.captureWorkerStart, (_event, options) => listener(options)),
    onStop: (listener) => ipcRenderer.on(IPC.captureWorkerStop, () => listener()),
    report: (report) => ipcRenderer.send(IPC.captureWorkerReport, report)
  })
);
