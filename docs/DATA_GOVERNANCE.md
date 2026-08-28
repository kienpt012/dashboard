# Quản trị dữ liệu — lớp AI

Quy tắc quản trị cho dữ liệu do AI đề xuất và tài liệu nguồn. Cấu trúc bảng chi tiết: [DATA_DICTIONARY.md](DATA_DICTIONARY.md). Threat model: [SECURITY.md](SECURITY.md).

## 1. Yêu cầu provenance (bắt buộc, không ngoại lệ)

Mọi mẩu dữ liệu do AI tạo phải mang đủ:

| Thành phần | Nơi lưu |
|---|---|
| Tài liệu nguồn | `IndicatorCandidate.documentId` → `SourceDocument` (mã VB-YYYY-NNNN) |
| Vị trí trong tài liệu | `chunkId` + `pageNumber` (chunk giữ `pageFrom`/`pageTo`) |
| Câu trích nguyên văn | `sourceQuote` — được kiểm chứng string-match với chunk; không khớp ⇒ cảnh báo + hạ trần confidence 0.4 |
| Model + phiên bản prompt | `model`, `promptVersion` (trên cả ExtractionJob lẫn từng ứng viên) |
| Độ tin cậy | `confidence` tổng + `fieldConfidence` từng trường |
| Người xác minh | `reviewedById`, `reviewedAt`, `humanEdited`, `editedFields` |

Khi duyệt, provenance nối tiếp sang dữ liệu chính thức: `Target.legalBasis`, `Target.sourceDocumentId`, quan hệ `sourceCandidate`, và metadata audit (`fromCandidate`, `documentCode`, `extractionMethod`, `aiModel`, `confidence`).

## 2. Quy tắc human-in-the-loop

- AI **chỉ** tạo `IndicatorCandidate` trạng thái PROPOSED. Không có đường ghi thẳng vào Target/ProgressUpdate.
- Duyệt (tạo Target) là thẩm quyền ADMIN; chỉnh sửa/từ chối là ADMIN/MANAGER. Duyệt bắt buộc đầy đủ trường (tên, đơn vị, giá trị, năm, phòng ban, tần suất, hạn) — thiếu thì phải chỉnh sửa trước, hệ thống liệt kê rõ trường thiếu.
- Không auto-approve dưới bất kỳ ngưỡng confidence nào — confidence chỉ để ưu tiên sự chú ý của người duyệt.

## 3. Idempotency khi trích xuất lại

- Trích xuất lại (re-extract) chỉ xóa các ứng viên **PROPOSED và chưa ai đụng tới** (`humanEdited = false`) rồi tạo lại từ kết quả mới.
- Ứng viên đã duyệt/từ chối/chỉnh sửa **không bao giờ bị ghi đè** — công sức xác minh của con người là dữ liệu được bảo vệ.
- Chỉ một job PENDING/PROCESSING tồn tại cho mỗi tài liệu tại một thời điểm (yêu cầu trích xuất lại khi đang xử lý bị từ chối 409).

## 4. Audit log

Mọi thao tác trên vòng đời tài liệu/ứng viên ghi `AuditLog` **trong cùng transaction** với mutation:

- `DOCUMENT_UPLOADED`, `DOCUMENT_DELETED`, `DOCUMENT_EXTRACTION_REQUESTED` (metadata: code, mimeType, size).
- `AI_CANDIDATE_EDITED` (metadata: changedFields, candidateName), `AI_CANDIDATE_APPROVED` (metadata: targetCode, documentCode, extractionMethod, confidence, humanEdited), `AI_CANDIDATE_REJECTED` (metadata: reason).
- `TARGET_CREATED` với metadata `fromCandidate` khi Target sinh từ ứng viên — phân biệt được chỉ tiêu gốc AI với chỉ tiêu tạo tay.

Key metadata mới phải được thêm vào allowlist `SAFE_METADATA_KEYS` (`audit-logs.ts`), nếu không sẽ bị ẩn khỏi màn hình nhật ký — cơ chế chống lộ dữ liệu nhạy cảm qua metadata.

## 5. Lưu giữ và xóa (retention)

- Tài liệu nguồn phải được **giữ chừng nào còn chỉ tiêu đã duyệt tham chiếu tới**: API xóa tài liệu chặn (409) khi tồn tại ứng viên APPROVED thuộc tài liệu đó — không được phá chuỗi truy vết của dữ liệu chính thức.
- Xóa tài liệu (khi được phép) cascade trang/đoạn/job/ứng viên chưa duyệt; Target đã tạo giữ nguyên, `sourceDocumentId` SetNull.
- Xóa tài liệu là thẩm quyền ADMIN và luôn ghi audit.

## 6. Dữ liệu cá nhân (PII) và quyền truy cập

- Văn bản hành chính **có thể chứa dữ liệu cá nhân** (tên, địa chỉ, số liệu hộ dân…): toàn bộ kho văn bản, trang bóc tách, ứng viên chỉ phục vụ **nội bộ có đăng nhập** — không có endpoint công khai nào trả nội dung tài liệu hay ứng viên.
- Trang công khai chỉ hiển thị Target đã được công bố theo cơ chế snapshot-at-publish sẵn có, không kèm nội dung văn bản nguồn.
- Tải tệp gốc yêu cầu đăng nhập; response đặt `Cache-Control: private, no-store`.

## 7. Chính sách dữ liệu mẫu synthetic

- Bộ `samples/` (và evaluation dataset kế hoạch) là văn bản **synthetic** sinh bằng `scripts/generate-sample-documents.py`: mô phỏng văn phong hành chính, không chứa dữ liệu cá nhân hay nội dung văn bản thật.
- Không commit dataset nhạy cảm hoặc văn bản thật vào repo. Văn bản thật chỉ được dùng khi có quyền phù hợp và phải lưu ngoài Git.

## 8. Không log nội dung tài liệu

- Log worker/Ollama chỉ ghi ID, số trang/đoạn, tên lỗi — **không bao giờ** ghi nội dung văn bản, câu trích hay đầu ra LLM vào log.
- `lastError` trên job bị cắt ngắn (300 ký tự) và chỉ chứa thông điệp lỗi kỹ thuật.
