# TODO-005 Deliver Codex OAuth one-shot translation overlays

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `translation`
- `codex`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Complete the first real product loop: authenticate an eligible Codex account through pinned `@earendil-works/pi-ai`, press Play, OCR the configured capture once, gate eligible source text, translate it, and atomically render current-generation overlays.

## Acceptance criteria

- [ ] Browser or device-code OAuth succeeds through the main process and credentials use an injected OS-protected store.
- [ ] Play performs exactly one capture, OCR, gating, translation, and overlay pass without enabling Auto.
- [ ] Japanese-to-English and English-to-Japanese directions translate only eligible source-script boxes; target-language and non-linguistic boxes remain untouched.
- [ ] Only extracted text and bounded text metadata reach Codex; screenshots and raw OAuth tokens never leave their owning boundary.
- [ ] Provider tokens are buffered off-screen and only a complete structured box-ID result matching the current generation is displayed.
- [ ] Captured text cannot change the fixed translation task, enable tools, or produce displayed commentary or Markdown.

## Blocked by

- TODO-001
- TODO-004

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

V1 has no BYOK fallback. Keep the adapter narrow enough for later provider additions without exposing `pi-ai` types to the UI.
