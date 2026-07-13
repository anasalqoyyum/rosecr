# TODO-019 Add offline CAT-Translate

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `deferred`
- `local-translation`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

In the release after v1, add CAT-Translate behind the existing translation contract as an offline English-Japanese option with explicit model installation, capabilities, and quality disclosure.

## Acceptance criteria

- [ ] Users can install and select a compatible CAT-Translate model without Codex authentication.
- [ ] Offline translation uses the existing batching, generation, cache, error, and overlay contracts where supported.
- [ ] The UI clearly reports local model size, direction support, performance, and context limitations.

## Blocked by

- TODO-005
- V1 release

## User stories addressed

- User story 11
- User story 12
- User story 37

## Notes

Deferred to the next release. Do not substitute Argos Translate into v1.
