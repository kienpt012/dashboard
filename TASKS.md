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
- ☑ Frontend: Kho văn bản + màn hình xác minh trích xuất (build đạt, browser-verified)
- ☑ E2E cả 5 định dạng mẫu: DOCX 8/8, PDF scan OCR 8/8, PDF text, XLSX 6/6 (LLM), PNG 3/3
- ☑ Unit test module mới (19 test — tổng suite 95/95)
- ☑ QA e2e `npm run qa:documents` — 17/17 checks, tự dọn dữ liệu
- ☑ docker-compose + Dockerfile (tesseract vie trong image, OLLAMA_*/EXTRACTION_* env) + README
- ☑ Vertical slice kiểm chứng browser: upload → trích xuất → duyệt → CT-2026-TTCC-001 lên danh mục

## Giai đoạn 6: Đánh giá & benchmark

- ☐ Evaluation dataset có version (`eval/dataset-v1/`) với ground truth từng field
- ☐ Script benchmark: rule-based vs LLM vs hybrid → precision/recall/F1 per field, thời gian, CER OCR
- ☐ docs/experiments/experiment-plan.md, results.md, model-comparison.md (kèm CSV/JSON)

## Giai đoạn 7: RAG & tìm kiếm

- ☐ pgvector (đổi image + migration extension + cột vector cho DocumentChunk) — theo D-005
- ☐ Hybrid search (FTS + vector + rerank nếu cần) + citation
- ☐ Màn hình tra cứu kho tri thức

## Giai đoạn 8: IOC Copilot

- ☑ Copilot v1 (`/admin/copilot` + POST /copilot/messages): LLM định tuyến intent bằng schema ràng buộc
  (fallback từ khóa khi Ollama tắt); 6 tool chỉ đọc (queryMetrics, queryTargets, findMissingReports,
  searchDocuments, listCandidates, help); số liệu 100% từ DB có kiểm soát phạm vi; audit COPILOT_QUERY;
  giao diện chat kèm bảng kết quả + dòng nguồn
- ☐ v2: thao tác ghi có preview/xác nhận (createIndicators, assignIndicator…), hội thoại đa lượt lưu DB,
  generateReport/comparePeriods khi có sổ kỳ báo cáo

## Giai đoạn 9: Cập nhật số liệu từ báo cáo (PROGRESS_UPDATE candidate)

- ☐ Trích xuất giá trị thực hiện từ báo cáo, khớp Target (đã có CandidateKind.PROGRESS_UPDATE trong schema)
- ☐ Duyệt tạo ProgressUpdate PENDING theo luồng review hiện có

## Giai đoạn 10: Giọng nói & mở rộng

- ☐ Speech-to-text tiếng Việt (đánh giá whisper.cpp/faster-whisper local trước)
- ☐ Màn hình quản lý model / theo dõi job / chất lượng dữ liệu
- ☐ CI (build + test), backup/restore hướng dẫn
