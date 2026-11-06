"""Cấu hình ocr-service, đọc từ biến môi trường. Mọi ngưỡng ở đây là giá trị khởi điểm, cần đo trên dữ liệu thật."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _path(name: str, default: str | None) -> Path | None:
    value = os.environ.get(name, default or "")
    return Path(value) if value else None


@dataclass(frozen=True)
class Settings:
    # B2: trang có từ 24 ký tự lớp chữ trở lên và tỉ lệ âm tiết hợp lệ đủ cao thì đọc thẳng.
    min_text_chars: int = field(default_factory=lambda: _int("OCR_MIN_TEXT_CHARS", 24))
    min_syllable_ratio: float = field(default_factory=lambda: _float("OCR_MIN_SYLLABLE_RATIO", 0.6))
    # B3: render trang scan ở 216 DPI (thang 3 lần 72 DPI).
    dpi: int = field(default_factory=lambda: _int("OCR_DPI", 216))
    # Ảnh nhúng nhỏ hơn ngưỡng này (logo, chữ ký) bị bỏ qua. Đơn vị: tỉ lệ diện tích trang hoặc số điểm ảnh.
    min_embedded_image_px: int = field(default_factory=lambda: _int("OCR_MIN_EMBEDDED_IMAGE_PX", 40_000))
    # B4: luật gộp hai bản đọc.
    max_disagreement: float = field(default_factory=lambda: _float("OCR_MAX_DISAGREEMENT", 0.10))
    second_reader: str = field(default_factory=lambda: os.environ.get("OCR_SECOND_READER", "rapidocr"))
    second_reader_lang: str = field(default_factory=lambda: os.environ.get("OCR_SECOND_READER_LANG", "latin"))
    second_reader_version: str = field(default_factory=lambda: os.environ.get("OCR_SECOND_READER_VERSION", "PP-OCRv5"))
    # PP-OCRv5 latin chỉ có bản mobile; rapidocr 3.10 mặc định "small" thì báo cấu hình không hợp lệ.
    second_reader_model_type: str = field(default_factory=lambda: os.environ.get("OCR_SECOND_READER_MODEL_TYPE", "mobile"))
    rapidocr_model_dir: Path | None = field(default_factory=lambda: _path("RAPIDOCR_MODEL_DIR", None))
    vietocr_config: Path | None = field(default_factory=lambda: _path("VIETOCR_CONFIG", "/models/vietocr/config.yml"))
    vietocr_weights: Path | None = field(default_factory=lambda: _path("VIETOCR_WEIGHTS", "/models/vietocr/vgg_transformer.pth"))
    vietocr_device: str = field(default_factory=lambda: os.environ.get("VIETOCR_DEVICE", "cpu"))
    vietocr_batch: int = field(default_factory=lambda: _int("VIETOCR_BATCH", 32))
    # Ô có lượng mực vượt ngưỡng này (và không đọc được chữ) coi là ô đánh dấu.
    checkbox_ink_ratio: float = field(default_factory=lambda: _float("OCR_CHECKBOX_INK_RATIO", 0.06))
    docling_artifacts_path: Path | None = field(default_factory=lambda: _path("DOCLING_ARTIFACTS_PATH", None))
    table_mode: str = field(default_factory=lambda: os.environ.get("OCR_TABLE_MODE", "accurate"))
    forms_dir: Path = field(
        default_factory=lambda: _path("OCR_FORMS_DIR", None) or Path(__file__).resolve().parent / "forms"
    )
    max_upload_mb: int = field(default_factory=lambda: _int("OCR_MAX_UPLOAD_MB", 50))
    threads: int = field(default_factory=lambda: _int("OCR_THREADS", 0))
    # Docx không có trang: cắt trang giả theo số ký tự như bộ đọc cũ của API.
    pseudo_page_chars: int = field(default_factory=lambda: _int("OCR_PSEUDO_PAGE_CHARS", 3200))

    @property
    def scale(self) -> float:
        return max(1.0, self.dpi / 72.0)


SETTINGS = Settings()
