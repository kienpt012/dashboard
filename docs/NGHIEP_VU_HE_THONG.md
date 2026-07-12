# Nghiệp vụ hệ thống IOC Tân Hưng

Tài liệu này là chuẩn nghiệp vụ dùng chung cho giao diện React, API NestJS và dữ liệu PostgreSQL. Mọi kiểm tra quyền quan trọng phải thực hiện ở API; việc ẩn nút trên giao diện chỉ nhằm cải thiện trải nghiệm.

## 1. Nhóm người dùng và phạm vi dữ liệu

| Chức năng | Quản trị hệ thống | Lãnh đạo đơn vị | Cán bộ cập nhật | Người dùng chỉ xem |
|---|---:|---:|---:|---:|
| Xem dashboard, chỉ tiêu, báo cáo | Toàn hệ thống | Đơn vị mình | Đơn vị mình | Đơn vị mình |
| Đặt và sửa chỉ tiêu | Có | Không | Không | Không |
| Báo cáo số liệu | Có, hiệu lực ngay | Gửi chờ duyệt | Gửi chờ duyệt | Không |
| Duyệt/từ chối báo cáo | Có | Người khác gửi trong đơn vị mình | Không | Không |
| Tải/nhập phiếu Excel | Theo phạm vi chọn, hiệu lực ngay | Đơn vị mình, chờ duyệt | Đơn vị mình, chờ duyệt | Không |
| Quản lý phòng ban, tài khoản, cấu hình | Có | Không | Không | Không |

Quy tắc bắt buộc:

- API nạp lại tài khoản và phòng ban từ cơ sở dữ liệu ở từng request.
- Tài khoản ngoài vai trò quản trị phải thuộc một phòng ban đang hoạt động.
- Tham số `departmentId` do trình duyệt gửi không được phép mở rộng phạm vi của người dùng.
- Khi tài khoản bị khóa, đổi vai trò hoặc phòng ban ngừng hoạt động, token cũ không còn giúp vượt quyền.

## 2. Vòng đời chỉ tiêu

1. Quản trị viên tạo chỉ tiêu, chỉ định phòng ban, năm, hạn, trọng số và chiều đánh giá.
2. Chỉ tiêu mới chưa có báo cáo ở trạng thái `Chưa bắt đầu`.
3. Mỗi lần số liệu chính thức thay đổi, hệ thống tăng `version` và ghi thời điểm báo cáo.
4. Trạng thái được tính lại từ số liệu, mục tiêu, chiều đánh giá, hạn và ngưỡng rủi ro; người dùng không tự sửa trạng thái.
5. Chỉ quản trị viên quyết định chỉ tiêu nào được công khai trên trang người dân.

Hai chiều đánh giá:

- `Càng cao càng tốt`: ví dụ tỷ lệ đúng hạn, doanh thu, số công trình hoàn thành.
- `Càng thấp càng tốt`: ví dụ số vụ vi phạm, thời gian xử lý. Giá trị thực tế nhỏ hơn hoặc bằng mục tiêu mới được coi là hoàn thành.

Giá trị `0` của chỉ tiêu “càng thấp càng tốt” chỉ là kết quả hoàn thành nếu đã có một báo cáo thực tế; `0` mặc định trước lần báo cáo đầu tiên vẫn là `Chưa bắt đầu`.

## 3. Báo cáo và phê duyệt số liệu

### Cán bộ hoặc lãnh đạo đơn vị báo cáo

1. Chọn chỉ tiêu trong đơn vị mình.
2. Nhập giá trị mới và bắt buộc nêu kỳ/nguồn số liệu.
3. Hệ thống tạo bản ghi `PENDING`; kết quả chính thức chưa thay đổi.
4. Người gửi không thể gửi thêm một báo cáo cho cùng chỉ tiêu khi báo cáo trước còn chờ duyệt.

### Lãnh đạo đơn vị hoặc quản trị

1. Xem hàng đợi đúng phạm vi.
2. Đối chiếu giá trị hiện tại, giá trị đề xuất, nguồn số liệu và phiên bản.
3. Không được tự duyệt hoặc tự từ chối báo cáo do chính mình gửi; báo cáo của lãnh đạo đơn vị cần quản trị viên xử lý.
4. Duyệt: cập nhật kết quả chính thức, tăng phiên bản, lưu người/thời gian duyệt.
5. Từ chối: bắt buộc nêu lý do để người gửi sửa và báo cáo lại.
6. Nếu chỉ tiêu đã thay đổi sau lúc gửi, hệ thống chặn duyệt để tránh ghi đè số liệu mới.

## 4. Quy trình Excel không gây xung đột

Excel là phiếu cập nhật dữ liệu đang có, không phải công cụ tạo/upsert chỉ tiêu.

1. Người dùng tải phiếu từ máy chủ theo năm và phạm vi được phép.
2. Phiếu chứa đúng chỉ tiêu hiện tại; cột định danh và phiên bản được ẩn, các cột gốc được khóa.
3. Người dùng chỉ nhập `Giá trị mới` và `Ghi chú` trong ô màu vàng.
4. Khi tải lên, bước `Xem trước` không ghi vào chỉ tiêu. Hệ thống kiểm tra:
   - đúng mẫu và đúng năm;
   - đúng phòng ban;
   - không sửa cột khóa;
   - không có dòng trùng;
   - phiên bản và giá trị gốc còn khớp;
   - giá trị mới hợp lệ.
5. Chỉ file không lỗi mới có thể `Áp dụng`.
6. Trước khi áp dụng, toàn bộ phiên bản được kiểm tra lại trong transaction. Có xung đột thì không dòng nào được ghi.
7. Cán bộ/lãnh đạo áp dụng file tạo các báo cáo `PENDING`; chỉ quản trị viên áp dụng file thành kết quả đã duyệt.
8. Thao tác áp dụng có tính idempotent: gửi lại cùng yêu cầu không nhân đôi dữ liệu.

Báo cáo Excel được xuất riêng ở chế độ đọc, gồm tổng hợp, chi tiết và lịch sử. Cán bộ/người chỉ xem chỉ nhận lịch sử đã duyệt; quản trị/lãnh đạo có thể đối chiếu cả trạng thái duyệt.

## 5. Trang công khai

- Không yêu cầu đăng nhập tại `/`.
- Chỉ trả chỉ tiêu có `isPublic=true`, đã có bản chụp công bố và thuộc phòng ban đang hoạt động.
- Số liệu nội bộ sau khi duyệt không tự xuất hiện cho người dân. Quản trị viên phải bấm `Công bố`; hệ thống lưu riêng giá trị, mục tiêu, chiều đánh giá, trạng thái, người và thời điểm công bố.
- Chỉ tiêu nổi bật do quản trị viên lựa chọn, không phụ thuộc danh sách mã viết cứng.
- Không công khai tài khoản, lịch sử chờ duyệt/từ chối, định danh nội bộ hoặc nhật ký quản trị.
- Không dùng số liệu giả làm phương án dự phòng khi API lỗi; giao diện hiển thị trạng thái đang cập nhật rõ ràng.

## 6. Kiểm soát vận hành

- Các thao tác tạo/sửa chỉ tiêu, báo cáo, duyệt, import/export, tài khoản, phòng ban và cấu hình đều ghi nhật ký audit.
- DTO runtime từ chối trường lạ thay vì âm thầm nhận dữ liệu ngoài hợp đồng.
- Mật khẩu hash bằng bcrypt; API người dùng không trả `passwordHash`.
- Không cho quản trị viên tự khóa/hạ quyền tài khoản đang dùng và luôn giữ ít nhất một quản trị viên hoạt động.
- Phòng ban đã ngừng hoạt động không được gán cho tài khoản mới.

## 7. Tiêu chí kiểm thử chấp nhận

- Lãnh đạo/cán bộ/người chỉ xem của phòng A không đọc hay sửa dữ liệu phòng B, kể cả gọi API trực tiếp.
- Người chỉ xem không thấy và không gọi được import, duyệt, tài khoản, cấu hình hoặc cập nhật số liệu.
- Cán bộ gửi báo cáo không làm thay đổi chỉ tiêu trước khi được duyệt.
- Báo cáo cũ bị chặn nếu phiên bản chỉ tiêu đã thay đổi.
- File Excel tải từ phòng A không áp dụng được cho phòng B; sửa cột khóa hoặc dùng file cũ đều bị chặn.
- Chỉ tiêu “càng thấp càng tốt” được tính đúng, bao gồm trường hợp chưa báo cáo và báo cáo giá trị 0.
- Trang công khai chỉ chứa dữ liệu được đánh dấu công khai.
