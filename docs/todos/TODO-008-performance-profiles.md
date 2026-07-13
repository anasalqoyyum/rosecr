# TODO-008 Add performance profiles and scan cadence controls

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `performance`
- `settings`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Expose Fast, Balanced, and Accurate profiles plus advanced cadence overrides, wire them into the real pipeline, and publish reference measurements for latency, idle CPU, and provider-call suppression.

## Acceptance criteria

- [ ] Fresh setup uses Balanced; initial profile defaults match the PRD and advanced cadence values may override them.
- [ ] Profile changes affect capture cadence, translation debounce, and OCR preprocessing without restart.
- [ ] Ten minutes of unchanged Auto produces zero provider calls after the initial result.
- [ ] On the documented reference system, unchanged Auto averages no more than 5% CPU.
- [ ] Balanced shows feedback within 500 ms, median completion within 1.5 seconds, and 95th percentile within 3 seconds under reference conditions.

## Blocked by

- TODO-006
- TODO-007

## User stories addressed

- User story 7
- User story 8
- User story 16
- User story 23
- User story 30

## Notes

Record hardware, resolution, model, reasoning, profile, cadence, and network conditions with every benchmark.
