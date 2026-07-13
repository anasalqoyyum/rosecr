# TODO-015 Strengthen Japanese orientation, cleanup, and direction gating

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `ocr`
- `japanese`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Improve the production OCR-to-translation path on representative horizontal, vertical, progressive, and mixed-language game fixtures so reading order and source gating are reliable without expanding into full document reconstruction.

## Acceptance criteria

- [ ] Horizontal and vertical Japanese fixtures produce stable reading order and fewer common OCR artifacts than the baseline from TODO-004.
- [ ] Japanese-to-English and English-to-Japanese gates preserve target-language-only, numeric, symbolic, and non-linguistic boxes.
- [ ] Mixed-language target spans remain untouched when OCR geometry supports reliable separation.
- [ ] Low-confidence fixtures follow two-scan confirmation and unstable partial text never enters context or glossary.
- [ ] The evaluation set includes Kiseki-style dialogue, menus, logs, 1080p, 1440p, and 4K examples without adding heavy paragraph reconstruction.

## Blocked by

- TODO-004
- TODO-006
- TODO-009

## User stories addressed

- User story 18
- User story 19
- User story 27
- User story 28
- User story 34
- User story 48

## Notes

Record fixture baselines and improvements so release thresholds cannot be weakened silently.
