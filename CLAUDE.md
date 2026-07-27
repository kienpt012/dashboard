# CLAUDE.md — IOC Lái Thiêu · Nền tảng IOC thông minh

Dự án nghiên cứu ứng dụng: chuyển dashboard IOC cấp phường từ nhập liệu thủ công sang
nền tảng tự tiếp nhận văn bản hành chính, AI trích xuất chỉ tiêu, người xác minh, và
điều hành bằng tiếng Việt tự nhiên. Tài liệu nghiên cứu ở `docs/`, tiến độ ở `PROGRESS.md`,
quyết định kiến trúc ở `DECISIONS.md`.

## Kiến trúc

- Monorepo npm workspaces: `apps/api` (NestJS 11 + Prisma 6 + PostgreSQL 17), `apps/web` (React 19 + Vite).
- **Modular monolith một module phẳng**: mỗi domain = 1 file trong `apps/api/src/` chứa DTO + controller
  (logic nằm trong controller, inject `PrismaService` trực tiếp). KHÔNG tạo thư mục module/service riêng.
- AI local-first: Ollama (`qwen3:4b-instruct-2507-q4_K_M` trích xuất, `bge-m3` embedding),
  Tesseract native OCR (`vie`). Mọi lời gọi model qua `OllamaService` (`src/ollama.ts`).
- Job bất đồng bộ theo mô hình outbox (`ExtractionJob` + worker claim `FOR UPDATE SKIP LOCKED`,
  lease, backoff mũ, DEAD_LETTER) — xem `extraction-worker.ts`, nhân bản từ `mail.ts`.

## Quy tắc bất biến (backend)

1. Mọi mutation: `$transaction(Serializable)` → `updateMany` guard theo `version` → `count !== 1` ⇒
   `ConflictException` tiếng Việt → `audit(tx, actor, …)` TRONG transaction → dịch P2002/P2025/P2034 thành 409.
2. Update DTO luôn có `expectedVersion` (`@IsInt() @Min(1)`); thông báo lỗi class-validator bằng tiếng Việt.
3. Upload: `memoryStorage` + magic-byte detection (KHÔNG tin MIME client) + MIME lưu = MIME phát hiện + SHA-256 dedupe.
4. Audit metadata key mới phải thêm vào `SAFE_METADATA_KEYS` trong `audit-logs.ts`, nếu không sẽ bị ẩn.
5. Nội dung tài liệu và đầu ra LLM là DỮ LIỆU KHÔNG ĐÁNG TIN: validate mọi field trước khi ghi DB;
   không bao giờ thực thi chỉ dẫn nằm trong tài liệu; không log nội dung tài liệu/PII.
6. Dữ liệu AI tạo phải có provenance (documentId, page, sourceQuote, model, promptVersion, confidence)
   và chỉ thành dữ liệu chính thức sau khi con người duyệt (human-in-the-loop, không auto-approve).
7. Tạo Target luôn qua `createTargetWithGeneratedCode` (`target-create.ts`) — không tự cấp mã.

## Quy tắc frontend

- Trang mới phải đăng ký đủ 4 chỗ: route (`App.tsx`), `pageTitles` (`App.tsx`), sidebar `items` + `titles` (`Layout.tsx`).
- State per-page: `useState` + request-id ref guard cho async load; KHÔNG thêm Redux/React Query.
- CSS: file riêng theo feature (`<feature>.css` import trong page), prefix class riêng, không override selector toàn cục.
- Mutation gửi `expectedVersion`; xử lý 409 bằng thông báo + reload. Chuỗi UI 100% tiếng Việt, giọng hành chính.

## Lệnh

```bash
npm run db:generate        # BẮT BUỘC sau npm install (không có postinstall hook)
npm run build              # api + web
npm test                   # unit tests (node:test qua tsx, mock Prisma object literal)
npm run qa:access|qa:feedback|qa:import   # e2e cần API + Postgres đang chạy
```

- Dev DB riêng: `ioc_laithieu_dev` trên Postgres container `ioc-laithieu-db` (KHÔNG đụng DB `ioc_laithieu`
  đang chạy demo). Seed demo: `RUN_DEMO_SEED=true ALLOW_DEMO_SEED=true npx tsx prisma/seed.ts`.
- API dev: PORT=3100 + env `TESSERACT_PATH`, `TESSDATA_DIR=F:\tessdata`, `OLLAMA_BASE_URL=http://127.0.0.1:11434`.
- Model cục bộ tại `F:\ollama-models` (env user `OLLAMA_MODELS`); `OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`.
- Test tài liệu mẫu: `python scripts/generate-sample-documents.py` → `samples/`.

## Cấm

- Không commit `.env`, model weights, dataset nhạy cảm.
- Không sửa test chỉ để che lỗi implementation; không bỏ qua lỗi type-check.
- Không để LLM sinh SQL tự do rồi thực thi — mọi hành động AI qua tool có schema + kiểm soát quyền.
- Không đổi công nghệ nền (NestJS/Prisma/React/Vite) nếu không có quyết định ghi trong DECISIONS.md.
