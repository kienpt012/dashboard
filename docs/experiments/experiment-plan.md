# Kế hoạch thí nghiệm — Trích xuất chỉ tiêu hành chính

Trả lời RQ2 (phương án nào phù hợp) và RQ3 (độ chính xác từng trường). Xem phương pháp tổng thể
tại [../RESEARCH_METHOD.md](../RESEARCH_METHOD.md).

## Thiết lập

| Thành phần | Giá trị |
|---|---|
| Phần cứng | GTX 1650 4GB VRAM, i5-10300H, 16GB RAM (máy phổ thông — điều kiện ràng buộc của RQ6) |
| Model | `qwen3:4b-instruct-2507-q4_K_M` qua Ollama, temperature 0.1, num_ctx 4096, JSON-schema constrained |
| OCR | Tesseract 5.4 native, traineddata `vie` (tessdata_best), PSM 4, TSV confidence |
| Dataset | `eval/dataset-v1/ground-truth.json` — 5 tài liệu synthetic (DOCX, PDF text, PDF scan, XLSX, PNG), 28 chỉ tiêu, ground truth 7 trường/chỉ tiêu |
| Harness | `scripts/benchmark-extraction.mjs` — chạy độc lập trên module production đã build (không qua HTTP), kết quả JSON+CSV trong `results/` |

## Phương án so sánh (baseline)

1. **manual** (tham chiếu lý thuyết): nhập tay ~10 trường/chỉ tiêu — không đo máy, dùng làm mốc RQ4.
2. **rule**: bộ luật tiếng Việt (`extraction-rules.ts`) — regex số kiểu VN, động từ mục tiêu, đơn vị đo,
   look-ahead câu thuộc tính. Chi phí ≈ 0, chạy được khi không có GPU.
3. **llm**: Qwen3-4B đọc từng chunk với schema ràng buộc + kiểm chứng quote.
4. **hybrid** (phương án production): LLM chính, luật bổ khuyết các giá trị LLM bỏ sót; tự hạ cấp
   về luật khi Ollama không phản hồi.

## Chỉ số đo

- **Mức chỉ tiêu**: precision / recall / F1 (micro-average; ghép cặp dự đoán↔chuẩn bằng Dice tên ≥0.45
  hoặc trùng giá trị + Dice ≥0.25, ghép tham lam 1-1).
- **Mức trường** (trên các cặp đã ghép): độ chính xác value (±1e-6), unit (chuẩn hóa), direction,
  frequency (null phải đúng là null), deadline (bỏ qua khi văn bản không nêu), department (Dice ≥0.62).
- **Hiệu năng**: thời gian parse, thời gian trích xuất mỗi tài liệu.
- **Hallucination**: theo cơ chế kiểm chứng quote trong pipeline (quote không khớp ⇒ cảnh báo + trần
  confidence 0.4) — đo gián tiếp qua tỉ lệ ứng viên bị cảnh báo.

## Quy trình hợp lệ

- Mỗi phương án chạy trên cùng dataset, cùng máy, không tranh chấp GPU với tiến trình khác
  (bài học từ lần chạy 21:04 26/07: lời gọi LLM timeout hàng loạt vì hàng đợi Ollama bận việc khác —
  kết quả bị loại, chỉ dùng lần chạy sạch).
- Kết quả mỗi lần chạy lưu nguyên file `benchmark-<timestamp>.json/csv` — không ghi đè, tái lập được.
- Con số công bố trong `results.md` phải trỏ về đúng file kết quả nguồn.

## Hạn chế đã biết của thí nghiệm v1

- Dataset synthetic do nhóm tự sinh (nguy cơ thiên lệch về văn phong); cần bổ sung văn bản thật
  (đã ẩn danh) ở dataset-v2.
- Cỡ mẫu nhỏ (28 chỉ tiêu) — đủ cho so sánh định hướng, chưa đủ cho khoảng tin cậy hẹp.
- Một lần chạy mỗi phương án (model temperature 0.1 gần tất định nhưng chưa đo phương sai).
