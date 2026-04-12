# TODO-001 Bootstrap app shell with utility bar and settings persistence

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `app-shell`
- `ui`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Create the smallest runnable Electron application that matches the intended product shape: a compact utility bar, a settings window entry point, and persisted user settings for core controls like target language, active profile, and overlay/auto mode defaults. This should establish the real desktop shell described in the PRD and docs, not just a placeholder scaffold.

## Acceptance criteria

- [ ] The app launches into a compact utility bar with visible controls for start or pause, scope, target language, and settings access.
- [ ] A settings window can open from the utility bar and persist a small set of real settings across app restarts.
- [ ] The runtime boundary between main process and renderer is established through a stable IPC surface rather than direct renderer access to backend internals.

## Blocked by

None - can start immediately

## User stories addressed

- User story 20
- User story 32
- User story 34
- User story 40
- User story 42

## Notes

This is the foundational UI slice for the rest of the app. Keep the settings set intentionally small at first so the shell remains vertical-slice sized.
