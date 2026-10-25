"""Turn engine detections into physical-pixel boxes with orientation and reading order."""

import math
from dataclasses import dataclass
from typing import Literal, Sequence

Orientation = Literal['horizontal', 'vertical']

VERTICAL_ASPECT_RATIO = 1.5
SAME_LINE_OVERLAP = 0.5


@dataclass(frozen=True)
class Detection:
    """One engine line: a quadrilateral in image pixels, its text, and a 0..1 score."""
    quad: Sequence[tuple[float, float]]
    text: str
    confidence: float


@dataclass(frozen=True)
class Box:
    x: int
    y: int
    width: int
    height: int
    text: str
    confidence: float
    orientation: Orientation
    reading_order: int

    def to_message(self) -> dict:
        return {
            'x': self.x, 'y': self.y, 'width': self.width, 'height': self.height,
            'text': self.text, 'confidence': self.confidence,
            'orientation': self.orientation, 'readingOrder': self.reading_order,
        }


@dataclass(frozen=True)
class _Placed:
    x: int
    y: int
    width: int
    height: int
    text: str
    confidence: float
    orientation: Orientation

    @property
    def right(self) -> int:
        return self.x + self.width

    @property
    def bottom(self) -> int:
        return self.y + self.height


def normalize_text(text: str) -> str:
    return ' '.join(text.replace('�', ' ').split())


def _place(detection: Detection, image_width: int, image_height: int) -> _Placed | None:
    text = normalize_text(detection.text)
    if not text:
        return None
    xs = [point[0] for point in detection.quad]
    ys = [point[1] for point in detection.quad]
    left = max(0, math.floor(min(xs)))
    top = max(0, math.floor(min(ys)))
    right = min(image_width, math.ceil(max(xs)))
    bottom = min(image_height, math.ceil(max(ys)))
    if right <= left or bottom <= top:
        return None
    width, height = right - left, bottom - top
    # A single glyph has no reading direction, so it stays horizontal.
    vertical = len(text) > 1 and height >= width * VERTICAL_ASPECT_RATIO
    confidence = round(min(1.0, max(0.0, float(detection.confidence))), 4)
    return _Placed(left, top, width, height, text, confidence, 'vertical' if vertical else 'horizontal')


def _overlap(start_a: int, end_a: int, start_b: int, end_b: int) -> int:
    return max(0, min(end_a, end_b) - max(start_a, start_b))


def _rows(boxes: list[_Placed]) -> list[list[_Placed]]:
    rows: list[list[_Placed]] = []
    for box in sorted(boxes, key=lambda item: (item.y + item.height / 2, item.x)):
        row = rows[-1] if rows else None
        if row is not None:
            top, bottom = min(item.y for item in row), max(item.bottom for item in row)
            shortest = min(box.height, bottom - top)
            if _overlap(box.y, box.bottom, top, bottom) >= shortest * SAME_LINE_OVERLAP:
                row.append(box)
                continue
        rows.append([box])
    return [sorted(row, key=lambda item: item.x) for row in rows]


def _columns(boxes: list[_Placed]) -> list[list[_Placed]]:
    columns: list[list[_Placed]] = []
    for box in sorted(boxes, key=lambda item: (-(item.x + item.width / 2), item.y)):
        column = columns[-1] if columns else None
        if column is not None:
            left, right = min(item.x for item in column), max(item.right for item in column)
            narrowest = min(box.width, right - left)
            if _overlap(box.x, box.right, left, right) >= narrowest * SAME_LINE_OVERLAP:
                column.append(box)
                continue
        columns.append([box])
    return [sorted(column, key=lambda item: item.y) for column in columns]


def build_boxes(detections: Sequence[Detection], image_width: int, image_height: int) -> list[Box]:
    """Order horizontal text in rows (top to bottom, left to right) and vertical text in
    columns (right to left, top to bottom). Vertical columns form one block placed among
    the horizontal rows by its top edge."""
    placed = [box for detection in detections if (box := _place(detection, image_width, image_height))]
    horizontal = [box for box in placed if box.orientation == 'horizontal']
    vertical = [box for box in placed if box.orientation == 'vertical']

    blocks: list[tuple[int, list[_Placed]]] = [(min(item.y for item in row), row) for row in _rows(horizontal)]
    if vertical:
        columns = _columns(vertical)
        blocks.append((min(box.y for box in vertical), [box for column in columns for box in column]))
    blocks.sort(key=lambda block: block[0])

    ordered = [box for _, block in blocks for box in block]
    return [
        Box(box.x, box.y, box.width, box.height, box.text, box.confidence, box.orientation, index)
        for index, box in enumerate(ordered)
    ]
