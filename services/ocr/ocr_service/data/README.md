# Dữ liệu dùng cho kiểm tra âm tiết (B4)

`syllables.txt` là danh sách khoảng 6.000 âm tiết tiếng Việt có dấu thường dùng, mỗi dòng một âm tiết
(chữ thường, NFC). Âm tiết không dấu không cần có trong danh sách vì bước kiểm tra bỏ qua chữ không dấu
(tên riêng, từ tiếng Anh, mã).

Danh sách được tạo bằng `scripts/build_syllables.py` từ hai nguồn:

1. Danh sách tần suất từ tiếng Việt `vi_50k.txt` của dự án FrequencyWords
   (Hermit Dave, https://github.com/hermitdave/FrequencyWords, nội dung theo giấy phép CC BY-SA 4.0).
   Chỉ giữ âm tiết xuất hiện từ 3 lần trở lên và ghép đúng chính tả tiếng Việt.
2. Âm tiết trong văn bản mẫu của hệ thống (`apps/api/prisma/demo/tep/*.pdf`) và tên chỉ tiêu trong
   thư viện mẫu (`apps/api/src/templates`), để không gắn cờ nhầm tên địa danh như "Lái Thiêu", "Thạnh".

Mỗi âm tiết có vần mở oa, oe, uy được ghi cả hai kiểu đặt dấu ("hòa" và "hoà").

Theo giấy phép CC BY-SA 4.0, tệp `syllables.txt` là tác phẩm phái sinh của FrequencyWords và được phân phối
theo cùng giấy phép CC BY-SA 4.0. Phần còn lại của dịch vụ theo giấy phép của dự án.

Muốn bổ sung âm tiết (ví dụ tên địa danh của đơn vị) thì thêm dòng vào `syllables.txt`, hoặc trỏ biến môi
trường `OCR_EXTRA_SYLLABLES` tới một tệp cùng định dạng.
