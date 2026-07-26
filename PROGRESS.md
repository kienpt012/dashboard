# PROGRESS.md — Nhật ký tiến độ

## 2026-07-26 · Phiên 1: Khảo sát, hạ tầng AI, vertical slice backend

**Hoàn thành**
- Khảo sát hiện trạng (6 agent song song) → `docs/research/01-current-system-assessment.md`.
  Baseline xác nhận: build ĐẠT, 76/76 unit test ĐẠT, hệ thống Docker 3 container healthy.
- Hạ tầng AI local: Ollama 0.32.4 (model tại `F:\ollama-models`, flash-attention + KV q8_0),
  Qwen3-4B-Instruct-2507 Q4 (2.5GB), bge-m3 (1.2GB), Tesseract 5.4 + vie best (`F:\tessdata`).
  Smoke test trích xuất tiếng Việt: 4/4 chỉ tiêu đúng, quote nguyên văn, ~10 tok/s (chi tiết EXPERIMENTS.md).
- Migration `document_ai_foundation`: 5 bảng mới + provenance cho Target. Dev DB riêng `ioc_laithieu_dev`.
- Backend vertical slice: documents.ts (upload/list/text/download/re-extract/delete),
  extraction-worker.ts (claim outbox, parse→extract chain), document-processing.ts (PDF/DOCX/XLSX/ảnh + OCR),
  extraction-rules.ts (baseline luật), extraction-llm.ts (Qwen structured + kiểm chứng quote),
  candidates.ts (sửa/duyệt/từ chối → tạo Target qua target-create.ts dùng chung), matching.ts.
- Bộ tài liệu mẫu synthetic: `samples/` (DOCX, XLSX, PDF text, PDF scan, PNG) + script sinh.
- Type-check ĐẠT, 76/76 test cũ vẫn ĐẠT sau refactor targets.ts.

**Bằng chứng kiểm thử**: xem EXPERIMENTS.md (E-001, E-002) và phần tiếp theo của file này.

**Đang chạy**: frontend agent (trang Kho văn bản + Xác minh trích xuất); e2e upload DOCX qua API.

**Việc tiếp theo**: hoàn tất frontend, unit test module mới, browser E2E, benchmark, cập nhật compose/README.
