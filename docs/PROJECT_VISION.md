# Tầm nhìn dự án — IOC Lái Thiêu · Nền tảng IOC thông minh

Tài liệu định hướng cho đề tài nghiên cứu ứng dụng. Hiện trạng chi tiết: [research/01-current-system-assessment.md](research/01-current-system-assessment.md). Câu hỏi nghiên cứu: [RESEARCH_QUESTIONS.md](RESEARCH_QUESTIONS.md).

## 1. Vấn đề

Hệ thống điều hành IOC cấp phường hiện tại (NestJS + Prisma + PostgreSQL + React) vận hành hoàn toàn bằng **nhập liệu thủ công**:

- Mỗi chỉ tiêu kinh tế – xã hội phải được quản trị viên gõ tay hơn 10 trường (tên, giá trị, đơn vị, chu kỳ, hạn, phòng ban…), trong khi toàn bộ thông tin đó **đã tồn tại** trong các văn bản hành chính (kế hoạch, quyết định, báo cáo, công văn).
- Số liệu cập nhật theo kỳ chỉ nhập được bằng tay hoặc qua phiếu Excel cứng nhắc do chính hệ thống sinh ra; hệ thống không đọc được văn bản/bảng tính bên ngoài.
- Không có kho văn bản nguồn: chỉ tiêu trong hệ thống không gắn với căn cứ pháp lý nào, gây khó khăn khi đối soát và giải trình.
- Văn bản đến ở nhiều định dạng không đồng nhất (DOCX, XLSX, PDF có text layer, PDF scan, ảnh chụp), cán bộ văn thư phải đọc và chép tay lại.

Hệ quả: điểm nghẽn nhập liệu làm dashboard chậm cập nhật, dễ sai sót khi chép tay, và không truy vết được nguồn gốc số liệu.

## 2. Tuyên bố tầm nhìn

> Chuyển IOC phường Lái Thiêu từ "dashboard nhập tay" thành **nền tảng điều hành thông minh**: hệ thống tự tiếp nhận văn bản hành chính, AI cục bộ trích xuất chỉ tiêu kèm căn cứ nguyên văn, con người xác minh và phê duyệt, dữ liệu chính thức luôn truy vết được về văn bản gốc — toàn bộ chạy trên hạ tầng tại chỗ, không gửi dữ liệu ra ngoài.

Giai đoạn sau mở rộng sang tra cứu tri thức (RAG) và điều hành bằng tiếng Việt tự nhiên (IOC Copilot) — xem [ROADMAP.md](ROADMAP.md).

## 3. Người dùng mục tiêu

| Nhóm | Nhu cầu chính |
|---|---|
| **Lãnh đạo phường** | Nhìn nhanh bức tranh chỉ tiêu, tin được số liệu vì mỗi con số truy ngược được về văn bản và người duyệt; giảm thời gian chờ tổng hợp. |
| **Văn thư** | Tải văn bản đến lên "Kho văn bản" thay vì chép tay; theo dõi trạng thái xử lý tự động. |
| **Cán bộ chuyên môn (STAFF/MANAGER)** | Xác minh kết quả AI trích xuất trên màn hình đối chiếu nguồn, chỉnh sửa trước khi trình duyệt; giảm thao tác nhập lặp lại. |

## 4. Giá trị cốt lõi

1. **Giảm thao tác nhập thủ công**: từ "gõ lại từng trường" thành "đối chiếu – sửa – duyệt" (đo lường ở RQ4).
2. **Provenance đầy đủ**: mọi chỉ tiêu do AI đề xuất mang theo tài liệu nguồn, trang, câu trích nguyên văn, model, phiên bản prompt và độ tin cậy từng trường; chỉ tiêu chính thức ghi `legalBasis` + `sourceDocumentId`.
3. **Local-first, riêng tư**: Qwen3-4B + bge-m3 qua Ollama, Tesseract OCR tiếng Việt — không API cloud, không chi phí token, văn bản hành chính không rời máy chủ phường.
4. **Chịu lỗi có kiểm soát**: pipeline bất đồng bộ (outbox + worker), khi LLM tắt hệ thống vẫn trích xuất được bằng luật (graceful degradation).
5. **Kế thừa kỷ luật dữ liệu sẵn có**: optimistic locking, audit trong transaction, mô hình duyệt của Import Excel được tái dùng làm trust-boundary cho dữ liệu AI.

## 5. Ranh giới con người kiểm soát (bất biến)

- **Mọi dữ liệu chính thức đều qua người duyệt**: AI chỉ tạo `IndicatorCandidate` ở trạng thái PROPOSED; chỉ ADMIN duyệt mới tạo Target thật (qua đúng hàm cấp mã dùng chung). Không có auto-approve.
- Ứng viên đã được người chỉnh sửa (`humanEdited`) không bao giờ bị trích xuất lại ghi đè.
- Nội dung tài liệu và đầu ra LLM luôn được coi là **dữ liệu không đáng tin**: được validate, không bao giờ được thực thi như mệnh lệnh.
- Mọi thao tác duyệt/từ chối/chỉnh sửa ghi audit log kèm danh tính người thao tác.

## 6. Ngoài phạm vi giai đoạn prototype (non-goals)

- Không auto-approve, không để AI ghi thẳng dữ liệu chính thức.
- Không dùng LLM cloud (ràng buộc riêng tư dữ liệu hành chính + không có ngân sách API — xem RQ2).
- Không fine-tune model khi chưa đủ điều kiện tiên quyết (xem [AI_MODEL_STRATEGY.md](AI_MODEL_STRATEGY.md)).
- Không tách microservice/Python sidecar (quyết định D-001), không Redis/BullMQ (D-004), không object storage (D-008) — ghi nhận là đường nâng cấp production.
- Không xử lý chữ viết tay, chữ ký số, hay quét mã độc tệp tải lên (ghi ở KNOWN_ISSUES / [SECURITY.md](SECURITY.md)).
- Không thay đổi nghiệp vụ điều hành hiện có (phản ánh công dân, import Excel, công bố công khai) — lớp AI chỉ bổ sung, không phá vỡ.
