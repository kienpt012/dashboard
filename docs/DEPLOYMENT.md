# Triển khai và môi trường phát triển

## 0. Triển khai cho một địa phương thật (không dữ liệu mẫu)

```bash
cp .env.example .env            # đặt POSTGRES_PASSWORD, JWT_SECRET (≥32 ký tự)
docker compose up -d --build
docker compose exec -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD='<mật-khẩu-mạnh>' api ./docker-entrypoint.sh bootstrap
```

Lệnh `bootstrap` áp dụng migration rồi chỉ tạo **tài khoản quản trị đầu tiên** (bỏ qua nếu đã có quản trị viên đang
hoạt động). Sau đó đăng nhập `/admin/login` → **Thiết lập địa phương** (`/admin/thiet-lap`): thông tin đơn vị, mẫu cơ cấu
tổ chức, bộ chỉ tiêu từ thư viện, thời hạn trách nhiệm → tạo tài khoản lãnh đạo, văn thư, trưởng phòng, chuyên viên.
Không chạy `seed` trên máy của địa phương thật: dữ liệu mẫu là một phường giả lập.

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
| `OLLAMA_EMBED_MODEL` | `bge-m3` | Model nhúng tên chỉ tiêu để tìm trùng và gợi ý mã (B11–B14) |
| `OLLAMA_KEEP_ALIVE` / `OLLAMA_THINK` | 30m / (trống) | Giữ model nạp sẵn; `false` gửi `think:false` cho model có bước suy nghĩ |
| `OLLAMA_TIMEOUT_MS` / `OLLAMA_NUM_CTX` | 480000 / 4096 | Timeout và context |
| `OLLAMA_HEALTH_TIMEOUT_MS` | 10000 | Job trích xuất hỏi Ollama tối đa 3 lần, mỗi lần chờ chừng này, rồi mới chuyển sang bộ luật |
| `EXTRACTION_MAX_LLM_CHUNKS` | 40 | Số chunk tối đa gửi qua LLM trong một tài liệu |
| `EXTRACTION_RECHECK_MAX` | 10 | Kiểm tra đủ mục: số lần tối đa hỏi lại Qwen cho các mục đánh số còn thiếu trong một văn bản; 0 = chỉ ghi chú |
| `EXTRACTION_LLM_CACHE_DAYS` | 90 | Số ngày nhớ kết quả Qwen theo đoạn; "Đọc lại" chỉ gọi Qwen cho đoạn, prompt hoặc model đã đổi. 0 = tắt |
| `EXTRACTION_TABLE_READER` | true | Bảng đã có hàng, cột (phụ lục, biểu giao chỉ tiêu, Excel) được đọc bằng code thay vì gửi Qwen (D-022); `false` để tắt |
| `EXTRACTION_RULE_FILL_IN` | false | `true` thì đoạn Qwen đã đọc vẫn thêm ứng viên luật mà Qwen không có (D-007 cũ, xem D-016) |
| `EXTRACTION_POLL_MS` / `EXTRACTION_MAX_ATTEMPTS` / `EXTRACTION_MAX_OCR_PAGES` | 4000 / 3 / 0 | Cấu hình worker; trần trang OCR của bộ đọc dự phòng, 0 = không giới hạn |
| `OCR_SERVICE_URL` | (trống) | `http://ocr:8000` để đọc văn bản bằng ocr-service (Docling + VietOCR); trống thì dùng pdf.js + Tesseract |
| `OCR_SERVICE_PAGE_BATCH` / `OCR_SERVICE_TIMEOUT_MS` | 4 / 900000 | Số trang mỗi lần gọi ocr-service và thời gian chờ mỗi lô (CPU: 40–50 giây mỗi trang scan) |
| `CHUNK_TARGET_CHARS` / `CHUNK_TABLE_FORMAT` | 1400 / plain | Độ dài đoạn gửi Qwen (B7), cách viết bảng |
| `MATCH_DUPLICATE_THRESHOLD` / `MATCH_NEAR_THRESHOLD` | 0.95 / 0.85 | Ngưỡng cosine trùng / gần trùng (B14) |
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

**pgvector (B13–B14, quyết định D-015)**: không đổi sang image `pgvector/pgvector:pg17` (Debian), vì đổi musl → glibc làm sai lệch collation index của volume hiện có. Thay vào đó `deploy/postgres/Dockerfile` biên dịch pgvector 0.8.7 trên chính `postgres:17-alpine`, nên volume cũ dùng tiếp, không cần dump/restore. Lần deploy đầu sau khi gộp, `docker compose up` tự build image `…-db:pg17-pgvector-0.8.7` (cần Internet để tải mã pgvector) và khởi động lại container Postgres. Migration `20261101090000_document_pipeline_v2` bật extension và tạo hai chỉ mục HNSW `vector_cosine_ops` nếu Postgres có pgvector; chưa có thì bỏ qua và API so trùng bằng cosine trong bộ nhớ.

**ocr-service (B2–B6)**: dịch vụ Python trong profile `ocr`, mặc định không chạy. Bật bằng `COMPOSE_PROFILES=ocr` và `OCR_SERVICE_URL=http://ocr:8000` trong `.env`. Image tải sẵn mô hình lúc build (vài GB, cần Internet), khi chạy chỉ nằm trong mạng nội bộ `ocr_internal` không ra được Internet. Chi tiết: [services/ocr/README.md](../services/ocr/README.md). API gọi `/parse` theo lô 8 trang, gia hạn lease sau mỗi lô; dịch vụ tắt hoặc lỗi thì API dùng bộ đọc dự phòng và ghi rõ trên lượt xử lý.

## 4. Lưu ý vận hành

- Worker trích xuất chạy trong tiến trình API: restart API giữa chừng thì job được claim lại sau lease 10 phút (an toàn nhưng chậm — KNOWN_ISSUES #13).
- Tesseract được tiến trình API gọi theo từng job; không chạy `tesseract serve` và không cần mở thêm cổng.
- Tài liệu lưu Bytes trong Postgres (≤25MB/tệp, D-008): sao lưu DB là sao lưu luôn kho văn bản; production nên chuyển object storage.
- Đổi `JWT_SECRET`, mật khẩu Postgres, `PASSWORD_RESET_PEPPER` trước khi triển khai thật (xem `README.md`); không commit `.env`.
