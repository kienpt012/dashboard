"""Biểu mẫu cố định (giấy tiếp nhận, phiếu đánh giá…): áp toạ độ ô đã lưu của mẫu để lấy giá trị theo tên trường.

Mỗi mẫu là một tệp JSON trong thư mục OCR_FORMS_DIR (mặc định ocr_service/forms):

{
  "id": "phieu-danh-gia-muc-do-hai-long",
  "name": "Phiếu đánh giá mức độ hài lòng",
  "match": ["PHIẾU ĐÁNH GIÁ", "MỨC ĐỘ HÀI LÒNG"],      // mọi cụm phải có trên trang (không phân biệt dấu, hoa thường)
  "fields": [
    {"name": "so_ho_so", "label": "Số hồ sơ", "box": [0.55, 0.12, 0.95, 0.16]},
    {"name": "diem", "label": "Tổng điểm", "box": [0.70, 0.80, 0.95, 0.84],
     "indicator": {"name": "Điểm hài lòng của người dân", "unit": "điểm"}}
  ]
}

box là khung ô chuẩn hóa 0..1, gốc trên trái. Trường có "indicator" được API biến thành bản ghi chỉ tiêu bằng luật
(phương pháp FORM_TEMPLATE), không gọi Qwen.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

from .config import SETTINGS
from .vietnamese import strip_diacritics

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def load_templates(directory: str | None = None) -> list[dict]:
    folder = Path(directory) if directory else SETTINGS.forms_dir
    templates = []
    if not folder.exists():
        return templates
    for path in sorted(folder.glob("*.json")):
        try:
            template = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            log.warning("Bỏ qua mẫu biểu mẫu lỗi: %s", path.name)
            continue
        if template.get("match") and template.get("fields"):
            templates.append(template)
    return templates


def _key(text: str) -> str:
    return " ".join(strip_diacritics(text).lower().split())


def match_template(page_text: str, templates: list[dict]) -> dict | None:
    haystack = _key(page_text)
    for template in templates:
        if all(_key(phrase) in haystack for phrase in template["match"]):
            return template
    return None


def _center_inside(box: list[float], area: list[float]) -> bool:
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    return area[0] <= cx <= area[2] and area[1] <= cy <= area[3]


def extract_fields(template: dict, lines: list[dict]) -> list[dict]:
    """lines: dòng chữ của trang, mỗi dòng có bbox chuẩn hóa và text. Trả về phần tử form_field."""
    elements = []
    for field in template["fields"]:
        area = field.get("box")
        if not area:
            continue
        inside = [line for line in lines if line.get("bbox") and _center_inside(line["bbox"], area)]
        value = " ".join(line["text"] for line in inside).strip()
        confidences = [line["confidence"] for line in inside if line.get("confidence") is not None]
        flags: list[str] = []
        for line in inside:
            for flag in line.get("flags", []):
                if flag not in flags:
                    flags.append(flag)
        elements.append({
            "type": "form_field",
            "label": "form_field",
            "text": f"{field.get('label', field['name'])}: {value}",
            "bbox": [round(v, 4) for v in area],
            "confidence": min(confidences) if confidences else None,
            "source": "template",
            "flags": flags,
            "field": {
                "template": template.get("id"),
                "name": field["name"],
                "label": field.get("label", field["name"]),
                "value": value,
                "indicator": field.get("indicator"),
            },
        })
    return elements
