# Câu hỏi nghiên cứu (RQ1–RQ6)

Sáu câu hỏi nghiên cứu định hình đề tài. Phương pháp đo lường chi tiết: [RESEARCH_METHOD.md](RESEARCH_METHOD.md). Bằng chứng thực nghiệm hiện có: `EXPERIMENTS.md` (E-001, E-002) và [research/02-model-selection.md](research/02-model-selection.md).

## RQ1 — Có thể tự động nhận diện và trích xuất chỉ tiêu từ văn bản hành chính không đồng nhất hay không?

- **Nội dung**: văn bản đầu vào gồm DOCX, XLSX, PDF có text layer, PDF scan và ảnh chụp; cấu trúc trình bày khác nhau (đoạn văn, danh sách, bảng, phụ lục). Hệ thống có nhận diện đúng "chỉ tiêu" (mục tiêu định lượng có giá trị + đơn vị) và tách được các trường thông tin không?
- **Giả thuyết**: pipeline parse (text layer/OCR) → chunking giữ dấu vết trang → trích xuất hybrid có thể nhận diện phần lớn chỉ tiêu trong văn bản hành chính chuẩn mực cấp phường.
- **Cách đo**: tỷ lệ chỉ tiêu nhận diện được (recall theo tài liệu) trên evaluation dataset có ground truth; đối chiếu thủ công qua màn hình xác minh.
- **Trạng thái**: **đã trả lời một phần**. Vertical slice hoạt động đầu-cuối trên bộ tài liệu mẫu synthetic (`samples/`); smoke test E-001 nhận diện đúng 4/4 chỉ tiêu với quote nguyên văn. Chưa có số liệu trên dataset đánh giá có version (giai đoạn 6).

## RQ2 — Rule-based, cloud LLM, local LLM, RAG hay fine-tuned model: phương án nào phù hợp cho bài toán này?

- **Nội dung**: so sánh các họ phương án trích xuất theo độ chính xác, chi phí, riêng tư và khả năng vận hành trên hạ tầng phường.
- **Ràng buộc đã chốt**: **cloud LLM bị loại khỏi phạm vi so sánh thực nghiệm** vì (a) văn bản hành chính có thể chứa dữ liệu cá nhân/nội bộ, không được gửi ra dịch vụ bên ngoài; (b) đề tài không có ngân sách API. Đây là ràng buộc thiết kế được ghi nhận, không phải kết luận thực nghiệm về chất lượng cloud LLM.
- **Giả thuyết**: hybrid (LLM local chính + rule-based bổ khuyết/fallback, quyết định D-007) cho chất lượng tốt hơn từng phương án đơn lẻ; fine-tune chỉ đáng làm khi có bằng chứng prompt+schema đã tối ưu mà vẫn thiếu chất lượng.
- **Cách đo**: benchmark cùng dataset cho rule-based thuần, LLM thuần, hybrid (E-003 theo kế hoạch); RAG đánh giá riêng ở giai đoạn 7 cho bài toán tra cứu.
- **Trạng thái**: **đã trả lời một phần**. Kiến trúc hybrid đã hiện thực và chạy được (D-007); lựa chọn model có căn cứ benchmark công khai VMLU/VN-MTEB (02-model-selection.md); E-001 xác nhận local LLM 4B trích xuất structured tiếng Việt được trên GPU 4GB. So sánh định lượng giữa các phương án chờ giai đoạn benchmark.

## RQ3 — Độ chính xác trích xuất theo từng trường đạt mức nào?

- **Nội dung**: đo riêng từng trường: tên chỉ tiêu, giá trị, đơn vị, thời gian (tần suất/hạn/năm), đơn vị chủ trì, căn cứ pháp lý.
- **Giả thuyết**: các trường "cứng" (giá trị, đơn vị) đạt độ chính xác cao hơn các trường suy luận (tần suất, phòng ban); quan sát ban đầu E-001 (tần suất sai 2/4 khi văn bản không nêu rõ) ủng hộ giả thuyết và đã dẫn tới quy tắc prompt số 7.
- **Cách đo**: precision/recall/F1 và exact-match per field trên `eval/dataset-v1`; numeric accuracy cho giá trị; hallucination rate qua kiểm chứng sourceQuote (quote không khớp chunk ⇒ nghi bịa).
- **Trạng thái**: **chưa trả lời** — hạ tầng đo (fieldConfidence, sourceQuote verification) đã có trong sản phẩm; số liệu chờ E-003.

## RQ4 — Giảm được bao nhiêu thao tác nhập thủ công?

- **Nội dung**: so sánh quy trình "gõ tay toàn bộ trường" với quy trình "đối chiếu – sửa trường sai – duyệt".
- **Giả thuyết**: số trường phải gõ tay giảm đáng kể; công sức chuyển từ nhập liệu sang xác minh.
- **Cách đo**: % trường được AI điền đúng không cần sửa (suy từ `editedFields` của ứng viên đã duyệt); số thao tác/thời gian cho cùng một văn bản giữa hai quy trình.
- **Trạng thái**: **chưa trả lời** — hệ thống đã ghi `editedFields` và `humanEdited` làm dữ liệu đo; chờ giai đoạn benchmark + dùng thử.

## RQ5 — Điều hành bằng tiếng Việt tự nhiên đạt độ chính xác và khả năng kiểm chứng thế nào?

- **Nội dung**: IOC Copilot (giai đoạn 8) trả lời câu hỏi điều hành và thao tác qua tool-calling; câu trả lời phải kèm nguồn kiểm chứng được, thao tác ghi phải qua preview + xác nhận.
- **Giả thuyết**: agent với tool có schema (không sinh SQL tự do) + trích nguồn citation cho phép điều hành tiếng Việt an toàn ở mức tác vụ giới hạn.
- **Cách đo**: bộ câu hỏi đánh giá tiếng Việt (đúng/sai theo dữ liệu thật), tỷ lệ câu trả lời có nguồn đúng, tỷ lệ tool-call hợp lệ.
- **Trạng thái**: **chưa triển khai** (giai đoạn 8).

## RQ6 — AI cục bộ có đáp ứng yêu cầu tốc độ, chi phí, riêng tư và cấu hình máy không?

- **Nội dung**: toàn bộ AI chạy trên máy phổ thông (GTX 1650 4GB VRAM, 16GB RAM) — có đủ nhanh cho quy trình nghiệp vụ, chi phí 0 đồng API, dữ liệu không rời hệ thống?
- **Giả thuyết**: đủ cho pipeline bất đồng bộ (người dùng không chờ trực tiếp), không đủ cho chat realtime dài — cần kiến trúc né điểm yếu này.
- **Cách đo**: tok/s, thời gian trích xuất/chunk và /tài liệu, mức offload GPU, thời gian OCR/trang.
- **Trạng thái**: **đã trả lời một phần**. E-001 đo được ~8–10 tok/s, 52–64s/chunk (~500 token) sau tối ưu flash-attention + KV q8_0, GPU offload 67–73%; KNOWN_ISSUES ghi nhận 1 tài liệu 5–10 trang mất 3–10 phút chạy nền — chấp nhận được cho pipeline bất đồng bộ, không phù hợp chat realtime. Số liệu OCR (CER, thời gian/trang) chờ E-004.
