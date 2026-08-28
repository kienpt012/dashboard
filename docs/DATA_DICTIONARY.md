# Từ điển dữ liệu — lớp AI

Nguồn chuẩn: `apps/api/prisma/schema.prisma` (migration `20260726125955_document_ai_foundation`). Tài liệu này mô tả 5 bảng mới, các cột provenance bổ sung cho `Target`, và bảng ánh xạ từ mô hình khái niệm của đề cương nghiên cứu về hiện thực thực tế.

## 1. SourceDocument — Kho văn bản nguồn

Mọi dữ liệu AI đề xuất đều phải truy vết được về một bản ghi ở bảng này.

| Cột | Ý nghĩa |
|---|---|
| `id` | Khóa chính (cuid). |
| `code` | Mã tài liệu duy nhất `VB-{năm}-{NNNN}`, hệ thống tự cấp trong transaction Serializable. |
| `title` | Tiêu đề tài liệu (mặc định lấy từ tên tệp nếu không nhập). |
| `originalName` | Tên tệp gốc đã làm sạch (bỏ ký tự điều khiển/đường dẫn). |
| `mimeType` | MIME **do hệ thống phát hiện** bằng magic-byte, không phải MIME client khai. |
| `size` | Kích thước tệp (byte), tối đa 25MB. |
| `sha256` | Băm nội dung, unique — chặn tải trùng, báo mã tài liệu đã tồn tại. |
| `data` | Nội dung tệp (Bytes trong Postgres — quyết định D-008); không bao giờ select trong query danh sách. |
| `docType` | Loại văn bản: KE_HOACH / QUYET_DINH / CONG_VAN / BAO_CAO / NGHI_QUYET / PHU_LUC / KHAC. |
| `docNumber` | Số hiệu văn bản (ví dụ "15/KH-UBND") — dùng làm căn cứ pháp lý mặc định cho ứng viên. |
| `issuedBy` | Cơ quan ban hành. |
| `issuedDate` | Ngày ban hành (nhập theo múi giờ VN). |
| `description` | Mô tả tự do. |
| `status` | Vòng đời xử lý: UPLOADED → PROCESSING → PROCESSED / FAILED. |
| `processingError` | Thông báo lỗi tiếng Việt khi xử lý thất bại hẳn. |
| `pageCount` | Số trang sau khi parse. |
| `hasTextLayer` | PDF có text layer đọc được hay không. |
| `ocrUsed` | Có trang nào phải OCR hay không. |
| `year` | Năm kế hoạch (suy từ ngày ban hành nếu không nhập) — ngữ cảnh mặc định cho trích xuất. |
| `departmentId` | Phòng ban gắn (tùy chọn, SetNull khi phòng ban bị xóa). |
| `uploadedById` | Người tải lên (FK User). |
| `version` | Optimistic locking theo quy ước chung của repo. |
| `createdAt` / `updatedAt` | Dấu thời gian. |

Quan hệ: `pages`, `chunks`, `jobs`, `candidates` (Cascade khi xóa tài liệu); `sourcedTargets` (Target trỏ về — SetNull). Xóa tài liệu bị **chặn** khi còn ứng viên APPROVED (bảo toàn nguồn gốc — xem [DATA_GOVERNANCE.md](DATA_GOVERNANCE.md)).

## 2. DocumentPage — Trang văn bản đã bóc tách

| Cột | Ý nghĩa |
|---|---|
| `id` | Khóa chính. |
| `documentId` | Tài liệu cha (Cascade). |
| `pageNumber` | Số trang (unique cùng `documentId`; với DOCX là "trang giả" ~3200 ký tự, XLSX mỗi sheet một trang). |
| `text` | Văn bản trang đã chuẩn hóa (NFC, gộp khoảng trắng). |
| `ocrUsed` | Trang này được OCR (true) hay đọc từ text layer (false). |
| `ocrConfidence` | Độ tin cậy OCR trung bình theo từ (0–1, từ TSV của Tesseract); null nếu không OCR. |

## 3. DocumentChunk — Đoạn văn bản cho trích xuất/RAG

| Cột | Ý nghĩa |
|---|---|
| `id` | Khóa chính. |
| `documentId` | Tài liệu cha (Cascade). |
| `chunkIndex` | Thứ tự đoạn (unique cùng `documentId`). |
| `pageFrom` / `pageTo` | Khoảng trang nguồn — giữ dấu vết trang để mọi kết quả truy ngược được về đúng trang. |
| `text` | Nội dung đoạn (~1800 ký tự, cắt theo ranh giới đoạn văn, chồng lấn 200 ký tự). |
| `charCount` | Số ký tự. |

Ghi chú: cột vector embedding cho RAG **chưa có** — sẽ thêm vào bảng này ở giai đoạn 7 (D-005).

## 4. ExtractionJob — Hàng đợi xử lý bất đồng bộ

| Cột | Ý nghĩa |
|---|---|
| `id` | Khóa chính. |
| `documentId` | Tài liệu cần xử lý (Cascade). |
| `kind` | DOCUMENT_PARSE (bóc tách trang/đoạn) hoặc INDICATOR_EXTRACT (trích xuất chỉ tiêu). |
| `status` | PENDING → PROCESSING → COMPLETED / FAILED tạm thời (quay về PENDING chờ retry) / DEAD_LETTER. |
| `attempts` | Số lần đã thử (trần `EXTRACTION_MAX_ATTEMPTS`, mặc định 3). |
| `availableAt` | Thời điểm sớm nhất được claim (backoff mũ đẩy lùi khi thất bại). |
| `lockedAt` / `lockedBy` | Lease của worker đang giữ (10 phút); quá lease job được claim lại. |
| `lastError` | Lỗi gần nhất (cắt 300 ký tự, không chứa nội dung tài liệu). |
| `model` | Model LLM đã dùng (null nếu chạy rule-only) — provenance mức job. |
| `promptVersion` | Phiên bản prompt (`extract-v1`) hoặc `rule-only`/`rule-v1` — provenance mức job. |
| `chunksTotal` / `chunksDone` | Tiến độ để frontend hiển thị. |
| `startedAt` / `finishedAt` | Thời gian chạy thực tế (dữ liệu đo hiệu năng). |
| `createdById` | Người kích hoạt (upload hoặc yêu cầu trích xuất lại). |

## 5. IndicatorCandidate — Chỉ tiêu ứng viên do AI/luật đề xuất

Chỉ trở thành `Target` chính thức sau khi người có thẩm quyền duyệt.

| Cột | Ý nghĩa |
|---|---|
| `id` | Khóa chính. |
| `documentId` / `chunkId` / `pageNumber` | Provenance: tài liệu, đoạn và trang nguồn của đề xuất. |
| `kind` | NEW_INDICATOR (đang dùng) hoặc PROGRESS_UPDATE (đã có enum, luồng giai đoạn 9 — kế hoạch). |
| `status` | PROPOSED → APPROVED / REJECTED. |
| `extractionMethod` | RULE_BASED hoặc LLM — phục vụ so sánh RQ2. |
| `model` / `promptVersion` | Model tag + phiên bản prompt sinh ra ứng viên (null/`rule-v1` với nhánh luật). |
| `name` / `description` / `category` | Tên, mô tả, lĩnh vực chỉ tiêu. |
| `unit` / `targetValue` | Đơn vị đo và giá trị mục tiêu. |
| `actualValue` | Giá trị thực hiện (dành cho kind PROGRESS_UPDATE — kế hoạch). |
| `targetYear` / `frequency` / `deadline` | Năm kế hoạch, tần suất báo cáo (null khi văn bản không nêu — người duyệt chọn tay), hạn hoàn thành. |
| `direction` | HIGHER_IS_BETTER / LOWER_IS_BETTER. |
| `responsibleDepartmentName` | Tên đơn vị chủ trì **đúng như văn bản**. |
| `responsibleDepartmentId` | Phòng ban hệ thống được khớp tự động (Dice ≥ 0.62, để null khi không đủ chắc). |
| `coordinatingDepartments` | Đơn vị phối hợp (chuỗi tự do). |
| `legalBasis` | Căn cứ pháp lý (số hiệu văn bản trong nội dung, mặc định `docNumber` của tài liệu). |
| `sourceQuote` | **Câu trích nguyên văn** chứa chỉ tiêu — bằng chứng đối chiếu, được kiểm chứng string-match với chunk. |
| `confidence` | Độ tin cậy tổng (0–1); bị hạ trần 0.4 nếu quote không khớp nguyên văn. |
| `fieldConfidence` | JSON độ tin cậy **từng trường** (name, targetValue, unit, frequency, deadline, responsibleDepartment). |
| `warnings` | JSON danh sách cảnh báo tiếng Việt (quote không khớp, thiếu giá trị số…). |
| `isDuplicateSuspect` / `matchedTargetId` | Nghi trùng với Target hiện có (Dice ≥ 0.72) và Target bị nghi trùng. |
| `humanEdited` / `editedFields` | Đã có người chỉnh sửa + danh sách trường đã sửa — chống re-extract ghi đè, đồng thời là dữ liệu đo RQ4. |
| `reviewNote` / `reviewedById` / `reviewedAt` | Lý do từ chối, người duyệt, thời điểm duyệt. |
| `createdTargetId` | Target được tạo khi duyệt (unique — một ứng viên tạo tối đa một Target). |
| `version` | Optimistic locking (mọi mutation cần `expectedVersion`). |

## 6. Cột provenance bổ sung cho Target (bảng hiện có)

| Cột | Ý nghĩa |
|---|---|
| `legalBasis` | Căn cứ pháp lý của chỉ tiêu chính thức (chép từ ứng viên hoặc số hiệu văn bản nguồn). |
| `sourceDocumentId` | FK về `SourceDocument` (SetNull) — chỉ tiêu truy ngược được về văn bản gốc. |

Kèm quan hệ ngược `sourceCandidate` (ứng viên đã tạo ra Target này) và `matchedCandidates` (các ứng viên nghi trùng với nó). Audit `TARGET_CREATED` khi duyệt mang metadata `fromCandidate`, `documentCode`, `extractionMethod`, `aiModel`, `confidence`.

## 7. Ánh xạ mô hình khái niệm (đề cương) → hiện thực

Nguyên tắc: **tránh phình bảng rỗng** — thực thể khái niệm chỉ thành bảng riêng khi vertical slice thật sự cần; phần còn lại ánh xạ vào bảng hiện có, trường JSON, artifact dạng tệp, hoặc hoãn có chủ đích sang giai đoạn ghi rõ.

| Thực thể khái niệm | Hiện thực | Ghi chú |
|---|---|---|
| SourceDocument | Bảng mới `SourceDocument` | 1-1. |
| DocumentVersion | **Kế hoạch — chưa cần** | SHA-256 unique chặn trùng; văn bản hành chính sửa đổi được tải như tài liệu mới có số hiệu riêng. Tách bảng version khi có nghiệp vụ thay thế văn bản. |
| DocumentPage | Bảng mới `DocumentPage` | 1-1. |
| DocumentChunk | Bảng mới `DocumentChunk` | 1-1; cột vector thêm ở giai đoạn 7. |
| ExtractedTable | **Kế hoạch — giai đoạn table-extraction chuyên sâu** | Hiện tại bảng được tuyến tính hóa thành text (tab-separated) trong page/chunk; xem [hạn chế đã biết](KNOWN_ISSUES.md). |
| LegalReference | Trường `legalBasis` (Candidate + Target) + `docNumber` | Chuỗi tham chiếu đủ cho tra cứu; bảng chuẩn hóa hoãn tới khi cần đồ thị văn bản pháp lý. |
| IssuingAuthority | Trường `SourceDocument.issuedBy` | Một phường — danh mục cơ quan ban hành chưa cần bảng riêng. |
| AdministrativeUnit | **Không tạo** | Hệ thống phạm vi một phường; đơn vị hành chính là hằng ngữ cảnh. |
| Department | Bảng hiện có `Department` | Tái dùng nguyên vẹn. |
| Indicator / IndicatorDefinition / IndicatorTarget | Bảng hiện có `Target` | Repo hợp nhất định nghĩa + mục tiêu trong một bảng có version/publication snapshot; tách 3 bảng sẽ phá vỡ toàn bộ nghiệp vụ hiện có mà không thêm giá trị ở quy mô phường. |
| IndicatorFormula | Trường `IndicatorCandidate.formula` | Lưu công thức dạng chuỗi khi văn bản nêu; engine tính toán không thuộc phạm vi. |
| IndicatorAssignment | `Target.departmentId` + `coordinatingDepartments` | Chủ trì là FK, phối hợp là chuỗi (đủ cho hiển thị/xác minh). |
| IndicatorActual | Bảng hiện có `ProgressUpdate` | Luồng candidate PROGRESS_UPDATE nối vào ở giai đoạn 9. |
| ReportingPeriod | **Kế hoạch — hoãn** | `frequency` hiện là thuộc tính cấu hình; sổ kỳ báo cáo độc lập chưa thuộc phiên bản hiện tại. |
| DataSource | `extractionMethod` + `model` + `promptVersion` trên Candidate/Job | Nguồn dữ liệu được mã hóa trong provenance thay vì bảng danh mục. |
| Evidence | Mẫu `FeedbackAttachment` hiện có; với chỉ tiêu AI: `sourceQuote` + `sourceDocumentId` | Bằng chứng của chỉ tiêu chính là trích dẫn + tài liệu nguồn. |
| ExtractionJob | Bảng mới `ExtractionJob` | 1-1. |
| ExtractionResult | Bảng mới `IndicatorCandidate` | Mỗi kết quả trích xuất là một ứng viên có vòng đời duyệt. |
| ExtractionField | Trường JSON `IndicatorCandidate.fieldConfidence` (+ `warnings`, `editedFields`) | Per-field metadata dạng JSON thay vì bảng con — tránh join sâu cho màn hình xác minh. |
| ValidationTask | Vòng đời `IndicatorCandidate.status` + màn hình Xác minh trích xuất | Hàng đợi xác minh chính là danh sách PROPOSED. |
| ApprovalWorkflow | Luồng approve/reject trong `candidates.ts` + `reviewedBy/At` | Một cấp duyệt (ADMIN) — đúng thẩm quyền tạo Target hiện hành; workflow đa cấp chưa cần. |
| AuditLog | Bảng hiện có `AuditLog` | Bổ sung action mới + key metadata vào `SAFE_METADATA_KEYS`. |
| AgentAction | Bảng `AgentAction` | Lưu lệnh, công cụ, tham số, bản xem trước, trạng thái, kết quả và thời hạn xác nhận của hành động ghi do Copilot đề xuất. |
| DataQualityIssue | Trường JSON `warnings` + `isDuplicateSuspect` | Cảnh báo gắn trực tiếp vào ứng viên nơi người duyệt nhìn thấy. |
| Notification | Mẫu `MailOutbox` hiện có | Thông báo AI (nếu cần) sẽ tái dùng outbox; chưa có nhu cầu ở prototype. |
| Conversation | **Chưa có** | Copilot hiện xử lý từng lượt; lịch sử hội thoại đa lượt là hướng mở rộng. |
| ModelRegistry / ModelExperiment | Trường `model` + `promptVersion` trên job/candidate; [nhật ký thí nghiệm](experiments/README.md) | Chỉ cần registry dạng bảng khi vận hành đồng thời nhiều model. |
| EvaluationDataset | Artifact `eval/dataset-v1/` | Dataset được version hóa bằng Git thay vì lưu trong cơ sở dữ liệu. |
| EvaluationResult | CSV/JSON trong `docs/experiments/results/` | Gắn dataset version, model và prompt version để tái lập. |
