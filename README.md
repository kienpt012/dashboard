# IOC Lái Thiêu

Nền tảng điều hành số cấp phường: quản lý chỉ tiêu, báo cáo, phản ánh của người dân và trích xuất số liệu từ văn bản hành chính bằng AI chạy cục bộ. Kết quả do AI đề xuất chỉ trở thành dữ liệu chính thức sau khi cán bộ xác minh.

## Tính năng

- Chỉ tiêu, tiến độ, phòng ban, tài khoản, xuất báo cáo Excel
- Cổng thông tin công khai (`/`) và khu quản trị (`/admin`)
- Tiếp nhận, tra cứu và xử lý phản ánh kèm tệp minh chứng
- Public Dashboard Studio: thiết kế, xem trước, công bố dashboard công khai
- Kho văn bản PDF, DOCX, XLSX, ảnh; OCR và trích xuất chỉ tiêu bằng AI
- Phân quyền theo vai trò, quy trình phê duyệt, nhật ký hệ thống

**Công nghệ:** React, Vite, NestJS, Prisma, PostgreSQL, Ollama (Qwen3, bge-m3), Tesseract, Docker Compose, Nginx.

## Cài đặt

### Windows

**Yêu cầu:** Windows 10 22H2 hoặc Windows 11, Git, ảo hoá phần cứng bật trong BIOS, RAM 8 GB (16 GB nếu dùng AI), 15 GB dung lượng trống, kết nối Internet ở lần cài đầu.

```powershell
git clone https://github.com/kienpt012/dashboard.git C:\ioc
cd C:\ioc
.\start-ioc.cmd
```

Có thể nhấp đúp `start-ioc.cmd` thay cho lệnh cuối. Clone vào đường dẫn ngắn để tránh lỗi `Filename too long`.

`start-ioc.cmd` lần lượt:

1. Kiểm tra cấu hình máy và mã nguồn.
2. Cài Docker Desktop qua `winget` nếu chưa có (hỏi trước), khởi động Docker Engine.
3. Tạo `.env` với mật khẩu và khoá bí mật ngẫu nhiên.
4. Kiểm tra cổng 8080, 3000, 5432; đề nghị cổng khác nếu bị chiếm.
5. Cài Ollama và tải model AI (tuỳ chọn, khoảng 3,7 GB).
6. Build và khởi động PostgreSQL, API, web; áp dụng migration.
7. Tạo dữ liệu mẫu nếu cơ sở dữ liệu trống và in tài khoản đăng nhập.

Lần cài đầu mất khoảng 10 phút, chưa tính thời gian tải model. Nếu script dừng với thông báo **CẦN BẠN XỬ LÝ** (ví dụ phải khởi động lại Windows sau khi cài Docker), làm theo hướng dẫn rồi chạy lại lệnh. Chạy lại không ghi đè `.env` và không tạo lại dữ liệu.

### Linux, macOS

**Yêu cầu:** Docker Engine hoặc Docker Desktop có Compose v2.

```bash
git clone https://github.com/kienpt012/dashboard.git ioc && cd ioc
cp .env.example .env
```

Trong `.env`, đặt `POSTGRES_PASSWORD`, `JWT_SECRET` (tối thiểu 32 ký tự), `DEMO_ADMIN_PASSWORD` và `DEMO_USER_PASSWORD` (tối thiểu 12 ký tự, gồm chữ hoa, chữ thường, số, ký tự đặc biệt; không dùng `$` và `#`). Sau đó:

```bash
docker compose up -d --build
docker compose exec api ./docker-entrypoint.sh seed   # chỉ chạy một lần
```

## Tài khoản mẫu

| Tài khoản | Vai trò | Mật khẩu |
|---|---|---|
| `admin` | Quản trị hệ thống | `DEMO_ADMIN_PASSWORD` trong `.env` |
| `lan.anh`, `manager.vhxh` | Lãnh đạo đơn vị | `DEMO_USER_PASSWORD` trong `.env` |
| `staff.ktht` | Cán bộ cập nhật | `DEMO_USER_PASSWORD` trong `.env` |
| `viewer.ktht` | Chỉ xem báo cáo | `DEMO_USER_PASSWORD` trong `.env` |

Đổi mật khẩu quản trị sau lần đăng nhập đầu tiên.

## Địa chỉ

| Thành phần | URL |
|---|---|
| Cổng thông tin | <http://localhost:8080> |
| Gửi, tra cứu phản ánh | <http://localhost:8080/phan-anh> |
| Quản trị | <http://localhost:8080/admin/login> |
| API health check | <http://localhost:3000/api/health> |

Máy khác trong mạng nội bộ truy cập qua `http://<IP-máy-chủ>:8080`; địa chỉ này phải có trong `CORS_ORIGINS` (`start-ioc.cmd` tự thêm). Để chỉ truy cập được từ máy chủ, đặt `WEB_BIND_ADDRESS=127.0.0.1`.

## Vận hành

| Lệnh | Tác dụng |
|---|---|
| `.\start-ioc.cmd` | Khởi động; sau `git pull` sẽ build lại và áp dụng migration mới |
| `.\start-ioc.cmd -SkipBuild` | Khởi động nhanh bằng image đã build |
| `.\start-ioc.cmd -CheckOnly` | Chỉ kiểm tra điều kiện, không thay đổi gì |
| `.\start-ioc.cmd -NoAI` | Không dùng Ollama; trích xuất bằng bộ luật |
| `.\start-ioc.cmd -SkipModelPull` | Không tải model AI còn thiếu |
| `.\start-ioc.cmd -Yes` | Tự đồng ý các câu hỏi, trừ xoá dữ liệu |
| `.\start-ioc.cmd -NoBrowser -NoPause` | Không mở trình duyệt, không chờ nhấn phím khi kết thúc |
| `.\start-ioc.cmd -ResetData` | Xoá toàn bộ dữ liệu và khởi tạo lại; yêu cầu gõ tên dự án để xác nhận |
| `.\stop-ioc.cmd` | Dừng IOC, Ollama và Docker Desktop; dữ liệu được giữ nguyên |
| `.\stop-ioc.cmd -KeepDocker -KeepAI` | Chỉ dừng container IOC |

Không dùng `docker compose down -v`: lệnh này xoá volume dữ liệu.

## Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| `Filename too long` khi clone | Clone vào `C:\ioc`, hoặc chạy `git config --global core.longpaths true` rồi clone lại |
| Docker Desktop không khởi động sau khi cài | Khởi động lại Windows; nếu vẫn lỗi, chạy `wsl --install --no-distribution` bằng quyền quản trị |
| `Access is denied` khi gọi Docker | Thêm tài khoản Windows vào nhóm `docker-users`, đăng xuất rồi đăng nhập lại |
| Cổng đang bị chiếm | Chạy lại `start-ioc.cmd` và đồng ý chuyển cổng, hoặc sửa `WEB_PORT`, `API_PORT`, `POSTGRES_PORT` trong `.env` |
| Docker báo `access permissions` khi mở cổng | Cổng nằm trong dải Hyper-V giữ chỗ: chuyển cổng, hoặc chạy `net stop winnat` rồi `net start winnat` bằng quyền quản trị |
| API báo sai mật khẩu PostgreSQL | `POSTGRES_PASSWORD` phải khớp giá trị lúc tạo dữ liệu; nếu không cần dữ liệu cũ, chạy `start-ioc.cmd -ResetData` |
| Clone lại và mất `.env` | Chạy `start-ioc.cmd`; cấu hình được khôi phục từ container cũ nếu container còn tồn tại |
| Máy khác không đăng nhập được | Thêm `http://<IP>:<cổng>` vào `CORS_ORIGINS` trong `.env` rồi chạy lại |

## Phát triển

**Yêu cầu:** Node.js 22, PostgreSQL. Đặt `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` (mẫu trong `.env.example`) vào biến môi trường hoặc `apps/api/.env`.

```powershell
npm ci
npm run db:generate
npm run dev      # API và web (Vite, cổng 5173)
npm test
npm run build
```

Các bộ kiểm thử tích hợp `qa:access`, `qa:feedback`, `qa:import`, `qa:documents` cần API và PostgreSQL đang chạy.

## Cấu trúc

```text
apps/api    NestJS API, Prisma schema, migration, dữ liệu mẫu
apps/web    Ứng dụng React
deploy/     Script và cấu hình triển khai VPS
docs/       Tài liệu kiến trúc, nghiệp vụ, vận hành
scripts/    Trình khởi động Windows, kiểm thử tích hợp, triển khai
```

Tài liệu: [mục lục](docs/README.md) · [kiến trúc](docs/ARCHITECTURE.md) · [nghiệp vụ](docs/NGHIEP_VU_HE_THONG.md) · [triển khai VPS](docs/DEPLOYMENT_VPS.md)

## Giấy phép

[Apache License 2.0](LICENSE)
