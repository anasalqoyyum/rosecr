import io
from dataclasses import dataclass
from typing import Literal, get_args

import numpy as np
from PIL import Image, UnidentifiedImageError

from .protocol import RequestError

ImageFormat = Literal['png', 'rgba8', 'bgra8']
# Matches MAX_IMAGE_PIXELS in src/main/ocr-sidecar.ts: one 8K frame.
MAX_PIXELS = 7680 * 4320


@dataclass(frozen=True)
class OcrRequest:
    request_id: int
    capture_generation: int
    width: int
    height: int
    image_format: ImageFormat


def is_non_negative_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def parse_ocr_request(header: dict) -> OcrRequest:
    request_id = header.get('requestId')
    generation = header.get('captureGeneration')
    width = header.get('width')
    height = header.get('height')
    image_format = header.get('format')
    if not (is_non_negative_int(request_id) and is_non_negative_int(generation)):
        raise RequestError('invalid-request', 'requestId and captureGeneration must be non-negative integers.')
    if not (is_non_negative_int(width) and is_non_negative_int(height)
            and width > 0 and height > 0 and width * height <= MAX_PIXELS):
        raise RequestError('invalid-request', 'width and height are out of range.')
    if image_format not in get_args(ImageFormat):
        raise RequestError('invalid-request', 'format is not supported.')
    return OcrRequest(request_id, generation, width, height, image_format)


def decode_bgr(request: OcrRequest, body: bytes) -> np.ndarray:
    """Decode the request body into the contiguous BGR array RapidOCR expects."""
    if request.image_format == 'png':
        try:
            with Image.open(io.BytesIO(body)) as image:
                if image.size != (request.width, request.height):
                    raise RequestError('invalid-image', 'PNG dimensions do not match the request.')
                rgb = np.asarray(image.convert('RGB'))
        except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as error:
            raise RequestError('invalid-image', 'Body is not a readable PNG.') from error
        return np.ascontiguousarray(rgb[:, :, ::-1])

    if len(body) != request.width * request.height * 4:
        raise RequestError('invalid-image', 'Pixel buffer length does not match width * height * 4.')
    pixels = np.frombuffer(body, dtype=np.uint8).reshape(request.height, request.width, 4)
    channels = pixels[:, :, :3] if request.image_format == 'bgra8' else pixels[:, :, 2::-1]
    return np.ascontiguousarray(channels)
