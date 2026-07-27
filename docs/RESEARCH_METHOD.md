# Phương pháp nghiên cứu

Đề tài theo hướng **nghiên cứu ứng dụng dạng Design Science Research (DSR)**: xây dựng artefact (nền tảng IOC thông minh) để trả lời các câu hỏi nghiên cứu ([RESEARCH_QUESTIONS.md](RESEARCH_QUESTIONS.md)), đánh giá artefact bằng thí nghiệm đo lường, và lặp lại theo bằng chứng.

## 1. Chu trình nghiên cứu

1. **Khảo sát hiện trạng**: đọc toàn bộ mã nguồn, chạy build/test/hệ thống, đo cấu hình phần cứng → [research/01-current-system-assessment.md](research/01-current-system-assessment.md). Xác định điểm nghẽn nhập liệu và các "nguyên liệu" tái dùng (outbox worker, mô hình duyệt Import Excel, audit).
2. **Thiết kế artefact**: mô hình dữ liệu 5 bảng mới + provenance cho Target ([DATA_DICTIONARY.md](DATA_DICTIONARY.md)); pipeline bất đồng bộ ([ARCHITECTURE.md](ARCHITECTURE.md)); schema trích xuất JSON ràng buộc với confidence từng trường; lựa chọn model có căn cứ benchmark công khai ([research/02-model-selection.md](research/02-model-selection.md)). Mỗi quyết định ghi ở `DECISIONS.md`.
3. **Hiện thực vertical slice**: upload → parse/OCR → chunk → trích xuất hybrid → xác minh → duyệt thành Target — một luồng hẹp nhưng chạy đầu-cuối trước khi mở rộng.
4. **Thí nghiệm đo lường**: trên evaluation dataset synthetic (bộ `samples/` sinh bằng script, mở rộng thành `eval/dataset-v1/`) và — khi được phép — văn bản thật của phường. Mỗi thí nghiệm có ID trong `EXPERIMENTS.md`.
5. **Đánh giá theo tiêu chí** (mục 4) và đối chiếu với giả thuyết từng RQ.
6. **Lặp**: điều chỉnh prompt/luật/kiến trúc theo bằng chứng (ví dụ: lỗi tần suất ở E-001 → bổ sung quy tắc prompt số 7), chỉ nâng cấp model theo lộ trình khi có bằng chứng điểm nghẽn ([AI_MODEL_STRATEGY.md](AI_MODEL_STRATEGY.md)).

## 2. Đối tượng và phạm vi nghiên cứu

- **Đối tượng**: bài toán trích xuất chỉ tiêu hành chính có cấu trúc từ văn bản tiếng Việt và quy trình human-in-the-loop biến đề xuất AI thành dữ liệu điều hành chính thức.
- **Phạm vi**:
  - Cấp hành chính: **cấp phường** (một phường — Lái Thiêu), quy mô dữ liệu tương ứng.
  - Loại văn bản: kế hoạch (KH), quyết định (QĐ), báo cáo (BC), công văn (CV), cùng nghị quyết/phụ lục ở mức hỗ trợ định dạng.
  - Ngôn ngữ: tiếng Việt.
  - Định dạng: PDF (text layer + scan), DOCX, XLSX, ảnh JPEG/PNG/WEBP, ≤25MB/tệp.
  - Hạ tầng: một máy chủ, AI cục bộ (Ollama + Tesseract), không dịch vụ cloud.

## 3. Biến số và chỉ số đo

| Nhóm | Chỉ số | Cách đo |
|---|---|---|
| Chất lượng trích xuất | Precision / Recall / F1 **theo từng trường** (tên, giá trị, đơn vị, tần suất, hạn, phòng ban, căn cứ) | So khớp với ground truth per-document |
| | Exact match toàn chỉ tiêu | Mọi trường bắt buộc đều đúng |
| | Numeric accuracy | Giá trị số đúng tuyệt đối (kể cả định dạng số VN "3.450", "95,5") |
| | Hallucination rate | Tỷ lệ ứng viên có `sourceQuote` không khớp nguyên văn chunk (cơ chế kiểm chứng quote đã chạy trong sản phẩm, hạ trần confidence 0.4) |
| Hiệu năng | Thời gian xử lý /chunk, /tài liệu; tok/s; CER OCR /trang | Đo từ job log + Ollama (`eval_count`, duration); E-004 cho OCR |
| Hiệu quả nghiệp vụ | % thao tác thủ công loại bỏ | % trường AI điền đúng không cần sửa (từ `editedFields`); so thời gian quy trình cũ/mới |

## 4. Evaluation dataset có version (kế hoạch — giai đoạn 6)

- Thư mục `eval/dataset-v1/`: mỗi tài liệu đầu vào kèm một tệp **ground-truth JSON** liệt kê toàn bộ chỉ tiêu đúng với đầy đủ trường.
- Dataset bất biến sau khi chốt version; thay đổi tạo `dataset-v2` để mọi kết quả benchmark tái lập được và so sánh được giữa các lần chạy.
- Nguồn dữ liệu: ban đầu là văn bản synthetic (sinh bằng `scripts/generate-sample-documents.py`, mô phỏng văn phong hành chính thật, gồm cả bản scan để đo OCR); bổ sung văn bản thật đã được phép sử dụng ở giai đoạn sau.
- Kết quả mỗi lần benchmark lưu tại `docs/experiments/` (CSV/JSON kèm bản mô tả), gắn với dataset version + model tag + promptVersion.

## 5. Baseline so sánh

1. **Thủ công** (baseline nghiệp vụ): cán bộ gõ tay toàn bộ — mốc so sánh cho RQ4.
2. **Rule-based thuần** (`extraction-rules.ts`): baseline kỹ thuật không cần GPU.
3. **LLM thuần** (Qwen3-4B structured output): đo riêng bằng cách tắt nhánh luật.
4. **Hybrid** (phương án sản phẩm, D-007): LLM chính + luật bổ khuyết theo giá trị số.

Cùng chạy trên cùng dataset version; giai đoạn sau bổ sung đối chiếu qwen3:4b vs qwen2.5:7b-instruct (E-005 theo kế hoạch).

## 6. Kiểm soát tính đúng đắn của quá trình nghiên cứu

- Mọi con số hiệu năng/chất lượng chỉ được công bố khi có trong `EXPERIMENTS.md` hoặc tài liệu experiments kèm dữ liệu tái lập.
- 76 unit test hiện có phải luôn xanh khi mở rộng (quy tắc hồi quy — [TEST_STRATEGY.md](TEST_STRATEGY.md)).
- Provenance (model, promptVersion) ghi trên từng job và từng ứng viên, cho phép quy mọi kết quả về đúng cấu hình sinh ra nó.

## 7. Hạn chế của nghiên cứu

- **Dữ liệu synthetic chiếm đa số** ở giai đoạn hiện tại: văn phong được mô phỏng sát thực tế nhưng chưa thay thế được độ nhiễu của văn bản thật (scan xấu, bảng phức tạp, viết tắt địa phương). Kết luận về độ chính xác cần được kiểm chứng lại trên văn bản thật.
- **Một máy, một cấu hình phần cứng** (GTX 1650 4GB): số đo hiệu năng không khái quát cho cấu hình khác; tuy nhiên đây chính là chủ đích của RQ6 (phần cứng phổ thông).
- **Một phường**: danh mục phòng ban, văn phong và quy mô dữ liệu của một đơn vị; khả năng khái quát sang phường khác là suy đoán có cơ sở, chưa kiểm chứng.
- Smoke test (E-001, E-002) có cỡ mẫu nhỏ — chỉ dùng để xác nhận tính khả thi, không phải kết luận thống kê.
