# Desktop OCR Translator PRD

## Problem Statement

People who read Japanese text in games, manga, visual novels, videos, PDFs, and desktop applications often hit a hard tooling limit: existing solutions are usually browser-specific, app-specific, or optimized for manual popup lookup rather than continuous reading. The user wants a desktop application that works anywhere on screen, performs OCR on visible Japanese text, and overlays translation directly over the original text in near real time. It should stay lightweight, feel responsive, support both passive reading and manual inspection, and give users strong control over performance, privacy, providers, hotkeys, theme, and layout.

## Solution

Build a Windows-first desktop application using Electron for the shell, overlay UI, settings, and desktop integration, plus a bundled Python sidecar for OCR and Japanese-specific text processing using `owocr`. The app captures either the full screen, a selected region, or an active window; detects when visible Japanese text changes; runs OCR locally; translates the extracted text through a selectable provider stack; and renders translated text as an on-screen overlay aligned to the original text boxes.

The product supports two primary modes:

- Passive realtime mode: continuously scans while enabled, pauses unnecessary work when the image or OCR result is unchanged, and overlays translated text per OCR text box.
- Manual inspect mode: lets the user target text on demand, view the translation in a focused panel, and open mini dictionary cards for word-level lookup.

The visual direction should feel closer to a lightweight desktop utility than a full creative suite: compact settings surfaces, low-friction controls, and unobtrusive overlay boxes that are easy to read without overwhelming the underlying content.

The intended UI direction is explicitly inspired by the provided references: a simple utility-style settings app with a left navigation rail and compact controls, plus lightweight overlay translation boxes rendered directly over source text in a style similar to screen-translation tools. The product should not default to a complex dashboard or developer-facing control surface.

The first release is optimized for Japanese to English and Japanese to Indonesian, while keeping the architecture extensible to additional target languages. Translation providers are hybrid by design: local/offline-friendly translation, cloud machine translation, and AI translation through OpenAI-compatible providers. The app is local-first, stores captured text only for the active session by default, and makes cloud usage explicit and user-controlled.

## User Stories

1. As a Japanese learner, I want translation overlaid directly on text I can see on screen, so that I can keep reading without switching tools.
2. As a visual novel player, I want the app to work on arbitrary windows, so that I am not limited to browser extensions or game-specific hooks.
3. As a manga reader, I want to select a static region of the screen, so that OCR focuses on the page area and avoids wasted work.
4. As a desktop user, I want fullscreen capture support, so that I can scan anything visible on screen.
5. As a game player, I want active-window capture, so that the app follows one game window instead of the entire desktop.
6. As a fast reader, I want translated text to appear with low visible delay, so that the overlay feels usable in realtime.
7. As a quality-focused reader, I want performance profiles, so that I can choose fast, balanced, or more accurate behavior depending on content.
8. As a default user, I want balanced mode to work well out of the box, so that I do not need to tune settings before reading.
9. As a privacy-conscious user, I want OCR to run locally, so that screenshots do not need to leave my machine.
10. As a privacy-conscious user, I want cloud translation to be opt-in, so that I always know when text is sent to an external provider.
11. As an offline user, I want a local translation option, so that the app remains useful without internet access.
12. As a cloud user, I want to choose between translation providers, so that I can trade off quality, speed, privacy, and cost.
13. As an AI translation user, I want OpenAI-compatible translation support, so that I can use higher-context translation when needed.
14. As a provider-aware user, I want both OAuth-based sign-in and BYOK configuration where supported, so that I can use the account model I prefer.
15. As a cost-sensitive user, I want it to avoid retranslating unchanged text, so that the app reduces latency and API spend.
16. As a user reading static content, I want the app to pause or throttle when text is unchanged, so that it does not waste CPU, GPU, or translation calls.
17. As a user reading Japanese subtitles or dialogue, I want per-text-box overlays, so that translated text appears near the original content.
18. As a reader of vertical Japanese text, I want the app to recognize and place overlays correctly, so that manga and vertical UI are usable.
19. As a reader of horizontal Japanese text, I want the app to work well on subtitles, menus, and common UI text, so that it covers mainstream cases.
20. As a customization-focused user, I want to change hotkeys, so that the app fits my workflow and avoids conflicts.
21. As a customization-focused user, I want to adjust theme, colors, opacity, and layout, so that the overlay remains readable over different backgrounds.
22. As a customization-focused user, I want to tune overlay density and behavior, so that I can minimize clutter or maximize context.
23. As a customization-focused user, I want control over scan cadence or refresh interval, so that I can trade off responsiveness, resource usage, and API spend.
24. As a user who does not want constant overlays, I want a manual mode, so that I can invoke translation only when needed.
25. As a user in manual mode, I want a focused inspect view, so that I can read a clean translation without surrounding overlay noise.
26. As a learner, I want mini dictionary cards in inspect mode, so that I can look up individual words from OCR text.
27. As a learner, I want the app to preserve useful text grouping and reading order, so that translation quality is better than raw OCR fragments.
28. As a user reading noisy content, I want Japanese-aware OCR cleanup heuristics, so that common recognition artifacts do not immediately degrade translation.
29. As a user reading repeated UI labels, I want translation caching within the session, so that common text appears quickly.
30. As a user with a weak machine, I want region-based scanning and configurable profiles, so that the app remains usable on lower-end hardware.
31. As a user with a high-resolution display, I want the overlay to align accurately with source text boxes, so that the translation feels anchored to the content.
32. As a user who wants a simple tool, I want a compact utility-style settings window, so that configuration feels fast and not overwhelming.
33. As a user juggling multiple apps, I want saved regions and reusable capture presets, so that I can switch between common setups quickly.
34. As a user who changes target languages, I want target language selection in settings, so that I can switch between English, Indonesian, and future languages.
35. As an accessibility-focused user, I want keyboard-first controls and readable overlay styling, so that the app remains usable without precise mouse interaction.
36. As an open-source user, I want the core app and docs to be open, so that I can inspect the architecture and contribute improvements.
37. As a developer contributor, I want provider integrations to be modular, so that new OCR, translation, or dictionary engines can be added without rewriting the app.
38. As a support-oriented user, I want clear status indicators for capture, OCR, translation provider, and errors, so that failures are understandable.
39. As a cautious user, I want explicit permission prompts and provider disclosures, so that I know what data is being processed locally versus remotely.
40. As a first-time user, I want a single installer, so that setup feels straightforward even if OCR assets download afterward.
41. As a first-time user, I want guided setup for OCR assets and translation providers, so that I can reach a working state without manual digging.
42. As a future maintainer, I want the app split into deep modules with stable interfaces, so that performance and provider changes do not constantly break the UI.

## Implementation Decisions

- The desktop shell will be Electron-based. Electron owns window lifecycle, transparent overlay windows, hotkeys, settings UI, installer flow, and system integration.
- OCR will run in a local Python sidecar process. The sidecar will be bundled and launched by the Electron app, rather than requiring the user to manually run Python.
- The OCR engine for v1 is `owocr`, with Japanese-aware preprocessing and reading-order heuristics handled in the Python sidecar.
- The product is Windows-first for v1. macOS and Linux are intentionally deferred so Windows capture APIs, packaging, and overlay behavior can be optimized first.
- Capture scope in v1 includes fullscreen capture, one-off or saved screen regions, and active-window capture.
- Realtime mode defaults to continuous scanning with smart idle pause. In practice, the app should avoid re-running translation when the captured image or OCR text has not materially changed.
- The default performance profile is balanced. Additional profiles should expose meaningful differences in capture cadence, OCR cleanup depth, translation batching, and overlay update frequency.
- The app should expose an advanced user setting for scan interval or refresh cadence, but translation itself should remain event-driven by content change. The interval setting is a throttle for capture/OCR polling, not the primary correctness mechanism.
- OCR results should be tracked per text box, with stable identifiers where possible, so the system can deduplicate repeated text and keep overlays visually anchored.
- Overlay rendering should be per text box by default, not paragraph-wide by default. This keeps placement closer to the source and reduces ambiguity in mixed layouts.
- The overlay visual style should default to lightweight translated boxes with clear contrast, modest padding, and minimal chrome, following a utility-like desktop feel rather than a heavy control panel aesthetic.
- The settings UI should default to a compact utility-app layout with simple navigation, plain controls, and a small always-available control surface for mode toggles such as overlay mode, auto-translation, capture scope, and settings access.
- Japanese-specific post-processing in v1 should be reading-aware but not attempt heavy document reconstruction. The app should normalize common OCR artifacts, infer likely line order, and merge only where confidence is high.
- Vertical and horizontal Japanese text are explicit v1 requirements. Stylized and dense text may be improved later, but the first release should be architected to support future preprocessing upgrades.
- Manual inspect mode is a first-class feature, not a debug panel. It should support focused translation display plus mini dictionary cards derived from OCR text.
- The app should support a provider-router abstraction for translation. Provider selection, credentials, rate limits, retries, and fallback behavior should not be hardcoded into the UI.
- The realtime pipeline should use a layered throttling model: frame-difference detection first, OCR text-difference detection second, then provider-specific translation debouncing and caching. This is preferable to a naive fixed translation interval.
- Translation provider categories in v1 are:
- Local translation: an offline-friendly provider path, initially represented by a local engine such as Argos Translate or a comparable embeddable MT backend.
- Cloud deterministic MT: adapters for DeepL and Google Translate.
- AI translation: an OpenAI-compatible adapter, with OpenAI as the first supported provider. OAuth should be supported where the provider permits it, and BYOK must also be supported.
- AI translation should operate on OCR text and nearby context, not on raw screenshots, in the first release. This keeps the privacy model simpler and aligns with the OCR-first architecture.
- The first release should optimize translation UX for Japanese to English and Japanese to Indonesian, while keeping language selection extensible.
- The app should be local-first by default. OCR and text preprocessing remain local. Text is sent to cloud providers only when the user enables a cloud provider and selects it for active use.
- Captured text history should be session-only by default. Persistent history, sync, and long-term transcript storage are out of scope for v1.
- Secrets and tokens should be stored in OS-appropriate secure storage where possible, rather than plain-text config.
- The packaging approach for v1 is a single installer that can download large OCR assets or models during setup or first-run onboarding. This keeps initial distribution manageable while avoiding a multi-step manual install.
- The architecture should be modularized into the following deep modules:
- Capture Engine: abstracts screen, region, and window capture plus frame-difference detection.
- OCR Service: owns preprocessing, `owocr` invocation, text box extraction, confidence data, orientation handling, and reading-order heuristics.
- Text Tracking Engine: compares OCR outputs across frames, deduplicates stable text, batches changed segments, and decides what needs retranslating.
- Translation Router: exposes a uniform interface for local MT, cloud MT, and AI providers, including retries, caching, timeouts, and fallback policy.
- Overlay Compositor: maps translated text boxes into overlay UI state, handles positioning, theme, opacity, and collision behavior.
- Inspect and Dictionary Module: powers manual inspection, word selection, and mini dictionary cards.
- Settings and Profile Module: persists hotkeys, theme, provider choice, language choice, capture presets, and performance profiles.
- Auth and Secret Module: handles provider sign-in, BYOK entry, token refresh, and secure storage.
- Diagnostics Module: surfaces provider errors, OCR confidence issues, missing assets, and performance status to the user.
- Open-source scope for v1 is open core app code and documentation. Provider credentials remain user-managed, and proprietary providers remain replaceable adapters rather than baked-in dependencies.

## Testing Decisions

- Good tests should verify external behavior and user-visible outcomes, not internal implementation details such as exact helper structure or event sequencing unless those are part of the public contract.
- Capture tests should verify that fullscreen, region, and active-window modes select the correct area and that unchanged frames do not trigger unnecessary downstream work.
- OCR pipeline tests should use representative screenshot fixtures covering horizontal and vertical Japanese text, and assert stable box extraction, orientation handling, and cleanup behavior at the interface boundary.
- Text tracking tests should verify deduplication, change detection, and batching behavior across repeated and partially changed frames.
- Translation router tests should verify provider selection, timeout handling, fallback behavior, caching, and explicit cloud-routing rules.
- Overlay compositor tests should verify that translated text is placed against supplied OCR boxes, updates correctly when text changes, and respects core visibility settings.
- Inspect mode tests should verify that manual selection opens the expected translation view and dictionary card flow from OCR text.
- Settings tests should verify that hotkeys, profiles, target language, region presets, and theme settings persist and reload correctly.
- Auth and secret tests should verify secure credential storage behavior at the module boundary, without asserting OS implementation internals.
- Installer and onboarding tests should verify first-run flows for downloading OCR assets, enabling providers, and reaching a usable configuration.
- Integration tests should use mocked translation providers plus real or fixture-based OCR outputs to validate end-to-end behavior from capture event to overlay update.
- Performance validation should include benchmark-style checks for profile behavior, especially around idle detection, repeated text, and high-frequency overlay updates.
- Since the repo is currently greenfield, there is no existing in-repo prior art to mirror yet. The initial test strategy should establish contract tests around module interfaces, fixture-based OCR tests, and end-to-end UI behavior tests as the baseline pattern.

## Out of Scope

- Native support for macOS and Linux in v1.
- OCR of handwritten Japanese.
- Audio translation, speech recognition, or subtitle extraction from audio streams.
- Full document management, library management, or manga reader features.
- Flashcard export, SRS integration, or learning progress tracking.
- Persistent cloud sync of user history, settings, or transcripts.
- Heavy paragraph reconstruction or full document layout understanding for the first release.
- Full support for every possible anti-cheat or DRM-protected capture scenario.
- Account systems beyond provider authentication needed for translation access.
- Community plugin marketplace or third-party extension runtime in v1.

## Further Notes

- The main architectural risk is the cross-runtime boundary between Electron and Python. The PRD assumes this is acceptable and that the user prefers a packaged single-app experience even if it internally launches a sidecar process.
- The main product risk is balancing overlay readability against screen clutter. The app should favor lightweight defaults and strong customization instead of a one-size-fits-all overlay style.
- The main translation risk is provider variability. AI translation may read more naturally, while deterministic MT may be faster and cheaper. The provider abstraction is therefore a product requirement, not just an implementation convenience.
- The main OCR risk is noisy or stylized text in games and manga. The v1 plan explicitly focuses on robust horizontal and vertical text handling plus reading-aware heuristics, while leaving heavier reconstruction for later iterations.
- Suggested translation stack for planning purposes:
- Local/offline-friendly path: start with an embeddable local MT provider such as Argos Translate, understanding that quality may lag premium cloud systems.
- Premium cloud MT path: DeepL and Google Translate adapters.
- AI path: OpenAI-compatible text translation, with OpenAI first.
- A future implementation phase should evaluate whether the capture backend or overlay compositor needs a native Windows helper for lower-latency capture or more reliable overlay behavior than pure Electron can provide alone.
- UI references are documented separately in `docs/ui-direction.md` so the visual direction remains easy to revisit during implementation.
