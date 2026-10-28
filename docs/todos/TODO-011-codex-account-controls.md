# TODO-011 Add Kenari model, reasoning, account, and error controls

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `kenari`
- `auth`

## Parent PRD

`desktop-ocr-translator-prd.md` is authoritative.

## What to build

Add production settings for the Kenari account/plan path after the synthetic proof and one-shot integration. Let the user configure or remove their `kn-` key, select a model, confirm that their plan covers it, inspect reported capabilities, explicitly test readiness, and understand failures without exposing credentials.

The full settings UI is deferred from the synthetic probe in issue #4. That probe needs only explicit model selection and plan confirmation for synthetic text; it does not establish that these production controls exist.

## Acceptance criteria

- [ ] Settings show non-secret Kenari configuration/account state. Use account-scoped provider reports for model access and capabilities when available; a static global catalog cannot establish what this account can use.
- [ ] If account discovery is unavailable, the user can explicitly select a model and confirm plan coverage without Rosecr inventing account metadata or supported options. Readiness reports what was checked and what remains unknown.
- [ ] The user confirms plan coverage for the exact selected model before a request. Key/account or model changes invalidate that confirmation. Key validity, model visibility, and a successful response do not establish billing coverage.
- [ ] Reasoning choices appear only when reported for the selected account/model. Low reasoning is the fresh default only when supported; omit the parameter when unsupported or unknown. Never silently replace an unavailable selected model or reasoning effort.
- [ ] Invalid-key, plan/access, unsupported-model or option, transport, and allowance failures map to distinct actionable states when the provider supplies enough information. Unknown failures stay unknown, and capture configuration remains intact.
- [ ] Removing or replacing the key cancels active requests, disables Auto, and clears account-bound provider state, plan confirmation, translation context, glossary, and cache while preserving game and region presets.
- [ ] The key stays in OS-protected main-process storage and never appears in logs, renderer IPC, diagnostic exports, or ordinary settings. Requests use built-in `fetch`; there is no Codex OAuth or Platform API-key fallback.
- [ ] Readiness checks send only fixed synthetic text after explicit user action and selected-model plan confirmation. Opening settings or restoring configuration never starts cloud translation.

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

Show usage information only when Kenari reports it for the configured account. Do not fabricate allowance estimates or infer plan coverage from a catalog or a successful probe. Tools, screenshots, and user game text remain excluded from readiness probes. Batching, cache, and glossary behavior belong to later production integration under the PRD. The existing filename is retained for references.
