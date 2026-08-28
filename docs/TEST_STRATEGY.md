# Chiến lược kiểm thử

Hệ thống được kiểm tra theo nhiều lớp, từ logic độc lập đến luồng nghiệp vụ và giao diện hoàn chỉnh. Mỗi thay đổi cần chạy các lớp phù hợp với phạm vi ảnh hưởng; thay đổi dùng chung hoặc trước khi phát hành phải chạy kiểm thử API và build toàn bộ dự án.

## 1. Unit test

Unit test của API nằm trong `apps/api/test/` và dùng `node:test` qua `tsx`. Các bài kiểm tra tập trung vào:

- phân quyền, xác thực, kiểm tra dữ liệu đầu vào và chuyển trạng thái nghiệp vụ;
- xử lý tài liệu, OCR, trích xuất bằng luật và làm sạch kết quả từ mô hình AI;
- đối sánh dữ liệu, khóa lạc quan, nhật ký hệ thống và các quy tắc an toàn;
- cấu hình và tổng hợp dữ liệu cho dashboard công khai.

Các dependency như Prisma được thay bằng mock khi kiểm tra logic độc lập. Chạy toàn bộ unit test bằng:

```powershell
npm test
```

## 2. Build và kiểm tra kiểu

Build xác nhận API NestJS và ứng dụng React/Vite biên dịch được với cấu hình production. Sau khi cài dependency, cần sinh Prisma Client trước khi test hoặc build:

```powershell
npm ci
npm run db:generate
npm run build
```

Quy trình CI trên GitHub chạy lần lượt cài dependency, sinh Prisma Client, unit test và build cho mỗi pull request và mỗi lần đẩy lên nhánh `main`.

## 3. QA API và nghiệp vụ

Các bộ QA gọi API đang chạy, sử dụng PostgreSQL và kiểm tra trọn luồng nghiệp vụ. Mặc định API được truy cập tại `http://localhost:3000/api`; có thể đổi bằng biến `QA_API_URL`. Các script tạo dữ liệu QA riêng, kiểm tra kết quả và dọn dữ liệu sau khi hoàn tất.

| Lệnh | Phạm vi |
|---|---|
| `npm run qa:access` | Đăng nhập, phân quyền, phạm vi đơn vị và an toàn phiên |
| `npm run qa:feedback` | Tiếp nhận, xử lý, công bố và tra cứu phản ánh |
| `npm run qa:import` | Tải mẫu, xem trước và áp dụng dữ liệu Excel |
| `npm run qa:documents` | Tải tài liệu, xử lý, xác minh đề xuất và lưu nguồn gốc |

Trước khi chạy, khởi động API và PostgreSQL, đồng thời cung cấp `POSTGRES_PASSWORD` hoặc `DATABASE_URL` phù hợp với môi trường QA.

## 4. Kiểm tra trình duyệt

Kiểm tra trình duyệt bao phủ các luồng chính ở cổng công khai và khu vực quản trị, gồm:

- điều hướng, phân quyền và trạng thái chưa đăng nhập;
- thao tác tạo, sửa, duyệt, công bố và tra cứu dữ liệu;
- trạng thái tải, rỗng, lỗi và xung đột phiên bản;
- hiển thị trên desktop, tablet và mobile;
- thao tác bàn phím, focus, cuộn ngang và lỗi trong console.

Kịch bản trình diễn chuẩn được mô tả tại [DEMO_SCRIPT.md](DEMO_SCRIPT.md). Ảnh chụp và dữ liệu QA theo từng lần chạy là artefact cục bộ, không phải tài liệu nguồn của dự án.

## 5. Benchmark AI/OCR

Benchmark dùng dataset có version trong `eval/dataset-v1/` để so sánh `rule`, `llm` và `hybrid`. Script chạy trực tiếp trên module API đã build, sau đó xuất JSON và CSV gồm precision, recall, F1, độ chính xác từng trường và thời gian xử lý.

```powershell
npm run build -w @ioc/api
node scripts/benchmark-extraction.mjs --methods rule,llm,hybrid
```

Các phương án dùng LLM cần Ollama hoạt động; tài liệu ảnh hoặc PDF scan cần cấu hình Tesseract. Benchmark tách khỏi `npm test` vì phụ thuộc runtime cục bộ và có thể chạy lâu. Kết quả đã chọn để công bố được tổng hợp trong [experiments/results.md](experiments/results.md).
