# Low-Fidelity Wireframes

This document turns the PRD and UI direction into concrete screen shapes and flows.

## Design Principles

- Stay compact
- Keep the main controls visible and understandable
- Make the overlay the product, not the settings window
- Support both passive realtime reading and manual inspect flow
- Avoid requiring the user to manage multiple heavy windows

## Primary Surfaces

The product should have five core surfaces:

1. Setup and onboarding window
2. Main utility bar or mini controller
3. Settings window
4. Overlay translation layer
5. Manual inspect and dictionary surface

## 1. Setup and Onboarding Window

Purpose:

- Download OCR assets
- Select target language
- Choose translation provider
- Configure auth
- Explain overlay permissions and capture modes

Suggested layout:

```text
+-----------------------------------------------------------+
| Rosecr Setup                                         [X] |
+-----------------------------------------------------------+
| Step 1 of 4                                             |
|                                                           |
| Download OCR assets                                       |
| [#####################.............]  62%                |
|                                                           |
| Target language                                           |
| [ English v ]                                             |
|                                                           |
| Translation provider                                      |
| [ OpenAI ] [ DeepL ] [ Google ] [ Local ]                |
|                                                           |
| Auth                                                      |
| ( ) Sign in with provider                                 |
| (x) Use API key                                           |
| [______________________________]                          |
|                                                           |
|                    [ Back ] [ Continue ]                  |
+-----------------------------------------------------------+
```

Notes:

- This should be simple and linear.
- Do not expose advanced OCR controls here.
- The first-run path should end with a working default profile.

## 2. Main Utility Bar or Mini Controller

Purpose:

- Provide immediate access to mode toggles
- Keep the app feeling lightweight
- Offer quick status without opening the full settings app

Suggested layout:

```text
+-----------------------------------------------------------------------------------+
| [Start]  JP -> EN  Provider: OpenAI  Overlay: On  Auto: On  Scope: Region  [..] |
+-----------------------------------------------------------------------------------+
```

Expanded variant:

```text
+--------------------------------------------------------------------------------------------------+
| [Play/Pause] | JP -> EN | Provider | Overlay | Auto | Scope | Profile | Inspect | History | ⚙ |
+--------------------------------------------------------------------------------------------------+
```

Expected quick actions:

- Start or pause capture
- Toggle overlay mode
- Toggle automatic translation
- Change target language
- Switch capture scope
- Switch profile
- Open inspect mode
- Open settings

Notes:

- This can live as a slim floating utility bar or a compact docked controller.
- It should not resemble a media editing timeline or browser toolbar.

## 3. Settings Window

Purpose:

- House all non-immediate configuration
- Remain compact and easy to scan

Suggested information architecture:

- General
- Capture
- Translation
- Overlay
- Dictionary
- Shortcuts
- Providers
- Advanced
- About

Suggested layout:

```text
+--------------------------------------------------------------------------+
| Settings                                                             [X] |
+----------------------+---------------------------------------------------+
| General              | Translation                                       |
| Capture              |                                                   |
| Translation          | Target language     [ English v ]                 |
| Overlay              | Provider            [ OpenAI v ]                  |
| Dictionary           | Auto translate      [ on ]                        |
| Shortcuts            | Scan interval       [ 250ms -----o---- ]          |
| Providers            | Smart idle pause    [ on ]                        |
| Advanced             | Profile             [ Balanced v ]                |
| About                |                                                   |
|                      | Cloud routing       [ explicit only ]             |
|                      | Session history     [ on for session ]            |
|                      |                                                   |
|                      |                 [ Reset ] [ Save ]                |
+----------------------+---------------------------------------------------+
```

Notes:

- Left navigation should stay shallow.
- Most pages should fit in a single view without deep nesting.
- Advanced settings should exist, but the default view should stay approachable.

## 4. Overlay Translation Layer

Purpose:

- Present translated text near the original content
- Stay readable without covering too much of the source
- Support both horizontal and vertical Japanese text

Suggested layout behavior:

```text
Screen content

   [JP text box A]
   [Translated box A]

                    [JP text box B]
                    [Translated box B]

   [JP vertical text C]
   [Translated box C]
```

Box style expectations:

- Soft background fill or semi-transparent plate
- Clear text contrast
- Small radius
- Modest padding
- Minimal border or no border
- Optional shadow only if needed for legibility

Placement rules:

- Default to placing translation over or just adjacent to the OCR box
- Prefer preserving reading context over pixel-perfect source visibility
- Allow a user option for lower opacity or alternate placement
- Avoid aggressive animated motion between updates

Overlay states:

1. Hidden
2. Realtime active
3. Manual inspect targetable
4. Paused
5. Error or unavailable provider

## 5. Manual Inspect and Dictionary Surface

Purpose:

- Give the user a precise, on-demand view
- Allow deeper understanding without cluttering passive reading

Suggested layout:

```text
+--------------------------------------------------------------+
| Inspect                                                 [X] |
+--------------------------------------------------------------+
| Source text                                                   |
| まったく目利きが出来ない俺だけど、外国の、古いものだ           |
|                                                               |
| Translation                                                   |
| I cannot judge it at all, but I know it is an old foreign... |
|                                                               |
| Dictionary cards                                              |
| [目利き] [noun] appraisal skill                               |
| [外国]   [noun] foreign country                               |
| [古い]   [adj ] old                                           |
+--------------------------------------------------------------+
```

Notes:

- This can be a small panel or popover rather than a full workspace.
- It should open quickly from a text box or from the utility bar.

## Region Selection Flow

Purpose:

- Let the user target a specific part of the screen for better performance

Suggested flow:

1. User clicks `Scope: Region`
2. Screen dims
3. User drags a rectangle
4. Region preview appears
5. User confirms or saves as preset

Wireframe:

```text
Full screen dimmed

   +----------------------------------+
   | Selected capture region          |
   +----------------------------------+

   [Enter confirm]  [Esc cancel]  [Save preset]
```

## Main User Flows

### Realtime Reading Flow

1. Open app
2. Pick scope
3. Start realtime mode
4. Overlay appears on detected Japanese text
5. Changed text updates only when needed
6. User pauses or adjusts settings from utility bar

### Manual Inspect Flow

1. Toggle inspect mode
2. Hover or click OCR region
3. Open inspect panel
4. Read full translation and dictionary cards
5. Close panel and continue reading

### Provider Setup Flow

1. Open providers settings
2. Choose local, cloud, or AI provider
3. Authenticate with OAuth or enter API key
4. Save and test connection
5. Set as active provider

## Default Screen Set for v1

The minimum set of screens for a usable v1 is:

1. Onboarding setup
2. Utility bar
3. Settings window
4. Region selector
5. Overlay layer
6. Inspect panel

Anything beyond this should be treated as optional polish, not core scope.
