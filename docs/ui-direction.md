# UI Direction

This document captures the intended visual direction for the desktop OCR translator.

## Summary

The product UI should feel like a lightweight desktop utility:

- Simple, compact settings surfaces
- Fast access to core toggles
- Minimal visual noise
- Overlay text that is readable but not overly heavy
- A design that feels practical for long reading sessions

The app should avoid looking like a full admin dashboard, a chat app, or a complex creative tool.

## Settings Reference

The settings experience should be close to this style:

- Left-side navigation
- Compact forms and toggles
- Utility-focused layout
- Small persistent controls for common actions

Reference:

![Settings reference](https://www.gaminik.net/static/images/windows/windows1_960.png)

## Overlay Reference

The overlay translation experience should be close to this style:

- Translation rendered directly over the source area
- Lightweight translated text boxes anchored to OCR regions
- Readable contrast and restrained chrome
- Suitable for games, manga, and general desktop reading

Reference:

![Overlay reference](https://www.gaminik.net/static/images/v2/en_page2.png)

## Design Notes

- Overlay boxes should prioritize readability first, decoration second.
- The default theme should be neutral and unobtrusive.
- Users should be able to change theme, colors, opacity, font sizing, and density.
- The realtime controls should stay easy to understand: mode, provider, target language, capture scope, and scan cadence.
- `Scan interval` is a better user-facing term than `translation interval`, because translation should primarily occur only when text changes.

## Implementation Implication

The visual system should support two surfaces:

1. A compact settings app window
2. A transparent overlay layer for translated text boxes and manual inspect interactions
