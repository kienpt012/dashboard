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

## 2026-07-26 · Phiên 1 (tiếp): Vertical slice hoàn chỉnh + Copilot v1

**Hoàn thành và ĐÃ KIỂM CHỨNG**
- Frontend: trang "Kho văn bản" (upload + polling trạng thái + lọc) và "Xác minh trích xuất"
  (đối chiếu nguồn ↔ đề xuất, highlight quote, sửa/duyệt/từ chối) — build đạt, đã đăng ký đủ 4 chỗ.
- **Vertical slice chạy trọn vòng trên browser**: upload DOCX → pipeline parse+LLM →
  8/8 chỉ tiêu đúng → duyệt trên màn hình xác minh → tạo **CT-2026-TTCC-001** →
  xuất hiện trong Danh mục chỉ tiêu; provenance (văn bản nguồn, candidate, audit AI_CANDIDATE_APPROVED) đầy đủ.
- E2E cả 5 định dạng qua API: DOCX 8/8, **PDF scan qua OCR 8/8**, PDF text, XLSX 6/6
  (LLM đọc bảng — rule-based 0/6), PNG 3/3. Quote-verification hạ confidence 0.4 đúng thiết kế
  khi OCR làm lệch trích dẫn.
- 2 bug tìm thấy nhờ E2E và đã sửa: (1) Ollama alphabetize key schema → field `direction` bị sinh
  trước tên chỉ tiêu, bias LOWER_IS_BETTER → đổi `valueDirection` + prompt v2, xác minh 8/8 đúng chiều;
  (2) OCR thiếu configs dir → dùng `-c tessedit_create_tsv=1`.
- `npm run qa:documents`: **17/17 checks đạt** (chặn VIEWER, chặn tệp giả mạo chữ ký, dedupe SHA-256,
  pipeline, provenance, optimistic lock, duyệt→Target, chống duyệt kép, từ chối, chặn xóa tài liệu có
  chỉ tiêu đã duyệt) — suite tự dọn sạch dữ liệu.
- Unit test: **95/95** (76 cũ + 19 mới cho parsing/rules/sanitize/matching).
- Benchmark baseline rule-based trên eval/dataset-v1 (28 chỉ tiêu, 5 tài liệu): P=0.9 R=0.643 F1=0.75;
  điểm yếu đúng dự đoán: bảng XLSX 0 điểm, QĐ dạng "Điều 1" thiếu recall. LLM/hybrid đang chạy.
- **IOC Copilot v1**: hỏi tiếng Việt → LLM định tuyến intent (schema ràng buộc, fallback từ khóa) →
  tool truy vấn DB có kiểm soát quyền → trả lời kèm nguồn + audit. Đã kiểm chứng 3 intent qua API
  với số liệu thật (11 chỉ tiêu, 71%, phát hiện đúng chỉ tiêu mới chưa có số liệu).
- Docker parity: image API cài tesseract vie, compose có OLLAMA_*/EXTRACTION_*, .env.example, README mới.

## 2026-07-26 · Phiên 1 (kết): Benchmark hoàn tất + 2 fix hạ tầng

- **Benchmark cuối (E-003)**: rule F1=0.75 (20ms, mù bảng), **llm F1=1.0**, **hybrid F1=1.0**
  trên 28 chỉ tiêu / 5 định dạng. Field-level: giá trị/đơn vị/chiều hướng 100%, phòng ban 93–96%,
  tần suất 75% (đã định vị nguyên nhân — model đoán khi văn bản không nêu). Chi tiết + file tái lập:
  docs/experiments/results.md, model-comparison.md.
- **2 lỗi hạ tầng phát hiện & sửa nhờ benchmark (E-004)**: OLLAMA_TIMEOUT_MS 240s→480s;
  OllamaService chuyển streaming để né trần headersTimeout 300s của undici. Suite 95/95 sau fix.
- Copilot kiểm chứng trên browser: bảng 5 chỉ tiêu dưới 70% + dòng nguồn `queryTargets`.

**Việc tiếp theo (phiên sau)**: prompt v3 (tần suất null-when-absent) + đo lại; RAG/pgvector (D-005);
PROGRESS_UPDATE candidate (giai đoạn 9); Copilot v2 (thao tác ghi có preview); speech-to-text; CI;
dataset-v2 văn bản thật + human correction rate.

## 2026-07-27 · Phiên 2: Văn bản thật QĐ 333 + Copilot v2 (ra lệnh → xem trước → xác nhận)

**Hoàn thành và ĐÃ KIỂM CHỨNG**
- **Lần đầu chạy trên văn bản thật** (bộ QĐ 333/QĐ-UBND TPHCM): PL1 4 trang PDF ký số dạng bảng →
  19 ứng viên, trong đó 13 sạch confidence 0.99 (giá trị khoảng ">10"→10, "2-3%"→2, "9.800 USD/người"
  chuẩn; đơn vị chủ trì thật); 6 ứng viên lỗi tên tự bị chấm 0.64–0.7 (calibration đúng vai trò).
  Chi tiết: docs/experiments/real-qd333-results.md.
- Cải tiến robustness từ dữ liệu thật: nén ô gộp XLSX, prompt v3 (khoảng giá trị, tần suất
  null-when-absent, chống nhầm STT), bóc STT khỏi tên, khử trùng lặp mờ giữa chunk (Dice ≥0.8),
  trần EXTRACTION_MAX_LLM_CHUNKS + ExtractionJob.note cho tài liệu trăm trang.
- **Copilot v2**: bảng AgentAction (PROPOSED→EXECUTED/CANCELLED/FAILED/EXPIRED, TTL 15 phút, CAS
  chống double-click, chỉ người ra lệnh được xác nhận); intent BULK_APPROVE_CANDIDATES; khớp văn bản
  từ cách gọi tự nhiên ("phụ lục 1" → VB-2026-0005); guard chống planner bịa bộ lọc; UI preview +
  nút xác nhận/hủy mobile-friendly + bảng kết quả từng mục.
- **E2E browser trên dữ liệu thật**: câu lệnh nguyên văn của người dùng → preview → xác nhận →
  lần 1: 1 chỉ tiêu (lọc "kinh tế"); lần 2 "duyệt hết": **10/10 chỉ tiêu tạo thành công** —
  tổng 11 Target thật (CT-2026-KTHTDT-001..008, CT-2026-VHXH-001..003) có provenance về PL1;
  chuỗi audit COPILOT_QUERY → AGENT_ACTION_PROPOSED → AI_CANDIDATE_APPROVED×10 → AGENT_ACTION_EXECUTED.
- Excel phường (8 sheet, 64 chunk) đang trích xuất nền; PL2 336 trang: chiến lược trần chunk + note
  đã sẵn, cần thêm lọc trang theo đơn vị (KNOWN_ISSUES #14–16 ghi các bài học quy mô).
