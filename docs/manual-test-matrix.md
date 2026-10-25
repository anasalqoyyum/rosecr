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
