# TODO-004 Run supervised local OCR into aligned debug overlays

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `ocr`
- `runtime`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Connect captured game-region frames to bundled RapidOCR through a supervised Python sidecar and render positioned debug boxes so local OCR behavior, confidence, orientation, and recovery are visible end to end.

## Acceptance criteria

- [ ] Electron starts the bundled sidecar and exchanges length-delimited typed messages over private stdio without opening a localhost port.
- [ ] OCR returns text, physical-pixel boxes, confidence, orientation, and reading-order metadata for the current capture generation.
- [ ] Horizontal and vertical fixture text produces aligned debug overlays without Rosecr entering its own capture.
- [ ] One unexpected sidecar crash triggers one restart; repeated failure stops with an actionable status while preserving capture configuration.
- [ ] Timeouts, malformed messages, and stale capture generations cannot update current debug overlays.

## Blocked by

- TODO-002
- TODO-003

## User stories addressed

- User story 9
- User story 18
- User story 19
- User story 28
- User story 31
- User story 38
- User story 48
- User story 60

## Notes

This is a debug-facing tracer bullet, but it must use the production process boundary and generation model.
