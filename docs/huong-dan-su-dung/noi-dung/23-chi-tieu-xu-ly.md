### CT-03 · Đề xuất chỉ tiêu

**Đường dẫn:** menu `Chỉ tiêu` › `Đề xuất chỉ tiêu` (`/admin/proposals`) · **Vai trò:** tất cả; người xem chỉ xem. Tài khoản thuộc một phòng thấy đề xuất của phòng mình và đề xuất do chính mình tạo.

Màn hình tập hợp đề xuất do cán bộ nhập và đề xuất do AI trích xuất từ văn bản. Dùng để rà soát, bổ sung thông tin, trình người có thẩm quyền và duyệt thành chỉ tiêu chính thức.

![Danh sách đề xuất chỉ tiêu](anh/ct-03.png)

1. **`Đề xuất mới`** — mở biểu mẫu nhập một đề xuất; nút không hiện với người xem.
2. **Tìm kiếm và bộ lọc** — tìm theo `Tên đề xuất, văn bản`, chọn trạng thái, `Nguồn` hoặc `Phòng chủ trì` theo quyền.
3. **Danh sách đề xuất** — đọc tên, nguồn, mục tiêu và phòng chủ trì; bấm một dòng để mở ngăn chi tiết.
4. **`Trạng thái`** — cho biết bước xử lý; đề xuất đang chờ có thể kèm thời gian còn lại trước khi tự thông qua.

| Trạng thái hoặc lựa chọn | Ý nghĩa |
|---|---|
| `Đang xử lý` | Gồm các đề xuất `Chưa trình` và `Chờ duyệt`; đây là lựa chọn ban đầu |
| `Chưa trình` | Đã lưu, chưa trình để xử lý theo thời hạn |
| `Chờ duyệt` | Đã trình, đang chờ người có thẩm quyền quyết định |
| `Đã duyệt` | Đã tạo chỉ tiêu chính thức; đề xuất được hệ thống tự duyệt mang nhãn `Tự thông qua` trong bảng |
| `Từ chối` | Đã bị từ chối hoặc bị văn thư loại khi rà soát kết quả AI |
| `Tất cả` | Xem mọi trạng thái trong danh sách đang tải về |

#### Tìm và mở một đề xuất

1. Gõ tên đề xuất hoặc thông tin văn bản vào ô `Tên đề xuất, văn bản`; danh sách lọc ngay khi nhập.
2. Chọn trạng thái cần xem. Chọn `Nguồn` là `AI trích xuất` hoặc `Cán bộ đề xuất` nếu cần.
3. Quản trị, lãnh đạo và văn thư có thể chọn thêm `Phòng chủ trì`.
4. Bấm dòng đề xuất. Với đề xuất AI, kiểm tra độ tin cậy và cảnh báo `Có thể trùng với chỉ tiêu đã có`, nếu xuất hiện.

> Số cạnh các trạng thái được tính theo nguồn và phòng đang chọn, trước khi lọc nội dung tìm kiếm. Danh sách lấy tối đa 300 đề xuất mới nhất; không có bộ lọc năm trên màn hình này.

![Ngăn chi tiết đề xuất|65](anh/ct-03-chi-tiet.png)

1. **Trạng thái và nguồn** — tên đề xuất, loại, nguồn cán bộ hoặc AI và cảnh báo cần rà soát.
2. **Thông tin đề xuất** — mục tiêu, năm, kỳ báo cáo, hạn, phòng chủ trì, bộ chỉ tiêu và căn cứ.
3. **Văn bản và trích dẫn** — bấm liên kết tại `Văn bản nguồn` để mở văn bản trong hệ thống; đọc `Trích dẫn nguồn` nếu có.
4. **Các nút xử lý** — `Sửa`, `Trình lãnh đạo`, `Từ chối` hoặc `Loại`, `Duyệt thành chỉ tiêu` xuất hiện theo trạng thái và quyền tài khoản.

Sau khi xử lý, ngăn chi tiết ghi người thực hiện, thời điểm và `Ghi chú` nếu có. Nếu đã được duyệt, bấm mã tại `Chỉ tiêu đã tạo` để mở CT-06. Đề xuất AI cần đối chiếu bản gốc; cách xác minh trích xuất xem DL-04 và mục 3.4.

| Thao tác | Người được thực hiện |
|---|---|
| Tạo đề xuất | Quản trị, lãnh đạo, văn thư, trưởng phòng, chuyên viên |
| Sửa hoặc trình | Quản trị, lãnh đạo, văn thư; trưởng phòng phụ trách đề xuất; người đã tạo đề xuất. Sửa khi `Chưa trình` hoặc `Chờ duyệt`; trình chỉ khi `Chưa trình` |
| Duyệt hoặc từ chối | Quản trị, lãnh đạo; trưởng phòng của phòng chủ trì, trừ đề xuất do chính trưởng phòng đó tạo |
| `Loại` | Văn thư, chỉ đối với kết quả `AI trích xuất` còn `Chưa trình` |

#### Nhập thông tin đề xuất mới

![Biểu mẫu đề xuất chỉ tiêu mới|75](anh/ct-03-moi.png)

1. **Tên và nội dung** — nhập `Tên chỉ tiêu`, `Mô tả`; chọn `Loại` và `Bộ chỉ tiêu` nếu có.
2. **Mục tiêu** — khai báo `Giá trị mục tiêu`, `Đơn vị tính`, `Mục tiêu ghi bằng chữ` và `Chiều đánh giá`.
3. **Thời gian và trách nhiệm** — kiểm tra `Năm`, `Kỳ báo cáo`, `Hạn hoàn thành`, `Phòng chủ trì`.
4. **Nút lưu** — chọn `Lưu` để giữ bản nháp hoặc `Lưu và trình` khi thông tin đã đủ.

Cuộn xuống trong hộp thoại để nhập phần căn cứ.

![Phần căn cứ ở cuối biểu mẫu đề xuất|75](anh/ct-03-moi-nguon.png)

1. **Thông tin giao chỉ tiêu** — chọn `Cấp giao`, nhập `Mã theo văn bản` nếu có.
2. **Căn cứ và trích dẫn** — ghi thông tin văn bản và đoạn nội dung làm cơ sở cho đề xuất.
3. **Kết thúc nhập** — bấm `Huỷ` để đóng, hoặc dùng nút lưu phù hợp.

#### Lưu hoặc trình đề xuất mới

1. Bấm `Đề xuất mới`.
2. Nhập `Tên chỉ tiêu` từ 3–300 ký tự và `Mô tả` nếu cần.
3. Chọn loại, bộ chỉ tiêu; nhập giá trị mục tiêu và đơn vị tính. Dùng `Mục tiêu ghi bằng chữ` khi cần giữ cách diễn đạt như “Trên 95%”.
4. Kiểm tra chiều đánh giá, năm, kỳ báo cáo, hạn hoàn thành và phòng chủ trì. Hạn hoàn thành phải thuộc năm của chỉ tiêu.
5. Bổ sung `Cấp giao`, `Mã theo văn bản`, `Căn cứ`, `Trích dẫn nguồn` nếu có.
6. Bấm `Lưu` để giữ đề xuất ở trạng thái `Chưa trình`, hoặc `Lưu và trình` khi thông tin đã đủ.

> Để trình hoặc duyệt, phải có tên chỉ tiêu, giá trị mục tiêu không âm, đơn vị tính, năm, kỳ báo cáo, hạn hoàn thành và phòng chủ trì. Khi tạo mới, năm hiện tại, kỳ báo cáo hằng năm và ngày cuối năm được điền sẵn; cần kiểm tra lại theo văn bản giao.

#### Sửa và trình đề xuất đã lưu

1. Mở dòng có trạng thái `Chưa trình`, bấm `Sửa` nếu cần bổ sung.
2. Kiểm tra các trường bắt buộc, bấm `Lưu và trình`; hoặc bấm `Lưu`, sau đó bấm `Trình lãnh đạo` trong ngăn chi tiết.
3. Kiểm tra trạng thái đã chuyển sang `Chờ duyệt` và thời điểm tự thông qua, nếu có.

Đề xuất `Chờ duyệt` vẫn được sửa theo quyền, nhưng không trình lần nữa. Khi trưởng phòng sửa đề xuất của người khác trong phòng, trường `Phòng chủ trì` bị khóa. Đề xuất ở trạng thái `Đã duyệt` hoặc `Từ chối` không sửa tiếp được trên màn hình này.

#### Duyệt thành chỉ tiêu chính thức

1. Mở đề xuất, đối chiếu mục tiêu, thời gian, phòng chủ trì, căn cứ và trích dẫn nguồn.
2. Bấm `Duyệt thành chỉ tiêu`.
3. Kiểm tra `Trọng số` trong hộp thoại; giá trị mặc định là 1, cho phép từ 0,1 đến 10.
4. Bấm `Duyệt`.
5. Trong thông báo tạo thành công, bấm `Mở hồ sơ chỉ tiêu` để kiểm tra chỉ tiêu mới; việc giao người phụ trách thực hiện trong CT-06.

Người có thẩm quyền có thể duyệt cả đề xuất `Chưa trình` nếu thông tin đã đầy đủ. Khi thiếu thông tin, hệ thống báo trường cần bổ sung và mở biểu mẫu sửa nếu tài khoản có quyền. Phòng chủ trì và bộ chỉ tiêu được chọn phải còn hoạt động khi duyệt.

#### Từ chối hoặc loại một đề xuất

1. Mở đề xuất cần xử lý, bấm `Từ chối`; văn thư bấm `Loại` đối với kết quả AI chưa trình.
2. Trong hộp `Từ chối đề xuất`, nhập `Lý do từ chối` từ 5–500 ký tự.
3. Bấm `Từ chối` để xác nhận. Đề xuất chuyển sang `Từ chối`, dừng thời hạn tự thông qua và giữ lại lý do để đối chiếu.

> `Loại` là thao tác kết thúc kết quả AI đang rà soát, không xoá bản ghi đề xuất. Văn thư không được loại đề xuất đã trình; người có quyền duyệt quyết định các đề xuất này.

#### Theo dõi đề xuất tự thông qua

1. Chọn `Chờ duyệt`, xem dòng `Tự thông qua` dưới trạng thái; mở chi tiết để xem ngày giờ cụ thể.
2. Xử lý đề xuất trước thời điểm này nếu cần sửa hoặc từ chối. Thời hạn được tính từ lúc trình theo cấu hình hệ thống, mặc định ba ngày; có thể được quản trị tắt.
3. Khi đến hạn, hệ thống kiểm tra điều kiện và tự tạo chỉ tiêu nếu hợp lệ. Bảng ghi `Tự thông qua`; ngăn chi tiết ghi `Hệ thống tự thông qua` và mã chỉ tiêu đã tạo.
4. Nếu thiếu thông tin bắt buộc hoặc dữ liệu không hợp lệ để tạo chỉ tiêu, hệ thống giữ trạng thái `Chờ duyệt`, dừng đếm hạn và thông báo lãnh đạo, trưởng phòng để xử lý. Bổ sung thông tin rồi duyệt theo quy trình trên.

![Đề xuất đã được hệ thống tự thông qua|65](anh/ct-03-tu-thong-qua.png)

1. **Kết quả duyệt** — dòng `Duyệt` ghi `Hệ thống tự thông qua` và thời điểm thực hiện.
2. **Chỉ tiêu đã tạo** — bấm mã để mở hồ sơ chỉ tiêu chính thức.

> `Tự thông qua` vẫn tạo chỉ tiêu chính thức và ghi nhận sự kiện trong màn hình **Trách nhiệm** (DH-04); chỉ tiêu mới cần được giao người phụ trách, báo cáo và theo dõi như các chỉ tiêu khác.

### CT-04 · Duyệt báo cáo

**Đường dẫn:** menu `Chỉ tiêu` › `Duyệt báo cáo` (`/admin/approvals`) · **Vai trò:** quản trị hệ thống, lãnh đạo UBND và trưởng phòng; trưởng phòng chỉ duyệt báo cáo của phòng mình.

Kiểm tra số liệu cán bộ gửi trước khi ghi nhận thành kết quả chính thức của chỉ tiêu. Danh sách chỉ gồm báo cáo đang chờ duyệt; báo cáo đã duyệt hoặc trả lại được xem trong **CT-06 · Hồ sơ chỉ tiêu**.

![Danh sách báo cáo chờ duyệt](anh/ct-04.png)

1. **Tìm kiếm và phòng ban** — tìm theo mã, tên chỉ tiêu hoặc người gửi; quản trị hệ thống và lãnh đạo UBND có thêm bộ lọc `Phòng ban`.
2. **Báo cáo đang chờ** — đối chiếu số đề xuất, số hiện tại, người gửi và thời điểm gửi.
3. **Tự thông qua** — thời gian còn lại trước hạn xử lý tự động; đưa chuột lên nhãn để xem ngày, giờ cụ thể.
4. **Xử lý báo cáo** — mở hộp `Duyệt số liệu` hoặc `Trả lại báo cáo`.

| Cột | Cách đọc |
|---|---|
| `Chỉ tiêu` | Tên mở hồ sơ; bên dưới là mã chỉ tiêu và kỳ báo cáo, nếu có |
| `Phòng` | Phòng chủ trì chỉ tiêu |
| `Hiện tại → Đề xuất` | Số đề xuất in đậm ở trên; số chính thức hiện tại ở dưới, hoặc `Hiện tại: chưa có` |
| `Người gửi` | Tên người gửi và thời gian đã chờ; đưa chuột lên để xem thời điểm gửi |
| `Tự thông qua` | Thời gian còn lại, `Đến hạn` khi đã đến hạn, hoặc dấu `—` khi không đặt hạn tự thông qua |

#### Tìm và kiểm tra báo cáo

1. Nhập vào ô `Mã, tên chỉ tiêu, người gửi`; danh sách lọc ngay khi nhập.
2. Chọn `Phòng ban` nếu cần và tài khoản có bộ lọc này.
3. Bấm dấu `+` đầu dòng để xem thông tin người gửi kê khai.
4. Bấm tên chỉ tiêu để mở hồ sơ và kiểm tra tệp minh chứng trước khi quyết định.

![Thông tin mở rộng của báo cáo](anh/ct-04-chi-tiet.png)

1. **Chỉ tiêu giao và nguồn số liệu** — đối chiếu mục tiêu với nguồn đã kê khai trong báo cáo.
2. **Giải trình và ghi chú** — xuất hiện khi người gửi có nhập nội dung.
3. **Minh chứng** — số tệp gắn với báo cáo; mở hồ sơ chỉ tiêu để xem tệp.

Danh sách tự tải lại mỗi phút; bấm biểu tượng `Tải lại` khi cần cập nhật ngay. Số báo cáo bên dưới tiêu đề được tính theo phạm vi phòng ban trước khi áp dụng ô tìm kiếm. Cách sắp xếp và phân trang xem mục 1.5.

#### Duyệt số liệu

1. Kiểm tra kỳ, nguồn số liệu, giải trình và minh chứng của báo cáo.
2. Bấm `Duyệt` ở cuối dòng.
3. Trong hộp `Duyệt số liệu`, đối chiếu `Số hiện tại`, `Số đề xuất` và `Người gửi`.
4. Nhập `Ghi chú duyệt` nếu cần.
5. Bấm `Duyệt` để xác nhận.

Số được duyệt trở thành kết quả chính thức của chỉ tiêu; hệ thống cập nhật tình trạng và thông báo cho người gửi. Báo cáo rời danh sách chờ.

> Báo cáo do chính tài khoản đang dùng gửi hiển thị `Báo cáo của bạn`; không được tự duyệt hoặc tự trả lại. Cần người có quyền khác xử lý.

#### Trả lại báo cáo cần chỉnh sửa

1. Bấm `Trả lại` ở cuối dòng báo cáo.
2. Nhập `Lý do trả lại`, tối thiểu 3 ký tự; nêu rõ số liệu hoặc minh chứng cần bổ sung.
3. Bấm `Trả lại` trong hộp thoại.

Báo cáo được ghi nhận là đã trả lại và người gửi nhận thông báo; số liệu chính thức của chỉ tiêu không đổi. Người gửi đối chiếu lý do trong hồ sơ rồi lập báo cáo lại.

Nếu dòng hiển thị `Dữ liệu đã đổi`, chỉ tiêu đã có số liệu mới kể từ khi lập báo cáo; nút `Duyệt` không còn xuất hiện. Kiểm tra hồ sơ và dùng `Trả lại` để người gửi đối chiếu số liệu mới. Nếu báo cáo vừa được người khác xử lý, tải lại danh sách trước khi tiếp tục.

#### Theo dõi hạn tự thông qua

Hạn được tính từ thời điểm gửi báo cáo cộng số ngày tại `Cấu hình` › `Tự thông qua báo cáo sau` (mặc định 7 ngày; quản trị viên có thể thay đổi). Nhãn chuyển cam khi còn không quá 2 ngày, đỏ khi còn không quá 1 ngày hoặc đã đến hạn. Đặt số ngày bằng 0 thì không tự thông qua.

Khi quá hạn mà chưa được xử lý, hệ thống tự ghi nhận số liệu và ghi trách nhiệm của người duyệt để chậm. Báo cáo do trưởng phòng gửi được quy về khâu duyệt của lãnh đạo; nếu chưa có tài khoản lãnh đạo đang hoạt động, hệ thống chuyển về quản trị hệ thống. Các báo cáo khác quy về trưởng phòng phụ trách. Có thể theo dõi tại **DH-04 · Trách nhiệm**.

> Báo cáo có `Dữ liệu đã đổi` không tự thông qua để tránh ghi đè số liệu mới. Hệ thống thông báo cho người duyệt và lãnh đạo xử lý; cần đối chiếu và trả lại báo cáo.

### CT-05 · Báo cáo tổng hợp

**Đường dẫn:** menu `Chỉ tiêu` › `Báo cáo tổng hợp` (`/admin/reports`); tài khoản thuộc phòng thấy tên `Báo cáo của phòng` · **Vai trò:** tất cả, theo phạm vi tại mục 1.2.

Tổng hợp kết quả chính thức theo năm, bộ chỉ tiêu và phòng chủ trì để theo dõi, xuất Excel hoặc in phụ lục báo cáo. Chỉ tiêu đã lưu trữ không nằm trong báo cáo.

![Báo cáo tổng hợp theo bộ chỉ tiêu](anh/ct-05.png)

1. **Xuất và in** — tải tệp Excel hoặc mở hộp in báo cáo theo phạm vi đang chọn.
2. **Năm, bộ và phòng** — chọn bộ chỉ tiêu của năm; tài khoản có phạm vi toàn địa phương được chọn thêm phòng chủ trì.
3. **Số liệu tổng hợp** — số chỉ tiêu, tiến độ chung và số lượng theo tình trạng trong phạm vi đã chọn.
4. **Bảng kết quả** — xem kế hoạch, số liệu chính thức, đánh giá và thời điểm cập nhật; bấm tên chỉ tiêu để mở hồ sơ.

#### Chọn phạm vi báo cáo

1. Chọn năm ở đầu trang.
2. Chọn `Bộ chỉ tiêu`; chọn `Chỉ tiêu ngoài bộ` để xem các chỉ tiêu chưa thuộc bộ nào.
3. Nếu có ô `Toàn địa phương`, giữ nguyên để xem toàn địa phương hoặc chọn một phòng.
4. Kiểm tra tên báo cáo phía trên bảng và dòng `Số liệu cập nhật gần nhất` dưới tiêu đề trang.

Khi đổi năm, hệ thống chọn bộ đầu tiên của năm đó nếu có. Báo cáo theo phòng chỉ gồm chỉ tiêu do phòng **chủ trì**, không gồm chỉ tiêu phòng chỉ phối hợp.

#### Đọc số liệu và bảng kết quả

| Vùng hoặc cột | Ý nghĩa |
|---|---|
| `Chỉ tiêu`, `Hoàn thành`, `Có nguy cơ / quá hạn` | Đếm chỉ tiêu không còn chỉ tiêu con trong phạm vi báo cáo; số theo tình trạng không tính chỉ tiêu thống kê |
| `Tiến độ chung` | Bình quân theo trọng số của các chỉ tiêu cấp trên cùng trong phạm vi báo cáo, không tính chỉ tiêu thống kê |
| `STT`, `Chỉ tiêu` | Số thứ tự theo văn bản nếu có; tên, mã hệ thống và nhóm chỉ tiêu |
| `ĐVT` | Đơn vị tính của chỉ tiêu |
| `Kế hoạch` | Mục tiêu ghi bằng chữ nếu có, nếu không thì là giá trị kế hoạch |
| `Thực hiện` | Số liệu chính thức; dấu `—` khi chưa có báo cáo được ghi nhận |
| `Tỷ lệ`, `Đánh giá` | Tiến độ và tình trạng theo quy ước tại mục 1.5 |
| `Phòng chủ trì`, `Cập nhật` | Đơn vị chịu trách nhiệm và thời điểm có số liệu chính thức gần nhất; chưa có thì ghi `Chưa báo cáo` |

Bảng liệt kê cả chỉ tiêu cha và chỉ tiêu con để giữ cấu trúc bộ; vì vậy tổng dòng ở cuối bảng có thể lớn hơn số `Chỉ tiêu` phía trên. Các ô số liệu tổng hợp chỉ để xem, không phải nút lọc tình trạng.

Với bộ chỉ gồm chỉ tiêu thống kê, màn hình thể hiện tình hình thu thập số liệu như sau.

![Báo cáo của bộ chỉ tiêu thống kê](anh/ct-05-thong-ke.png)

1. **Tổng hợp số liệu thống kê** — xem `Chỉ tiêu thống kê`, `Đã có số liệu`, `Chưa có số liệu`, số `Phòng chủ trì` và `Cập nhật gần nhất`.
2. **Số liệu và đánh giá** — bảng dùng cột `Số liệu`, không có `Kế hoạch` hoặc `Tỷ lệ`; từng dòng ghi `Đã có số liệu` hoặc `Chưa có số liệu`.

Nếu báo cáo có nhiều phòng cùng chủ trì các chỉ tiêu có mục tiêu, bên dưới hoặc bên cạnh bảng xuất hiện biểu đồ `Tiến độ bình quân theo phòng`. Biểu đồ tính bình quân tiến độ các chỉ tiêu không có chỉ tiêu con của từng phòng.

#### Xuất báo cáo Excel

1. Chọn đúng năm, bộ chỉ tiêu và phòng chủ trì.
2. Bấm `Xuất Excel`.
3. Mở tệp tải về để kiểm tra phạm vi và thời điểm xuất.

Tệp gồm toàn bộ chỉ tiêu phù hợp với **năm, bộ chỉ tiêu và phòng chủ trì** đang chọn, không giới hạn ở trang bảng đang xem. Có ba trang tính:

- `TONG_HOP`: phạm vi, người xuất, thời điểm xuất và kết quả tổng hợp theo phòng.
- `CHI_TIET`: kế hoạch, thực hiện, đơn vị tính, tiến độ, tình trạng và thời điểm cập nhật từng chỉ tiêu.
- `LICH_SU`: các lần báo cáo và kết quả duyệt; chuyên viên và người xem chỉ nhận lịch sử đã được duyệt.

#### In phụ lục báo cáo

1. Chọn phạm vi báo cáo và kiểm tra số liệu.
2. Bấm `In báo cáo`.
3. Kiểm tra bản xem trước: tên bộ, phạm vi, thời điểm số liệu và bảng chỉ tiêu.
4. Chọn máy in hoặc lưu thành PDF trong hộp in của trình duyệt.

Bản in là phụ lục khổ A4 ngang, gồm toàn bộ danh sách đã lọc, dòng tổng cộng và vị trí ký. Không in các nút thao tác, ô tổng hợp hay biểu đồ trên màn hình. Nút `In báo cáo` không dùng được khi danh sách không có chỉ tiêu. Quy ước in chung xem mục 1.5.
