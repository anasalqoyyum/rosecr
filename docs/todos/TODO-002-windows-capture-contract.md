# TODO-002 Prove the Windows game-capture and overlay contract

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `capture`
- `windows`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Implement a narrow executable spike that captures one explicitly selected window and renders a harmless aligned click-through marker. Use it to decide whether Electron satisfies the Windows capture contract or a thin native helper is required for v1.

## Acceptance criteria

M0 tracking issue #1 is closed. The unchecked evidence below remains open in [#9](https://github.com/anasalqoyyum/rosecr/issues/9). TODO-021 implements and proves the production helper; this spike's partial evidence must not be treated as full production validation.

- [x] A windowed and borderless-fullscreen test target can produce frames without becoming the foreground window.
- [ ] Rosecr-owned controller and overlay windows are rejected as targets and excluded from captured frames.
  - Target rejection is proven. Frame exclusion currently rests on content protection being enabled; captured output has not been inspected with Rosecr windows over the target.
- [x] The marker remains aligned after move, resize, monitor, and mixed-DPI changes and never takes focus or mouse input.
- [ ] Minimized, closed, blank, or uncapturable targets enter a visible waiting state instead of emitting valid-looking frames.
  - Minimized and closed targets passed live. Blank and uncapturable targets are covered by automated tests only; a live protected-target run is still required.
- [ ] The repository records the chosen backend and evidence against latency, resize, device-loss, exclusion, and alignment requirements.
  - The backend decision and latency, resize, and alignment evidence are recorded. Device-loss evidence is pending the native helper, and exclusion evidence is partial (see above).

## Blocked by

- TODO-001

## User stories addressed

- User story 2
- User story 5
- User story 31
- User story 54
- User story 55
- User story 56
- User story 57

## Notes

Do not inject into, read memory from, hook, patch, or elevate into the target. M0 found that Electron alone does not meet the production contract. [TODO-021](TODO-021-native-windows-capture-helper.md) owns the native WGC implementation; TODO-007 extends that backend later.
