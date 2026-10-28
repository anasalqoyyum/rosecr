# rosecr

Windows-first OCR translation overlays for Japanese and English video games.

Rosecr targets a selected game window in windowed or borderless-fullscreen mode, runs OCR locally, translates eligible text through the user's Codex subscription, and replaces source text with a click-through overlay. Users can translate the current capture once with Play or enable Auto for continuous change-driven translation. Auto always starts disabled.

## V1 scope

- Windows 11 x64 primary target
- Selected region or whole selected game window
- Japanese to English and English to Japanese
- Local RapidOCR processing with PP-OCR models through a bundled Python sidecar
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
- [OCR sidecar](docs/ocr-sidecar.md)
- [Native capture helper plan](docs/todos/TODO-021-native-windows-capture-helper.md)

The PRD is authoritative when planning documents disagree.

## Development

Rosecr uses TypeScript and pnpm 10. The OCR sidecar uses Python 3.12 through uv; see [OCR sidecar](docs/ocr-sidecar.md).

```powershell
pnpm install
uv sync --directory sidecar
pnpm run typecheck
pnpm test
pnpm test:ocr
pnpm start
```

## Status

M0 tracking is closed. Its Electron utility shell and capture spike have recorded Windows evidence for windowed and borderless capture, target rejection, click-through input, movement, resizing, mixed-DPI and monitor changes, minimization, and target loss. Captured-output exclusion, a live protected-target run, and device-loss evidence remain open in [#9](https://github.com/anasalqoyyum/rosecr/issues/9).

M1 is partially implemented. [PR #11](https://github.com/anasalqoyyum/rosecr/pull/11) added durable game targets and normalized regions; its Windows manual validation remains pending. [PR #12](https://github.com/anasalqoyyum/rosecr/pull/12) added the supervised RapidOCR sidecar, protocol tests, synthetic OCR fixtures, and recorded Windows benchmarks. The main application does not yet send live frames to that sidecar or render OCR boxes.

The next capture slice is TODO-021: a native Windows helper that owns the WGC session and supplies pixels with matching geometry. TODO-004 then connects helper frames to local OCR and aligned debug overlays. Codex authentication, translation, and translated overlays are not implemented.
