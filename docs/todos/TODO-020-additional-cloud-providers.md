# TODO-020 Add DeepL, Google Translate, and OpenAI-compatible BYOK

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `deferred`
- `providers`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

After v1, add separately configured DeepL, Google Translate, and OpenAI-compatible BYOK adapters behind the provider contract without conflating their credentials, billing, or context capabilities with Codex OAuth.

## Acceptance criteria

- [ ] Every provider declares direction, context, batching, auth, and rate-limit capabilities.
- [ ] Provider selection and cloud routing are explicit and affect the real translation pipeline.
- [ ] Codex OAuth tokens and Platform or third-party API keys remain separate in storage, UI, and transport.
- [ ] Contract tests cover provider-specific errors and capability differences without changing overlay semantics.

## Blocked by

- TODO-011
- V1 release

## User stories addressed

- User story 12
- User story 14
- User story 37
- User story 39

## Notes

Deferred. CAT-Translate is tracked separately in TODO-019.
