# Chiến lược kiểm thử

Kế thừa hạ tầng test hiện có của repo: `node:test` chạy qua tsx, mock Prisma bằng object literal (không DB thật) cho unit; bộ QA e2e `scripts/qa-*.mjs` chạy tay cần API + Postgres; kiểm tra trình duyệt thủ công. Baseline: **76/76 unit test đạt** (xác nhận 26/07/2026, `PROGRESS.md`).

## 1. Quy tắc hồi quy (bất biến)

**76 unit test hiện có phải luôn xanh** sau mọi thay đổi của lớp AI. Không sửa test để che lỗi implementation (quy tắc cấm trong `CLAUDE.md`). Refactor `targets.ts` khi trích `target-create.ts` đã được xác nhận giữ nguyên 76/76.

## 2. Unit test cho module mới (kế hoạch — TASKS.md giai đoạn 2–5, ☐ chưa làm)

Theo đúng mẫu mock-Prisma-object-literal hiện hành, các tệp test dự kiến trong `apps/api/test/`:

| Tệp test dự kiến | Phạm vi |
|---|---|
| `document-processing.test.ts` | `detectDocumentKind` (magic-byte + soi entry ZIP DOCX/XLSX), `chunkParsedPages` (kích thước ~1800, overlap, giữ số trang, cắt đoạn dài), `parseTesseractTsv`, `normalizeExtractedText` |
| `extraction-rules.test.ts` | `parseVietnameseNumber` ("3.450" → 3450, "95,5" → 95.5), `detectFrequency`, nhận diện trigger/direction (kể cả ngoại lệ "giảm nghèo"), `chunkLikelyHasIndicators` |
| `extraction-llm.test.ts` | `sanitizeLlmIndicators`: parse lỗi, ép enum, chặn biên, cắt độ dài, kiểm chứng quote hạ trần confidence 0.4, fieldConfidence mặc định |
| `matching.test.ts` | `normalizeVietnamese`, `diceSimilarity`, `matchDepartmentByName` (ngưỡng 0.62, trả null khi không chắc) |
| `candidates.test.ts` | approve: kiểm tra trường thiếu, version guard, tạo Target qua hàm dùng chung, audit; reject: bắt buộc lý do; edit: gộp `editedFields`, đặt `humanEdited` |
| `documents.test.ts` | Upload validation: từ chối tệp sai định dạng/quá 25MB, dedupe sha256 trả 409, `nextDocumentCode`, `sanitizeDocumentFileName` |

Ngoài ra `extraction-worker` có hàm thuần test được: `extractionRetryDelayMs` (backoff mũ, trần 30 phút).

## 3. Integration / QA e2e (kế hoạch)

- `scripts/qa-documents.mjs` theo đúng mẫu qa-*.mjs hiện hành (`createQaActors`, tự tạo và tự dọn dữ liệu): upload tài liệu thật qua API → chờ pipeline parse+extract → kiểm tra ứng viên → sửa/duyệt/từ chối → xác nhận Target + audit → cleanup bằng Prisma (kể cả job, page, chunk, candidate, target, audit log QA).
- Chạy được ở hai chế độ: có Ollama (hybrid) và `DISABLE_EXTRACTION_WORKER`/Ollama tắt (kiểm chứng graceful degradation rule-only).

## 4. E2E trình duyệt

Theo quy trình hiện hành của repo: kiểm tra thủ công qua browser trên luồng Kho văn bản → Xác minh trích xuất → Danh mục chỉ tiêu/Dashboard, ở cả desktop và kích thước di động (đang là hạng mục ◐/☐ trong `TASKS.md`). Kịch bản chuẩn: [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

## 5. Benchmark harness (kế hoạch — giai đoạn 6)

- Evaluation dataset có version `eval/dataset-v1/` (ground-truth JSON từng tài liệu) + script benchmark chạy rule-based / LLM / hybrid trên cùng dataset, xuất precision/recall/F1 per field, thời gian, CER OCR ra CSV/JSON trong `docs/experiments/`.
- Benchmark tách khỏi unit test (cần Ollama + thời gian chạy dài), không chạy trong `npm test`.

## 6. Lệnh

```bash
npm test              # unit (nhanh, không DB)
npm run qa:access|qa:feedback|qa:import   # e2e hiện có (cần API + Postgres)
# kế hoạch: npm run qa:documents
```
