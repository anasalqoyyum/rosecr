# TODO-002 Launch bundled Python sidecar and show OCR health in the app

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `runtime`
- `ocr`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Add Python sidecar supervision to the Electron app so the desktop shell can launch the OCR backend, verify health, and surface backend status in the utility bar or settings diagnostics. This should prove the Electron-to-Python packaging assumption in a user-visible way.

## Acceptance criteria

- [ ] The Electron main process starts the Python sidecar and can detect whether it is healthy or unavailable.
- [ ] The app shows OCR backend health in a visible UI surface instead of failing silently.
- [ ] If the sidecar fails to start or exits unexpectedly, the app surfaces a recoverable status rather than crashing outright.

## Blocked by

- TODO-001

## User stories addressed

- User story 9
- User story 38
- User story 41
- User story 42

## Notes

The concrete transport can remain flexible, but the sidecar contract should be narrow and restartable.
