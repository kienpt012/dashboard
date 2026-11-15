# Phần 2. Hướng dẫn theo màn hình

Tra cứu theo mã màn hình để biết các vùng thông tin và cách thực hiện công việc; quy ước chung về vai trò, tình trạng và thao tác với bảng xem mục 1.2, 1.4 và 1.5.

## 2.1 Nhóm Điều hành

Nhóm `Điều hành` gồm bàn làm việc của từng cán bộ và các màn hình theo dõi tình hình thực hiện, xử lý việc được giao, trình chiếu khi họp, rà soát trách nhiệm của người đứng đầu, quản lý văn bản chỉ đạo và lịch làm việc của lãnh đạo.

### DH-00 · Bàn làm việc

**Đường dẫn:** menu `Điều hành` › `Bàn làm việc` (`/admin`) · **Vai trò:** tất cả; mỗi người một bàn riêng.

Bàn làm việc là màn hình mở ra sau khi đăng nhập. Ở đây mỗi cán bộ thấy ngay việc của hôm nay và ngày mai, các nhắc việc của hệ thống, giấy note người khác dán cho mình và các phần mềm công vụ thường dùng.

![Bàn làm việc của lãnh đạo](anh/dh-00.png)

- **Lời chào, ngày giờ** — ngày dương lịch, âm lịch và đồng hồ. Góc phải có `Dán note`, `Cá nhân hóa`, tìm kiếm và nút xem toàn màn hình.
- **`Hôm nay · Ngày mai`** — lịch làm việc của lãnh đạo (DH-08), hạn báo cáo số liệu, nhiệm vụ đến hạn, note có hạn, việc riêng và ngày lễ. Mỗi loại có vạch màu riêng. Bấm một dòng để mở đúng nơi xử lý; bấm `Xem tất cả` để xem đủ danh sách của ngày.
- **Các số đếm** — `báo cáo đến hạn`, `note mới`, `chờ duyệt`, `việc cần làm`. Bấm vào số để mở **Việc của tôi** (DH-02), **Duyệt báo cáo** (CT-04) hoặc danh sách note.
- **`Nhắc việc`** — giấy nhắc do hệ thống tự tạo cho người được giao: thiếu hoặc sắp đến hạn báo cáo, chỉ tiêu có nguy cơ, nhiệm vụ đến hạn, yêu cầu giải trình, yêu cầu cập nhật lại số liệu đã duyệt (luôn xếp đầu), báo cáo chờ duyệt, chỉ tiêu chưa giao người. Trưởng phòng thấy nhắc việc của cả phòng kèm tên người phụ trách. Lãnh đạo và quản trị chỉ thấy các số đếm tổng. Việc xử lý xong thì giấy nhắc tự mất.
- **`Giấy note`** — note người khác dán cho mình và note mình tự ghi.
- **Khay ứng dụng** — ở cạnh dưới màn hình: các phần mềm công vụ và lối tắt.
- **Tiện ích** — phía dưới là các tiện ích của bàn: lịch việc, chỉ tiêu của tôi, cảnh báo, chờ duyệt, tiến độ theo phòng, ghi chú riêng, việc hôm nay…

![Bàn làm việc của chuyên viên: nhắc việc của hệ thống và giấy note nhận được](anh/dh-00-chuyen-vien.png)

#### Xử lý nhắc việc của hệ thống
1. Đọc tên chỉ tiêu, tình trạng và hạn trên tờ nhắc; dòng dưới ghi người phụ trách.
2. Bấm tên chỉ tiêu để mở **Hồ sơ chỉ tiêu** (CT-06) và xử lý: gửi báo cáo, trả lời giải trình, giao người phụ trách.
3. Việc chưa làm ngay được, bấm `Ẩn đến mai`; tờ nhắc hiện lại vào ngày hôm sau nếu việc chưa xong.

#### Dán note cho người khác
1. Bấm `Dán note`. Từ **Hồ sơ chỉ tiêu** (CT-06) có thể chọn `Thao tác` › `Dán note nhắc việc`; khi đó chỉ tiêu và người phụ trách được điền sẵn.
2. Chọn `Người nhận` (một hoặc nhiều cán bộ) hoặc chọn `Theo phòng` để gửi cả phòng. Có thể gắn một `Chỉ tiêu`.
3. Nhập `Nội dung` (tối đa 500 ký tự), chọn `Màu giấy` và `Hạn hoàn thành` nếu cần.
4. Bấm `Dán note`. Người nhận thấy tờ note trên bàn của mình và nhận thông báo.

![Hộp dán note|70](anh/dh-00-note.png)

| Người gửi | Gửi được cho |
|---|---|
| Chuyên viên, văn thư | Chính mình, người cùng phòng, lãnh đạo UBND, Chánh Văn phòng |
| Trưởng phòng | Như chuyên viên, thêm cả phòng mình và trưởng các phòng khác |
| Lãnh đạo UBND, Chánh Văn phòng, quản trị | Bất kỳ cán bộ nào, một phòng, một vai trò hoặc toàn cơ quan |
| Người xem | Chính mình |

> Note là trao đổi riêng: chỉ người gửi và người nhận đọc được, kể cả quản trị viên cũng không đọc note của người khác. Mỗi người dán tối đa 30 note và 60 câu trả lời trong một giờ.

#### Nhận và trả lời note
1. Tờ note mới nằm ở góc phải bàn làm việc và trong mục `Giấy note`; số `note mới` tăng lên.
2. Bấm vào tờ note để đọc. Bấm `Trả lời` để nhắn lại người gửi (tối đa 300 ký tự).
3. Làm xong việc, bấm `Đã xong`. Muốn cất tờ note khỏi bàn, bấm dấu `×`.
4. Có thể kéo tờ note tới vị trí khác trên bàn; vị trí được nhớ cho lần sau.

#### Theo dõi note đã dán
Thêm tiện ích `Note đã dán` (xem `Cá nhân hóa` bên dưới) để thấy từng note đã gửi: bao nhiêu người nhận, ai đã xem, ai đã xong và thời điểm. Người gửi bấm `Thu hồi` để gỡ tờ note khỏi bàn của mọi người nhận.

#### Mở ứng dụng công vụ
1. Bấm biểu tượng trên khay ứng dụng để mở phần mềm ở thẻ mới. Rê chuột vào biểu tượng để đọc công dụng.
2. Số đỏ trên biểu tượng là số việc mới của ứng dụng đó (nếu ứng dụng có cung cấp).
3. Bấm nút ô lưới để mở `Tất cả ứng dụng`, tìm theo tên hoặc xem theo nhóm.
4. Bấm `+` hoặc `Thêm lối tắt` để tự thêm lối tắt riêng tới một trang hay dùng.

![Tất cả ứng dụng và lối tắt riêng](anh/dh-00-ung-dung.png)

> Danh mục ứng dụng công vụ do quản trị viên khai tại **Ứng dụng công vụ** (HT-08). Hệ thống chỉ mở liên kết; việc đăng nhập vào từng phần mềm vẫn dùng tài khoản của phần mềm đó.

#### Ghim chỉ tiêu, văn bản, trang đang xem lên bàn
- Trong **Hồ sơ chỉ tiêu** (CT-06) hoặc khi đang xem một văn bản, bấm biểu tượng ghim để đưa lên bàn làm việc.
- Ở màn hình bất kỳ, bấm biểu tượng ghim trên thanh đầu trang để ghim trang đang xem cùng bộ lọc đang chọn.
- Các mục đã ghim nằm trong tiện ích `Đã ghim`. Mục không còn quyền xem sẽ tự ẩn.

#### Cá nhân hóa bàn làm việc
1. Bấm `Cá nhân hóa`.
2. Thêm tiện ích, kéo để đổi chỗ, kéo góc để đổi cỡ, hoặc gỡ tiện ích không dùng.
3. Chọn vị trí khay ứng dụng (cạnh dưới, cạnh trái hoặc ẩn), hình nền và các không gian làm việc.
4. Thay đổi được lưu theo tài khoản; đăng nhập ở máy khác vẫn thấy đúng bàn của mình.

> Trên điện thoại, các tờ note xếp thành một chồng; chạm vào để mở danh sách. Khay ứng dụng vẫn nằm ở cạnh dưới.

### DH-01 · Trung tâm điều hành

**Đường dẫn:** menu `Điều hành` › `Trung tâm điều hành` (`/admin/dieu-hanh`) · **Vai trò:** tất cả; phạm vi số liệu theo mục 1.2.

Mở màn hình để xem tiến độ chỉ tiêu, việc đang chờ xử lý và cảnh báo. Với tài khoản thuộc phạm vi một phòng, menu ghi `Điều hành của phòng`, tiêu đề là tên phòng và không có bảng `Theo phòng ban`.

![Trung tâm điều hành](anh/dh-01.png)

1. **Năm và các nút thao tác** — chọn năm của chỉ tiêu, mở `Trình chiếu` hoặc bấm `Tải lại` để lấy số liệu mới.
2. **`Tình trạng chỉ tiêu`** — đếm các chỉ tiêu không còn chỉ tiêu con, không gồm loại thống kê; số ở giữa là tiến độ bình quân theo trọng số của các chỉ tiêu này.
3. **`Việc cần xử lý`** — tổng hợp thiếu báo cáo, chưa giao người, chờ duyệt, giải trình, việc bị treo, phản ánh và tình hình có số liệu thống kê.
4. **`Bộ chỉ tiêu`** — xem kết quả của từng bộ; bấm tên bộ để mở danh mục chỉ tiêu thuộc bộ trong năm đang chọn.

Bản tháng 11/2026 bổ sung các khối sau trên màn hình này:

![Trung tâm điều hành: các khối bổ sung](anh/dh-01-moi.png)

- **Công tắc** `Phòng tôi` / `Toàn địa phương` (với tài khoản thuộc một phòng) — đổi phạm vi số liệu đang xem; xem mục 1.2.
- **`Tình trạng chỉ tiêu, Bộ chỉ tiêu`** chỉ tính chỉ tiêu; nhiệm vụ của văn bản chỉ đạo được tách sang khối riêng.
- **`Việc cần xử lý`** — các nhóm `Cần duyệt báo cáo`, `Cần duyệt đề xuất` và `Cần gửi báo cáo` có nhãn màu riêng.
- **`Văn bản chỉ đạo`** — tổng số nhiệm vụ, tỷ lệ hoàn thành, số quá hạn, số đến hạn trong 7 ngày; bấm để mở **Văn bản chỉ đạo** (DH-05) hoặc **Việc theo tháng** (DH-07).
- **`Dự báo nguy cơ`** — năm chỉ tiêu có khả năng không đạt cao nhất kèm lý do chính; bấm tên để mở hồ sơ. Chỉ tiêu chưa có số liệu được duyệt không được xếp hạng. Cách đọc xem ở CT-06.
- **`Theo phòng ban`** — thêm cột `Nhiệm vụ` (số đã xong trên tổng số, số quá hạn).
- **`Cảnh báo`** — mỗi dòng có nhãn `Chỉ tiêu` hoặc `Nhiệm vụ`; tên đứng trước rồi tới tình trạng ngắn (`quá hạn 3 ngày`, `thiếu báo cáo Tháng 10/2026`, `có nguy cơ không đạt`…); dòng phụ ghi phòng chủ trì và văn bản giao.
- **`Hoạt động gần đây`** — mỗi loại thao tác một nhãn màu, có ngày giờ; lọc được theo loại hoạt động.

#### Xem các chỉ tiêu cần chú ý

1. Chọn năm ở góc trên bên phải.
2. Trong `Tình trạng chỉ tiêu`, bấm `Có nguy cơ` hoặc `Quá hạn`; có thể bấm vào phần tương ứng của biểu đồ tròn.
3. Hệ thống mở **Danh mục chỉ tiêu** (CT-02) với tình trạng và năm đã chọn. Bấm tên chỉ tiêu để mở **Hồ sơ chỉ tiêu** (CT-06).

#### Đọc các số trong khối việc cần xử lý

| Nhãn | Cách hiểu và nơi mở tiếp |
|---|---|
| `Thiếu báo cáo kỳ` | Số chỉ tiêu không còn chỉ tiêu con có ít nhất một kỳ quá hạn chưa có báo cáo hợp lệ hoặc chờ duyệt; một chỉ tiêu thiếu nhiều kỳ vẫn tính một. Bấm để mở **Việc của tôi** |
| `Chưa giao người` | Số chỉ tiêu nhập số liệu thủ công, không còn chỉ tiêu con, chưa có người phụ trách. Bấm để mở danh mục đã lọc chưa giao người |
| `Báo cáo chờ duyệt` | Số báo cáo đang chờ duyệt; quản trị, lãnh đạo và trưởng phòng bấm để mở CT-04 |
| `Đề xuất chờ duyệt` | Số đề xuất đã trình đang chờ xử lý trong danh sách hệ thống lấy về, tối đa 50. Bấm để mở CT-03 với trạng thái chờ duyệt |
| `Giải trình đang mở` | Số yêu cầu giải trình chưa kết thúc; quản trị, lãnh đạo và trưởng phòng bấm để mở DH-04 |
| `Việc bị treo` | Số chỉ tiêu bị chuyển, trả qua lại ít nhất ba lần hoặc chậm giao người theo quy định; xem thẻ `Việc bị treo` ở cuối trang |
| `Phản ánh quá hạn` | Số phản ánh còn mở đã quá hạn xử lý, không tính phản ánh đang chờ người dân bổ sung; dòng dưới cho biết tổng số phản ánh đang xử lý |
| `Thống kê có số liệu` | Số chỉ tiêu thống kê không còn chỉ tiêu con đã có số liệu trên tổng số chỉ tiêu thống kê cùng phạm vi; bấm để mở danh mục loại thống kê |

> Số `Thiếu báo cáo kỳ` là tổng trong phạm vi được xem; **Việc của tôi** chỉ liệt kê việc của tài khoản đăng nhập nên hai số có thể khác nhau. Năm đang chọn áp dụng cho số liệu chỉ tiêu; đề xuất chờ duyệt, phản ánh và hoạt động gần đây thể hiện hàng chờ hoặc hoạt động hiện có.

#### Rà soát bộ chỉ tiêu và phòng phụ trách

1. Trong bảng `Bộ chỉ tiêu`, đọc cột `Kết quả`: bộ chấm điểm hiển thị điểm đạt trên điểm tối đa; bộ thống kê hiển thị tỷ lệ đã có số liệu; các bộ còn lại hiển thị tiến độ.
2. Bấm dấu `+` ở đầu dòng để xem `Căn cứ`, `Cấp giao`, `Đã có số liệu`, `Có văn bản chỉ đạo`, `Đã đánh giá` và số lượng từng tình trạng.
3. Với tài khoản xem toàn địa phương, cuộn tới `Theo phòng ban`. Bấm tên phòng để mở danh mục của phòng; bấm số ở cột `Chưa giao` để xem những chỉ tiêu chưa có người phụ trách.
4. Mở rộng dòng phòng để xem trưởng phòng, thời gian chờ duyệt lâu nhất, giải trình đang mở và các thông tin bổ sung.

![Theo dõi phòng ban, cảnh báo và hoạt động gần đây](anh/dh-01-theo-doi.png)

1. **`Theo phòng ban`** — đối chiếu số chỉ tiêu, tiến độ, báo cáo còn thiếu và việc chưa được giao của từng phòng.
2. **`Cảnh báo` và `Việc bị treo`** — chọn thẻ để xem việc cần chú ý, rồi mở hồ sơ liên quan.
3. **`Hoạt động gần đây`** — xem người thực hiện, nội dung và thời điểm xử lý.

#### Theo dõi cảnh báo và hoạt động gần đây

1. Cuộn xuống thẻ `Cảnh báo`. Khi có nhiều loại cảnh báo, bấm nhãn loại cần xem hoặc `Tất cả`.
2. Bấm nội dung cảnh báo có liên kết để mở hồ sơ chỉ tiêu, đề xuất hoặc danh mục liên quan.
3. Chọn thẻ `Việc bị treo` để xem lý do từng việc chưa được giải quyết; bấm tên để mở hồ sơ.
4. Trong `Hoạt động gần đây`, xem người thực hiện, việc đã làm và thời điểm. Bấm `Xem thêm` kèm số lượng để mở các hoạt động còn lại; bấm `Thu gọn` để trở về danh sách ngắn.

> Màn hình tự tải lại dữ liệu khoảng hai phút một lần. Dòng `Số liệu lúc` ưu tiên thời điểm báo cáo gần nhất; không nhất thiết là thời điểm vừa bấm `Tải lại`.

### DH-02 · Việc của tôi

**Đường dẫn:** menu `Điều hành` › `Việc của tôi` (`/admin/viec-cua-toi`) · **Vai trò:** tất cả; các thẻ và nội dung thay đổi theo vai trò, người được giao việc.

Mở màn hình để biết việc cần xử lý của chính mình và theo dõi kết quả đã gửi. Các chỉ tiêu và báo cáo dùng năm hiện tại; màn hình không có ô chọn năm.

![Việc của tôi — tài khoản chuyên viên](anh/dh-02.png)

1. **`Tải lại`** — lấy lại danh sách công việc và cập nhật thời điểm trên đầu trang.
2. **Các thẻ công việc** — số bên cạnh tên thẻ là số dòng của nhóm việc đó; bấm thẻ để đổi danh sách.
3. **`Kỳ cần báo cáo`** — ghi các kỳ còn thiếu; nhãn `Có báo cáo chờ duyệt` cho biết đã có báo cáo đang được xử lý.
4. **Nút trên từng dòng** — `Báo cáo` mở biểu mẫu trong hồ sơ; nếu đã có báo cáo chờ duyệt, nút đổi thành `Xem hồ sơ`.

| Thẻ | Nội dung và cách xử lý |
|---|---|
| `Cần báo cáo` | Chỉ tiêu nhập thủ công được giao cho mình, chưa có số liệu hoặc còn kỳ quá hạn thiếu báo cáo. Bấm `Báo cáo` |
| `Bị trả lại` | Báo cáo của mình bị trả lại và chưa được thay bằng báo cáo mới. Đọc `Lý do trả lại`, bấm `Báo cáo lại` |
| `Chờ tôi duyệt` | Báo cáo tài khoản được quyền duyệt; có ở quản trị, lãnh đạo và trưởng phòng. Thao tác xem CT-04 |
| `Đề xuất chờ xử lý` | Đề xuất cần rà soát hoặc duyệt theo quyền; có ở quản trị, lãnh đạo, văn thư và trưởng phòng. Bấm tên để mở CT-03 |
| `Giải trình` | Yêu cầu đang mở đối với chỉ tiêu mình phụ trách hoặc phòng mình giám sát; xem `Hạn trả lời`, bấm `Trả lời` để mở hồ sơ |
| `Chưa giao người` | Chỉ tiêu cần phân công; có ở quản trị, lãnh đạo và trưởng phòng. Bấm `Giao việc` để mở hồ sơ |
| `Chỉ tiêu của tôi` | Chỉ tiêu được giao cho tài khoản trưởng phòng hoặc chuyên viên; xem giá trị, tiến độ, tình trạng và báo cáo gần nhất |
| `Báo cáo đã gửi` | Báo cáo đã gửi của trưởng phòng hoặc chuyên viên, kèm `Kết quả`, `Ghi chú duyệt`, `Gửi lúc` |
| `Đề xuất của tôi` | Các đề xuất do tài khoản tạo, trạng thái và kết quả; khi đã thành chỉ tiêu, bấm liên kết `Đã tạo` kèm mã chỉ tiêu |

#### Mở biểu mẫu cho một kỳ còn thiếu

1. Chọn `Cần báo cáo` và tìm chỉ tiêu trong danh sách.
2. Đọc `Kỳ cần báo cáo`, bấm `Báo cáo`. Hồ sơ mở sẵn biểu mẫu theo kỳ thiếu đầu tiên; nếu không có kỳ thiếu, biểu mẫu dùng kỳ hiện tại.
3. Kiểm tra lại kỳ trước khi điền số liệu và minh chứng. Cách gửi báo cáo xem CT-06 và mục 3.3.

#### Theo dõi báo cáo bị trả lại hoặc đã gửi

1. Chọn `Bị trả lại`, đọc giá trị đã gửi và lý do người duyệt yêu cầu sửa.
2. Bấm `Báo cáo lại`, kiểm tra kỳ và cập nhật theo hướng dẫn trong hồ sơ chỉ tiêu.
3. Chọn `Báo cáo đã gửi` để xem báo cáo đang chờ, đã được duyệt hay bị trả lại; báo cáo tự thông qua có nhãn riêng.

> Màn hình ưu tiên mở thẻ công việc đang có dòng cần xử lý và tự tải lại khoảng hai phút một lần. Thông báo `Đã xử lý hết việc` chỉ nói về các nhóm việc cần xử lý đang hiển thị; vẫn có thể còn chỉ tiêu và lịch sử đã gửi để theo dõi.

### DH-03 · Trình chiếu

**Đường dẫn:** menu `Điều hành` › `Trình chiếu` (`/trinh-chieu`), hoặc nút `Trình chiếu` tại DH-01 · **Vai trò:** tất cả, phải đăng nhập; phạm vi số liệu theo mục 1.2.

Màn hình dùng khi họp giao ban hoặc theo dõi trên màn hình lớn, mở ở thẻ trình duyệt riêng. Nội dung tự chuyển qua tổng quan, từng bộ chỉ tiêu, từng phòng và việc bị treo khi có dữ liệu; danh sách dài tự chia thành nhiều trang.

![Trình chiếu trên khung 1920 × 1080](anh/dh-03.jpg)

1. **Tiến trình trình chiếu** — các đoạn trên cùng tương ứng với từng phần; bấm một đoạn để đến trang đầu của phần đó.
2. **`Bộ chỉ tiêu năm 2026`** — trang tổng quan hiển thị tối đa bốn bộ đang bật trình chiếu, kèm kết quả và số chỉ tiêu cần chú ý.
3. **`Tiến độ theo phòng`** — trang tổng quan hiển thị tối đa tám phòng theo tiến độ bình quân; từng phòng còn có phần chi tiết trong vòng trình chiếu.
4. **Các nút điều khiển** — chuyển trang, tạm dừng hoặc chạy tiếp, bật toàn màn hình và thoát về Trung tâm điều hành.

#### Chọn cách trình chiếu

| Chế độ | Cách sử dụng |
|---|---|
| Tự chuyển trang | Bật sẵn khi mở. Thời gian chuyển theo cấu hình hệ thống; các trang con của một danh sách dài có thể chuyển nhanh hơn |
| Tạm dừng để trình bày | Bấm `Tạm dừng` hoặc nhấn phím cách; dùng `Trang trước`, `Trang sau` để chuyển bằng tay. Bấm `Chạy tiếp` hoặc nhấn phím cách lần nữa để khôi phục tự chuyển |
| Toàn màn hình | Bấm `Toàn màn hình` hoặc nhấn `F`; bấm lại hoặc nhấn `F` lần nữa để trở về khung trình duyệt |

#### Dùng phím tắt trong cuộc họp

| Phím | Tác dụng |
|---|---|
| `→` hoặc `PageDown` | Sang trang sau |
| `←` hoặc `PageUp` | Về trang trước |
| `Phím cách` | Tạm dừng hoặc chạy tiếp |
| `F` | Bật, tắt toàn màn hình |
| `Esc` | Khi đang toàn màn hình, thoát toàn màn hình; khi đã ở khung trình duyệt, trở về Trung tâm điều hành |

#### Đọc số liệu trong từng phần

1. Ở phần bộ chỉ tiêu, xem kết quả bên trái: điểm đạt trên điểm tối đa, số chỉ tiêu có số liệu hoặc phần trăm tiến độ tùy loại bộ.
2. Ở bảng bên phải, đọc `Chỉ tiêu`, `Thực hiện / Kế hoạch`, `Tiến độ`; bộ thống kê dùng cột `Số liệu` và `Tình trạng`.
3. Ở phần phòng ban, dòng dưới tên chỉ tiêu ghi người phụ trách, `Chưa giao người` hoặc `Tự tính`; nếu có, hệ thống ghi thêm kỳ thiếu và việc đang giải trình.
4. Ở phần `Việc bị treo`, đọc cột `Lý do`. Phần này gồm việc chuyển, trả nhiều lần, chậm giao người và quá hạn trả lời giải trình.

> Trình chiếu dùng năm hiện tại, tự lấy lại dữ liệu khoảng hai phút một lần. Bộ chỉ tiêu phải đang hoạt động và bật trình chiếu mới có phần riêng; thiết lập tại CT-01. Tiến độ theo phòng trên trình chiếu là bình quân các chỉ tiêu không còn chỉ tiêu con, không gồm thống kê, không áp dụng trọng số như DH-01.

### DH-04 · Trách nhiệm

**Đường dẫn:** menu `Điều hành` › `Trách nhiệm` (`/admin/trach-nhiem`) · **Vai trò:** quản trị, lãnh đạo và trưởng phòng; trưởng phòng chỉ thấy phòng mình.

Màn hình có tiêu đề `Trách nhiệm người đứng đầu`, dùng để rà soát chậm duyệt, tự thông qua, chuyển hoặc trả việc và giải trình quá hạn. Chọn năm để đối chiếu số liệu và in phụ lục phục vụ cuộc họp.

![Trách nhiệm người đứng đầu](anh/dh-04.png)

1. **Năm và các nút thao tác** — chọn năm, bấm `Tải lại` để cập nhật hoặc `In phụ lục` để mở bản in.
2. **Các số tổng hợp** — báo cáo tự thông qua, đề xuất tự thông qua, báo cáo đang chờ duyệt, chuyển hoặc trả việc và giải trình quá hạn trong phạm vi được xem.
3. **Bảng** `Phòng, đơn vị` — mỗi dòng ghi phòng, người đứng đầu, lần đăng nhập gần nhất và các số cần rà soát; dấu `+` mở thông tin bổ sung.

| Nhóm cột | Cách đọc |
|---|---|
| `Chỉ tiêu` | Số chỉ tiêu của năm được chọn không còn chỉ tiêu con, gồm cả loại thống kê |
| `Duyệt báo cáo` | `Đang chờ` là số báo cáo chưa được duyệt; `Lâu nhất (ngày)` là số ngày của báo cáo chờ lâu nhất; `Tự thông qua` là số lần hệ thống tự thông qua trong năm |
| `Đề xuất chỉ tiêu` | `Bị từ chối` và `Tự thông qua` đếm các sự kiện xử lý tương ứng trong năm |
| `Giao việc` | `Chưa giao` là số chỉ tiêu chưa có người phụ trách; `Chuyển, trả` và `Báo lãnh đạo` là số sự kiện phát sinh trong năm |
| `Thiếu báo cáo` | Số chỉ tiêu có ít nhất một kỳ quá hạn thiếu báo cáo; một chỉ tiêu thiếu nhiều kỳ vẫn tính một |
| `Giải trình quá hạn` | Số chỉ tiêu có yêu cầu giải trình đang mở đã qua hạn trả lời |

#### Rà soát một phòng có việc chậm xử lý

1. Chọn năm cần xem và đối chiếu dòng `Số liệu lúc`.
2. Xem các cột `Tự thông qua`, `Đang chờ`, `Lâu nhất (ngày)`, `Thiếu báo cáo` và `Giải trình quá hạn`. Bảng ban đầu xếp số báo cáo tự thông qua từ nhiều đến ít.
3. Bấm dấu `+` trước tên phòng để xem `Giải trình đang mở`, `Chưa có văn bản chỉ đạo`, `Chưa đánh giá` và `Đề xuất bị từ chối`.
4. Nếu có `Lý do từ chối`, đọc nội dung, người xử lý và thời điểm; bấm lý do có liên kết để mở đề xuất. Phần này hiển thị tối đa năm lần từ chối gần nhất của phòng trong năm.
5. Bấm tên phòng để mở danh mục chỉ tiêu của phòng trong năm đã chọn. Quản trị và lãnh đạo còn xem được khối `Lãnh đạo UBND` ở dưới bảng, gồm chức vụ và lần đăng nhập gần nhất.

![Thông tin mở rộng của một phòng|90](anh/dh-04-chi-tiet.png)

1. **Người đứng đầu** — tên trưởng phòng và lần đăng nhập gần nhất để đối chiếu người phụ trách.
2. **Thông tin bổ sung** — số `Giải trình đang mở`, `Chưa có văn bản chỉ đạo`, `Chưa đánh giá` và `Đề xuất bị từ chối` của phòng.

#### In phụ lục trách nhiệm

1. Chọn năm và bấm `Tải lại` nếu cần cập nhật số liệu trước cuộc họp.
2. Bấm `In phụ lục`.
3. Kiểm tra bản xem trước; phụ lục trình bày ngang, có số liệu từng phòng, người đứng đầu, dòng tổng cộng và thời điểm trích xuất.

> Cột `Tự thông qua`, `Chuyển, trả`, `Báo lãnh đạo` phản ánh sự kiện đã xảy ra trong năm; các cột chờ duyệt, chưa giao và thiếu báo cáo phản ánh việc còn tồn tại khi lấy số liệu. Ở dòng `Tổng cộng`, `Lâu nhất (ngày)` là giá trị lớn nhất giữa các phòng, không cộng số ngày.

### DH-05 · Văn bản chỉ đạo

**Đường dẫn:** menu `Điều hành` › `Văn bản chỉ đạo` (`/admin/van-ban-chi-dao`) · **Vai trò:** tất cả được xem theo phạm vi; thêm văn bản: người phân việc và văn thư; giao việc: người phân việc (mục 1.2).

Màn hình quản lý các văn bản chỉ đạo của địa phương — chương trình công tác, thông báo kết luận, kế hoạch, công văn, quyết định — và các nhiệm vụ được phân rã từ từng văn bản.

![Danh sách văn bản chỉ đạo](anh/dh-05.png)

- **Bộ lọc** — tìm theo số ký hiệu, trích yếu; lọc theo năm, `Loại văn bản`, `Phòng chủ trì`, `Trạng thái nhiệm vụ`; tích `Cả văn bản lưu trữ` để xem văn bản đã lưu trữ.
- **Dải số liệu** — số văn bản, số nhiệm vụ, hoàn thành, đang thực hiện, quá hạn, đến hạn trong 7 ngày của phạm vi đang lọc.
- **Thẻ** `Danh sách văn bản` — mỗi văn bản một dòng với thanh tiến độ theo trạng thái nhiệm vụ; bấm số ký hiệu hoặc trích yếu để mở **Chi tiết văn bản chỉ đạo** (DH-06).
- **Thẻ** `Việc theo tháng` — mở nhanh bảng việc của tháng (DH-07).
- **Thẻ** `Thống kê` — tình hình thực hiện theo văn bản, theo phòng, theo loại văn bản và theo tháng.

#### Thêm văn bản chỉ đạo
1. Bấm `Thêm văn bản`.
2. Chọn `Tệp trong Kho văn bản` nếu văn bản đã được tải lên kho (DL-02); số ký hiệu, ngày ban hành, cơ quan ban hành và trích yếu được điền sẵn từ tệp. Nếu chưa có tệp, nhập tay các ô này.
3. Chọn `Loại văn bản`; kiểm tra `Số ký hiệu`, `Ngày ban hành`, `Cơ quan ban hành`, `Người ký ban hành`, `Trích yếu`.
4. Bấm `Lưu`. Hệ thống mở trang chi tiết để thêm nhiệm vụ.

#### Xem thống kê thực hiện
1. Mở thẻ `Thống kê`.
2. Chọn cách nhóm: theo văn bản, theo phòng, theo loại văn bản hoặc theo tháng đến hạn.
3. Đọc số nhiệm vụ đúng hạn, trễ hạn, đang làm, quá hạn, tỷ lệ hoàn thành và số ngày trễ bình quân; biểu đồ bên dưới thể hiện cùng số liệu.
4. Bấm `Xuất Excel` để tải tệp có đủ bốn cách nhóm.

![Thống kê việc thực hiện văn bản chỉ đạo](anh/dh-05-thong-ke.png)

> Tháng thống kê là tháng đến hạn của nhiệm vụ. Một nhiệm vụ được tính đúng hạn khi báo cáo hoàn thành 100 % được gửi trước hoặc đúng hạn và đã được duyệt; thời gian chờ duyệt không tính vào thời gian thực hiện.

### DH-06 · Chi tiết văn bản chỉ đạo

**Đường dẫn:** từ DH-05 bấm số ký hiệu hoặc trích yếu của văn bản · **Vai trò:** như DH-05.

![Chi tiết một văn bản chỉ đạo và các nhiệm vụ được giao](anh/dh-06.png)

- **Thông tin văn bản** — số ký hiệu, loại, ngày ban hành, cơ quan ban hành, người ký; nếu có tệp trong kho, bấm `Mở văn bản` để xem.
- **Dải số liệu** — số nhiệm vụ của văn bản theo trạng thái.
- **Bảng** `Nhiệm vụ được giao` — nội dung, phòng chủ trì, phòng phối hợp, hạn hoàn thành, người phụ trách, tiến độ. Dòng phụ dưới nội dung ghi số thứ tự, số văn bản và người phân việc.

#### Thêm nhiệm vụ
1. Bấm `Thêm nhiệm vụ`. Nhập `Nội dung nhiệm vụ`, chọn `Phòng chủ trì`, `Phòng phối hợp` (nếu có), `Hạn hoàn thành`.
2. Nếu nhiệm vụ nhằm thúc đẩy một chỉ tiêu, chọn `Chỉ tiêu liên quan`; hồ sơ chỉ tiêu đó sẽ hiện nhiệm vụ này.
3. Bấm `Lưu`. Trưởng phòng chủ trì nhận thông báo và giao cho chuyên viên như với chỉ tiêu (mục 3.2).

#### Dán danh sách nhiệm vụ
Dùng khi văn bản có nhiều việc và đã có sẵn danh sách trong tệp Word, Excel.
1. Bấm `Dán danh sách`. Chọn `Phòng chủ trì` và `Hạn chung` áp dụng cho các dòng không ghi hạn riêng.
2. Dán vào ô `Danh sách`, mỗi dòng một nhiệm vụ. Có thể ghi hạn ở cuối dòng, ví dụ `Rà soát hồ sơ giải ngân trước 30/11/2026`.
3. Bấm `Thêm nhiệm vụ`. Mỗi lần dán tối đa 100 dòng.

#### Giao phòng, đổi hạn, lưu trữ
- Sửa ngay trên dòng: chọn lại phòng ở ô `Đổi phòng chủ trì`, thêm phòng ở ô phòng phối hợp, chọn ngày ở ô hạn hoàn thành.
- Sửa nhiều dòng một lần: tích chọn các dòng, bấm `Giao phòng / đặt hạn`, chọn nội dung cần đổi rồi bấm `Áp dụng`; hoặc bấm `Lưu trữ` để cất các nhiệm vụ không còn theo dõi.
- Khi đổi phòng chủ trì, người phụ trách cũ được gỡ để trưởng phòng mới giao lại.

#### Theo dõi và hoàn thành nhiệm vụ
Bấm nội dung nhiệm vụ để mở hồ sơ (CT-06). Hồ sơ nhiệm vụ giống hồ sơ chỉ tiêu nhưng không có kỳ báo cáo: người phụ trách bấm `Báo cáo kết quả`, nhập tỷ lệ hoàn thành, nội dung kết quả và minh chứng; trưởng phòng duyệt. Nhiệm vụ hoàn thành khi báo cáo 100 % được duyệt.

> Hệ thống nhắc người phụ trách khi nhiệm vụ còn 3 ngày đến hạn, báo trưởng phòng khi quá hạn và báo người phân việc, lãnh đạo khi quá hạn trên 3 ngày.

### DH-07 · Việc theo tháng

**Đường dẫn:** menu `Điều hành` › `Việc theo tháng` (`/admin/viec-theo-thang`) · **Vai trò:** tất cả, theo phạm vi xem.

Trả lời câu hỏi "tháng này phòng phải làm gì": các nhiệm vụ đến hạn trong tháng và các kỳ báo cáo chỉ tiêu của tháng, gom theo văn bản giao.

![Việc theo tháng của một phòng](anh/dh-07.png)

1. Chọn tháng và phòng ở đầu trang.
2. Mỗi khối là một văn bản; trong khối là các việc của phòng theo văn bản đó, kèm người phụ trách, hạn và trạng thái. Chỉ tiêu có kỳ báo cáo trong tháng ghi rõ kỳ (ví dụ `Tháng 11/2026`).
3. Bấm nội dung để mở hồ sơ.
4. Bấm `In danh sách` để in bản giấy có chỗ ký, hoặc `Xuất Excel`.

### DH-08 · Lịch làm việc

**Đường dẫn:** menu `Điều hành` › `Lịch làm việc` (`/admin/lich-lam-viec`) · **Vai trò:** tất cả được xem; lập lịch: cán bộ Văn phòng, văn thư, lãnh đạo, quản trị.

Lịch làm việc theo tuần của lãnh đạo UBND. Lịch đã công khai hiện trên cổng thông tin cho người dân (CC-06); các dòng lịch của hôm nay và ngày mai hiện trên **Bàn làm việc** (DH-00) của mọi cán bộ.

![Lịch làm việc theo tuần](anh/dh-08.png)

- **Chọn tuần** — mũi tên trái, phải để chuyển tuần; `Tuần này` để quay về tuần hiện tại.
- **Các ngày trong tuần** — mỗi dòng lịch gồm giờ hoặc buổi, nội dung, lãnh đạo chủ trì, địa điểm, thành phần.
- **`Công khai tuần này`** — bật để người dân xem được lịch tuần; nhãn `Đã công khai` hiện cạnh tiêu đề.

#### Lập lịch tuần
1. Chọn tuần cần lập.
2. Bấm `Thêm dòng lịch` (hoặc `Thêm` ở ngày tương ứng). Chọn `Ngày`, `Buổi` hoặc `Giờ bắt đầu`, nhập `Nội dung`, `Lãnh đạo chủ trì`, `Địa điểm`, `Thành phần`, bấm `Xong`.
3. Dòng chỉ dùng nội bộ (ví dụ họp nội bộ) thì tắt `Hiện trên trang công khai`; người dân sẽ không thấy dòng này.
4. Bấm `Lưu lịch`.

Tuần mới thường lặp lại nhiều việc của tuần trước: bấm `Chép từ tuần gần nhất` để lấy các dòng của tuần gần nhất có lịch rồi sửa lại.

#### Đính kèm lịch đã ký và công khai
1. Bấm `Đính kèm lịch đã ký (PDF)` và chọn tệp PDF (tối đa 10 MB).
2. Bật `Công khai tuần này`. Từ lúc này trang **Lịch làm việc của lãnh đạo** (CC-06) hiện lịch tuần và cho tải tệp PDF.
3. Muốn ngừng công khai, tắt công tắc; người dân không còn xem và tải được lịch tuần đó.
