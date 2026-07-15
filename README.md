# IOC Lái Thiêu · Control Room

Hệ thống điều hành số của Phường Lái Thiêu, hỗ trợ quản trị chỉ tiêu, báo cáo và tiếp nhận phản ánh người dân, với kiến trúc:

- Frontend: React 19 + TypeScript + Vite
- Backend: NestJS 11 + Prisma ORM
- Database: PostgreSQL 17
- Triển khai cục bộ: Docker Compose

## Chạy hệ thống

Docker Desktop cần ở trạng thái Running, sau đó tại thư mục dự án:

```powershell
docker compose up --build -d
```

Docker chỉ tự chạy migration, không tự tạo dữ liệu mẫu. Với môi trường demo mới hoàn toàn, đặt `RUN_DEMO_SEED=true` trong `.env` cho lần khởi tạo đầu tiên, chạy hệ thống, rồi đổi lại thành `false`. Không bật tùy chọn này trong môi trường vận hành thật.

Schema hiện có **17 migration**. Migration mới nhất `20260715170000_lai_thieu_rebrand` chuyển miền email tài khoản cũ sang `@laithieu.gov.vn`. PostgreSQL, API và web đều có healthcheck; web chỉ khởi động sau khi API khỏe và API chỉ khởi động sau khi PostgreSQL sẵn sàng.

Truy cập:

- Trang công khai dành cho người dân: http://localhost:8080
- Gửi và tra cứu phản ánh: http://localhost:8080/phan-anh
- Đăng nhập quản trị: http://localhost:8080/admin/login
- Trung tâm điều hành sau đăng nhập: http://localhost:8080/admin
- Tiếp nhận phản ánh nội bộ: http://localhost:8080/admin/feedback
- Hồ sơ và bảo mật tài khoản: http://localhost:8080/admin/profile
- Nhật ký hệ thống (quản trị viên): http://localhost:8080/admin/audit-logs
- API: http://localhost:3000/api
- Kiểm tra sức khỏe API và kết nối cơ sở dữ liệu: http://localhost:3000/api/health
- PostgreSQL: localhost:5432

Tài khoản quản trị mẫu (chỉ được tạo khi bật `RUN_DEMO_SEED=true`):

- Tên đăng nhập: `admin`
- Mật khẩu: `Admin@123`

Quy trình khởi tạo mới đã được kiểm tra từ volume PostgreSQL trống: seed tạo tài khoản `ADMIN` với `departmentId = NULL`, đúng phạm vi quản trị toàn hệ thống.

> Hãy đổi `JWT_SECRET`, mật khẩu PostgreSQL và mật khẩu Admin trước khi triển khai thật.

## Chức năng đã có

- Đăng nhập JWT và mô hình 4 vai trò: quản trị hệ thống, lãnh đạo đơn vị, cán bộ cập nhật và người dùng chỉ xem. API luôn kiểm tra lại vai trò, trạng thái tài khoản và phạm vi phòng ban.
- Cổng thông tin công khai không cần đăng nhập: tiến độ chung, chỉ tiêu nổi bật, kết quả theo phòng ban và tiện ích người dân.
- API công khai được tách riêng, chỉ trả dữ liệu tổng hợp an toàn; toàn bộ nghiệp vụ nội bộ vẫn yêu cầu đăng nhập.
- Dashboard điều hành: tiến độ chung, cơ cấu trạng thái, tiến độ phòng ban, cảnh báo và lịch sử cập nhật. Tiến độ tổng hợp và tiến độ từng phòng ban được tính theo trọng số, nhất quán giữa dashboard nội bộ, cổng công khai và báo cáo Excel.
- Danh mục chỉ tiêu: tạo, chỉnh sửa, lọc, gán phòng ban, trọng số, chu kỳ, hạn hoàn thành, cập nhật kết quả, lưu trữ/khôi phục có kiểm soát và công bố bản chụp dữ liệu ra cổng người dân. Phiên bản dữ liệu nội bộ được tách khỏi phiên bản công bố để không làm hỏng báo cáo đang chờ duyệt. Năm mặc định và hạn cuối ngày được xác định theo múi giờ `Asia/Ho_Chi_Minh`.
- Quản lý tài khoản: tạo, chỉnh sửa thông tin/vai trò/phòng ban, khóa/mở khóa và đặt lại mật khẩu; có kiểm soát không tự khóa tài khoản quản trị đang dùng và luôn giữ tối thiểu một quản trị viên hoạt động. Tài khoản quản trị có phạm vi toàn hệ thống, không gắn cố định với phòng ban và phải chọn rõ đơn vị khi tạo chỉ tiêu hoặc xuất/nhập dữ liệu theo đơn vị.
- Quản lý phòng ban: tạo, chỉnh sửa và ngừng hoạt động có kiểm tra tài khoản, chỉ tiêu và phản ánh còn đang vận hành.
- Import Excel theo mô hình phiếu cập nhật: tải dữ liệu hiện có, xem trước, kiểm tra xung đột rồi mới áp dụng; có trạng thái duyệt từng dòng, thống kê lô và màn hình đối soát chi tiết.
- Báo cáo chỉ tiêu, lọc phòng ban, in và xuất Excel.
- Kênh phản ánh công khai: người dân gửi phản ánh, nhận mã hồ sơ và mã bảo mật, tra cứu tiến trình, bổ sung thông tin, đánh giá kết quả hoặc đề nghị xem xét lại mà không cần tài khoản. Yêu cầu gửi lại do mất mạng được khôi phục an toàn, không tạo hồ sơ trùng.
- Quy trình xử lý phản ánh nội bộ: phân loại, phân công đơn vị/cán bộ, theo dõi riêng hạn cơ quan và hạn người dân bổ sung, ghi nhận lần liên hệ, trao đổi công khai hoặc ghi chú nội bộ, trình duyệt kết quả, đóng/mở lại và công bố bản tóm tắt đã ẩn danh. Công bố bắt buộc xác nhận ẩn danh và còn được API dò tín hiệu dữ liệu cá nhân.
- Nhật ký hệ thống dành cho quản trị viên, hỗ trợ tìm kiếm và lọc theo thao tác, đối tượng, đơn vị, khoảng ngày; dữ liệu nhạy cảm được loại khỏi phần chi tiết hiển thị.
- Hồ sơ cá nhân cho mọi vai trò; đổi mật khẩu yêu cầu mật khẩu mạnh, cấp lại phiên hiện tại và thu hồi các phiên đăng nhập cũ.
- Giao diện responsive cho máy tính bảng và điện thoại.

## Các lệnh hữu ích

```powershell
# Xem trạng thái
docker compose ps

# Kiểm tra API và kết nối PostgreSQL
Invoke-RestMethod http://127.0.0.1:3000/api/health

# Xem log API
docker compose logs -f api

# Dừng hệ thống nhưng giữ dữ liệu
docker compose down

# Dừng và xóa toàn bộ dữ liệu PostgreSQL
docker compose down -v

# Build source bên ngoài Docker
npm install
npm run build

# Kiểm thử đơn vị cho nghiệp vụ tính toán
npm test

# Kiểm thử phân quyền, phạm vi đơn vị và bảo mật phiên đăng nhập
npm run qa:access

# Kiểm thử toàn bộ vòng đời tiếp nhận và xử lý phản ánh
npm run qa:feedback

# Kiểm thử end-to-end tải mẫu, xem trước và áp dụng import Excel
npm run qa:import
```

Các lệnh `qa:*` yêu cầu PostgreSQL và API đang chạy tại cấu hình cục bộ. Kịch bản dùng dữ liệu kiểm thử riêng và dọn các bản ghi do chính kịch bản tạo sau khi hoàn tất.

Mốc double-check gần nhất:

- `npm test`: **18/18** kiểm thử đơn vị đạt, gồm tính tiến độ/trạng thái, tổng hợp theo trọng số và ranh giới năm theo giờ Việt Nam.
- `npm run qa:access`: **33/33** kiểm thử đạt, bao phủ đăng nhập, phân quyền/phạm vi phòng ban, ràng buộc quản trị, chặn quản trị viên tự đặt lại mật khẩu qua API, công bố/lưu trữ chỉ tiêu và thu hồi token.
- `npm run qa:feedback`: **64/64** kiểm thử đạt, bao phủ gửi/tra cứu phản ánh, chống gửi trùng, phân công, SLA chờ bổ sung, trình duyệt, đóng/mở lại, đánh giá, công bố ẩn danh, chống xung đột và che dữ liệu.
- `npm run qa:import`: **8/8** kiểm thử end-to-end đạt, bao phủ tải phiếu Excel hiện hành, xem trước, phát hiện phạm vi/xung đột, áp dụng dữ liệu và đối soát kết quả.
- `npm run build` đạt cho cả API và web; vòng kiểm tra giao diện bao phủ trang công khai, gửi/tra cứu phản ánh và toàn bộ màn hình quản trị trên desktop lẫn kích thước di động, gồm điều hướng, modal, bàn phím/focus và tràn ngang.

## Cấu trúc source

```text
apps/
  api/    NestJS, Prisma schema, migration, seed
  web/    React, các trang quản trị và hệ thống giao diện
docker-compose.yml
package.json
```

## Hướng mở rộng nghiệp vụ khuyến nghị

- Minh chứng đính kèm và ký số báo cáo.
- Quản lý kỳ báo cáo bằng thực thể độc lập `TargetReportingPeriod` theo tháng/quý/năm, liên kết từng lần cập nhật với kỳ cụ thể và khóa kỳ sau khi chốt số liệu. Hiện tại trường chu kỳ mới là thông tin cấu hình của chỉ tiêu, chưa thay thế sổ kỳ báo cáo độc lập.
- Cơ chế cấu hình thời gian làm việc, ngày nghỉ và chuyển cấp khi phản ánh sắp/quá hạn.
- Thông báo email/Zalo OA khi chỉ tiêu chậm hoặc quá hạn.
- Đính kèm ảnh/tài liệu cho phản ánh với kiểm tra loại tệp, dung lượng, mã độc và chính sách lưu trữ.
- Đồng bộ IOC, dịch vụ công, ngân sách và các dashboard chuyên ngành qua API.
- Khi chạy nhiều API song song, chuyển bộ giới hạn tần suất từ bộ nhớ tiến trình sang Redis; triển khai công khai thật phải đặt sau HTTPS và reverse proxy tin cậy.
