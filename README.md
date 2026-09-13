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

## Khởi chạy trên máy mới

Chỉ cần **Windows 10 22H2 / Windows 11** và **Git**. Mọi thứ khác do trình khởi động tự lo.

1. Clone vào một thư mục có **đường dẫn ngắn**:

   ```powershell
   git clone https://github.com/kienpt012/dashboard.git C:\ioc
   ```

   Windows giới hạn đường dẫn 260 ký tự; clone vào thư mục quá sâu sẽ báo `Filename too long`
   và thiếu file. Nếu buộc phải dùng thư mục sâu, chạy trước `git config --global core.longpaths true`.

2. Nhấp đúp **`start-ioc.cmd`** trong thư mục vừa clone.

Trình khởi động tự làm theo thứ tự, và dừng lại hỏi khi cần bạn đồng ý:

| Bước | Việc làm |
|---|---|
| Kiểm tra máy | Phiên bản Windows, RAM, dung lượng đĩa, ảo hoá phần cứng, bản clone có đủ file |
| Docker | Chưa có thì hỏi để cài Docker Desktop bằng `winget`; đã có thì tự bật và chờ sẵn sàng |
| Cấu hình | Tạo `.env` với mật khẩu cơ sở dữ liệu, khoá JWT và mật khẩu đăng nhập **ngẫu nhiên**. Máy còn dữ liệu của lần cài trước thì **lấy lại cấu hình cũ** thay vì tạo mật khẩu mới |
| Xung đột | Một bản IOC khác trên máy dùng cùng tên thư mục/tên container thì tự đặt tên riêng; cổng 8080, 3000, 5432 bị chiếm thì chỉ ra chương trình đang giữ và đề nghị chuyển sang cổng trống |
| AI (tuỳ chọn) | Hỏi để cài Ollama và tải model (~3,7 GB). Từ chối vẫn chạy được, trích xuất dùng bộ luật |
| Hệ thống | Build và chạy PostgreSQL, API, web; **migration chạy tự động** khi API khởi động |
| Dữ liệu | Cơ sở dữ liệu còn trống thì tạo phòng ban, chỉ tiêu mẫu, tài khoản quản trị và tài khoản dùng thử |
| Kết thúc | Kiểm tra OCR, in địa chỉ và **mật khẩu vừa tạo**, mở trình duyệt |

Lần đầu mất khoảng 10 phút (chưa tính tải model AI). Mật khẩu chỉ in ra một lần nhưng luôn còn trong
`.env` (`DEMO_ADMIN_PASSWORD`, `DEMO_USER_PASSWORD`). Chạy lại bao nhiêu lần cũng an toàn: `.env` đã có
không bị ghi đè, dữ liệu và mật khẩu đã đặt không bị tạo lại.

Nếu script dừng với dòng **"CẦN BẠN XỬ LÝ"** — ví dụ vừa cài xong Docker Desktop cần khởi động lại
Windows — làm theo hướng dẫn rồi chạy lại `start-ioc.cmd`, script sẽ làm tiếp từ đó.

### Tham số

Chạy trong PowerShell hoặc cmd tại thư mục dự án, ví dụ `.\start-ioc.cmd -CheckOnly`.

| Tham số | Ý nghĩa |
|---|---|
| `-CheckOnly` | Chỉ kiểm tra máy có đủ điều kiện, không cài đặt hay thay đổi gì |
| `-NoAI` | Bỏ qua Ollama hoàn toàn |
| `-SkipBuild` | Dùng image đã build, khởi động nhanh hơn (không nhận thay đổi mã nguồn mới) |
| `-SkipModelPull` | Không tải model AI còn thiếu |
| `-Yes` | Tự đồng ý mọi câu hỏi — điều khoản của Docker và Ollama vẫn do bạn đồng ý khi được hỏi |
| `-NoBrowser` | Không tự mở trình duyệt |
| `-ResetData` | **Xoá toàn bộ dữ liệu** của bản IOC này rồi khởi tạo lại. Phải gõ tên dự án để xác nhận; không đụng dự án Docker khác |

### Dừng hệ thống

Nhấp đúp **`stop-ioc.cmd`**: dừng container IOC, gỡ model AI khỏi bộ nhớ, rồi tắt Docker Desktop để
giải phóng RAM và GPU. Nếu Docker đang chạy container của dự án khác, script hỏi trước khi tắt.
Thêm `-KeepDocker` để giữ Docker Desktop, `-KeepAI` để giữ Ollama. Chỉ dừng ba container của dự án:
`docker compose stop`. Mọi cách dừng đều giữ nguyên dữ liệu PostgreSQL. Tránh `docker compose down`
nếu có thể: container bị xoá thì script không còn chỗ lấy lại mật khẩu khi `.env` bị mất.

### Sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Git báo `Filename too long` khi clone | Clone vào thư mục ngắn như `C:\ioc`, hoặc `git config --global core.longpaths true` rồi clone lại |
| Cổng 5432 / 8080 / 3000 đã bị chiếm | Chạy lại và đồng ý chuyển cổng, hoặc tự đổi `POSTGRES_PORT` / `WEB_PORT` / `API_PORT` trong `.env` |
| Cổng trông như trống nhưng Docker báo `access permissions` | Cổng nằm trong dải Windows giữ chỗ cho Hyper-V; script tự nhận ra và chuyển cổng, hoặc chạy `net stop winnat` rồi `net start winnat` bằng quyền quản trị |
| Xoá thư mục rồi clone lại | Script lấy lại mật khẩu từ container cũ nên dữ liệu vẫn dùng được. Nếu container cũ cũng đã bị xoá: chép lại `.env` cũ, hoặc chạy `start-ioc.cmd -ResetData` để bắt đầu lại |
| API báo sai mật khẩu PostgreSQL | `POSTGRES_PASSWORD` trong `.env` khác lúc tạo dữ liệu: đặt lại giá trị cũ, hoặc `-ResetData` nếu không cần dữ liệu |
| Máy khác trong mạng không đăng nhập được | Mở bằng địa chỉ LAN in ở cuối lần chạy; địa chỉ đó đã được thêm vào `CORS_ORIGINS`. Không muốn mở ra mạng: đặt `WEB_BIND_ADDRESS=127.0.0.1` |
| Docker Desktop không lên sau khi cài | Khởi động lại Windows; nếu vẫn lỗi, chạy `wsl --install --no-distribution` bằng quyền quản trị |
| `Access is denied` khi gọi Docker | Thêm tài khoản Windows vào nhóm `docker-users`, đăng xuất rồi đăng nhập lại |
| Muốn chạy song song hai bản IOC | Clone vào thư mục khác và chạy `start-ioc.cmd`: script tự đặt tên dự án, tên container và cổng riêng |

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
