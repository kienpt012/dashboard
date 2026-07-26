# Nghiên cứu lựa chọn model AI (26/07/2026)

Phần cứng ràng buộc: GTX 1650 **4GB VRAM**, 16GB RAM, i5-10300H. Nguyên tắc: model vượt ~3.5GB
(weights + KV cache) sẽ bị offload một phần sang CPU, chậm 5–30 lần. Runtime: Ollama
(structured output bằng grammar-constrained JSON schema cho mọi model).

## 1. LLM trích xuất tiếng Việt

Bằng chứng chất lượng tiếng Việt (VMLU leaderboard — 10.880 câu hỏi, 58 môn, Zalo AI):

| Model | VMLU | Ghi chú |
|---|---|---|
| Qwen2.5-7B-Instruct | **57.51** | tốt nhất trong nhóm chạy được trên máy này |
| BloomVN-8B-chat | 56.56 | fine-tune VN |
| Vistral-7B-Chat | 50.07 | fine-tune VN 2024 |
| ChatGPT-3.5 | 46.33 | tham chiếu |
| SeaLLM-7b-v2 | 45.79 | chuyên Đông Nam Á |

**Phát hiện quyết định**: model đa ngữ thế hệ mới (Qwen) đã vượt các fine-tune tiếng Việt 2023–2024
ngay trên benchmark tiếng Việt, đồng thời có JSON/tool-calling mà các model VN cũ không có.

So sánh ứng viên chạy local:

| Model | Tham số | Q4 size | Vừa 4GB? | License | Tiếng Việt | Structured |
|---|---|---|---|---|---|---|
| **qwen3:4b-instruct-2507** ✅ chọn | 4B | 2.5GB | Có | Apache 2.0 | 119 ngôn ngữ, dòng Qwen VMLU mạnh | Tool + JSON đầy đủ |
| qwen2.5:7b-instruct (dự phòng batch) | 7.6B | 4.7GB | Không (offload) | Apache 2.0 | VMLU 57.51 đo được | Có |
| qwen2.5:3b-instruct | 3B | 1.9GB | Có | **Non-commercial** ⛔ | 29 ngôn ngữ | Có |
| gemma3:4b | 4.3B | 3.3GB | Sát nút | Gemma ToU | 140+ ngôn ngữ, không có số VMLU | JSON qua format, không tool tag |
| phi-4-mini | 3.8B | 2.5GB | Có | MIT | **Không hỗ trợ VN chính thức** ⛔ | Có |
| llama3.2:3b | 3.2B | 2.0GB | Có | Llama license | **VN không trong 8 ngôn ngữ** ⛔ | Có |
| SeaLLMs-v3-7B / Sailor2-8B | 7–8B | 4.7–5.2GB | Không | hạn chế/Apache | mạnh SEA | chat-oriented |
| Vistral/PhoGPT/VinaLLaMA | 4–7B | — | — | — | đã bị vượt trên VMLU | kém (đời 2023) |

Đo thực tế trên máy (E-001): ~10 tok/s eval, trích xuất 1 chunk ≈ 50–60s, GPU offload 67–73%
(4GB VRAM bị OS/app chiếm một phần). Đủ cho pipeline bất đồng bộ.

## 2. Embedding (pgvector, giai đoạn RAG)

Bằng chứng VN-MTEB (41 dataset tiếng Việt, 07/2025):

| Model | VN-MTEB | Chiều | Ollama | Ghi chú |
|---|---|---|---|---|
| multilingual-e5-large-instruct | 67.99 | 1024 | chỉ bản community | cần prefix "query:/passage:" |
| **bge-m3** ✅ chọn | **64.90** | 1024 | **official**, 1.2GB | context 8K, không cần prefix |
| multilingual-e5-base | 62.42 | 768 | community | phương án nhẹ |
| nomic-embed-text | — | 768 | official | thiên tiếng Anh ⛔ |
| paraphrase-multilingual | ~46–54 | 768 | official | context 512 ⛔ |

bge-m3 là model duy nhất vừa top-tier VN-MTEB, vừa official Ollama, vừa 8K context, vừa không có
prefix-protocol (nguồn bug thầm lặng). Đo thực tế: 1024d, <1s/lô sau khi load (E-002).

## 3. OCR tiếng Việt

| Phương án | Độ chính xác VN | Tốc độ CPU | Cài đặt Windows | Gọi từ Node |
|---|---|---|---|---|
| **Tesseract 5 native + vie best** ✅ chọn | >97% bản in rõ; yếu dấu chồng (ấ/ẩ) | <1s/trang | 1 installer | spawn child_process |
| tesseract.js (WASM) | như trên | chậm 2–5× | npm thuần | native |
| PaddleOCR PP-OCRv5 | 84.7% đa ngữ, tốt scan xấu | nhanh | stack Paddle nặng ⛔ | cần sidecar Python |
| RapidOCR (ONNX) | dòng Paddle | nhanh | pip nhẹ | sidecar nhỏ — **nâng cấp bậc 1** |
| Qwen2.5-VL-3B (Ollama, 3.2GB) | hiểu layout/ngữ cảnh | giây–phút/trang | đã có Ollama | native — **nâng cấp bậc 2** |
| Vintern-1B-v3.5 (VLM chuyên VN, MIT) | vi-MTVQA 41.9, DocVQA 78.8 | GPU T4-class | llama.cpp GGUF | sidecar — bậc 2 |

## 4. Vận hành Ollama trên máy này

- `OLLAMA_MODELS=F:\ollama-models` (C: chỉ còn 18GB); `OLLAMA_FLASH_ATTENTION=1`; `OLLAMA_KV_CACHE_TYPE=q8_0`.
- `num_ctx` 4096 cho trích xuất (chunk ~1800 ký tự); temperature 0.1; schema JSON qua tham số `format`.
- Kiểm tra offload bằng `ollama ps` (SIZE/PROCESSOR); model tải về: qwen3:4b-instruct-2507-q4_K_M (2.5GB),
  bge-m3 (1.2GB). Tổng dung lượng lõi ~3.7GB.

## Kết luận

Stack được chọn (ghi tại DECISIONS D-002/D-003): **Qwen3-4B-Instruct-2507 Q4_K_M + bge-m3 + Tesseract vie**,
tổng tải ~3.8GB, toàn bộ license cho phép, chạy hoàn toàn local (riêng tư dữ liệu — RQ6), có đường nâng cấp
rõ ràng theo từng điểm nghẽn thay vì đổi cả kiến trúc.
