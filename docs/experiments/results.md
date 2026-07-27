# Kết quả thí nghiệm — Trích xuất chỉ tiêu (dataset-v1)

Ngày chạy: 26/07/2026 · Máy: GTX 1650 4GB, i5-10300H · Model: `qwen3:4b-instruct-2507-q4_K_M`.
File nguồn tái lập (JSON + CSV) trong [results/](results/):

- rule: `benchmark-2026-07-26T13-42-25.*`
- hybrid: `benchmark-2026-07-26T15-17-01.*` (2/5 tài liệu dùng nhánh dự phòng luật do lời gọi LLM
  vượt trần headersTimeout 300s của undici — đúng hành vi graceful degradation của production)
- llm: `benchmark-2026-07-26T15-38-49.*` (sau khi chuyển OllamaService sang streaming, không còn trần 300s)
- Các lần chạy 13-40, 14-17, 14-35 bị loại vì nhiễu hạ tầng (tranh chấp GPU / trần timeout) —
  giữ nguyên file để minh bạch, lý do ghi ở [experiment-plan.md](experiment-plan.md).

## Mức chỉ tiêu (28 chỉ tiêu chuẩn, 5 tài liệu, micro-average)

| Phương án | Precision | Recall | F1 | Thời gian trích xuất tổng |
|---|---|---|---|---|
| rule (luật tiếng Việt) | 0.90 | 0.643 | **0.75** | **0.02 giây** |
| llm (Qwen3-4B structured) | 1.00 | 1.00 | **1.00** | ~19.6 phút |
| hybrid (production) | 1.00 | 1.00 | **1.00** | ~20.2 phút |

## Mức trường (trên các cặp đã khớp)

| Trường | rule | llm | hybrid |
|---|---|---|---|
| Giá trị mục tiêu | 1.00 | 1.00 | 1.00 |
| Đơn vị đo | 1.00 | 1.00 | 1.00 |
| Chiều hướng | 1.00 | 1.00 | 1.00 |
| Tần suất báo cáo | **0.944** | 0.75 | 0.75 |
| Hạn hoàn thành | **1.00** | 0.857 | 0.929 |
| Đơn vị chủ trì | 0.944 | 0.929 | **0.964** |

## Theo loại tài liệu (F1 mức chỉ tiêu)

| Tài liệu | rule | llm | hybrid |
|---|---|---|---|
| DOCX kế hoạch (văn xuôi, 8 CT) | 1.00 | 1.00 | 1.00 |
| PDF scan cùng nội dung (OCR) | 1.00 | 1.00 | 1.00 |
| PDF quyết định (dạng "Điều 1", 3 CT) | 0.40 | 1.00 | 1.00 |
| PNG ảnh quyết định (OCR) | 0.40 | 1.00 | 1.00 |
| **XLSX bảng báo cáo (6 CT)** | **0.00** | **1.00** | **1.00** |

## Phát hiện chính

1. **Luật thắng tuyệt đối về chi phí** (20ms so với ~20 phút) và đạt F1=1.0 trên văn xuôi kế hoạch
   chuẩn mực — nhưng **mù hoàn toàn với bảng** (XLSX 0/6) và yếu với cấu trúc quyết định
   ("Lắp đặt mới 25 điểm camera..." tách dòng làm mất ngữ cảnh trigger).
2. **LLM đọc được mọi cấu trúc** kể cả bảng và bản OCR — trả lời RQ1/RQ2: với văn bản không đồng
   nhất, local LLM 4B là thành phần bắt buộc, luật không thay thế được.
3. **Điểm yếu nhất quán của LLM: đoán tần suất khi văn bản không nêu** (bảng XLSX không có cột tần
   suất nhưng model điền MONTHLY thay vì null — 6/7 lỗi tần suất). Hướng xử lý: siết prompt
   ("bảng không có cột tần suất ⇒ null") hoặc hậu xử lý đặt null khi từ khóa tần suất không xuất
   hiện trong sourceQuote. Đây là dữ liệu đầu vào tốt cho vòng lặp cải tiến prompt v3.
4. **Hybrid = LLM khi hạ tầng khỏe, = rule khi LLM hỏng**: trong lần chạy hybrid, 2 tài liệu có lời
   gọi LLM chết vì trần 300s nhưng pipeline vẫn ra 8/8 nhờ luật — đúng thiết kế chịu lỗi;
   sau đó lỗi gốc được sửa triệt để bằng streaming.
5. **OCR không làm giảm chất lượng trích xuất** trên bản scan chất lượng tốt (F1 bằng bản text ở cả
   3 phương án); chi phí thêm ~8–14s/trang render+OCR. Cơ chế kiểm chứng quote phát huy tác dụng khi
   OCR làm lệch ký tự (1 ứng viên trong E2E bị hạ trần confidence 0.4 do quote không khớp nguyên văn).
6. **Hai lỗi hạ tầng tìm được nhờ benchmark** (giá trị của thí nghiệm có hệ thống):
   trần `OLLAMA_TIMEOUT_MS` 240s làm rớt chunk nhiều chỉ tiêu (sửa: 480s) và trần headersTimeout
   300s của undici fetch (sửa: chuyển streaming). Không benchmark thì hai lỗi này chỉ lộ ra ở
   production với tài liệu dày.

## Trả lời câu hỏi nghiên cứu (đến thời điểm này)

- **RQ2**: hybrid (LLM chính + luật dự phòng) là cấu hình đúng: chất lượng của LLM, độ bền của luật,
  chi phí 0 đồng API. Cloud LLM không cần thiết cho quy mô phường ở độ chính xác này.
- **RQ3**: giá trị/đơn vị/chiều hướng đạt 100%; đơn vị chủ trì 93–96%; tần suất là trường yếu nhất (75%)
  với nguyên nhân đã định vị được.
- **RQ4** (ước lượng từ slice): một chỉ tiêu nhập tay cần ~10 trường; luồng AI cần 1 lần đối chiếu +
  1 nhấp duyệt (+ sửa trung bình <1 trường theo field accuracy trên) — đo chính thức "human correction
  rate" sẽ thực hiện khi có người dùng thật thao tác trên UI.
- **RQ6**: máy 4GB VRAM chạy được toàn bộ; đổi lại thời gian xử lý phút-cấp phải chấp nhận kiến trúc
  bất đồng bộ (đã có) và các trần timeout phải nới đúng chỗ (đã sửa).
