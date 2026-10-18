# Phần 2. Hướng dẫn theo màn hình

Tra cứu theo mã màn hình để biết các vùng thông tin và cách thực hiện công việc; quy ước chung về vai trò, tình trạng và thao tác với bảng xem mục 1.2, 1.4 và 1.5.

## 2.1 Nhóm Điều hành

Nhóm `Điều hành` gồm các màn hình theo dõi tình hình thực hiện, xử lý việc được giao, trình chiếu khi họp và rà soát trách nhiệm của người đứng đầu.

### DH-01 · Trung tâm điều hành

**Đường dẫn:** menu `Điều hành` › `Trung tâm điều hành` (`/admin`) · **Vai trò:** tất cả; phạm vi số liệu theo mục 1.2.

Mở màn hình để xem tiến độ chỉ tiêu, việc đang chờ xử lý và cảnh báo. Với tài khoản thuộc phạm vi một phòng, menu ghi `Điều hành của phòng`, tiêu đề là tên phòng và không có bảng `Theo phòng ban`.

![Trung tâm điều hành](anh/dh-01.png)

1. **Năm và các nút thao tác** — chọn năm của chỉ tiêu, mở `Trình chiếu` hoặc bấm `Tải lại` để lấy số liệu mới.
2. **`Tình trạng chỉ tiêu`** — đếm các chỉ tiêu không còn chỉ tiêu con, không gồm loại thống kê; số ở giữa là tiến độ bình quân theo trọng số của các chỉ tiêu này.
3. **`Việc cần xử lý`** — tổng hợp thiếu báo cáo, chưa giao người, chờ duyệt, giải trình, việc bị treo, phản ánh và tình hình có số liệu thống kê.
4. **`Bộ chỉ tiêu`** — xem kết quả của từng bộ; bấm tên bộ để mở danh mục chỉ tiêu thuộc bộ trong năm đang chọn.

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
3. **Bảng `Phòng, đơn vị`** — mỗi dòng ghi phòng, người đứng đầu, lần đăng nhập gần nhất và các số cần rà soát; dấu `+` mở thông tin bổ sung.

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
