# Phần 1. Tổng quan

## 1.1 Giới thiệu hệ thống

Hệ thống Trung tâm điều hành thông minh (IOC) cấp xã giúp Ủy ban nhân dân xã, phường, đặc khu theo dõi việc thực hiện
các chỉ tiêu được giao và quy trách nhiệm cho từng khâu. Nguyên tắc chung là **từ dữ liệu đến trách nhiệm**:

- Mỗi con số trên màn hình đều truy được nguồn: lấy từ kho dữ liệu nghiệp vụ, hoặc do cán bộ báo cáo kèm minh chứng.
- Mỗi chỉ tiêu có phòng chủ trì, có người phụ trách, có hạn báo cáo theo kỳ.
- Mỗi việc chờ xử lý (duyệt báo cáo, duyệt đề xuất, trả lời giải trình, xử lý phản ánh) đều có thời hạn. Quá hạn,
  hệ thống tự xử lý theo quy định (ví dụ tự thông qua báo cáo) và ghi nhận trách nhiệm của người để chậm.

Hệ thống gồm hai khu vực:

| Khu vực | Địa chỉ | Người dùng |
|---|---|---|
| Cổng thông tin công khai | `http://<địa-chỉ-máy-chủ>` | Người dân: xem kết quả thực hiện, gửi và tra cứu phản ánh |
| Khu vực quản trị | `http://<địa-chỉ-máy-chủ>/admin` | Cán bộ, công chức có tài khoản |

> Địa chỉ cụ thể do quản trị viên cung cấp. Khi cài trên một máy tính, địa chỉ mặc định là `http://localhost:8080`.

## 1.2 Vai trò người dùng

Mỗi tài khoản có một vai trò. Vai trò quyết định menu được thấy và thao tác được làm. Trưởng phòng, chuyên viên và
người xem chỉ thấy số liệu của phòng mình; lãnh đạo, văn thư và quản trị thấy toàn bộ đơn vị.

| Vai trò | Phạm vi | Công việc chính |
|---|---|---|
| Quản trị hệ thống | Toàn đơn vị | Thiết lập địa phương, quản lý tài khoản, cấu hình thời hạn, trang công khai, xem nhật ký và báo lỗi |
| Lãnh đạo UBND | Toàn đơn vị | Theo dõi điều hành, chỉ đạo, đánh giá chỉ tiêu, yêu cầu giải trình, duyệt đề xuất và báo cáo |
| Văn thư | Toàn đơn vị | Tiếp nhận văn bản, rà soát kết quả trích xuất, trình đề xuất chỉ tiêu, quản lý bộ chỉ tiêu và kho dữ liệu |
| Trưởng phòng | Phòng mình | Giao chỉ tiêu cho chuyên viên, duyệt số liệu, trả lời giải trình, đánh giá chỉ tiêu của phòng |
| Chuyên viên | Phòng mình | Báo cáo số liệu kèm minh chứng, nhập Excel, đề xuất chỉ tiêu, xử lý phản ánh được giao |
| Người xem | Phòng mình | Chỉ xem, không thay đổi dữ liệu |

Bảng sau tóm tắt màn hình nào xuất hiện trong menu của từng vai trò (✓ có, — không có).

| Màn hình | Quản trị | Lãnh đạo | Văn thư | Trưởng phòng | Chuyên viên | Người xem |
|---|---|---|---|---|---|---|
| Trung tâm điều hành, Việc của tôi, Trình chiếu | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Trách nhiệm | ✓ | ✓ | — | ✓ | — | — |
| Bộ chỉ tiêu, Danh mục chỉ tiêu, Đề xuất chỉ tiêu | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Duyệt báo cáo | ✓ | ✓ | — | ✓ | — | — |
| Báo cáo tổng hợp, Kho dữ liệu, Kho văn bản | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Nhập số liệu Excel | ✓ | ✓ | — | ✓ | ✓ | — |
| Phản ánh, Phòng ban, Hồ sơ cá nhân | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Trang công khai, Thiết lập địa phương, Tài khoản, Cấu hình, Nhật ký hệ thống, Báo lỗi | ✓ | — | — | — | — | — |

> Giao diện chỉ ẩn những nút không có quyền; quyền cuối cùng luôn do máy chủ kiểm tra. Một số thao tác còn phụ thuộc
> vai trò trong từng chỉ tiêu, ví dụ chỉ chuyên viên đang phụ trách mới được chuyển việc hoặc trả việc.

## 1.3 Đăng nhập và đăng xuất

![Màn hình đăng nhập|70](anh/tq-dang-nhap.png)

#### Đăng nhập
1. Mở địa chỉ khu vực quản trị, hoặc bấm `Cán bộ đăng nhập` ở góc phải cổng thông tin công khai.
2. Nhập `Tên đăng nhập` và `Mật khẩu` do quản trị viên cấp.
3. Bấm `Đăng nhập`. Hệ thống mở **Trung tâm điều hành**.

Lần đăng nhập đầu tiên, hãy đổi mật khẩu tại **Hồ sơ cá nhân** (mục 2.5). Mật khẩu phải có tối thiểu 10 ký tự, gồm chữ
hoa, chữ thường, chữ số và ký tự đặc biệt.

#### Khôi phục mật khẩu khi quên
1. Tại màn hình đăng nhập, bấm `Quên mật khẩu?`.
2. Nhập `Tên đăng nhập hoặc email công vụ`, bấm `Gửi mã xác thực`. Hệ thống gửi mã 6 chữ số tới email công vụ của tài khoản.
3. Nhập `Mã xác thực` và xác nhận. Nếu chưa nhận được thư, bấm `Gửi lại mã` sau thời gian chờ.
4. Nhập `Mật khẩu mới`, `Nhập lại mật khẩu`, rồi xác nhận để hoàn tất.

![Khôi phục mật khẩu qua mã xác thực gửi tới email công vụ|70](anh/tq-quen-mat-khau.png)

> Tài khoản chưa khai email công vụ không tự khôi phục được; liên hệ quản trị viên để được đặt lại mật khẩu.

#### Đăng xuất
Bấm vào tên của mình ở góc phải trên cùng, chọn `Đăng xuất`. Trên máy dùng chung, luôn đăng xuất khi rời máy.

## 1.4 Bố cục màn hình quản trị

![Bố cục chung của khu vực quản trị](anh/tq-bo-cuc.png)

1. **Menu chính** — các màn hình xếp theo năm nhóm: Điều hành, Chỉ tiêu, Dữ liệu, Người dân, Hệ thống. Số đỏ cạnh
   `Duyệt báo cáo` là số báo cáo đang chờ duyệt; cạnh `Phản ánh` là số phản ánh mới tiếp nhận và đề nghị xem xét lại.
2. **Thu gọn menu** — ẩn chữ, chỉ giữ biểu tượng để có thêm chỗ cho nội dung.
3. **Tìm kiếm** — tìm nhanh màn hình hoặc chỉ tiêu theo mã, tên (phím tắt `Ctrl K`).
4. **Gọi Jarvis bằng giọng nói** — bật để gọi trợ lý bằng câu "Jarvis ơi…" (xem mục 1.6).
5. **Jarvis** — trợ lý điều hành, trả lời câu hỏi về số liệu (phím tắt `Ctrl J`).
6. **Báo lỗi** — gửi mô tả lỗi của màn hình đang xem cho quản trị viên.
7. **Thông báo** — việc mới được giao, báo cáo được duyệt hoặc trả lại, yêu cầu giải trình, nhắc hạn.
8. **Tài khoản** — tên và vai trò; mở hồ sơ cá nhân, đổi giao diện sáng/tối, đăng xuất.
9. **Dải định danh** — mã màn hình (ví dụ `DH-01`), tên đơn vị và thời điểm hiện tại. Khi báo lỗi hoặc cần hỗ trợ,
   đọc mã này để người hỗ trợ biết đúng màn hình.

Mỗi phần trong tài liệu này ghi kèm mã màn hình tương ứng để dễ đối chiếu.

#### Tìm kiếm nhanh
1. Bấm ô `Tìm kiếm` trên thanh đầu trang, hoặc nhấn `Ctrl K` ở bất kỳ đâu.
2. Gõ một phần tên màn hình, mã hoặc tên chỉ tiêu; không cần gõ dấu (gõ `bao cao` vẫn tìm được "Báo cáo").
3. Dùng phím mũi tên lên, xuống để chọn, nhấn `Enter` để mở. Nhấn `Esc` để đóng.

![Hộp tìm kiếm nhanh|75](anh/tq-tim-kiem.png)

Hộp tìm kiếm còn có các lệnh: `Mở Jarvis`, `Đổi giao diện sáng/tối`, `Đăng xuất`.

#### Thông báo
Bấm biểu tượng chuông để xem thông báo mới nhất. Bấm vào một thông báo để mở đúng hồ sơ liên quan. Bấm
`Đánh dấu đã đọc` để xoá số đếm trên chuông.

![Danh sách thông báo|60](anh/tq-thong-bao.png)

#### Báo lỗi màn hình đang xem
1. Bấm biểu tượng con bọ trên thanh đầu trang. Hộp `Báo lỗi` tự ghi sẵn mã màn hình, thời điểm và địa chỉ trang.
2. Nhập `Mô tả`: đang làm gì, thấy gì, mong đợi điều gì.
3. Đính kèm ảnh chụp màn hình nếu có: bấm `Đính kèm ảnh`, hoặc dán trực tiếp vào ô mô tả bằng `Ctrl V`.
4. Bấm `Gửi`. Quản trị viên xem báo lỗi tại màn hình **Báo lỗi** (mục 2.5).

![Gửi báo lỗi kèm ảnh chụp|70](anh/tq-bao-loi.png)

#### Giao diện sáng, tối
Bấm vào tên tài khoản › `Giao diện`, chọn `Sáng`, `Tối` hoặc `Theo hệ thống` (theo cài đặt của Windows). Lựa chọn được
ghi nhớ trên máy đang dùng.

## 1.5 Quy ước chung

#### Tình trạng chỉ tiêu
Mỗi chỉ tiêu luôn ở một trong năm tình trạng, dùng cùng một màu trên mọi màn hình:

| Tình trạng | Màu | Khi nào |
|---|---|---|
| Hoàn thành | Xanh lá | Kết quả đã đạt chỉ tiêu giao |
| Đúng tiến độ | Xanh dương | Chưa đạt nhưng tiến độ từ ngưỡng cảnh báo trở lên (mặc định 70%) |
| Có nguy cơ | Cam | Tiến độ dưới ngưỡng cảnh báo, chưa đến hạn hoàn thành |
| Quá hạn | Đỏ | Đã qua hạn hoàn thành mà chưa đạt, hoặc chưa từng có báo cáo |
| Chưa bắt đầu | Xám | Chưa có số liệu, chưa đến hạn |

Chỉ tiêu loại **thống kê** chỉ thu số liệu, không có mục tiêu: hiển thị `Có số liệu` hoặc `Chưa có`.

#### Tiến độ được tính thế nào
- Chỉ tiêu "càng cao càng tốt": tiến độ = kết quả thực hiện ÷ chỉ tiêu giao × 100%, tối đa 100%.
  Ví dụ giao 50 hộ, đã thực hiện 20 hộ: tiến độ 40%.
- Chỉ tiêu "càng thấp càng tốt" (ví dụ số vụ tai nạn): đạt khi kết quả không vượt chỉ tiêu; nếu vượt,
  tiến độ = chỉ tiêu giao ÷ kết quả × 100%.
- **Tiến độ chung** của một bộ chỉ tiêu là bình quân tiến độ các chỉ tiêu cấp trên cùng (trừ chỉ tiêu thống kê).
- Chỉ tiêu **tự tính** lấy kết quả từ kho dữ liệu theo công thức; công thức và các vế (tử số, mẫu số) xem trong hồ sơ
  chỉ tiêu, mục **Cách tính**.

#### Thao tác với bảng
- Bấm tiêu đề cột có mũi tên để sắp xếp; bấm lần nữa để đảo chiều.
- Ô lọc, ô tìm kiếm phía trên bảng thu hẹp danh sách; các bảng nhiều dòng có phân trang ở cuối.
- Dấu `+` đầu dòng mở phần chi tiết của dòng đó.
- Trang dài có nút mũi tên tròn ở góc phải dưới để trở lại đầu trang.

#### In và xuất tệp
Các màn hình có nút `In` hoặc `In báo cáo` tạo bản in theo thể thức văn bản hành chính (khổ A4). Nút `Xuất Excel` tải
bảng số liệu về máy để xử lý tiếp.

## 1.6 Trợ lý Jarvis

Jarvis là trợ lý điều hành tích hợp trong khu vực quản trị. Jarvis trả lời bằng số liệu của hệ thống, trong phạm vi
quyền của người hỏi, ví dụ:

- "Tóm tắt tình hình thực hiện năm 2026."
- "Những chỉ tiêu nào có nguy cơ không đạt?"
- "Chỉ tiêu nào còn thiếu báo cáo kỳ này?"
- "Liệt kê chỉ tiêu của Phòng Văn hóa – Xã hội dưới 50%."
- "Tìm văn bản về chuyển đổi số."
- "Có bao nhiêu đề xuất chỉ tiêu đang chờ xác minh?"

#### Hỏi Jarvis
1. Bấm biểu tượng Jarvis trên thanh đầu trang, hoặc nhấn `Ctrl J`.
2. Gõ câu hỏi bằng tiếng Việt, nhấn `Enter`. Có thể bấm biểu tượng micro trong ô nhập để nói thay vì gõ.
3. Bấm vào tên chỉ tiêu, văn bản trong câu trả lời để mở hồ sơ tương ứng.

#### Gọi Jarvis bằng giọng nói
1. Bấm nút micro trên thanh đầu trang. Lần đầu, trình duyệt hỏi quyền dùng micro: chọn `Cho phép`.
2. Khi nút micro sáng màu, nói "Jarvis ơi" (hoặc "Hey Jarvis") rồi nói câu hỏi, ví dụ "Jarvis ơi, tóm tắt tình hình".
3. Jarvis mở khung trợ lý, trả lời và đọc to câu trả lời (tắt đọc to trong biểu tượng bánh răng của khung Jarvis).
4. Bấm lại nút micro để tắt. Trong lúc bật, bong bóng dưới nút micro hiện câu vừa nghe được; nếu Jarvis chưa phản hồi,
   xem bong bóng này để biết micro có nghe rõ không.

> [!CANH-BAO] Jarvis có thể chuẩn bị thao tác thay đổi dữ liệu (ví dụ duyệt hàng loạt đề xuất chỉ tiêu của một văn bản),
> nhưng chỉ thực hiện khi bạn bấm nút xác nhận trên màn hình. Lệnh bằng giọng nói không bao giờ tự thay đổi dữ liệu.

Hỏi bằng giọng nói cần trình duyệt Chrome hoặc Edge, micro, kết nối Internet và địa chỉ truy cập HTTPS (hoặc
`localhost`); truy cập bằng địa chỉ IP nội bộ qua `http://` thì micro bị trình duyệt chặn. Âm thanh được trình duyệt
gửi tới dịch vụ nhận dạng giọng nói của hãng trình duyệt.
