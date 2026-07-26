# EXPERIMENTS.md — Nhật ký thí nghiệm

Kết quả chi tiết + dữ liệu tái lập lưu ở `docs/experiments/`. Mỗi thí nghiệm có ID.

## E-001 · 2026-07-26 · Smoke test trích xuất structured tiếng Việt (Qwen3-4B local)

- **Thiết lập**: GTX 1650 4GB, Ollama 0.32.4, `qwen3:4b-instruct-2507-q4_K_M`, temperature 0.1,
  JSON-schema constrained (`format`), văn bản kế hoạch 4 chỉ tiêu (~335 token prompt).
- **Kết quả**: 4/4 chỉ tiêu nhận diện đúng (tên, giá trị, đơn vị, đơn vị chủ trì); sourceQuote nguyên văn
  chính xác 4/4; số kiểu VN parse đúng ("3.450 tỷ đồng" → 3450; "95,5%" → 95.5).
- **Lỗi quan sát được**: tần suất báo cáo sai 2/4 khi văn bản không nêu rõ trong cùng câu (đoán MONTHLY/SEMIANNUAL
  thay vì null) → prompt v1 bổ sung quy tắc số 7 (mapping tần suất + bắt buộc null khi không nêu).
- **Hiệu năng**: lần 1 (cold + num_ctx 8192): 85.7s/503 tok. Sau bật OLLAMA_FLASH_ATTENTION=1 +
  KV q8_0: 52–64s/~500 tok (~8–10 tok/s eval), GPU offload 67–73% (model không vừa trọn 4GB do
  hệ điều hành chiếm VRAM). Kết luận: đủ dùng cho pipeline bất đồng bộ; không đủ cho chat realtime dài.

## E-002 · 2026-07-26 · Embedding bge-m3 tiếng Việt

- `/api/embed` với 2 câu tiếng Việt: 1024 chiều, lần đầu 8.8s (gồm load model), các lần sau <1s. CPU-friendly.

## Kế hoạch thí nghiệm kế tiếp (xem docs/experiments/experiment-plan.md khi tạo)

- E-003: Benchmark field-level P/R/F1 rule-based vs LLM vs hybrid trên evaluation dataset v1.
- E-004: OCR CER trên bản scan synthetic + đo thời gian/trang.
- E-005: Đối chiếu qwen3:4b vs qwen2.5:7b-instruct (partial offload) về chất lượng/thời gian.
