import io

from docling_core.types.doc import BoundingBox, CoordOrigin, DocItemLabel, DoclingDocument, ProvenanceItem, Size, TableCell, TableData
from openpyxl import Workbook

from ocr_service.forms import extract_fields, match_template
from ocr_service.office import parse_xlsx
from ocr_service.structure import assign_pseudo_pages, attach_ocr_lines, document_to_elements, finalize_table


def _prov(page, l, t, r, b):
    return ProvenanceItem(page_no=page, bbox=BoundingBox(l=l, t=t, r=r, b=b, coord_origin=CoordOrigin.BOTTOMLEFT), charspan=(0, 1))


def _document():
    doc = DoclingDocument(name="t")
    doc.add_page(page_no=1, size=Size(width=600, height=800))
    doc.add_heading("Điều 2. Chỉ tiêu", level=1, prov=_prov(1, 50, 760, 300, 740))
    doc.add_text(DocItemLabel.TEXT, "1. Tỷ lệ hộ nghèo giảm còn 0,5%.", prov=_prov(1, 50, 720, 550, 700))
    doc.add_text(DocItemLabel.PAGE_FOOTER, "Trang 1", prov=_prov(1, 280, 30, 320, 20))
    cells = [
        TableCell(text="Chỉ tiêu", start_row_offset_idx=0, end_row_offset_idx=1, start_col_offset_idx=0, end_col_offset_idx=1, column_header=True,
                  bbox=BoundingBox(l=50, t=600, r=300, b=580, coord_origin=CoordOrigin.BOTTOMLEFT)),
        TableCell(text="Kế hoạch", start_row_offset_idx=0, end_row_offset_idx=1, start_col_offset_idx=1, end_col_offset_idx=2, column_header=True),
        TableCell(text="Thu ngân sách", start_row_offset_idx=1, end_row_offset_idx=2, start_col_offset_idx=0, end_col_offset_idx=1),
        TableCell(text="120", start_row_offset_idx=1, end_row_offset_idx=2, start_col_offset_idx=1, end_col_offset_idx=2),
    ]
    doc.add_table(data=TableData(num_rows=2, num_cols=2, table_cells=cells), prov=_prov(1, 50, 600, 550, 500))
    return doc


def test_document_to_elements_keeps_order_types_and_top_left_boxes():
    elements = document_to_elements(_document(), default_source="pdf_text")
    assert [e["type"] for e in elements] == ["heading", "paragraph", "table"]
    heading = elements[0]
    assert heading["page"] == 1 and heading["level"] == 1
    assert heading["_pt"] == [50, 40, 300, 60]
    table = elements[2]
    finalize_table(table, 600, 800)
    assert table["text"] == "Chỉ tiêu Kế hoạch\nThu ngân sách 120"
    assert table["table"]["cells"][0]["bbox"] == [round(50 / 600, 4), 0.25, 0.5, round(220 / 800, 4)]


def test_attach_ocr_lines_carries_flags_and_readings():
    element = {"source": "vietocr", "flags": [], "confidence": None}
    lines = [
        {"bbox": [50, 40, 300, 60], "text": "GIÁY", "confidence": 0.7, "source": "vietocr", "flags": ["can_ra_soat", "am_tiet_khong_hop_le"],
         "readings": {"vietocr": "GIÁY", "second": "GIAY"}, "invalidSyllables": ["GIÁY"]},
        {"bbox": [50, 400, 300, 420], "text": "ngoài", "confidence": 0.2, "source": "paddle", "flags": []},
    ]
    attach_ocr_lines(element, [40, 30, 320, 70], lines)
    assert element["confidence"] == 0.7
    assert element["flags"] == ["can_ra_soat", "am_tiet_khong_hop_le"]
    assert element["readings"][0]["invalidSyllables"] == ["GIÁY"]


def test_pseudo_pages():
    elements = [{"text": "a" * 2000}, {"text": "b" * 2000}, {"text": "c" * 100}]
    assert assign_pseudo_pages(elements, 3200) == 2
    assert [e["page"] for e in elements] == [1, 2, 2]


def test_parse_xlsx_values_and_merged_cells():
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Chỉ tiêu"
    sheet.append(["STT", "Chỉ tiêu", "Kế hoạch"])
    sheet.append([1, "Thu ngân sách", 120.5])
    sheet.append([2, "Tỷ lệ hộ nghèo", "=1/2"])
    sheet.merge_cells("A5:C5")
    sheet["A5"] = "Ghi chú chung"
    buffer = io.BytesIO()
    workbook.save(buffer)
    pages = parse_xlsx(buffer.getvalue())
    assert len(pages) == 1
    table = pages[0]["elements"][1]["table"]
    assert table["numRows"] == 4
    merged = [c for c in table["cells"] if c["text"] == "Ghi chú chung"][0]
    assert merged["colSpan"] == 3 and merged["ref"] == "Chỉ tiêu!A5"
    assert "Thu ngân sách 120.5" in pages[0]["elements"][1]["text"]


def test_form_template_fields():
    template = {"id": "phieu", "match": ["PHIẾU ĐÁNH GIÁ"], "fields": [
        {"name": "diem", "label": "Tổng điểm", "box": [0.6, 0.8, 0.95, 0.85], "indicator": {"name": "Điểm hài lòng", "unit": "điểm"}}]}
    assert match_template("phieu danh gia muc do hai long", [template]) is template
    fields = extract_fields(template, [{"bbox": [0.7, 0.81, 0.8, 0.84], "text": "95", "confidence": 0.9, "flags": []}])
    assert fields[0]["field"]["value"] == "95" and fields[0]["type"] == "form_field"
