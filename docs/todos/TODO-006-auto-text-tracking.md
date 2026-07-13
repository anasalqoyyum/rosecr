# TODO-006 Add Auto, text tracking, and stale-result protection

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `tracking`
- `realtime`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Turn the one-shot pipeline into reliable continuous Auto translation with stable box identities, progressive-text debounce, confidence confirmation, disappearance grace, cancellation, failure recovery, and local one-shot overlay cleanup.

## Acceptance criteria

- [ ] Enabling Auto immediately starts continuous change-driven work without Play, and a fresh Rosecr process always starts with Auto off.
- [ ] Balanced mode waits about 300 ms after text changes; low-confidence text requires two matching scans and one missed scan does not remove an overlay.
- [ ] Source generations prevent cancelled, failed, late, or obsolete translations from overwriting current text.
- [ ] A changed in-flight box retriggers translation, while completed overlays remain dimmed with an updating indicator until replaced.
- [ ] Transient provider failure retries once after the defined short delay; permanent or repeated failure reveals current source and an actionable error.
- [ ] One-shot or disabled-Auto overlays clear through local frame-difference watching without new OCR or provider calls.

## Blocked by

- TODO-005

## User stories addressed

- User story 15
- User story 16
- User story 43
- User story 44
- User story 46
- User story 47
- User story 48
- User story 49
- User story 52
- User story 53

## Notes

Provider cancellation saves work, but generation validation is the correctness boundary.
