# Lộ trình dự án

Bám theo `TASKS.md` (nguồn chuẩn về trạng thái từng đầu việc). Ký hiệu: ☑ xong · ◐ đang làm · ☐ kế hoạch.

| Giai đoạn | Nội dung | Kết quả kỳ vọng | Trạng thái |
|---|---|---|---|
| 0–1 | Khảo sát & hạ tầng AI | Báo cáo hiện trạng; Ollama + Qwen3-4B + bge-m3 + Tesseract vie chạy được; smoke test structured output tiếng Việt (E-001/E-002); dev DB riêng | ☑ xong 26/07/2026 |
| 2–5 | **Vertical slice**: upload → trích xuất → duyệt → dashboard | Schema 5 bảng + provenance Target; upload an toàn; worker parse/OCR/chunk + trích xuất hybrid; API duyệt tạo Target; frontend Kho văn bản + Xác minh trích xuất; unit test module mới + `qa-documents.mjs`; cập nhật compose/README | ◐ **VỊ TRÍ HIỆN TẠI** — backend ☑, frontend + e2e ◐, test/compose/README ☐ |
| 6 | Đánh giá & benchmark | `eval/dataset-v1/` có ground truth; số liệu P/R/F1 per field cho rule vs LLM vs hybrid, thời gian, CER OCR; tài liệu experiments trả lời RQ2/RQ3/RQ4 | ☐ kế hoạch |
| 7 | RAG & tìm kiếm | pgvector (đổi image + dump/restore theo D-005), hybrid search FTS + vector kèm citation, màn hình tra cứu kho tri thức | ☐ kế hoạch |
| 8 | IOC Copilot | Tool registry có schema, agent loop Qwen3 tool-calling (đọc trực tiếp, ghi qua preview + xác nhận), chat tiếng Việt hiển thị nguồn — trả lời RQ5 | ☐ kế hoạch |
| 9 | Cập nhật số liệu từ báo cáo | Trích xuất giá trị thực hiện, khớp Target (enum PROGRESS_UPDATE đã có sẵn), duyệt tạo ProgressUpdate PENDING theo luồng review hiện có | ☐ kế hoạch |
| 10 | Giọng nói & mở rộng | Speech-to-text tiếng Việt local (whisper.cpp/faster-whisper), màn hình quản lý model/theo dõi job/chất lượng dữ liệu, CI, hướng dẫn backup/restore | ☐ kế hoạch |

Nguyên tắc chuyển giai đoạn: chỉ tiến khi giai đoạn trước có bằng chứng chạy được (test/QA/số đo ghi trong `PROGRESS.md`/`EXPERIMENTS.md`); mọi thay đổi hướng đi ghi vào `DECISIONS.md`.
