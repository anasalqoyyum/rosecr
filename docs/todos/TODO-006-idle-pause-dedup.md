# TODO-006 Add smart idle pause and changed-text deduplication

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `performance`
- `translation`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Improve the realtime loop so it avoids unnecessary OCR and translation when the screen image or OCR text has not materially changed. This should show up as user-visible stability and lower churn in the app, not just backend optimization.

## Acceptance criteria

- [ ] The app can detect unchanged frames or unchanged OCR text and skip redundant work.
- [ ] The utility bar or diagnostics surface reflects paused, idle, or active capture state clearly enough for the user to understand behavior.
- [ ] Realtime translation behavior becomes visibly more stable on static content without losing responsiveness when the content changes.

## Blocked by

- TODO-005

## User stories addressed

- User story 7
- User story 8
- User story 15
- User story 16
- User story 23
- User story 30

## Notes

This slice should implement the layered throttling model from the architecture doc, but only as much as needed to produce a better user-facing realtime loop.
