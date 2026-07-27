# Báo cáo đánh giá hiện trạng hệ thống IOC Lái Thiêu

Ngày khảo sát: 26/07/2026. Phương pháp: đọc toàn bộ mã nguồn (6 agent khảo sát song song theo phân hệ), chạy build/test, chạy hệ thống bằng Docker, kiểm tra giao diện bằng browser, kiểm tra cấu hình phần cứng.

## 1. Tổng quan kiến trúc hiện tại

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite, react-router v7, lucide-react | Không dùng Redux/React Query/Tailwind; CSS toàn cục viết tay |
| Backend | NestJS 11 + Prisma 6 | **Modular monolith một module phẳng**: mỗi domain là 1 file (controller chứa luôn business logic, không có service layer) |
| Database | PostgreSQL 17 (alpine) | 23 migration; Bytes trong DB cho file đính kèm |
| Triển khai | Docker Compose 3 service (postgres, api, web/nginx) | Healthcheck đầy đủ, migration tự chạy khi khởi động, nginx proxy `/api/` |
| Test | `node:test` qua tsx (76 unit test, mock Prisma bằng object literal) + 3 bộ QA e2e chạy tay (`qa:access` 35, `qa:feedback` 80, `qa:import` 8) | Không có CI |

### Kết quả kiểm tra baseline (26/07/2026)

- `npm run build`: **ĐẠT** (API + web; cần `prisma generate` trước — không có postinstall hook).
- `npm test`: **76/76 ĐẠT**.
- Hệ thống chạy qua Docker: 3 container healthy; `/api/health` trả `database: ok`.
- Giao diện công khai hiển thị đúng 7 chỉ tiêu demo, 5 phòng ban, tiến độ 83%.
- Không có lint tooling (không ESLint/Prettier config) — type-check qua `tsc` là lớp kiểm soát duy nhất.

## 2. Chức năng đã hoàn thành

1. Đăng nhập JWT (8h, token-version revocation), 4 vai trò ADMIN/MANAGER/STAFF/VIEWER, phạm vi phòng ban kiểm tra lại trên mọi request.
2. Danh mục chỉ tiêu (Target): mã tự cấp `CT-{năm}-{mãPB}-{seq}`, trọng số, chu kỳ, hướng tốt/xấu, hạn theo giờ VN, optimistic-lock 2 tầng (`version` + `publicationVersion`), khóa định nghĩa sau khi có báo cáo, lưu trữ/khôi phục.
3. Cập nhật tiến độ có duyệt: STAFF/MANAGER nộp → PENDING → duyệt/từ chối (cấm tự duyệt); ADMIN ghi trực tiếp.
4. Import Excel theo phiếu: template có sheet META chống giả mạo → preview → apply/submit-for-review, idempotent, chống race bằng Serializable + CAS.
5. Dashboard điều hành: tiến độ trọng số, cảnh báo, lịch sử; xuất Excel 3 sheet; trang công khai có snapshot-at-publish.
6. Kênh phản ánh công dân đầy đủ vòng đời (tiếp nhận → phân công → xử lý → duyệt → công bố ẩn danh hóa), minh chứng ảnh/PDF kiểm tra magic-byte, mail outbox có retry/dead-letter.
7. Quản trị người dùng/phòng ban, audit log có lọc + metadata allowlist, cài đặt hệ thống singleton, khôi phục mật khẩu OTP.

## 3. Chức năng CHƯA có (khoảng trống cho đề tài)

- **Không có bất kỳ năng lực AI nào**: không trích xuất tài liệu, không OCR, không tìm kiếm ngữ nghĩa, không chatbot/copilot, không speech-to-text.
- **Điểm nghẽn nhập liệu cốt lõi**: mọi chỉ tiêu phải được ADMIN gõ tay từng trường (10+ trường/chỉ tiêu); số liệu cập nhật tay từng kỳ hoặc qua phiếu Excel cứng nhắc do hệ thống sinh ra (không đọc được file Excel/PDF/công văn bên ngoài).
- Không có kho văn bản/tài liệu nguồn; không có provenance (chỉ tiêu không gắn với văn bản pháp lý nào).
- Không có kỳ báo cáo độc lập (`frequency` chỉ là thuộc tính cấu hình).
- Không có full-text/semantic search; tìm kiếm hiện tại là `contains` không index.
- Không có CI; không có màn hình theo dõi job/dead-letter.

## 4. Quy ước code bắt buộc tuân theo (khi mở rộng)

1. **Mỗi domain = 1 file** trong `apps/api/src/`, controller chứa logic, inject `PrismaService` trực tiếp, đăng ký trong `app.module.ts`.
2. **Mọi mutation**: `$transaction(Serializable)` → `updateMany` có version-guard → `count !== 1` ⇒ 409 tiếng Việt → `audit(tx, actor, …)` trong cùng transaction → dịch P2002/P2025/P2034 thành 409.
3. DTO class-validator thông báo tiếng Việt, `expectedVersion` bắt buộc trên update, `Trim()`/`ValidateIfDefined()` local per file.
4. Upload: `memoryStorage` + kiểm tra magic-byte (`detectAllowedAttachmentMime`) + MIME lưu = MIME phát hiện + SHA-256 dedupe + Bytes trong Postgres + metadata-only select.
5. Async job: mô hình MailOutbox — bảng job PK theo entity, claim bằng `FOR UPDATE SKIP LOCKED`, lease 5 phút, backoff mũ, DEAD_LETTER, worker single-flight `timer.unref()`.
6. Frontend: page tự quản state (`useState` + request-id ref guard), đăng ký trang ở 4 chỗ (route, pageTitles, sidebar items, titles), thông báo inline `notice success/error`, upload theo mẫu `Imports.tsx` (dropzone → preview → apply).
7. Test: `node:test` qua tsx, mock Prisma bằng object literal `as any`, không DB thật; QA e2e theo mẫu `scripts/qa-*.mjs` với `createQaActors`.

## 5. Nợ kỹ thuật & rủi ro chính (ảnh hưởng thiết kế mới)

| # | Vấn đề | Ảnh hưởng | Kế hoạch |
|---|---|---|---|
| 1 | Không có service layer — logic tạo Target nằm trong controller | Duyệt candidate không gọi lại được logic tạo chỉ tiêu | Trích logic tạo Target thành hàm dùng chung khi làm luồng duyệt |
| 2 | `ProgressUpdate` không có cột provenance (chỉ có `note`) | Số liệu AI không ghi được nguồn | Migration thêm nguồn qua bảng candidate mới, không nhét JSON vào `note` |
| 3 | File trong Postgres Bytes + memoryStorage | PDF scan lớn gây áp lực RAM | Giữ Bytes cho prototype (≤25MB), tách blob khỏi query thường; đường nâng cấp: object storage |
| 4 | nginx `proxy_read_timeout 60s` | Extraction/LLM lâu hơn 60s sẽ đứt | Xử lý bất đồng bộ qua job + polling (không giữ HTTP request) |
| 5 | postgres:17-alpine không có pgvector | Semantic search cần extension | Đổi image `pgvector/pgvector:pg17` (musl→glibc: cần re-init volume dev; dữ liệu thật phải dump/restore) |
| 6 | Không CI | Regression khó phát hiện | Bổ sung workflow chạy build+test (giai đoạn sau) |
| 7 | Rate limit trong RAM tiến trình | Chỉ đúng khi 1 API instance | Giữ nguyên, ghi nhận hạn chế |
| 8 | Status filter/dashboard load toàn bộ rồi lọc trong JS | Chậm khi >1000 chỉ tiêu | Chấp nhận ở quy mô phường; ghi nhận |
| 9 | Trang phải đăng ký 4 chỗ ở frontend | Dễ sót khi thêm màn hình | Checklist trong CLAUDE.md |
| 10 | `SAFE_METADATA_KEYS` allowlist trong audit-logs | Metadata audit mới bị ẩn nếu quên thêm key | Thêm key mới khi thêm action AI |

## 6. Cấu hình máy phát triển (đo ngày 26/07/2026)

| Thành phần | Giá trị | Ý nghĩa cho AI |
|---|---|---|
| OS | Windows 11 Pro 26200 | Ollama Windows native; tránh stack Python nặng |
| CPU | Intel i5-10300H, 4 nhân/8 luồng | OCR CPU chậm — cần giới hạn số trang/lần |
| RAM | 15.8 GB (thường còn ~3–6 GB trống) | Không chạy đồng thời nhiều model; chọn model ≤4B |
| GPU | NVIDIA GTX 1650 **4 GB VRAM** | Chạy trọn LLM 4B Q4 (~2.5GB) trên GPU; 7B phải offload một phần (chậm) |
| Ổ đĩa | C: 18.6GB, F: 238GB trống | Model lưu tại `F:\ollama-models` (OLLAMA_MODELS) |
| Runtime | Node 24, Python 3.13, Docker 29, Ollama 0.32.4 | Đủ điều kiện chạy local AI |

## 7. Kết luận khảo sát

Nền tảng hiện tại **vững về kỷ luật dữ liệu** (optimistic locking, audit trong transaction, human-in-the-loop, snapshot-at-publish, outbox worker) — đây chính là các nguyên liệu đúng để xây lớp AI có kiểm soát: luồng *AI đề xuất → người xác minh → hệ thống ghi nhận có provenance* có thể tái dùng gần như nguyên vẹn mô hình Import Excel (preview → duyệt → apply) và mô hình MailOutbox (job bất đồng bộ). Khoảng trống lớn nhất và giá trị nghiên cứu lớn nhất nằm ở: (1) kho văn bản + pipeline tiếp nhận đa định dạng, (2) trích xuất chỉ tiêu có cấu trúc với độ tin cậy từng trường, (3) màn hình xác minh đối chiếu nguồn, (4) điều hành bằng tiếng Việt tự nhiên. Toàn bộ có thể triển khai local-first trên cấu hình máy hiện có với model 4B + OCR tiếng Việt.
