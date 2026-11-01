"""Điều phối B1–B6 cho một tệp (hoặc một lô trang của tệp PDF).

PDF: phân loại trang (B2) → trang scan/lỗi font được render, chuẩn bị ảnh (B3) và thay bằng trang ảnh trong một PDF
dựng lại → Docling đọc PDF đó: trang có lớp chữ đọc thẳng, trang ảnh và ảnh nhúng gọi bộ OCR VietOCR (B4), bảng qua
TableFormer rồi đọc lại theo ô (B5) → đổi sang phần tử của hệ thống (B6).
"""

from __future__ import annotations

import io
import logging
import threading
import time
from typing import Any

import numpy as np
from PIL import Image, ImageOps

from . import __version__
from .classify import PageClass, classify_pdf, detect_kind, parse_page_range
from .config import SETTINGS, Settings
from .docling_ocr import LEDGER, VietOcrOptions, register_plugin
from .forms import extract_fields, load_templates, match_template
from .line_ocr import get_line_reader
from .office import convert_legacy, parse_xlsx
from .preprocess import prepare_image
from .structure import (
    assign_pseudo_pages,
    attach_ocr_lines,
    document_to_elements,
    finalize_table,
    normalize_box,
    page_text,
)
from .tables import grid_from_rulings, reread_cells

log = logging.getLogger(__name__)

OCR_KINDS = {"scan", "broken_font", "image"}
_CONVERTER = None
_CONVERTER_LOCK = threading.Lock()


def docling_version() -> str:
    try:
        from importlib.metadata import version

        return version("docling-slim")
    except Exception:  # pragma: no cover
        return "unknown"


def get_converter():
    global _CONVERTER
    with _CONVERTER_LOCK:
        if _CONVERTER is not None:
            return _CONVERTER
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
        from docling.document_converter import DocumentConverter, PdfFormatOption, WordFormatOption

        register_plugin()
        options = PdfPipelineOptions(
            do_ocr=True,
            do_table_structure=True,
            allow_external_plugins=True,
            ocr_options=VietOcrOptions(scale=SETTINGS.scale),
            generate_page_images=False,
        )
        if SETTINGS.docling_artifacts_path:
            options.artifacts_path = SETTINGS.docling_artifacts_path
        options.table_structure_options.do_cell_matching = True
        options.table_structure_options.mode = TableFormerMode.ACCURATE if SETTINGS.table_mode == "accurate" else TableFormerMode.FAST
        _CONVERTER = DocumentConverter(
            allowed_formats=[InputFormat.PDF, InputFormat.DOCX],
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=options),
                InputFormat.DOCX: WordFormatOption(),
            },
        )
        return _CONVERTER


def _convert(data: bytes, name: str):
    from docling_core.types.io import DocumentStream

    result = get_converter().convert(DocumentStream(name=name, stream=io.BytesIO(data)), raises_on_error=True)
    return result


# ---------------------------------------------------------------------------
# Ảnh và PDF dựng lại


def load_images(data: bytes) -> list[Image.Image]:
    image = Image.open(io.BytesIO(data))
    frames = []
    for index in range(getattr(image, "n_frames", 1)):
        image.seek(index)
        frames.append(ImageOps.exif_transpose(image.copy()).convert("RGB"))
    return frames


def _image_page(pdf, image: Image.Image, width_pt: float, height_pt: float) -> None:
    import pypdfium2 as pdfium

    page = pdf.new_page(width_pt, height_pt)
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, format="JPEG", quality=95)
    buffer.seek(0)
    pdf_image = pdfium.PdfImage.new(pdf)
    pdf_image.load_jpeg(buffer, inline=True, autoclose=False)
    pdf_image.set_matrix(pdfium.PdfMatrix().scale(width_pt, height_pt))
    page.insert_obj(pdf_image)
    page.gen_content()
    page.close()


def _save(pdf) -> bytes:
    out = io.BytesIO()
    pdf.save(out)
    return out.getvalue()


def rebuild_pdf(data: bytes, pages: list[int], classes: dict[int, PageClass], settings: Settings) -> tuple[bytes, dict[int, dict]]:
    """PDF chỉ gồm các trang cần đọc; trang cần OCR được thay bằng ảnh đã chuẩn bị (B3)."""
    import pypdfium2 as pdfium

    source = pdfium.PdfDocument(data)
    target = pdfium.PdfDocument.new()
    prepared_info: dict[int, dict] = {}
    try:
        for number in pages:
            if classes[number].kind not in OCR_KINDS:
                target.import_pages(source, pages=[number - 1])
                continue
            page = source[number - 1]
            width_pt, height_pt = page.get_size()
            rendered = page.render(scale=settings.scale).to_pil().convert("RGB")
            page.close()
            prepared = prepare_image(rendered, photo=False)
            _image_page(target, prepared.image, width_pt, height_pt)
            prepared_info[number] = {"angle": prepared.angle, "stamps": prepared.stamps}
        return _save(target), prepared_info
    finally:
        target.close()
        source.close()


def images_to_pdf(images: list[Image.Image], settings: Settings) -> tuple[bytes, dict[int, dict]]:
    import pypdfium2 as pdfium

    target = pdfium.PdfDocument.new()
    info: dict[int, dict] = {}
    try:
        for number, image in enumerate(images, start=1):
            prepared = prepare_image(image, photo=True)
            width_px, height_px = prepared.image.size
            # Ảnh tải lên coi như đã ở độ phân giải OCR, toạ độ trang tính theo đó.
            _image_page(target, prepared.image, width_px * 72 / settings.dpi, height_px * 72 / settings.dpi)
            info[number] = {"angle": prepared.angle, "stamps": prepared.stamps, "perspectiveFixed": prepared.perspective_fixed}
        return _save(target), info
    finally:
        target.close()


def render_page(data: bytes, index: int, scale: float) -> Image.Image:
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(data)
    try:
        page = pdf[index]
        image = page.render(scale=scale).to_pil().convert("RGB")
        page.close()
        return image
    finally:
        pdf.close()


# ---------------------------------------------------------------------------
# B5 trên phần tử bảng


def _fix_table(element: dict, page_image: Image.Image | None, settings: Settings) -> None:
    if page_image is None:
        return
    table = element["table"]
    reader = get_line_reader()
    if (table["numCols"] <= 1 or table["numRows"] <= 1) and element.get("_pt"):
        # TableFormer dựng sai bảng kẻ ô rõ: dựng lưới từ đường kẻ.
        l, t, r, b = element["_pt"]
        scale = settings.scale
        crop = np.asarray(page_image)[int(t * scale):int(b * scale), int(l * scale):int(r * scale)]
        grid = grid_from_rulings(crop) if crop.size else None
        if grid:
            table["cells"] = [
                {"row": row, "col": col, "rowSpan": 1, "colSpan": 1, "text": "", "header": row == 0, "rowHeader": False,
                 "_pt": [l + x0 / scale, t + y0 / scale, l + x1 / scale, t + y1 / scale],
                 "confidence": None, "source": None, "flags": []}
                for row, col, x0, y0, x1, y1 in grid
            ]
            table["numRows"] = max(cell["row"] for cell in table["cells"]) + 1
            table["numCols"] = max(cell["col"] for cell in table["cells"]) + 1
            table["gridFallback"] = True
    reread_cells(page_image, settings.scale, table["cells"], reader, settings)


# ---------------------------------------------------------------------------


def _finalize_elements(raw: list[dict], page_number: int, width: float | None, height: float | None) -> list[dict]:
    out = []
    for index, element in enumerate(raw):
        element = dict(element)
        element.pop("_item", None)
        if element["type"] == "table":
            finalize_table(element, width, height)
        if "bbox" not in element or element.get("_pt") is not None:
            element["bbox"] = normalize_box(element.get("_pt"), width, height)
        element.pop("_pt", None)
        element["page"] = page_number
        element["id"] = f"p{page_number}-e{index}"
        out.append(element)
    return out


def _pdf_like(pdf_bytes: bytes, original_pages: list[int], classes: dict[int, PageClass], prepared: dict[int, dict],
              settings: Settings, warnings: list[str]) -> list[dict]:
    result = _convert(pdf_bytes, "document.pdf")
    doc = result.document
    ledger = LEDGER.pop(result.input.document_hash)
    raw = document_to_elements(doc, default_source="pdf_text")
    by_page: dict[int, list[dict]] = {n: [] for n in range(1, len(original_pages) + 1)}
    for element in raw:
        if element["page"] in by_page:
            by_page[element["page"]].append(element)
    templates = load_templates()
    pages: list[dict] = []
    for rebuilt_number, original in enumerate(original_pages, start=1):
        page_item = doc.pages.get(rebuilt_number)
        width = page_item.size.width if page_item and page_item.size else None
        height = page_item.size.height if page_item and page_item.size else None
        kind = classes[original].kind
        ocr_page = kind in OCR_KINDS
        lines = ledger.get(rebuilt_number, [])
        elements = [e for e in by_page[rebuilt_number] if e["type"] != "picture"]
        page_image = None
        if any(e["type"] == "table" for e in elements) and ocr_page:
            page_image = render_page(pdf_bytes, rebuilt_number - 1, settings.scale)
        for element in elements:
            if ocr_page:
                element["source"] = "vietocr"
            if element["type"] == "table":
                if ocr_page:
                    try:
                        _fix_table(element, page_image, settings)
                    except Exception:
                        log.exception("Đọc bảng theo ô lỗi ở trang %s", original)
                        warnings.append(f"Trang {original}: đọc bảng theo ô lỗi, giữ kết quả của Docling.")
                continue
            attach_ocr_lines(element, element.get("_pt"), lines)
        info = prepared.get(original, {})
        for stamp in info.get("stamps", []):
            elements.append({"type": "stamp", "label": "stamp", "text": "", "bbox": stamp, "_pt": None,
                             "confidence": None, "source": "opencv", "flags": []})
        finalized = _finalize_elements(elements, original, width, height)
        text = page_text(finalized)
        spans = None
        normalized_lines = []
        if lines and width and height:
            for line in lines:
                box = normalize_box(line["bbox"], width, height)
                normalized_lines.append({**line, "bbox": box})
            if ocr_page:
                spans = [[*line["bbox"], line["text"]] for line in normalized_lines]
        template = match_template(text, templates) if templates else None
        if template:
            source_lines = normalized_lines if ocr_page else [
                {"bbox": e["bbox"], "text": e["text"], "confidence": e.get("confidence"), "flags": e.get("flags", [])}
                for e in finalized if e.get("bbox") and e["type"] != "table"
            ]
            fields = extract_fields(template, source_lines)
            start = len(finalized)
            for offset, field in enumerate(fields):
                field.update(page=original, id=f"p{original}-e{start + offset}")
            finalized.extend(fields)
        confidences = [line["confidence"] for line in lines if line.get("confidence") is not None]
        pages.append({
            "page": original,
            "width": width,
            "height": height,
            "kind": kind,
            "ocrUsed": bool(lines) or ocr_page,
            "ocrConfidence": round(float(np.mean(confidences)), 3) if confidences else None,
            "angle": info.get("angle"),
            "formTemplate": template.get("id") if template else None,
            "text": text,
            "spans": spans,
            "elements": finalized,
        })
    return pages


def _parse_docx(data: bytes, settings: Settings, warnings: list[str]) -> list[dict]:
    result = _convert(data, "document.docx")
    doc = result.document
    raw = document_to_elements(doc, default_source="docx")
    reader = None
    expanded: list[dict] = []
    for element in raw:
        if element["type"] != "picture":
            element["_pt"] = None
            expanded.append(element)
            continue
        # Ảnh nhúng trong Word (ảnh chụp bảng số liệu dán vào): OCR và đặt kết quả đúng chỗ của ảnh.
        item = element.get("_item")
        try:
            image = item.get_image(doc) if item is not None else None
        except Exception:
            image = None
        if image is None or image.width * image.height < settings.min_embedded_image_px:
            continue
        reader = reader or get_line_reader()
        prepared = prepare_image(image.convert("RGB"), photo=False)
        for line in reader.read_region(np.asarray(prepared.image)):
            expanded.append({
                "type": "paragraph", "label": "picture_text", "text": line.text, "_pt": None, "page": None,
                "confidence": line.confidence, "source": line.source, "flags": ["trong_anh", *line.flags],
                **({"readings": [{"text": line.text, "vietocr": line.vietocr, "second": line.second,
                                  "invalidSyllables": line.invalid_syllables}]} if line.flags else {}),
            })
    page_count = assign_pseudo_pages(expanded, settings.pseudo_page_chars)
    pages = []
    for number in range(1, page_count + 1):
        elements = _finalize_elements([e for e in expanded if e["page"] == number], number, None, None)
        pages.append({"page": number, "width": None, "height": None, "kind": "docx", "ocrUsed": any(e["source"] != "docx" for e in elements),
                      "ocrConfidence": None, "text": page_text(elements), "spans": None, "elements": elements})
    return pages


_PARSE_LOCK = threading.Lock()


def inspect(data: bytes, filename: str = "") -> dict[str, Any]:
    kind = detect_kind(data, filename)
    if kind == "pdf":
        classes = classify_pdf(data)
        return {"kind": kind, "pageCount": len(classes), "pages": [c.to_dict() for c in classes]}
    if kind == "image":
        count = getattr(Image.open(io.BytesIO(data)), "n_frames", 1)
        return {"kind": kind, "pageCount": count, "pages": [{"page": n, "kind": "image", "chars": 0, "syllableRatio": None} for n in range(1, count + 1)]}
    return {"kind": kind, "pageCount": None, "pages": []}


def parse(data: bytes, filename: str = "", pages_spec: str | None = None, settings: Settings = SETTINGS) -> dict[str, Any]:
    started = time.monotonic()
    warnings: list[str] = []
    kind = detect_kind(data, filename)
    original_kind = kind
    with _PARSE_LOCK:
        if kind in ("doc", "xls"):
            data = convert_legacy(data, kind)
            kind = "docx" if kind == "doc" else "xlsx"
        if kind == "xlsx":
            pages = parse_xlsx(data)
            for page in pages:
                page["elements"] = _finalize_elements(page["elements"], page["page"], None, None)
                page.update(width=None, height=None, ocrUsed=False, ocrConfidence=None, spans=None,
                            text="\n".join(e["text"] for e in page["elements"]))
            page_count = len(pages)
        elif kind == "docx":
            pages = _parse_docx(data, settings, warnings)
            page_count = len(pages)
        elif kind == "image":
            images = load_images(data)
            page_count = len(images)
            selected = parse_page_range(pages_spec, page_count)
            classes = {n: PageClass(n, "image", 0, None) for n in selected}
            pdf_bytes, prepared = images_to_pdf([images[n - 1] for n in selected], settings)
            # images_to_pdf đánh số lại từ 1: đổi về số trang gốc.
            prepared = {selected[k - 1]: v for k, v in prepared.items()}
            pages = _pdf_like(pdf_bytes, selected, classes, prepared, settings, warnings)
        else:
            classes_list = classify_pdf(data, settings)
            page_count = len(classes_list)
            classes = {c.page: c for c in classes_list}
            selected = parse_page_range(pages_spec, page_count)
            if not selected:
                raise ValueError("Không có trang nào trong khoảng yêu cầu")
            pdf_bytes, prepared = rebuild_pdf(data, selected, classes, settings)
            pages = _pdf_like(pdf_bytes, selected, classes, prepared, settings, warnings)
    elapsed = time.monotonic() - started
    return {
        "parser": {"name": "ocr-service", "version": __version__, "docling": docling_version(),
                   "secondReader": settings.second_reader, "dpi": settings.dpi},
        "kind": original_kind,
        "pageCount": page_count,
        "pages": pages,
        "warnings": warnings,
        "elapsedMs": int(elapsed * 1000),
    }
