# Native helper scope and production frame source

## Decision

The native helper delivers frames. It owns the Windows.Graphics.Capture (WGC) session for the selected window and also replaces the PowerShell metadata probe. TODO-004 builds on helper frames, not Electron frames. Electron keeps the controller, settings, and overlay windows. The `getUserMedia` capture worker remains a development probe and is removed from the production path.

Status: proposed, 2026-10-25. Needs a Windows spike before TODO-004 starts (see "Spike exit criteria").

## Why a metadata-only helper doesn't work

M0 rejected Electron-only capture because it lacks explicit WGC lifecycle, target metadata, and device-loss recovery. A helper that only reports metadata and device-loss signals can fix the first gap, not the other two:

- Device loss belongs to the D3D device behind a capture session. Chromium's WGC capturer creates its own D3D11 device (`D3D11CreateDevice` in WebRTC `modules/desktop_capture/win/wgc_capturer_win.cc`). A separate helper process can't observe or recover that device. It would only see its own.
- `GraphicsCaptureItem.Closed` and frame-pool `Recreate` exist on the session that produces frames. Microsoft recommends `Recreate` for resize and device loss ([screen capture guide](https://learn.microsoft.com/en-us/windows/apps/develop/media-authoring-processing/screen-capture)). Electron exposes none of this, only track `ended`/`mute`.

A metadata-only helper is the PowerShell probe rewritten in a compiled language. It would close none of the gaps that made M0 call for a helper.

## Tradeoffs

| Concern | Electron frames + metadata helper | Helper frames |
| --- | --- | --- |
| Latency | Measured first frame 250-291 ms (M0). OCR needs a full-resolution readback the worker doesn't do today: it draws into a 16×9 canvas for blank detection. Production would add `drawImage` + `getImageData` in the renderer, then IPC to main, then the sidecar. | Not measured yet. Helper copies the frame into a staging texture, maps it, and writes only the requested crop. One less process hop. |
| Exclusion of Rosecr windows | Electron 45 (Chromium 156) uses WGC for windows with no fallback, so exclusion holds today. Chromium main adds a fallback to `CroppingWindowCapturer` when WGC fails (feature `WebRtcWgcWindowCroppingFallback`, enabled by default). That capturer crops a screen capture, so after a future Electron upgrade exclusion could rest on `WDA_EXCLUDEFROMCAPTURE` alone, and Rosecr can't see which capturer Chromium picked. | WGC window capture renders only the target window, so overlays above it shouldn't appear even without content protection. Content protection stays on as a second layer. No silent fallback. Issue #9 item 1 verifies this. |
| Alignment | Frames and geometry come from two processes on separate clocks. Chromium crops odd frame sizes to even, which is why the coordinator accepts a 1 px mismatch. The frame's origin relative to the client rect is undocumented. A move without resize can't be detected from the frame. | Helper reads the client rect and the frame together, crops to the client area, and tags each frame with that geometry snapshot. Physical pixels end to end. |
| HDR (TODO-007) | No control over pixel format. | Microsoft says BGRA8 capture of HD color content can look washed out and recommends `R16G16B16A16Float`. The helper can pick the format and tone-map, or detect HDR and raise the warning TODO-007 requires. |
| Device loss / lifecycle | Inferred from track `ended`. Chromium reports a permanent error on GPU adapter change and the track ends. | `Closed` event, `DXGI_ERROR_DEVICE_REMOVED` on the helper's own device, `Recreate` on resize. Each reported as a typed event. |
| Capture border | Chromium disables the yellow border by default (`WebRtcWgcRequireBorder` off). | `IsBorderRequired = false` needs Windows build 20348+. Microsoft documents consent via `GraphicsCaptureAccess.RequestAccessAsync(Borderless)` with a package-manifest capability. Chromium sets it from an unpackaged process, so it should work for Rosecr too. The spike must confirm this. |
| Packaging | Nothing new. | One more x64 exe under `extraResources`. It must be code-signed with the app (TODO-016), because an unsigned exe that captures windows is likely to trip AV heuristics. Needs a Windows build job. |
| Code to own | Readback and IPC in the renderer, plus the metadata helper. | About one module more: D3D11 device, frame pool, staging copy, crop, typed protocol. HDR handling arrives with TODO-007 either way. |

The cost of helper frames is real: more native code, a Windows build job, and signing. It is still the only option that meets the PRD's device-loss and HDR requirements without a second backend later, which TODO-007's note rules out.

## Helper scope

In scope:

- Enumerate top-level windows, excluding Rosecr's PID (same output as `win32-window-metadata.ps1` `list`).
- Query target metadata: exists, visible, minimized, DPI, client rect in physical pixels, foreground handle (same output as `query`).
- Start and stop one WGC session per target via `IGraphicsCaptureItemInterop::CreateForWindow`. Cursor off, border off where allowed, `MinUpdateInterval` set from the performance profile on build 26100+.
- Return the latest frame on request: crop to the client rect or a physical-pixel sub-region, BGRA8, tagged with generation, physical size, client-rect snapshot, and QPC timestamp.
- Push lifecycle events: `closed`, `minimized`, `resized`, `dpiChanged`, `deviceLost`, `deviceRecovered`, `blank`.

Out of scope: OCR, change detection, frame diffing, encoding, overlay windows, anything inside the target process. No injection, hooks, memory reads, or elevation. A helper that can't capture an elevated or protected target reports it and Rosecr waits.

## IPC seam

Child process over private stdio. No sockets, matching the sidecar.

- Requests and events: newline-free length-prefixed JSON frames.
- Frame responses: a JSON header followed by a raw BGRA payload of the size the header states.
- Pull model. Main asks for a frame at scan cadence (150-500 ms per profile). The helper doesn't stream 60 fps into Node. A full 2560×1440 BGRA frame is 14.7 MB, about 59 MB/s at 250 ms cadence, which a pipe handles. A saved region is usually far smaller. Measure before adding shared memory.

The TypeScript side exposes two interfaces:

- `WindowMetadataSource` with `list()` and `query(handle)`. The PowerShell shim already fits it. The TODO-003 thread can keep the shim behind it and swap in the helper later without a behaviour change.
- `FrameSource` with `start(target, generation)`, `grab(region) -> { generation, physicalWidth, physicalHeight, clientRect, pixels }`, and an event stream. The owocr sidecar input (buffer, generation, physical dimensions) maps directly from `grab`.

## Toolchain

Recommendation: Rust with Microsoft's `windows` crate (0.62.x). It projects `Windows.Graphics.Capture`, including `SetIsBorderRequired`, `SetMinUpdateInterval`, and `SetIncludeSecondaryWindows`. It builds one static exe, has a lockfile, and gives memory safety in the protocol parser. Cost: a third toolchain next to Node and Python.

Alternatives:

- C++/WinRT. Microsoft's own capture samples use it and it produces the smallest exe. Manual memory safety, plus MSVC and CMake.
- C# with NativeAOT. Ports the existing P/Invoke code from the PowerShell probe almost as-is. Larger exe, and NativeAOT must build on Windows.

All three need Windows to run the spike. This WSL workspace can type-check and unit-test the TypeScript seam only.

## Sequencing

1. Spike on Windows (below). If it fails, revisit this record before TODO-004.
2. New slice before TODO-004, or the first part of it: helper with `list`, `query`, `start`, `grab`, `closed`, and `deviceLost`. BGRA8 only. Remove the capture worker from the production path.
3. TODO-004 consumes `FrameSource`.
4. TODO-007 adds HDR, display-topology invalidation, and reattach on top of the same helper, as its note already says.

## Spike exit criteria

These also close issue #9:

- First-frame latency and `grab` round-trip at 2560×1440 for full window and for a region, recorded next to the M0 Electron numbers.
- Issue #9 item 1. Save a captured frame with the controller and marker over the target. Neither may appear. Repeat with content protection off to confirm WGC excludes them by construction.
- Issue #9 item 2. Capture `scripts/mixed-dpi-target.ts` with `setContentProtection(true)` as a deterministic protected target, then a DRM or anti-cheat game if one is available. Rosecr must enter waiting, not emit frames.
- Issue #9 item 3. Force a GPU reset during capture (`dxcap -forcetdr` from Graphics Tools, or Win+Ctrl+Shift+B). Record `deviceLost`, `Recreate`, and the first frame after recovery.
- Border off on Windows 11 from an unpackaged exe with no prompt.
- Until the helper replaces it, re-run the M0 Electron capture checks on Electron 45.0.0. M0 evidence was recorded on 43.1.0.

## Sources

- Chromium window-capture options: `content/browser/media/capture/desktop_capture_device.cc` and `media/webrtc/webrtc_features.cc`, at tag `156.0.8078.48` (Electron 45.0.0) and on `main`, read 2026-10-25.
- WebRTC capturer selection and device creation: `modules/desktop_capture/desktop_capturer.cc` and `win/wgc_capturer_win.cc` at `ce13eaa8e5750b09c46b088a35d74bdadbac25dc` (Chromium 156 DEPS) and [HEAD](https://webrtc.googlesource.com/src/+/HEAD/modules/desktop_capture/desktop_capturer.cc).
- [Screen capture guide](https://learn.microsoft.com/en-us/windows/apps/develop/media-authoring-processing/screen-capture): HDR pixel format, `ContentSize`, `Recreate` on resize and device loss.
- [GraphicsCaptureSession.IsBorderRequired](https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.graphicscapturesession.isborderrequired), [MinUpdateInterval](https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.graphicscapturesession.minupdateinterval), [GraphicsCaptureItem](https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.graphicscaptureitem), [CreateForWindow](https://learn.microsoft.com/en-us/windows/win32/api/windows.graphics.capture.interop/nf-windows-graphics-capture-interop-igraphicscaptureiteminterop-createforwindow).
- [SetWindowDisplayAffinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity): `WDA_EXCLUDEFROMCAPTURE` from Windows 10 2004.
- [windows crate `GraphicsCaptureSession`](https://microsoft.github.io/windows-docs-rs/doc/windows/Graphics/Capture/struct.GraphicsCaptureSession.html).
