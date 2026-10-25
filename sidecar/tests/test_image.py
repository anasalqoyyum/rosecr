import io

import numpy as np
import pytest
from PIL import Image

from rosecr_ocr.image import decode_bgr, parse_ocr_request
from rosecr_ocr.protocol import RequestError


def request(image_format, width=2, height=1):
    return parse_ocr_request({
        'type': 'ocr', 'requestId': 1, 'captureGeneration': 3,
        'width': width, 'height': height, 'format': image_format,
    })


def test_raw_formats_decode_to_bgr():
    expected = [[[3, 2, 1], [30, 20, 10]]]
    assert decode_bgr(request('rgba8'), bytes([1, 2, 3, 255, 10, 20, 30, 255])).tolist() == expected
    assert decode_bgr(request('bgra8'), bytes([3, 2, 1, 255, 30, 20, 10, 255])).tolist() == expected


def test_png_decodes_to_bgr_and_checks_dimensions():
    buffer = io.BytesIO()
    Image.fromarray(np.array([[[1, 2, 3], [10, 20, 30]]], dtype=np.uint8)).save(buffer, format='PNG')
    assert decode_bgr(request('png'), buffer.getvalue()).tolist() == [[[3, 2, 1], [30, 20, 10]]]
    with pytest.raises(RequestError):
        decode_bgr(request('png', width=3), buffer.getvalue())


def test_rejects_wrong_buffer_length_and_invalid_headers():
    with pytest.raises(RequestError):
        decode_bgr(request('bgra8'), bytes(7))
    for header in (
        {'requestId': -1, 'captureGeneration': 0, 'width': 1, 'height': 1, 'format': 'png'},
        {'requestId': True, 'captureGeneration': 0, 'width': 1, 'height': 1, 'format': 'png'},
        {'requestId': 1, 'captureGeneration': 0, 'width': 0, 'height': 1, 'format': 'png'},
        {'requestId': 1, 'captureGeneration': 0, 'width': 7680, 'height': 4321, 'format': 'png'},
        {'requestId': 1, 'captureGeneration': 0, 'width': 1, 'height': 1, 'format': 'jpeg'},
    ):
        with pytest.raises(RequestError):
            parse_ocr_request(header)
