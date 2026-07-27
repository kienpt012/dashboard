# Triển khai và môi trường phát triển

## 1. Môi trường dev cục bộ (đang dùng)

Yêu cầu: Node 24, Docker (cho Postgres), Ollama, Tesseract 5 + gói ngôn ngữ `vie`.

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
| `OLLAMA_EMBED_MODEL` | `bge-m3` | Model embedding |
| `OLLAMA_TIMEOUT_MS` / `OLLAMA_NUM_CTX` | 240000 / 4096 | Timeout và context |
| `EXTRACTION_POLL_MS` / `EXTRACTION_MAX_ATTEMPTS` / `EXTRACTION_MAX_OCR_PAGES` | 4000 / 3 / 20 | Cấu hình worker |
| `DISABLE_EXTRACTION_WORKER` | (trống) | `true` để tắt worker (chạy test/API thuần) |

Kiểm tra: `npm run build`, `npm test` (76 test), API `http://localhost:3100/api/health`.

## 2. Docker Compose hiện tại

`docker-compose.yml` gồm 3 service: `postgres` (postgres:17-alpine, volume `ioc_postgres_data`), `api` (migration tự chạy khi khởi động), `web` (nginx, cổng 8080, proxy `/api/`). Healthcheck xếp tầng: web chờ api, api chờ postgres. **Compose hiện chưa có bất kỳ cấu hình AI nào** — các thay đổi dưới đây là kế hoạch (TASKS.md giai đoạn 2–5, mục ☐).

## 3. Thay đổi Docker dự kiến (kế hoạch — chưa áp dụng)

**Kết nối Ollama từ container api** — hai phương án:

- **Phương án A (khuyến nghị cho máy dev Windows/GPU)**: Ollama chạy trên host, container api trỏ `OLLAMA_BASE_URL=http://host.docker.internal:11434`. Ưu: Ollama dùng GPU host trực tiếp, không đổi image. Nhược: phụ thuộc dịch vụ ngoài Compose.
- **Phương án B**: thêm service `ollama` vào Compose (image chính thức + volume model). Ưu: tự chứa; nhược: GPU passthrough trên Docker Desktop Windows phức tạp, dễ rơi về CPU chậm.

**Tesseract trong image api**: Dockerfile api (node:alpine) cần cài `tesseract-ocr` + `tesseract-ocr-data-vie` qua apk và đặt `TESSERACT_PATH`/`TESSDATA_DIR` tương ứng — nếu không, pipeline trong Docker chỉ xử lý được tài liệu có text layer (OCR sẽ lỗi).

**pgvector (giai đoạn RAG — quyết định D-005)**: đổi image `postgres:17-alpine` → `pgvector/pgvector:pg17` là thao tác **phá vỡ volume hiện có** (musl → glibc làm sai lệch collation index). Quy trình bắt buộc: `pg_dump` toàn bộ dữ liệu → dừng stack → xóa/tạo volume mới → khởi động image pgvector → `restore` → chạy migration bật extension + thêm cột vector cho `DocumentChunk`. Chỉ thực hiện cùng lúc với giai đoạn 7, kèm hướng dẫn chi tiết tại thời điểm đó.

## 4. Lưu ý vận hành

- Worker trích xuất chạy trong tiến trình API: restart API giữa chừng thì job được claim lại sau lease 10 phút (an toàn nhưng chậm — KNOWN_ISSUES #13).
- Tài liệu lưu Bytes trong Postgres (≤25MB/tệp, D-008): sao lưu DB là sao lưu luôn kho văn bản; production nên chuyển object storage.
- Đổi `JWT_SECRET`, mật khẩu Postgres, `PASSWORD_RESET_PEPPER` trước khi triển khai thật (xem `README.md`); không commit `.env`.
