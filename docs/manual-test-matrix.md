# M0 Windows Manual Test Matrix

Use a Windows 11 x64 machine. Record Electron/Chromium versions, GPU, display topology, display scale factors, target executable, target mode, first-frame latency, and screenshots or diagnostic JSON for every run. Auto must be off after every fresh Rosecr process start.

| Case | Procedure | Expected result | Current evidence |
| --- | --- | --- | --- |
| Real-game capture | Select a running game in normal windowed mode and run the capture probe while another app is foreground | A nonblank frame arrives without activating the game; marker matches the client area | Pass: Arknights 1748×982, 291 ms, backgrounded |
| Borderless fullscreen | Switch the same game to borderless fullscreen and rerun | A full client frame arrives; marker covers exactly the game client; no desktop capture | Pass: Arknights 2560×1440, 289 ms |
| Overlay exclusion | Keep the marker and controller visibly over the target and inspect captured output | Neither Rosecr window appears in frames; Rosecr windows are absent from target choices | Partial: content protection true and owned PID filtered; captured output not yet inspected |
| Click-through input | Click a harmless point beneath the marker and use a non-destructive game input | Input reaches the target; marker never focuses; game focus remains or becomes active | Pass: Notepad editor and Arknights received clicks beneath marker |
| Movement | Run continuous probe and drag a windowed target | Marker origin follows client origin without visible lag or focus theft | Pass: `(1286,10)` → `(936,98)`, overlay matched |
| Resizing | Resize one edge repeatedly during continuous probe | Frame dimensions and marker bounds update; invalid intermediate frames never look valid | Pass: frame 1264→1050 wide, overlay 1263→1049 |
| Mixed DPI | Move the target between displays with different scale factors, including straddling the boundary | Geometry invalidates, then reappears only after a fresh frame with no offset | Pass: deterministic target moved 96→120 DPI; physical client bounds mapped exactly to 1.25-scale marker bounds and frames continued. Straddling the boundary not yet run |
| Monitor change | Move the target fully onto another display and change its orientation/topology if safe | Frames continue and marker uses the destination display coordinates | Pass: client/overlay moved to `x=-462` on portrait display |
| Minimization | Minimize during continuous capture | Capture stops, marker hides, status becomes waiting, saved selection remains | Pass: live Notepad minimization |
| Target loss | Close a disposable target during continuous capture | Capture stops, marker hides, status becomes waiting, selected target identity remains | Pass: live Arknights close at start screen |
| Blank/uncapturable target | Use a protected or deliberately blank disposable target | Three repeated blank frames or invalid dimensions become waiting, never valid capture | Automated pass; live protected-target run pending |
| Device loss | Reset the graphics device or change adapter state on a disposable test machine | Current geometry hides; capture recreates its device/session and resumes from a fresh frame | Pending production native-helper implementation |

Overlay exclusion, the live blank or protected-target run, and device loss remain open. Device-loss recovery is assigned to the required production helper and must be executed before the Windows release gate.

## M1 durable target and region (TODO-003)

Run these with `pnpm start` on Windows 11 x64. Select the game in Settings → Capture, set Scope to Selected region, and choose Select region. During capture the passive marker outlines the saved region, so alignment can be checked by eye. `settings.json` in the Rosecr user-data folder holds the saved `target` and `region`.

| Case | Procedure | Expected result | Current evidence |
| --- | --- | --- | --- |
| Window identity | List windows with the metadata shim | Each window reports `executableName` and `className` without elevation | Pass: shim run through WSL interop listed `infalsus.exe` / `UnityWndClass`, `chrome.exe` / `Chrome_WidgetWin_1`, and a WPF `HwndWrapper[...;<guid>]` class |
| Region selector bounds | Open the selector from a Settings window that overlaps the game, on windowed and borderless-fullscreen games | The selector covers exactly the client area, never the title bar or desktop; dragging past an edge clamps to it; Settings hides while selecting and returns afterwards; the selector keeps keyboard focus | Pending |
| Selector input | Drag, then use arrows, Shift + arrows, R, Esc, Enter, and the three buttons; click inside the drawn region | Enter or Save region saves; Esc, Cancel, or switching to another window keeps the old region; R restores the default draft; clicks inside the region stay with the selector, not the game | Pending. Browser harness passed drag, tiny-drag revert, keyboard adjust, reset, and save |
| Region follows the game | Run continuous capture, then move, resize, and drag the game across displays with different scale factors | The marker stays on the same game text and hides until a fresh frame after each change | Pending. Unit tests cover movement and scaling of the physical rectangle |
| Restart | Save a target and region, quit Rosecr, relaunch, press Play | Rosecr starts idle with Auto off, keeps the region, and Play captures the game without reselecting it | Pending |
| Game restart while Auto is on | Enable Auto, close the game, relaunch it | Status shows Waiting and overlays clear; when the game returns with a new window handle, capture resumes on it with the region unchanged | Pending |
| Game restart while idle | Close and relaunch the game with Auto off, then press Play once | One Play press captures the relaunched window | Pending |
| Ambiguous match | Open two windows of the same game with the same title, then restart Rosecr or the saved instance | Status asks which window to capture; Settings lists both with PIDs; choosing one resumes capture and keeps the region | Pending |
| Capture error | Kill the `powershell.exe` metadata helper during capture | Status shows Error; the target and region remain in Settings and `settings.json` | Pending |
