# Low-Fidelity Wireframes

These wireframes describe v1 surfaces and behavior. They intentionally omit deferred inspect, dictionary, history, and multi-provider UI.

## Design Rules

- The utility bar is the fastest path to every frequent action.
- Play means one-shot translation; Auto means continuous translation.
- Auto always starts off.
- Passive overlays never receive input or focus.
- Settings remain shallow and compact.
- Translation appears only after the complete result is ready.

## V1 Surfaces

1. Onboarding and settings window
2. Utility bar
3. Region selector
4. Translation overlay

## 1. Onboarding

Onboarding uses a short linear flow and ends with a one-shot validation.

```text
+----------------------------------------------------------------+
| Rosecr setup                                              2 / 6 |
+----------------------------------------------------------------+
| OCR assets                                                     |
| ppocr-japanese  v1.0        31 MB                               |
| [####################..........]  67%   [Pause]                 |
|                                                                |
| Checksum verified after download                               |
|                                                                |
|                                      [Back] [Continue]          |
+----------------------------------------------------------------+
```

Steps:

1. Explain local OCR and cloud text translation.
2. Download and verify OCR assets.
3. Sign in to the eligible Codex account.
4. Select model, reasoning effort, and direction.
5. Choose the game and region or whole-window scope.
6. Run one-shot validation.

Final state:

```text
+----------------------------------------------------------------+
| Setup complete                                                 |
+----------------------------------------------------------------+
| ✓ Game window found                                            |
| ✓ OCR ready                                                    |
| ✓ Codex connected                                              |
| ✓ Test translation displayed                                  |
|                                                                |
| Auto remains off. Enable it from the utility bar when ready.   |
|                                             [Finish]            |
+----------------------------------------------------------------+
```

Play and Auto are disabled until required assets, target, direction, and authentication are ready.

## 2. Utility Bar

Default startup:

```text
+------------------------------------------------------------------------------------------------+
| [▶]  Idle  | 日本語 → English | Codex · low | Overlay ● | Auto ○ | Region | Clear | ⚙ |
+------------------------------------------------------------------------------------------------+
```

Auto active:

```text
+------------------------------------------------------------------------------------------------+
| [▶]  Watching | 日本語 → English | Codex · low | Overlay ● | Auto ● | Region | Clear | ⚙ |
+------------------------------------------------------------------------------------------------+
```

Waiting for the game:

```text
+------------------------------------------------------------------------------------------------+
| [▶]  Waiting: game window unavailable     [Retry]                         | Auto ● | ⚙ |
+------------------------------------------------------------------------------------------------+
```

Behavior:

- Play captures and translates once.
- Auto immediately starts or stops continuous translation.
- Play during Auto forces an immediate refresh.
- Overlay hides or reveals translations without changing Auto.
- Clear removes overlays and local one-shot watchers.
- Direction changes clear context, cache, pending work, and overlays.
- Error and waiting text replaces decorative status icons when action is required.

The utility bar may be pinned always-on-top. It remains separate from the click-through overlay and is excluded from capture.

## 3. Settings

```text
+--------------------------------------------------------------------------------+
| Rosecr settings                                                            [×] |
+----------------------+---------------------------------------------------------+
| General              | Translation                                             |
| Capture              |                                                         |
| Translation          | Codex account       doubl…                    [Sign out] |
| Overlay              | Model               [ GPT-5.x Codex ▾ ]                 |
| Shortcuts            | Reasoning           [ Low ▾ ]                           |
| Diagnostics          | Direction           [ Japanese → English ▾ ]            |
| About                |                                                         |
|                      | Session context     5 recent units                      |
|                      | Terminology         17 / 100               [Reset]       |
|                      |                                                         |
|                      | Auto always starts disabled.                            |
+----------------------+---------------------------------------------------------+
```

Capture page:

```text
+--------------------------------------------------------------------------------+
| Capture                                                                        |
|                                                                                |
| Game                 [ Trails through Daybreak.exe ▾ ]                         |
| Scope                (●) Selected region  ( ) Whole game window                |
| Region               x 0.41  y 0.67  w 0.53  h 0.21       [Reselect]          |
| Profile              [ Balanced ▾ ]                                            |
| Scan cadence         [ 250 ms ]                         Advanced               |
|                                                                                |
| Target unavailable: saved setup will reconnect automatically.                 |
+--------------------------------------------------------------------------------+
```

Overlay page:

```text
+--------------------------------------------------------------------------------+
| Overlay                                                                        |
|                                                                                |
| Backing              [ Blur when current ▾ ]                                   |
| Theme                [ Neutral dark ▾ ]                                        |
| Opacity              [----------●---] 88%                                      |
| Minimum text size    [ 12 DIP ]                                                |
| Font                 [ Noto Sans ▾ ]                                           |
| Collision fallback   Edge callout                                              |
|                                                                                |
| [Reset defaults]                                                               |
+--------------------------------------------------------------------------------+
```

Diagnostics default to metadata and redacted errors. Text and image attachments require separate unchecked controls and a preview.

## 4. Region Selection

Region selection starts only after a game window is chosen.

```text
Chosen game client area

┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                 ┌──────────────────────────────┐             │
│                 │ Selected capture region      │             │
│                 │                              │             │
│                 └──────────────────────────────┘             │
│                                                              │
│ [Enter] Save     [Esc] Cancel     [R] Reset                  │
└──────────────────────────────────────────────────────────────┘
```

The saved rectangle is normalized to the game client area. Errors, app restart, game movement, and resolution changes do not erase it.

## 5. Overlay States

### Complete

```text
┌──────────────────────────────────────────┐
│ Almost at the same time…? I wonder what │
│ kind of people they are.                │
└──────────────────────────────────────────┘
```

The source is concealed by a current blurred crop or neutral plate.

### Updating

```text
┌──────────────────────────────────────────┐
│ Almost at the same time…                 │  ↻
└──────────────────────────────────────────┘
```

The last valid translation stays readable but slightly dimmed. Partial model tokens never appear.

### First translation pending

```text
Original game text remains visible                                      ···
```

Rosecr does not obscure source text before it has a complete translation.

### Failed update

```text
Current original game text remains visible                              !
```

An old translation is removed if it belongs to a previous source generation. The error indicator exposes Retry from the controller rather than accepting overlay clicks.

### Dense layout fallback

```text
Source A ───────────────┐      ┌─────────────────────────────┐
Source B ───────────┐   ├─────▶│ A  Complete translation…   │
Source C ───────┐   │   │      │ B  Complete translation…   │
                │   │   │      │ C  Complete translation…   │
                └───┴───┘      └─────────────────────────────┘
```

The edge callout is used only after wrapping, readable shrinking, expansion, and repositioning fail. Translation is never silently truncated.

## Core Flows

### One-shot

1. User presses Play or its shortcut.
2. Rosecr captures and OCRs once.
3. Eligible boxes are translated and committed atomically.
4. Local frame-difference watchers monitor translated regions.
5. A changed source clears its overlay without another cloud request.

### Auto

1. User enables Auto.
2. Rosecr continuously watches for changed frames.
3. Stable eligible text is translated.
4. Unchanged content produces no provider calls.
5. Disabling Auto cancels pending work and leaves only local source-change watchers.

### Game unavailable

1. Target minimizes, closes, or becomes uncapturable.
2. Overlays clear and status changes to Waiting.
3. Capture configuration remains saved.
4. A uniquely matching returning window reconnects automatically.

### Provider failure

1. A transient failure retries once.
2. A second failure or permanent failure reveals current source text.
3. Utility bar and diagnostics show an actionable error.
4. Capture selection remains intact.

## Deferred Surfaces

Post-v1 plans may add manual inspect, dictionary cards, persistent history, CAT-Translate, and additional provider settings. They are not part of the v1 navigation or release gate.
