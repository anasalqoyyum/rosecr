const fs = require('node:fs');
const path = require('node:path');
const { CAPTURE_SCOPES, DIRECTIONS, SHORTCUT_ACTIONS, isRecord } = require('../shared/contracts');

const DEFAULT_SETTINGS = Object.freeze({
  direction: 'ja-en',
  scope: 'region',
  overlayVisible: true,
  shortcuts: Object.freeze({
    play: 'CommandOrControl+Alt+P',
    auto: null,
    overlay: 'CommandOrControl+Alt+O',
    clear: null
  })
});

/** @returns {{ direction: import('../shared/contracts').Direction, scope: import('../shared/contracts').CaptureScope, overlayVisible: boolean, shortcuts: Record<import('../shared/contracts').ShortcutAction, string | null> }} */
function cloneDefaults() {
  return { ...DEFAULT_SETTINGS, shortcuts: { ...DEFAULT_SETTINGS.shortcuts } };
}

/** @param {unknown} value */
function sanitizeSettings(value) {
  const result = cloneDefaults();
  if (!isRecord(value)) return result;

  if (DIRECTIONS.includes(/** @type {import('../shared/contracts').Direction} */ (value.direction))) {
    result.direction = /** @type {import('../shared/contracts').Direction} */ (value.direction);
  }
  if (CAPTURE_SCOPES.includes(/** @type {import('../shared/contracts').CaptureScope} */ (value.scope))) {
    result.scope = /** @type {import('../shared/contracts').CaptureScope} */ (value.scope);
  }
  if (typeof value.overlayVisible === 'boolean') result.overlayVisible = value.overlayVisible;
  if (isRecord(value.shortcuts)) {
    for (const action of SHORTCUT_ACTIONS) {
      const accelerator = value.shortcuts[action];
      if (accelerator === null || typeof accelerator === 'string') result.shortcuts[action] = accelerator || null;
    }
  }
  return result;
}

class SettingsStore {
  /** @param {string} directory */
  constructor(directory) {
    this.filePath = path.join(directory, 'settings.json');
  }

  load() {
    try {
      return sanitizeSettings(JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT' && error instanceof SyntaxError === false) {
        throw error;
      }
      return cloneDefaults();
    }
  }

  /** @param {ReturnType<typeof sanitizeSettings>} settings */
  save(settings) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(sanitizeSettings(settings), null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }
}

module.exports = { DEFAULT_SETTINGS, SettingsStore, cloneDefaults, sanitizeSettings };
