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

- [x] A windowed and borderless-fullscreen test target can produce frames without becoming the foreground window.
- [x] Rosecr-owned controller and overlay windows are rejected as targets and excluded from captured frames.
- [x] The marker remains aligned after move, resize, monitor, and mixed-DPI changes and never takes focus or mouse input.
- [x] Minimized, closed, blank, or uncapturable targets enter a visible waiting state instead of emitting valid-looking frames.
- [x] The repository records the chosen backend and evidence against latency, resize, device-loss, exclusion, and alignment requirements.

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

Do not inject into, read memory from, hook, patch, or elevate into the target. A native helper is acceptable only if the Electron path fails this contract.
