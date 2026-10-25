import assert from 'node:assert/strict';
import test from 'node:test';
import type { CaptureTarget } from '../src/main/control-state';
import { parseSavedGameTarget, resolveGameWindow, savedTargetFrom, type SavedGameTarget } from '../src/main/game-target';

function window(handle: string, overrides: Partial<CaptureTarget> = {}): CaptureTarget {
  return {
    id: `window:${handle}:0`, name: 'Trails through Daybreak', nativeHandle: handle, processId: 7,
    executableName: 'ed9.exe', className: 'ED9WindowClass', ...overrides
  };
}

const saved: SavedGameTarget = savedTargetFrom(window('100'));

test('a returning game window with a new handle reconnects when it is the only identity match', () => {
  const returning = window('200', { processId: 9 });
  const resolution = resolveGameWindow(saved, [window('300', { executableName: 'notepad.exe', className: 'Notepad' }), returning]);
  assert.deepEqual(resolution, { kind: 'unique', window: returning });
});

test('executable names match case-insensitively and a changed title still reconnects a unique match', () => {
  const returning = window('200', { executableName: 'ED9.EXE', name: 'Trails through Daybreak - Chapter 2' });
  assert.deepEqual(resolveGameWindow(saved, [returning]), { kind: 'unique', window: returning });
});

test('multiple identity matches are narrowed by the still-open handle, then by exact title', () => {
  const original = window('100');
  const twin = window('200');
  assert.deepEqual(resolveGameWindow(saved, [twin, original]), { kind: 'unique', window: original });

  const titled = window('300');
  const launcher = window('400', { name: 'Launcher' });
  assert.deepEqual(resolveGameWindow(saved, [launcher, titled]), { kind: 'unique', window: titled });
});

test('indistinguishable matches are ambiguous and list every candidate', () => {
  const candidates = [window('200'), window('300')];
  assert.deepEqual(resolveGameWindow(saved, [window('400', { className: 'Other' }), ...candidates]), { kind: 'ambiguous', candidates });
  const retitled = [window('200', { name: 'A' }), window('300', { name: 'B' })];
  assert.deepEqual(resolveGameWindow(saved, retitled), { kind: 'ambiguous', candidates: retitled });
});

test('per-launch GUIDs in WPF class names do not block reconnection', () => {
  const wpf = savedTargetFrom(window('100', { className: 'HwndWrapper[Game;Main;e46d77f2-8a52-4a21-a410-976e0ff32347]' }));
  const relaunched = window('200', { className: 'HwndWrapper[Game;Main;0b5f6a1c-2d3e-4f50-8a9b-c0d1e2f3a4b5]' });
  assert.deepEqual(resolveGameWindow(wpf, [relaunched]), { kind: 'unique', window: relaunched });
  assert.deepEqual(resolveGameWindow(wpf, [window('300', { className: 'HwndWrapper[Other;Main;0b5f6a1c-2d3e-4f50-8a9b-c0d1e2f3a4b5]' })]), { kind: 'missing' });
});

test('a different class or executable is not the saved game', () => {
  assert.deepEqual(resolveGameWindow(saved, [window('200', { className: 'Other' }), window('300', { executableName: 'other.exe' })]), { kind: 'missing' });
  assert.deepEqual(resolveGameWindow(saved, []), { kind: 'missing' });
});

test('an unreadable executable name falls back to class and exact title', () => {
  const unreadable = savedTargetFrom(window('100', { executableName: '' }));
  const sameTitle = window('200', { executableName: '' });
  assert.deepEqual(resolveGameWindow(unreadable, [window('300', { executableName: '', name: 'Other' }), sameTitle]), { kind: 'unique', window: sameTitle });
  assert.deepEqual(resolveGameWindow(unreadable, [window('300', { executableName: '', name: 'Other' })]), { kind: 'missing' });
  assert.deepEqual(resolveGameWindow(saved, [window('200', { executableName: '' })]), { kind: 'missing' });
});

test('saved targets survive the persistence boundary and malformed values are dropped', () => {
  assert.deepEqual(parseSavedGameTarget(JSON.parse(JSON.stringify(saved))), saved);
  assert.deepEqual(saved, { executableName: 'ed9.exe', className: 'ED9WindowClass', title: 'Trails through Daybreak', lastKnownHandle: '100' });
  const unreadableClass = { ...saved, className: '' };
  assert.deepEqual(parseSavedGameTarget(unreadableClass), unreadableClass);
  for (const invalid of [null, [], { ...saved, className: 4 }, { ...saved, lastKnownHandle: undefined }]) {
    assert.equal(parseSavedGameTarget(invalid), null, JSON.stringify(invalid));
  }
});
