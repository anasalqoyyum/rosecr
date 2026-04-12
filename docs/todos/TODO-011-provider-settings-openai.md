# TODO-011 Add provider settings with OpenAI BYOK and connection test

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `providers`
- `auth`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Add provider configuration UI for the first AI translation path, starting with OpenAI-compatible BYOK, secure storage, and connection testing. This should turn provider setup into a self-serve user flow instead of a code-only configuration step.

## Acceptance criteria

- [ ] The settings UI allows the user to configure OpenAI-compatible credentials through BYOK.
- [ ] Credentials are stored through a secure app-level secret mechanism rather than plain user-facing config text.
- [ ] The user can run a connection test and receive a success or failure result in the UI.

## Blocked by

- TODO-005

## User stories addressed

- User story 10
- User story 12
- User story 13
- User story 14
- User story 39
- User story 41

## Notes

OAuth support can come later if the provider path is not ready, but the settings model should not block it architecturally.
