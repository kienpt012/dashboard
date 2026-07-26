# Kịch bản demo — vertical slice AI

Thời lượng ~15 phút. Điều kiện: API + web + Postgres chạy, Ollama đang bật (`ollama serve`), Tesseract cài sẵn, đã có `samples/` (sinh bằng `python scripts/generate-sample-documents.py`). Lưu ý: giao diện Kho văn bản/Xác minh trích xuất đang ở trạng thái ◐ hoàn thiện (TASKS.md) — chạy lại checklist này sau khi frontend chốt.

## Các bước

1. **Seed demo** (môi trường mới): `RUN_DEMO_SEED=true ALLOW_DEMO_SEED=true npx tsx prisma/seed.ts` → có tài khoản admin + phòng ban + 7 chỉ tiêu demo.
2. **Đăng nhập admin** tại `/admin/login`. Mở nhanh Danh mục chỉ tiêu để khán giả thấy trạng thái "trước": mọi chỉ tiêu đều từng phải gõ tay hơn 10 trường.
3. **Tải văn bản**: vào "Kho văn bản", tải `samples/ke-hoach-ktxh-2026.docx`, chọn loại KE_HOACH, nhập số văn bản. Nhấn mạnh: hệ thống trả lời **ngay** — cấp mã `VB-2026-NNNN`, kiểm tra magic-byte, chống trùng SHA-256; việc nặng chạy nền.
4. **Theo dõi trạng thái xử lý**: UPLOADED → PROCESSING → PROCESSED; job parse tự nối job trích xuất, hiển thị tiến độ đoạn (`chunksDone/chunksTotal`). *Talking point*: LLM local ~10 tok/s nên một tài liệu mất vài phút — kiến trúc bất đồng bộ (outbox + worker) là câu trả lời cho RQ6, người dùng không phải ngồi chờ.
5. **Mở "Xác minh trích xuất"**: danh sách ứng viên PROPOSED. *Talking point về provenance*: mỗi ứng viên mang tài liệu/trang/đoạn nguồn, model + phiên bản prompt, phương pháp (LLM hay RULE_BASED).
6. **Đối chiếu quote**: mở một ứng viên — câu trích nguyên văn hiển thị cạnh nội dung đoạn nguồn. *Talking point về chống bịa*: quote được kiểm chứng tự động bằng string-match; không khớp thì ứng viên bị cảnh báo + confidence kẹp trần 0.4. Chỉ vào `fieldConfidence`: độ tin cậy **từng trường**, không phải một con số chung chung — trường model không chắc (tần suất, phòng ban) sẽ thấp rõ rệt.
7. **Sửa một trường**: chỉnh ví dụ tần suất báo cáo (trường hay để trống vì "6 tháng" không thuộc enum — KNOWN_ISSUES #8). Hệ thống ghi `humanEdited` + `editedFields` — từ nay trích xuất lại không bao giờ ghi đè ứng viên này.
8. **Duyệt một ứng viên**: nếu thiếu phòng ban (đối sánh tên không đủ chắc thì hệ thống cố ý để trống), chọn tay rồi duyệt. Target được tạo qua đúng hàm cấp mã `CT-{năm}-{mãPB}-{seq}` dùng chung với luồng thủ công; audit ghi `TARGET_CREATED` kèm `fromCandidate`.
9. **Xem kết quả**: chỉ tiêu mới xuất hiện trên **Danh mục chỉ tiêu** (kèm căn cứ pháp lý + tài liệu nguồn) và **Dashboard** như mọi chỉ tiêu khác. *Talking point*: một chỉ tiêu — vài giây đối chiếu + một cú nhấp, thay vì gõ lại hơn 10 trường (RQ4).
10. **Minh họa OCR**: tải `samples/ke-hoach-ktxh-2026-scan.pdf` (bản scan không text layer) — trang được render ảnh và OCR bằng Tesseract vie, cột `ocrConfidence` ghi độ tin cậy từng trang.
11. **Minh họa idempotency**: trên tài liệu đầu tiên nhấn "Trích xuất lại" — ứng viên PROPOSED chưa ai đụng bị thay bằng kết quả mới, còn ứng viên đã duyệt/đã sửa ở bước 7–8 **giữ nguyên**. Mở Nhật ký hệ thống cho thấy chuỗi audit: DOCUMENT_UPLOADED → AI_CANDIDATE_EDITED → AI_CANDIDATE_APPROVED → TARGET_CREATED.

## Thông điệp chốt

- **Tin được vì truy vết được**: văn bản → trang → câu trích → model/prompt → người duyệt — chuỗi provenance không đứt.
- **AI đề xuất, con người quyết định**: không auto-approve; confidence chỉ điều hướng sự chú ý của người duyệt.
- **Local-first**: toàn bộ chạy trên một máy phổ thông, 0 đồng chi phí API, văn bản không rời hệ thống.
- (Nếu được hỏi về khi Ollama tắt) tắt Ollama và trích xuất lại: hệ thống vẫn ra ứng viên RULE_BASED — suy giảm có kiểm soát.
