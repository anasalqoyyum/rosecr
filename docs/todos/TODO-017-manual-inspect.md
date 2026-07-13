# TODO-017 Add manual inspect mode

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `deferred`
- `inspect`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

After v1, add an explicit interactive mode that temporarily makes recognized regions selectable and opens a focused source-and-translation panel without changing passive overlay behavior.

## Acceptance criteria

- [ ] Inspect mode is clearly separated from normal click-through overlay operation.
- [ ] Selecting a recognized region opens its current source and translation in a focused panel.
- [ ] Leaving inspect restores non-focusable click-through overlays and game input.

## Blocked by

- TODO-005
- V1 release

## User stories addressed

- User story 25

## Notes

Deferred. Do not add inspect controls to v1 navigation or release criteria.
