# TODO-001 Bootstrap the safe utility shell and runtime controls

## Tags

- `prd`
- `vertical-slice`
- `prd:desktop-ocr-translator-prd`
- `app-shell`
- `ui`

## Parent PRD

`desktop-ocr-translator-prd.md`

## What to build

Create the smallest runnable Electron shell that exposes the real v1 control model: Play for one-shot translation, Auto for continuous translation, Overlay visibility, Clear, direction, capture scope, status, and settings. Persist durable preferences without restoring active Auto.

## Acceptance criteria

- [ ] The utility bar launches with Auto off and visibly distinguishes idle, running, waiting, and error status.
- [ ] Play, Auto, Overlay, Clear, direction, scope, and settings controls send typed commands through a narrow main-process IPC boundary.
- [ ] Durable settings reload after restart while active Auto never does.
- [ ] Configurable global shortcuts can be disabled and registration conflicts are visible.

## Blocked by

None - can start immediately

## User stories addressed

- User story 20
- User story 24
- User story 32
- User story 34
- User story 35
- User story 38
- User story 42
- User story 52

## Notes

Controls may initially report unavailable pipeline prerequisites, but their semantics must already match the PRD. Renderer code must not gain direct access to capture, Python, credentials, or providers.
