import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  process.stderr.write('The bundled capture helper must be built on Windows x64 with Rust and MSVC.\n');
  process.exit(1);
}
const target = 'x86_64-pc-windows-msvc';
const result = spawnSync('cargo', ['build', '--locked', '--offline', '--release', '--target', target, '--manifest-path', 'native/capture-helper/Cargo.toml'], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const source = path.join('native', 'capture-helper', 'target', target, 'release', 'rosecr-capture-helper.exe');
for (const root of ['native', path.join('dist', 'native')]) {
  mkdirSync(root, { recursive: true });
  copyFileSync(source, path.join(root, 'rosecr-capture-helper.exe'));
}
