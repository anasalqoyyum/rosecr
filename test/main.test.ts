import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { ControlState } from '../src/main/control-state';
import { cloneDefaults, type DurableSettings } from '../src/main/settings-store';
import { IPC } from '../src/shared/contracts';

function loadMain(hasLock = true, queryGate?: Promise<void>, options: {
  smoke?: boolean;
  workerGate?: Promise<void>;
  settings?: DurableSettings;
  handles?: number[];
} = {}) {
  const handlers = new Map<string, (event: unknown, payload?: unknown) => Promise<ControlState>>();
  const ipcListeners = new Map<string, (event: unknown, payload?: unknown) => void>();
  const saves: DurableSettings[] = [];
  const listeners = new Map<string, () => void>();
  const starts: string[] = [];
  const stops: string[] = [];
  const windows: FakeWindow[] = [];
  const timers = new Map<number, () => void>();
  let activeSource: string | null = null;
  let quitCalls = 0;
  let readyCalls = 0;
  let shortcutRegistrations = 0;
  let startup: Promise<void> | undefined;

  class FakeWindow {
    events = new Map<string, () => void>();
    visible = false;
    destroyed = false;
    bounds: unknown = null;
    broadcasts: ControlState[] = [];
    static getAllWindows() { return windows; }
    webContents = {
      send: (channel: string, state?: ControlState) => {
        if (channel === IPC.stateChanged && state) this.broadcasts.push(state);
        if (channel === IPC.captureWorkerStop && activeSource) stops.push(activeSource);
      },
      setWindowOpenHandler() {},
      on() {},
      isLoading: () => false,
      executeJavaScript: async (script: string) => {
        if (!script.startsWith('window.captureProbeRuntime.start(')) {
          activeSource = null;
          return;
        }
        starts.push(script);
        const match = /"sourceId":"([^"]+)"/.exec(script);
        assert.ok(match);
        activeSource = match[1];
        await options.workerGate;
        return { kind: 'frame', captureGeneration: JSON.parse(script.slice(script.indexOf('(') + 1, -1)).captureGeneration, blank: false, frameCount: 1, width: 800, height: 600, timestamp: Date.now() };
      }
    };
    constructor() { windows.push(this); }
    loadFile() {}
    on(event: string, callback: () => void) { this.events.set(event, callback); }
    once(event: string, callback: () => void) { this.events.set(event, callback); }
    isDestroyed() { return this.destroyed; }
    close() {
      this.destroyed = true;
      this.events.get('closed')?.();
    }
    show() { this.visible = true; }
    focus() {}
    setContentProtection() {}
    setIgnoreMouseEvents() {}
    setFocusable() {}
    setBounds(bounds: unknown) { this.bounds = bounds; }
    isVisible() { return this.visible; }
    showInactive() { this.visible = true; }
    hide() { this.visible = false; }
  }

  const filename = path.resolve(__dirname, '../src/main/index.ts');
  const requireFromMain = createRequire(filename);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  runInNewContext(code, {
    exports: {},
    __dirname: path.dirname(filename),
    process: { env: options.smoke ? { ROSECR_CAPTURE_TARGET: 'Game' } : {}, pid: process.pid },
    setTimeout: (callback: () => void, delay: number) => { timers.set(delay, callback); },
    require: (id: string): unknown => {
      switch (id) {
        case 'electron': return {
          app: {
            requestSingleInstanceLock: () => hasLock,
            quit: () => { quitCalls++; },
            whenReady: () => {
              readyCalls++;
              return { then: (callback: () => void) => { startup = Promise.resolve().then(callback); } };
            },
            on: (event: string, callback: () => void) => { listeners.set(event, callback); },
            getPath: () => '',
            getAppPath: () => ''
          },
          BrowserWindow: FakeWindow,
          globalShortcut: {
            register: () => { shortcutRegistrations++; return true; },
            unregisterAll() {}
          },
          ipcMain: {
            handle: (channel: string, handler: (event: unknown, payload?: unknown) => Promise<ControlState>) => {
              handlers.set(channel, handler);
            },
            on: (channel: string, listener: (event: unknown, payload?: unknown) => void) => {
              ipcListeners.set(channel, listener);
            }
          },
          screen: { screenToDipPoint: (point: unknown) => point }
        };
        case './settings-store': return {
          SettingsStore: class {
            load() { return structuredClone(options.settings ?? cloneDefaults()); }
            save(settings: DurableSettings) { saves.push(structuredClone(settings)); }
          }
        };
        case './win32-metadata-client': return {
          Win32MetadataClient: class {
            async list() {
              return { windows: (options.handles ?? [42, 43]).map((handle) => ({
                handle: String(handle), title: 'Game', processId: -1, executableName: 'game.exe', className: 'GameWindow'
              })) };
            }
            async query() {
              await queryGate;
              return { exists: true, capturable: true, clientRect: { left: 0, top: 0, right: 800, bottom: 600 } };
            }
          }
        };
        default: return requireFromMain(id);
      }
    }
  });

  return {
    startup, handlers, ipcListeners, listeners, saves, starts, stops, windows, timers,
    get activeSource() { return activeSource; },
    get quitCalls() { return quitCalls; },
    get readyCalls() { return readyCalls; },
    get shortcutRegistrations() { return shortcutRegistrations; },
    async invoke(channel: string, payload?: unknown) {
      const handler = handlers.get(channel);
      assert.ok(handler, `Missing IPC handler for ${channel}`);
      return handler({}, payload);
    },
    dispose() { listeners.get('before-quit')?.(); }
  };
}

test('Auto enabled before target selection starts capture and switching rebinds it', async (t) => {
  const main = loadMain();
  t.after(() => main.dispose());
  await main.startup;
  assert.equal(main.windows.length, 4);
  assert.ok(main.shortcutRegistrations > 0);
  await main.invoke(IPC.command, { type: 'set-auto', enabled: true });
  assert.equal(main.starts.length, 0);

  const first = await main.invoke(IPC.selectTarget, 'window:42:0');
  assert.equal(first.captureProbe.active, true);
  assert.equal(main.activeSource, 'window:42:0');
  const second = await main.invoke(IPC.selectTarget, 'window:43:0');
  assert.equal(second.gameTarget.kind === 'attached' && second.gameTarget.window.id, 'window:43:0');
  assert.equal(second.captureProbe.active, true);
  assert.equal(main.activeSource, 'window:43:0');
  assert.equal(main.starts.length, 2);
  assert.deepEqual(main.stops, ['window:42:0']);
});

test('target selection with Auto off stays idle and does not start capture', async (t) => {
  const main = loadMain();
  t.after(() => main.dispose());
  await main.startup;
  const state = await main.invoke(IPC.selectTarget, 'window:42:0');
  assert.equal(state.status, 'idle');
  assert.equal(main.starts.length, 0);
});

test('losing the single-instance lock quits without scheduling startup or registering handlers', async () => {
  const main = loadMain(false);
  await Promise.resolve();
  assert.equal(main.quitCalls, 1);
  assert.equal(main.readyCalls, 0);
  assert.equal(main.windows.length, 0);
  assert.equal(main.handlers.size, 0);
  assert.equal(main.listeners.size, 0);
  assert.equal(main.shortcutRegistrations, 0);
});


test('Auto is broadcast before delayed startup and can be disabled while startup is pending', async (t) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const main = loadMain(true, gate);
  t.after(() => main.dispose());
  await main.startup;
  await main.invoke(IPC.selectTarget, 'window:42:0');
  const enabling = main.invoke(IPC.command, { type: 'set-auto', enabled: true });
  assert.equal(main.windows[0].broadcasts.at(-1)?.autoEnabled, true);
  await main.invoke(IPC.command, { type: 'set-auto', enabled: false });
  release();
  const state = await enabling;
  assert.equal(state.autoEnabled, false);
  assert.equal(state.captureProbe.active, false);
  assert.equal(main.starts.length, 0);
});

test('selecting an idle target hides the previous one-shot overlay', async (t) => {
  const main = loadMain();
  t.after(() => main.dispose());
  await main.startup;
  await main.invoke(IPC.selectTarget, 'window:42:0');
  await main.invoke(IPC.command, { type: 'play' });
  assert.equal(main.windows[2].visible, true);
  await main.invoke(IPC.selectTarget, 'window:43:0');
  assert.equal(main.windows[2].visible, false);
  assert.equal(main.starts.length, 1);
});

test('closing the controller quits even while hidden windows remain', async (t) => {
  const main = loadMain();
  t.after(() => main.dispose());
  await main.startup;
  main.windows[0].events.get('closed')?.();
  assert.equal(main.quitCalls, 1);
  assert.equal(main.windows.length, 4);
  assert.doesNotThrow(() => main.listeners.get('second-instance')?.());
});


test('Stop disables Auto and terminates the shared capture', async (t) => {
  const main = loadMain();
  t.after(() => main.dispose());
  await main.startup;
  await main.invoke(IPC.selectTarget, 'window:42:0');
  await main.invoke(IPC.command, { type: 'set-auto', enabled: true });
  const state = await main.invoke(IPC.stopCaptureProbe);
  assert.equal(state.autoEnabled, false);
  assert.equal(state.status, 'idle');
  assert.equal(state.captureProbe.active, false);
  assert.equal(main.activeSource, null);
  assert.equal(main.windows[2].visible, false);
  assert.equal(main.windows[0].broadcasts.at(-1)?.autoEnabled, false);
});

test('direction and scope changes refresh visible Auto output while Auto-off changes stay idle', async (t) => {
  const main = loadMain();
  t.after(() => main.dispose());
  await main.startup;
  await main.invoke(IPC.selectTarget, 'window:42:0');
  await main.invoke(IPC.command, { type: 'set-auto', enabled: true });
  for (const command of [{ type: 'set-direction', direction: 'en-ja' }, { type: 'set-scope', scope: 'window' }]) {
    const startCount = main.starts.length;
    const state = await main.invoke(IPC.command, command);
    assert.equal(main.starts.length, startCount + 1);
    assert.equal(state.autoEnabled, true);
    assert.equal(state.captureProbe.active, true);
    assert.equal(main.windows[2].visible, true);
  }
  await main.invoke(IPC.command, { type: 'set-auto', enabled: false });
  const startCount = main.starts.length;
  await main.invoke(IPC.command, { type: 'set-direction', direction: 'ja-en' });
  await main.invoke(IPC.command, { type: 'set-scope', scope: 'region' });
  assert.equal(main.starts.length, startCount);
  assert.equal(main.windows[2].visible, false);
});

test('smoke timeout stops capture and a late first frame cannot replace the error', async (t) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const main = loadMain(true, undefined, { smoke: true, workerGate: gate });
  t.after(() => main.dispose());
  await main.startup;
  main.timers.get(2000)!();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(main.activeSource, 'window:42:0');
  main.timers.get(10000)!();
  const timedOut = await main.invoke(IPC.getState);
  assert.equal(main.activeSource, null);
  assert.equal(timedOut.status, 'error');
  assert.equal(timedOut.statusMessage, 'Error: capture probe timed out before the first frame');
  release();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const state = await main.invoke(IPC.getState);
  assert.equal(state.status, 'error');
  assert.equal(state.captureProbe.active, false);
  assert.equal(state.captureProbe.frameCount, 0);
  assert.equal(main.windows[2].visible, false);
});

test('a region drawn over the chosen game persists with the target and reconnects after restart', async (t) => {
  const main = loadMain();
  t.after(() => main.dispose());
  await main.startup;
  await main.invoke(IPC.selectTarget, 'window:42:0');
  const selecting = main.invoke(IPC.selectRegion);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const selector = main.windows[4];
  assert.ok(selector);
  assert.deepEqual(selector.bounds, { x: 0, y: 0, width: 800, height: 600 });
  const sender = { sender: selector.webContents };
  const init = await main.invoke(IPC.regionSelectorInit) as unknown;
  assert.equal(init, null, 'other renderers cannot read the selector session');
  assert.ok(await main.handlers.get(IPC.regionSelectorInit)?.(sender));
  const region = { x: 0.2, y: 0.6, width: 0.6, height: 0.3 };
  main.ipcListeners.get(IPC.regionSelectorFinish)?.(sender, { kind: 'confirmed', region });
  const selected = await selecting;
  assert.deepEqual(selected.region, region);
  assert.equal(selector.destroyed, true);

  const persisted = main.saves.at(-1);
  assert.ok(persisted);
  assert.deepEqual(persisted.region, region);
  assert.deepEqual(persisted.target, { executableName: 'game.exe', className: 'GameWindow', title: 'Game', lastKnownHandle: '42' });

  const restarted = loadMain(true, undefined, { settings: persisted, handles: [77] });
  t.after(() => restarted.dispose());
  await restarted.startup;
  const restored = await restarted.invoke(IPC.getState);
  assert.equal(restored.gameTarget.kind, 'detached');
  assert.equal(restored.autoEnabled, false);
  const played = await restarted.invoke(IPC.command, { type: 'play' });
  assert.match(restarted.starts.at(-1) ?? '', /"sourceId":"window:77:0"/);
  assert.deepEqual(played.region, region);
  assert.equal(restarted.saves.at(-1)?.target?.lastKnownHandle, '77');
});

test('a restart with two matching windows asks for the window and keeps the region', async (t) => {
  const settings = cloneDefaults();
  settings.target = { executableName: 'game.exe', className: 'GameWindow', title: 'Old title', lastKnownHandle: '1' };
  settings.region = { x: 0.2, y: 0.6, width: 0.6, height: 0.3 };
  const main = loadMain(true, undefined, { settings });
  t.after(() => main.dispose());
  await main.startup;
  const waiting = await main.invoke(IPC.command, { type: 'play' });
  assert.equal(waiting.gameTarget.kind, 'ambiguous');
  assert.equal(waiting.statusMessage, 'Waiting: choose which game window to capture');
  assert.equal(main.starts.length, 0);
  assert.ok(main.saves.every((saved) => saved.target && saved.region), 'no save drops the target or region');
  await assert.rejects(main.invoke(IPC.selectRegion), /Choose which game window/);

  const chosen = await main.invoke(IPC.selectTarget, 'window:43:0');
  assert.equal(chosen.gameTarget.kind, 'attached');
  assert.deepEqual(chosen.region, settings.region);
  await main.invoke(IPC.command, { type: 'play' });
  assert.match(main.starts.at(-1) ?? '', /"sourceId":"window:43:0"/);
});
