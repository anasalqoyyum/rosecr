"""Rosecr OCR sidecar. Speaks the frame protocol on the inherited stdin and stdout.

Recognized text appears only in ocr-result frames. Rosecr discards stderr, but keep it
free of recognized text anyway: stderr is what a developer sees when running this by hand.
"""

import argparse
import os
import sys
import time
from pathlib import Path
from typing import TYPE_CHECKING, BinaryIO

from . import PROTOCOL_VERSION
from .image import decode_bgr, is_non_negative_int, parse_ocr_request
from .layout import build_boxes
from .protocol import ProtocolError, RequestError, read_frame, write_frame

if TYPE_CHECKING:
    from .engine import RapidOcrEngine


def _protocol_streams() -> tuple[BinaryIO, BinaryIO]:
    """Keep a private duplicate of stdout for frames and point fd 1 at stderr, so a stray
    print() from any library cannot corrupt the frame stream."""
    out_fd = os.dup(sys.stdout.fileno())
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    if sys.platform == 'win32':
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(out_fd, os.O_BINARY)
    return sys.stdin.buffer, os.fdopen(out_fd, 'wb')


def _milliseconds_since(start: float) -> float:
    return round((time.perf_counter() - start) * 1000, 1)


def _handle(engine: 'RapidOcrEngine', header: dict, body: bytes) -> dict:
    if header.get('type') != 'ocr':
        raise RequestError('invalid-request', 'Unknown message type.')
    request = parse_ocr_request(header)
    image = decode_bgr(request, body)
    started = time.perf_counter()
    try:
        detections = engine.recognize(image)
    except Exception as error:
        raise RequestError('engine-failed', f'OCR engine raised {type(error).__name__}.') from error
    boxes = build_boxes(detections, request.width, request.height)
    return {
        'type': 'ocr-result',
        'requestId': request.request_id,
        'captureGeneration': request.capture_generation,
        'boxes': [box.to_message() for box in boxes],
        'ocrMs': _milliseconds_since(started),
    }


def _error_message(request_id: object, error: RequestError) -> dict:
    return {
        'type': 'error',
        'requestId': request_id if is_non_negative_int(request_id) else None,
        'code': error.code,
        'message': str(error),
    }


def main() -> int:
    parser = argparse.ArgumentParser(prog='rosecr_ocr')
    parser.add_argument('--model-dir', type=Path)
    args = parser.parse_args()

    stdin, stdout = _protocol_streams()
    started = time.perf_counter()
    try:
        # Imported here so a broken onnxruntime or OpenCV install reports engine-unavailable
        # instead of crashing before the protocol starts.
        from .engine import RapidOcrEngine
        engine = RapidOcrEngine(args.model_dir)
        engine.warm_up()
    except Exception as error:
        print(f'OCR engine failed to start: {error}', file=sys.stderr)
        write_frame(stdout, {'type': 'startup-failed', 'code': 'engine-unavailable'})
        return 3
    write_frame(stdout, {
        'type': 'ready',
        'protocolVersion': PROTOCOL_VERSION,
        'engine': {'name': engine.name, 'version': engine.version},
        'startupMs': _milliseconds_since(started),
    })

    while True:
        try:
            frame = read_frame(stdin)
        except RequestError as error:
            write_frame(stdout, _error_message(None, error))
            continue
        except ProtocolError:
            return 2
        if frame is None:
            return 0
        header, body = frame
        try:
            response = _handle(engine, header, body)
        except RequestError as error:
            response = _error_message(header.get('requestId'), error)
        write_frame(stdout, response)


if __name__ == '__main__':
    sys.exit(main())
