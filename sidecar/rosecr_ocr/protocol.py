"""Length-delimited frames shared with src/main/ocr-sidecar-protocol.ts.

frame   := u32be payload_length, payload
payload := u32be header_length, UTF-8 JSON header object, binary body
"""

import json
import struct
from typing import BinaryIO, Literal

MAX_INBOUND_PAYLOAD = 256 * 1024 * 1024
_U32 = struct.Struct('>I')

RequestErrorCode = Literal['invalid-request', 'invalid-image', 'engine-failed']


class ProtocolError(Exception):
    """The byte stream can no longer be trusted to be frame-aligned."""


class RequestError(Exception):
    def __init__(self, code: RequestErrorCode, message: str):
        super().__init__(message)
        self.code = code


def _read_exactly(stream: BinaryIO, size: int) -> bytes | None:
    data = stream.read(size)
    if not data:
        return None
    if len(data) != size:
        raise ProtocolError('Input ended inside a frame.')
    return data


def read_frame(stream: BinaryIO) -> tuple[dict, bytes] | None:
    """Return the next (header, body) pair, or None at a clean end of input.

    A RequestError leaves the stream frame-aligned; a ProtocolError does not.
    """
    prefix = _read_exactly(stream, _U32.size)
    if prefix is None:
        return None
    (payload_length,) = _U32.unpack(prefix)
    if payload_length < _U32.size or payload_length > MAX_INBOUND_PAYLOAD:
        raise ProtocolError('Frame length is out of range.')
    payload = _read_exactly(stream, payload_length)
    if payload is None:
        raise ProtocolError('Input ended inside a frame.')
    (header_length,) = _U32.unpack_from(payload)
    if header_length > payload_length - _U32.size:
        raise ProtocolError('Header length exceeds the frame.')
    header_end = _U32.size + header_length
    try:
        header = json.loads(payload[_U32.size:header_end].decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RequestError('invalid-request', 'Header is not valid JSON.') from error
    if not isinstance(header, dict):
        raise RequestError('invalid-request', 'Header must be a JSON object.')
    return header, payload[header_end:]


def encode_frame(header: dict, body: bytes = b'') -> bytes:
    encoded_header = json.dumps(header, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    payload_length = _U32.size + len(encoded_header) + len(body)
    return _U32.pack(payload_length) + _U32.pack(len(encoded_header)) + encoded_header + body


def write_frame(stream: BinaryIO, header: dict, body: bytes = b'') -> None:
    stream.write(encode_frame(header, body))
    stream.flush()
