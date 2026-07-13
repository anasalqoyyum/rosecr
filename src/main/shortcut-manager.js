const { SHORTCUT_ACTIONS } = require('../shared/contracts');

class ShortcutManager {
  /**
   * @param {{ register: (accelerator: string, callback: () => void) => boolean, unregisterAll: () => void }} globalShortcut
   * @param {(action: import('../shared/contracts').ShortcutAction) => void} dispatch
   */
  constructor(globalShortcut, dispatch) {
    this.globalShortcut = globalShortcut;
    this.dispatch = dispatch;
  }

  /** @param {Record<import('../shared/contracts').ShortcutAction, string | null>} shortcuts */
  register(shortcuts) {
    this.globalShortcut.unregisterAll();
    /** @type {Partial<Record<import('../shared/contracts').ShortcutAction, string>>} */
    const conflicts = {};

    for (const action of SHORTCUT_ACTIONS) {
      const accelerator = shortcuts[action];
      if (!accelerator) continue;
      try {
        if (!this.globalShortcut.register(accelerator, () => this.dispatch(action))) {
          conflicts[action] = `${accelerator} is already in use`;
        }
      } catch {
        conflicts[action] = `${accelerator} is not a valid shortcut`;
      }
    }

    return conflicts;
  }
}

module.exports = { ShortcutManager };
