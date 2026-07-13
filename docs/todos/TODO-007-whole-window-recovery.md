# TODO-007 Add durable whole-game-window capture and display recovery

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `capture`
- `windows`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Extend the working Auto pipeline from a saved region to the whole selected game window, including windowed and borderless-fullscreen operation, mixed-DPI movement, resizing, HDR normalization, temporary loss, and automatic reattachment.

## Acceptance criteria

- [ ] Region and whole-game-window scope switch through the same tracking, OCR, translation, and overlay pipeline without following the foreground app.
- [ ] Whole-window overlays remain aligned after move, resize, display-topology, and mixed-DPI changes.
- [ ] HDR or advanced-color frames are normalized for OCR or surface a visible compatibility warning rather than silently producing washed-out input.
- [ ] Minimize, close, device loss, or temporary capture failure clears overlays, preserves setup, enters waiting, and resumes after a unique target returns.
- [ ] Exclusive fullscreen and whole-desktop capture do not appear as v1 options.

## Blocked by

- TODO-003
- TODO-004
- TODO-006

## User stories addressed

- User story 4
- User story 5
- User story 31
- User story 33
- User story 50
- User story 56
- User story 57

## Notes

If TODO-002 selected a native helper, this slice completes its production integration rather than creating a second backend.
