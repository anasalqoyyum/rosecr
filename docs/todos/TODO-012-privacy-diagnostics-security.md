# TODO-012 Add privacy-safe diagnostics and model-input hardening

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `security`
- `diagnostics`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Deliver a usable diagnostics and support-export flow that explains capture, OCR, and Codex failures while proving that default logs and model requests respect the PRD's privacy and untrusted-input boundaries.

## Acceptance criteria

- [ ] Default logs contain only timestamps, versions, state transitions, durations, counts, and redacted error codes.
- [ ] Default logs and exports exclude screenshots, OCR text, translations, prompts, raw responses, authorization data, and credentials.
- [ ] Optional text and image support attachments use separate unchecked consent controls and show a preview before export.
- [ ] Prompt-injection fixtures inside OCR text cannot change the translation task, expose tools, or cause malformed extra output to be displayed.
- [ ] Network inspection confirms that only eligible extracted text and bounded text context reach Codex after explicit Play or Auto action.

## Blocked by

- TODO-005
- TODO-011

## User stories addressed

- User story 9
- User story 10
- User story 36
- User story 38
- User story 39
- User story 59
- User story 63

## Notes

Diagnostics may show the in-memory glossary locally, but it remains excluded from default support exports.
