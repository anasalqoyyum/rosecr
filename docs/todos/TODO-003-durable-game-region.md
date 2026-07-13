# TODO-003 Persist a game target and normalized region

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `capture`
- `ui`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Let the user choose a game window, draw a region inside its client area, preview it, and save the target and normalized coordinates as durable configuration that can reconnect after failures or restart.

## Acceptance criteria

- [ ] Region selection is constrained to the chosen game client area and supports confirm, cancel, and reset.
- [ ] The saved region follows game movement and scaling because it is stored in normalized client coordinates.
- [ ] Restarting Rosecr, losing the game window, or encountering a capture error does not erase the target or region.
- [ ] A unique returning window reconnects automatically; ambiguous matches request only target disambiguation and preserve the region.

## Blocked by

- TODO-002

## User stories addressed

- User story 3
- User story 5
- User story 30
- User story 33
- User story 50
- User story 57

## Notes

Whole-game-window scope is completed in TODO-007. This slice proves durable region capture first.
