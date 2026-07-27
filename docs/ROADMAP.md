# Lộ trình dự án

Bám theo `TASKS.md` (nguồn chuẩn về trạng thái từng đầu việc). Ký hiệu: ☑ xong · ◐ đang làm · ☐ kế hoạch.

| Giai đoạn | Nội dung | Kết quả kỳ vọng | Trạng thái |
|---|---|---|---|
| 0–1 | Khảo sát & hạ tầng AI | Báo cáo hiện trạng; Ollama + Qwen3-4B + bge-m3 + Tesseract vie chạy được; smoke test structured output tiếng Việt (E-001/E-002); dev DB riêng | ☑ xong 26/07/2026 |
| 2–5 | **Vertical slice**: upload → trích xuất → duyệt → dashboard | Schema 5 bảng + provenance Target; upload an toàn; worker parse/OCR/chunk + trích xuất hybrid; API duyệt tạo Target; frontend Kho văn bản + Xác minh trích xuất; unit test module mới + `qa-documents.mjs`; cập nhật compose/README | ☑ hoàn thành 26/07/2026 — kiểm chứng browser + 17/17 QA e2e |
| 6 | Đánh giá & benchmark | `eval/dataset-v1/` có ground truth; số liệu P/R/F1 per field cho rule vs LLM vs hybrid, thời gian; tài liệu experiments trả lời RQ2/RQ3 | ☑ xong 26/07/2026 (E-003/E-004; rule F1=0.75, llm/hybrid F1=1.0; còn CER OCR scan xấu → E-007) |
| 7 | RAG & tìm kiếm | pgvector (đổi image + dump/restore theo D-005), hybrid search FTS + vector kèm citation, màn hình tra cứu kho tri thức | ☐ kế hoạch |
| 8 | IOC Copilot | v1 ☑ xong 26/07/2026: intent routing LLM + fallback từ khóa, 6 tool chỉ đọc có kiểm soát phạm vi, chat kèm nguồn + audit (kiểm chứng browser). v2 ☐: thao tác ghi qua preview + xác nhận, hội thoại đa lượt — hoàn thiện câu trả lời RQ5 | ◐ v1 xong |
| 9 | Cập nhật số liệu từ báo cáo | Trích xuất giá trị thực hiện, khớp Target (enum PROGRESS_UPDATE đã có sẵn), duyệt tạo ProgressUpdate PENDING theo luồng review hiện có | ☐ kế hoạch |
| 10 | Giọng nói & mở rộng | Speech-to-text tiếng Việt local (whisper.cpp/faster-whisper), màn hình quản lý model/theo dõi job/chất lượng dữ liệu, CI, hướng dẫn backup/restore | ☐ kế hoạch |

Nguyên tắc chuyển giai đoạn: chỉ tiến khi giai đoạn trước có bằng chứng chạy được (test/QA/số đo ghi trong `PROGRESS.md`/`EXPERIMENTS.md`); mọi thay đổi hướng đi ghi vào `DECISIONS.md`.
