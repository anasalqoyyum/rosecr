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

## Implementation status

[PR #12](https://github.com/anasalqoyyum/rosecr/pull/12) merged the sidecar portion.

- [x] RapidOCR returns text, physical-pixel rectangles, confidence, orientation, reading order, and capture generation over a length-delimited private stdio protocol.
- [x] The supervisor handles timeouts, malformed messages, stale generations, one automatic restart, and restart-budget refill after five healthy minutes. Windows test results and fixture benchmarks are recorded in [the sidecar documentation](../ocr-sidecar.md).
- [ ] Start and own the sidecar from the application main process when OCR is requested.
- [ ] Feed native helper frames into OCR and render aligned debug boxes with generation checks.
- [ ] Validate live alignment, capture exclusion, and recovery without losing the saved target or region.

## Acceptance criteria

The full application paths below remain unchecked until integration and live Windows validation are complete.

- [ ] Electron starts the bundled sidecar and exchanges length-delimited typed messages over private stdio without opening a localhost port.
- [ ] OCR returns text, physical-pixel boxes, confidence, orientation, and reading-order metadata for the current capture generation.
- [ ] Horizontal and vertical fixture text produces aligned debug overlays without Rosecr entering its own capture.
- [ ] One unexpected sidecar crash triggers one restart; repeated failure stops with an actionable status while preserving capture configuration.
- [ ] Timeouts, malformed messages, and stale capture generations cannot update current debug overlays.

## Blocked by

- TODO-002's recorded backend decision
- TODO-003
- TODO-021

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

Frames come from the native helper's `FrameSource`, not Electron `getUserMedia` frames. [TODO-021](TODO-021-native-windows-capture-helper.md) delivers and proves the helper's minimal frame path before live integration in this slice. The sidecar work already merged does not depend on that frame source. See `docs/native-helper-decision.md`.
