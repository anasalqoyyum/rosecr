from rosecr_ocr.layout import Detection, build_boxes


def rect(x, y, width, height, text, confidence=0.9):
    return Detection([(x, y), (x + width, y), (x + width, y + height), (x, y + height)], text, confidence)


def order(boxes):
    return [box.text for box in sorted(boxes, key=lambda box: box.reading_order)]


def test_horizontal_rows_read_top_to_bottom_then_left_to_right():
    boxes = build_boxes([
        rect(300, 102, 100, 30, 'row2-right'),
        rect(10, 100, 100, 30, 'row2-left'),
        rect(10, 20, 300, 32, 'row1'),
    ], 640, 200)
    assert order(boxes) == ['row1', 'row2-left', 'row2-right']
    assert {box.orientation for box in boxes} == {'horizontal'}


def test_vertical_columns_read_right_to_left_even_when_left_column_starts_higher():
    boxes = build_boxes([
        rect(160, 50, 48, 320, '左の列'),
        rect(240, 54, 48, 320, '右の列'),
    ], 360, 560)
    assert order(boxes) == ['右の列', '左の列']
    assert {box.orientation for box in boxes} == {'vertical'}


def test_vertical_block_sits_among_horizontal_rows_by_top_edge():
    boxes = build_boxes([
        rect(10, 400, 300, 30, 'footer'),
        rect(200, 80, 40, 260, '縦書き'),
        rect(10, 10, 300, 30, 'title'),
    ], 400, 480)
    assert order(boxes) == ['title', '縦書き', 'footer']


def test_single_glyph_is_horizontal_and_geometry_is_clamped_integer_pixels():
    [box] = build_boxes([Detection([(-3.4, 5.6), (20.2, 5.6), (20.2, 60.1), (-3.4, 60.1)], '。', 0.61234)], 18, 50)
    assert (box.x, box.y, box.width, box.height) == (0, 5, 18, 45)
    assert box.orientation == 'horizontal'
    assert box.confidence == 0.6123


def test_whitespace_is_collapsed_and_empty_text_dropped():
    boxes = build_boxes([rect(0, 0, 100, 20, '  Talk   to\tme '), rect(0, 40, 100, 20, ' � ')], 200, 100)
    assert [box.text for box in boxes] == ['Talk to me']
