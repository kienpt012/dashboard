"""B4. Đọc vùng chữ: RapidOCR tìm dòng, VietOCR đọc chính, bản đọc thứ hai để so, luật gộp, kiểm tra âm tiết.

Đây là nơi duy nhất trong quy trình xử lý dấu tiếng Việt. Các bước sau không sửa chữ.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field

import numpy as np
from PIL import Image

from .config import SETTINGS, Settings
from .vietnamese import merge_readings, syllable_flags

log = logging.getLogger(__name__)

# VietOCR vgg_transformer đọc ảnh cao 32 px, rộng tới 512 px: dòng dài hơn tỉ lệ 16:1 thì cắt tại khoảng trắng.
MAX_ASPECT = 16.0
# Nới khung dòng lên trên/xuống dưới để không mất dấu (tỉ lệ theo chiều cao dòng).
VERTICAL_PAD = 0.25
HORIZONTAL_PAD = 0.02


@dataclass
class OcrLine:
    """Một dòng chữ đọc được. bbox tính theo điểm ảnh của ảnh đầu vào (x0, y0, x1, y1)."""

    bbox: tuple[float, float, float, float]
    text: str
    confidence: float | None
    source: str
    flags: list[str] = field(default_factory=list)
    vietocr: str | None = None
    second: str | None = None
    invalid_syllables: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        data = {
            "bbox": [round(v, 2) for v in self.bbox],
            "text": self.text,
            "confidence": None if self.confidence is None else round(float(self.confidence), 3),
            "source": self.source,
            "flags": self.flags,
        }
        if self.flags:
            data["readings"] = {"vietocr": self.vietocr, "second": self.second}
            if self.invalid_syllables:
                data["invalidSyllables"] = self.invalid_syllables
        return data


def quad_to_box(quad) -> tuple[float, float, float, float]:
    points = np.asarray(quad, dtype=float).reshape(-1, 2)
    return float(points[:, 0].min()), float(points[:, 1].min()), float(points[:, 0].max()), float(points[:, 1].max())


def sort_reading_order(boxes: list[tuple[float, float, float, float]]) -> list[int]:
    """Thứ tự đọc: trên xuống dưới, cùng hàng thì trái sang phải (hai khung cùng hàng khi lệch tâm dưới nửa chiều cao)."""
    order = sorted(range(len(boxes)), key=lambda i: ((boxes[i][1] + boxes[i][3]) / 2, boxes[i][0]))
    rows: list[list[int]] = []
    for index in order:
        x0, y0, x1, y1 = boxes[index]
        center = (y0 + y1) / 2
        height = max(1.0, y1 - y0)
        if rows:
            last = rows[-1]
            ly0 = min(boxes[i][1] for i in last)
            ly1 = max(boxes[i][3] for i in last)
            if abs(center - (ly0 + ly1) / 2) < 0.5 * max(height, ly1 - ly0):
                last.append(index)
                continue
        rows.append([index])
    result: list[int] = []
    for row in rows:
        result.extend(sorted(row, key=lambda i: boxes[i][0]))
    return result


def crop_line(image: np.ndarray, box: tuple[float, float, float, float], neighbours: list[tuple[float, float, float, float]]) -> np.ndarray:
    """Cắt ảnh một dòng, nới trên dưới để giữ dấu, tô trắng phần lấn sang thân chữ của dòng kề."""
    height, width = image.shape[:2]
    x0, y0, x1, y1 = box
    line_height = max(1.0, y1 - y0)
    pad_y = line_height * VERTICAL_PAD
    pad_x = line_height * HORIZONTAL_PAD * 10
    cx0, cy0 = int(max(0, x0 - pad_x)), int(max(0, y0 - pad_y))
    cx1, cy1 = int(min(width, x1 + pad_x)), int(min(height, y1 + pad_y))
    crop = image[cy0:cy1, cx0:cx1].copy()
    for nx0, ny0, nx1, ny1 in neighbours:
        # Chỉ che phần thân của dòng kề (bỏ 20% mép trên/dưới của nó, nơi dấu của dòng mình có thể chạm vào).
        core_top = ny0 + 0.2 * (ny1 - ny0)
        core_bottom = ny1 - 0.2 * (ny1 - ny0)
        ix0, ix1 = max(cx0, nx0), min(cx1, nx1)
        iy0, iy1 = max(cy0, core_top), min(cy1, core_bottom)
        if ix1 <= ix0 or iy1 <= iy0:
            continue
        crop[int(iy0 - cy0):int(iy1 - cy0), int(ix0 - cx0):int(ix1 - cx0)] = 255
    return crop


def split_wide(crop: np.ndarray) -> list[tuple[int, np.ndarray]]:
    """Cắt dòng quá dài tại cột trắng gần điểm cắt mong muốn. Trả về (độ lệch x, ảnh)."""
    height, width = crop.shape[:2]
    if height == 0 or width / max(1, height) <= MAX_ASPECT:
        return [(0, crop)]
    gray = crop if crop.ndim == 2 else crop.mean(axis=2)
    ink = (gray < 160).sum(axis=0)
    target = int(height * MAX_ASPECT * 0.9)
    pieces: list[tuple[int, np.ndarray]] = []
    start = 0
    while width - start > height * MAX_ASPECT:
        lo = start + int(target * 0.6)
        hi = min(width - 1, start + target)
        window = ink[lo:hi]
        cut = lo + int(np.argmin(window)) if window.size else hi
        pieces.append((start, crop[:, start:cut]))
        start = cut
    pieces.append((start, crop[:, start:]))
    return [(offset, piece) for offset, piece in pieces if piece.shape[1] > 2]


class LineReader:
    """Bộ đọc dòng dùng chung cho vùng chữ (B4), ô bảng (B5) và ảnh nhúng. Mô hình nạp một lần, dùng chung giữa các luồng."""

    def __init__(self, settings: Settings = SETTINGS):
        self.settings = settings
        self._lock = threading.Lock()
        self._det = None
        self._second = None
        self._vietocr = None

    # -- nạp mô hình ---------------------------------------------------------
    def _rapid_params(self) -> dict:
        params: dict = {"Global.log_level": "error"}
        if self.settings.rapidocr_model_dir:
            params["Global.model_root_dir"] = str(self.settings.rapidocr_model_dir)
        return params

    @property
    def det(self):
        if self._det is None:
            from rapidocr import RapidOCR

            self._det = RapidOCR(params=self._rapid_params())
        return self._det

    @property
    def second(self):
        if self.settings.second_reader != "rapidocr":
            return None
        if self._second is None:
            from rapidocr import LangRec, OCRVersion, RapidOCR

            params = self._rapid_params()
            params["Rec.lang_type"] = LangRec(self.settings.second_reader_lang)
            params["Rec.ocr_version"] = OCRVersion(self.settings.second_reader_version)
            self._second = RapidOCR(params=params)
        return self._second

    @property
    def vietocr(self):
        if self._vietocr is None:
            import torch
            from vietocr.tool.config import Cfg
            from vietocr.tool.predictor import Predictor

            if self.settings.threads > 0:
                torch.set_num_threads(self.settings.threads)
            config_path = self.settings.vietocr_config
            if not config_path or not config_path.exists():
                raise RuntimeError(f"Không tìm thấy cấu hình VietOCR tại {config_path}. Chạy scripts/download_models.py khi build image.")
            config = Cfg.load_config_from_file(str(config_path))
            config["weights"] = str(self.settings.vietocr_weights)
            config["device"] = self.settings.vietocr_device
            config["cnn"]["pretrained"] = False
            config["predictor"]["beamsearch"] = False
            self._vietocr = Predictor(config)
        return self._vietocr

    def warm_up(self) -> dict:
        """Nạp sẵn mọi mô hình; trả về trạng thái để /health báo cáo."""
        status = {"det": False, "vietocr": False, "second": None}
        _ = self.det
        status["det"] = True
        _ = self.vietocr
        status["vietocr"] = True
        if self.settings.second_reader == "rapidocr":
            _ = self.second
            status["second"] = f"rapidocr {self.settings.second_reader_version} {self.settings.second_reader_lang}"
        return status

    # -- tìm dòng --------------------------------------------------------------
    def detect_lines(self, image: np.ndarray) -> list[tuple[float, float, float, float]]:
        if image.size == 0 or min(image.shape[:2]) < 8:
            return []
        with self._lock:
            result = self.det(image, use_det=True, use_cls=False, use_rec=False)
        boxes = getattr(result, "boxes", None)
        if boxes is None or len(boxes) == 0:
            return []
        found = [quad_to_box(quad) for quad in boxes]
        return [found[i] for i in sort_reading_order(found)]

    # -- đọc ---------------------------------------------------------------------
    def _read_vietocr(self, crops: list[np.ndarray]) -> list[tuple[str, float | None]]:
        if not crops:
            return []
        images = [Image.fromarray(crop).convert("RGB") for crop in crops]
        results: list[tuple[str, float | None]] = []
        batch = max(1, self.settings.vietocr_batch)
        for start in range(0, len(images), batch):
            chunk = images[start:start + batch]
            with self._lock:
                texts, probs = self.vietocr.predict_batch(chunk, return_prob=True)
            results.extend((text, float(prob) if prob is not None else None) for text, prob in zip(texts, probs))
        return results

    def _read_second(self, crops: list[np.ndarray]) -> list[str | None]:
        reader = self.second
        if reader is None:
            return [None] * len(crops)
        texts: list[str | None] = []
        for crop in crops:
            try:
                with self._lock:
                    result = reader(crop, use_det=False, use_cls=False, use_rec=True)
                txts = getattr(result, "txts", None) or ()
                texts.append(" ".join(txts) if txts else "")
            except Exception:  # bản đọc thứ hai chỉ để so, lỗi thì bỏ qua
                log.exception("Bản đọc thứ hai lỗi")
                texts.append(None)
        return texts

    def read_crops(self, crops: list[np.ndarray]) -> list[dict]:
        """Đọc danh sách ảnh dòng (đã cắt sẵn). Mỗi ảnh có thể bị chia nhỏ nếu quá dài, kết quả ghép lại."""
        pieces: list[np.ndarray] = []
        owners: list[int] = []
        for index, crop in enumerate(crops):
            for _, piece in split_wide(crop):
                pieces.append(piece)
                owners.append(index)
        primary = self._read_vietocr(pieces)
        second = self._read_second(pieces)
        joined: list[dict] = [{"vietocr": [], "second": [], "probs": []} for _ in crops]
        for owner, (text, prob), other in zip(owners, primary, second):
            joined[owner]["vietocr"].append(text)
            joined[owner]["probs"].append(prob)
            joined[owner]["second"].append(other)
        out = []
        for item in joined:
            vietocr_text = " ".join(t for t in item["vietocr"] if t).strip()
            seconds = item["second"]
            second_text = None if any(s is None for s in seconds) else " ".join(s for s in seconds if s).strip()
            merged = merge_readings(vietocr_text, second_text, self.settings.max_disagreement)
            flags = list(merged["flags"])
            syl_flags, bad = syllable_flags(merged["text"])
            for flag in syl_flags:
                if flag not in flags:
                    flags.append(flag)
            probs = [p for p in item["probs"] if p is not None]
            confidence = min(probs) if probs else None
            if "hai_ban_doc_lech" in flags and confidence is not None:
                confidence = min(confidence, 0.6)
            out.append({
                "text": merged["text"],
                "source": merged["source"],
                "flags": flags,
                "confidence": confidence,
                "vietocr": vietocr_text,
                "second": second_text,
                "invalid": bad,
            })
        return out

    def read_region(self, image: np.ndarray) -> list[OcrLine]:
        """Tìm dòng rồi đọc toàn bộ một vùng ảnh (RGB uint8). bbox trả về theo điểm ảnh của vùng."""
        boxes = self.detect_lines(image)
        if not boxes:
            return []
        crops = [crop_line(image, box, [other for other in boxes if other is not box and _vertical_neighbour(box, other)]) for box in boxes]
        readings = self.read_crops(crops)
        lines: list[OcrLine] = []
        for box, reading in zip(boxes, readings):
            if not reading["text"]:
                continue
            lines.append(OcrLine(
                bbox=box,
                text=reading["text"],
                confidence=reading["confidence"],
                source=reading["source"],
                flags=reading["flags"],
                vietocr=reading["vietocr"],
                second=reading["second"],
                invalid_syllables=reading["invalid"],
            ))
        return lines


def _vertical_neighbour(box, other) -> bool:
    x0, y0, x1, y1 = box
    ox0, oy0, ox1, oy1 = other
    horizontal_overlap = min(x1, ox1) - max(x0, ox0) > 0
    gap = max(oy0 - y1, y0 - oy1)
    return horizontal_overlap and gap < (y1 - y0) * 0.6


_READER: LineReader | None = None
_READER_LOCK = threading.Lock()


def get_line_reader() -> LineReader:
    global _READER
    with _READER_LOCK:
        if _READER is None:
            _READER = LineReader()
        return _READER
