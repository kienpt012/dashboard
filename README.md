# IOC Lái Thiêu

Nền tảng điều hành số cấp phường, hỗ trợ quản lý chỉ tiêu, báo cáo, phản ánh của người dân và trích xuất dữ liệu từ văn bản hành chính. Dữ liệu nội bộ được tách khỏi cổng công khai; kết quả do AI đề xuất phải được cán bộ xác minh trước khi trở thành dữ liệu chính thức.

## Chức năng chính

- Quản lý chỉ tiêu, tiến độ, phòng ban, tài khoản và báo cáo Excel.
- Cổng thông tin công khai tại `/` và khu vực quản trị tại `/admin`.
- Tiếp nhận, tra cứu và xử lý phản ánh kèm tệp minh chứng.
- Public Dashboard Studio để thiết kế, xem trước và công bố dashboard cho người dân.
- Kho văn bản hỗ trợ PDF, DOCX, XLSX và ảnh; OCR và trích xuất chỉ tiêu bằng AI cục bộ.
- Phân quyền theo vai trò, quy trình phê duyệt và nhật ký hệ thống có lưu vết.

## Công nghệ

- Web: React, TypeScript, Vite
- API: NestJS, Prisma
- Cơ sở dữ liệu: PostgreSQL
- AI/OCR: Ollama, Qwen3, Tesseract
- Triển khai: Docker Compose, Nginx

## Khởi chạy cục bộ

Yêu cầu: Windows, Docker Desktop và [Ollama](https://ollama.com/download). Node.js 22 được dùng cho phát triển và kiểm thử.

```powershell
Copy-Item .env.example .env
.\start-ioc.cmd
```

Trước lần chạy đầu, cập nhật ít nhất `POSTGRES_PASSWORD` và `JWT_SECRET` trong `.env`. Nếu cần dữ liệu demo, đặt `RUN_DEMO_SEED=true` và khai báo hai mật khẩu demo mạnh, riêng biệt; sau khi khởi tạo xong, đổi lại thành `false`.

Script khởi động sẽ kiểm tra Docker, Ollama, các model cần thiết và health check của hệ thống. Để chỉ dừng ba dịch vụ của dự án:

```powershell
docker compose stop
```

Chạy `.\stop-ioc.cmd` nếu muốn dừng thêm Ollama và Docker Desktop để giải phóng tài nguyên. Cả hai cách đều giữ nguyên dữ liệu PostgreSQL.

## Địa chỉ mặc định

| Thành phần | Địa chỉ |
|---|---|
| Cổng thông tin | <http://localhost:8080> |
| Gửi và tra cứu phản ánh | <http://localhost:8080/phan-anh> |
| Đăng nhập quản trị | <http://localhost:8080/admin/login> |
| Public Dashboard Studio | <http://localhost:8080/admin/public-dashboard> |
| API health check | <http://localhost:3000/api/health> |

## Phát triển và kiểm thử

```powershell
npm ci
npm run db:generate
npm test
npm run build
```

Các bộ QA tích hợp (`qa:access`, `qa:feedback`, `qa:import`, `qa:documents`) yêu cầu API và PostgreSQL đang chạy.

## Cấu trúc dự án

```text
apps/
  api/        NestJS API, Prisma schema và migrations
  web/        React web app
docs/         Tài liệu kiến trúc, vận hành và nghiên cứu
scripts/      Script khởi động, kiểm thử và triển khai
```

Xem [mục lục tài liệu](docs/README.md), [kiến trúc hệ thống](docs/ARCHITECTURE.md), [nghiệp vụ](docs/NGHIEP_VU_HE_THONG.md) và [hướng dẫn triển khai VPS](docs/DEPLOYMENT_VPS.md).

## Giấy phép

Dự án được phát hành theo [Apache License 2.0](LICENSE).
