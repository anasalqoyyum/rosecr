import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { ControlState } from '../src/main/control-state';
import { cloneDefaults } from '../src/main/settings-store';
import { IPC } from '../src/shared/contracts';

function loadMain(hasLock = true) {
  const handlers = new Map<string, (event: unknown, payload?: unknown) => Promise<ControlState>>();
  const listeners = new Map<string, () => void>();
  const starts: string[] = [];
  const stops: string[] = [];
  const windows: FakeWindow[] = [];
  let activeSource: string | null = null;
  let quitCalls = 0;
  let readyCalls = 0;
  let shortcutRegistrations = 0;
  let startup: Promise<void> | undefined;

  class FakeWindow {
    static getAllWindows() { return windows; }
    webContents = {
      send: (channel: string) => {
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
        return { kind: 'frame', blank: false, frameCount: 1, width: 800, height: 600, timestamp: 1 };
      }
    };
    constructor() { windows.push(this); }
    loadFile() {}
    on() {}
    isDestroyed() { return false; }
    setContentProtection() {}
    setIgnoreMouseEvents() {}
    setFocusable() {}
    setBounds() {}
    isVisible() { return false; }
    showInactive() {}
    hide() {}
  }

  const filename = path.resolve(__dirname, '../src/main/index.ts');
  const requireFromMain = createRequire(filename);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  runInNewContext(code, {
    exports: {},
    __dirname: path.dirname(filename),
    process: { env: {}, pid: process.pid },
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
            on() {}
          },
          screen: { screenToDipPoint: (point: unknown) => point }
        };
        case './settings-store': return {
          SettingsStore: class { load() { return cloneDefaults(); } }
        };
        case './win32-metadata-client': return {
          Win32MetadataClient: class {
            async list() {
              return { windows: [42, 43].map((handle) => ({ handle: String(handle), title: 'Game', processId: -1 })) };
            }
            async query() {
              return { capturable: true, clientRect: { left: 0, top: 0, right: 800, bottom: 600 } };
            }
          }
        };
        default: return requireFromMain(id);
      }
    }
  });

  return {
    startup, handlers, listeners, starts, stops, windows,
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
  assert.equal(second.selectedTarget?.id, 'window:43:0');
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
