import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const assets = [
  'scripts/electron-capture-probe.html',
  'scripts/win32-window-metadata.ps1',
  'src/renderer/capture-worker.html',
  'src/renderer/controller.html',
  'src/renderer/overlay.css',
  'src/renderer/overlay.html',
  'src/renderer/settings.html',
  'src/renderer/ui.css'
];

for (const asset of assets) {
  const destination = path.join('dist', asset);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(asset, destination);
}
