# TODO-009 Add manual inspect mode with focused translation panel

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `inspect`
- `ui`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Add a manual inspect mode that lets the user target a recognized OCR region and open a focused panel with source text and translation. This creates the second primary reading mode called for in the PRD.

## Acceptance criteria

- [ ] The user can switch into inspect mode from the utility bar or overlay controls.
- [ ] Selecting a recognized text region opens a focused panel with the source text and translation.
- [ ] Inspect mode can be entered and exited without breaking passive overlay mode for later use.

## Blocked by

- TODO-005

## User stories addressed

- User story 24
- User story 25
- User story 31

## Notes

This slice does not need dictionary cards yet. Keep it focused on source-plus-translation inspection.
