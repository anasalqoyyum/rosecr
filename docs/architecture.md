# Technical Architecture

This document maps `desktop-ocr-translator-prd.md` to an implementation-ready Windows architecture. The PRD is authoritative.

## Architectural Goals

- Keep the game-facing experience lightweight and non-invasive.
- Run capture analysis and OCR locally; send only eligible extracted text to Codex.
- Guarantee that stale translation work cannot overwrite newer game text.
- Keep capture, OCR, translation, tracking, and overlay layout independently testable.
- Preserve capture configuration across failures and restarts.
- Leave stable provider and OCR boundaries for post-v1 extensions without implementing them early.

## V1 Boundaries

- Primary platform: Windows 11 x64
- Capture: selected region within a chosen game or the whole chosen game window
- Game modes: windowed and borderless fullscreen
- Languages: Japanese to English and English to Japanese
- OCR: bundled Python runtime, RapidOCR, and PP-OCR models
- Translation: Codex subscription OAuth through pinned `@earendil-works/pi-ai`
- Overlay: click-through source replacement

Rosecr does not inject code, read game memory, install text hooks, patch executables, capture the whole desktop, or support exclusive fullscreen in v1.

## Runtime Shape

The planned production application has three runtime components:

1. Electron desktop application
2. Bundled native Windows capture helper
3. Bundled Python OCR sidecar

Electron owns orchestration, windows, state, translation, auth, secure storage, settings, diagnostics, and overlay composition.

The native helper owns the WGC session, target metadata, pixel delivery, and capture lifecycle. TODO-021 implements its initial BGRA8 frame path before TODO-004 connects live OCR. TODO-007 extends the same backend for HDR and display recovery. See [the helper decision](native-helper-decision.md).

Python owns image preprocessing, RapidOCR, OCR confidence and geometry, orientation, and Japanese reading-order cleanup.

Renderer processes never communicate directly with Python, credentials, or the model provider.

## Electron Surfaces

### Utility Bar

- Play performs one immediate translation pass.
- Auto begins continuous change-driven translation without Play.
- Auto always starts disabled in a new Rosecr process.
- Overlay visibility is independent from Auto.
- Clear discards current overlays and one-shot watchers.
- Direction, scope, model access, status, and settings remain close at hand.

### Settings and Onboarding

One standard application window hosts first-run setup and settings. It owns capture configuration, Codex sign-in, model and reasoning selection, overlay preferences, shortcuts, diagnostics, and asset management.

### Overlay Windows

Use transparent, non-focusable, click-through windows associated with the target display. They render only view models supplied by the main process. They are excluded from supported capture paths and cannot initiate provider work.

### Region Selector

A temporary interactive surface selects a rectangle inside the chosen game client area. It stores normalized client-relative coordinates, then closes before capture begins.

Manual inspect and dictionary windows are post-v1.

## Main-Process Modules

### Capture Engine

Responsibilities:

- Capture one explicitly chosen game window.
- Crop selected regions from that window.
- Emit physical-pixel frames and timestamps.
- Perform low-cost frame-difference checks.
- Recover from target resize, DPI changes, display changes, and device loss.
- Reject Rosecr-owned windows and invalid or blank frames.

M0 proved Electron frame delivery and passive overlay behavior but found gaps in target metadata and explicit WGC lifecycle and device-loss recovery. Production therefore uses a native helper that owns the window capture session and delivers frames with their geometry snapshot. The Electron capture worker and PowerShell metadata probe remain development scaffolding until TODO-021 replaces them in the production path.

Rosecr windows use capture exclusion through Electron content protection or the corresponding Windows display-affinity behavior. The Capture Engine also detects recursion rather than relying on exclusion alone.

### Capture Target Manager

Responsibilities:

- Persist stable game identity, capture mode, and normalized region.
- Resolve a returning game to its current window handle.
- Reattach automatically after temporary window loss.
- Enter an explicit ambiguity state when multiple windows match.
- Preserve configuration through all runtime failures.

A minimized, closed, protected, or uncapturable game enters `waiting`; it does not emit blank OCR frames.

### Sidecar Supervisor

Responsibilities:

- Launch the bundled Python process.
- Exchange length-delimited typed messages over private stdio.
- Track health and request timeouts.
- Attempt one automatic restart after an unexpected crash. Five minutes of healthy uptime earns the restart back.
- Stop with an actionable error after repeated failure.
- Keep one request in flight. A frame that arrives meanwhile waits in a single slot and is sent next; a newer frame replaces it.

V1 exposes no localhost OCR port. `docs/ocr-sidecar.md` documents the protocol and supervisor behavior.

### OCR Service

Input:

- Capture generation
- Physical-pixel image or crop
- Requested preprocessing profile

Output per box:

- Box identifier
- Capture generation
- Physical-pixel rectangle
- Normalized text
- Confidence
- Horizontal or vertical orientation
- Reading-order metadata

Low-confidence text must match in a spatially compatible box across two consecutive scans before it becomes translation-eligible. High-confidence text proceeds after the normal debounce.

### Text Tracking Engine

Responsibilities:

- Maintain stable box identity across frames.
- Assign monotonically increasing source generations.
- Debounce progressively revealed text.
- Tolerate one missed OCR scan.
- Remove a box after two consecutive misses.
- Mark queued and in-flight results obsolete when source text changes.
- Feed only stable current boxes to translation.

The engine is authoritative for whether a result is current. Provider cancellation is an optimization, not the correctness mechanism.

### Direction and Content Gate

The user explicitly selects the direction.

- Japanese-to-English accepts boxes containing Japanese script.
- English-to-Japanese accepts boxes containing meaningful Latin text.
- Target-language-only, numeric-only, symbol-only, and non-linguistic boxes bypass translation and receive no overlay.
- Mixed-language boxes preserve target-language spans when OCR geometry makes that reliable.

No general language detector runs in the realtime path.

### Translation Router

V1 exposes one provider through a provider-neutral contract.

Responsibilities:

- Batch stable changed boxes.
- Apply timeouts and one transient retry.
- Maintain context, glossary, and cache.
- Validate provider results against box and source generations.
- Map provider failures into stable application errors.

Batch limits:

- At most eight boxes
- Approximately 2,000 source characters
- At most two in-flight batches
- Split in visual reading order
- Prioritize current visible dialogue

Completed batch items commit independently. A batch is cancelled only when every item is obsolete.

### Codex Provider Adapter

The adapter wraps an exact reviewed version of `@earendil-works/pi-ai` and uses only its provider, OAuth, credential-store, model-discovery, transport, and streaming capabilities.

Responsibilities:

- Drive browser or device-code OAuth from the main process.
- Store credentials through an injected OS-protected store.
- Discover account-supported models and reasoning efforts.
- Submit translation-only requests with no tools.
- Buffer streaming tokens internally.
- Support cancellation and stable session reuse.

Partial tokens never reach an overlay. A result is accepted only after successful completion, structured-output validation, and generation validation.

OCR text, dialogue context, and glossary entries are untrusted data. They are delimited from fixed instructions and cannot change the task or enable tools.

Rosecr never imports Codex CLI credentials and never treats Codex OAuth as an OpenAI Platform API key.

### Session Context and Cache

Context contains the five latest completed current-generation source-and-translation units in visual order.

The advisory terminology glossary:

- Holds at most 100 source-target mappings.
- Accepts candidates only from completed stable translations.
- Requires a conflicting mapping to recur before replacing an established mapping.
- Lives only for the active game session.

The translation cache:

- Is an in-memory 500-entry LRU.
- Keys normalized source, direction, model, reasoning, prompt version, and context/glossary fingerprint.
- Clears on game change, sign-out, and application exit.

### Overlay Compositor

Responsibilities:

- Convert accepted translations into immutable overlay view models.
- Obscure source text with a current blurred crop or safe plate.
- Place all visible translations as one collision-aware layout.
- Track normal, updating, waiting, and error presentation.

Collision order:

1. Preserve anchor and wrap.
2. Shrink to the configured readable minimum, initially 12 DIP.
3. Expand into unoccupied non-text space.
4. Reposition while preserving source association.
5. Use an edge callout with a leader line.

The compositor never silently truncates or overlaps translations.

While an update is pending, the previous matching translation remains dimmed. A failed update removes any translation belonging to an older source generation and reveals the current source.

### Settings and Profile Module

Persists:

- Game identity and normalized capture presets
- Direction
- Model and reasoning choice
- Fast, Balanced, or Accurate profile
- Overlay theme, opacity, font, outline, and density
- Global shortcuts

Does not persist active Auto. Startup always enters idle with Auto off.

Initial profile defaults:

- Fast: about 150 ms capture cadence and 200 ms debounce
- Balanced: 250 ms and 300 ms
- Accurate: 500 ms and 500 ms with stronger preprocessing

### Auth and Secret Module

- Owns Codex sign-in and sign-out.
- Supplies the protected credential store to `pi-ai`.
- Keeps raw OAuth material in the main process.
- Exposes only non-secret account state to renderers.
- Clears provider sessions, context, and cache on sign-out.

### Diagnostics Module

Default logs contain timestamps, versions, state transitions, durations, counts, and redacted error codes.

They exclude screenshots, OCR text, translations, prompts, raw responses, authorization headers, and credentials. Support export includes text or images only through separate unchecked consent controls with a preview.

## Control State Machine

### Idle

- Saved configuration is loaded.
- Auto is off.
- No OCR or provider work occurs.

### One-shot Running

- Play captures, OCRs, gates, translates, and lays out the current frame once.
- After completion, only local frame-difference watchers remain over translated source regions.
- A changed source clears its overlay without OCR or Codex.

### Auto Running

- Continuous capture and change-driven OCR are active.
- Unchanged content produces no provider calls.
- Play forces an immediate refresh without creating another loop.

### Waiting

- The target or a required runtime is temporarily unavailable.
- Configuration is retained and the user sees the cause.
- Temporary game-window loss may resume automatically.

### Error

- A non-recoverable auth, provider, capture, or sidecar failure has occurred.
- Pending work is cancelled and stale results cannot commit.
- Recovery is explicit and does not erase capture setup.

Disabling Auto transitions to idle, cancels pending work, and leaves completed overlays under local source-change watching. Hiding overlays changes visibility only; it does not change Auto state.

## Scheduling and Failure Rules

1. Capture cadence samples the target.
2. Frame difference decides whether OCR is needed.
3. OCR confidence and two-scan rules decide eligibility.
4. A roughly 300 ms Balanced debounce handles progressive text.
5. Stable changed boxes are batched.
6. Provider results are buffered and validated.
7. The compositor atomically commits current results.

Transient translation failures receive one retry after about 750 ms or a short provider-supplied delay. Authentication, exhausted allowance, invalid requests, cancellation, unavailable models, and obsolete generations are not retried.

## Geometry and Color

- Physical pixels are canonical inside capture, OCR, and tracking.
- Persisted regions use normalized client coordinates.
- Renderer boundaries convert to device-independent coordinates.
- DPI, monitor, client-size, and display-topology changes invalidate visible geometry until a fresh frame is processed.
- HDR or advanced-color frames are normalized to SDR before OCR and frame comparison.

## Packaging and Assets

The Windows installer bundles Electron, the Python runtime, sidecar code, provider adapter, and redistributable fonts. Large OCR assets may download during onboarding.

Asset downloads show size and version, support resume, verify checksums before activation, and retain the previous valid asset set after failure.

## Security Invariants

- No game injection, hooks, memory reads, patching, or automated elevation
- No screenshots sent to Codex
- No renderer access to OAuth tokens
- No localhost OCR service in v1
- No model tools
- No captured-text instructions executed
- No Rosecr windows accepted as capture targets
- No active Auto restored at startup

## Deferred Extensions

- Manual inspect and dictionary cards
- CAT-Translate offline provider
- DeepL, Google Translate, and OpenAI-compatible BYOK
- Additional languages
- Exclusive fullscreen or whole-desktop capture
- macOS, Linux, Windows on ARM, and 32-bit Windows
- Heavy manga or document reconstruction
