# Tính mới và đóng góp của đề tài

Mỗi đóng góp ghi rõ trạng thái bằng chứng: **[đã có bằng chứng]** = artefact chạy được / số đo trong `EXPERIMENTS.md`; **[chờ thí nghiệm]** = đã có hạ tầng đo, kết quả định lượng thuộc giai đoạn benchmark.

## 1. Pipeline trích xuất chỉ tiêu hành chính tiếng Việt local-first trên phần cứng phổ thông

Pipeline đầu-cuối (đa định dạng → OCR tiếng Việt → chunking giữ dấu vết trang → LLM structured output) chạy trọn trên GPU 4GB VRAM (GTX 1650) với hai cơ chế chống hallucination gắn vào từng kết quả: **độ tin cậy từng trường** (`fieldConfidence`) và **kiểm chứng câu trích nguyên văn** (quote không khớp chunk ⇒ cảnh báo + hạ trần confidence 0.4).

- **[đã có bằng chứng]** vertical slice hoạt động trên bộ tài liệu mẫu; E-001: 4/4 chỉ tiêu đúng, quote nguyên văn 4/4, số kiểu VN parse đúng, ~8–10 tok/s sau tối ưu.
- **[chờ thí nghiệm]** độ chính xác per-field trên dataset đánh giá (E-003), CER OCR (E-004).

## 2. Mô hình dữ liệu provenance đầy đủ cho dữ liệu AI đề xuất trong hệ thống hành chính

Thiết kế 5 bảng (SourceDocument → DocumentPage/DocumentChunk → ExtractionJob → IndicatorCandidate) + cột provenance trên dữ liệu chính thức (`Target.legalBasis`, `sourceDocumentId`), tạo chuỗi truy vết không đứt: văn bản → trang → câu trích → model/promptVersion → người duyệt → chỉ tiêu chính thức; kèm quy tắc retention (không xóa tài liệu còn chỉ tiêu đã duyệt tham chiếu).

- **[đã có bằng chứng]** schema đã migrate và vận hành (migration `document_ai_foundation`); mô tả đầy đủ ở [DATA_DICTIONARY.md](DATA_DICTIONARY.md).

## 3. Kiến trúc human-in-the-loop tái dùng trust-boundary nghiệp vụ sẵn có

Thay vì phát minh luồng duyệt mới, đề tài chứng minh có thể **nhân bản trust-boundary của Import Excel** (preview → duyệt → apply) và mô hình MailOutbox (claim SKIP LOCKED, lease, backoff, DEAD_LETTER) cho dữ liệu AI: ứng viên PROPOSED → người duyệt → Target qua đúng hàm cấp mã dùng chung; re-extract idempotent không ghi đè công sức con người (`humanEdited`).

- **[đã có bằng chứng]** hiện thực hoàn chỉnh trong `candidates.ts` / `extraction-worker.ts`, 76 test nền tảng vẫn xanh sau refactor — cho thấy lớp AI ghép vào không phá kỷ luật dữ liệu hiện có.

## 4. So sánh thực nghiệm rule-based vs local LLM trên văn bản hành chính tiếng Việt

Cả hai phương án cùng chạy trong một hệ thống với cùng schema đầu ra (`extractionMethod` RULE_BASED/LLM), tạo điều kiện so sánh công bằng trên cùng dataset; kiến trúc hybrid (LLM chính, luật bổ khuyết + fallback, D-007) là phương án đề xuất.

- **[đã có bằng chứng]** hai bộ trích xuất và cơ chế hybrid vận hành; lựa chọn model có căn cứ benchmark công khai (VMLU/VN-MTEB — [research/02-model-selection.md](research/02-model-selection.md)).
- **[chờ thí nghiệm]** kết quả định lượng P/R/F1 per field giữa các phương án (E-003 — pending benchmark).

## 5. Bài học triển khai AI trong ràng buộc chính quyền cơ sở

Tổng kết kinh nghiệm thiết kế dưới ràng buộc thực tế: riêng tư dữ liệu (không cloud LLM), chi phí 0 đồng API, khả năng chạy offline, phần cứng phổ thông — dẫn tới các quyết định có thể tái áp dụng: pipeline bất đồng bộ né giới hạn ~10 tok/s, lộ trình nâng cấp model theo bậc thay vì đổi kiến trúc, graceful degradation về rule-based, và điều kiện tiên quyết nghiêm ngặt trước khi fine-tune (chưa bắt đầu vì chưa đủ điều kiện — [AI_MODEL_STRATEGY.md](AI_MODEL_STRATEGY.md)).

- **[đã có bằng chứng]** chuỗi quyết định D-001…D-008 kèm căn cứ trong `DECISIONS.md`; số đo hiệu năng nền tảng E-001/E-002.
- **[chờ thí nghiệm]** đánh giá hiệu quả nghiệp vụ (RQ4) và Copilot tiếng Việt (RQ5) ở các giai đoạn sau.
