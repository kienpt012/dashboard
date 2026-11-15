"""B6. Parser: gom kết quả của mọi nhánh (lớp chữ, OCR, Word, Excel) về một cấu trúc tài liệu duy nhất.

Mỗi trang có danh sách phần tử theo thứ tự đọc. Mỗi phần tử có type (heading, paragraph, list_item, table,
form_field, stamp), text hoặc cells, page, bbox (chuẩn hóa 0..1, gốc trên trái), confidence, source, flags.
heading_path được API dựng ở B7 vì cần nhìn cả tài liệu (một lô trang không đủ).
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from .vietnamese import normalize_text

HEADING_LABELS = {"section_header", "title"}
PARAGRAPH_LABELS = {"text", "paragraph", "caption", "footnote", "code", "formula", "handwritten_text", "reference", "key_value_region", "form"}
LIST_LABELS = {"list_item"}
CHECKBOX_LABELS = {"checkbox_selected": "[x]", "checkbox_unselected": "[ ]"}


def _label(item: Any) -> str:
    label = getattr(item, "label", None)
    return getattr(label, "value", str(label or ""))


def _prov_box(item: Any, page_height: float | None) -> tuple[int | None, list[float] | None]:
    """Trang và khung (điểm PDF, gốc trên trái) của phần tử; gộp mọi prov nằm trên trang đầu."""
    provs = getattr(item, "prov", None) or []
    if not provs:
        return None, None
    page_no = provs[0].page_no
    boxes = []
    for prov in provs:
        if prov.page_no != page_no or prov.bbox is None:
            continue
        box = prov.bbox
        if page_height is not None:
            box = box.to_top_left_origin(page_height)
        boxes.append((box.l, box.t, box.r, box.b))
    if not boxes:
        return page_no, None
    return page_no, [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]


def normalize_box(box: list[float] | None, width: float | None, height: float | None) -> list[float] | None:
    if not box or not width or not height:
        return None
    x0, y0, x1, y1 = box
    return [round(max(0.0, min(1.0, v)), 4) for v in (x0 / width, y0 / height, x1 / width, y1 / height)]


def _overlap_ratio(inner: list[float], outer: list[float]) -> float:
    ix0, iy0, ix1, iy1 = inner
    ox0, oy0, ox1, oy1 = outer
    w = min(ix1, ox1) - max(ix0, ox0)
    h = min(iy1, oy1) - max(iy0, oy0)
    if w <= 0 or h <= 0:
        return 0.0
    area = max(1e-6, (ix1 - ix0) * (iy1 - iy0))
    return (w * h) / area


def attach_ocr_lines(element: dict, box_pt: list[float] | None, lines: list[dict]) -> None:
    """Gắn độ tin cậy, cờ, nguồn và hai bản đọc của các dòng OCR nằm trong phần tử."""
    if not box_pt or not lines:
        return
    inside = [line for line in lines if _overlap_ratio(line["bbox"], box_pt) >= 0.5]
    if not inside:
        return
    confidences = [line["confidence"] for line in inside if line.get("confidence") is not None]
    flags: list[str] = []
    for line in inside:
        for flag in line.get("flags", []):
            if flag not in flags:
                flags.append(flag)
    element["confidence"] = min(confidences) if confidences else None
    element["source"] = Counter(line["source"] for line in inside).most_common(1)[0][0]
    element["flags"] = flags
    flagged = [line for line in inside if line.get("flags")]
    if flagged:
        element["readings"] = [
            {
                "text": line["text"],
                "vietocr": (line.get("readings") or {}).get("vietocr"),
                "second": (line.get("readings") or {}).get("second"),
                "invalidSyllables": line.get("invalidSyllables", []),
            }
            for line in flagged[:20]
        ]


def table_rows_text(cells: list[dict], num_rows: int, num_cols: int) -> list[list[str]]:
    grid = [["" for _ in range(num_cols)] for _ in range(num_rows)]
    for cell in cells:
        r, c = cell["row"], cell["col"]
        if 0 <= r < num_rows and 0 <= c < num_cols:
            grid[r][c] = cell.get("text") or ""
    return grid


def table_text(cells: list[dict], num_rows: int, num_cols: int) -> str:
    lines = []
    for row in table_rows_text(cells, num_rows, num_cols):
        values = [value for value in row if value]
        if values:
            lines.append(" ".join(values))
    return "\n".join(lines)


def table_element(item: Any, page_height: float | None, default_source: str) -> dict:
    data = item.data
    cells: list[dict] = []
    for cell in data.table_cells:
        box_pt = None
        if cell.bbox is not None:
            box = cell.bbox.to_top_left_origin(page_height) if page_height is not None else cell.bbox
            box_pt = [box.l, box.t, box.r, box.b]
        cells.append({
            "row": cell.start_row_offset_idx,
            "col": cell.start_col_offset_idx,
            "rowSpan": max(1, cell.end_row_offset_idx - cell.start_row_offset_idx),
            "colSpan": max(1, cell.end_col_offset_idx - cell.start_col_offset_idx),
            "text": normalize_text(cell.text or ""),
            "header": bool(cell.column_header),
            "rowHeader": bool(cell.row_header),
            "_pt": box_pt,
            "confidence": None,
            "source": default_source,
            "flags": [],
        })
    return {"numRows": data.num_rows, "numCols": data.num_cols, "cells": cells}


def finalize_table(element: dict, width: float | None, height: float | None) -> None:
    table = element["table"]
    for cell in table["cells"]:
        cell["bbox"] = normalize_box(cell.pop("_pt", None), width, height)
    element["text"] = table_text(table["cells"], table["numRows"], table["numCols"])
    confidences = [cell["confidence"] for cell in table["cells"] if cell.get("confidence") is not None]
    if confidences:
        element["confidence"] = min(confidences)
    flags: list[str] = []
    for cell in table["cells"]:
        for flag in cell.get("flags") or []:
            if flag not in flags and flag != "o_danh_dau":
                flags.append(flag)
    element["flags"] = flags


def document_to_elements(doc: Any, *, default_source: str) -> list[dict]:
    """Duyệt DoclingDocument theo thứ tự đọc, trả về danh sách phần tử thô (khung theo điểm PDF trong "_pt")."""
    elements: list[dict] = []
    for item, _level in doc.iterate_items(traverse_pictures=True):
        label = _label(item)
        page_no, page_height = None, None
        provs = getattr(item, "prov", None) or []
        if provs:
            page_item = doc.pages.get(provs[0].page_no)
            page_height = page_item.size.height if page_item and page_item.size else None
        page_no, box_pt = _prov_box(item, page_height)
        base = {"page": page_no, "_pt": box_pt, "label": label, "confidence": None, "source": default_source, "flags": []}
        if label == "table":
            table = table_element(item, page_height, default_source)
            elements.append({**base, "type": "table", "text": "", "table": table})
            continue
        if label == "picture":
            elements.append({**base, "type": "picture", "text": "", "_item": item})
            continue
        text = normalize_text(getattr(item, "text", "") or "")
        if label in CHECKBOX_LABELS:
            text = f"{CHECKBOX_LABELS[label]} {text}".strip()
        if not text:
            continue
        if label in HEADING_LABELS:
            elements.append({**base, "type": "heading", "text": text, "level": getattr(item, "level", 1) if label == "section_header" else 0})
        elif label in LIST_LABELS:
            marker = normalize_text(getattr(item, "marker", "") or "")
            if marker and not text.startswith(marker):
                text = f"{marker} {text}"
            elements.append({**base, "type": "list_item", "text": text})
        elif label in PARAGRAPH_LABELS or label in CHECKBOX_LABELS:
            elements.append({**base, "type": "paragraph", "text": text})
        # page_header, page_footer, document_index…: bỏ qua (không chứa chỉ tiêu).
    return elements


def assign_pseudo_pages(elements: list[dict], chars_per_page: int) -> int:
    """Word không có trang: chia trang giả theo số ký tự (như bộ đọc cũ), không cắt giữa phần tử."""
    page, used = 1, 0
    for element in elements:
        length = len(element.get("text") or "") + 2
        if used and used + length > chars_per_page:
            page, used = page + 1, 0
        element["page"] = page
        used += length
    return page


def page_text(elements: list[dict]) -> str:
    parts = []
    for element in elements:
        if element["type"] in ("stamp", "picture"):
            continue
        if element.get("text"):
            parts.append(element["text"])
    return "\n".join(parts)
