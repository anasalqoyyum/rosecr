const test = require('node:test');
const assert = require('node:assert/strict');
const { parseControlCommand } = require('../src/shared/contracts');

test('accepts every public control command with a valid payload', () => {
  const commands = [
    { type: 'play' },
    { type: 'set-auto', enabled: true },
    { type: 'set-overlay-visible', visible: false },
    { type: 'clear-overlays' },
    { type: 'set-direction', direction: 'en-ja' },
    { type: 'set-scope', scope: 'window' },
    { type: 'open-settings' },
    { type: 'set-shortcut', action: 'auto', accelerator: null }
  ];

  assert.deepEqual(commands.map(parseControlCommand), commands);
});

test('rejects malformed or unknown renderer commands', () => {
  for (const command of [
    null,
    { type: 'set-auto', enabled: 'yes' },
    { type: 'set-direction', direction: 'auto' },
    { type: 'set-scope', scope: 'desktop' },
    { type: 'set-shortcut', action: 'quit', accelerator: 'Alt+F4' },
    { type: 'capture-directly' }
  ]) {
    assert.throws(() => parseControlCommand(command), TypeError);
  }
});
