"""Gắn bộ đọc B4 (RapidOCR tìm dòng + VietOCR đọc) vào Docling như một bộ OCR riêng.

Docling lo phân tích bố cục, thứ tự đọc, bảng (TableFormer) và ghép dòng thành đoạn; mỗi khi cần đọc chữ trên ảnh
(trang scan, ảnh nhúng trong trang có lớp chữ) Docling gọi bộ OCR này. Ngoài chữ trả cho Docling, mỗi dòng còn có
hai bản đọc, độ tin cậy và cờ; những thông tin đó Docling không giữ nên được ghi vào một sổ riêng theo mã băm tài
liệu, rồi B6 nối lại vào phần tử theo vị trí.
"""

from __future__ import annotations

import logging
import threading
from collections import defaultdict
from collections.abc import Iterable
from pathlib import Path
from typing import ClassVar, Literal, Type

import numpy as np
from docling.datamodel.accelerator_options import AcceleratorOptions
from docling.datamodel.base_models import Page
from docling.datamodel.document import ConversionResult
from docling.datamodel.pipeline_options import OcrOptions
from docling.models.base_ocr_model import BaseOcrModel
from docling_core.types.doc import BoundingBox, CoordOrigin
from docling_core.types.doc.page import BoundingRectangle, TextCell

from .config import SETTINGS
from .line_ocr import get_line_reader
from .preprocess import remove_stamps, to_bgr, to_pil

log = logging.getLogger(__name__)


class VietOcrOptions(OcrOptions):
    """Bộ OCR của IOC: RapidOCR tìm dòng, VietOCR đọc, PP-OCR đọc bản thứ hai để so."""

    kind: ClassVar[Literal["ioc_vietocr"]] = "ioc_vietocr"
    canonicalize_lang: ClassVar[bool] = False
    lang: list[str] = ["vi"]


class OcrLedger:
    """Sổ ghi các dòng OCR theo tài liệu và trang. Toạ độ theo điểm PDF, gốc trên trái."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._lines: dict[str, dict[int, list[dict]]] = defaultdict(lambda: defaultdict(list))

    def add(self, document_hash: str, page_no: int, lines: list[dict]) -> None:
        with self._lock:
            self._lines[document_hash][page_no].extend(lines)

    def pop(self, document_hash: str) -> dict[int, list[dict]]:
        with self._lock:
            return dict(self._lines.pop(document_hash, {}))


LEDGER = OcrLedger()


class VietOcrModel(BaseOcrModel):
    multiple_languages = False

    def __init__(
        self,
        enabled: bool,
        artifacts_path: Path | None,
        options: VietOcrOptions,
        accelerator_options: AcceleratorOptions,
    ):
        super().__init__(enabled=enabled, artifacts_path=artifacts_path, options=options, accelerator_options=accelerator_options)
        self.options: VietOcrOptions
        self.scale = self.options.scale or SETTINGS.scale
        self.reader = get_line_reader() if enabled else None

    def __call__(self, conv_res: ConversionResult, page_batch: Iterable[Page]) -> Iterable[Page]:
        if not self.enabled:
            yield from page_batch
            return
        document_hash = conv_res.input.document_hash
        for page in page_batch:
            assert page._backend is not None
            if not page._backend.is_valid():
                yield page
                continue
            cells: list[TextCell] = []
            ledger_lines: list[dict] = []
            for rect in self.get_ocr_rects(page):
                if rect.area() == 0:
                    continue
                image = page._backend.get_page_image(scale=self.scale, cropbox=rect)
                # Ảnh nhúng trong trang có lớp chữ chưa qua B3: lọc mực đỏ con dấu ngay tại đây.
                cleaned, _ = remove_stamps(to_bgr(image))
                region = np.asarray(to_pil(cleaned).convert("RGB"))
                del image
                for line in self.reader.read_region(region):
                    x0, y0, x1, y1 = line.bbox
                    left = rect.l + x0 / self.scale
                    top = rect.t + y0 / self.scale
                    right = rect.l + x1 / self.scale
                    bottom = rect.t + y1 / self.scale
                    box = BoundingBox(l=left, t=top, r=right, b=bottom, coord_origin=CoordOrigin.TOPLEFT)
                    cells.append(TextCell(
                        index=len(cells),
                        text=line.text,
                        orig=line.text,
                        confidence=line.confidence if line.confidence is not None else 1.0,
                        from_ocr=True,
                        rect=BoundingRectangle.from_bounding_box(box),
                    ))
                    record = line.to_dict()
                    record["bbox"] = [left, top, right, bottom]
                    ledger_lines.append(record)
            if ledger_lines:
                # Docling đánh số trang từ 1, trùng với prov của tài liệu kết quả.
                LEDGER.add(document_hash, page.page_no, ledger_lines)
            self.post_process_cells(cells, page, conv_res)
            yield page

    @classmethod
    def get_options_type(cls) -> Type[OcrOptions]:
        return VietOcrOptions


_REGISTERED = False
_REGISTER_LOCK = threading.Lock()


def register_plugin() -> None:
    """Đăng ký VietOcrModel vào nhà máy OCR của Docling (dùng chung qua lru_cache khi allow_external_plugins=True)."""
    global _REGISTERED
    with _REGISTER_LOCK:
        if _REGISTERED:
            return
        from docling.models.factories import get_ocr_factory

        factory = get_ocr_factory(allow_external_plugins=True)
        if VietOcrOptions not in factory.classes:
            factory.register(VietOcrModel, "ioc_vietocr", __name__)
        _REGISTERED = True
