# OCR sidecar

This is the sidecar half of `TODO-004`. Electron starts a Python process, sends it frames over private stdio, and gets back positioned OCR boxes. Live capture and debug overlays are not wired yet; see [remaining TODO-004 work](#remaining-todo-004-work).

| Piece | Location |
| --- | --- |
| Python sidecar | `sidecar/rosecr_ocr/` |
| Frame codec and message validation | `src/main/ocr-sidecar-protocol.ts` |
| Supervisor and client | `src/main/ocr-sidecar.ts` |
| Shared result types | `OcrBox`, `OcrResult` in `src/shared/contracts.ts` |
| Fixtures | `test/fixtures/ocr/`, rendered by `sidecar/tools/make_fixtures.py` |

## Engine choice: RapidOCR, not owocr

The PRD originally named `owocr` as the v1 OCR engine. The sidecar calls RapidOCR directly instead, and the PRD, `docs/architecture.md`, and the M1 exit criteria now say so. This section records why.

I evaluated `owocr` 1.26.8, the latest release, against the TODO-004 contract:

- **No confidence.** `owocr.ocr.OcrResult` has no confidence field, and every engine adapter discards the engine's scores. The PRD's two-scan rule for low-confidence text needs them.
- **The RapidOCR adapter is slow and reaches the network.** It hardcodes PP-OCRv5 with RapidOCR's default `limit_type: min`, which scales a 960x240 crop up to 2944x736 before detection, and it took 1.1 to 1.3 s per frame. Its recognition model is not in the RapidOCR wheel, so the first run downloads it from modelscope.cn. It also split English lines into separate words.
- **meikiocr through owocr** ran in about 100 ms but reads only Japanese. It returned `Thebridgetotheeastisclosed` for the English fixture, misread 吾 as 雷, and downloaded its model from Hugging Face during a 12.8 s init.
- **OneOCR**, the Windows Snipping Tool engine, needs DLLs copied out of the user's Snipping Tool install. Rosecr cannot ship them. I did not evaluate it.
- **License.** `owocr` is GPL-3.0-only. Bundling it puts the sidecar under GPL terms.
- **Dependencies.** `owocr` requires pynput (global input hooks), a tray icon, desktop notifications, and an OBS client, none of which `owocr.ocr` imports.

What the sidecar uses instead:

- RapidOCR 3.10.0 on onnxruntime 1.31.0 with PP-OCRv6 small detection and the `japan` recognizer, which also reads English with correct spacing. Both models ship inside the RapidOCR wheel (31 MB), and the engine passes explicit model paths, so a missing model fails startup instead of starting a download.
- Detection runs on the image scaled down to at most 960 px on its long side. Recognition still crops the original pixels, so a 40 px line inside a 4K frame reads correctly.
- The 180° text-line classifier is off, since game text is not upside down.
- onnxruntime uses 4 intra-op threads to leave cores for the game. I tuned this on one machine; profiles (`TODO-008`) should own it.
- Licenses: RapidOCR, PP-OCR models, and OpenCV are Apache-2.0; onnxruntime, Pillow, and pyclipper are MIT-style; numpy and shapely are BSD.

Another engine can plug in at `RapidOcrEngine.recognize(bgr) -> list[Detection]` in `sidecar/rosecr_ocr/engine.py`, as long as it reports confidence.

## Protocol

Both directions use the same frame:

```text
frame   := u32be payload_length, payload
payload := u32be header_length, UTF-8 JSON header, binary body
```

| Direction | Header `type` | Body |
| --- | --- | --- |
| Electron to sidecar | `ocr` with `requestId`, `captureGeneration`, `width`, `height`, `format` | Image: `bgra8` or `rgba8` (tightly packed, 4 bytes per pixel) or `png` |
| Sidecar to Electron | `ready` with `protocolVersion`, `engine`, `startupMs` | None |
| Sidecar to Electron | `startup-failed` with `code` | None |
| Sidecar to Electron | `ocr-result` with `requestId`, `captureGeneration`, `boxes`, `ocrMs` | None |
| Sidecar to Electron | `error` with `requestId`, `code` (`invalid-request`, `invalid-image`, `engine-failed`) | None |

Each box carries an integer physical-pixel rectangle relative to the submitted image, normalized text, a 0 to 1 confidence, `horizontal` or `vertical` orientation, and a `readingOrder` index. The caller adds the crop offset to place boxes in the game client area.

The request is a pixel buffer plus generation and physical dimensions, with no Electron types, so the frame source can change. `bgra8` matches Windows capture surfaces and skips any conversion in Python. `png` exists for fixtures and costs an encode and decode.

Orientation is geometric: a box with more than one character whose height is at least 1.5 times its width is vertical. Reading order puts horizontal text in rows (top to bottom, then left to right) and vertical text in columns (right to left, then top to bottom), with the vertical block placed among the rows by its top edge. `TODO-015` should replace these heuristics if real games break them.

The sidecar dups its stdout file descriptor for frames and points fd 1 at stderr, so a stray `print()` in any library cannot corrupt the stream.

## Supervisor behavior

| Event | Request outcome | Process |
| --- | --- | --- |
| `recognize()` before ready or after failure | `failed: unavailable` | Unchanged |
| Image larger than 8K (7680x4320 pixels) or with a mismatched buffer length | Rejects with `TypeError`, never sent | Unchanged |
| `recognize()` while a request is in flight | Waits in a single slot and is sent when the sidecar is free | Unchanged |
| `recognize()` while another frame is already waiting | The waiting frame answers `superseded`; the new one takes its place | Unchanged |
| Newer capture generation seen (`advanceGeneration()` or a newer request) | Older waiting and in-flight requests answer `stale` at once; an in-flight result is dropped | Keeps working |
| Request for an older generation | `stale`, never sent | Unchanged |
| Sidecar `error` response | `failed: <code>` | Keeps running |
| Request timeout (default 5 s) | `failed: timeout` | Killed, counts as a failure |
| Malformed frame, invalid box, box outside the image, wrong generation or request ID | `failed: sidecar-failed` | Killed, counts as a failure |
| Crash or exit | In-flight and waiting requests: `failed: sidecar-failed` | Counts as a failure |
| Startup timeout (default 60 s) | None | Killed, counts as a failure |
| `startup-failed`, protocol version mismatch, spawn error | None | Fails at once without a restart, since a restart cannot help |

The first failure after `start()` triggers one restart. A second failure stops the supervisor in `failed` with a reason and an actionable message, such as "OCR stopped after repeated failures. Retry OCR; capture settings are unchanged." Calling `start()` again is the user retry and resets the restart budget. Staying ready for five minutes (`restartRefillMs`) also earns the restart back, so two unrelated crashes hours apart do not stop OCR, while a sidecar that crashes again soon after restarting still stops.

There is one request in flight at a time because the sidecar is single-threaded. That way the timeout measures processing, not queueing behind other frames, and a backlog cannot get a healthy sidecar killed.

A frame submitted while the sidecar is busy waits in one slot instead of being rejected. Auto is change-driven, so a rejected frame on a screen that then stays still might never be submitted again. Only the newest frame waits: the supervisor is never more than one frame behind, and after a generation change the first new frame is sent as soon as the stale work finishes. A waiting frame keeps a reference to its image buffer until it is sent, so the capture source must not reuse the buffer before the promise settles.

The supervisor reads and discards the sidecar's stderr, because a Python traceback can quote recognized text. Validation errors never include message contents. `TODO-012` owns redacted diagnostics.

## Latency

Measured with `pnpm bench:ocr 5 20` on an i5-12400F (6 cores, 12 threads) with nothing else running. "Round trip" is `recognize()` to resolution, including the pipe transfer. "Engine" is the time inside RapidOCR. Each figure is from 20 runs after one warm-up.

Cold start, spawn to `ready`, including model load and one warm-up inference:

| Environment | First launch after install | Later launches |
| --- | --- | --- |
| Windows 11 (build 26300), native | 4.3 s | 1.16 to 1.20 s |
| WSL2 Ubuntu, same machine | Not measured | 0.71 to 0.77 s, with one 3.8 s outlier in 8 launches |

Per frame, `bgra8` input:

| Case | Size | Windows p50 / p90 | Windows engine p50 | WSL p50 / p90 |
| --- | --- | --- | --- | --- |
| Japanese dialogue, 2 lines | 960x240 | 167 / 179 ms | 165 ms | 167 / 190 ms |
| Japanese vertical, 2 columns | 360x560 | 143 / 165 ms | 141 ms | 126 / 145 ms |
| English dialogue, 2 lines | 960x240 | 194 / 212 ms | 191 ms | 170 / 191 ms |
| Heading above 2 vertical columns | 480x600 | 196 / 209 ms | 193 ms | 187 / 195 ms |
| Dialogue inside a 1080p frame | 1920x1080 | 322 / 328 ms | 305 ms | 309 / 344 ms |
| Dialogue inside a 4K frame | 3840x2160 | 375 / 418 ms | 304 ms | 353 / 367 ms |

What the numbers mean:

- A region capture leaves about 1.3 s of the 1.5 s Balanced budget for debounce and translation. A whole 4K window leaves about 1.1 s.
- Detection is most of the engine time. Recognition grows with the number of text lines.
- Moving 33 MB of 4K BGRA through the pipe adds about 70 ms. A region crop sent from Electron avoids most of that.
- These ran with an idle CPU. A running game competes for the same cores; measure again under load on the reference system.

## Windows notes

- The supervisor, its 15 tests, and the fixture test pass on native Windows (Node 26.10, uv-managed CPython 3.12) as well as in WSL.
- The sidecar sets stdin and its frame descriptor to `O_BINARY` through `msvcrt.setmode`, so the CRT never translates `\n` to `\r\n` inside a frame.
- `spawn` uses `windowsHide: true`, so no console window flashes. `kill()` maps to `TerminateProcess`, and the restart tests behave the same as on Linux.
- A uv virtual environment is platform-specific. A venv created in WSL cannot run from Windows, so a Windows checkout needs its own `uv sync`.
- The first launch after install took 4.3 s on Windows against 1.2 s afterwards. File scanning and the first `.pyc` compile are the likely causes; the installer could precompile bytecode.

## Bundling notes

- Launch the bundled interpreter as `python.exe -E -s -m rosecr_ocr` with the sidecar directory as `cwd`. That ignores `PYTHON*` variables and user site-packages. `developmentSidecarLaunch()` does the same with `sidecar/.venv`.
- The Windows `site-packages` measured 266 MB, including about 6 MB of dev-only pytest. `opencv-python-headless` is 113 MB of it, onnxruntime 43 MB, RapidOCR with models 32 MB. Add the Python runtime on top. RapidOCR uses OpenCV only for image operations, so the bundle could shrink if that dependency can be replaced; I did not try.
- Models ship in the RapidOCR wheel today. If OCR assets move to onboarding downloads (`TODO-013`), pass `--model-dir` to the sidecar.
- Versions are pinned in `sidecar/pyproject.toml` and locked in `sidecar/uv.lock`. Python is pinned to 3.12.

## Development

```sh
uv sync --directory sidecar      # create sidecar/.venv
pnpm test                        # includes supervisor tests against a fake sidecar
pnpm test:ocr                    # Python unit tests, then the real sidecar on the fixtures
pnpm bench:ocr [starts] [runs]   # latency table above
```

To regenerate the fixtures, run `uv run --directory sidecar python tools/make_fixtures.py <ipag.ttf> ../test/fixtures/ocr`. The committed images use IPAGothic, and vertical text needs Pillow built with raqm.

## Remaining TODO-004 work

For whoever wires live capture after `TODO-003` and the frame-source decision:

1. Own one `OcrSidecar` in the main process. Call `start()` when Play or Auto first needs OCR, not at app launch, so idle Rosecr spends nothing. Map its status into control state: `failed` becomes the actionable OCR error, and `starting` with `restart: true` becomes a waiting state. Leave capture configuration untouched in every case.
2. Feed frames from the chosen capture source as `bgra8` crops in physical pixels, with the capture generation. Call `advanceGeneration()` whenever the capture coordinator's generation changes (target change, resize, DPI or display change), so in-flight results go stale before they can render.
3. Treat `superseded` and `stale` as no-ops: a newer frame is already queued or the target changed. Hand each frame its own buffer, or wait for the promise to settle before reusing one. The scheduler (`TODO-006`, `TODO-008`) decides cadence.
4. Convert box rectangles to client coordinates by adding the crop origin, then to DIP with `physicalClientRectToDip` for the overlay. Render debug boxes with orientation, confidence, and reading order, and confirm alignment on horizontal and vertical fixture text in a real window, without Rosecr's own windows entering capture.
5. Add an integration test from capture event to debug overlay that covers a stale generation arriving after a target change.
6. Package the sidecar runtime (`TODO-016`) and decide whether `--model-dir` points at installer or onboarding assets.
7. Not built because nothing needs it yet: a ping health check while idle (startup and request timeouts already detect a hung sidecar), and a per-request preprocessing profile. Boxes carry no identifier; `docs/architecture.md` lists one, but stable box identity across frames belongs to the Text Tracking Engine (`TODO-006`), and an index within one result would duplicate `readingOrder`.
