# TODO-013 Add checksum-verified onboarding and one-shot validation

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `onboarding`
- `assets`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Create a first-run flow that explains privacy, installs verified OCR assets, signs in to Codex, selects model, reasoning, direction, game, and scope, then proves the setup with one one-shot translation while leaving Auto off.

## Acceptance criteria

- [ ] OCR asset downloads show size and version, resume or retry, verify a published checksum, and preserve the previous valid asset set after failure.
- [ ] Play and Auto stay disabled until required assets, capture permission, target, direction, model, and authentication are ready.
- [ ] Onboarding covers the complete PRD sequence without exposing deferred providers or inspect features.
- [ ] The final validation displays a real one-shot translation and exits onboarding with Auto disabled.
- [ ] Restarting interrupted onboarding resumes safely without erasing an already saved game region or valid assets.

## Blocked by

- TODO-003
- TODO-011
- TODO-012

## User stories addressed

- User story 40
- User story 41
- User story 50
- User story 52
- User story 62

## Notes

Keep advanced OCR controls out of first-run setup. The goal is a verified safe default, not feature education.
