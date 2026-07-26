# KNOWN_ISSUES.md — Hạn chế đã biết

## Hệ thống nền (có từ trước)

1. Không có CI — build/test chạy tay. (Kế hoạch: workflow GitHub Actions ở giai đoạn 10.)
2. Rate limit trong bộ nhớ tiến trình — chỉ đúng với 1 API instance.
3. Danh sách chỉ tiêu/status filter lọc trong JS sau khi load toàn bộ — chậm nếu >1000 chỉ tiêu.
4. `ImportBatch.createdBy` lưu username (không phải FK) — đổi tên đăng nhập làm mồ côi quyền apply batch.
5. nginx `proxy_read_timeout 60s` — endpoint đồng bộ chạy lâu sẽ đứt (pipeline AI đã thiết kế bất đồng bộ để né).

## Lớp AI (mới)

6. GTX 1650 4GB không chứa trọn Qwen3-4B + KV cache → offload ~30% sang CPU, ~10 tok/s.
   Trích xuất 1 tài liệu 5–10 trang mất 3–10 phút (chạy nền). Không phù hợp chat realtime dài.
   Chunk chứa nhiều chỉ tiêu (≥8) sinh JSON >2000 token ≈ 4 phút/lời gọi — vì vậy
   `OLLAMA_TIMEOUT_MS` mặc định 480s (đừng hạ dưới 300s trên máy GPU 4GB kẻo job nhiều
   chỉ tiêu timeout hàng loạt; đã gặp thực tế ở benchmark 26/07).
7. OCR Tesseract đọc tốt bản in rõ nét; scan mờ/nghiêng nhiều hoặc chữ viết tay sẽ kém —
   đường nâng cấp ghi ở DECISIONS D-003. `maxOcrPages` mặc định 20 trang/tài liệu để giữ thời gian xử lý.
8. Tần suất báo cáo "6 tháng" không nằm trong enum TargetFrequency (MONTHLY/QUARTERLY/YEARLY) —
   ứng viên để trống tần suất kèm cảnh báo, người duyệt chọn tay. Cân nhắc thêm SEMIANNUAL khi mở rộng enum.
9. Bảng bị ngắt qua nhiều trang PDF: text layer đọc theo trang nên dòng bảng có thể đứt giữa chunk;
   chunk overlap 200 ký tự giảm thiểu nhưng chưa xử lý triệt để (giai đoạn table-extraction chuyên sâu).
10. Ô gộp trong Excel: exceljs trả giá trị ở ô đầu vùng gộp, các ô còn lại rỗng — hàng phụ thuộc ngữ cảnh
    dọc có thể mất thông tin đơn vị chủ trì; LLM thường suy được từ ngữ cảnh sheet nhưng cần người xác minh.
11. Tài liệu Bytes trong Postgres (≤25MB/tệp) — xem D-008; production nên chuyển object storage.
12. Đối sánh phòng ban theo tên (Dice ≥ 0.62) có thể bỏ sót tên viết tắt lạ — khi đó để trống, người duyệt chọn.
13. Worker chạy trong tiến trình API — restart API giữa chừng job sẽ được claim lại sau lease 10 phút (an toàn
    nhưng chậm); nhiều API instance vẫn an toàn nhờ SKIP LOCKED nhưng chưa được test tải.
