"""B5. Đọc bảng theo ô trên trang ảnh.

Docling TableFormer dựng lưới ô (hàng, cột, ô gộp, hàng tiêu đề, khung từng ô). Sau đó mỗi ô được cắt riêng từ ảnh
trang, tách dòng bằng chiếu ngang rồi đọc như B4. Đọc theo ô thay vì theo dòng để chữ của các cột không lẫn vào nhau.
Ô đánh dấu "X" nhận biết bằng lượng mực. Bảng kẻ ô rõ mà TableFormer dựng sai thì dùng lưới từ đường kẻ (OpenCV).
"""

from __future__ import annotations

import cv2
import numpy as np
from PIL import Image

from .config import SETTINGS, Settings
from .line_ocr import LineReader

CHECK_MARKS = {"x", "×", "✓", "✔", "v", "+"}


def ink_ratio(crop: np.ndarray) -> float:
    if crop.size == 0:
        return 0.0
    gray = crop if crop.ndim == 2 else cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    return float((gray < 160).mean())


def split_lines_by_projection(crop: np.ndarray) -> list[np.ndarray]:
    """Tách các dòng chữ trong một ô theo hình chiếu ngang. Khoảng hở nhỏ (dấu thanh tách khỏi thân chữ) được gộp lại."""
    if crop.size == 0:
        return []
    gray = crop if crop.ndim == 2 else cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    ink_rows = (gray < 160).sum(axis=1)
    threshold = max(1, int(0.01 * gray.shape[1]))
    runs: list[list[int]] = []
    start = None
    for y, value in enumerate(ink_rows):
        if value >= threshold and start is None:
            start = y
        elif value < threshold and start is not None:
            runs.append([start, y])
            start = None
    if start is not None:
        runs.append([start, len(ink_rows)])
    if not runs:
        return []
    heights = sorted(end - begin for begin, end in runs)
    median = heights[len(heights) // 2]
    merged: list[list[int]] = [runs[0]]
    for begin, end in runs[1:]:
        gap = begin - merged[-1][1]
        small_piece = (end - begin) < 0.45 * median or (merged[-1][1] - merged[-1][0]) < 0.45 * median
        if gap < 0.35 * median or (small_piece and gap < 0.8 * median):
            merged[-1][1] = end
        else:
            merged.append([begin, end])
    lines = []
    for begin, end in merged:
        if end - begin < 4:
            continue
        pad = int(0.2 * (end - begin))
        lines.append(crop[max(0, begin - pad):min(crop.shape[0], end + pad)])
    return lines


def grid_from_rulings(crop: np.ndarray) -> list[tuple[int, int, int, int, int, int]] | None:
    """Lưới ô từ giao điểm đường kẻ. Trả về [(hàng, cột, x0, y0, x1, y1)] theo điểm ảnh của vùng bảng, hoặc None."""
    gray = crop if crop.ndim == 2 else cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 15, 10)
    height, width = binary.shape
    horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (max(10, width // 25), 1)))
    vertical = cv2.morphologyEx(binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(10, height // 25))))
    rows = _ruling_positions(horizontal.sum(axis=1) / 255, 0.5 * width)
    cols = _ruling_positions(vertical.sum(axis=0) / 255, 0.5 * height)
    if len(rows) < 3 or len(cols) < 3:
        return None
    cells = []
    for r in range(len(rows) - 1):
        for c in range(len(cols) - 1):
            cells.append((r, c, cols[c], rows[r], cols[c + 1], rows[r + 1]))
    return cells


def _ruling_positions(profile: np.ndarray, min_length: float) -> list[int]:
    positions: list[int] = []
    in_line = False
    start = 0
    for index, value in enumerate(profile):
        if value >= min_length and not in_line:
            in_line, start = True, index
        elif value < min_length and in_line:
            in_line = False
            positions.append((start + index) // 2)
    if in_line:
        positions.append((start + len(profile)) // 2)
    return positions


def reread_cells(page_image: Image.Image, scale: float, cells: list[dict], reader: LineReader, settings: Settings = SETTINGS) -> None:
    """Đọc lại chữ từng ô bảng từ ảnh trang. cells[i]["_pt"] là khung ô theo điểm PDF gốc trên trái.

    Ghi đè text, confidence, source, flags, readings của từng ô.
    """
    image = np.asarray(page_image.convert("RGB"))
    height, width = image.shape[:2]
    crops: list[np.ndarray] = []
    owners: list[int] = []
    ink_by_cell: dict[int, float] = {}
    for index, cell in enumerate(cells):
        box = cell.get("_pt")
        if not box:
            continue
        l, t, r, b = box
        inset = 2
        x0, y0 = int(max(0, l * scale + inset)), int(max(0, t * scale + inset))
        x1, y1 = int(min(width, r * scale - inset)), int(min(height, b * scale - inset))
        if x1 - x0 < 4 or y1 - y0 < 4:
            continue
        crop = image[y0:y1, x0:x1]
        ink = ink_ratio(crop)
        ink_by_cell[index] = ink
        if ink < 0.003:
            cell.update(text="", confidence=None, source="vietocr", flags=[])
            continue
        lines = split_lines_by_projection(crop) or [crop]
        for line in lines:
            crops.append(line)
            owners.append(index)
    if not crops:
        return
    readings = reader.read_crops(crops)
    grouped: dict[int, list[dict]] = {}
    for owner, reading in zip(owners, readings):
        grouped.setdefault(owner, []).append(reading)
    for index, items in grouped.items():
        cell = cells[index]
        text = " ".join(item["text"] for item in items if item["text"]).strip()
        flags: list[str] = []
        for item in items:
            for flag in item["flags"]:
                if flag not in flags:
                    flags.append(flag)
        confidences = [item["confidence"] for item in items if item["confidence"] is not None]
        if text.lower() in CHECK_MARKS or (len(text) <= 1 and ink_by_cell.get(index, 0) >= settings.checkbox_ink_ratio):
            text, flags = "X", ["o_danh_dau"]
        sources = {item["source"] for item in items}
        cell.update(
            text=text,
            confidence=min(confidences) if confidences else None,
            source="merged" if "merged" in sources else ("paddle" if sources == {"paddle"} else "vietocr"),
            flags=flags,
        )
        if flags and "o_danh_dau" not in flags:
            cell["readings"] = {
                "vietocr": " ".join(item["vietocr"] or "" for item in items).strip(),
                "second": " ".join(item["second"] or "" for item in items).strip(),
            }
