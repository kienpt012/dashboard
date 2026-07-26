# TASKS.md — Backlog theo giai đoạn

Trạng thái: ☐ chưa làm · ◐ đang làm · ☑ xong. Cập nhật mỗi khi kết thúc nhóm công việc.

## Giai đoạn 0–1: Khảo sát & hạ tầng (xong 26/07/2026)

- ☑ Khảo sát toàn bộ repo (6 báo cáo phân hệ), chạy build/test/browser → `docs/research/01-current-system-assessment.md`
- ☑ Kiểm tra cấu hình máy; cài Ollama + Qwen3-4B + bge-m3 (F:\ollama-models); Tesseract 5 + vie (F:\tessdata)
- ☑ Smoke-test trích xuất tiếng Việt structured output + đo tốc độ (~10 tok/s)
- ☑ Dev DB riêng `ioc_laithieu_dev` + seed demo

## Giai đoạn 2–5: Vertical slice (upload → trích xuất → duyệt → dashboard)

- ☑ Schema: SourceDocument/DocumentPage/DocumentChunk/ExtractionJob/IndicatorCandidate + provenance Target (migration `20260726125955_document_ai_foundation`)
- ☑ Upload API + magic-byte detection + sha256 dedupe + mã VB-YYYY-NNNN
- ☑ Worker parse (PDF text/OCR, DOCX, XLSX, ảnh) + chunking + job chain
- ☑ Trích xuất hybrid rule + LLM, confidence per-field, provenance, dedupe, khớp phòng ban, nghi trùng chỉ tiêu
- ☑ API candidates: sửa/duyệt (tạo Target)/từ chối + audit
- ◐ Frontend: Kho văn bản + màn hình xác minh trích xuất (đang chạy agent)
- ◐ E2E bằng tài liệu mẫu (`samples/`, sinh bởi `scripts/generate-sample-documents.py`)
- ☐ Unit test cho: detectDocumentKind, chunkParsedPages, extraction-rules, sanitizeLlmIndicators, matching, candidates approve/reject
- ☐ QA e2e script `scripts/qa-documents.mjs` theo mẫu qa-*.mjs
- ☐ Cập nhật docker-compose (OLLAMA_BASE_URL, TESSERACT trong image api), Dockerfile cài tesseract-ocr-data-vie
- ☐ Kiểm tra vertical slice bằng browser + cập nhật README

## Giai đoạn 6: Đánh giá & benchmark

- ☐ Evaluation dataset có version (`eval/dataset-v1/`) với ground truth từng field
- ☐ Script benchmark: rule-based vs LLM vs hybrid → precision/recall/F1 per field, thời gian, CER OCR
- ☐ docs/experiments/experiment-plan.md, results.md, model-comparison.md (kèm CSV/JSON)

## Giai đoạn 7: RAG & tìm kiếm

- ☐ pgvector (đổi image + migration extension + cột vector cho DocumentChunk) — theo D-005
- ☐ Hybrid search (FTS + vector + rerank nếu cần) + citation
- ☐ Màn hình tra cứu kho tri thức

## Giai đoạn 8: IOC Copilot

- ☐ Tool registry (searchDocuments, queryMetrics, createIndicators, updateIndicator, generateReport, comparePeriods…)
- ☐ Agent loop với Qwen3 tool-calling; read-only trực tiếp, write cần preview + xác nhận; AgentAction/audit
- ☐ Giao diện chat tiếng Việt + hiển thị nguồn

## Giai đoạn 9: Cập nhật số liệu từ báo cáo (PROGRESS_UPDATE candidate)

- ☐ Trích xuất giá trị thực hiện từ báo cáo, khớp Target (đã có CandidateKind.PROGRESS_UPDATE trong schema)
- ☐ Duyệt tạo ProgressUpdate PENDING theo luồng review hiện có

## Giai đoạn 10: Giọng nói & mở rộng

- ☐ Speech-to-text tiếng Việt (đánh giá whisper.cpp/faster-whisper local trước)
- ☐ Màn hình quản lý model / theo dõi job / chất lượng dữ liệu
- ☐ CI (build + test), backup/restore hướng dẫn
