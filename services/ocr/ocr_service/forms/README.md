# Mẫu biểu mẫu cố định

Mỗi tệp `*.json` trong thư mục này là một mẫu biểu mẫu (giấy tiếp nhận, phiếu đánh giá…). Định dạng xem
`ocr_service/forms.py`. Thư mục đang trống vì chưa có mẫu thật của đơn vị: muốn thêm, scan một tờ mẫu, đo khung
từng ô (tỉ lệ 0..1 theo chiều rộng, chiều cao trang) rồi ghi vào một tệp JSON mới. Trong Docker có thể gắn thư mục
mẫu riêng qua biến `OCR_FORMS_DIR`.
