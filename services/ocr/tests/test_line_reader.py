import numpy as np
import pypdfium2 as pdfium
import pytest

from conftest import DEMO_PDF
from ocr_service.line_ocr import LineReader, crop_line, sort_reading_order, split_wide


def test_sort_reading_order_rows_then_columns():
    boxes = [(300, 10, 400, 30), (10, 12, 100, 32), (10, 60, 100, 80)]
    assert sort_reading_order(boxes) == [1, 0, 2]


def test_split_wide_cuts_long_lines():
    line = np.full((32, 1200, 3), 255, np.uint8)
    for x in range(0, 1200, 60):
        line[8:24, x:x + 45] = 0
    pieces = split_wide(line)
    assert len(pieces) >= 3
    assert all(piece.shape[1] / 32 <= 16 for _, piece in pieces)
    assert sum(piece.shape[1] for _, piece in pieces) == 1200


def test_crop_line_masks_neighbour_core():
    image = np.zeros((100, 200, 3), np.uint8)
    crop = crop_line(image, (10, 40, 190, 60), [(10, 58, 190, 78)])
    assert crop.shape[0] > 20
    assert (crop[-2:, 20:-20] == 255).all()
    assert (crop[:10] == 0).all()


def test_read_region_with_real_detector(monkeypatch):
    pytest.importorskip("rapidocr")
    pdf = pdfium.PdfDocument(DEMO_PDF.read_bytes())
    image = np.asarray(pdf[0].render(scale=3).to_pil().convert("RGB"))
    reader = LineReader()
    # Không có trọng số VietOCR trong môi trường test: giả lập bộ đọc chính, giữ bộ tìm dòng thật.
    monkeypatch.setattr(reader, "_read_vietocr", lambda crops: [("Điều 1. Giao các chỉ tiêu", 0.95) for _ in crops])
    monkeypatch.setattr(reader, "_read_second", lambda crops: ["Dieu 1. Giao cac chi tieu" for _ in crops])
    lines = reader.read_region(image)
    assert len(lines) >= 8
    assert lines[0].bbox[1] < lines[-1].bbox[1]
    assert all(line.flags == [] and line.source == "vietocr" for line in lines)
