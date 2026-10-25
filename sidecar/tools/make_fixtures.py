"""Render the OCR fixture images under test/fixtures/ocr.

Usage: uv run python tools/make_fixtures.py <font.ttf> <output-dir>
The committed fixtures were rendered with IPAGothic (ipag.ttf). Vertical text needs
Pillow built with raqm.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BACKGROUND = (24, 28, 48)
PANEL = (8, 10, 20)
TEXT = (245, 245, 240)


def horizontal(font_path: str, lines: list[str], size: tuple[int, int], font_size: int) -> tuple[Image.Image, list[dict]]:
    image = Image.new('RGB', size, BACKGROUND)
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(font_path, font_size)
    draw.rectangle((24, 24, size[0] - 24, size[1] - 24), fill=PANEL)
    expected = []
    for index, line in enumerate(lines):
        x, y = 64, 56 + index * int(font_size * 1.8)
        draw.text((x, y), line, font=font, fill=TEXT)
        left, top, right, bottom = draw.textbbox((x, y), line, font=font)
        expected.append({'text': line, 'orientation': 'horizontal', 'rect': [left, top, right - left, bottom - top]})
    return image, expected


def vertical(font_path: str, columns: list[str], size: tuple[int, int], font_size: int, top: int = 56) -> tuple[Image.Image, list[dict]]:
    image = Image.new('RGB', size, BACKGROUND)
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(font_path, font_size)
    draw.rectangle((24, 24, size[0] - 24, size[1] - 24), fill=PANEL)
    expected = []
    for index, column in enumerate(columns):
        x, y = size[0] - 72 - font_size - index * int(font_size * 1.9), top
        # Top-to-bottom layout through raqm applies the font's vertical glyph forms,
        # which place 。 and 、 in the upper right of their cell.
        draw.text((x, y), column, font=font, fill=TEXT, direction='ttb', features=['vert'])
        left, upper, right, lower = draw.textbbox((x, y), column, font=font, direction='ttb', features=['vert'])
        expected.append({'text': column, 'orientation': 'vertical', 'rect': [left, upper, right - left, lower - upper]})
    return image, expected


def mixed(font_path: str) -> tuple[Image.Image, list[dict]]:
    """A horizontal heading above two vertical columns."""
    image, columns = vertical(font_path, ['西の森へ行く。', '宝箱を開ける。'], (480, 600), 40, top=120)
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(font_path, 32)
    heading = 'Quest Log クエスト'
    draw.text((56, 36), heading, font=font, fill=TEXT)
    left, top, right, bottom = draw.textbbox((56, 36), heading, font=font)
    return image, [{'text': heading, 'orientation': 'horizontal', 'rect': [left, top, right - left, bottom - top]}, *columns]


def main() -> None:
    font_path, output = sys.argv[1], Path(sys.argv[2])
    output.mkdir(parents=True, exist_ok=True)
    fixtures = {
        'ja-horizontal': horizontal(font_path, ['今日はいい天気ですね。', '少し散歩に行きませんか？'], (960, 240), 40),
        'ja-vertical': vertical(font_path, ['吾輩は猫である。', '名前はまだ無い。'], (360, 560), 40),
        'en-horizontal': horizontal(font_path, ['The bridge to the east is closed.', 'Talk to the guard first.'], (960, 240), 40),
        'mixed-orientation': mixed(font_path),
    }
    manifest = {}
    for name, (image, expected) in fixtures.items():
        image.save(output / f'{name}.png', optimize=True)
        manifest[name] = {'width': image.width, 'height': image.height, 'boxes': expected}
    (output / 'expected.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
