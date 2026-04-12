# TODO-003 Select a screen region and preview capture updates

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `capture`
- `ui`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Implement the first real capture workflow by letting the user choose a screen region, confirm it, and see that the app is monitoring that region. This slice should include the temporary selection surface, saved active region state, and visible feedback in the utility bar or settings.

## Acceptance criteria

- [ ] The user can invoke region selection, drag a rectangle, and confirm or cancel it.
- [ ] The chosen region becomes the active scope and is reflected in app UI.
- [ ] The app can display some form of live preview or status that proves the selected region is being captured.

## Blocked by

- TODO-001

## User stories addressed

- User story 3
- User story 30
- User story 33
- User story 38

## Notes

Keep this slice focused on region scope only. Fullscreen and active-window scope come later as a separate slice.
