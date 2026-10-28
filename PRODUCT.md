# Product

<!-- impeccable:product-schema 1 -->

## Platform

Windows desktop application. Rosecr renders its UI with Electron and targets Windows 11 x64 first.

## Users

Players reading Japanese game text who want translations while they keep playing. The product also supports players translating English into Japanese.

## Product Purpose

Rosecr is planned as a desktop OCR translation overlay for game text. A player can translate the current capture once with Play or enable Auto for continuous, change-driven translation. Success means the player can read translated text in the game without moving to a separate translation window.

## Positioning

Rosecr reads visible pixels from one selected game window and places translated text over the source. Its planned OCR runs locally. After the player chooses Play or Auto, v1 may send eligible extracted text and bounded text context to the Codex account. Rosecr does not depend on game-specific hooks.

## Operating Context

The v1 target is a windowed or borderless-fullscreen game on Windows. Players choose a region within one game window or use that whole window. The controller, settings, onboarding, and temporary region selector accept input. Passive translation overlays stay click-through and do not take focus. Exclusive fullscreen and whole-desktop capture are outside v1.

## Capabilities and Constraints

- Planned v1 covers Japanese to English and English to Japanese, local OCR with RapidOCR and PP-OCR models in a bundled Python sidecar, and Codex subscription sign-in through an exact-version `@earendil-works/pi-ai` adapter. The provider adapter is not installed yet.
- The model and reasoning options come from the signed-in account. Rosecr does not promise a fixed model list.
- Auto starts off and never resumes active after launch. Play performs one translation pass; Auto starts continuous change-driven work.
- Rosecr does not inject into games, read game memory, install text hooks, patch executables, capture the whole desktop, or support exclusive fullscreen.
- M0 tracking is closed, with capture evidence still open in issue #9. PR #11 added durable game targets and normalized regions; Windows manual validation remains pending. PR #12 added the supervised RapidOCR sidecar with synthetic fixtures and recorded Windows benchmarks.
- M1 remains incomplete. TODO-021 must deliver the native WGC frame source, and TODO-004 must connect it to OCR and aligned debug overlays. The application still renders a capture marker. M2 adds Codex authentication and the first translation; later milestones cover realtime quality, overlay productization, and release work.

## Brand Commitments

The project name is Rosecr. No approved logo, wordmark, or broader visual identity is recorded. The Gaminik toolbar reference in the UI direction is an interaction reference only; its visual identity is not to be copied.

## Evidence on Hand

The PRD, [UI direction](docs/ui-direction.md), [wireframes](docs/wireframes.md), and [milestones](docs/milestones.md) define the planned product. [The local design foundation](docs/design-foundation.html) and [RoseCR Design Foundation in Doop](https://en.pipefish-sirius.ts.net:8443/c/tiv3OjhHpT) are design concepts. The HTML uses synthetic game, account, and session content and makes no capture or account calls. Treat it as a design proposal, not proof of shipped behavior. The [OCR sidecar record](docs/ocr-sidecar.md) separates completed sidecar work from pending live integration.

## Product Principles

- Keep the game as the player's main view.
- Begin cloud translation only after Play or Auto.
- Keep capture and OCR local, and make status and failure states clear.
- Preserve complete, current translations. Never leave stale text over a changed source.

## Accessibility & Inclusion

The v1 requirements call for keyboard-first controls, configurable shortcuts, reduced-motion support, and a configurable overlay text minimum that starts at 12 device-independent pixels. These are requirements, not claims about M0 implementation.
