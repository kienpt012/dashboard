# Quyết định kiến trúc

Mỗi quyết định: bối cảnh → phương án đã cân nhắc → lựa chọn → căn cứ. Quyết định chỉ được
đảo ngược khi có bằng chứng mới, ghi rõ lý do và tác động migration.

## D-001 · 2026-07-26 · Modular monolith, không tách microservice ở giai đoạn prototype

- **Phương án**: (a) giữ NestJS monolith mở rộng thêm module; (b) tách AI service Python/FastAPI; (c) microservices đầy đủ.
- **Chọn**: (a). Toàn bộ ingestion/OCR/extraction viết bằng Node trong `apps/api`.
- **Căn cứ**: repo hiện một-ngôn-ngữ với quy ước rất chặt (transaction+audit+version guard); máy dev 16GB RAM
  không gánh thêm stack Python nặng; mọi thư viện cần thiết có bản Node thuần hoặc native-prebuilt
  (unpdf/pdfjs, mammoth, exceljs, Tesseract spawn, Ollama HTTP). Python sidecar chỉ cân nhắc lại khi
  benchmark chứng minh cần PaddleOCR/RapidOCR (ghi ở AI_MODEL_STRATEGY).

## D-002 · 2026-07-26 · Local LLM: Qwen3-4B-Instruct-2507 Q4_K_M qua Ollama

- **Phương án**: qwen3:4b, qwen2.5:3b/7b, gemma3:4b, phi-4-mini, llama3.2, SeaLLMs, Sailor2, Vistral, PhoGPT.
- **Chọn**: `qwen3:4b-instruct-2507-q4_K_M` (2.5GB) chính; `qwen2.5:7b-instruct` là phương án accuracy-mode chạy batch nếu cần.
- **Căn cứ**: dòng Qwen có bằng chứng tiếng Việt mạnh nhất trong nhóm chạy vừa GPU 4GB (VMLU: Qwen2.5-7B 57.51
  vs Vistral-7B 50.07 vs SeaLLM-7b-v2 45.79); Apache 2.0; structured output + tool calling; đo thực tế trên
  GTX 1650: ~10 token/s, trích xuất 1 chunk ≈ 50–60s (chấp nhận được vì pipeline bất đồng bộ).
  qwen2.5:3b bị loại vì license non-commercial; phi-4-mini/llama3.2 không hỗ trợ tiếng Việt chính thức.
  Chi tiết benchmark: [AI_MODEL_STRATEGY.md](AI_MODEL_STRATEGY.md).

## D-003 · 2026-07-26 · Embedding bge-m3, OCR Tesseract native vie

- **bge-m3** (1.2GB, 1024d): top nhóm chạy được trên VN-MTEB (64.90), official Ollama, context 8K, không cần prefix.
- **Tesseract 5 native + vie (tessdata_best)**: nhanh trên CPU, cài 1 installer, spawn từ Node, không cần Python.
  Đường nâng cấp đã ghi nhận: RapidOCR (ONNX) → Qwen2.5-VL-3B/Vintern-1B khi gặp scan chất lượng xấu.

## D-004 · 2026-07-26 · Job bất đồng bộ bằng bảng ExtractionJob theo mô hình MailOutbox, chưa dùng Redis

- **Căn cứ**: repo đã có mô hình outbox hoàn chỉnh (claim `FOR UPDATE SKIP LOCKED`, lease, backoff, DEAD_LETTER,
  single-flight worker). Extraction là job nặng chạy phút nên lease 10 phút, mỗi vòng 1 job. Redis/BullMQ chỉ
  cần khi chạy nhiều API instance — ngoài phạm vi prototype (đồng bộ với ghi chú rate-limit hiện có của repo).

## D-005 · 2026-07-26 · Trì hoãn pgvector sang giai đoạn RAG

- Vertical slice không cần semantic search. Đổi image `postgres:17-alpine` → `pgvector/pgvector:pg17` là thao
  tác phá vỡ volume hiện có (musl→glibc collation) nên chỉ làm cùng lúc với giai đoạn RAG, kèm hướng dẫn
  dump/restore. Schema chunk đã thiết kế sẵn chỗ (DocumentChunk) để thêm cột vector sau.

## D-006 · 2026-07-26 · Luồng AI đề xuất → người duyệt (không auto-approve)

- IndicatorCandidate (PROPOSED → APPROVED/REJECTED) nhân bản trust-boundary của Import Excel
  (preview → duyệt → apply). Duyệt tạo Target qua đúng hàm cấp mã dùng chung (`createTargetWithGeneratedCode`).
  Ứng viên đã qua tay người (humanEdited) không bao giờ bị re-extract ghi đè. Mọi field AI có confidence
  riêng + sourceQuote được kiểm chứng lại bằng string-match với chunk (quote không khớp ⇒ confidence bị hạ trần 0.4).

## D-007 · 2026-07-26 · Chiến lược trích xuất hybrid: LLM chính, rule-based bổ khuyết + fallback

- LLM đọc từng chunk (đã lọc bằng heuristic `chunkLikelyHasIndicators` để tiết kiệm GPU); rule-based chạy song
  song, chỉ thêm ứng viên mà LLM bỏ sót (so theo giá trị số), gắn method RULE_BASED. Khi Ollama tắt, hệ thống
  vẫn hoạt động bằng rule-based (graceful degradation). Benchmark riêng từng phương án ở giai đoạn đánh giá.

## D-008 · 2026-07-26 · Tài liệu lưu Bytes trong Postgres (≤25MB), chưa dùng object storage

- Nhất quán với FeedbackAttachment hiện có; blob không bao giờ được select trong query danh sách;
  worker chỉ đọc blob khi xử lý. Giới hạn được ghi trong [hạn chế đã biết](KNOWN_ISSUES.md); object storage là hướng production.
