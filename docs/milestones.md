# Implementation Milestones

Parent PRD: `desktop-ocr-translator-prd.md`

Shared tag: `prd:desktop-ocr-translator-prd`

Milestones are ordered by risk and demoable value. A todo is complete only when its acceptance criteria and relevant tests pass. Merged implementation and pending live Windows validation are recorded separately; merging code does not satisfy an unexecuted acceptance criterion.

## M0 Safe Windows Foundation

Tracking [#1](https://github.com/anasalqoyyum/rosecr/issues/1) is closed. The remaining TODO-002 evidence is tracked in [#9](https://github.com/anasalqoyyum/rosecr/issues/9): captured-output exclusion, a live protected target, and native WGC device-loss recovery. These remain required before release.

Goal: prove the desktop and capture assumptions before building the translation pipeline.

Slices:

- `TODO-001` Bootstrap the safe utility shell and runtime controls
- `TODO-002` Prove the Windows game-capture and overlay contract

Exit criteria:

- Rosecr launches on Windows 11 x64 with Play, Auto, Overlay, Clear, direction, scope, and settings controls.
- Auto starts disabled and does not restore active state.
- A chosen window can be captured without capturing Rosecr.
- Passive overlays are click-through, non-focusable, and do not disturb game focus.
- The capture spike records whether Electron alone satisfies the v1 contract or a native helper is required.

## M1 Durable Local OCR Slice

Tracking [#3](https://github.com/anasalqoyyum/rosecr/issues/3) remains open. PR #11 merged the target and region implementation, with Windows manual validation pending. PR #12 merged the supervised RapidOCR sidecar, synthetic fixtures, and recorded Windows benchmarks. Native capture is tracked in [#13](https://github.com/anasalqoyyum/rosecr/issues/13); live OCR/debug-overlay integration is not implemented.

Goal: recognize a saved game region locally and recover cleanly from runtime or target-window failures.

Slices:

- `TODO-003` Persist a game target and normalized region
- `TODO-021` Build and prove the native Windows capture helper
- `TODO-004` Run supervised local OCR into aligned debug overlays

Exit criteria:

- A game and client-relative region can be selected, previewed, persisted, and reattached.
- The native helper supplies BGRA8 frames with matching physical geometry and capture generations, and records the Windows evidence required by TODO-021 and issue #9.
- The bundled Python sidecar communicates over typed stdio and restarts at most once after a crash, regaining the restart only after five minutes of healthy uptime.
- RapidOCR returns positioned horizontal and vertical boxes with confidence.
- OCR debug overlays stay aligned across movement, resizing, and DPI changes.

## M2 First Codex Translation

Goal: complete the first real one-shot game translation through the user's Codex subscription.

Slices:

- `TODO-005` Deliver Codex OAuth one-shot translation overlays
- `TODO-011` Add Codex model, reasoning, account, and error controls

Exit criteria:

- The user can sign in through the pinned `pi-ai` adapter without API billing credentials.
- Play translates eligible Japanese or English boxes once and displays only completed validated output.
- Target-language and non-linguistic regions remain untouched.
- Model or auth failure never destroys capture configuration or silently switches models.

## M3 Realtime Translation Quality

Goal: make Auto reliable, context-aware, and resistant to progressively revealed or stale text.

Slices:

- `TODO-006` Add Auto, text tracking, and stale-result protection
- `TODO-009` Add structured batching, bounded context, glossary, and cache
- `TODO-015` Strengthen Japanese orientation, cleanup, and direction gating

Exit criteria:

- Auto begins without Play and remains disabled after a fresh app start.
- Incomplete dialogue retriggers correctly and stale results never commit.
- Low-confidence text and missed boxes follow the two-scan rules.
- Multi-box screens translate in visual order with bounded context and cache.
- Kiseki-style mixed-language fixtures preserve existing target-language UI.

## M4 Capture and Overlay Productization

Goal: support the intended game modes and produce readable collision-free replacement overlays.

Slices:

- `TODO-007` Add durable whole-game-window capture and display recovery
- `TODO-008` Add performance profiles and scan cadence controls
- `TODO-010` Add source replacement and collision-aware layout
- `TODO-014` Add overlay customization, accessibility, and shortcuts

Exit criteria:

- Region and whole-game-window capture work in windowed and borderless-fullscreen games.
- Capture survives target movement, resizing, mixed DPI, monitor changes, and temporary loss.
- Overlay boxes never overlap or silently truncate; dense layouts use the callout fallback.
- Fast, Balanced, and Accurate profiles affect the real pipeline.
- Balanced meets the documented reference latency and idle-resource targets.

## M5 Privacy, Onboarding, and Release

Goal: make a fresh installation safe, understandable, and measurable against the v1 gate.

Slices:

- `TODO-012` Add privacy-safe diagnostics and model-input hardening
- `TODO-013` Add checksum-verified onboarding and one-shot validation
- `TODO-016` Package Windows x64 and execute the v1 release gate

Exit criteria:

- Default logs and exports contain no screenshots, user text, prompts, responses, or secrets.
- OCR text cannot alter the fixed translation task or enable tools.
- Asset downloads resume, verify checksums, and preserve the last valid version.
- Onboarding ends with a successful one-shot translation and Auto off.
- The packaged app passes every release criterion in the PRD on the documented reference system.

## Deferred After V1

- `TODO-017` Add manual inspect mode
- `TODO-018` Add dictionary cards to inspect mode
- `TODO-019` Add offline CAT-Translate
- `TODO-020` Add DeepL, Google Translate, and OpenAI-compatible BYOK

Deferred todos are not blockers for `TODO-016` or the v1 release gate.
