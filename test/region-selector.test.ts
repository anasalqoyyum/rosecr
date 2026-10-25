import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import type { BrowserWindow, WebContents } from 'electron';
import { DEFAULT_REGION } from '../src/shared/region';
import { RegionSelector } from '../src/main/region-selector';

class FakeSelectorWindow extends EventEmitter {
  webContents = {} as WebContents;
  bounds: unknown = null;
  shown = false;
  closed = false;
  setBounds(bounds: unknown) { this.bounds = bounds; }
  show() { this.shown = true; }
  hide() { this.shown = false; }
  isVisible() { return this.shown; }
  focus() {}
  isDestroyed() { return this.closed; }
  close() {
    this.closed = true;
    this.emit('closed');
  }
}

function selector() {
  const windows: FakeSelectorWindow[] = [];
  const regionSelector = new RegionSelector(() => {
    const window = new FakeSelectorWindow();
    windows.push(window);
    return window as unknown as BrowserWindow;
  });
  return { regionSelector, windows };
}

const clientBounds = { x: 100, y: 50, width: 1280, height: 720 };
const saved = { x: 0.2, y: 0.6, width: 0.6, height: 0.3 };

test('the selector covers the client area, starts from the saved region, and confirms a valid region', async () => {
  const { regionSelector, windows } = selector();
  const result = regionSelector.open({ clientBounds, savedRegion: saved, covering: null });
  const [window] = windows;
  assert.deepEqual(window.bounds, clientBounds);
  window.emit('ready-to-show');
  assert.equal(window.shown, true);
  assert.deepEqual(regionSelector.initFor(window.webContents), { region: saved, defaultRegion: DEFAULT_REGION });
  assert.equal(regionSelector.initFor({} as WebContents), null);

  regionSelector.finish({} as WebContents, { kind: 'confirmed', region: DEFAULT_REGION });
  regionSelector.finish(window.webContents, { kind: 'confirmed', region: { x: 0.9, y: 0, width: 0.5, height: 0.5 } });
  regionSelector.finish(window.webContents, { kind: 'confirmed', region: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 } });
  assert.deepEqual(await result, { kind: 'confirmed', region: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 } });
  assert.equal(window.closed, true);
});

test('Escape, focus loss, and closing the selector all cancel without a region', async () => {
  for (const end of ['cancel', 'blur', 'closed'] as const) {
    const { regionSelector, windows } = selector();
    const result = regionSelector.open({ clientBounds, savedRegion: null, covering: null });
    const [window] = windows;
    assert.deepEqual(regionSelector.initFor(window.webContents)?.region, DEFAULT_REGION);
    if (end === 'cancel') regionSelector.finish(window.webContents, { kind: 'cancelled' });
    else window.emit(end);
    assert.deepEqual(await result, { kind: 'cancelled' });
    assert.equal(regionSelector.initFor(window.webContents), null);
  }
});

test('opening twice reuses the open selector', async () => {
  const { regionSelector, windows } = selector();
  const first = regionSelector.open({ clientBounds, savedRegion: saved, covering: null });
  const second = regionSelector.open({ clientBounds, savedRegion: saved, covering: null });
  assert.equal(windows.length, 1);
  regionSelector.cancel();
  assert.deepEqual(await first, { kind: 'cancelled' });
  assert.deepEqual(await second, { kind: 'cancelled' });
});

test('a visible Settings window is hidden after the selector takes focus and restored afterwards', async () => {
  for (const settingsVisible of [true, false]) {
    const { regionSelector, windows } = selector();
    const settings = new FakeSelectorWindow();
    settings.shown = settingsVisible;
    const result = regionSelector.open({ clientBounds, savedRegion: saved, covering: settings as unknown as BrowserWindow });
    assert.equal(settings.shown, settingsVisible, 'Settings stays until the selector is shown');
    windows[0].emit('ready-to-show');
    assert.equal(settings.shown, false);
    regionSelector.cancel();
    await result;
    assert.equal(settings.shown, settingsVisible);
  }
});
