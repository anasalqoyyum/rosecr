# TODO-011 Add Codex model, reasoning, account, and error controls

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `codex`
- `auth`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Turn the first Codex path into a self-serve account surface that reports the signed-in account, lists supported models and reasoning efforts, tests readiness, explains failures, and signs out without exposing credentials.

## Acceptance criteria

- [ ] Settings show non-secret Codex account state and only models and reasoning values reported for that account.
- [ ] Low reasoning is the fresh default, and Rosecr never silently changes an unavailable selected model or reasoning effort.
- [ ] Auth, workspace, unsupported-model, transport, and allowance failures map to distinct actionable states while capture configuration remains intact.
- [ ] Sign-out clears provider sessions, translation context, glossary, and cache but not game or region presets.
- [ ] Raw OAuth credentials remain in the main process and never appear in logs, renderer IPC, or ordinary settings.

## Blocked by

- TODO-005

## User stories addressed

- User story 10
- User story 13
- User story 38
- User story 39
- User story 41
- User story 47
- User story 52
- User story 62

## Notes

Do not show fabricated allowance estimates. Surface usage information only when `pi-ai` or the provider reports it.
