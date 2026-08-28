# Chiến lược model AI

Bản tóm tắt định hướng. Căn cứ lựa chọn (VMLU, VN-MTEB, so sánh OCR và số đo thực tế) nằm ở [tài liệu lựa chọn mô hình](research/02-model-selection.md); quyết định chính thức được ghi trong [nhật ký quyết định kiến trúc](DECISIONS.md) (D-002, D-003).

## 1. Stack hiện dùng

| Vai trò | Model | Lý do chính |
|---|---|---|
| Trích xuất | `qwen3:4b-instruct-2507-q4_K_M` (2.5GB, Apache 2.0) | Dòng Qwen mạnh nhất tiếng Việt trong nhóm vừa GPU 4GB; structured output + tool calling; đo thực tế ~10 tok/s (E-001). |
| Embedding (giai đoạn RAG) | `bge-m3` (1.2GB, 1024d) | Top nhóm chạy được trên VN-MTEB (64.90), official Ollama, context 8K, không cần prefix (E-002). |
| OCR | Tesseract 5 native + `vie` (tessdata_best) | Nhanh trên CPU, 1 installer, spawn từ Node — không cần Python. |

Tổng tải ~3.8GB, toàn bộ license cho phép, chạy hoàn toàn local.

## 2. Lộ trình nâng cấp theo bậc (chỉ nâng khi có bằng chứng điểm nghẽn)

**OCR** (khi benchmark E-004 cho thấy scan xấu vượt khả năng Tesseract):

1. Tesseract 5 + vie (hiện tại) → 2. RapidOCR (ONNX, sidecar pip nhẹ) → 3. VLM: Qwen2.5-VL-3B (Ollama) hoặc Vintern-1B-v3.5 (VLM chuyên tiếng Việt).

**LLM trích xuất**:

1. `qwen3:4b` (hiện tại) → 2. model 7B chạy **batch/accuracy-mode** nếu benchmark cho thấy lợi ích rõ ràng → 3. **fine-tune LoRA — chỉ khi có bằng chứng**, với các điều kiện tiên quyết:
   - prompt + schema đã được tối ưu hết mức (hết dư địa cải thiện rẻ);
   - có dataset gán nhãn đủ lớn từ dữ liệu thật;
   - có baseline định lượng để so sánh;
   - tách train/validation/test nghiêm ngặt;
   - metric per-field cải thiện rõ so với baseline mới được chấp nhận.

## 3. Fine-tuning: CHƯA bắt đầu

Hiện chưa thực hiện fine-tuning. Baseline E-003 đã có, nhưng chưa có tập dữ liệu thật được gán nhãn đủ lớn và quy trình train/validation/test phù hợp. Các cải thiện hiện tại tập trung vào prompt, luật bổ khuyết và cơ chế kiểm chứng trích dẫn.

## 4. Ghi nhận model (model registry tối giản)

Thay cho bảng registry riêng (tránh phình schema ở prototype):

- Mỗi `ExtractionJob` và mỗi `IndicatorCandidate` ghi `model` (tag Ollama) + `promptVersion` (`extract-v1` / `rule-v1` / `rule-only`).
- Đổi prompt bắt buộc tăng `EXTRACTION_PROMPT_VERSION` (`extraction-llm.ts`) — mọi kết quả quy về được đúng cấu hình sinh ra nó.
- Nhật ký và dữ liệu đánh giá tập trung tại [thư mục thí nghiệm](experiments/README.md); màn hình quản lý model là hạng mục mở rộng.
