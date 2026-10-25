import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SettingsStore, cloneDefaults } from '../src/main/settings-store';

test('durable settings and disabled shortcuts survive a restart without runtime Auto', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rosecr-settings-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new SettingsStore(directory);
  const settings = cloneDefaults();
  settings.direction = 'en-ja';
  settings.scope = 'window';
  settings.overlayVisible = false;
  settings.shortcuts.auto = null;
  store.save(settings);
  const persisted = JSON.parse(fs.readFileSync(path.join(directory, 'settings.json'), 'utf8'));
  fs.writeFileSync(path.join(directory, 'settings.json'), JSON.stringify({ ...persisted, autoEnabled: true }));

  const restored = store.load();
  assert.deepEqual(restored, settings);
  assert.equal('autoEnabled' in restored, false);
});

test('invalid persisted values fall back without discarding valid preferences', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rosecr-settings-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(directory, 'settings.json'),
    JSON.stringify({ direction: 'invalid', scope: 'window', shortcuts: { play: 42, clear: 'Ctrl+Alt+C' } })
  );

  const restored = new SettingsStore(directory).load();
  assert.equal(restored.direction, 'ja-en');
  assert.equal(restored.scope, 'window');
  assert.equal(restored.shortcuts.play, 'CommandOrControl+Alt+P');
  assert.equal(restored.shortcuts.clear, 'Ctrl+Alt+C');
});
