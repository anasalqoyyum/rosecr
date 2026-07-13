# TODO-009 Add structured batching, bounded context, glossary, and cache

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `translation`
- `context`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Make text-heavy dialogue, menu, and log screens efficient and consistent by batching stable boxes with generation-safe IDs, preserving visual order, carrying bounded session context, maintaining an advisory terminology glossary, and reusing only meaning-compatible cached results.

## Acceptance criteria

- [ ] Batches contain at most eight boxes and about 2,000 source characters, split in visual order with no more than two requests in flight.
- [ ] Each result maps by opaque box and source-generation ID; valid completed items commit independently and obsolete items never do.
- [ ] Context contains only the five latest completed current-generation units in visual order.
- [ ] The session glossary is capped at 100 entries and requires a conflicting mapping to recur before replacing an established mapping.
- [ ] The in-memory 500-entry LRU requires the complete PRD cache key and clears on game change, sign-out, and exit.

## Blocked by

- TODO-006

## User stories addressed

- User story 27
- User story 29
- User story 51
- User story 61

## Notes

Correctness takes priority over cache-hit rate. Cancel a batch only after every item in it becomes obsolete.
