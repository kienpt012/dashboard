# IOC Lái Thiêu

Hệ thống quản trị chỉ tiêu được xây dựng với kiến trúc:

- Frontend: React 19 + TypeScript + Vite
- Backend: NestJS 11 + Prisma ORM
- Database: PostgreSQL 17
- Triển khai cục bộ: Docker Compose

## Chạy hệ thống

Docker Desktop cần ở trạng thái Running, sau đó tại thư mục dự án:

```powershell
docker compose up --build -d
```

Truy cập:

- Trang công khai dành cho người dân: http://localhost:8080
- Đăng nhập quản trị: http://localhost:8080/admin/login
- Trung tâm điều hành sau đăng nhập: http://localhost:8080/admin
- API: http://localhost:3000/api
- PostgreSQL: localhost:5432

Tài khoản quản trị mẫu:

- Tên đăng nhập: `admin`
- Mật khẩu: `Admin@123`

> Hãy đổi `JWT_SECRET`, mật khẩu PostgreSQL và mật khẩu Admin trước khi triển khai thật.

## Chức năng đã có

- Đăng nhập JWT và mô hình 4 vai trò: Admin, lãnh đạo đơn vị, cán bộ cập nhật, chỉ xem.
- Cổng thông tin công khai không cần đăng nhập: tiến độ chung, chỉ tiêu nổi bật, kết quả theo phòng ban và tiện ích người dân.
- API công khai được tách riêng, chỉ trả dữ liệu tổng hợp an toàn; toàn bộ nghiệp vụ nội bộ vẫn yêu cầu đăng nhập.
- Dashboard điều hành: tiến độ chung, cơ cấu trạng thái, tiến độ phòng ban, cảnh báo và lịch sử cập nhật.
- Danh mục chỉ tiêu: tạo mới, lọc, gán phòng ban, trọng số, chu kỳ, hạn hoàn thành, cập nhật kết quả.
- Quản lý tài khoản và phòng ban.
- Import Excel hàng loạt, tải file mẫu, nhật ký import và lỗi theo dòng.
- Báo cáo chỉ tiêu, lọc phòng ban, in và xuất Excel.
- Giao diện responsive cho máy tính bảng và điện thoại.

## Các lệnh hữu ích

```powershell
# Xem trạng thái
docker compose ps

# Xem log API
docker compose logs -f api

# Dừng hệ thống nhưng giữ dữ liệu
docker compose down

# Dừng và xóa toàn bộ dữ liệu PostgreSQL
docker compose down -v

# Build source bên ngoài Docker
npm install
npm run build
```

## Cấu trúc source

```text
apps/
  api/    NestJS, Prisma schema, migration, seed
  web/    React, các trang quản trị và hệ thống giao diện
docker-compose.yml
package.json
```

## Hướng mở rộng nghiệp vụ khuyến nghị

- Ma trận phân quyền chi tiết theo phòng ban và thao tác.
- Luồng phê duyệt chỉ tiêu/cập nhật số liệu nhiều cấp.
- Minh chứng đính kèm và ký số báo cáo.
- Nhật ký kiểm toán đầy đủ cho thay đổi dữ liệu.
- Thông báo email/Zalo OA khi chỉ tiêu chậm hoặc quá hạn.
- Đồng bộ IOC, dịch vụ công, ngân sách và các dashboard chuyên ngành qua API.
