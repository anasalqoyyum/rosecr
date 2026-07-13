import { SHORTCUT_ACTIONS, type ShortcutAction } from '../shared/contracts';

interface GlobalShortcutAdapter {
  register(accelerator: string, callback: () => void): boolean;
  unregisterAll(): void;
}

export class ShortcutManager {
  constructor(
    private readonly globalShortcut: GlobalShortcutAdapter,
    private readonly dispatch: (action: ShortcutAction) => void
  ) {}

  register(shortcuts: Record<ShortcutAction, string | null>): Partial<Record<ShortcutAction, string>> {
    this.globalShortcut.unregisterAll();
    const conflicts: Partial<Record<ShortcutAction, string>> = {};

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
