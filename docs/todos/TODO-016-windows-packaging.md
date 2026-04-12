# TODO-016 Package Windows installer with bundled runtime and recoverable diagnostics

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `packaging`
- `windows`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Package the app into a Windows-first installer flow that bundles the Electron shell, bundled runtime pieces, and recoverable diagnostics so outside testers can install and run it as one product. This should validate the distribution model assumed by the PRD.

## Acceptance criteria

- [ ] A Windows-first install flow can produce a runnable app without requiring manual developer setup steps.
- [ ] The packaged app can launch the bundled runtime pieces needed for the translation workflow.
- [ ] Startup, provider, or asset failures are surfaced through diagnostics that help a tester recover or report the issue.

## Blocked by

- TODO-013

## User stories addressed

- User story 38
- User story 41
- User story 42

## Notes

Keep the focus on a reliable tester-ready package rather than perfect installer polish.
