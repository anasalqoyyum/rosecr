# Desktop OCR Translator Todos

These file-backed tracer-bullet slices implement `desktop-ocr-translator-prd.md` under the shared tag `prd:desktop-ocr-translator-prd`.

The PRD is authoritative. Each v1 todo must deliver a demoable or independently verifiable user path rather than only one architectural layer.

## V1

- `TODO-001` Bootstrap the safe utility shell and runtime controls
- `TODO-002` Prove the Windows game-capture and overlay contract
- `TODO-003` Persist a game target and normalized region
- `TODO-004` Run supervised local OCR into aligned debug overlays
- `TODO-005` Deliver Codex OAuth one-shot translation overlays
- `TODO-006` Add Auto, text tracking, and stale-result protection
- `TODO-007` Add durable whole-game-window capture and display recovery
- `TODO-008` Add performance profiles and scan cadence controls
- `TODO-009` Add structured batching, bounded context, glossary, and cache
- `TODO-010` Add source replacement and collision-aware layout
- `TODO-011` Add Codex model, reasoning, account, and error controls
- `TODO-012` Add privacy-safe diagnostics and model-input hardening
- `TODO-013` Add checksum-verified onboarding and one-shot validation
- `TODO-014` Add overlay customization, accessibility, and shortcuts
- `TODO-015` Strengthen Japanese orientation, cleanup, and direction gating
- `TODO-016` Package Windows x64 and execute the v1 release gate

## Deferred

- `TODO-017` Add manual inspect mode
- `TODO-018` Add dictionary cards to inspect mode
- `TODO-019` Add offline CAT-Translate
- `TODO-020` Add DeepL, Google Translate, and OpenAI-compatible BYOK

Deferred todos are intentionally excluded from v1 milestones and release criteria.

## Dependency Flow

```text
001 -> 002 -> 003 -> 004 -> 005 -> 006
                              |      |-- 009 -> 015
                              |      |-- 007 -> 008
                              |      `-- 010 -> 014
                              `-- 011 -> 012 -> 013

008 + 009 + 010 + 011 + 012 + 013 + 014 + 015 -> 016

005 -> 017 -> 018
005 -> 019
011 -> 020
```
