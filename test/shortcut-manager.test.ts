import assert from 'node:assert/strict';
import test from 'node:test';
import { ShortcutManager } from '../src/main/shortcut-manager';
import type { ShortcutAction } from '../src/shared/contracts';

test('disabled shortcuts are skipped and OS registration conflicts are surfaced', () => {
  const registered: string[] = [];
  let unregisterCount = 0;
  const fakeGlobalShortcut = {
    register(accelerator: string) {
      registered.push(accelerator);
      return accelerator !== 'Ctrl+Alt+O';
    },
    unregisterAll() {
      unregisterCount += 1;
    }
  };
  const manager = new ShortcutManager(fakeGlobalShortcut, () => {});
  const conflicts = manager.register({
    play: 'Ctrl+Alt+P',
    auto: null,
    overlay: 'Ctrl+Alt+O',
    clear: null
  });

  assert.equal(unregisterCount, 1);
  assert.deepEqual(registered, ['Ctrl+Alt+P', 'Ctrl+Alt+O']);
  assert.deepEqual(conflicts, { overlay: 'Ctrl+Alt+O is already in use' });
});

test('shortcut callbacks use the same action dispatch path as the UI', () => {
  const callbacks = new Map<string, () => void>();
  const actions: ShortcutAction[] = [];
  const manager = new ShortcutManager(
    {
      register(accelerator, callback) {
        callbacks.set(accelerator, callback);
        return true;
      },
      unregisterAll() {}
    },
    (action) => actions.push(action)
  );
  manager.register({ play: 'P', auto: null, overlay: null, clear: null });
  const callback = callbacks.get('P');
  assert.ok(callback);
  callback();
  assert.deepEqual(actions, ['play']);
});
