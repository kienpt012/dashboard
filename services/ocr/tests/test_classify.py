import io
import zipfile

import pytest

from conftest import DEMO_PDF
from ocr_service.classify import classify_pdf, classify_text, detect_kind, parse_page_range


def test_detect_kind():
    assert detect_kind(b"%PDF-1.7 ...") == "pdf"
    assert detect_kind(b"\x89PNG\r\n\x1a\n....") == "image"
    assert detect_kind(b"II*\x00....") == "image"
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", "<x/>")
    assert detect_kind(buffer.getvalue()) == "docx"
    assert detect_kind(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1rest", "bao-cao.xls") == "xls"
    # OpenDocument và RTF: LibreOffice đổi sang .docx/.xlsx trước khi đọc.
    for mime, kind in (("application/vnd.oasis.opendocument.text", "odt"), ("application/vnd.oasis.opendocument.spreadsheet", "ods")):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr(zipfile.ZipInfo("mimetype"), mime)
            archive.writestr("content.xml", "<x/>")
        assert detect_kind(buffer.getvalue()) == kind
    assert detect_kind(b"{\\rtf1\\ansi Ke hoach}") == "rtf"
    with pytest.raises(ValueError):
        detect_kind(b"hello")


def test_classify_text_page_kinds():
    good = "Điều 1. Giao các chỉ tiêu chuyển đổi số năm 2026 như sau: tỷ lệ số hóa hồ sơ đạt 100%. Đơn vị chủ trì"
    assert classify_text(1, good).kind == "text"
    assert classify_text(2, "  12 ").kind == "scan"
    # Font TCVN3 cũ hiển thị sai bảng mã: chữ có nhưng không ra âm tiết tiếng Việt.
    broken = "Uû ban nh©n d©n ph­êng L¸i Thiªu QuyÕt ®Þnh vÒ viÖc giao chØ tiªu kinh tÕ x· héi n¨m 2026"
    assert classify_text(3, broken).kind == "broken_font"


def test_classify_demo_pdf_has_text_layer():
    classes = classify_pdf(DEMO_PDF.read_bytes())
    assert classes and all(c.kind == "text" for c in classes)


def test_parse_page_range():
    assert parse_page_range(None, 3) == [1, 2, 3]
    assert parse_page_range("2-5,9,1", 6) == [1, 2, 3, 4, 5]
