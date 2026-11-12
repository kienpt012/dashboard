"""B1–B2. Nhận diện loại tệp và phân loại từng trang PDF để mỗi trang đi đường ngắn nhất.

- text: lớp chữ đủ dài và chữ hợp lệ → Docling đọc thẳng, không OCR.
- broken_font: có lớp chữ nhưng tỉ lệ âm tiết hợp lệ thấp (font cũ TCVN3/VNI, bảng mã lỗi) → render và OCR như trang scan.
- scan: gần như không có lớp chữ → render, chuẩn bị ảnh (B3) và OCR.
"""

from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass

from .config import SETTINGS, Settings
from .vietnamese import is_wellformed_syllable

TOKEN = re.compile(r"[^\W\d_]{2,}", re.UNICODE)
# Ký tự vùng dùng riêng, ký tự thay thế: dấu hiệu bảng mã font hỏng.
GARBAGE = re.compile(r"[-�]|\(cid:\d+\)")

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@dataclass
class PageClass:
    page: int
    kind: str
    chars: int
    syllable_ratio: float | None

    def to_dict(self) -> dict:
        return {"page": self.page, "kind": self.kind, "chars": self.chars, "syllableRatio": self.syllable_ratio}


def detect_kind(data: bytes, filename: str = "") -> str:
    """pdf | docx | xlsx | image | doc | xls | odt | ods | rtf. Dựa vào chữ ký nội dung, đuôi tệp chỉ dùng để phân
    biệt doc/xls cũ."""
    name = filename.lower()
    if data[:5] == b"%PDF-":
        return "pdf"
    if data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image"
    if data[:4] in (b"II*\x00", b"MM\x00*"):
        return "image"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image"
    if data[:5] == b"{\\rtf":
        return "rtf"
    if data[:4] == b"PK\x03\x04":
        # OpenDocument: entry đầu tiên tên "mimetype", lưu không nén, nội dung là kiểu của tệp.
        head = data[:120]
        if b"mimetypeapplication/vnd.oasis.opendocument.text" in head:
            return "odt"
        if b"mimetypeapplication/vnd.oasis.opendocument.spreadsheet" in head:
            return "ods"
        try:
            names = zipfile.ZipFile(io.BytesIO(data)).namelist()
        except zipfile.BadZipFile:
            raise ValueError("Tệp ZIP hỏng")
        if any(n.startswith("word/") for n in names):
            return "docx"
        if any(n.startswith("xl/") for n in names):
            return "xlsx"
        raise ValueError("Tệp ZIP không phải Word hoặc Excel")
    if data[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        if name.endswith(".xls"):
            return "xls"
        if name.endswith(".doc"):
            return "doc"
        raise ValueError("Tệp Office đời cũ: cần đuôi .doc hoặc .xls để biết loại")
    raise ValueError("Định dạng không được hỗ trợ")


def syllable_ratio(text: str) -> float | None:
    tokens = TOKEN.findall(text)
    if len(tokens) < 8:
        return None
    valid = sum(1 for token in tokens if is_wellformed_syllable(token))
    return valid / len(tokens)


def classify_text(page: int, text: str, settings: Settings = SETTINGS) -> PageClass:
    visible = re.sub(r"\s+", "", text)
    chars = len(visible)
    if chars < settings.min_text_chars:
        return PageClass(page, "scan", chars, None)
    garbage = len(GARBAGE.findall(text))
    ratio = syllable_ratio(text)
    if garbage > 0.05 * chars or (ratio is not None and ratio < settings.min_syllable_ratio):
        return PageClass(page, "broken_font", chars, None if ratio is None else round(ratio, 3))
    return PageClass(page, "text", chars, None if ratio is None else round(ratio, 3))


def classify_pdf(data: bytes, settings: Settings = SETTINGS) -> list[PageClass]:
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(data)
    try:
        result = []
        for index in range(len(pdf)):
            page = pdf[index]
            textpage = page.get_textpage()
            try:
                text = textpage.get_text_range()
            finally:
                textpage.close()
                page.close()
            result.append(classify_text(index + 1, text, settings))
        return result
    finally:
        pdf.close()


def parse_page_range(spec: str | None, page_count: int) -> list[int]:
    """"1-10,12" → [1..10, 12]. Rỗng là mọi trang."""
    if not spec:
        return list(range(1, page_count + 1))
    pages: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            start, end = part.split("-", 1)
            lo, hi = int(start), int(end)
            pages.update(range(max(1, lo), min(page_count, hi) + 1))
        else:
            number = int(part)
            if 1 <= number <= page_count:
                pages.add(number)
    return sorted(pages)
