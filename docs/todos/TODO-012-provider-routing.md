# TODO-012 Add local/cloud provider switching and explicit routing UI

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `providers`
- `privacy`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Expose the hybrid translation model in the product by allowing users to switch between local and cloud providers and by clearly indicating when text will be sent externally. This slice should make the privacy stance real in the UI.

## Acceptance criteria

- [ ] The user can switch between at least one local provider path and one cloud provider path from the app UI.
- [ ] The UI makes cloud routing explicit before cloud translation is used.
- [ ] The active provider choice affects the real translation loop without restart-only configuration hacks.

## Blocked by

- TODO-011

## User stories addressed

- User story 10
- User story 11
- User story 12
- User story 39

## Notes

The local path can initially prioritize functional offline capability over premium quality.
