# Windows Capture Backend Spike

## Decision

Rosecr requires a thin native Windows helper for the production capture contract.

Electron 43.1.0 can deliver explicit-window frames with acceptable spike latency and its `BrowserWindow` APIs provide the required click-through, non-focusable, and `WDA_EXCLUDEFROMCAPTURE` behavior. Electron alone does not expose arbitrary target client bounds, minimized state, per-window DPI, target lifecycle, display-topology invalidation, or explicit WGC device-loss recovery. Those gaps prevent Electron alone from satisfying the PRD's alignment and recovery contract.

The M0 executable spike therefore uses:

- Electron/Chromium capture for frame delivery.
- A persistent PowerShell-hosted Win32 P/Invoke probe for target enumeration, client geometry, DPI, visibility, minimization, and foreground-window evidence.
- Electron transparent windows for the harmless marker.

The PowerShell probe is evidence code, not the production helper. The production helper should be a small bundled x64 executable with a typed private protocol. It should own the explicit WGC session and target metadata so resize and device-loss recovery are observable rather than inferred through browser media tracks.

## Why Electron Alone Is Rejected

Electron's documented capture source contains an ID, name, thumbnail, display ID, and icon. The ID embeds the HWND, but the source has no client rectangle, minimized state, DPI, or lifecycle events. See [DesktopCapturerSource](https://www.electronjs.org/docs/latest/api/structures/desktop-capturer-source).

Electron's window APIs do satisfy the Rosecr-window side of the contract: `setIgnoreMouseEvents`, `setFocusable`, and Windows `setContentProtection` map to the expected input and `WDA_EXCLUDEFROMCAPTURE` behavior. See [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window).

During the protected-shell spike, `desktopCapturer.getSources()` also stalled while Chromium attempted to inspect protected windows. The executable shell uses the Win32 helper for enumeration to avoid coupling target discovery to frame capture.

## Recorded Runtime Results

All results were collected on Windows x64 with Electron 43.1.0 and Chromium 150.0.7871.47.

| Scenario | Result | Evidence |
| --- | --- | --- |
| Isolated Electron capture | Pass | Notepad `window:4261828:0`, 1264×1372, first frame 251 ms |
| Protected shell, background target | Pass | Notepad 1264×1372, first frame 250 ms, `targetIsForeground: false` |
| Real game, windowed | Pass | Arknights 1748×982, first frame 291 ms, target remained backgrounded |
| Real game, borderless fullscreen | Pass | Arknights 2560×1440, first frame 289 ms |
| Move recovery | Pass | Client origin moved from `(1286, 10)` to `(936, 98)`; overlay origin matched |
| Resize recovery | Pass | Frame width changed from 1264 to 1050; client/overlay width changed from 1263 to 1049 |
| Monitor transition | Pass | Client and overlay moved to `x = -462` on the portrait display while frames continued |
| Minimized target | Pass | State changed to `waiting`, capture stopped, marker hidden, configuration retained |
| Target loss | Pass | Closing Arknights changed state to `waiting`; marker hid and the selected target remained in state |
| Overlay focus/input | Pass | Marker reported non-focusable and click-through; clicks focused Notepad's editor and the game window beneath it |
| Capture exclusion | Pass | Controller and marker reported content-protected; Rosecr processes were filtered from target enumeration |
| Mixed DPI | Pass | Temporary 100%→125% transition changed target DPI 96→120; client `(-961,558)-(-176,1120)` physical mapped exactly to overlay `(-768.8,446.4) 628×449.6` DIP while frames continued |
| Explicit WGC device loss | Electron gap | Browser media APIs expose track failure, not the PRD's explicit WGC device/session recovery contract |

Raw diagnostic JSON is written under `capture-evidence/` by the opt-in smoke environment variables and is intentionally ignored by Git.

## Reproduction

```powershell
npm install
npm run typecheck
npm test

$env:ROSECR_CAPTURE_TARGET='scratch-pad'
$env:ROSECR_CAPTURE_EVIDENCE="$PWD\capture-evidence\notepad-windowed.json"
npm start
```

Set `ROSECR_CAPTURE_CONTINUOUS=1` to keep geometry polling active for movement, resize, monitor, minimization, and target-loss checks. `npm run probe:capture` runs the isolated Electron frame spike and expects `ROSECR_CAPTURE_TARGET` to contain part of a visible window title.

For a repeatable mixed-DPI run, start `npm run probe:mixed-dpi`, then run the continuous probe with `ROSECR_CAPTURE_TARGET='M0 Mixed-DPI Target'`. The target starts on the primary display, moves to the secondary display after ten seconds, and returns after sixty seconds. Configure different scale factors before the run and restore the original display settings afterward.
