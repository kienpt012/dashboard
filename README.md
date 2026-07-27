# IOC Lái Thiêu · Nền tảng IOC thông minh

Hệ thống điều hành số của Phường Lái Thiêu: quản trị chỉ tiêu, báo cáo, tiếp nhận phản ánh người dân,
và **lớp AI cục bộ tự đọc văn bản hành chính để đề xuất chỉ tiêu** (con người xác minh trước khi thành dữ liệu chính thức).

- Frontend: React 19 + TypeScript + Vite
- Backend: NestJS 11 + Prisma ORM (modular monolith)
- Database: PostgreSQL 17
- AI cục bộ: Ollama (Qwen3-4B trích xuất, bge-m3 embedding) + Tesseract OCR tiếng Việt — không gửi dữ liệu ra ngoài
- Triển khai cục bộ: Docker Compose

Tài liệu nghiên cứu và kiến trúc: xem thư mục `docs/` (bắt đầu từ `docs/PROJECT_VISION.md`,
`docs/ARCHITECTURE.md`); nhật ký quyết định ở `DECISIONS.md`, tiến độ ở `PROGRESS.md`.

## Chạy hệ thống

Docker Desktop cần ở trạng thái Running, sau đó tại thư mục dự án:

```powershell
docker compose up --build -d
```

Docker chỉ tự chạy migration, không tự tạo dữ liệu mẫu. Với môi trường demo mới hoàn toàn, đặt `RUN_DEMO_SEED=true` trong `.env` cho lần khởi tạo đầu tiên, chạy hệ thống, rồi đổi lại thành `false`. Không bật tùy chọn này trong môi trường vận hành thật.

Schema hiện có **23 migration**. Các migration mới nhất bổ sung tệp minh chứng, bản chụp phản ánh công khai, phiên OTP khôi phục mật khẩu, mã chỉ tiêu duy nhất toàn hệ thống và outbox email tiến độ. PostgreSQL, API và web đều có healthcheck; web chỉ khởi động sau khi API khỏe và API chỉ khởi động sau khi PostgreSQL sẵn sàng.

Truy cập:

- Trang công khai dành cho người dân: http://localhost:8080
- Gửi và tra cứu phản ánh: http://localhost:8080/phan-anh
- Đăng nhập quản trị: http://localhost:8080/admin/login
- Quên mật khẩu quản trị: http://localhost:8080/admin/forgot-password
- Trung tâm điều hành sau đăng nhập: http://localhost:8080/admin
- Tiếp nhận phản ánh nội bộ: http://localhost:8080/admin/feedback
- Hồ sơ và bảo mật tài khoản: http://localhost:8080/admin/profile
- Nhật ký hệ thống (quản trị viên): http://localhost:8080/admin/audit-logs
- API: http://localhost:3000/api
- Kiểm tra sức khỏe API và kết nối cơ sở dữ liệu: http://localhost:3000/api/health
- PostgreSQL: localhost:5432

Tài khoản quản trị mẫu (chỉ được tạo khi bật `RUN_DEMO_SEED=true`):

- Tên đăng nhập: `admin`
- Mật khẩu khi seed môi trường mới: `Admin@12345`

Quy trình khởi tạo mới đã được kiểm tra từ volume PostgreSQL trống: seed tạo tài khoản `ADMIN` với `departmentId = NULL`, đúng phạm vi quản trị toàn hệ thống.

> Hãy đổi `JWT_SECRET`, `PASSWORD_RESET_PEPPER`, mật khẩu PostgreSQL và mật khẩu Admin trước khi triển khai thật. Docker nhận mật khẩu PostgreSQL dạng nguyên bản và tự mã hóa an toàn khi tạo chuỗi kết nối; nếu chạy API trực tiếp ngoài Docker, phần thông tin đăng nhập trong `DATABASE_URL` phải được percent-encode.

## Chức năng đã có

- Đăng nhập JWT và mô hình 4 vai trò: quản trị hệ thống, lãnh đạo đơn vị, cán bộ cập nhật và người dùng chỉ xem. API luôn kiểm tra lại vai trò, trạng thái tài khoản và phạm vi phòng ban.
- Cổng thông tin công khai không cần đăng nhập: mở trực tiếp tại kết quả thực hiện chỉ tiêu, hiển thị tối đa 6 chỉ tiêu nổi bật và cho phép xem toàn bộ chỉ tiêu đã công bố theo từng phòng ban bằng phân trang.
- API công khai được tách riêng, chỉ trả dữ liệu tổng hợp an toàn; toàn bộ nghiệp vụ nội bộ vẫn yêu cầu đăng nhập.
- Dashboard điều hành: tiến độ chung, cơ cấu trạng thái, tiến độ phòng ban, cảnh báo và lịch sử cập nhật. Tiến độ tổng hợp và tiến độ từng phòng ban được tính theo trọng số, nhất quán giữa dashboard nội bộ, cổng công khai và báo cáo Excel.
- Danh mục chỉ tiêu: mã được hệ thống tự cấp theo năm và đơn vị, không cho sửa sau khi tạo; quản trị viên có công tắc bật/tắt hiển thị trên trang người dân. Hệ thống còn hỗ trợ lọc, trọng số, chu kỳ, hạn hoàn thành, cập nhật kết quả, lưu trữ/khôi phục có kiểm soát và công bố bản chụp dữ liệu. Phiên bản dữ liệu nội bộ được tách khỏi phiên bản công bố để không làm hỏng báo cáo đang chờ duyệt. Năm mặc định và hạn cuối ngày được xác định theo múi giờ `Asia/Ho_Chi_Minh`.
- Quản lý tài khoản: tạo, chỉnh sửa thông tin/vai trò/phòng ban, khóa/mở khóa và đặt lại mật khẩu; có kiểm soát không tự khóa tài khoản quản trị đang dùng và luôn giữ tối thiểu một quản trị viên hoạt động. Tài khoản quản trị có phạm vi toàn hệ thống, không gắn cố định với phòng ban và phải chọn rõ đơn vị khi tạo chỉ tiêu hoặc xuất/nhập dữ liệu theo đơn vị.
- Quản lý phòng ban: tạo, chỉnh sửa và ngừng hoạt động có kiểm tra tài khoản, chỉ tiêu và phản ánh còn đang vận hành.
- Import Excel theo mô hình phiếu cập nhật: tải dữ liệu hiện có kèm trang hướng dẫn, chỉ sửa hai cột được tô màu, xem trước và kiểm tra xung đột rồi mới áp dụng. Bản nháp được ràng buộc với đúng người tạo; ghi nhận và cập nhật trạng thái lô chạy nguyên tử để tránh hai người duyệt làm lệch dữ liệu.
- Báo cáo chỉ tiêu, lọc phòng ban, in và xuất Excel.
- Kênh phản ánh công khai: người dân gửi phản ánh kèm tối đa 5 ảnh/PDF minh chứng, nhận mã hồ sơ và mã bảo mật, tra cứu tiến trình, tải hoặc bổ sung minh chứng, bổ sung thông tin, đánh giá kết quả hoặc đề nghị xem xét lại mà không cần tài khoản. Phản ánh mới được xếp đầu danh sách tiếp nhận. Khi chọn Email làm kênh liên hệ, hệ thống gửi thông báo lúc tiếp nhận và khi có cập nhật xử lý. Tệp được kiểm tra dung lượng, MIME và chữ ký nội dung; yêu cầu gửi lại do mất mạng được khôi phục nhất quán, không tạo hồ sơ hay tệp trùng.
- Quy trình xử lý phản ánh nội bộ: phân loại, phân công đơn vị/cán bộ, theo dõi riêng hạn cơ quan và hạn người dân bổ sung, ghi nhận lần liên hệ, trao đổi công khai hoặc ghi chú nội bộ, trình duyệt kết quả, đóng/mở lại và công bố kết quả đã ẩn danh. Khi công bố, tiêu đề/nội dung/kết quả được tự động lấy từ hồ sơ gốc, tạo thành bản chụp nhất quán và không yêu cầu nhập lại; quản trị viên còn xem trước các trao đổi đã đánh dấu cho người dân trước khi xác nhận. Người dân có thể mở trang chi tiết để xem toàn bộ tiến trình xử lý an toàn, trong khi ghi chú nội bộ và danh tính cán bộ không xuất hiện. Công bố bắt buộc xác nhận ẩn danh và còn được API dò tín hiệu dữ liệu cá nhân.
- Nhật ký hệ thống dành cho quản trị viên, hỗ trợ tìm kiếm và lọc theo thao tác, đối tượng, đơn vị, khoảng ngày; dữ liệu nhạy cảm được loại khỏi phần chi tiết hiển thị.
- Hồ sơ cá nhân cho mọi vai trò; đổi mật khẩu yêu cầu mật khẩu mạnh, cấp lại phiên hiện tại và thu hồi các phiên đăng nhập cũ.
- Khôi phục mật khẩu không cần đăng nhập bằng OTP 6 số gửi tới email công vụ đã đăng ký; OTP và token đặt lại chỉ lưu dưới dạng HMAC, có thời hạn, giới hạn số lần thử, dùng một lần và thu hồi toàn bộ phiên cũ sau khi hoàn tất. Mọi mã đang còn hiệu lực được vô hiệu hóa nguyên tử nếu tài khoản đổi mật khẩu, đổi email hoặc bị khóa.
- Giao diện responsive cho máy tính bảng và điện thoại.
- **Kho văn bản + trích xuất chỉ tiêu bằng AI cục bộ**: tải PDF (có chữ hoặc scan), DOCX, XLSX, ảnh;
  hệ thống kiểm tra chữ ký nội dung tệp, chống tải trùng theo SHA-256, cấp mã `VB-{năm}-{số}`;
  worker bất đồng bộ đọc text/OCR tiếng Việt, cắt đoạn rồi trích xuất chỉ tiêu bằng LLM local
  (kết hợp bộ luật tiếng Việt làm phương án dự phòng khi Ollama tắt). Mỗi đề xuất kèm câu trích
  nguyên văn được kiểm chứng lại với tài liệu, độ tin cậy từng trường, phòng ban được tự khớp tên
  và cảnh báo nghi trùng với chỉ tiêu hiện có.
- **Màn hình xác minh trích xuất**: đối chiếu văn bản gốc ↔ đề xuất (highlight câu trích), hiệu chỉnh
  từng trường, duyệt (tạo chỉ tiêu chính thức qua đúng luồng cấp mã, lưu vết văn bản nguồn) hoặc
  từ chối có lý do; trích xuất lại idempotent — không ghi đè đề xuất đã có người hiệu chỉnh.
  Toàn bộ thao tác AI đều vào nhật ký hệ thống.

## Nền tảng AI cục bộ

Lớp AI chạy hoàn toàn trên máy (không gọi dịch vụ ngoài). Cài một lần:

```powershell
winget install Ollama.Ollama
ollama pull qwen3:4b-instruct-2507-q4_K_M
ollama pull bge-m3
```

Docker image API đã cài sẵn Tesseract OCR tiếng Việt. API trong Docker mặc định gọi Ollama của máy host
qua `http://host.docker.internal:11434` (đổi bằng `OLLAMA_BASE_URL` trong `.env`). Khi Ollama không chạy,
hệ thống vẫn hoạt động: trích xuất tự hạ cấp về bộ luật tiếng Việt và ghi rõ phương pháp trên từng đề xuất.

Máy cấu hình thấp (GPU 4GB): model 4B Q4 chạy ~10 token/giây; một tài liệu 1–2 trang mất khoảng 3–4 phút
trích xuất trong nền. Sinh bộ tài liệu mẫu để thử: `python scripts/generate-sample-documents.py` → `samples/`.

## Cấu hình SMTP

Điền cấu hình thật trong file `.env` ở thư mục gốc dự án (không điền mật khẩu vào `.env.example` và không commit `.env`):

```dotenv
PASSWORD_RESET_PEPPER=chuoi-ngau-nhien-rieng-toi-thieu-32-ky-tu
SMTP_HOST=smtp.example.gov.vn
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=tai-khoan-smtp
SMTP_PASS=mat-khau-hoac-mat-khau-ung-dung
SMTP_FROM=IOC Lai Thieu <no-reply@example.gov.vn>
MAIL_OUTBOX_POLL_MS=5000
MAIL_OUTBOX_BATCH_SIZE=10
MAIL_OUTBOX_MAX_ATTEMPTS=8
PUBLIC_APP_URL=http://localhost:8080
```

Sau khi thay đổi cấu hình, dựng lại API:

```powershell
docker compose up -d --build api
```

Với môi trường triển khai thật, `PUBLIC_APP_URL` phải là URL HTTPS mà người dùng truy cập; không dùng `localhost`.

Email tiến độ phản ánh được ghi vào `MailOutbox` trong cùng giao dịch với lịch sử xử lý. Worker khóa từng lô khi có nhiều API, tự thử lại theo thời gian tăng dần và chuyển sang `DEAD_LETTER` sau số lần cấu hình; khi SMTP chưa được cấu hình, hàng chờ vẫn giữ nguyên. OTP khôi phục mật khẩu được gửi ngay khi yêu cầu; ở môi trường vận hành, thời gian phản hồi được làm đều để hạn chế dò tài khoản. Khi API tắt, hệ thống chờ tối đa 8 giây cho các thư OTP đang gửi và vô hiệu hóa challenge còn treo trước khi ngắt cơ sở dữ liệu.

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

Các lệnh `qa:*` yêu cầu PostgreSQL và API đang chạy tại cấu hình cục bộ. Mỗi kịch bản tự tạo tài khoản và dữ liệu kiểm thử bằng ID riêng, luôn dọn người dùng, dữ liệu nghiệp vụ và nhật ký tương ứng, rồi mới báo thành công; không sử dụng hoặc làm thay đổi thời điểm đăng nhập của tài khoản demo.

Mốc double-check gần nhất (22/07/2026):

- `npm test`: **76/76** kiểm thử đơn vị đạt, gồm tính tiến độ/trạng thái, mã chỉ tiêu tự sinh duy nhất toàn hệ thống, phân trang công khai ổn định, cấu hình SMTP, outbox email có retry/dead-letter, khôi phục mật khẩu và vô hiệu hóa OTP/token cũ, graceful shutdown thư đang gửi, tổng hợp theo trọng số, chính sách ẩn danh và kiểm tra tệp minh chứng.
- `npm run qa:access`: **35/35** kiểm thử đạt, bao phủ đăng nhập, phân quyền/phạm vi phòng ban, ràng buộc quản trị, mã chỉ tiêu do máy chủ cấp, bật/tắt công khai, lưu trữ chỉ tiêu và thu hồi token.
- `npm run qa:feedback`: **80/80** kiểm thử đạt, bao phủ gửi/tra cứu phản ánh, ảnh/PDF minh chứng, kiểm tra tệp và phân quyền tải, chống gửi trùng, phân công, SLA chờ bổ sung, sắp xếp hồ sơ mới nhất, đóng/mở lại, đánh giá, công bố tự động từ hồ sơ gốc, chi tiết tiến trình công khai, chống xung đột và che dữ liệu.
- `npm run qa:import`: **8/8** kiểm thử end-to-end đạt, bao phủ tải phiếu Excel hiện hành, xem trước, phát hiện phạm vi/xung đột, áp dụng dữ liệu và đối soát kết quả.
- Ba bộ `qa:*` đã chạy đạt trong vòng kiểm tra hiện tại; hậu kiểm cơ sở dữ liệu xác nhận không còn tài khoản, chỉ tiêu, phản ánh, batch, cập nhật hoặc nhật ký QA.
- `npm run build` đạt cho cả API và web; vòng kiểm tra giao diện bao phủ trang công khai, gửi/tra cứu phản ánh và toàn bộ màn hình quản trị trên desktop lẫn kích thước di động, gồm điều hướng, tabs, bàn phím/focus, thông báo lỗi/thử lại, bảng cuộn ngang và cột thao tác cố định.

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
- Tích hợp Zalo OA cho các thông báo cần giao nhận bảo đảm và màn hình vận hành để theo dõi/thử lại các thư `DEAD_LETTER`.
- Tích hợp công cụ quét mã độc và vùng cách ly tệp chuyên dụng trước khi triển khai nhận minh chứng trên Internet thật.
- Đồng bộ IOC, dịch vụ công, ngân sách và các dashboard chuyên ngành qua API.
- Khi chạy nhiều API song song, chuyển bộ giới hạn tần suất từ bộ nhớ tiến trình sang Redis; triển khai công khai thật phải đặt sau HTTPS và reverse proxy tin cậy.
