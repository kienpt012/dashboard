# IOC — Trung tâm điều hành thông minh cấp xã

Hệ thống điều hành cho UBND xã, phường, đặc khu theo hướng **"từ dữ liệu đến trách nhiệm"**: số liệu được lấy từ kho
dữ liệu nghiệp vụ hoặc do cán bộ báo cáo kèm minh chứng, gom thành các bộ chỉ tiêu, hiển thị trên màn hình điều hành,
và mọi việc chờ đều có hạn, có người chịu trách nhiệm. Cài cho địa phương nào cũng được: tên đơn vị, cơ cấu tổ chức
và bộ chỉ tiêu được chọn qua trình thiết lập, không viết cứng trong mã nguồn.

## Tính năng

- **Trung tâm điều hành**: theo từng bộ chỉ tiêu và từng phòng — đạt, nguy cơ, quá hạn, thiếu báo cáo kỳ, việc bị treo,
  luồng cảnh báo, độ mới dữ liệu; **trình chiếu phòng họp** toàn màn hình tự chuyển trang.
- **Bộ chỉ tiêu** nhiều loại (kế hoạch, chấm điểm, nhiệm vụ, thống kê), nạp từ thư viện mẫu có căn cứ pháp lý:
  55 chỉ tiêu thống kê cấp xã (Thông tư 148/2026/TT-BTC), mẫu KT-XH và chuyển đổi số (DTI) của TP.HCM.
- **Hồ sơ chỉ tiêu ba phần**: chỉ đạo điều hành – thực hiện (số liệu theo kỳ, nguồn, minh chứng, giải trình) – đánh giá;
  chỉ tiêu cha–con; phiếu nguồn số liệu; dòng thời gian trách nhiệm.
- **Kho dữ liệu** và **chỉ tiêu tự tính** bằng công thức khai báo, có dấu vết tới từng dòng dữ liệu; nhập Excel theo mẫu.
- **Cơ chế trách nhiệm**: giao việc tới chuyên viên, giới hạn số lần chuyển việc, tự thông qua báo cáo/đề xuất khi người
  duyệt để quá hạn (ghi trách nhiệm), nhắc việc, yêu cầu giải trình, thông báo, màn hình trách nhiệm người đứng đầu.
- **Đề xuất chỉ tiêu** từ AI (trích xuất văn bản, OCR, chạy cục bộ) và từ cán bộ; kết quả AI phải có người rà soát và trình.
- Phản ánh của người dân, cổng công khai, Public Dashboard Studio, xuất Excel, nhật ký hệ thống, nút **báo lỗi** kèm
  địa chỉ trang trên mọi màn hình.

**Công nghệ:** React, Vite, NestJS, Prisma, PostgreSQL, Ollama (Qwen3, bge-m3), Tesseract, Docker Compose, Nginx.

Tài liệu nghiệp vụ bản 2: [phân tích yêu cầu](docs/requirements/01-phan-tich-yeu-cau-khach-hang.md) ·
[thiết kế](docs/requirements/02-thiet-ke-ioc-v2.md) · [quyết định D-009…D-014](docs/DECISIONS.md).

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
7. Nạp bộ dữ liệu mẫu nếu cơ sở dữ liệu trống (máy đang dùng bộ mẫu đời trước thì thay bằng bộ mới) và in tài khoản đăng nhập.

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

Bộ dữ liệu mẫu (`apps/api/prisma/demo/`) mô phỏng phường Lái Thiêu (TP.HCM) vận hành từ tháng 01 đến giữa tháng 10/2026:

- **Văn bản thật trong kho**: Quyết định 333/QĐ-UBND ngày 15/01/2026 của UBND Thành phố và 3 phụ lục (phụ lục 2 giao chỉ
  tiêu cho 168 xã, phường, đặc khu — 336 trang). Bộ chỉ tiêu KT-XH gắn với phụ lục 2; mở hồ sơ một chỉ tiêu là xem được
  đúng dòng của nó trong văn bản (hệ thống tự định vị trong phần của phường).
- **Hoạt động mô phỏng**: giao việc đầu năm, gần 300 lượt báo cáo số liệu theo kỳ kèm minh chứng PDF, duyệt/trả lại,
  văn bản chỉ đạo, yêu cầu giải trình, đánh giá 6 tháng và quý III, phản ánh của người dân ở mọi trạng thái xử lý.
  Mọi số liệu thực hiện, văn bản của phường và minh chứng là **mô phỏng** (minh chứng có ghi rõ trên trang).

Tệp gốc (văn bản, minh chứng) nằm trong `prisma/demo/tep/` theo mã băm nội dung; nội dung còn lại trong `du-lieu-mau.json.gz`.
Người phát triển cập nhật bộ mẫu từ một cơ sở dữ liệu demo bằng `npx tsx prisma/demo/export.ts` (thư mục `apps/api`).

| Tài khoản | Vai trò | Dùng để thử |
|---|---|---|
| `admin` | Quản trị hệ thống | Thiết lập địa phương, tài khoản, cấu hình, báo lỗi |
| `chu.tich`, `pho.chu.tich` | Lãnh đạo UBND | Trung tâm điều hành, duyệt đề xuất, đánh giá, yêu cầu giải trình |
| `van.thu` | Văn thư | Tiếp nhận văn bản, rà soát và trình đề xuất AI |
| `chanh.vp`, `lan.anh`, `manager.vhxh`, `manager.ttcc`, `truong.ca`, `chihuy.qs` | Trưởng phòng, đơn vị | Giao việc, duyệt số liệu, trả lời giải trình |
| `staff.ktht`, `thao.ktht`, `staff.vhxh`, `staff.ttcc`, `staff.vp`, `canbo.ca` | Chuyên viên | Báo cáo số liệu kèm minh chứng, đề xuất chỉ tiêu |
| `viewer.ktht` | Người xem | Chỉ xem số liệu của phòng |

Mật khẩu: `DEMO_ADMIN_PASSWORD` (tài khoản `admin`) và `DEMO_USER_PASSWORD` (các tài khoản khác) trong `.env`.
Đổi mật khẩu quản trị sau lần đăng nhập đầu tiên.

## Mang sang địa phương khác

1. Cài như mục trên nhưng **không** chạy lệnh tạo dữ liệu mẫu; chỉ tạo tài khoản quản trị đầu tiên:
   `docker compose exec -e ADMIN_PASSWORD='<mật-khẩu-mạnh>' api ./docker-entrypoint.sh bootstrap`
   ([hướng dẫn triển khai](docs/DEPLOYMENT.md#0-triển-khai-cho-một-địa-phương-thật-không-dữ-liệu-mẫu)).
2. Đăng nhập quản trị, mở **Thiết lập địa phương** (`/admin/thiet-lap`): khai thông tin đơn vị → chọn mẫu cơ cấu tổ chức
   (xã, phường, đặc khu, trường học… rồi sửa tự do) → chọn bộ chỉ tiêu từ thư viện → đặt thời hạn trách nhiệm → áp dụng.
3. Tạo tài khoản lãnh đạo, văn thư, trưởng phòng, chuyên viên; trưởng phòng giao chỉ tiêu cho chuyên viên.
4. Bộ chỉ tiêu riêng của tỉnh chưa có trong thư viện: tạo bộ mới ở **Bộ chỉ tiêu** rồi nhập chỉ tiêu, hoặc bổ sung một
   mẫu trong `apps/api/src/templates/` (xem các mẫu có sẵn và test `apps/api/test/ioc-v2.test.ts`).

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
| `.\start-ioc.cmd` | Khởi động; tự cập nhật bản mới từ GitHub, build lại và áp dụng migration mới |
| `.\start-ioc.cmd -SkipBuild` | Khởi động nhanh bằng image đã build (vẫn build khi vừa có bản mới) |
| `.\start-ioc.cmd -NoUpdate` | Không tự cập nhật từ GitHub trong lần chạy này |
| `.\start-ioc.cmd -CheckOnly` | Chỉ kiểm tra điều kiện, không thay đổi gì |
| `.\start-ioc.cmd -NoAI` | Không dùng Ollama; trích xuất bằng bộ luật |
| `.\start-ioc.cmd -SkipModelPull` | Không tải model AI còn thiếu |
| `.\start-ioc.cmd -Yes` | Tự đồng ý các câu hỏi, trừ xoá dữ liệu |
| `.\start-ioc.cmd -NoBrowser -NoPause` | Không mở trình duyệt, không chờ nhấn phím khi kết thúc |
| `.\start-ioc.cmd -ResetData` | Xoá toàn bộ dữ liệu và khởi tạo lại; yêu cầu gõ tên dự án để xác nhận |
| `.\stop-ioc.cmd` | Dừng IOC, Ollama và Docker Desktop; dữ liệu được giữ nguyên |
| `.\stop-ioc.cmd -KeepDocker -KeepAI` | Chỉ dừng container IOC |

Không dùng `docker compose down -v`: lệnh này xoá volume dữ liệu.

### Cập nhật lên bản mới

Chỉ cần chạy lại `start-ioc.cmd`. Mỗi lần khởi động, trình khởi động tự:

1. Kiểm tra GitHub và tải bản mới nhất của nhánh đang dùng (`git pull` dạng tua nhanh) — không ghi đè tệp bạn tự sửa;
2. Bổ sung vào `.env` các cấu hình mới (giữ nguyên mật khẩu, khoá bí mật và giá trị bạn đã đặt);
3. Build lại image và áp dụng migration cơ sở dữ liệu mới — dữ liệu, tài khoản được giữ nguyên;
4. Máy đang dùng bộ dữ liệu mẫu đời trước: hỏi rồi thay bằng bộ mẫu mới (dữ liệu thật của địa phương không bao giờ bị đụng tới).

Không muốn tự cập nhật trong một lần chạy: `.\start-ioc.cmd -NoUpdate`. Máy chỉ dùng thử và muốn có bộ dữ liệu mẫu mới:
`.\start-ioc.cmd -ResetData` (xoá toàn bộ dữ liệu, hỏi xác nhận trước). Sau khi nâng cấp từ bản 1, vào **Thiết lập địa phương**
để khai thông tin đơn vị nếu màn hình điều hành nhắc.

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
