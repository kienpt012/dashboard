"""Nhánh Excel và đổi định dạng Office đời cũ.

- .doc, .xls được LibreOffice chạy ngầm đổi sang .docx, .xlsx trước khi xử lý (bản gốc vẫn lưu ở API).
- Excel: openpyxl đọc giá trị ô đã tính (data_only), ô gộp và tên sheet; mỗi sheet là một trang có một bảng.
"""

from __future__ import annotations

import datetime as dt
import io
import shutil
import subprocess
import tempfile
from pathlib import Path

from .vietnamese import normalize_text

MAX_ROWS = 5000
MAX_COLS = 60


def convert_legacy(data: bytes, kind: str, timeout: int = 180) -> bytes:
    target = {"doc": "docx", "xls": "xlsx"}[kind]
    binary = shutil.which("soffice") or shutil.which("libreoffice")
    if not binary:
        raise RuntimeError("Máy chủ OCR chưa cài LibreOffice nên không đọc được tệp .doc, .xls")
    with tempfile.TemporaryDirectory(prefix="ioc-office-") as folder:
        source = Path(folder) / f"input.{kind}"
        source.write_bytes(data)
        subprocess.run(
            [binary, "--headless", "--norestore", f"-env:UserInstallation=file://{folder}/profile",
             "--convert-to", target, "--outdir", folder, str(source)],
            check=True, timeout=timeout, capture_output=True,
        )
        output = Path(folder) / f"input.{target}"
        if not output.exists():
            raise RuntimeError(f"LibreOffice không đổi được tệp .{kind}")
        return output.read_bytes()


def _cell_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.10g}"
    if isinstance(value, (dt.datetime, dt.date)):
        return value.strftime("%Y-%m-%d")
    return normalize_text(str(value))


def parse_xlsx(data: bytes) -> list[dict]:
    from openpyxl import load_workbook

    workbook = load_workbook(io.BytesIO(data), data_only=True, read_only=False)
    pages: list[dict] = []
    for index, sheet in enumerate(workbook.worksheets, start=1):
        if sheet.sheet_state != "visible":
            continue
        max_row = min(sheet.max_row or 0, MAX_ROWS)
        max_col = min(sheet.max_column or 0, MAX_COLS)
        spans: dict[tuple[int, int], tuple[int, int]] = {}
        covered: set[tuple[int, int]] = set()
        for merged in sheet.merged_cells.ranges:
            spans[(merged.min_row, merged.min_col)] = (merged.max_row - merged.min_row + 1, merged.max_col - merged.min_col + 1)
            for r in range(merged.min_row, merged.max_row + 1):
                for c in range(merged.min_col, merged.max_col + 1):
                    if (r, c) != (merged.min_row, merged.min_col):
                        covered.add((r, c))
        rows: list[list[tuple[int, int, str]]] = []
        for r in range(1, max_row + 1):
            row = []
            for c in range(1, max_col + 1):
                if (r, c) in covered:
                    continue
                text = _cell_text(sheet.cell(row=r, column=c).value)
                if text:
                    row.append((r, c, text))
            if row:
                rows.append(row)
        if not rows:
            continue
        used_cols = sorted({c for row in rows for _, c, _ in row})
        col_index = {c: i for i, c in enumerate(used_cols)}
        cells = []
        for row_index, row in enumerate(rows):
            for r, c, text in row:
                row_span, col_span = spans.get((r, c), (1, 1))
                cells.append({
                    "row": row_index,
                    "col": col_index[c],
                    "rowSpan": row_span,
                    "colSpan": col_span,
                    "text": text,
                    "header": row_index == 0,
                    "rowHeader": False,
                    "bbox": None,
                    "confidence": None,
                    "source": "xlsx",
                    "flags": [],
                    "ref": f"{sheet.title}!{_column_letter(c)}{r}",
                })
        table = {"numRows": len(rows), "numCols": len(used_cols), "cells": cells, "sheet": sheet.title}
        text = "\n".join(" ".join(text for _, _, text in row) for row in rows)
        pages.append({
            "page": len(pages) + 1,
            "sheet": sheet.title,
            "kind": "xlsx",
            "elements": [
                {"type": "heading", "label": "sheet", "text": f"Bảng: {sheet.title}", "level": 1, "bbox": None,
                 "confidence": None, "source": "xlsx", "flags": []},
                {"type": "table", "label": "table", "text": text, "table": table, "bbox": None,
                 "confidence": None, "source": "xlsx", "flags": []},
            ],
        })
    return pages


def _column_letter(index: int) -> str:
    letters = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters
