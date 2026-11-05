import asyncio
import io
import threading

import pytest
from docx import Document
from fastapi.testclient import TestClient

from conftest import DEMO_PDF
from ocr_service import main
from ocr_service.pipeline import ParseCancelled, parse


def _docx() -> bytes:
    doc = Document()
    doc.add_paragraph("Tỷ lệ hộ nghèo giảm còn 1,5%.")
    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def test_parse_stops_before_reading_when_request_already_abandoned():
    with pytest.raises(ParseCancelled, match="trước khi đọc"):
        parse(DEMO_PDF.read_bytes(), "a.pdf", "1", should_stop=lambda: True)


def test_parse_stops_after_docling_when_cancelled_mid_way():
    calls = {"n": 0}

    def stop_on_second_check() -> bool:
        calls["n"] += 1
        return calls["n"] >= 2

    with pytest.raises(ParseCancelled, match="sau Docling"):
        parse(_docx(), "qd.docx", should_stop=stop_on_second_check)
    # Khoá đã được nhả: lần đọc kế tiếp chạy bình thường.
    assert parse(_docx(), "qd.docx")["pageCount"] >= 1


def test_watch_disconnect_sets_flag():
    class FakeRequest:
        def __init__(self):
            self.polls = 0

        async def is_disconnected(self):
            self.polls += 1
            return self.polls >= 2

    flag = threading.Event()
    asyncio.run(main._watch_disconnect(FakeRequest(), flag, interval=0.01))
    assert flag.is_set()


def test_parse_endpoint_returns_499_when_cancelled(monkeypatch):
    def cancelled(*args, **kwargs):
        assert callable(kwargs["should_stop"])
        raise ParseCancelled("trang 3")

    monkeypatch.setattr(main, "parse", cancelled)
    client = TestClient(main.app)
    response = client.post("/parse?pages=1-4", files={"file": ("a.pdf", b"%PDF-1.4 x", "application/pdf")})
    assert response.status_code == 499
