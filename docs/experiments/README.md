# Thí nghiệm và kết quả

Kết quả chi tiết và dữ liệu tái lập được lưu trong thư mục này. Mỗi thí nghiệm có ID.

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

## E-003 · 2026-07-26 · Benchmark rule vs LLM vs hybrid (dataset-v1, 28 chỉ tiêu, 5 định dạng)

- **Kết quả** (chi tiết và file tái lập: [results.md](results.md)):
  rule P=0.90/R=0.643/F1=0.75 (~20ms, mù bảng XLSX 0/6);
  llm P=1.0/R=1.0/F1=1.0 (~19.6 phút; field: value/unit/direction 1.0, department 0.929,
  deadline 0.857, frequency 0.75 — lỗi chủ yếu là đoán tần suất khi văn bản không nêu);
  hybrid P=1.0/R=1.0/F1=1.0, giữ nguyên hoạt động khi LLM chết (2 tài liệu fallback luật trong lần chạy).
- **Kết luận RQ2**: hybrid là cấu hình production; fine-tune chưa có căn cứ.

## E-004 · 2026-07-26 · Hai lỗi hạ tầng phát hiện nhờ benchmark

- Trần `OLLAMA_TIMEOUT_MS` 240s giết lời gọi sinh >2000 token (chunk 8 chỉ tiêu ≈ 4 phút ở 10 tok/s)
  → nâng mặc định 480s.
- Trần headersTimeout 300s của undici fetch (Node) giết lời gọi >5 phút bất kể AbortSignal
  → chuyển OllamaService sang streaming (header về ngay, không còn trần); xác minh bằng lần chạy
  llm sạch 15-38-49 (5/5 tài liệu thành công, có lời gọi 366s).

## E-005 · 2026-07-27 · Vòng lặp cải tiến trên văn bản thật PL1 (QĐ 333): 19/39 → 39/39

- Ground truth đếm tự động: 26 chỉ tiêu đánh số + 13 thành phần "-" = 39 dòng.
- Nguyên nhân gốc thiếu 20 dòng: cạn ngân sách sinh token (num_ctx 4096) làm JSON đứt →
  mất trọn/mất đuôi chunk; đo được qua phân bố 13/0/6 ứng viên trên 3 chunk cũ.
- Fix: chunk 8-hàng-bảng + tiêu đề mục, num_ctx 8192, vá JSON cắt, prompt v4 cha–con +
  đơn vị-trước-giá-trị, hậu xử lý tất định. Kết quả: **39/39 dòng, 39/39 có lĩnh vực,
  0 rác tiêu đề bảng**; 2 dòng nhiễu thật tự bị hạ confidence (0.4–0.62).
- Chi tiết và bảng trước/sau: [real-qd333-results.md](real-qd333-results.md).

## Hướng thí nghiệm tiếp theo

- Dataset v2 từ văn bản thật đã ẩn danh và tỷ lệ trường cần người dùng chỉnh sửa.
- Đo lại độ chính xác theo trường sau mỗi thay đổi prompt.
- So sánh model ở chế độ ưu tiên độ chính xác và đo CER trên bản scan chất lượng thấp.

Xem [kế hoạch thí nghiệm](experiment-plan.md) và [so sánh mô hình](model-comparison.md).
