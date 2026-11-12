import io

import pypdfium2 as pdfium
import pytest
from docx import Document

from conftest import DEMO_PDF
from ocr_service.classify import classify_pdf
from ocr_service.config import SETTINGS
from ocr_service.pipeline import images_to_pdf, inspect, parse, rebuild_pdf


def _scan_pdf() -> bytes:
    pdf = pdfium.PdfDocument(DEMO_PDF.read_bytes())
    image = pdf[0].render(scale=2).to_pil().convert("RGB")
    data, _ = images_to_pdf([image], SETTINGS)
    return data


def test_scanned_page_is_classified_and_rebuilt_as_image():
    scan = _scan_pdf()
    classes = classify_pdf(scan)
    assert [c.kind for c in classes] == ["scan"]
    rebuilt, prepared = rebuild_pdf(scan, [1], {1: classes[0]}, SETTINGS)
    assert 1 in prepared
    out = pdfium.PdfDocument(rebuilt)
    assert len(out) == 1
    assert out[0].get_textpage().get_text_range().strip() == ""


def test_text_pages_are_copied_untouched():
    data = DEMO_PDF.read_bytes()
    classes = {c.page: c for c in classify_pdf(data)}
    rebuilt, prepared = rebuild_pdf(data, [1], classes, SETTINGS)
    assert prepared == {}
    text = pdfium.PdfDocument(rebuilt)[0].get_textpage().get_text_range()
    assert "LÁI THIÊU" in text


def test_inspect_pdf():
    info = inspect(DEMO_PDF.read_bytes(), "a.pdf")
    assert info["kind"] == "pdf" and info["pageCount"] >= 1 and info["pages"][0]["kind"] == "text"


def test_parse_docx_end_to_end():
    pytest.importorskip("docling.backend.msword_backend")
    document = Document()
    document.add_heading("QUYẾT ĐỊNH", level=1)
    document.add_paragraph("Điều 1. Giao các chỉ tiêu năm 2026 như sau:")
    document.add_paragraph("1. Tỷ lệ số hóa hồ sơ đạt 100%.")
    table = document.add_table(rows=2, cols=2)
    for r, row in enumerate([["Chỉ tiêu", "Kế hoạch"], ["Thu ngân sách", "120"]]):
        for c, value in enumerate(row):
            table.cell(r, c).text = value
    buffer = io.BytesIO()
    document.save(buffer)
    result = parse(buffer.getvalue(), "qd.docx")
    elements = result["pages"][0]["elements"]
    assert result["kind"] == "docx"
    assert [e["type"] for e in elements] == ["heading", "paragraph", "paragraph", "table"]
    assert elements[3]["table"]["cells"][3]["text"] == "120"
    assert all(e["id"].startswith("p1-e") for e in elements)
