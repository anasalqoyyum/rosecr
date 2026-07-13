# TODO-014 Add overlay customization, accessibility, and shortcuts

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `overlay`
- `accessibility`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Let users tune the live replacement overlay for different games through readable fonts, minimum size, theme, opacity, outline, density, reduced motion, and reliable global shortcuts without weakening click-through behavior.

## Acceptance criteria

- [ ] Settings change live theme, plate opacity, text size, outline, density, and readable minimum without restart.
- [ ] Noto Sans and Noto Sans JP or equivalent redistributable fallbacks cover both v1 languages.
- [ ] Windows reduced-motion preference disables the short opacity transition and no layout tween remains.
- [ ] Play, Auto, Overlay, and Clear shortcuts are configurable, individually disableable, and report registration conflicts.
- [ ] Passive overlays remain non-focusable, click-through, capture-excluded, and keyboard inaccessible while the utility bar remains operable.

## Blocked by

- TODO-010

## User stories addressed

- User story 20
- User story 21
- User story 22
- User story 35
- User story 54
- User story 58

## Notes

Do not attempt proprietary game-font reproduction. Readability is the invariant.
