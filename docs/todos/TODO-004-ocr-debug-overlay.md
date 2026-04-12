# TODO-004 Run OCR on the selected region and render source-aligned debug boxes

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `ocr`
- `overlay`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Connect region capture to the Python OCR service and render source-aligned OCR debug boxes in the overlay layer. The user should be able to see that the app recognizes text regions on screen, even before translation is introduced.

## Acceptance criteria

- [ ] The app runs OCR against the currently selected region and receives text boxes, text, and confidence data.
- [ ] The overlay window renders OCR-aligned boxes in the correct approximate positions over the source area.
- [ ] The app can handle both horizontal and vertical text at a baseline level without breaking overlay placement.

## Blocked by

- TODO-002
- TODO-003

## User stories addressed

- User story 2
- User story 6
- User story 17
- User story 18
- User story 19
- User story 31

## Notes

This is intentionally a debug-flavored slice, but it still provides end-to-end value by proving the OCR-to-overlay path.
