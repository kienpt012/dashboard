"""HTTP API của ocr-service. Chỉ mở trong mạng nội bộ Docker, không gọi ra Internet khi chạy.

- GET  /health            trạng thái và phiên bản các bộ đọc
- POST /inspect           B1–B2: loại tệp, số trang, phân loại từng trang (nhanh, không OCR)
- POST /parse?pages=1-8   B2–B6: tài liệu có cấu trúc của các trang yêu cầu (mặc định mọi trang)
"""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool

from . import __version__
from .config import SETTINGS
from .line_ocr import get_line_reader
from .pipeline import docling_version, get_converter, inspect, parse

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
log = logging.getLogger("ocr_service")

app = FastAPI(title="IOC ocr-service", version=__version__)
_STATE: dict = {"ready": False, "error": None, "engines": {}}


@app.on_event("startup")
def warm_up() -> None:
    if os.environ.get("OCR_SKIP_WARMUP") == "1":
        return
    try:
        _STATE["engines"] = get_line_reader().warm_up()
        get_converter()
        _STATE["ready"] = True
    except Exception as error:  # dịch vụ vẫn chạy để /health báo lỗi rõ ràng
        log.exception("Không nạp được mô hình")
        _STATE["error"] = str(error)[:300]


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok" if _STATE["ready"] else "degraded",
        "version": __version__,
        "docling": docling_version(),
        "engines": _STATE["engines"],
        "error": _STATE["error"],
        "dpi": SETTINGS.dpi,
    }


async def _read_upload(file: UploadFile) -> bytes:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Tệp rỗng")
    if len(data) > SETTINGS.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Tệp quá lớn")
    return data


@app.post("/inspect")
async def inspect_endpoint(file: UploadFile = File(...), filename: str = Form("")) -> dict:
    data = await _read_upload(file)
    try:
        return await run_in_threadpool(inspect, data, filename or file.filename or "")
    except ValueError as error:
        raise HTTPException(status_code=415, detail=str(error)) from error


@app.post("/parse")
async def parse_endpoint(file: UploadFile = File(...), filename: str = Form(""), pages: str | None = Query(None)) -> dict:
    if not _STATE["ready"] and os.environ.get("OCR_SKIP_WARMUP") != "1":
        raise HTTPException(status_code=503, detail=f"Mô hình chưa sẵn sàng: {_STATE['error'] or 'đang nạp'}")
    data = await _read_upload(file)
    try:
        return await run_in_threadpool(parse, data, filename or file.filename or "", pages)
    except ValueError as error:
        raise HTTPException(status_code=415, detail=str(error)) from error
