# Triển khai và môi trường phát triển

## 1. Môi trường dev cục bộ (đang dùng)

Yêu cầu: Node.js 22, Docker Desktop và Ollama. Tesseract 5 cùng dữ liệu ngôn ngữ `vie+eng` đã nằm trong image API khi chạy Docker, không cần cài hay khởi động service OCR trên host.

Khởi động đầy đủ bằng một lệnh tại thư mục dự án:

```powershell
npm run start:ioc
# hoặc nhấp đúp start-ioc.cmd
```

Launcher kiểm tra/khởi động Ollama, kiểm tra hai model, khởi động Docker Desktop nếu cần, dựng stack và kiểm tra AI/OCR từ bên trong container API. Nếu source và image không thay đổi, dùng `npm run start:ioc:fast` để chạy lại stack mà không build.

```bash
# 1) Cài dependency + sinh Prisma client (KHÔNG có postinstall hook)
npm install
npm run db:generate

# 2) DB dev riêng — KHÔNG đụng DB demo ioc_laithieu đang chạy
#    Postgres container ioc-laithieu-db, database: ioc_laithieu_dev
#    (migration: npx prisma migrate deploy với DATABASE_URL trỏ DB dev)
#    Seed demo khi cần:
RUN_DEMO_SEED=true ALLOW_DEMO_SEED=true npx tsx prisma/seed.ts

# 3) Ollama: model lưu tại F:\ollama-models (env user OLLAMA_MODELS)
#    cùng OLLAMA_FLASH_ATTENTION=1 và OLLAMA_KV_CACHE_TYPE=q8_0
ollama serve
ollama pull qwen3:4b-instruct-2507-q4_K_M
ollama pull bge-m3

# 4) API dev trên cổng riêng
#    PORT=3100 + biến môi trường AI (xem bảng dưới)

# 5) Tài liệu mẫu để thử pipeline
python scripts/generate-sample-documents.py   # → samples/
```

Biến môi trường của lớp AI (đọc trong `ollama.ts`, `document-processing.ts`, `extraction-worker.ts`):

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `TESSERACT_PATH` | `tesseract` | Đường dẫn tesseract.exe |
| `TESSDATA_DIR` | (trống) | Thư mục traineddata — máy dev: `F:\tessdata` |
| `TESSERACT_LANGS` | `vie+eng` | Ngôn ngữ OCR |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Endpoint Ollama |
| `OLLAMA_EXTRACT_MODEL` | `qwen3:4b-instruct-2507-q4_K_M` | Model trích xuất |
| `OLLAMA_EMBED_MODEL` | `bge-m3` | Model embedding đã chuẩn bị cho RAG; ứng dụng hiện chưa gọi |
| `OLLAMA_TIMEOUT_MS` / `OLLAMA_NUM_CTX` | 480000 / 4096 | Timeout và context |
| `EXTRACTION_MAX_LLM_CHUNKS` | 40 | Số chunk tối đa gửi qua LLM trong một tài liệu |
| `EXTRACTION_POLL_MS` / `EXTRACTION_MAX_ATTEMPTS` / `EXTRACTION_MAX_OCR_PAGES` | 4000 / 3 / 20 | Cấu hình worker |
| `DISABLE_EXTRACTION_WORKER` | (trống) | `true` để tắt worker (chạy test/API thuần) |

Kiểm tra: `npm run build`, `npm test` (**103/103** test), API `http://localhost:3100/api/health`.

## 2. Docker Compose hiện tại

`docker-compose.yml` gồm 3 service: `postgres` (postgres:17-alpine, volume `ioc_postgres_data`), `api` (migration tự chạy khi khởi động), `web` (nginx, cổng 8080, proxy `/api/`). Healthcheck xếp tầng: web chờ api, api chờ postgres. Nhánh AI/OCR đã được dựng và chạy thành công tại `http://localhost:8080`; schema hiện có **27 migration**.

API container kết nối Ollama `0.32.4` đang chạy trên Windows host qua `http://host.docker.internal:11434`. Compose truyền các mặc định đã kiểm chứng:

- `OLLAMA_EXTRACT_MODEL=qwen3:4b-instruct-2507-q4_K_M`
- `OLLAMA_EMBED_MODEL=bge-m3`
- `OLLAMA_TIMEOUT_MS=480000`
- `OLLAMA_NUM_CTX=4096`
- `EXTRACTION_MAX_LLM_CHUNKS=40`
- `TESSERACT_LANGS=vie+eng`

`qwen3:4b-instruct-2507-q4_K_M` đang được ứng dụng gọi cho cả trích xuất chỉ tiêu và IOC Copilot. `bge-m3:latest` đã cài và đã kiểm thử vector 1024 chiều, nhưng chưa được ứng dụng gọi cho đến giai đoạn RAG. Tesseract cùng dữ liệu `vie+eng` nằm trong image API và được gọi theo từng job, không phải service cần khởi động riêng.

Các màn hình AI sau đăng nhập:

- Kho văn bản và xác minh trích xuất: `http://localhost:8080/admin/documents`
- IOC Copilot: `http://localhost:8080/admin/copilot`

`GET /api/health` chủ ý chỉ kiểm tra API và kết nối cơ sở dữ liệu để cơ chế hạ cấp khi Ollama tạm dừng vẫn hoạt động. `npm run start:ioc` và `start-ioc.cmd` kiểm tra thêm khả năng container API kết nối Ollama cũng như sự hiện diện của `vie`, `eng` trong Tesseract.

## 3. Kiến trúc AI Docker hiện tại và hướng RAG

**Kết nối Ollama từ container API** dùng mô hình Ollama chạy trên host để tận dụng trực tiếp GPU Windows; Compose không tạo một container Ollama thứ hai. Launcher một chạm chịu trách nhiệm khởi động Ollama và kiểm tra model trước khi bàn giao hệ thống ở trạng thái sẵn sàng.

**pgvector (giai đoạn RAG — quyết định D-005)**: đổi image `postgres:17-alpine` → `pgvector/pgvector:pg17` là thao tác **phá vỡ volume hiện có** (musl → glibc làm sai lệch collation index). Quy trình bắt buộc: `pg_dump` toàn bộ dữ liệu → dừng stack → xóa/tạo volume mới → khởi động image pgvector → `restore` → chạy migration bật extension + thêm cột vector cho `DocumentChunk`. Chỉ thực hiện cùng lúc với giai đoạn 7, kèm hướng dẫn chi tiết tại thời điểm đó.

## 4. Lưu ý vận hành

- Worker trích xuất chạy trong tiến trình API: restart API giữa chừng thì job được claim lại sau lease 10 phút (an toàn nhưng chậm — KNOWN_ISSUES #13).
- Tesseract được tiến trình API gọi theo từng job; không chạy `tesseract serve` và không cần mở thêm cổng.
- Tài liệu lưu Bytes trong Postgres (≤25MB/tệp, D-008): sao lưu DB là sao lưu luôn kho văn bản; production nên chuyển object storage.
- Đổi `JWT_SECRET`, mật khẩu Postgres, `PASSWORD_RESET_PEPPER` trước khi triển khai thật (xem `README.md`); không commit `.env`.
