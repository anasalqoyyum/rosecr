# TODO-005 Translate changed OCR text through one provider and render overlay text

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `translation`
- `overlay`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Replace or augment OCR debug boxes with translated overlay text using one real translation provider. The slice should take OCR text through provider routing, receive translated output, and render readable translated boxes over the selected region.

## Acceptance criteria

- [ ] OCR text from the active region is translated through one working provider path.
- [ ] Translated text is rendered in lightweight overlay boxes aligned to the source OCR regions.
- [ ] Repeated unchanged OCR text is not translated again within the same immediate update cycle.

## Blocked by

- TODO-004

## User stories addressed

- User story 1
- User story 6
- User story 12
- User story 13
- User story 15
- User story 17
- User story 29

## Notes

Choose the simplest provider path for the first implementation. The goal is the first true demo loop, not full provider configurability.
