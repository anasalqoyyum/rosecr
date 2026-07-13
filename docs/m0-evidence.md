# Milestone 0 Evidence

## Completion State

Milestone 0 is complete. Every milestone exit criterion and both TODO acceptance sets have recorded evidence. The capture spike proves Electron frame delivery and overlay-window behavior, while the missing production metadata and device-recovery controls require a thin native Windows helper.

## TODO-001

| Acceptance criterion | Evidence |
| --- | --- |
| Utility bar launches with Auto off and distinguishes idle, running, waiting, and error | Live Electron launch plus control-state tests; the shell exposes status-specific text and styling |
| Play, Auto, Overlay, Clear, direction, scope, and settings cross a narrow typed IPC boundary | `parseControlCommand` runtime validation, sandboxed preload API, malformed-command tests |
| Durable settings reload while active Auto never does | Settings-store restart tests; live launch remained idle after repeated process restarts |
| Shortcuts can be disabled and conflicts are visible | Shortcut-manager tests cover disabled bindings, OS conflicts, and shared UI/shortcut dispatch |

## TODO-002

| Acceptance criterion | Evidence |
| --- | --- |
| Windowed and borderless targets produce frames without foreground activation | Notepad background capture; Arknights windowed background capture; Arknights 2560×1440 borderless capture |
| Rosecr windows are rejected and excluded | Native target enumeration filters Rosecr's PID; unit test covers all owned windows; controller/marker content protection was true during live capture |
| Marker follows move, resize, monitor, and mixed-DPI changes without input/focus | Move, resize, same-DPI monitor transition, and a 100%→125% DPI transition passed live; click-through/focus passed |
| Minimized, closed, blank, or uncapturable targets wait instead of emitting valid frames | Live minimization and game target loss entered waiting and hid the marker; automated capture-health tests reject invalid and repeated blank frames |
| Backend and evidence are recorded | `docs/capture-backend-spike.md` records exact versions, timings, recovery results, gaps, and the native-helper decision |

## M0 Exit Criteria

| Exit criterion | Evidence |
| --- | --- |
| Windows shell with required controls | Live shell and renderer files |
| Auto starts disabled and never restores active state | Restart test and repeated live launches |
| Chosen target captures without Rosecr | Notepad and Arknights frames; protected Rosecr windows and PID filtering |
| Passive marker is click-through, non-focusable, and focus-safe | Live Notepad and game click-through checks plus BrowserWindow flags |
| Backend decision recorded | Thin native Windows helper required; Electron-alone contract rejected |

## Automated Verification

The current verification gate is:

```text
pnpm run typecheck
pnpm test
```

It covers command validation, runtime state semantics, one-shot versus Auto behavior, visibility independence, waiting/error states, durable settings, Auto reset, shortcut conflicts, owned-window rejection, physical-to-DIP geometry, and invalid/blank-frame rejection.

The final mixed-DPI run moved the deterministic `M0 Mixed-DPI Target` from the 96-DPI primary display to the 120-DPI portrait display. Capture remained running with three received frames. The target client rectangle was `(-961,558)-(-176,1120)` physical pixels and the marker was `x=-768.8, y=446.4, width=628, height=449.6` DIP, exactly matching the 1.25 conversion. Both displays were restored to their original 100% scale afterward and `pnpm run probe:displays` confirmed scale factor 1.0 on each.
