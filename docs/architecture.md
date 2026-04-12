# Technical Architecture

This document maps the PRD and UI direction to a concrete runtime architecture for a Windows-first Electron application with a Python OCR sidecar.

## Goals

- Keep the user-facing app lightweight
- Run OCR locally through Python
- Keep translation providers replaceable
- Support realtime overlay and manual inspect modes
- Avoid unnecessary OCR and translation work when the screen is unchanged

## Runtime Shape

The app is split into two main runtimes:

1. Electron desktop application
2. Python sidecar service

Electron owns windows, settings, overlay rendering, hotkeys, auth UX, and desktop integration.

Python owns OCR-specific image preprocessing, `owocr` execution, text box extraction, orientation handling, and Japanese reading heuristics.

## Process Model

### Electron Processes

- Main process
- Settings renderer
- Utility bar renderer
- Overlay renderer
- Inspect renderer

### Python Processes

- OCR service process
- Optional worker subprocesses in the future for OCR isolation or model-specific tasks

## Electron Window Model

### 1. Utility Bar Window

Purpose:

- Lightweight always-available controls
- Fast mode switching
- Small status surface

Responsibilities:

- Start or pause capture
- Toggle overlay mode
- Toggle auto translation
- Change active target language
- Change capture scope
- Open settings
- Open inspect mode

Recommended behavior:

- Frameless compact window
- Always on top when pinned
- Minimal memory footprint

### 2. Settings Window

Purpose:

- Full configuration surface

Responsibilities:

- General settings
- Capture settings
- Translation provider selection
- OAuth or BYOK flows
- Overlay theme and layout settings
- Shortcut configuration
- Diagnostics and about screen

Recommended behavior:

- Standard app window
- Single instance
- Opens from utility bar or tray

### 3. Overlay Window

Purpose:

- Render translated text boxes over the screen content

Responsibilities:

- Render transparent overlay
- Paint translated box components
- Handle click-through behavior when passive
- Accept interaction when inspect mode is active

Recommended behavior:

- Transparent frameless always-on-top window
- Click-through in passive mode
- Pointer-enabled in inspect mode
- One overlay per display is likely simpler than one giant unified surface

### 4. Inspect Panel Window

Purpose:

- Focused translation and dictionary details for a selected OCR region

Responsibilities:

- Show source text
- Show translated text
- Show dictionary cards
- Allow copy or pin actions later if needed

Recommended behavior:

- Small panel window or anchored popover
- Opens on demand
- Not always visible

### 5. Region Selector Surface

Purpose:

- Let the user define a screen region or save a preset

Recommended behavior:

- Temporary fullscreen translucent surface
- Simple drag selection
- Confirmation controls

## Main Process Responsibilities

The Electron main process should be the orchestration layer.

Responsibilities:

- Launch and supervise the Python sidecar
- Register global hotkeys
- Manage window lifecycle
- Persist settings and profiles
- Route events between UI renderers and backend services
- Coordinate capture scheduling
- Manage secure secret storage
- Expose a stable IPC API to renderer windows

The main process should avoid containing OCR, translation prompt logic, or view-specific formatting.

## Python Sidecar Responsibilities

The Python sidecar should expose a small, stable service interface.

Responsibilities:

- Accept image frames or crop requests
- Preprocess images for OCR
- Run `owocr`
- Return OCR boxes, text, orientation, and confidence
- Apply Japanese-aware cleanup heuristics
- Optionally support batching in the future

The Python sidecar should not own provider auth, overlay rendering, or settings persistence.

## Module Boundaries

### Capture Engine

Lives primarily on the Electron side.

Responsibilities:

- Screen capture
- Region capture
- Active-window capture
- Frame hashing or difference detection
- Scheduling based on active profile and scan interval

Interface shape:

- `startCapture(scope, profile)`
- `pauseCapture()`
- `resumeCapture()`
- `setScope(scope)`
- `subscribeToFrames()`

### OCR Service Client

Lives on the Electron main-process side and talks to Python.

Responsibilities:

- Serialize requests to Python
- Manage request timeouts
- Restart sidecar on failure
- Normalize Python responses into app-level OCR objects

Interface shape:

- `runOcr(frameOrRegion)`
- `getHealth()`
- `restart()`

### Text Tracking Engine

Lives on the Electron side between OCR and translation.

Responsibilities:

- Compare current OCR output to prior OCR output
- Create stable tracked text regions
- Detect unchanged text
- Decide what needs retranslating
- Support session cache keys

Interface shape:

- `updateTrackedText(ocrResult)`
- `getChangedSegments()`
- `getOverlayState()`

### Translation Router

Lives on the Electron side.

Responsibilities:

- Route to the active translation provider
- Apply provider-specific auth and config
- Cache repeated requests
- Debounce repeated text updates
- Enforce explicit cloud routing rules

Provider adapters:

- OpenAI-compatible adapter
- DeepL adapter
- Google Translate adapter
- Local MT adapter

Interface shape:

- `translate(segments, context, providerConfig)`
- `testProvider(providerConfig)`
- `listProviders()`

### Overlay Compositor

Lives across the main process and overlay renderer.

Responsibilities:

- Convert tracked translations into overlay view models
- Position text boxes
- Apply theme and layout rules
- Handle show, hide, fade, and update states

Interface shape:

- `renderOverlay(items)`
- `setVisibility(state)`
- `setTheme(theme)`

### Inspect and Dictionary Module

Lives across overlay renderer and inspect panel.

Responsibilities:

- Select text region
- Open inspect view
- Request token-level dictionary data
- Present source and translation cleanly

Interface shape:

- `openInspect(regionId)`
- `loadDictionaryCards(text)`

### Settings and Profile Module

Responsibilities:

- Persist app settings
- Persist hotkeys
- Persist capture presets
- Persist profile definitions
- Publish settings changes to active services

Profiles should at minimum include:

- Fast
- Balanced
- Accurate

### Auth and Secret Module

Responsibilities:

- Store BYOK secrets securely
- Manage OAuth sign-in flows
- Refresh tokens if required
- Expose provider credentials safely to the translation router

## IPC and Service Boundaries

Renderer windows should not talk directly to Python.

Recommended boundary:

- Renderer windows talk to Electron main process through typed IPC
- Electron main talks to Python sidecar through a private local transport

Possible local transport options:

1. HTTP on localhost
2. WebSocket on localhost
3. stdio-based child process messaging

Recommended v1 choice:

- stdio or a tightly scoped localhost service

Reasoning:

- Simpler packaging
- Easier process supervision
- Less surface area than a broad local API server

## Data Flow

The core realtime flow should look like this:

```text
Capture Engine
  -> frame difference check
  -> OCR Service Client
  -> Python OCR Service
  -> OCR result
  -> Text Tracking Engine
  -> changed segments only
  -> Translation Router
  -> translated segments
  -> Overlay Compositor
  -> Overlay Window
```

Manual inspect flow:

```text
User selects overlay region
  -> Inspect Module
  -> load source text + translation
  -> optional dictionary lookup
  -> Inspect Panel Window
```

## Realtime Scheduling Model

The scheduling model should be layered.

1. Capture interval controls how often the app samples frames
2. Frame-difference detection decides whether OCR should run
3. OCR text-difference detection decides whether translation should run
4. Provider debouncing and caching decide whether a provider call is needed

This means `scan interval` is user-facing, but translation remains content-driven.

## State Model

High-level app state:

- Active scope
- Active profile
- Active provider
- Active target language
- Overlay visibility state
- Auto mode on or off
- Inspect mode on or off
- Sidecar health
- Provider health

Per-region overlay state:

- OCR box geometry
- Source text
- Translation text
- Confidence
- Last updated timestamp
- Stable region identifier
- Visibility status

## Packaging Model

Recommended Windows-first packaging:

- Electron installer bundles app shell
- Embedded Python runtime bundled with app
- OCR assets downloaded on first run or setup
- Provider SDKs included selectively based on licensing and size

The user experience should still feel like one app even though it launches multiple internal processes.

## Reliability Strategy

The app should tolerate failure in isolated modules.

Examples:

- If OCR sidecar crashes, main process restarts it and surfaces status
- If provider auth expires, overlay pauses cloud translation and shows a recoverable warning
- If overlay renderer fails, it can be recreated without losing all app state

## Security and Privacy Model

- OCR happens locally by default
- Screenshots are not sent to cloud providers in v1
- Only extracted text is eligible for cloud translation
- Cloud routing must be explicit and visible in the UI
- Session text history is ephemeral by default
- Secrets should use OS-secure storage when available

## Future Extension Points

- Native Windows helper for lower-latency capture
- More advanced Japanese layout reconstruction
- Additional dictionary engines
- Additional AI providers through the OpenAI-compatible interface
- macOS and Linux capture backends
- Richer overlay placement heuristics for dense manga pages

## Suggested Implementation Sequence

1. Utility bar and settings shell
2. Python sidecar supervision and OCR contract
3. Basic region capture
4. OCR to overlay pipeline
5. Translation router with one provider
6. Smart idle pause and text tracking
7. Inspect panel and dictionary cards
8. Profiles, presets, and advanced settings
