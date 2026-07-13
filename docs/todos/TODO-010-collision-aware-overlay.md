# TODO-010 Add source replacement and collision-aware layout

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `overlay`
- `layout`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Replace source text with readable game-anchored translations using a current blurred crop or safe plate, atomic updates, global collision resolution, protected target-language regions, and a complete edge-callout fallback for dense screens.

## Acceptance criteria

- [ ] A translated source box is concealed only after a complete current-generation translation is ready.
- [ ] Updating boxes keep the last matching translation dimmed; a failed changed-source update reveals current source text.
- [ ] Layout follows wrap, readable shrink, expansion, reposition, and edge-callout order.
- [ ] Representative dialogue, menu, and Kiseki-style log layouts contain no translation overlap, protected-target overlap, or silent truncation.
- [ ] Position and size commit atomically without token streaming or distracting layout animation.

## Blocked by

- TODO-005
- TODO-006
- TODO-007

## User stories addressed

- User story 17
- User story 21
- User story 22
- User story 31
- User story 44
- User story 45
- User story 46
- User story 53
- User story 58

## Notes

Use the latest safe captured crop for blur; fall back to a neutral plate when the crop is stale or unsuitable.
