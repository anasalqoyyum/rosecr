import type { BrowserWindow, Rectangle, WebContents } from 'electron';
import { isRecord } from '../shared/contracts';
import { DEFAULT_REGION, parseNormalizedRegion, type NormalizedRegion } from '../shared/region';

export type RegionSelection = { kind: 'confirmed'; region: NormalizedRegion } | { kind: 'cancelled' };

export interface RegionSelectorInit {
  region: NormalizedRegion;
  defaultRegion: NormalizedRegion;
}

export function parseRegionSelection(value: unknown): RegionSelection | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'cancelled') return { kind: 'cancelled' };
  if (value.kind !== 'confirmed') return null;
  const region = parseNormalizedRegion(value.region);
  return region ? { kind: 'confirmed', region } : null;
}

interface Session {
  window: BrowserWindow;
  init: RegionSelectorInit;
  result: Promise<RegionSelection>;
  settle(selection: RegionSelection): void;
}

/**
 * Owns the temporary interactive window drawn exactly over the game's client area. Because the
 * window covers only the client area, every pointer position maps directly to a normalized point.
 */
export class RegionSelector {
  private session: Session | null = null;

  constructor(private readonly createWindow: () => BrowserWindow) {}

  /**
   * `covering` is a Rosecr window that may sit over the game. It is hidden only after the selector
   * has focus, so Windows does not hand the foreground to another app first, and shown again afterwards.
   */
  open({ clientBounds, savedRegion, covering }: {
    clientBounds: Rectangle;
    savedRegion: NormalizedRegion | null;
    covering: BrowserWindow | null;
  }): Promise<RegionSelection> {
    if (this.session) {
      this.session.window.focus();
      return this.session.result;
    }
    const window = this.createWindow();
    const restoreCovering = covering?.isVisible() ? covering : null;
    let settle!: (selection: RegionSelection) => void;
    const result = new Promise<RegionSelection>((resolve) => { settle = resolve; });
    const session: Session = {
      window,
      init: { region: savedRegion ?? { ...DEFAULT_REGION }, defaultRegion: { ...DEFAULT_REGION } },
      result,
      settle: (selection) => {
        if (this.session !== session) return;
        this.session = null;
        settle(selection);
        if (!window.isDestroyed()) window.close();
        if (restoreCovering && !restoreCovering.isDestroyed()) restoreCovering.show();
      }
    };
    this.session = session;
    window.setBounds(clientBounds, false);
    // Any focus change could let the game move underneath the selector, so it ends the selection.
    window.on('blur', () => session.settle({ kind: 'cancelled' }));
    window.on('closed', () => session.settle({ kind: 'cancelled' }));
    window.once('ready-to-show', () => {
      window.show();
      window.focus();
      restoreCovering?.hide();
    });
    return result;
  }

  initFor(sender: WebContents): RegionSelectorInit | null {
    return this.ownedBy(sender)?.init ?? null;
  }

  finish(sender: WebContents, payload: unknown): void {
    const selection = parseRegionSelection(payload);
    if (selection) this.ownedBy(sender)?.settle(selection);
  }

  cancel(): void {
    this.session?.settle({ kind: 'cancelled' });
  }

  private ownedBy(sender: WebContents): Session | null {
    return this.session && this.session.window.webContents === sender ? this.session : null;
  }
}
