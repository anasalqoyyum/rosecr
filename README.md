# rosecr

Windows-first OCR translation overlays for Japanese and English video games.

Rosecr targets a selected game window in windowed or borderless-fullscreen mode, runs OCR locally, translates eligible text through the user's Codex subscription, and replaces source text with a click-through overlay. Users can translate the current capture once with Play or enable Auto for continuous change-driven translation. Auto always starts disabled.

## V1 scope

- Windows 11 x64 primary target
- Selected region or whole selected game window
- Japanese to English and English to Japanese
- Local `owocr` processing through a bundled Python sidecar
- Codex subscription OAuth through a pinned `@earendil-works/pi-ai` adapter
- Source-replacement overlays with stale-result protection and collision handling
- No game injection, memory reading, or text hooks

Exclusive fullscreen, whole-desktop capture, manual inspect, dictionary cards, offline CAT-Translate, DeepL, Google Translate, and BYOK providers are deferred.

## Documentation

- [Product requirements](desktop-ocr-translator-prd.md)
- [Technical architecture](docs/architecture.md)
- [UI direction](docs/ui-direction.md)
- [Wireframes](docs/wireframes.md)
- [Design foundation](docs/design-foundation.html), with tokens in [DESIGN.md](DESIGN.md) and product context in [PRODUCT.md](PRODUCT.md)
- [Implementation milestones](docs/milestones.md)
- [Vertical-slice todos](docs/todos/README.md)

The PRD is authoritative when planning documents disagree.

## Development

Rosecr uses TypeScript and pnpm 10.

```powershell
pnpm install
pnpm run typecheck
pnpm test
pnpm start
```

## Status

Milestone 0 is mostly complete. The Electron utility shell and executable Windows capture spike pass windowed and borderless game capture, target rejection, click-through input, movement, resizing, mixed-DPI and monitor changes, minimization, and target loss. The spike records that production requires a thin native Windows helper for explicit WGC lifecycle, metadata, and device-loss recovery. Captured-output exclusion, a live protected-target run, and device-loss evidence are still open.
