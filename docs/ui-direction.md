# UI Direction

This document translates the PRD into a compact Windows utility aesthetic. The overlay is the product; configuration should stay out of the player's way.

## Principles

- Keep the utility bar compact and immediately understandable.
- Prioritize readable translation and stable placement over decoration.
- Never steal focus or intercept game input from passive overlays.
- Show state clearly: idle, translating, Auto active, waiting, and error.
- Avoid dashboards, chat layouts, nested cards, and developer-facing controls in the primary flow.

## Utility Bar

The persistent controller takes inspiration from Gaminik's Windows toolbar without copying its visual identity.

Required controls:

- Play for one-shot translation
- Japanese-to-English or English-to-Japanese direction
- Codex model and reasoning access
- Overlay visibility
- Auto
- Region or whole-game-window scope
- Clear overlays
- Settings

Play is not a start/stop button. Auto starts continuous translation immediately and always initializes off when Rosecr launches. Hiding overlays does not silently disable Auto, so its active state must remain visually obvious.

Reference:

![Settings reference](https://www.gaminik.net/static/images/windows/windows1_960.png)

## Settings

Use shallow left navigation and compact forms:

- General
- Capture
- Translation
- Overlay
- Shortcuts
- Diagnostics
- About

V1 has one provider, so the UI should say `Codex account`, not present a provider marketplace or empty provider selector. Model and reasoning controls show only options reported for the signed-in account.

## Overlay

Translations should feel integrated into the game rather than presented in a separate panel.

- Anchor each translation to its OCR box.
- Obscure translated source text with a current blurred crop or a neutral plate.
- Preserve target-language UI, numbers, symbols, and non-linguistic content.
- Resolve collisions in PRD order: wrap at the source anchor, shrink only to the readable minimum, expand into free space, reposition within the game bounds, then use an edge callout.
- Never silently truncate or overlap translations.
- Use an edge callout only when no readable in-place layout exists.
- Keep the previous valid translation dimmed while an update is pending.
- Commit completed translations atomically; never display streamed tokens.
- Use only a brief opacity transition, disabled by Windows reduced-motion preferences.

Reference:

![Overlay reference](https://www.gaminik.net/static/images/v2/en_page2.png)

## Typography and Color

- Default to Noto Sans and Noto Sans JP or equivalent redistributable fonts.
- Maintain at least the configured readable minimum, initially 12 device-independent pixels.
- Use neutral dark or light plates with strong contrast.
- Allow theme, opacity, size, outline, and density adjustments.
- Approximate source weight and alignment only when readability remains strong.

## Interaction

Passive overlays are transparent, non-focusable, click-through, and excluded from capture. Interaction occurs only in the utility bar, settings, onboarding, and temporary region selector.

Global shortcuts should be configurable for Play, Auto, overlay visibility, and Clear. Registration conflicts must be visible and shortcuts may be disabled individually.

## Deferred UI

Manual inspect panels, dictionary cards, provider switching, persistent history, and learning workflows are post-v1 surfaces and should not occupy v1 navigation.
