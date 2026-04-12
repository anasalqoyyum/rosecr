# TODO-015 Strengthen vertical-text heuristics and reading-order cleanup

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `ocr`
- `japanese`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Improve the OCR preprocessing and text cleanup path for Japanese content, especially vertical text and reading order, so the translated overlay becomes more trustworthy on manga-like layouts and mixed orientation content.

## Acceptance criteria

- [ ] OCR output for vertical Japanese text is more stable or correctly ordered on representative fixtures than the baseline implementation.
- [ ] Japanese-aware cleanup reduces common OCR artifacts before translation without breaking the basic pipeline.
- [ ] Improvements are visible in the overlay translation experience, not just in backend logs or raw OCR dumps.

## Blocked by

- TODO-004
- TODO-005

## User stories addressed

- User story 18
- User story 27
- User story 28

## Notes

This slice should stay short of heavy document reconstruction, which remains out of scope for the initial release.
