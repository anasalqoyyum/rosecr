import io
import struct

import pytest

from rosecr_ocr.protocol import ProtocolError, RequestError, encode_frame, read_frame


def test_round_trips_header_and_body():
    stream = io.BytesIO(encode_frame({'type': 'ocr', 'text': '日本語'}, b'\x00\x01') + encode_frame({'type': 'next'}))
    assert read_frame(stream) == ({'type': 'ocr', 'text': '日本語'}, b'\x00\x01')
    assert read_frame(stream) == ({'type': 'next'}, b'')
    assert read_frame(stream) is None


def test_truncated_frame_is_a_protocol_error():
    with pytest.raises(ProtocolError):
        read_frame(io.BytesIO(encode_frame({'type': 'ocr'})[:-1]))


def test_out_of_range_lengths_are_protocol_errors():
    with pytest.raises(ProtocolError):
        read_frame(io.BytesIO(struct.pack('>I', 0xFFFFFFFF)))
    with pytest.raises(ProtocolError):
        read_frame(io.BytesIO(struct.pack('>II', 4, 1)))


def test_bad_header_keeps_stream_aligned():
    bad = b'not json'
    stream = io.BytesIO(struct.pack('>II', 4 + len(bad), len(bad)) + bad + encode_frame({'type': 'next'}))
    with pytest.raises(RequestError):
        read_frame(stream)
    assert read_frame(stream) == ({'type': 'next'}, b'')
