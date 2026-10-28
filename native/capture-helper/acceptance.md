# Windows acceptance for issue #9

Status on 2026-10-29: pending Windows 11 x64 execution. No native latency, capture exclusion, protected-target, mixed-DPI, device-loss, or border result has been recorded on this Linux host. The checked-in results file records the portable checks and leaves Windows scenarios pending. This is a local handoff, not an issue comment.

## Preparation

Build with the Windows toolchain described in [README.md](README.md). Run `pnpm typecheck`, `pnpm test`, the Rust tests, and `pnpm run build:windows` on Windows before collecting evidence. Record the Windows build, GPU/driver, displays/scaling, Electron version, helper SHA-256, and tested branch/commit with the results.

Use the animated target with `pnpm run probe:native-target`. It requests a 2560x1440 physical client area and prints the actual physical size and device pixel ratio inside the window. For exact latency acceptance use 100% scaling or another scale that produces exactly 2560x1440. Keep animation running so fresh frames are available.

The implementation session did not start the app or target, make OAuth/cloud requests, or update issue #9.

## Whole-client and region latency

With the animated target running, execute:

```powershell
$env:ROSECR_CAPTURE_TARGET='Rosecr Native Capture Target'
$env:ROSECR_CAPTURE_EVIDENCE="$PWD\capture-evidence\native-latency.json"
New-Item -ItemType Directory -Force capture-evidence | Out-Null
pnpm run bench:capture
```

The benchmark rejects a client size other than 2560x1440. It measures start-to-first-frame separately for the whole client and normalized region `{ x: 0.25, y: 0.5, width: 0.5, height: 0.25 }`. Each scope records the first grab plus up to twenty later fresh grabs, raw round-trip times, median, p95, payload size, geometry, crop origin, and session properties. Missing fresh frames reduce the sample count; inspect that count before interpreting percentiles. Whole-window means the full client, with non-client chrome excluded.

These are helper/stdio measurements. App smoke evidence separately records coordinator first-frame latency. Do not compare either number to the old Electron first-frame measurements without stating which path was measured.

## Saved-region marker and mixed DPI

1. Start Rosecr, select the target, draw and save a region, and enable Auto. Confirm the click-through marker covers exactly that region while the target keeps input focus.
2. Move and resize the target. Move it between displays with different scaling and negative desktop coordinates. Confirm that the marker hides during geometry changes and resumes at the new physical crop only after a matching frame.
3. Hide/show output, Clear, turn Auto off, and perform a one-shot. Confirm stale output never reappears after Clear or a geometry change.
4. Minimize, restore, and close the target. Confirm Waiting retains both saved target and region. Reopen the target and verify existing saved-game matching can recover it. Record ambiguity if multiple matching windows exist.

The existing mixed-DPI probe can also exercise movement. Display topology changes and TODO-007 reattachment are outside this slice.

## Captured-frame exclusion with protection on and off

First save the desired region through the app, then close Rosecr. Keep the animated target running. Place the controller and marker above the target during each run.

```powershell
$env:ROSECR_CAPTURE_TARGET='Rosecr Native Capture Target'
$env:ROSECR_CAPTURE_CONTINUOUS='1'
$env:ROSECR_CAPTURE_SAVE_FRAME='1'
$env:ROSECR_CAPTURE_EVIDENCE="$PWD\capture-evidence\native-exclusion-protected.json"
Remove-Item Env:ROSECR_CAPTURE_CONTENT_PROTECTION -ErrorAction SilentlyContinue
pnpm start
```

For the second run, set `ROSECR_CAPTURE_CONTENT_PROTECTION='0'` and use another evidence JSON filename. This opt-in smoke setting disables protection only when a smoke target is named. Normal startup still protects Rosecr windows.

The smoke path saves one actual helper frame after at least two accepted frames and while the marker is visible. PNGs get unique names in Electron's resolved Pictures/Screenshots folder. The JSON records the PNG path, frame identity/crop, marker geometry, controller/marker protection flags, and helper diagnostics. Verify the marker was already over the target at the saved frame's timestamp. A late-arranged controller requires a new run.

Inspect each PNG: neither controller nor marker may appear. Repeat with window scope and a saved region that includes their screen positions. A JSON protection flag alone does not prove exclusion. Keep a separate screenshot of the visible desktop arrangement in Pictures/Screenshots so reviewers can compare it to the captured frame.

Clear `ROSECR_CAPTURE_CONTENT_PROTECTION` after the second run.

## Protected-target Waiting

Close the target. Set `ROSECR_PROTECTED_TARGET='1'` and run `pnpm run probe:native-target` in a separate shell, then select it in Rosecr. Verify Waiting, hidden marker, preserved target/region, and no accepted protected frames. Repeat with a protected game when available. Known display affinity is rejected before capture; otherwise an all-black WGC payload enters Waiting without being returned as a frame.

Clear `ROSECR_PROTECTED_TARGET` before the unprotected recovery run.

## Forced device loss and border behavior

While capturing the animated target continuously, force a GPU reset using the Windows Graphics Tools `dxcap -forcetdr` method or Win+Ctrl+Shift+B. Record which method was used. The shortcut does not guarantee a D3D device-removal signal on every driver; if no `deviceLost` occurs, record that result and use a reproducible removal method before marking recovery passed.

Collect `deviceLost`, new session epoch, `deviceRecovered`, and the first accepted frame in that epoch. Confirm output stays hidden between loss and that frame. Also record a recovery failure if the driver cannot recreate the device; Rosecr should wait with settings intact.

Observe the capture border during start, continuous capture, resize, and recovery from the unpackaged x64 helper. Record any border or consent prompt, along with `borderDisabled` and the Windows build. Property readback alone does not prove the visible border behavior.

## Handoff

Fill the pending Windows entries in [acceptance-results.json](acceptance-results.json) with the outcome, measurements, and local artifact paths. Attach the results, latency JSON, smoke JSONs, captured PNGs, and desktop-arrangement screenshots to issue #9 only with separate authorization. No issue has been updated by this work.
