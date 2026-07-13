# TODO-016 Package Windows x64 and execute the v1 release gate

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `packaging`
- `release`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Produce the Windows 11 x64 tester package with bundled runtimes and execute every PRD release criterion against the pinned dependency set, documented reference system, fixture corpus, and bilingual evaluation set.

## Acceptance criteria

- [ ] The installer runs without a separately installed Python runtime and activates only checksum-verified OCR assets.
- [ ] Region and whole-window capture, both language directions, Codex OAuth, one-shot, Auto, overlay replacement, recovery, and startup-idle behavior work in the packaged app.
- [ ] The documented 50-screenshot OCR/gating evaluation and 100-unit bilingual review meet the PRD thresholds.
- [ ] Balanced latency, idle CPU, zero-idle-provider-call, collision, stale-generation, privacy, persistence, and recovery gates pass with recorded evidence.
- [ ] Every contract, fixture, integration, security, packaging, and recovery test passes against the exact Electron, Python, `owocr`, and `pi-ai` versions in the package.

## Blocked by

- TODO-008
- TODO-009
- TODO-010
- TODO-011
- TODO-012
- TODO-013
- TODO-014
- TODO-015

## User stories addressed

- User story 2
- User story 6
- User story 8
- User story 30
- User story 36
- User story 38
- User story 40
- User story 42
- User story 55
- User story 56
- User story 57
- User story 58
- User story 59
- User story 60

## Notes

Windows 10 2004+ may be reported as best-effort only if the pinned package still supports it. Deferred todos are not blockers.
