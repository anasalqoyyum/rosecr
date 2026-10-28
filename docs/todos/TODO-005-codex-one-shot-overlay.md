# TODO-005 Deliver Kenari one-shot translation overlays

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `translation`
- `kenari`

## Parent PRD

`desktop-ocr-translator-prd.md` is authoritative.

## What to build

Connect the user's Kenari account and plan to the first real product loop. After key setup, explicit model selection, and the user's confirmation that their plan covers that model, Play captures the configured area once, runs OCR, gates eligible source text, translates it through built-in `fetch` in the main process, and atomically renders current-generation overlays.

## Proof prerequisite

Issue #4 first tracks a synthetic text-only Kenari proof probe. It uses fixed synthetic input independently of live capture, OCR, and overlays. It requires a Kenari `kn-` key, an explicitly selected model, and the user's confirmation of plan coverage before any manually initiated live request. This task description neither runs the probe nor claims live validation.

Tools, screenshots, user game text, batching, cache, session context/glossary, and the full settings UI are deferred from that probe. It establishes only the narrow request/response and failure contract. Completing it does not complete this production slice.

## Acceptance criteria for later production integration

- [ ] A Kenari `kn-` key stays in the main process with OS-protected storage. Requests use built-in `fetch`, with no `pi-ai` dependency, Codex OAuth, imported credentials, or Platform API-key substitution.
- [ ] The user confirms plan coverage for the selected model before cloud translation. Changing the key/account or model requires a new confirmation. A successful request alone is not proof of coverage.
- [ ] Account-specific model access and capabilities use account-scoped Kenari reports when available. A static global catalog cannot establish them. Unknown optional capabilities remain unset, including reasoning parameters.
- [ ] Play performs exactly one capture, OCR, gating, translation, and overlay pass without enabling Auto.
- [ ] Japanese-to-English and English-to-Japanese directions translate only eligible source-script boxes; target-language and non-linguistic boxes remain untouched.
- [ ] Only eligible extracted text and bounded text metadata/context reach Kenari after an explicit Play or Auto action. Screenshots never reach the provider. Keys never reach the renderer or diagnostic output.
- [ ] Partial provider output stays off-screen. Only a complete validated structured box-ID result matching the current generation is displayed.
- [ ] Captured text cannot change the fixed translation task, enable tools, or produce displayed commentary or Markdown.
- [ ] Provider failure preserves capture configuration and never silently changes the selected model, reasoning effort, or billing route.

## Blocked by

- Synthetic Kenari proof gate in issue #4
- TODO-001
- TODO-004

These dependencies gate production integration. The synthetic probe itself does not depend on capture or OCR.

## User stories addressed

- User story 1
- User story 6
- User story 10
- User story 13
- User story 24
- User story 34
- User story 39
- User story 45
- User story 62
- User story 63

## Notes

V1 has no BYOK fallback. Keep Kenari transport and credential handling behind Rosecr's provider interface. Batching, cache, and session context/glossary remain later production work under the PRD, separate from the synthetic proof. Full account/settings controls belong to TODO-011. The existing filename is retained for references.
