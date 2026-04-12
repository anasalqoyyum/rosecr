# TODO-008 Add performance profiles and advanced scan cadence controls

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `settings`
- `performance`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Expose user-facing performance profiles and scan cadence controls in the settings UI so readers can choose fast, balanced, or accurate behavior and optionally tune refresh cadence. These controls must affect the real capture and translation loop, not just store config.

## Acceptance criteria

- [ ] The settings UI exposes at least fast, balanced, and accurate profiles plus an advanced scan cadence control.
- [ ] Changing profile settings affects the active realtime loop without requiring code changes or obscure developer flags.
- [ ] Balanced is the default profile for a fresh setup.

## Blocked by

- TODO-006
- TODO-007

## User stories addressed

- User story 7
- User story 8
- User story 23
- User story 30
- User story 32

## Notes

Keep the user-facing terminology aligned with `scan interval` or `scan cadence`, not `translation interval`.
