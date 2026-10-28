# TODO-021 Build and prove the native Windows capture helper

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `capture`
- `windows`
- `runtime`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Implement the native Windows helper selected by M0 and scoped in [the frame-source decision](../native-helper-decision.md). Capture one explicitly selected window through a helper-owned Windows.Graphics.Capture session, return BGRA8 client-area or region pixels with matching physical geometry, and show an aligned passive marker through Electron. This proves the production frame path before TODO-004 connects it to the existing OCR sidecar.

This is M1 work. The identifier follows the existing todos without renumbering them; it is not a deferred slice.

## Implementation status

Tracking issue: [#13](https://github.com/anasalqoyyum/rosecr/issues/13).

Not implemented. The current application uses the Electron capture worker and PowerShell metadata probe. The native toolchain recommendation still needs the Windows spike described in the decision record.

## Acceptance criteria

- [ ] A bundled x64 helper enumerates and queries windows, rejects Rosecr-owned targets, and exposes target visibility, minimized state, DPI, and client bounds without injection or elevation.
- [ ] The helper owns one explicit WGC session and supplies requested client-area or region BGRA8 frames over private length-prefixed stdio, without a localhost service or a desktop-capture fallback.
- [ ] Each frame carries its capture generation, physical dimensions, crop origin, matching client-geometry snapshot, and capture timestamp. The Electron adapter rejects obsolete frames before updating the marker or passing pixels downstream.
- [ ] The main-process metadata and frame-source boundaries use the helper. Electron `getUserMedia` and the PowerShell probe are removed from the production path; development probes may remain.
- [ ] Windowed and borderless targets capture without foreground activation. Movement, resize, and mixed-DPI changes invalidate old geometry, and the passive marker reappears only with a fresh matching frame without taking focus or mouse input.
- [ ] Minimized, closed, blank, and protected targets enter a visible waiting state, clear visible output, and preserve the saved game and region. The helper reports lifecycle and device-loss events and recovers its own WGC device/session from a tested loss.
- [ ] Protocol and adapter checks cover malformed or oversized frames, mismatched geometry or generation, and helper failure without erasing capture configuration.
- [ ] Windows evidence records first-frame latency and grab round trips for full-window and region capture at 2560×1440, capture-border behavior, and all three evidence items in [issue #9](https://github.com/anasalqoyyum/rosecr/issues/9). Exclusion is checked with Rosecr windows over the target, including a run with their content protection disabled.

## Dependencies

- TODO-001 provides the shell and passive overlay.
- TODO-002's backend decision is recorded. Its remaining evidence is produced here and tracked in issue #9, rather than blocking this helper behind evidence that requires it.
- Reuse TODO-003's saved target and normalized region when integrating the application.

## Follow-up slices

- TODO-004 consumes this frame source for live local OCR and debug boxes.
- TODO-007 adds HDR handling, display-topology recovery, and production reattachment to this same backend.
- TODO-016 packages and signs the helper with the application and executes the full release gate.

## User stories addressed

- User story 2
- User story 5
- User story 31
- User story 54
- User story 55
- User story 56
- User story 57

## Notes

Keep OCR, frame comparison, translation, and overlay composition outside the helper. Rust with the Microsoft `windows` crate is the existing recommendation, not an already validated toolchain choice. Windows execution is required to close the live acceptance criteria; unit tests on Linux cannot establish WGC behavior.
