# Implementation Milestones

Parent PRD: `desktop-ocr-translator-prd.md`

Shared PRD tag: `prd:desktop-ocr-translator-prd`

## M0 Foundations

Goal:

- Establish the Electron shell, Python sidecar contract, settings persistence, and a working capture entry point.

Slices:

- `TODO-001` Bootstrap app shell with utility bar and settings persistence
- `TODO-002` Launch bundled Python sidecar and show OCR health in the app
- `TODO-003` Select a screen region and preview capture updates

Exit criteria:

- The app launches on Windows
- Utility bar and settings window are usable
- OCR sidecar supervision works
- Region capture is selectable and previewable

## M1 First End-to-End Translation

Goal:

- Deliver the first demoable screen-to-translation overlay loop.

Slices:

- `TODO-004` Run OCR on the selected region and render source-aligned debug boxes
- `TODO-005` Translate changed OCR text through one provider and render overlay text

Exit criteria:

- A selected screen region can be OCR'd
- OCR results map to overlay boxes
- At least one provider translates changed text into visible overlay output

## M2 Reading Experience

Goal:

- Make the core reading loop efficient, configurable, and useful for more real-world workflows.

Slices:

- `TODO-006` Add smart idle pause and changed-text deduplication
- `TODO-007` Support fullscreen and active-window capture from the utility bar
- `TODO-008` Add performance profiles and advanced scan cadence controls
- `TODO-009` Add manual inspect mode with focused translation panel
- `TODO-010` Add mini dictionary cards in inspect mode
- `TODO-014` Improve overlay theming, opacity, and accessibility controls
- `TODO-015` Strengthen vertical-text heuristics and reading-order cleanup

Exit criteria:

- Realtime mode avoids unnecessary OCR and translation work
- All three scopes are supported
- Users can inspect text manually
- Overlay readability and Japanese handling are improved beyond the baseline demo

## M3 Providers and Onboarding

Goal:

- Make provider setup, privacy controls, and first-run experience usable by other testers.

Slices:

- `TODO-011` Add provider settings with OpenAI BYOK and connection test
- `TODO-012` Add local/cloud provider switching and explicit routing UI
- `TODO-013` Add onboarding flow for first-run setup and asset download

Exit criteria:

- Users can configure supported providers from the UI
- Cloud routing is explicit
- A fresh install can reach a working state through onboarding

## M4 Packaging and External Testing

Goal:

- Produce a Windows build that feels like one app and can be tested outside the dev environment.

Slices:

- `TODO-016` Package Windows installer with bundled runtime and recoverable diagnostics

Exit criteria:

- The app installs through a Windows-first packaging flow
- Bundled runtime and asset download experience are workable
- Common startup or provider failures are surfaced clearly

## Deferred After V1 Baseline

- Stylized game text optimization beyond baseline OCR cleanup
- Dense manga layout reconstruction
- Persistent history or transcripts
- macOS support
- Linux support
