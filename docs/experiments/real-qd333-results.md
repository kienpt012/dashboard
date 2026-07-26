# Thực nghiệm trên văn bản thật — Bộ QĐ 333/QĐ-UBND TPHCM (2026)

Ngày chạy: 26–27/07/2026. Đây là lần đầu pipeline chạy trên **văn bản hành chính thật** (không phải
synthetic): bộ QĐ 333 giao chỉ tiêu 2026 của UBND TPHCM, cấu trúc hoàn toàn khác dataset-v1
(bảng nhiều cột phẳng hóa từ PDF ký số, giá trị dạng khoảng, đơn vị chủ trì cấp Sở).

## Bộ tài liệu

| Tệp | Trang | Đặc điểm | Trạng thái test |
|---|---|---|---|
| PL1 — Chỉ tiêu KTXH chủ yếu 2026 | 4 | PDF ký số có text layer, bảng STT/chỉ tiêu/ĐVT/kế hoạch/đơn vị chủ trì | ✅ đã trích xuất + duyệt qua Copilot |
| Bảng chỉ tiêu phường Lái Thiêu (XLSX) | 8 sheet | Ô gộp dày đặc, 64 chunk sau khi nén | ◐ đang trích xuất nền |
| QĐ giao nhiệm vụ 2026 | 12 | Văn xuôi pháp lý | ☐ chưa đưa vào (ưu tiên GPU) |
| PL3 — Chương trình công tác | 29 | Danh mục đầu việc (không phải chỉ tiêu định lượng) | ☐ ngoài phạm vi chỉ tiêu |
| PL2 — Chỉ tiêu cấp xã | **336** | Bài toán quy mô: ~19MB | ☐ chiến lược: trần EXTRACTION_MAX_LLM_CHUNKS + ghi chú job (đã cài), cần thêm lọc trang theo đơn vị trước khi chạy thật |

## Kết quả PL1 (đo tay trên 19 ứng viên sinh ra)

- **13/19 ứng viên sạch, confidence 0.99**: tên, giá trị, đơn vị, chiều hướng, đơn vị chủ trì (thật:
  "Thống kê Thành phố", "Sở Y tế"…) đều đúng. Các ca khó xử lý đúng theo prompt v3:
  "> 10%" → 10; "2 - 3%" → 2 (cận dưới); "9.800 USD/người" → 9800 + đơn vị "USD/người";
  bảng không có cột tần suất → frequency null (không đoán bừa).
- **6/19 ứng viên lỗi (tên dính STT, đứt dòng giữa 2 chunk) — đều bị hệ thống tự chấm 0.64–0.7**:
  cơ chế calibrate confidence hoạt động đúng vai trò điều hướng sự chú ý người xác minh.
- Đơn vị chủ trì cấp Sở **cố ý không** được gán vào phòng ban phường (ngưỡng Dice không đạt) —
  đúng nguyên tắc "thà để trống cho người chọn còn hơn gán sai".

## Cải tiến rút ra từ dữ liệu thật (đã ship trong phiên)

1. XLSX ô gộp: exceljs nhân bản giá trị vùng gộp theo từng ô/hàng → nén ô trùng liên tiếp + bỏ dòng lặp.
2. Prompt v3: giá trị khoảng/so sánh, tần suất null-when-absent, hướng dẫn đọc bảng nhiều cột, chống nhầm STT.
3. Bóc số thứ tự dính đầu tên ứng viên; khử trùng lặp mờ giữa chunk chồng lấn (Dice ≥ 0.8, giữ bản confidence cao).
4. Trần `EXTRACTION_MAX_LLM_CHUNKS` (mặc định 40) + `ExtractionJob.note` cho tài liệu trăm trang.
5. Copilot: guard chống planner "bịa" bộ lọc — filter (lĩnh vực/văn bản) chỉ được áp khi cụm từ
   thật sự có trong câu lệnh (phát hiện khi planner tự thêm "kinh tế" vào lệnh không có chữ đó).

## Copilot v2 trên dữ liệu thật (browser E2E)

Câu lệnh nguyên văn của người dùng: *"Trong kho văn bản phụ lục 1 đang có chỉ tiêu kinh tế mới được
ban hành năm 2026 đó, duyệt hết và up lên giúp tôi đi"* →

1. Planner (LLM) nhận diện intent BULK_APPROVE_CANDIDATES, tự khớp "phụ lục 1" → VB-2026-0005
   (file `_PL1_CHI_TIEU_2026...`) bằng heuristic phụ-lục + Dice, lọc "kinh tế" đúng như câu nói.
2. Hệ thống **không ghi gì**, tạo AgentAction PROPOSED + bảng xem trước (tên/giá trị/phòng ban/độ tin cậy),
   hết hạn 15 phút.
3. Người dùng bấm **Xác nhận** → từng ứng viên đi qua đúng hàm duyệt dùng chung (cấp mã, transaction,
   audit) → kết quả từng mục hiển thị (✓ CT-2026-KTHTDT-001) → chỉ tiêu lên Danh mục + Dashboard.
4. Chuỗi audit: COPILOT_QUERY → AGENT_ACTION_PROPOSED → AI_CANDIDATE_APPROVED + TARGET_CREATED
   (metadata fromCandidate/documentCode/model/confidence) → AGENT_ACTION_EXECUTED.
5. Ứng viên nghi trùng và thiếu trường bị loại khỏi kế hoạch với lời giải thích — không bao giờ duyệt mù.

## Bài học quy mô

- Bảng thật dày chỉ tiêu: 1 chunk sinh 15–25 ứng viên ≈ 3–6 phút GPU/chunk (PL1 3 chunk ≈ 15 phút).
- XLSX 8 sheet → 64 chunk ≈ hàng giờ: trần chunk + chạy nền + note là bắt buộc; hướng tiếp theo cho
  PL2 336 trang: lọc trang theo tên đơn vị trước khi chunk (chỉ giữ trang chứa "Lái Thiêu").
