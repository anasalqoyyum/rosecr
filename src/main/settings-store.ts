import fs from 'node:fs';
import path from 'node:path';
import {
  CAPTURE_SCOPES,
  DIRECTIONS,
  SHORTCUT_ACTIONS,
  isRecord,
  type CaptureScope,
  type Direction,
  type ShortcutAction
} from '../shared/contracts';
import { parseNormalizedRegion, type NormalizedRegion } from '../shared/region';
import { parseSavedGameTarget, type SavedGameTarget } from './game-target';

export interface DurableSettings {
  direction: Direction;
  scope: CaptureScope;
  overlayVisible: boolean;
  shortcuts: Record<ShortcutAction, string | null>;
  target: SavedGameTarget | null;
  region: NormalizedRegion | null;
}

export const DEFAULT_SETTINGS: Readonly<DurableSettings> = Object.freeze({
  direction: 'ja-en',
  scope: 'region',
  overlayVisible: true,
  shortcuts: Object.freeze({
    play: 'CommandOrControl+Alt+P',
    auto: null,
    overlay: 'CommandOrControl+Alt+O',
    clear: null
  }),
  target: null,
  region: null
});

export function cloneDefaults(): DurableSettings {
  return { ...DEFAULT_SETTINGS, shortcuts: { ...DEFAULT_SETTINGS.shortcuts } };
}

export function sanitizeSettings(value: unknown): DurableSettings {
  const result = cloneDefaults();
  if (!isRecord(value)) return result;

  if (DIRECTIONS.includes(value.direction as Direction)) result.direction = value.direction as Direction;
  if (CAPTURE_SCOPES.includes(value.scope as CaptureScope)) result.scope = value.scope as CaptureScope;
  if (typeof value.overlayVisible === 'boolean') result.overlayVisible = value.overlayVisible;
  result.target = parseSavedGameTarget(value.target);
  result.region = parseNormalizedRegion(value.region);
  if (isRecord(value.shortcuts)) {
    for (const action of SHORTCUT_ACTIONS) {
      const accelerator = value.shortcuts[action];
      if (accelerator === null || typeof accelerator === 'string') result.shortcuts[action] = accelerator || null;
    }
  }
  return result;
}

export class SettingsStore {
  private readonly filePath: string;

  constructor(directory: string) {
    this.filePath = path.join(directory, 'settings.json');
  }

  load(): DurableSettings {
    try {
      return sanitizeSettings(JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      return cloneDefaults();
    }
  }

  save(settings: DurableSettings): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(sanitizeSettings(settings), null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }
}
