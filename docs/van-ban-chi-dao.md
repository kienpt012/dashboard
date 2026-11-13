# Văn bản chỉ đạo, phân việc và theo dõi thực hiện

Phạm vi: G-10–G-16 và G-25. Phân hệ quản lý nội dung chỉ đạo và việc thực hiện; không thay phần mềm quản lý văn bản đến/đi, đăng ký số, ký số hoặc phát hành văn bản.

## Dữ liệu và luồng nghiệp vụ

Mỗi văn bản chỉ đạo là một `Framework` loại `TASK`. `name` là trích yếu; `directiveKind`, `docNumber`, `issuedDate`, `issuer`, `signer` lưu thông tin ban hành; `sourceDocumentId` liên kết tệp trong Kho văn bản. Năm văn bản lấy từ ngày ban hành. Bộ TASK hiện có và nhiệm vụ do đề xuất được duyệt tạo ra cũng được đọc ở phân hệ này.

Mỗi nhiệm vụ là một `Target`: đơn vị `%`, mục tiêu 100, hạn tại `dueDate`, phòng chủ trì, các phòng phối hợp, người phụ trách. Nhiệm vụ có thể có hạn sang năm sau. Không yêu cầu người dùng chọn kỳ định kỳ khi báo cáo kết quả; các màn hình tổng hợp và worker không nhắc thiếu kỳ cho TASK. Việc giao chuyên viên, báo cáo, duyệt, minh chứng và giải trình dùng hồ sơ CT-06 sẵn có.

`dispatchedById`, `dispatchedByName`, `dispatchedAt` lưu người phân việc và thời điểm; độc lập với `assignedById`/`assignedAt` của thao tác giao chuyên viên. `relatedTargetId` liên kết nhiệm vụ với chỉ tiêu cần thúc đẩy. Khối “Nhiệm vụ liên quan” trong hồ sơ chỉ tiêu chỉ trả dữ liệu thuộc phạm vi được xem.

## Quyền

`SystemSetting.dispatchMode` mặc định `LEADER`. Quản trị đổi tại HT-04, trường **Người phân việc cho phòng**. Chế độ `OFFICE` cấp quyền phân việc liên phòng cho MANAGER thuộc phòng đang hoạt động có `kind=OFFICE`; tài khoản cũng phải đang hoạt động. Lãnh đạo và quản trị giữ quyền hiện có trong cả hai chế độ.

| Vai trò | Tạo văn bản | Giao phòng, thêm/sửa nhiệm vụ | Duyệt đề xuất |
|---|---|---|---|
| ADMIN, LEADER | Có | Có | Mọi phòng, giữ quy tắc lãnh đạo hiện có |
| MANAGER phòng OFFICE, chế độ OFFICE | Có | Có | Mọi phòng, không tự duyệt |
| MANAGER phòng OFFICE, chế độ LEADER | Không | Không | Theo phòng mình, không tự duyệt |
| MANAGER phòng khác | Không | Không | Theo phòng mình, không tự duyệt |
| CLERK | Có | Không | Không |
| STAFF, VIEWER | Không | Không | Không |

Quyền xem tuân theo phạm vi chỉ tiêu; người phân việc được xem nhiệm vụ liên phòng để phân công. Quyền phân việc không cấp thêm quyền nhập số liệu hay giao chuyên viên thay trưởng phòng. Máy chủ kiểm tra quyền cho từng thao tác, không dựa vào nút giao diện. `permissions.canDispatch` được cung cấp cho web.

## Màn hình

- **DH-05 — `/admin/van-ban-chi-dao`**: số tổng, lọc năm/loại/phòng/trạng thái, tìm số ký hiệu hoặc trích yếu; các thẻ Danh sách, Việc theo tháng, Thống kê.
- **DH-06 — `/admin/van-ban-chi-dao/:id`**: thông tin ban hành và mở tệp bằng DocumentViewer; danh sách nhiệm vụ, thêm, dán từng dòng, sửa phòng/phối hợp/hạn, giao hàng loạt và lưu trữ. Bấm nội dung mở hồ sơ CT-06.
- **DH-07 — `/admin/viec-theo-thang`**: chọn tháng và phòng; gom việc theo văn bản, gồm nhiệm vụ đến hạn và kỳ báo cáo chỉ tiêu đến hạn trong tháng; in theo mẫu hành chính và xuất Excel.
- Trung tâm điều hành có khối Văn bản chỉ đạo, liên kết số quá hạn và đến hạn trong 7 ngày.

Dán danh sách nhận ngày ở cuối dòng, ví dụ `Hoàn thiện hồ sơ công trình trước 30/11/2026`; có thể chọn hạn chung cho các dòng không ghi ngày. Ngày không tồn tại bị từ chối trước khi ghi; tối đa 100 nhiệm vụ mỗi lần. Các thao tác hàng loạt có kiểm tra phiên bản và giao dịch nguyên tử.

## Thống kê và thời hạn

Trạng thái nhiệm vụ: Chưa bắt đầu, Đang thực hiện, Hoàn thành, Quá hạn. Chỉ số thống kê gồm số giao, hoàn thành đúng hạn/trễ, đang làm, quá hạn, tỷ lệ hoàn thành và số ngày trễ trung bình. Tổng hợp theo văn bản, phòng, loại và tháng; Excel gồm nhiều trang tính. Ngày nộp báo cáo hoàn thành đã được duyệt dùng để xác định đúng hạn/trễ, tránh tính thời gian chờ duyệt thành lỗi của người thực hiện.

Tháng thống kê là tháng đến hạn. Ngày trễ bình quân tính trên các nhiệm vụ hoàn thành trễ; việc chưa hoàn thành được đếm riêng ở cột quá hạn. Biểu đồ theo phòng dùng thanh ngang xếp chồng để đọc đủ tên phòng trên điện thoại; bảng nhiều cột cuộn ngang trong khung, không làm tràn trang.

Worker nhắc khi còn tối đa 3 ngày cho người phụ trách (chưa giao thì trưởng phòng), quá hạn báo trưởng phòng, quá hạn 3 ngày báo người phân việc và lãnh đạo. Khóa chống trùng theo nhiệm vụ/hạn/mốc/người nhận giúp chạy lại không gửi lặp. Thông báo đặt tên nhiệm vụ trước; không dùng mã CT trên giao diện mới. Mốc 3 ngày được dùng riêng cho TASK vì các cấu hình nhắc kỳ và việc treo hiện có mang ý nghĩa khác.

## API

Tất cả đường dẫn dưới `/api`, yêu cầu phiên đăng nhập.

| Phương thức và đường dẫn | Chức năng |
|---|---|
| GET `/directives/options` | Danh mục lựa chọn và quyền |
| GET, POST `/directives` | Danh sách hoặc tạo văn bản |
| GET, PATCH `/directives/:id` | Chi tiết, cập nhật/lưu trữ văn bản |
| POST `/directives/:id/tasks` | Thêm nhiệm vụ |
| PATCH `/directives/:id/tasks/:taskId` | Sửa nhiệm vụ có phiên bản |
| POST `/directives/:id/paste` | Dán danh sách |
| POST `/directives/:id/bulk` | Giao phòng, hạn hoặc lưu trữ hàng loạt |
| GET `/directives/monthly` | Việc theo tháng |
| GET `/directives/monthly.xlsx` | Excel tháng |
| GET `/directives/statistics` | Thống kê |
| GET `/directives/statistics.xlsx` | Excel thống kê |
| GET `/directives/related/:targetId` | Nhiệm vụ liên quan của chỉ tiêu |

DTO kiểm tra đầu vào, audit ghi thao tác và thông tin định danh cần thiết. Các API ghi giữ lịch sử công việc. Không gọi dịch vụ ngoài từ trình duyệt.

## Migration, mẫu và kiểm tra

Migration: `20261113110000_directives_dispatch`. Sau khi triển khai migration cần tạo lại Prisma Client. Script `apps/api/prisma/demo/extras-directives.ts` thêm dữ liệu mẫu theo khóa ổn định; chạy lại không nhân bản văn bản/nhiệm vụ/báo cáo.

Các lệnh kiểm tra từ gốc worktree:

```sh
npm run build
npm test
npm run test:workspace
# Chỉ sau khi nạp môi trường ioc_wp_b và chạy API ở cổng 3102:
node scripts/qa-directives.mjs
```

Script QA từ chối CSDL khác `ioc_wp_b`; kiểm tra HTTP thật, đối chiếu dữ liệu và Excel, chạy worker lại để kiểm tra chống trùng; cuối cùng khôi phục chế độ phân việc và dọn dữ liệu nghiệp vụ do bộ QA tạo.

Đợt kiểm tra trên CSDL dev: build thành công, 303 kiểm thử API/logic và 27 kiểm thử workspace đạt; bộ QA HTTP thật đạt 28 kiểm tra. Dữ liệu mẫu gồm 5 văn bản và 30 nhiệm vụ; chạy lại script không tạo thêm nhiệm vụ. Đã kiểm tra giao diện sáng/tối ở 1440 và 390 px, sáng ở 1024 px; kiểm tra bản in 2 trang, Enter/Escape và tự điền từ Kho văn bản. Bằng chứng chi tiết lưu trong báo cáo bàn giao gói B.
