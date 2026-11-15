import numpy as np
import cv2
from PIL import Image, ImageDraw

from ocr_service.preprocess import estimate_skew, prepare_image, remove_stamps, rotate
from ocr_service.tables import grid_from_rulings, ink_ratio, split_lines_by_projection


def _text_page(angle: float = 0.0) -> Image.Image:
    image = Image.new("RGB", (1200, 1600), "white")
    draw = ImageDraw.Draw(image)
    for row in range(25):
        y = 120 + row * 50
        draw.rectangle([100, y, 1100, y + 18], fill="black")
    bgr = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR)
    bgr = rotate(bgr, angle)
    return Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))


def test_deskew_recovers_small_rotation():
    page = _text_page(-2.0)
    gray = cv2.cvtColor(np.asarray(page), cv2.COLOR_RGB2GRAY)
    assert abs(estimate_skew(gray) - 2.0) <= 0.3


def test_red_stamp_removed_and_reported():
    page = _text_page()
    draw = ImageDraw.Draw(page)
    draw.ellipse([700, 900, 1000, 1200], outline=(220, 30, 30), width=18)
    cleaned, stamps = remove_stamps(cv2.cvtColor(np.asarray(page), cv2.COLOR_RGB2BGR))
    assert len(stamps) == 1
    x0, y0, x1, y1 = stamps[0]
    assert 0.5 < x0 < 0.65 and 0.5 < y0 < 0.6
    hsv = cv2.cvtColor(cleaned, cv2.COLOR_BGR2HSV)
    assert ((hsv[:, :, 1] > 70) & (hsv[:, :, 0] < 12)).sum() < 50


def test_prepare_image_keeps_text_and_size():
    prepared = prepare_image(_text_page(1.0))
    assert prepared.image.size == (1200, 1600)
    assert abs(prepared.angle + 1.0) <= 0.3 or abs(prepared.angle - 1.0) <= 0.3


def test_split_lines_by_projection_keeps_diacritics_with_line():
    cell = np.full((120, 300, 3), 255, np.uint8)
    cell[20:24, 40:60] = 0     # dấu thanh tách khỏi thân chữ
    cell[28:48, 20:280] = 0    # dòng 1
    cell[75:95, 20:200] = 0    # dòng 2
    lines = split_lines_by_projection(cell)
    assert len(lines) == 2
    assert ink_ratio(lines[0]) > 0


def test_grid_from_rulings():
    table = np.full((300, 600, 3), 255, np.uint8)
    for y in (10, 100, 200, 290):
        table[y:y + 2, 10:590] = 0
    for x in (10, 200, 400, 588):
        table[10:292, x:x + 2] = 0
    cells = grid_from_rulings(table)
    assert cells is not None
    assert max(c[0] for c in cells) == 2 and max(c[1] for c in cells) == 2
