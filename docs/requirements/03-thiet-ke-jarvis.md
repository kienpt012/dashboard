# Thiết kế Jarvis — trợ lý điều hành

Trạng thái: bản thiết kế, triển khai theo từng giai đoạn (mỗi giai đoạn dùng được ngay, có bộ đánh giá đi kèm).

## 1. Hiện trạng (10/2026)

- Hiểu câu hỏi: bộ luật từ khoá, dự phòng bằng Qwen3 4B cục bộ (Ollama, đầu ra JSON theo lược đồ) — 8 ý định:
  tổng quan, liệt kê chỉ tiêu, chỉ tiêu nguy cơ, thiếu báo cáo, tìm văn bản, đề xuất AI, duyệt hàng loạt đề xuất, trợ giúp.
- Trả lời: ghép mẫu câu từ dữ liệu thật — không bịa số. Thao tác ghi (duyệt hàng loạt) chỉ chạy khi bấm nút xác nhận.
- Giọng nói: Web Speech API (vi-VN), chế độ gọi tên mặc định tắt, chỉ bật được trong bánh răng của khung Jarvis.
- Giao diện: ngăn kéo bên phải dạng khung trò chuyện.

### Vì sao "Hey Jarvis" không phản hồi
1. Chế độ gọi tên mặc định **tắt**, nút bật nằm sâu trong khung Jarvis — người dùng không biết phải bật.
2. Không hiển thị trình duyệt đang nghe được gì, nên khi nhận dạng ra chữ khác ("hây gia vịt", "giác vy"…) và không
   khớp tên gọi, người dùng không có cách nào biết.
3. Bộ khớp tên chỉ nhận một số cách viết cố định; thiếu các biến thể vùng miền và tiền tố "hey/hây/ê".
4. Micro chỉ dùng được trên HTTPS hoặc localhost; truy cập bằng địa chỉ IP nội bộ qua HTTP thì công tắc bị khoá.

## 2. Mục tiêu

Jarvis trả lời đúng, có căn cứ, theo ngữ cảnh màn hình người dùng đang xem; giải thích được mọi con số trên giao diện;
hướng dẫn cách làm; chuẩn bị thao tác để người dùng bấm xác nhận. Ví dụ chuẩn:

| Câu hỏi | Jarvis cần |
|---|---|
| "Jarvis, cái số 40% đó nghĩa là gì?" | Biết màn hình hiện tại có những con số nào, chọn đúng số 40% (hoặc số vừa trỏ chuột), giải thích định nghĩa, công thức, các thành phần cụ thể tạo ra 40% |
| "Vì sao phòng Văn hóa – Xã hội có nguy cơ?" | Liệt kê chỉ tiêu kéo tiến độ xuống, kỳ thiếu báo cáo, việc chưa giao |
| "Chỉ tiêu hộ nghèo đang thế nào?" | Tìm chỉ tiêu gần đúng tên, tóm tắt hồ sơ: kết quả, chỉ tiêu giao, tiến độ, người phụ trách, hạn |
| "Làm sao để báo cáo số liệu tháng này?" | Trả lời từ Hướng dẫn sử dụng, kèm nút mở đúng màn hình |
| "Nhắc phòng Kinh tế báo cáo quý 3" | Chuẩn bị thông báo nhắc việc, chờ người dùng bấm xác nhận |

## 3. Kiến trúc

```
Trình duyệt                                   Máy chủ (NestJS)
┌──────────────────────────┐   câu hỏi +     ┌──────────────────────────────────────────┐
│ Ngữ cảnh màn hình         │──ngữ cảnh──────▶│ 1. Hiểu câu: luật → Qwen3 (JSON lược đồ)  │
│  mã màn hình, đối tượng   │                 │    ý định + tham số + tham chiếu ngữ cảnh │
│  đang mở, các con số đang │                 │ 2. Công cụ dữ liệu (chỉ đọc, theo quyền)  │
│  hiển thị, số vừa trỏ     │                 │ 3. Từ điển chỉ số (định nghĩa, công thức) │
│ Giọng nói, hiệu ứng gọi   │◀──câu trả lời───│ 4. Tri thức HDSD (tìm theo embedding)     │
│ Thẻ trả lời, nút thao tác │  + dẫn chứng    │ 5. Soạn câu: mẫu xác định, tuỳ chọn LLM    │
└──────────────────────────┘  + thao tác     │    viết lại — số liệu phải khớp dữ kiện   │
                                              │ 6. Thao tác ghi → hàng chờ xác nhận       │
                                              └──────────────────────────────────────────┘
```

### 3.1 Ngữ cảnh màn hình
Mỗi màn hình đăng ký với Jarvis (React context) một bản tóm tắt: mã màn hình (DH-01…), đối tượng đang mở
(bộ chỉ tiêu, chỉ tiêu, phòng ban, năm), và danh sách con số đang hiển thị dạng `{ key, nhãn, giá trị, đơn vị }`
(ví dụ `framework.progress` "Tiến độ chung" 40 %). Con số người dùng vừa trỏ chuột hoặc bấm được đánh dấu `focus`.
Câu "số 40% đó" được giải bằng cách khớp giá trị/đơn vị trong danh sách, ưu tiên số đang `focus`.

### 3.2 Từ điển chỉ số (nguồn sự thật duy nhất)
Một tệp khai báo phía máy chủ cho mọi chỉ số xuất hiện trên giao diện: định nghĩa, cách tính, hàm lấy thành phần.
Dùng chung cho Jarvis, chú giải (tooltip) trên giao diện và mục 1.5 của Hướng dẫn sử dụng — một chỗ sửa, mọi nơi khớp.
Chỉ tiêu tự tính dùng `outlineFormula` (tử số, mẫu số, số bản ghi khớp) đã có trong hồ sơ chỉ tiêu.

### 3.3 Công cụ dữ liệu
Chỉ đọc, luôn lọc theo quyền của người hỏi (dùng lại tầng truy vấn hiện có): tổng quan; xếp hạng phòng/người;
hồ sơ một chỉ tiêu; giải thích chỉ số; thiếu báo cáo; việc treo; trách nhiệm (tự thông qua, chuyển trả, giải trình);
phản ánh; văn bản; đề xuất; việc của tôi.

### 3.4 Tri thức Hướng dẫn sử dụng
Các mục Markdown trong `docs/huong-dan-su-dung/noi-dung/` được cắt theo đề mục, nhúng bằng bge-m3, lưu kèm mã màn hình.
Câu hỏi "làm sao…" trả về đoạn hướng dẫn liên quan + nút mở màn hình.

### 3.5 Soạn câu trả lời
Mặc định ghép mẫu câu từ dữ kiện (nhanh, không sai số). Khi Ollama sẵn sàng, cho phép mô hình viết lại cho tự nhiên,
nhưng kiểm tra mọi con số trong câu viết lại đều có trong dữ kiện; lệch thì dùng bản ghép mẫu.
Mỗi câu trả lời kèm dẫn chứng (liên kết hồ sơ) và gợi ý câu hỏi tiếp theo.

### 3.6 Thao tác
Chỉ chuẩn bị, không tự chạy: mở màn hình (chạy ngay, không đổi dữ liệu); nhắc việc; yêu cầu giải trình (lãnh đạo);
giao chỉ tiêu (trưởng phòng); duyệt hàng loạt đề xuất. Lệnh ghi luôn chờ bấm nút, kể cả khi hỏi bằng giọng nói;
ghi nhật ký `AGENT_ACTION_*`.

### 3.7 Hội thoại
Nhớ 10 lượt gần nhất và các đối tượng vừa nhắc ("phòng đó", "chỉ tiêu này") trong phiên trình duyệt.

## 4. Giao diện

- **Hiệu ứng triệu hồi** (khi gọi tên hoặc bấm biểu tượng): lớp phủ toàn màn hình khoảng 1,5 giây — vòng hạt sáng
  hội tụ, chữ JARVIS nhiễu rồi rõ dần, lời chào "Xin chào, tôi là Jarvis", sau đó thu về khung trợ lý.
  Tắt được trong **Cấu hình › Jarvis › Hiệu ứng khi gọi** (toàn hệ thống); tự tắt khi máy bật "giảm chuyển động".
- **Khung trợ lý**: lõi phản ứng hồ quang phản ánh trạng thái (chờ, nghe, nghĩ, nói), sóng âm khi nghe, dòng "đã nghe",
  thẻ trả lời có số liệu nổi bật và liên kết, gợi ý theo màn hình hiện tại.
- **Gọi bằng tên**: công tắc "Jarvis lắng nghe" ngay trên thanh đầu trang; lần đầu hướng dẫn cấp quyền micro;
  khớp tên theo âm (gi/d/r/ch → j; đuôi s/t/ch/x), chấp nhận "hey/hây/ê/ơi Jarvis".

## 5. Lộ trình

| Giai đoạn | Nội dung | Kiểm chứng |
|---|---|---|
| J1 | Sửa gọi tên (công tắc trên đầu trang, hiện "đã nghe", khớp theo âm); hiệu ứng triệu hồi + cài đặt tắt | Thử với bộ câu ghi âm giả lập; ảnh chụp |
| J2 | Ngữ cảnh màn hình + từ điển chỉ số + giải thích con số ("40% đó là gì") | Bộ câu hỏi theo từng màn hình |
| J3 | Công cụ dữ liệu mở rộng: xếp hạng phòng/người, hồ sơ chỉ tiêu, trách nhiệm, phản ánh, việc của tôi | Kiểm thử đơn vị cho từng công cụ |
| J4 | Tri thức Hướng dẫn sử dụng (embedding) + thao tác mở màn hình | Câu hỏi "làm sao…" |
| J5 | Thao tác ghi mới (nhắc việc, yêu cầu giải trình, giao chỉ tiêu) qua hàng chờ xác nhận | Kiểm thử quyền |
| J6 | Bộ đánh giá `eval/jarvis/` ≥ 200 câu tiếng Việt, chấm ý định, tham số, số liệu; chạy trong CI | Tỷ lệ đúng ≥ 95% |

"Huấn luyện" ở đây là: từ điển chỉ số, ví dụ mẫu trong lời nhắc hệ thống, tri thức Hướng dẫn sử dụng và bộ đánh giá
dùng để cải tiến liên tục — không tinh chỉnh trọng số mô hình, để chạy được trên máy chủ không có GPU.
