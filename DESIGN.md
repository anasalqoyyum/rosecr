---
name: Rosecr
description: Proposed Windows desktop design system for Japanese and English game translation.
colors:
  canvas: "#F5F5F6"
  surface: "#FFF"
  ink: "#202127"
  muted: "#62636D"
  line: "#DADAE0"
  rose: "#A73559"
  rose-soft: "#FAEDF2"
  overlay: "#18191D"
  on-overlay: "#F8F8FA"
  success: "#256347"
  success-soft: "#ECF5EF"
  warning: "#805200"
  warning-soft: "#FFF4DA"
  error: "#AE2938"
typography:
  display:
    fontFamily: "Noto Sans, Segoe UI, sans-serif"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: "44px"
    letterSpacing: "-0.03em"
  section:
    fontFamily: "Noto Sans, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "32px"
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Noto Sans, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: "26px"
  body:
    fontFamily: "Noto Sans, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  control:
    fontFamily: "Noto Sans, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  field-label:
    fontFamily: "Noto Sans, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  caption:
    fontFamily: "Noto Sans, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "18px"
  overlay:
    fontFamily: "Noto Sans, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: "36px"
  japanese:
    fontFamily: "Noto Sans JP, Yu Gothic, sans-serif"
rounded:
  plate: "4px"
  control: "6px"
  window: "12px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.rose}"
    textColor: "{colors.surface}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "7px 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "#8B2948"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "7px 14px"
    height: "36px"
  field-control:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
    height: "36px"
  status-pill:
    backgroundColor: "{colors.rose-soft}"
    textColor: "{colors.rose}"
    typography: "{typography.caption}"
    rounded: "{rounded.plate}"
    padding: "4px 9px"
  translation-plate:
    backgroundColor: "{colors.overlay}"
    textColor: "{colors.on-overlay}"
    typography: "{typography.overlay}"
    rounded: "{rounded.plate}"
    padding: "14px 18px"
---

# Design System: Rosecr

## Overview

**Creative North Star: "The game stays in focus."**

Rosecr's proposed interface keeps the controller compact and settings shallow, leaving the game as the main view. Light utility surfaces use a muted rose action color. Translation uses a separate dark plate with bright text so it can sit over varied game imagery. Noto Sans and Noto Sans JP cover the two planned languages.

This direction is captured in [the local design foundation](docs/design-foundation.html) and [RoseCR Design Foundation in Doop](https://en.pipefish-sirius.ts.net:8443/c/tiv3OjhHpT). It is a proposed v1 system, not a description of every shipped screen. The shell, durable target and region implementation, and supervised RapidOCR sidecar are merged. Native capture, live OCR/debug-overlay integration, and Codex translation remain pending; the application still renders a capture marker.

**Key Characteristics:**
- Compact controls around a game-first experience.
- Distinct Japanese and Latin font stacks.
- High-contrast translation plates separated from light settings surfaces.
- Written state labels distinguish Auto starting from capture readiness, and explain waiting, updating, and errors.

## Colors

The palette uses quiet cool neutrals for utility surfaces, rose for primary actions and selection, and separate semantic colors for status.

### Primary
- **Muted rose** (`colors.rose`): primary actions, selected settings navigation, and keyboard focus.
- **Pale rose** (`colors.rose-soft`): selected and hover backgrounds.

### Neutral
- **Canvas** (`colors.canvas`): the work area behind settings and content.
- **White surface** (`colors.surface`): windows, fields, and buttons.
- **Ink** (`colors.ink`): primary text.
- **Muted ink** (`colors.muted`): supporting text and secondary labels.
- **Divider** (`colors.line`): field outlines and section separators.
- **Overlay plate** (`colors.overlay`): translated text backing.
- **Overlay text** (`colors.on-overlay`): text on the dark plate.

### Status colors
- **Success** (`colors.success`, `colors.success-soft`): ready or active states.
- **Warning** (`colors.warning`, `colors.warning-soft`): waiting or attention states.
- **Error** (`colors.error`): failed actions that need recovery.

**The State Label Rule.** Pair status color with a word such as "Starting", "Capturing", "Waiting", or "Updating". Color alone does not explain what Rosecr is doing.

## Typography

**Display Font:** Noto Sans, with Segoe UI and sans-serif fallbacks.
**Japanese Font:** Noto Sans JP, with Yu Gothic and sans-serif fallbacks.

**Character:** Use a plain, compact sans serif for controls and supporting copy. Keep Japanese and Latin in the matching stacks so text stays familiar in both directions.

### Hierarchy
- **Display:** App-level titles.
- **Section:** Settings page and surface headings.
- **Title:** Subsection headings.
- **Body:** Explanations and supporting copy.
- **Control:** Toolbar actions, settings navigation, and form values.
- **Field label:** Form labels that need more weight than their help text.
- **Caption:** Supporting labels and secondary metadata.
- **Overlay:** Translation text over the game. Respect the configurable minimum, initially 12 DIP.

## Layout

Use a compact horizontal controller and shallow settings pages. Keep settings navigation beside its content when the window has room; let it become a horizontal strip in a narrow window. Stack form rows when space is limited. The controller may scroll horizontally rather than squeezing its controls. These rules support resizing a Windows desktop window and do not make Rosecr a mobile product.

Use the spacing scale in the frontmatter for control gaps, section padding, and page rhythm. Separate regions with whitespace and thin dividers instead of nested cards.

## Elevation & Depth

The system is flat. It uses surface contrast, borders, and status color to separate regions; the design foundation has no box shadows. Keyboard focus uses a visible outline. State transitions stay brief and follow the Windows reduced-motion preference.

## Shapes

Controls use gently rounded corners. Settings windows are more rounded than controls, while translation plates and status pills use the smaller radius. Keep outlines and separators thin. The focus outline is 2px with a 3px offset.

## Components

### Buttons

The primary button marks the action that starts a translation. Secondary and ghost buttons handle settings and supporting actions. Disabled controls use a neutral surface and muted text. Hover uses a pale rose background for secondary buttons and a darker rose for the primary action. Keyboard focus remains visible. The brief active press moves the control down by 1px.

### Status pills

Use short text labels with the matching semantic color for active, waiting, and error states. A pill reports status; it is not an action.

### Cards and containers

Use white windows and simple bordered settings rows. Keep cards shallow and reserve the dark plate treatment for translated game text.

### Inputs and fields

Fields use a white fill, neutral border, compact padding, and the same control corner as buttons. Use the rose focus outline. Pair field labels with quieter help text when a setting needs explanation.

### Navigation

Settings navigation stays shallow. At desktop widths it sits to the left of the page content. In a narrow window it becomes a horizontal row. The selected item uses rose text and a pale rose background.

### Translation plate

The passive plate sits over the source box, uses the dark overlay colors, and never accepts input or focus. Keep the original source visible while the first result is pending. During an update, keep the last valid translation visible but dim it. Show only complete results.

**The Complete Result Rule.** Never show a partial translation. Commit the finished text as one update.

## Do's and Don'ts

### Do
- Do keep controls compact and leave the game as the main view.
- Do pair status colors with explicit text labels.
- Do keep the source visible until the first complete translation is ready.
- Do keep the last valid translation readable while an update is pending.
- Do preserve all translated text and resolve collisions in PRD order: wrap, shrink to the readable minimum, expand, reposition, then use an edge callout.
- Do reflow settings for resized desktop windows.

### Don't
- Don't treat the design mockup or its synthetic examples as shipped OCR or translation behavior.
- Don't show streamed or partial translation text.
- Don't make passive translation plates interactive.
- Don't add a provider marketplace to the v1 settings. Codex is the only planned provider.
- Don't turn settings into a dashboard or a nested-card layout.
