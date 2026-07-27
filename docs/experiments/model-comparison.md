# So sánh phương án AI

Hai lớp so sánh: (1) chọn model nào — quyết định bằng nghiên cứu tài liệu + đo thực tế, xem
[../research/02-model-selection.md](../research/02-model-selection.md); (2) chọn phương án trích xuất
nào — quyết định bằng thí nghiệm trên [dataset-v1](../../eval/dataset-v1/ground-truth.json), số liệu
đầy đủ ở [results.md](results.md).

## Lớp 1 — Model (tóm tắt quyết định D-002/D-003)

| Vai trò | Được chọn | Vì sao | Bị loại đáng chú ý |
|---|---|---|---|
| LLM trích xuất | Qwen3-4B-Instruct-2507 Q4 (2.5GB) | Dòng Qwen mạnh nhất tiếng Việt trong nhóm vừa 4GB VRAM (VMLU 7B: 57.51 > Vistral 50.07 > SeaLLM 45.79); Apache 2.0; JSON/tool | qwen2.5:3b (license NC), phi-4-mini & llama3.2 (không hỗ trợ VN), Sailor2/SeaLLMs (>4GB, license) |
| Embedding (RAG, giai đoạn 7) | bge-m3 (1024d) | VN-MTEB 64.9, official Ollama, 8K ctx, không cần prefix | e5-large-instruct (chỉ community + prefix protocol), nomic (thiên EN) |
| OCR | Tesseract 5 + vie best | <1s/trang CPU, 1 installer, spawn từ Node | PaddleOCR (stack nặng), VLM (chậm trên 4GB) — giữ làm đường nâng cấp |

## Lớp 2 — Phương án trích xuất (kết quả thực nghiệm)

| Tiêu chí | rule | llm | hybrid (chọn ✅) |
|---|---|---|---|
| F1 mức chỉ tiêu | 0.75 | 1.00 | 1.00 |
| Đọc bảng XLSX | ✗ (0.00) | ✓ (1.00) | ✓ (1.00) |
| Đọc quyết định "Điều/Khoản" | yếu (0.40) | ✓ | ✓ |
| Chi phí thời gian | ~0 | ~4 phút/tài liệu mẫu | ~4 phút/tài liệu mẫu |
| Hoạt động khi không có GPU/Ollama | ✓ | ✗ | ✓ (tự hạ cấp) |
| Trường yếu nhất | recall tổng thể | tần suất 0.75 (đoán khi thiếu) | tần suất 0.75 |

**Kết luận RQ2**: không phương án đơn lẻ nào thắng mọi tiêu chí — hybrid là cấu hình sản xuất:
chất lượng LLM + độ bền và chi phí của luật. Fine-tuning chưa có căn cứ khởi động
(điều kiện tiên quyết trong [../AI_MODEL_STRATEGY.md](../AI_MODEL_STRATEGY.md) chưa hội đủ:
prompt/schema còn dư địa cải tiến — thấy rõ qua lỗi tần suất; chưa có dữ liệu gán nhãn thật).

## Việc benchmark tiếp theo

1. Dataset-v2 với văn bản thật ẩn danh + đo human correction rate trên UI xác minh.
2. Prompt v3 xử lý tần suất-null; đo lại field accuracy.
3. Đối chiếu qwen2.5:7b-instruct (accuracy-mode, chấp nhận chậm) khi có tài liệu khó.
4. Đo CER của OCR trên scan chất lượng thấp (nghiêng/mờ/di động) — dataset scan hiện tại là bản in sạch.
