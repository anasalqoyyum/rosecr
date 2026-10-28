# Native capture helper

This helper owns one explicit HWND-based Windows.Graphics.Capture session. Electron uses the same private stdio process for window metadata and BGRA8 frames. It never captures the desktop, injects code, or reads target process memory. Process handles request only `PROCESS_QUERY_LIMITED_INFORMATION` to obtain executable names.

The Windows code has not been compiled or run on the Linux implementation host. Do not treat this slice as Windows accepted. See [acceptance.md](acceptance.md) and [acceptance-results.json](acceptance-results.json).

## Build and runtime paths

Use Windows 11 x64 with Rust, the `x86_64-pc-windows-msvc` target, MSVC build tools, and a Windows SDK. The helper pins `windows = 0.62.2` and has its own Cargo lockfile. The build uses cached dependencies and does not fetch packages.

After provisioning the Windows Rust cache, run from the repository root:

```powershell
cargo test --locked --offline --manifest-path native/capture-helper/Cargo.toml
pnpm run build:windows
pnpm start
```

`build:native` compiles the release executable and copies it to `native/rosecr-capture-helper.exe` and `dist/native/rosecr-capture-helper.exe`. Development startup resolves the first copy from `app.getAppPath()`. Packaged startup resolves `resources/native/rosecr-capture-helper.exe`; a future packager must put the built executable there, outside any ASAR archive. Installer configuration and signing remain TODO-016.

`pnpm run build` still builds the portable Electron/TypeScript files. A missing native executable produces a supervised runtime error when capture or enumeration is requested. There is no backend fallback.

The `Capture validation` GitHub Actions workflow runs portable checks and a Windows x64 job. The Windows job provisions the locked Rust dependencies, compiles and tests the native code, builds both app-local copies, and uploads `rosecr-capture-helper-windows-x64`. It does not exercise WGC capture behavior or replace the interactive acceptance evidence.

## Wire contract

Every message starts with a four-byte unsigned little-endian JSON byte length. The JSON is UTF-8, has `version: 1`, and is at most 65,536 bytes. Requests have positive safe-integer `requestId` values. Replies echo that ID. Events have `kind: "event"` and no request ID. Only a `kind: "frame"` reply carries bytes after its header.

| Request action | Fields beyond version and requestId | Reply kind |
| --- | --- | --- |
| `list` | None | `list`, with `windows` |
| `query` | Decimal HWND string `target` | `metadata` |
| `start` | `target`, expected `processId`, `captureGeneration` | `started` |
| `grab` | `target`, `captureGeneration`, `sessionEpoch`, `region` | `frame` or `waiting` |
| `stop` | None | `stopped` |

`region` is null for the client area, or `{ x, y, width, height }` in normalized client coordinates. Both peers round the left, top, right, and bottom edges independently with positive half-pixels rounded up. A region must fit within the client and have width and height of at least 0.02. Degenerate physical crops are rejected.

A frame header includes:

- `target`, `captureGeneration`, `sessionEpoch`, and strictly increasing `sequence` within the epoch.
- `pixelFormat: "BGRA8"`, physical `width` and `height`, packed `stride = width * 4`, and exact `payloadBytes = stride * height`.
- `clientRect` in physical screen coordinates, target `dpi`, and client-relative physical `cropOrigin: { x, y }`.
- `qpcTimestamp100ns`, the WGC frame's `SystemRelativeTime`, and `timestamp`, Unix milliseconds when readback completed.

The raw payload is exactly `payloadBytes`, at most 134,217,728 bytes. Dimensions are bounded to 32,768. Rust checks multiplication, crop sums, texture bounds, mapped pitch, and output headers before writing. The Node decoder validates the complete header and request identity before allocating the payload. It rejects truncated packets, non-packed stride, wrong targets or generations, stale epochs/sequences/QPC timestamps, and a crop that differs from the request.

`started` also reports `borderDisabled`, `cursorDisabled`, and `minUpdateInterval100ns`. A null interval means the property is unavailable. `borderDisabled` reflects a successful property write and readback; visible capture-border behavior still needs Windows evidence.

The helper rejects its own PID and the Rosecr parent PID passed on the command line. It verifies the target PID again at session start and while observing a session. A changed owner or `GraphicsCaptureItem.Closed` ends capture. Enumeration fails explicitly if the catalog cannot fit the bounded header.

## Geometry and recovery

The helper uses a per-monitor-v2 DPI context. A WGC item's dimensions must match DWM extended frame bounds before those bounds can establish the client crop origin. An unprovable mapping reports target unavailability. It does not guess an origin or capture another source.

Every 100 ms and before a request, the helper checks client geometry, visibility, minimization, ownership, and device health. Geometry changes call frame-pool `Recreate`, advance the epoch, and establish a QPC freshness cutoff. Frames must match the current content size and stable geometry before and after readback.

Events include `geometryChanged`, `closed`, `minimized`, `blank`, `unavailable`, `deviceLost`, and `deviceRecovered`. Each carries identity plus wall-clock and QPC timestamps. Device loss closes the old pool/session, creates a new hardware D3D11 device and WGC session, advances the epoch, and reports recovery. The coordinator hides the marker at loss and waits for a fresh matching frame before showing it again. Recovery failure enters Waiting.

Main requests frames at 250 ms cadence without overlapping grabs. It polls metadata at 200 ms, including during a one-shot startup. A five-second usable-frame deadline covers startup, stalls, and recovery. Black captures and known protected targets enter Waiting. Waiting retains the saved game and normalized region; existing saved-game resolution handles a returning window. Helper exit, broken pipes, malformed replies, and request timeout produce runtime errors and preserve saved settings. A later user start can launch a replacement helper.

The accepted `CapturedFrame.pixels` buffer stays in main through `FrameSource.grab` and `CaptureCoordinator.getLatestFrame`. Geometry changes, loss, and an explicit stop invalidate it. One-shot completion can retain the accepted buffer with its marker until geometry changes. TODO-004 can consume this seam without renderer IPC.

The old PowerShell metadata code and Electron media worker remain probe code. Main startup does not instantiate or call either one.
