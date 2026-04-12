# TODO-013 Add onboarding flow for first-run setup and asset download

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `onboarding`
- `installer`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Create a first-run onboarding flow that downloads required OCR assets, lets the user choose a target language and provider path, and gets them to a working default setup. This slice should make the product usable by someone who did not participate in development.

## Acceptance criteria

- [ ] A fresh app run can enter a setup flow instead of dropping the user into an unconfigured experience.
- [ ] The onboarding flow can download required OCR assets or clearly surface download progress and failure.
- [ ] The flow ends in a working default configuration that allows the user to start reading immediately.

## Blocked by

- TODO-002
- TODO-011

## User stories addressed

- User story 40
- User story 41

## Notes

Keep onboarding short. It should produce a working baseline, not teach every advanced setting.
