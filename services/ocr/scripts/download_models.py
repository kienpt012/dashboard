"""Tải sẵn mọi mô hình khi build image, để khi chạy ocr-service không cần ra Internet.

- Docling: mô hình bố cục và TableFormer → $DOCLING_ARTIFACTS_PATH (mặc định /models/docling)
- VietOCR vgg_transformer: cấu hình + trọng số → /models/vietocr
- RapidOCR: bộ tìm dòng có sẵn trong gói; bộ đọc thứ hai PP-OCRv5 latin → $RAPIDOCR_MODEL_DIR
"""

from __future__ import annotations

import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def docling_models(target: Path) -> None:
    from docling.utils.model_downloader import download_models

    target.mkdir(parents=True, exist_ok=True)
    download_models(
        output_dir=target,
        progress=False,
        with_layout=True,
        with_tableformer=True,
        with_code_formula=False,
        with_picture_classifier=False,
        with_rapidocr=False,
        with_easyocr=False,
    )
    print(f"Docling: đã tải mô hình bố cục và TableFormer vào {target}")


def vietocr_model(folder: Path) -> None:
    from vietocr.tool.config import Cfg

    folder.mkdir(parents=True, exist_ok=True)
    config = Cfg.load_config_from_name("vgg_transformer")
    weights_url = os.environ.get("VIETOCR_WEIGHTS_URL") or config["weights"]
    weights_path = folder / "vgg_transformer.pth"
    if not weights_path.exists():
        print(f"VietOCR: tải trọng số {weights_url}")
        urllib.request.urlretrieve(weights_url, weights_path)
    config["weights"] = str(weights_path)
    config["device"] = "cpu"
    config["cnn"]["pretrained"] = False
    config["predictor"]["beamsearch"] = False
    config.save(str(folder / "config.yml"))
    print(f"VietOCR: đã ghi cấu hình và trọng số vào {folder}")


def rapidocr_models(folder: Path) -> None:
    import numpy as np
    from rapidocr import LangRec, OCRVersion, RapidOCR

    folder.mkdir(parents=True, exist_ok=True)
    base = {"Global.log_level": "error", "Global.model_root_dir": str(folder)}
    RapidOCR(params=base)(np.full((64, 256, 3), 255, np.uint8), use_det=True, use_cls=False, use_rec=False)
    second = RapidOCR(params={
        **base,
        "Rec.lang_type": LangRec(os.environ.get("OCR_SECOND_READER_LANG", "latin")),
        "Rec.ocr_version": OCRVersion(os.environ.get("OCR_SECOND_READER_VERSION", "PP-OCRv5")),
    })
    second(np.full((48, 320, 3), 255, np.uint8), use_det=False, use_cls=False, use_rec=True)
    print(f"RapidOCR: đã tải bộ đọc thứ hai vào {folder}")


if __name__ == "__main__":
    docling_models(Path(os.environ.get("DOCLING_ARTIFACTS_PATH", "/models/docling")))
    vietocr_model(Path(os.environ.get("VIETOCR_CONFIG", "/models/vietocr/config.yml")).parent)
    rapidocr_models(Path(os.environ.get("RAPIDOCR_MODEL_DIR", "/models/rapidocr")))
