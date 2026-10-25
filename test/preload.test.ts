import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import '../scripts/build-preloads';
import { createInitialState } from '../src/main/control-state';
import { cloneDefaults } from '../src/main/settings-store';
import { IPC } from '../src/shared/contracts';

function loadPreload(name: string) {
  const exposed: Partial<Pick<Window, 'rosecr' | 'captureProbe'>> = {};
  const listeners = new EventEmitter();
  const invocations: unknown[][] = [];
  const reports: unknown[][] = [];
  const preloadModule = { exports: {} };
  runInNewContext(readFileSync(`dist/src/preload/${name}-preload.js`, 'utf8'), {
    module: preloadModule,
    exports: preloadModule.exports,
    require(id: string) {
      assert.equal(id, 'electron', `Sandbox preload cannot require ${id}`);
      return {
        contextBridge: {
          exposeInMainWorld(key: string, api: unknown) {
            Object.defineProperty(exposed, key, { value: api });
          }
        },
        ipcRenderer: {
          invoke: async (...args: unknown[]) => { invocations.push(args); return 'response'; },
          send: (...args: unknown[]) => { reports.push(args); },
          on: (channel: string, listener: (...args: unknown[]) => void) => listeners.on(channel, listener),
          removeListener: (channel: string, listener: (...args: unknown[]) => void) => listeners.removeListener(channel, listener)
        }
      };
    }
  });
  return { exposed, listeners, invocations, reports };
}

test('bundled controller preload initializes with sandbox require and preserves its IPC API', async () => {
  const f = loadPreload('controller');
  const api = f.exposed.rosecr;
  assert.ok(api);
  const command = { type: 'play' } as const;
  assert.equal(await api.getState(), 'response');
  await api.command(command);
  await api.listTargets();
  await api.selectTarget('window:42:0');
  await api.startCaptureProbe();
  await api.stopCaptureProbe();
  assert.deepEqual(f.invocations, [
    [IPC.getState], [IPC.command, command], [IPC.listTargets],
    [IPC.selectTarget, 'window:42:0'], [IPC.startCaptureProbe], [IPC.stopCaptureProbe]
  ]);
  const state = createInitialState(cloneDefaults());
  let calls = 0;
  const unsubscribe = api.onStateChanged((next) => { assert.equal(next, state); calls++; });
  f.listeners.emit(IPC.stateChanged, {}, state);
  assert.equal(calls, 1);
  unsubscribe();
  f.listeners.emit(IPC.stateChanged, {}, state);
  assert.equal(calls, 1);
});

test('bundled capture preload initializes with sandbox require and delivers worker IPC', () => {
  const f = loadPreload('capture');
  const api = f.exposed.captureProbe;
  assert.ok(api);
  let stopped = false;
  api.onStop(() => { stopped = true; });
  f.listeners.emit(IPC.captureWorkerStop, {});
  assert.equal(stopped, true);
  const report = { kind: 'muted', captureGeneration: 7, timestamp: 1000 } as const;
  api.report(report);
  assert.deepEqual(f.reports, [[IPC.captureWorkerReport, report]]);
});

test('bundled overlay preload initializes without local module imports', () => {
  assert.doesNotThrow(() => loadPreload('overlay'));
});
