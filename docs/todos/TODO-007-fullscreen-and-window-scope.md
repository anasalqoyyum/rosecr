# TODO-007 Support fullscreen and active-window capture from the utility bar

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `capture`
- `scope`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Extend the working translation loop to the remaining core capture scopes: fullscreen and active-window. The user should be able to switch scopes from the utility bar and keep using the same OCR and overlay pipeline.

## Acceptance criteria

- [ ] The utility bar exposes region, fullscreen, and active-window as usable scope options.
- [ ] Fullscreen capture and active-window capture flow through the same OCR and overlay pipeline used by region capture.
- [ ] Switching scopes updates visible app state and does not require restarting the app.

## Blocked by

- TODO-005

## User stories addressed

- User story 4
- User story 5
- User story 32
- User story 33

## Notes

Avoid expanding into every edge case of protected or unusual windows in this slice.
