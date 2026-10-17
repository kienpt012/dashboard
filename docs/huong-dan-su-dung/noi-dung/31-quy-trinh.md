## 3.5 Nhập số liệu hàng loạt bằng Excel

Quy trình này dùng khi cần cập nhật số liệu của nhiều chỉ tiêu trong một phòng cùng lúc bằng phiếu Excel do hệ thống phát hành, thay vì báo cáo từng chỉ tiêu tại hồ sơ chỉ tiêu (CT-06). Quản trị hệ thống, Lãnh đạo UBND, Trưởng phòng và Chuyên viên được nhập; Văn thư và Người xem không có chức năng này. Kết quả cuối cùng là số liệu mới trở thành số liệu chính thức của chỉ tiêu. Số liệu do Lãnh đạo UBND hoặc quản trị viên nhập được ghi ngay. Số liệu do Trưởng phòng hoặc Chuyên viên gửi chỉ được ghi sau khi được duyệt.

| Bước | Người thực hiện | Màn hình | Việc làm | Kết quả, trạng thái |
|---|---|---|---|---|
| 1 | Người nhập | DL-03 | Chọn năm (lãnh đạo, quản trị chọn thêm phòng ban), bấm `Tải phiếu Excel` | Tệp phiếu hiện trạng của phòng |
| 2 | Người nhập | Tệp Excel trên máy | Điền `Giá trị mới`, `Ghi chú` cho chỉ tiêu có số mới | Phiếu đã điền |
| 3 | Người nhập | DL-03 | Tải phiếu lên, bấm `Đối soát`, sửa lỗi nếu có | Lượt nhập `Đã đối soát, chưa ghi`; số liệu chưa thay đổi |
| 4a | Lãnh đạo UBND, Quản trị hệ thống | DL-03 | Bấm `Ghi nhận số liệu` | Số liệu chính thức cập nhật ngay; lượt nhập `Đã ghi nhận` |
| 4b | Trưởng phòng, Chuyên viên | DL-03 | Bấm `Gửi số liệu` | Mỗi dòng thành một báo cáo `Chờ duyệt`; lượt nhập `Chờ duyệt` |
| 5 | Người duyệt | CT-04 hoặc DH-02 | `Duyệt` hoặc `Trả lại` từng dòng | Dòng `Đã duyệt` hoặc `Trả lại`; trạng thái lượt nhập đổi theo kết quả |
| 6 | Người nhập | DL-03, DH-02 | Theo dõi `Lịch sử nhập`, gửi lại dòng bị trả lại | Số liệu được ghi nhận đầy đủ |

#### Bước 1. Tải phiếu hiện trạng
1. Mở màn hình nhập Excel (DL-03) trong nhóm **Dữ liệu** của menu. Trưởng phòng, Chuyên viên thấy màn hình này với tên `Nộp báo cáo Excel`; Lãnh đạo UBND, quản trị viên thấy tên `Nhập số liệu Excel`. Cũng có thể bấm `Nhập Excel` trên màn hình Danh mục chỉ tiêu (CT-02).
2. Tại bước `Tải phiếu hiện trạng`, chọn năm. Lãnh đạo UBND, quản trị viên phải chọn thêm `Phòng ban`; nếu bỏ trống, hệ thống nhắc `Chọn phòng ban để tải phiếu`. Trưởng phòng, Chuyên viên chỉ tải được phiếu của phòng mình.
3. Bấm `Tải phiếu Excel`. Phiếu tải về gồm mọi chỉ tiêu chưa lưu trữ của phòng trong năm đã chọn, kèm mục tiêu và giá trị hiện tại.

#### Bước 2. Điền phiếu
1. Mở tệp bằng Excel, chọn trang `CAP_NHAT`; mỗi dòng là một chỉ tiêu. Trang `HUONG_DAN` tóm tắt cách điền.
2. Chỉ điền hai cột tô vàng là `Giá trị mới` và `Ghi chú`. Các cột còn lại đã bị khóa.
3. Với chỉ tiêu không có số mới, để trống cả hai ô.
4. Với chỉ tiêu có số mới, gõ trực tiếp một số không âm vào ô `Giá trị mới`; không dùng công thức, không gõ kèm chữ. Ghi `Ghi chú` nêu kỳ báo cáo hoặc nguồn số liệu. Ghi chú bắt buộc khi số mới khác số hiện tại và không quá 2.000 ký tự.
5. Lưu tệp, giữ định dạng `.xlsx`.

> [!CANH-BAO] Chỉ dùng phiếu vừa tải từ hệ thống. Không chép dòng từ tệp khác, không đổi tên hay thứ tự cột. Phiếu ghi kèm phiên bản số liệu của từng chỉ tiêu. Nếu trong lúc điền có người khác cập nhật chỉ tiêu, dòng đó sẽ báo lỗi khi đối soát và phải tải phiếu mới.

#### Bước 3. Tải lên và đối soát
1. Tại bước `Tải lên và đối soát`, kéo tệp vào ô `Kéo phiếu đã điền vào đây`, hoặc bấm vào ô để chọn tệp. Hệ thống chỉ nhận tệp `.xlsx`, dung lượng tối đa 5 MB và không quá 5.000 dòng.
2. Bấm `Đối soát`. Khung `Kết quả đối soát` hiện bốn chỉ số `Tổng dòng`, `Có thay đổi`, `Không đổi`, `Lỗi` và bảng chi tiết. Mỗi dòng trong bảng ghi số cũ → số mới, hoặc nội dung lỗi.
3. Nếu hiện `Sửa các dòng lỗi trong tệp rồi đối soát lại`, sửa tệp theo bảng dưới, tải lên lại và bấm `Đối soát` lần nữa. Nếu hiện `Không có thay đổi để ghi nhận`, phiếu chưa có dòng nào điền giá trị mới.

Đối soát chỉ kiểm tra, chưa làm thay đổi số liệu. Mỗi lần đối soát tạo thêm một dòng `Đã đối soát, chưa ghi` trong `Lịch sử nhập`.

| Thông báo lỗi | Cách xử lý |
|---|---|
| `Vui lòng ghi rõ kỳ báo cáo hoặc nguồn số liệu cho giá trị thay đổi` | Điền `Ghi chú` cho dòng đó |
| `Có ghi chú nhưng chưa nhập giá trị mới` | Điền `Giá trị mới` hoặc xoá ghi chú |
| `Giá trị mới phải là ô kiểu số, không dùng công thức hoặc chuỗi định dạng` | Xoá nội dung ô, gõ lại số trực tiếp |
| `Dữ liệu đã thay đổi (file: …, hệ thống: …); hãy tải biểu mẫu mới` | Tải phiếu mới (bước 1) và điền lại |
| `Thông tin khóa hoặc giá trị hiện tại trong biểu mẫu đã bị thay đổi` | Tải phiếu mới, chỉ điền hai cột tô vàng |
| `Chỉ tiêu đã được lưu trữ và không còn nhận báo cáo mới` | Để trống dòng đó |
| `Biểu mẫu đã cũ hoặc không đúng phiên bản; vui lòng tải biểu mẫu mới` hoặc `Cấu trúc cột đã bị thay đổi; vui lòng dùng biểu mẫu mới tải từ hệ thống` | Lỗi này áp dụng cho cả tệp: tải phiếu mới và điền lại |

#### Bước 4a. Lãnh đạo UBND, quản trị viên ghi nhận trực tiếp
1. Tại bước `Ghi nhận`, bấm `Ghi nhận số liệu`. Hệ thống báo `Đã ghi nhận số liệu chính thức`.
2. Giá trị hiện tại của từng chỉ tiêu được thay bằng giá trị mới, và tình trạng chỉ tiêu được tính lại. Lượt nhập chuyển sang `Đã ghi nhận`, không qua bước duyệt.
3. Báo cáo của người khác đang chờ duyệt cho cùng chỉ tiêu sẽ hiện nhãn `Dữ liệu đã đổi` ở CT-04. Người duyệt chỉ còn cách trả lại các báo cáo đó.

#### Bước 4b. Trưởng phòng, Chuyên viên gửi duyệt
1. Tại bước `Gửi duyệt`, bấm `Gửi số liệu`. Hệ thống báo `Đã gửi số liệu, chờ duyệt`.
2. Mỗi dòng có thay đổi trở thành một báo cáo `Chờ duyệt` riêng tại `Duyệt báo cáo` (CT-04), và lượt nhập chuyển sang `Chờ duyệt`. Số liệu chính thức chỉ thay đổi khi từng dòng được duyệt.
3. Nếu hệ thống báo `Bạn đã có báo cáo đang chờ duyệt cho: …`, các chỉ tiêu được liệt kê đã có báo cáo của bạn chưa được xử lý. Có hai cách: để trống các dòng đó trong tệp rồi đối soát lại, hoặc chờ báo cáo trước được duyệt hay trả lại.

Nút ở bước cuối chỉ bấm được khi bảng đối soát không còn dòng lỗi và có ít nhất một dòng thay đổi. Hãy bấm nút ngay sau khi đối soát, trên cùng trang đó; nếu đã rời trang, tải tệp lên và đối soát lại. Nếu hệ thống báo `Dữ liệu đã thay đổi sau bước xem trước`, nghĩa là có người vừa cập nhật chỉ tiêu: tải phiếu mới và làm lại từ bước 1.

#### Bước 5. Duyệt các dòng gửi bằng Excel
Trưởng phòng duyệt các dòng do chuyên viên phòng mình gửi. Lãnh đạo UBND và quản trị viên duyệt được dòng của mọi phòng. Không ai tự duyệt được dòng do mình gửi; với những dòng đó, cột thao tác hiện `Báo cáo của bạn`. Vì vậy, phiếu do Trưởng phòng gửi sẽ do Lãnh đạo UBND hoặc quản trị viên duyệt.

1. Mở `Duyệt báo cáo` (CT-04), hoặc `Việc của tôi` (DH-02) › tab `Chờ tôi duyệt`. Mỗi dòng của phiếu là một báo cáo riêng. Cột `Hiện tại → Đề xuất` cho thấy số đang có và số được gửi.
2. Bấm `+` đầu dòng để xem `Ghi chú` của người gửi.
3. Nếu đồng ý, bấm `Duyệt`, nhập `Ghi chú duyệt` nếu cần, rồi bấm `Duyệt`. Số liệu chính thức của chỉ tiêu được cập nhật.
4. Nếu không đồng ý, bấm `Trả lại`, nhập `Lý do trả lại`, rồi bấm `Trả lại`.
5. Dòng có nhãn `Dữ liệu đã đổi` (chỉ tiêu đã có số mới sau lúc gửi) không duyệt được. Chỉ bấm `Trả lại` để người gửi đối chiếu.

Người gửi nhận thông báo cho từng dòng được duyệt hoặc bị trả lại; thông báo trả lại có kèm lý do. Khi phiếu được gửi, hệ thống không tạo thông báo trên chuông cho người duyệt. Người duyệt theo dõi số đỏ cạnh `Duyệt báo cáo` trên menu.

#### Bước 6. Theo dõi kết quả và gửi lại
1. Tại DL-03, khung `Lịch sử nhập` liệt kê các lượt nhập. Chuyên viên thấy lượt do mình nộp, Trưởng phòng thấy lượt của cả phòng, còn Lãnh đạo UBND và quản trị viên lọc theo `Phòng ban`.
2. Cột `Trạng thái` tự cập nhật theo kết quả duyệt, kèm số dòng đã duyệt, bị trả lại và còn chờ.
3. Bấm `+` đầu dòng để xem `Kết quả`, `Người duyệt`, `Ghi chú` của từng chỉ tiêu. Lượt `Đã đối soát, chưa ghi` không có phần chi tiết.
4. Người gửi cũng xem được kết quả từng dòng tại `Việc của tôi` (DH-02), trong tab `Báo cáo đã gửi`; các dòng bị trả lại còn hiện ở tab `Bị trả lại`.
5. Có hai cách gửi lại dòng bị trả lại: tải phiếu mới (bước 1) và chỉ điền các chỉ tiêu cần gửi lại; hoặc bấm `Báo cáo lại` để báo cáo chỉ tiêu đó tại hồ sơ chỉ tiêu (CT-06).

| Trạng thái lượt nhập | Ý nghĩa |
|---|---|
| `Đã đối soát, chưa ghi` | Đã đối soát nhưng chưa ghi nhận hoặc gửi; không ảnh hưởng số liệu |
| `Chờ duyệt` | Đã gửi, chưa dòng nào được xử lý |
| `Đang duyệt` | Đã có dòng được xử lý, vẫn còn dòng chờ |
| `Đã duyệt` | Mọi dòng được duyệt, kể cả dòng hệ thống tự thông qua |
| `Duyệt một phần` | Đã xử lý hết; có dòng được duyệt, có dòng bị trả lại |
| `Bị trả lại` | Mọi dòng bị trả lại |
| `Đã ghi nhận` | Lãnh đạo UBND hoặc quản trị viên đã ghi nhận trực tiếp |

> **Thời hạn tự động.** Mỗi dòng chờ duyệt được tự thông qua sau một số ngày kể từ lúc gửi, mặc định 7 ngày. Quản trị viên chỉnh số ngày tại Cấu hình (HT-04), mục `Tự thông qua báo cáo sau`; đặt 0 để tắt cơ chế này. Cột `Tự thông qua` ở CT-04 đếm ngược thời hạn này.
> **Khi quá hạn.** Hệ thống tự thông qua dòng đó và cập nhật số liệu chính thức. Hệ thống đồng thời ghi trách nhiệm cho người duyệt để chậm: Trưởng phòng với dòng của chuyên viên, Lãnh đạo UBND với dòng của Trưởng phòng. Người gửi, người duyệt và Lãnh đạo UBND nhận thông báo. Nếu chỉ tiêu đã có số liệu mới sau lúc gửi, hệ thống không tự thông qua mà báo người duyệt và Lãnh đạo UBND để trả lại.
> **Giới hạn quyền.** Văn thư và Người xem không nhập được Excel. Trưởng phòng, Chuyên viên chỉ nhập được chỉ tiêu của phòng mình. Chỉ người đã bấm `Đối soát` mới ghi nhận hoặc gửi được lượt nhập đó, và mỗi lượt chỉ gửi được một lần.
> **Lưu ý.** Số liệu gửi bằng phiếu Excel không gắn kỳ báo cáo và không kèm minh chứng. Với chỉ tiêu phải báo cáo theo kỳ hoặc cần minh chứng, hãy báo cáo tại hồ sơ chỉ tiêu (CT-06).


## 3.6 Chỉ đạo điều hành, yêu cầu giải trình và đánh giá chỉ tiêu

Quy trình này dùng khi lãnh đạo UBND trực tiếp theo dõi một chỉ tiêu. Lãnh đạo đưa văn bản chỉ đạo vào hồ sơ, yêu cầu phòng chủ trì giải trình khi chỉ tiêu có vấn đề (ví dụ chậm tiến độ, thiếu báo cáo), sau đó đánh giá kết quả theo từng kỳ. Kết quả cuối cùng là hồ sơ chỉ tiêu (CT-06) có đủ ba phần: chỉ đạo, thực hiện, đánh giá. Mọi yêu cầu, trả lời và đánh giá đều ghi tên người làm và thời điểm tại thẻ `Dòng thời gian`.

| Bước | Người thực hiện | Màn hình | Việc làm | Kết quả, trạng thái |
|---|---|---|---|---|
| 1 | Lãnh đạo UBND | DH-01, DH-04 → CT-06 | Xác định chỉ tiêu cần chỉ đạo, mở hồ sơ | — |
| 2 | Lãnh đạo UBND, văn thư hoặc cán bộ phòng chủ trì | CT-06, thẻ `Chỉ đạo điều hành` | Bổ sung văn bản chỉ đạo | Văn bản có trong hồ sơ; dấu chấm trước tên thẻ chuyển sang màu xanh |
| 3 | Lãnh đạo UBND | CT-06 | Gửi yêu cầu giải trình, đặt hạn trả lời | `Chờ trả lời`; trưởng phòng chủ trì và chuyên viên phụ trách nhận thông báo |
| 4 | Trưởng phòng chủ trì hoặc chuyên viên phụ trách | DH-02 → CT-06 | Trả lời giải trình | `Đã giải trình`; lãnh đạo đã yêu cầu nhận thông báo |
| 5 | Hệ thống | — | Theo dõi hạn trả lời | Quá hạn: `Quá hạn trả lời`; gửi thông báo và ghi nhận việc báo lên lãnh đạo |
| 6 | Lãnh đạo UBND hoặc trưởng phòng chủ trì | CT-06, thẻ `Đánh giá` | Đánh giá kết quả từng kỳ | `Vượt`, `Đạt`, `Đạt một phần` hoặc `Không đạt`; trưởng phòng và chuyên viên phụ trách nhận thông báo |
| 7 | Lãnh đạo UBND, trưởng phòng | DH-01, DH-04, DH-03 | Theo dõi tổng hợp | Số giải trình đang mở, quá hạn; số chỉ tiêu chưa có chỉ đạo, chưa đánh giá |

#### Bước 1. Xác định chỉ tiêu cần chỉ đạo
1. Mở **Trung tâm điều hành** (DH-01) và xem thẻ `Cảnh báo`. Để thu hẹp danh sách, bấm nút lọc `Quá hạn`, `Nguy cơ không đạt`, `Thiếu báo cáo` hoặc `Giải trình quá hạn`.
2. Bấm vào tên cảnh báo để mở hồ sơ chỉ tiêu (CT-06).
3. Để rà soát theo phòng, mở **Trách nhiệm** (DH-04) và bấm dấu `+` đầu dòng của phòng. Màn hình hiện số chỉ tiêu `Chưa có văn bản chỉ đạo`, `Chưa đánh giá` và `Giải trình đang mở`. Bấm tên phòng để mở danh sách chỉ tiêu của phòng (CT-02), rồi chọn chỉ tiêu cần xem.

#### Bước 2. Bổ sung văn bản chỉ đạo
1. Trong hồ sơ chỉ tiêu, mở thẻ `Chỉ đạo điều hành` và bấm `Thêm văn bản`.
2. Chọn `Loại văn bản` và nhập `Trích yếu` (bắt buộc). Nếu có, nhập thêm `Số hiệu`, `Ngày ban hành`, `Cơ quan ban hành` và `Nội dung chỉ đạo chính`.
3. Nếu văn bản đã có trong Kho văn bản (DL-02), chọn văn bản đó tại ô `Văn bản trong kho`. Nếu chưa có, bấm `Chọn tệp` để đính kèm tệp ảnh hoặc PDF, tối đa 10MB mỗi tệp.
4. Bấm `Lưu`. Văn bản hiện trong danh sách `Văn bản chỉ đạo` và dấu chấm trước tên thẻ `Chỉ đạo điều hành` chuyển sang màu xanh.

Để gỡ văn bản nhập sai, bấm biểu tượng thùng rác (`Gỡ`) ở góc văn bản, rồi bấm `Gỡ` để xác nhận. Văn bản bị gỡ khỏi hồ sơ cùng các tệp đính kèm. Người được gỡ là người đã bổ sung văn bản, lãnh đạo UBND hoặc trưởng phòng chủ trì.

> Nếu chỉ tiêu được tạo từ một văn bản trong kho, đầu thẻ có sẵn dòng `Giao theo văn bản …`. Dòng này không được tính là văn bản chỉ đạo. Khi bổ sung văn bản chỉ đạo, hệ thống chỉ ghi vào `Dòng thời gian`, không gửi thông báo cho ai.

#### Bước 3. Yêu cầu giải trình
1. Trong hồ sơ chỉ tiêu, bấm `Thao tác` › `Yêu cầu giải trình`. Cũng có thể bấm `Yêu cầu` ở góc thẻ `Giải trình` (cột bên phải).
2. Nhập `Nội dung yêu cầu` (ít nhất 5 ký tự), nêu rõ vấn đề cần giải trình.
3. Nếu cần một hạn riêng, nhập `Thời hạn trả lời (ngày)` từ 1 đến 30. Nếu để trống, hệ thống lấy hạn theo cấu hình.
4. Bấm `Gửi yêu cầu`.

Thẻ `Giải trình` hiện yêu cầu với nhãn `Chờ trả lời` và thời gian còn lại, ví dụ "còn 18 giờ". Hệ thống gửi thông báo có ghi số ngày hạn tới trưởng phòng chủ trì và tới chuyên viên phụ trách (nếu chỉ tiêu đã giao người).

> Mỗi chỉ tiêu chỉ có một yêu cầu giải trình đang chờ trả lời. Nút `Yêu cầu giải trình` bị ẩn cho tới khi yêu cầu hiện tại được trả lời. Nếu chỉ cần đôn đốc cập nhật số liệu, bấm `Thao tác` › `Nhắc việc`. Hệ thống báo cho chuyên viên phụ trách, hoặc báo trưởng phòng chủ trì nếu chỉ tiêu chưa giao người. Mỗi chỉ tiêu chỉ được nhắc tối đa một lần trong ngày.

#### Bước 4. Trả lời giải trình
1. Bấm thông báo yêu cầu giải trình trên chuông. Cũng có thể mở **Việc của tôi** (DH-02) › thẻ `Giải trình` (xem hạn ở cột `Hạn trả lời`) rồi bấm `Trả lời` ở dòng chỉ tiêu. Hệ thống mở hồ sơ chỉ tiêu.
2. Tại thẻ `Giải trình` của hồ sơ, bấm `Trả lời` ở dưới yêu cầu.
3. Hộp `Trả lời giải trình` hiện lại nội dung lãnh đạo yêu cầu. Nhập `Nội dung giải trình` (ít nhất 10 ký tự), gồm nguyên nhân, việc đã làm và lộ trình đạt chỉ tiêu.
4. Bấm `Gửi giải trình`.

Nhãn chuyển thành `Đã giải trình`. Nội dung trả lời hiện ngay dưới yêu cầu, kèm tên người trả lời và thời điểm. Lãnh đạo đã gửi yêu cầu nhận được thông báo.

> Mỗi yêu cầu chỉ nhận một nội dung trả lời, nên trưởng phòng hoặc chuyên viên phụ trách trả lời là đủ. Nếu người khác vừa trả lời trước, hệ thống báo cho biết và tải lại hồ sơ. Ô `Giải trình` trong biểu mẫu báo cáo số liệu (bắt buộc khi nộp muộn hoặc khi chỉ tiêu đang chậm) chỉ là nội dung kèm theo báo cáo. Ô này không thay cho việc trả lời yêu cầu giải trình của lãnh đạo.

#### Bước 5. Khi giải trình quá hạn
Nếu đã qua hạn mà chưa có trả lời, hệ thống tự động:
- Đổi nhãn yêu cầu thành `Quá hạn trả lời` (màu đỏ) và hiện thời gian đã quá hạn, ví dụ "quá 2 ngày".
- Gửi một thông báo "Quá hạn giải trình chỉ tiêu …" tới lãnh đạo đã yêu cầu, trưởng phòng chủ trì và chuyên viên phụ trách.
- Ghi vào `Dòng thời gian` của hồ sơ một dòng do **Hệ thống IOC** thực hiện: "báo cáo lên lãnh đạo", ghi chú "Quá hạn trả lời yêu cầu giải trình". Lần này được tính vào cột `Báo lãnh đạo` của phòng tại DH-04.
- Đưa chỉ tiêu vào các danh sách theo dõi:
  - cảnh báo `Giải trình quá hạn` tại DH-01;
  - cột `Giải trình quá hạn` tại DH-04;
  - trang `Việc bị treo` của Trình chiếu (DH-03), với lý do `Quá hạn trả lời giải trình`.

Yêu cầu không tự đóng, phòng chủ trì vẫn phải trả lời theo Bước 4. Sau khi có trả lời, chỉ tiêu được bỏ khỏi cảnh báo và khỏi cột `Giải trình quá hạn`. Lần báo lãnh đạo vẫn được giữ ở cột `Báo lãnh đạo`.

#### Bước 6. Đánh giá kết quả theo kỳ
1. Trong hồ sơ chỉ tiêu, bấm `Đánh giá` ở đầu trang. Cũng có thể mở thẻ `Đánh giá` rồi bấm `Đánh giá`.
2. Chọn `Kỳ đánh giá`. Danh sách gồm các kỳ trong năm kế hoạch, chia theo kỳ báo cáo của chỉ tiêu. Kỳ đã có đánh giá được ghi thêm "· đã đánh giá".
3. Chọn `Kết quả`: `Vượt`, `Đạt`, `Đạt một phần` hoặc `Không đạt`. Với chỉ tiêu loại `Chấm điểm`, nhập thêm `Điểm`, không vượt quá điểm tối đa.
4. Nhập `Nhận xét`. Nếu chọn `Đạt một phần` hoặc `Không đạt`, ô này đổi thành `Nguyên nhân chưa đạt` và bắt buộc phải nhập. Nếu có, nhập thêm `Biện pháp khắc phục`.
5. Bấm `Lưu đánh giá`.

Đánh giá hiện trong thẻ `Đánh giá`, gồm nhãn kết quả, tên người đánh giá và thời điểm. Dấu chấm trước tên thẻ chuyển sang màu xanh. Trưởng phòng chủ trì và chuyên viên phụ trách nhận thông báo kết quả đánh giá. Kết quả đánh giá là nhận định của người có thẩm quyền. Đánh giá không làm thay đổi số liệu, tiến độ hay tình trạng của chỉ tiêu.

> [!CANH-BAO] Mỗi kỳ chỉ có một đánh giá. Khi bấm `Sửa` ở một đánh giá, hoặc chọn lại một kỳ đã đánh giá, hệ thống mở hộp `Sửa đánh giá`. Bấm `Lưu đánh giá` thì nội dung mới thay hẳn nội dung cũ. Kết quả và nhận xét của các lần trước chỉ còn xem được ở `Dòng thời gian`.

#### Bước 7. Theo dõi tổng hợp
- DH-01: ô `Giải trình đang mở` trong thẻ `Việc cần xử lý` cho biết số yêu cầu chưa trả lời; lãnh đạo và trưởng phòng bấm vào ô này để mở DH-04. Bấm dấu `+` ở bảng `Bộ chỉ tiêu` hoặc bảng `Theo phòng ban` để xem số `Có văn bản chỉ đạo` và `Đã đánh giá`.
- DH-04: xem cột `Giải trình quá hạn` và `Báo lãnh đạo` của từng phòng. Bấm `In phụ lục` để in bảng.
- DH-03: dòng chỉ tiêu đang có yêu cầu giải trình được ghi thêm "đang giải trình".

> Hạn trả lời giải trình mặc định 3 ngày, quản trị viên chỉnh tại Cấu hình (HT-04), mục `Hạn trả lời giải trình` (từ 1 đến 30 ngày). Lãnh đạo có thể đặt hạn riêng cho từng yêu cầu tại ô `Thời hạn trả lời (ngày)`. Hạn được tính từ thời điểm gửi yêu cầu, theo ngày lịch. Khi quá hạn, yêu cầu vẫn mở và được ghi nhận như ở Bước 5.

> Phân quyền trong quy trình:
> - Yêu cầu giải trình: chỉ lãnh đạo UBND và tài khoản quản trị hệ thống.
> - Đánh giá, gỡ văn bản chỉ đạo do người khác bổ sung: lãnh đạo UBND và trưởng phòng chủ trì.
> - Trả lời giải trình: trưởng phòng chủ trì hoặc chuyên viên đang phụ trách chỉ tiêu.
> - Bổ sung văn bản chỉ đạo: lãnh đạo, văn thư, trưởng phòng và chuyên viên của phòng chủ trì.
>
> Người xem và cán bộ phòng phối hợp không làm được các thao tác này. Với chỉ tiêu `Đã lưu trữ`, các nút thêm, gỡ văn bản, yêu cầu giải trình và đánh giá bị ẩn.

## 3.7 Tiếp nhận và xử lý phản ánh của người dân

Quy trình áp dụng cho phản ánh, kiến nghị người dân gửi qua cổng thông tin công khai. Quy trình kết thúc khi kết quả xử lý đã được duyệt và hồ sơ được người dân đánh giá hoặc được đóng; nếu phù hợp, kết quả được công khai trên cổng thông tin. Mọi thao tác đều được ghi vào thẻ `Lịch sử` của hồ sơ.

| Bước | Người thực hiện | Màn hình | Việc làm | Kết quả, trạng thái |
|---|---|---|---|---|
| 1 | Người dân | Cổng công khai, trang phản ánh (mục 2.6) | Gửi phản ánh, lưu biên nhận | `Mới tiếp nhận`; người dân nhận mã phản ánh và mã bảo mật |
| 2 | Văn thư (hoặc Lãnh đạo) | ND-01 | Phân loại, chọn đơn vị và cán bộ xử lý | `Đã phân công`; có `Hạn xử lý` |
| 3 | Trưởng phòng | ND-01 | Giao cán bộ trong phòng (khi bước 2 chưa chọn người) | `Đã phân công` |
| 4 | Cán bộ xử lý | ND-01 | Bắt đầu xử lý, liên hệ và trao đổi với người dân | `Đang xử lý` |
| 5 | Cán bộ xử lý, người dân | ND-01; trang tra cứu (mục 2.6) | Yêu cầu và gửi thông tin bổ sung (khi cần) | `Chờ người dân bổ sung`, rồi trở lại `Đang xử lý` |
| 6 | Cán bộ xử lý | ND-01 | Trình kết quả xử lý | `Chờ duyệt kết quả` |
| 7 | Trưởng phòng hoặc Lãnh đạo (không phải người trình) | ND-01 | Duyệt hoặc trả lại kết quả | `Đã có kết quả`, hoặc trở lại `Đang xử lý` |
| 8 | Người dân; Trưởng phòng hoặc Lãnh đạo | Trang tra cứu; ND-01 | Đánh giá kết quả; đóng hồ sơ | `Đã đóng` |
| 9 | Lãnh đạo | ND-01 | Công khai kết quả (khi phù hợp) | Nhãn `Đang công khai` |
| 10 | Người dân; Trưởng phòng hoặc Lãnh đạo | Trang tra cứu; ND-01 | Đề nghị xem xét lại; chấp nhận hoặc từ chối | `Xem xét lại`, hoặc giữ nguyên trạng thái |

Trạng thái chính của hồ sơ lần lượt là `Mới tiếp nhận` → `Đã phân công` → `Đang xử lý` → `Chờ duyệt kết quả` → `Đã có kết quả` → `Đã đóng`. Các nhánh phụ gồm `Chờ người dân bổ sung` (bước 5), `Không tiếp nhận` (sau bước 2) và `Xem xét lại` (bước 10). Trong quy trình này, Quản trị hệ thống có cùng quyền với Lãnh đạo UBND. "Cán bộ xử lý" là chuyên viên hoặc trưởng phòng được chọn tại ô `Cán bộ xử lý`.

#### Bước 1. Người dân gửi phản ánh
1. Trên cổng thông tin công khai, bấm `Gửi và tra cứu phản ánh` trên thanh menu, chọn thẻ `Gửi phản ánh`.
2. Chọn `Lĩnh vực`, nhập `Tiêu đề`, `Nội dung`, `Địa điểm`. Nếu có ảnh hoặc tệp PDF thì đính kèm (tối đa 5 tệp, mỗi tệp không quá 10 MB).
3. Nhập thông tin liên hệ. Muốn nhận thư báo tiến độ thì nhập `Email`, rồi chọn `Email` tại `Nhận thông báo qua`.
4. Đánh dấu `Nội dung không phải khiếu nại, tố cáo` và `Đồng ý cho cơ quan sử dụng thông tin liên hệ để xử lý phản ánh`, rồi bấm `Gửi phản ánh`.
5. Màn hình biên nhận hiện `Mã phản ánh` và `Mã bảo mật`. Bấm `Tải biên nhận` hoặc `In biên nhận` để lưu lại.

> [!CANH-BAO] Mã bảo mật chỉ hiện trên biên nhận. Hệ thống không lưu mã này ở dạng đọc được và thư điện tử thông báo cũng không kèm mã, nên cán bộ không xem lại hay cấp lại được. Không có mã bảo mật, người dân không tra cứu, bổ sung thông tin, đánh giá hay đề nghị xem xét lại được.

#### Bước 2. Tiếp nhận, phân loại và phân công
Hồ sơ mới chưa thuộc phòng nào, nên chỉ văn thư, lãnh đạo và quản trị thấy. Số đỏ cạnh menu `Phản ánh` là tổng số hồ sơ `Mới tiếp nhận` và số đề nghị xem xét lại đang chờ.
1. Mở **Phản ánh** (ND-01), chọn `Trạng thái` là `Mới tiếp nhận`, bấm vào dòng hồ sơ để mở.
2. Đọc nội dung phản ánh. Nếu nhóm vấn đề hoặc mức ưu tiên chưa đúng, bấm `Phân loại`, chọn lại `Nhóm vấn đề`, `Mức ưu tiên`, nhập `Ghi chú`, rồi bấm `Xác nhận`.
3. Bấm `Phân công`, chọn `Đơn vị xử lý`. Nếu đã xác định người xử lý thì chọn `Cán bộ xử lý`; nếu để trống, trưởng phòng sẽ giao ở bước 3. Nhập `Ghi chú phân công`, bấm `Xác nhận`.
4. Hồ sơ chuyển sang `Đã phân công`. Nếu không nhập `Hạn xử lý`, hệ thống tự tính hạn theo mức ưu tiên:

| `Mức ưu tiên` | `Hạn xử lý` tự tính |
|---|---|
| `Khẩn` | 1 ngày |
| `Cao` | Một nửa số ngày cấu hình, làm tròn lên, tối thiểu 2 ngày (mặc định 5 ngày) |
| `Bình thường` | Bằng số ngày cấu hình (mặc định 10 ngày) |
| `Thấp` | Số ngày cấu hình cộng 5 ngày (mặc định 15 ngày) |

"Số ngày cấu hình" là mục `Hạn xử lý` tại **Cấu hình** (HT-04): mặc định 10 ngày, quản trị viên chỉnh tại Cấu hình. Hạn được tính từ lần phân công đầu tiên. Nếu đổi mức ưu tiên sau khi hồ sơ đã có hạn (bằng `Phân loại` hoặc `Phân công`), hạn được tính lại từ thời điểm đổi.

#### Không tiếp nhận phản ánh ngoài phạm vi
Kênh phản ánh không tiếp nhận khiếu nại, tố cáo. Chỉ lãnh đạo và quản trị thực hiện được thao tác này, với hồ sơ đang `Mới tiếp nhận` hoặc `Đã phân công`.
1. Mở hồ sơ, bấm `Không tiếp nhận`.
2. Nhập `Lý do`, bấm `Xác nhận`. Hồ sơ chuyển sang `Không tiếp nhận`; người dân thấy lý do khi tra cứu.

#### Bước 3. Trưởng phòng giao cán bộ xử lý
Hồ sơ đã chuyển về phòng mà chưa có `Cán bộ xử lý` chỉ hiện với trưởng phòng (menu `Phản ánh của phòng`) và lãnh đạo. Chuyên viên chỉ thấy hồ sơ được giao đích danh cho mình.
1. Mở hồ sơ `Đã phân công`, bấm `Phân công`.
2. Giữ nguyên `Đơn vị xử lý`, chọn `Cán bộ xử lý` trong phòng, nhập `Ghi chú phân công`, bấm `Xác nhận`.

Trưởng phòng chỉ phân công được trong phòng mình. Chỉ văn thư, lãnh đạo hoặc quản trị chuyển được hồ sơ sang phòng khác. Trưởng phòng cũng có thể tự xử lý hồ sơ theo bước 4 mà không giao cho ai. Khi phân công lại một hồ sơ đang xử lý, hồ sơ trở về `Đã phân công` và người mới được giao phải bấm `Bắt đầu xử lý`.

#### Bước 4. Xử lý hồ sơ
1. Tại ND-01, chọn `Giao cho tôi` để lọc hồ sơ được giao cho mình. Mở hồ sơ `Đã phân công`, bấm `Bắt đầu xử lý`, rồi bấm `Xác nhận`. Hồ sơ chuyển sang `Đang xử lý`.
2. Liên hệ người dân theo thông tin ở dòng `Người gửi`; kênh người dân chọn được ghi trong ngoặc. Sau mỗi lần liên hệ, bấm `Ghi nhận liên hệ`, chọn `Kênh`, `Kết quả`, nhập `Ghi chú`, bấm `Xác nhận`.
3. Để trả lời người dân, bấm `Thêm trao đổi`, chọn `Gửi người dân`, nhập `Nội dung`, bấm `Xác nhận`. Nếu chỉ ghi chép cho cán bộ, chọn `Ghi chú nội bộ`; người dân không thấy loại ghi chú này.
4. Tệp minh chứng của người dân nằm ở thẻ `Tệp`. Diễn biến hồ sơ xem ở thẻ `Lịch sử`.

> Hồ sơ được tính là đã phản hồi lần đầu khi cán bộ gửi trao đổi `Gửi người dân`, bấm `Yêu cầu bổ sung`, hoặc `Ghi nhận liên hệ` với kết quả `Đã liên hệ được` hoặc `Đã gửi tin nhắn`. Phân công và `Bắt đầu xử lý` không được tính là phản hồi. Trước lần phản hồi đầu tiên, cột `Hạn` theo dõi `Hạn phản hồi`; sau đó chuyển sang `Hạn xử lý`.

#### Bước 5. Yêu cầu người dân bổ sung thông tin
1. Cán bộ xử lý bấm `Yêu cầu bổ sung`, nhập `Nội dung cần người dân bổ sung`, bấm `Xác nhận`. Hồ sơ chuyển sang `Chờ người dân bổ sung`, và hệ thống đặt `Hạn bổ sung` (mặc định 7 ngày).
2. Người dân mở thẻ `Tra cứu hồ sơ` (mục 2.6), nhập `Mã phản ánh`, `Mã bảo mật`, bấm `Tra cứu`. Người dân nhập thông tin vào khung `Trao đổi` rồi bấm `Gửi`; nếu cần gửi thêm tệp thì bấm `Chọn tệp`, sau đó bấm `Gửi tệp`.
3. Khi người dân gửi nội dung ở khung `Trao đổi`, hồ sơ tự trở lại `Đang xử lý`. `Hạn xử lý` được cộng thêm đúng khoảng thời gian đã chờ người dân. Nếu người dân chỉ gửi tệp hoặc trả lời qua điện thoại, hồ sơ vẫn ở `Chờ người dân bổ sung`.
4. Nếu hết `Hạn bổ sung` mà người dân không phản hồi, hồ sơ có nhãn `Quá hạn bổ sung` và hiện trong bộ lọc `Quá hạn bổ sung`. Trưởng phòng hoặc lãnh đạo bấm `Kết thúc do quá hạn bổ sung`, nhập `Ghi chú` nếu cần, rồi bấm `Xác nhận`. Hồ sơ chuyển sang `Đã đóng` và người dân thấy thông báo kết thúc khi tra cứu.

#### Bước 6. Trình duyệt kết quả
1. Khi xử lý xong, cán bộ xử lý bấm `Trình duyệt kết quả`.
2. Nhập `Kết quả xử lý`, bấm `Xác nhận`. Hồ sơ chuyển sang `Chờ duyệt kết quả`. Sau khi được duyệt, nội dung này hiển thị cho người dân và là phần kết quả được dùng khi công khai.

#### Bước 7. Duyệt kết quả
Người duyệt là trưởng phòng của phòng xử lý, lãnh đạo hoặc quản trị. Người đã trình kết quả không thấy nút duyệt. Vì vậy, nếu trưởng phòng tự trình kết quả thì cần một người khác có quyền duyệt, ví dụ lãnh đạo.
1. Tại ND-01, chọn `Trạng thái` là `Chờ duyệt kết quả` rồi mở hồ sơ.
2. Đọc `Kết quả xử lý`, các trao đổi và tệp minh chứng.
3. Nếu đồng ý, bấm `Duyệt kết quả`, nhập `Ghi chú` nếu cần, bấm `Xác nhận`. Hồ sơ chuyển sang `Đã có kết quả`; người dân thấy kết quả khi tra cứu.
4. Nếu chưa đạt, bấm `Trả lại`, nhập `Lý do trả lại`, bấm `Xác nhận`. Hồ sơ trở lại `Đang xử lý` để cán bộ hoàn thiện và trình lại. Lý do được lưu dưới dạng ghi chú nội bộ; người dân chỉ thấy mốc "kết quả được trả lại để hoàn thiện".

#### Bước 8. Đánh giá và đóng hồ sơ
1. Người dân tra cứu hồ sơ, đọc `Kết quả xử lý`, chọn số sao tại `Đánh giá kết quả xử lý`, nhập nhận xét nếu muốn, rồi bấm `Gửi đánh giá`. Hồ sơ tự chuyển sang `Đã đóng`. Mỗi hồ sơ chỉ được đánh giá một lần.
2. Nếu người dân chưa đánh giá, trưởng phòng hoặc lãnh đạo mở hồ sơ `Đã có kết quả`, bấm `Đóng hồ sơ`, nhập `Ghi chú` nếu cần, rồi bấm `Xác nhận`. Người dân vẫn đánh giá được sau khi hồ sơ đã đóng.

Điểm đánh giá trung bình hiện ở ô `Hài lòng` trên ND-01.

#### Bước 9. Công khai kết quả
Chỉ hồ sơ có kết quả đã được duyệt (`Đã có kết quả`, hoặc `Đã đóng` sau khi duyệt) và không có đề nghị xem xét lại đang chờ mới công khai được. Hồ sơ `Không tiếp nhận` hoặc kết thúc do quá hạn bổ sung không công khai được.
1. Lãnh đạo mở hồ sơ, bấm `Công khai`. Hộp thoại hiện bản xem trước gồm `Tiêu đề`, `Nội dung`, `Kết quả` và `Trao đổi công khai`. Họ tên, số điện thoại, email, địa chỉ người gửi đã được tự động thay bằng "[đã ẩn]".
2. Đọc kỹ bản xem trước. Nếu còn thông tin cá nhân, đóng hộp thoại và không công khai.
3. Đánh dấu `Đã kiểm tra, nội dung không còn thông tin cá nhân`, bấm `Xác nhận`. Hồ sơ có nhãn `Đang công khai`, và kết quả hiện ở thẻ `Kết quả đã công khai` trên cổng thông tin.
4. Muốn gỡ khỏi cổng thông tin thì bấm `Gỡ công khai`, rồi bấm `Xác nhận`.

#### Bước 10. Đề nghị xem xét lại
Người dân được đề nghị xem xét lại hồ sơ `Đã có kết quả`, `Đã đóng` hoặc `Không tiếp nhận` trong 30 ngày kể từ kết quả gần nhất. Mỗi hồ sơ được đề nghị tối đa 3 lần. Trong khi đề nghị đang chờ xử lý, người dân không gửi thêm đề nghị và không đánh giá được.
1. Người dân tra cứu hồ sơ, bấm `Đề nghị xem xét lại`, nhập `Lý do`, bấm `Gửi đề nghị`. Trạng thái hồ sơ không đổi.
2. Trên ND-01, hồ sơ có nhãn `Đề nghị xem xét lại`, được đếm vào ô `Đề nghị xem xét lại` và số đỏ cạnh menu. Để lọc các hồ sơ này, chọn `Xem xét lại`.
3. Trưởng phòng hoặc lãnh đạo mở hồ sơ, đọc lý do của người dân trong khung cảnh báo màu vàng.
4. Nếu chấp nhận, bấm `Chấp nhận mở lại`, nhập `Lý do`, bấm `Xác nhận`. Hồ sơ chuyển sang `Xem xét lại`. Kết quả và đánh giá cũ bị bỏ, hồ sơ được gỡ khỏi trang công khai, cán bộ xử lý cũ bị bỏ và `Hạn xử lý` được tính lại theo mức ưu tiên. Sau đó phân công lại cán bộ (bước 3) và xử lý tiếp từ bước 4.
5. Nếu không chấp nhận, bấm `Từ chối đề nghị`, nhập `Lý do`, bấm `Xác nhận`. Hồ sơ giữ nguyên trạng thái; người dân thấy lý do khi tra cứu.

Khi không có đề nghị của người dân, trưởng phòng hoặc lãnh đạo vẫn mở lại được hồ sơ: bấm `Mở lại` với hồ sơ đã có kết quả hoặc đã đóng, hoặc bấm `Khôi phục hồ sơ` với hồ sơ `Không tiếp nhận`, rồi nhập `Lý do`.

> **Thời hạn tự động.** `Hạn phản hồi`: mặc định 2 ngày kể từ khi người dân gửi; quản trị viên chỉnh tại Cấu hình (HT-04), mục `Hạn phản hồi đầu tiên`. `Hạn xử lý`: mặc định 10 ngày với mức `Bình thường`, mức khác tính theo bảng ở bước 2; quản trị viên chỉnh tại Cấu hình, mục `Hạn xử lý`. `Hạn bổ sung`: mặc định 7 ngày kể từ khi yêu cầu bổ sung; quản trị viên chỉnh tại Cấu hình, mục `Hạn người dân bổ sung`. Số ngày tính liên tục theo lịch, kể cả ngày nghỉ. Thay đổi cấu hình chỉ áp dụng cho các hạn tính sau thời điểm thay đổi.

> **Khi quá hạn.** Hệ thống không tự đóng hay tự chuyển hồ sơ quá hạn. Hồ sơ quá hạn có chữ đỏ ở cột `Hạn`, có nhãn `Quá hạn xử lý` hoặc `Quá hạn bổ sung`, và được đếm vào ô `Quá hạn` trên ND-01 cùng ô `Phản ánh quá hạn` trên Trung tâm điều hành (DH-01). Thời gian chờ người dân bổ sung không bị tính là quá hạn xử lý. Hồ sơ quá `Hạn bổ sung` chỉ kết thúc khi trưởng phòng hoặc lãnh đạo bấm `Kết thúc do quá hạn bổ sung`.

> **Thông báo.** Người dân chọn nhận thông báo qua `Email` sẽ được hệ thống tự gửi thư báo tiến độ ở các mốc: tiếp nhận, phân công, bắt đầu xử lý, yêu cầu bổ sung, có trao đổi gửi người dân, trình duyệt, kết quả được duyệt hoặc trả lại, đóng hồ sơ, không tiếp nhận, mở lại, và khi đề nghị xem xét lại được trả lời. Thư chỉ được gửi khi máy chủ đã cấu hình gửi thư, và thư không kèm mã bảo mật. Người dân chọn `Điện thoại` không nhận thư; cán bộ liên hệ trực tiếp và ghi nhận bằng `Ghi nhận liên hệ`. Các thao tác với phản ánh không tạo thông báo ở biểu tượng chuông của cán bộ. Cán bộ theo dõi việc của mình tại ND-01.

> **Giới hạn quyền.** Văn thư chỉ `Phân loại` và `Phân công`; văn thư không xử lý và không duyệt kết quả. Chỉ lãnh đạo và quản trị có các nút `Không tiếp nhận`, `Công khai`, `Gỡ công khai`. Trưởng phòng chỉ thấy và thao tác hồ sơ của phòng mình; chuyên viên chỉ thấy hồ sơ được giao đích danh. Người đã trình kết quả không tự duyệt được. Người xem chỉ xem được danh sách; nội dung phản ánh và thông tin người gửi bị ẩn.

## 3.8 Biên tập và công bố trang thông tin công khai

Quy trình này dùng khi đơn vị đưa kết quả thực hiện chỉ tiêu và văn bản lên cổng thông tin công khai, hoặc khi cần đổi nội dung, bố cục của trang người dân đang xem. Kết quả cuối cùng là một lần công bố mới của trang công khai. Mỗi lần công bố đều được lưu lại để đối chiếu và khôi phục khi cần.

| Bước | Người thực hiện | Màn hình | Việc làm | Kết quả, trạng thái |
|---|---|---|---|---|
| 1 | Lãnh đạo UBND hoặc Quản trị hệ thống | Danh mục chỉ tiêu (CT-02) | Bật hiển thị các chỉ tiêu đã có số liệu chính thức | Mục `Trang công khai` của chỉ tiêu: `Đang hiển thị` |
| 2 | Quản trị hệ thống | Trang công khai (ND-02), nút `Văn bản` | Công khai các văn bản cần đăng | Văn bản: `Đang công khai · lần 1` |
| 3 | Quản trị hệ thống | ND-02 | Chọn mẫu, thêm và sắp xếp khối, chọn chỉ tiêu, văn bản cho từng khối | Bản nháp: `Chưa lưu` |
| 4 | Quản trị hệ thống | ND-02 | Xem trước, lưu nháp | `Bản nháp đã lưu`; người dân chưa thấy thay đổi |
| 5 | Quản trị hệ thống | ND-02 | Công bố, ghi nội dung thay đổi | `Đã công bố lần N`; cổng thông tin hiển thị bản mới |
| 6 | Lãnh đạo UBND, Quản trị hệ thống | CT-02, ND-02 | Cập nhật số liệu công khai, thu hồi văn bản, khôi phục lần công bố trước khi cần | Theo từng thao tác (xem dưới) |

#### Bước 1. Đưa chỉ tiêu lên trang công khai
1. Mở **Danh mục chỉ tiêu** (CT-02), tìm chỉ tiêu cần công khai.
2. Nếu muốn ưu tiên chỉ tiêu này trên trang, bấm nút ba chấm `Thao tác` ở cuối dòng › `Sửa`, mở nhóm `Mã, nhóm và hiển thị công khai`, đánh dấu `Nổi bật trên trang công khai`, nhập `Thứ tự trên trang công khai`, rồi bấm `Lưu`.
   Chỉ tiêu nổi bật là nguồn của khối `Danh sách chỉ tiêu` khi khối này để chế độ `Nổi bật`.
3. Bấm `Thao tác` › `Hiển thị trên trang công khai`. Hệ thống báo `Đã cập nhật trang công khai`.
   Với chỉ tiêu chưa có số liệu chính thức, mục này hiện `Chưa có số liệu chính thức` và không bấm được.
4. Bấm dấu `+` đầu dòng để kiểm tra: mục `Trang công khai` hiện `Đang hiển thị`.

Cổng thông tin hiển thị bản chụp số liệu và thông tin của chỉ tiêu tại thời điểm bấm. Báo cáo được duyệt sau đó không tự cập nhật lên cổng (xem bước 6).

#### Bước 2. Công khai văn bản
Danh sách chỉ gồm các văn bản ở trạng thái `Đã xử lý` trong **Kho văn bản** (DL-02). Tệp phải ở dạng PDF, Word (.docx), Excel (.xlsx) hoặc ảnh JPG, PNG, WEBP.

1. Mở **Trang công khai** (ND-02), bấm `Văn bản`. Ngăn `Văn bản công khai` hiện tình trạng của từng văn bản: `Chưa công khai` hoặc `Đang công khai · lần N`.
2. Bấm `Công khai` ở dòng văn bản cần đăng.
3. Trong hộp `Công khai văn bản`, kiểm tra `Tiêu đề công khai` (mặc định lấy tên văn bản). Nhập `Trích yếu` nếu cần.
4. Đọc lại tệp, đánh dấu `Đã kiểm tra văn bản không chứa thông tin cá nhân, bí mật nhà nước`, rồi bấm `Công khai`.

Văn bản vừa công khai chưa tự hiện trên cổng thông tin. Phải chọn văn bản đó trong một khối `Văn bản công khai` (bước 3) rồi công bố trang (bước 5).

#### Bước 3. Soạn bản nháp trang
1. Tại ND-02, nếu cần làm lại từ đầu, bấm `Mẫu trang`, chọn `Minh bạch điều hành`, `Chỉ tiêu trọng tâm` hoặc `Thông tin và văn bản`, rồi bấm `Dùng mẫu`. Mẫu thay toàn bộ khối đang có trong bản nháp. Nếu chỉ sửa một phần, bỏ qua bước này và sửa trên bản nháp hiện có.
2. Bấm `Thêm khối`, chọn loại khối. Khối mới được đặt ở cuối trang. Mỗi trang có tối đa 40 khối.
3. Bấm vào một khối để chỉnh trong khung bên phải. Khối `Danh sách chỉ tiêu` cần chọn `Nguồn chỉ tiêu`: `Nổi bật`, `Tất cả` hoặc `Chọn lọc` (với `Chọn lọc`, tự chọn chỉ tiêu trong ô `Chỉ tiêu`).
4. Khối `Văn bản công khai` cần chọn văn bản trong ô `Văn bản`. Bấm `Quản lý văn bản công khai` nếu cần công khai thêm văn bản.
5. Để sắp xếp, kéo tên loại khối ở đầu khối để di chuyển. Kéo cạnh phải, cạnh dưới hoặc góc phải dưới để đổi kích thước. Mỗi cỡ màn hình có bố cục riêng: chọn lần lượt `Máy tính`, `Máy tính bảng`, `Điện thoại` để sắp xếp cho từng cỡ.
6. Bấm vào vùng trống ngoài các khối để mở `Thiết lập trang`. Tại đây đặt `Tên bản nháp`, màu sắc, và bật hoặc tắt `Dải tiêu đề đầu trang`, `Chân trang`.

#### Bước 4. Xem trước và lưu nháp
1. Bấm `Xem trước` để xem trang như người dân sẽ thấy, dùng số liệu đang công khai. Đổi giữa `Máy tính`, `Máy tính bảng`, `Điện thoại` để xem từng cỡ màn hình. Bấm `Bố cục` để quay lại chỉnh sửa.
2. Bấm `Lưu nháp` (hoặc nhấn `Ctrl S`). Nhãn cạnh tiêu đề đổi từ `Chưa lưu` sang `Bản nháp đã lưu`.

Chỉ quản trị viên thấy bản nháp; cổng thông tin vẫn hiển thị lần công bố gần nhất. Nếu rời màn hình khi còn thay đổi chưa lưu, hệ thống hỏi `Rời trang khi chưa lưu bản nháp?`.

#### Bước 5. Công bố
1. Bấm `Công bố`. Nút chỉ bấm được khi bản nháp hợp lệ. Nếu nút bị mờ, mở `Thiết lập trang` để xem cần sửa gì: khung `Cần hoàn thiện trước khi công bố`, hoặc cảnh báo màu chữ, màu nhấn chưa đủ tương phản.
2. Trong hộp `Công bố trang công khai`, nhập `Nội dung thay đổi` (ít nhất 3 ký tự), ví dụ "Bổ sung văn bản kế hoạch năm 2026". Nếu còn thay đổi chưa lưu, hệ thống tự lưu nháp trước khi công bố.
3. Bấm `Công bố`. Hệ thống báo `Đã công bố trang công khai`, và dòng trạng thái dưới tiêu đề đổi thành `Đã công bố lần N`.
4. Bấm `Mở trang` để mở cổng thông tin trong thẻ mới và kiểm tra lại.

#### Bước 6. Cập nhật hoặc thu hồi nội dung đã công khai
- Số liệu chỉ tiêu đã đổi (ví dụ có báo cáo mới được duyệt): mục `Trang công khai` của chỉ tiêu chuyển sang `Có thay đổi chưa công bố`. Lãnh đạo UBND hoặc quản trị viên vào CT-02, bấm `Thao tác` › `Cập nhật bản công khai`.
- Thôi hiển thị chỉ tiêu: tại CT-02, bấm `Thao tác` › `Ẩn khỏi trang công khai`. Chỉ tiêu bị lưu trữ cũng tự ẩn khỏi cổng. Khi được khôi phục, chỉ tiêu vẫn ẩn cho tới khi bật hiển thị lại.
- Sửa tiêu đề, trích yếu của văn bản đã công khai: tại ngăn `Văn bản` (ND-02), bấm `Cập nhật`, sửa nội dung, rồi bấm `Công khai`. Số lần công khai tăng thêm 1.
- Thu hồi văn bản: tại ngăn `Văn bản`, bấm `Thu hồi` rồi xác nhận `Thu hồi`. Văn bản biến mất khỏi cổng thông tin và không còn tải về được. Nếu văn bản đang được chọn trong một khối, hệ thống tự bỏ văn bản đó khỏi bản nháp và bản nháp chuyển sang `Chưa lưu`; bấm `Lưu nháp`.

#### Khôi phục một lần công bố trước
1. Tại ND-02, bấm `Lịch sử`. Ngăn `Lịch sử công bố` liệt kê 30 lần công bố gần nhất (`Lần N`), mỗi lần kèm nội dung thay đổi, người công bố và thời điểm. Lần đang hiển thị trên cổng có nhãn `Đang hiển thị`.
2. Bấm `Khôi phục` ở lần cần lấy lại, rồi xác nhận `Khôi phục`. Nội dung của lần đó thay toàn bộ bản nháp hiện tại, kể cả thay đổi chưa lưu. Cổng thông tin chưa thay đổi.
3. Kiểm tra bản nháp, rồi công bố như bước 5. Hệ thống tạo một lần công bố mới, không ghi đè các lần cũ.

> Quy trình này không có thời hạn tự động và không gửi thông báo cho người dùng khác. Các thao tác lưu nháp, công bố, khôi phục phiên bản, công khai, cập nhật, thu hồi văn bản, và hiển thị, ẩn chỉ tiêu đều được ghi vào **Nhật ký hệ thống** (HT-05).

> Về quyền: chỉ Quản trị hệ thống mở được **Trang công khai** (ND-02) và công khai, thu hồi văn bản; máy chủ từ chối mọi vai trò khác. Việc hiển thị, ẩn và cập nhật bản công khai của chỉ tiêu do Lãnh đạo UBND hoặc Quản trị hệ thống làm tại CT-02. Khối `Kết quả phản ánh` tự lấy các phản ánh đã được bấm `Công khai` tại **Phản ánh** (ND-01).

> Về thời điểm có hiệu lực: bố cục, khối và màu sắc chỉ đổi trên cổng thông tin sau khi bấm `Công bố`. Riêng các việc hiển thị, ẩn, cập nhật bản công khai của chỉ tiêu, thu hồi văn bản và gỡ công khai phản ánh có hiệu lực ngay, không cần công bố lại trang. Khối `Danh sách chỉ tiêu` để chế độ `Chọn lọc` chỉ hiện chỉ tiêu mới khi chọn thêm chỉ tiêu đó và công bố lại trang. Cổng thông tin hiển thị chỉ tiêu của năm đặt tại `Năm kế hoạch mặc định` trong **Cấu hình** (HT-04). Khi trang chưa công bố lần nào, cổng thông tin dùng bố cục mặc định của hệ thống.

> Tất cả quản trị viên dùng chung một bản nháp. Nếu người khác vừa lưu, hệ thống báo `Bản nháp đã thay đổi ở nơi khác`; bấm `Tải bản mới` để nạp bản mới nhất, khi đó thay đổi chưa lưu của mình bị bỏ. Hệ thống không cho lưu, công bố bản nháp và không cho khôi phục lần công bố cũ nếu trong đó có khối dẫn tới chỉ tiêu đã ẩn hoặc văn bản đã thu hồi.

> [!CANH-BAO] Người dân tải được nguyên tệp của văn bản đã công khai. Chỉ đánh dấu `Đã kiểm tra văn bản không chứa thông tin cá nhân, bí mật nhà nước` sau khi đã đọc lại toàn bộ tệp.


## 3.9 Dùng trình chiếu trong họp giao ban

Quy trình này dùng cho các buổi họp giao ban của UBND. Tình hình thực hiện chỉ tiêu được chiếu lên màn hình lớn và rà soát lần lượt theo bộ chỉ tiêu, theo phòng, sau đó đến các việc bị treo. Kết quả cuối cùng là kết luận của chủ trì được ghi vào hồ sơ từng chỉ tiêu (CT-06) dưới dạng văn bản chỉ đạo, yêu cầu giải trình, đánh giá hoặc nhắc việc.

| Bước | Người thực hiện | Màn hình | Việc làm | Kết quả, trạng thái |
|---|---|---|---|---|
| 1 | Văn thư, Lãnh đạo UBND | CT-01 | Chọn bộ chỉ tiêu được trình chiếu, sắp thứ tự trang | Bộ không chọn mang nhãn `Không trình chiếu` |
| 2 | Quản trị hệ thống | HT-04, HT-02 | Đặt thời gian tự chuyển trang, thứ tự trang các phòng | Trình chiếu đổi trang theo số giây đã đặt |
| 3 | Chuyên viên, Trưởng phòng | CT-06, CT-04 | Báo cáo số liệu, duyệt báo cáo đang chờ trước giờ họp | Kết quả và tình trạng chỉ tiêu được cập nhật |
| 4 | Người điều khiển trình chiếu (tài khoản Lãnh đạo UBND, Văn thư hoặc Quản trị hệ thống) | DH-03 | Mở trình chiếu, bật toàn màn hình | Trình chiếu tự chuyển trang |
| 5 | Chủ trì, người điều khiển | DH-03 | Rà soát theo trình tự trang, tạm dừng khi thảo luận | Xác định chỉ tiêu chậm, phòng chậm, việc bị treo |
| 6 | Người điều khiển | Jarvis, CT-06 | Hỏi nhanh số liệu, mở hồ sơ chỉ tiêu cần xem kỹ | Câu trả lời kèm danh sách chỉ tiêu |
| 7 | Lãnh đạo UBND, Văn thư, Trưởng phòng | CT-06 | Ghi kết luận vào hồ sơ chỉ tiêu | Người liên quan nhận thông báo về yêu cầu giải trình, đánh giá, nhắc việc |

#### Chuẩn bị trước buổi họp
1. Văn thư hoặc Lãnh đạo UBND mở `Bộ chỉ tiêu` (CT-01). Bấm nút ba chấm ở góc thẻ bộ chỉ tiêu, chọn `Hiện trên trình chiếu` hoặc `Ẩn khỏi trình chiếu`.
   Bộ đang ẩn mang nhãn `Không trình chiếu`. Bộ mới tạo mặc định được trình chiếu. Bộ đã `Ngừng sử dụng` không được trình chiếu.
2. Để đổi thứ tự trang của các bộ, chọn `Sửa` trong cùng menu, nhập `Thứ tự hiển thị` rồi bấm `Lưu`. Bộ có số nhỏ hơn được chiếu trước.
3. Quản trị hệ thống mở `Cấu hình` (HT-04), nhóm `Trình chiếu và Jarvis`, đặt `Chuyển trang sau` (mặc định 20 giây). Nếu không muốn hình ảnh toàn màn hình xuất hiện khi gọi Jarvis trong cuộc họp, tắt `Hiệu ứng khi gọi Jarvis`. Bấm `Lưu cấu hình`.
4. Trang các phòng được chiếu theo trường `Thứ tự` của từng phòng tại `Phòng ban` (HT-02). Chỉ Quản trị hệ thống sửa được trường này.
5. Trước giờ họp, chuyên viên báo cáo số liệu các kỳ đến hạn (CT-06). Trưởng phòng duyệt các báo cáo đang chờ (CT-04) để kết quả mới được tính vào trình chiếu.

Một bộ chỉ tiêu chỉ có trang trên trình chiếu khi có chỉ tiêu của năm hiện hành.

#### Mở trình chiếu trên màn hình phòng họp
1. Trên máy tính nối với màn hình hoặc máy chiếu, đăng nhập khu vực quản trị bằng tài khoản Lãnh đạo UBND, Văn thư hoặc Quản trị hệ thống.
2. Bấm `Trình chiếu` trên menu (nhóm Điều hành), hoặc bấm nút `Trình chiếu` trên `Trung tâm điều hành` (DH-01). Trình chiếu mở trong một thẻ trình duyệt mới; thẻ khu vực quản trị vẫn giữ nguyên.
3. Nhấn phím `F` để chiếu toàn màn hình. Nội dung tự co giãn vừa màn hình, không cần chỉnh cỡ chữ.
4. Xem dòng `Số liệu lúc` ở góc trái dưới để biết thời điểm lấy số liệu. Trình chiếu tự tải lại số liệu khoảng 2 phút một lần.

Trình chiếu luôn hiển thị năm hiện hành, ghi cạnh tên cơ quan ở góc trái trên. Năm chọn trên Trung tâm điều hành không áp dụng cho trình chiếu. Nếu màn hình báo `Chưa có bộ chỉ tiêu nào bật trình chiếu`, Lãnh đạo UBND, Văn thư hoặc Quản trị hệ thống bấm `Mở Bộ chỉ tiêu` để bật trình chiếu cho bộ cần chiếu. Nếu không tải được số liệu, bấm `Thử lại`.

> [!CANH-BAO] Trình chiếu hiển thị theo phạm vi của tài khoản đang đăng nhập. Nếu mở bằng tài khoản Trưởng phòng, Chuyên viên hoặc Người xem, trình chiếu chỉ có chỉ tiêu của phòng đó. Họp giao ban toàn đơn vị phải dùng tài khoản Lãnh đạo UBND, Văn thư hoặc Quản trị hệ thống.

#### Điều khiển trình chiếu
Trình chiếu tự chuyển trang sau số giây đặt tại `Chuyển trang sau`. Khi một phần dài nhiều trang (ghi `Trang 1/3`, `Trang 2/3`…), các trang con chuyển nhanh hơn: sau 60% thời gian đó, nhưng không dưới 8 giây (mặc định là 12 giây).

| Phím | Tác dụng |
|---|---|
| `→` hoặc `PageDown` | Sang trang sau |
| `←` hoặc `PageUp` | Về trang trước |
| `Space` (phím cách) | Tạm dừng tự chuyển trang; nhấn lần nữa để chạy tiếp |
| `F` | Bật hoặc tắt toàn màn hình |
| `Esc` | Khi đang toàn màn hình: thoát toàn màn hình. Khi không toàn màn hình: thoát trình chiếu, về Trung tâm điều hành |

Bút trình chiếu loại phát phím `PageUp`, `PageDown` cũng dùng được để chuyển trang.

Thao tác bằng chuột:
- Giữa thanh trên cùng có một dải chấm. Mỗi chấm là một phần: tổng quan, từng bộ chỉ tiêu, từng phòng, việc bị treo. Phần đang chiếu giãn thành thanh nhiều đoạn, mỗi đoạn ứng với một trang; đoạn đang chạy đầy dần cho tới lúc chuyển trang. Bấm vào một chấm để chuyển ngay tới trang đầu của phần đó, ví dụ khi đến lượt một phòng báo cáo.
- Góc phải dưới có năm nút biểu tượng: trang trước, tạm dừng hoặc chạy tiếp, trang sau, toàn màn hình, thoát. Các nút hiện mờ và rõ lại khi di chuột vào màn hình.
- Vạch mảnh sát mép dưới màn hình chạy hết thì trình chiếu chuyển trang. Vạch này ẩn đi khi đang tạm dừng.

Trình chiếu chỉ dùng để xem. Không bấm vào dòng chỉ tiêu để mở hồ sơ được, và trình chiếu không có thao tác thay đổi dữ liệu.

#### Trình tự trang và gợi ý điều hành cuộc họp
Trình chiếu chạy theo thứ tự cố định dưới đây. Có thể dùng thứ tự này làm trình tự nội dung cuộc họp.

| Thứ tự | Trang | Nội dung trên màn hình | Gợi ý điều hành |
|---|---|---|---|
| 1 | Tổng quan | `Bộ chỉ tiêu năm …`: tối đa 4 bộ đầu tiên; mỗi bộ có kết quả chung, số chỉ tiêu hoàn thành và số chỉ tiêu cần chú ý (`Có nguy cơ` và `Quá hạn`). `Tiến độ theo phòng`: tối đa 8 phòng, xếp theo tiến độ bình quân từ cao xuống thấp | Chủ trì nêu tình hình chung, các phòng dẫn đầu và các phòng chậm |
| 2 | Từng bộ chỉ tiêu | Kết quả chung: tiến độ % (bộ chấm điểm hiện số điểm, bộ thống kê hiện số chỉ tiêu có số liệu); số chỉ tiêu theo năm tình trạng; `Có chỉ đạo`, `Đã đánh giá`. Bảng chỉ tiêu xếp `Quá hạn`, `Có nguy cơ` lên đầu; mỗi dòng ghi phòng chủ trì | Tập trung vào các dòng đỏ, cam ở đầu bảng; phòng chủ trì nêu nguyên nhân và giải pháp |
| 3 | Từng phòng | Tiến độ bình quân của phòng; `Thiếu báo cáo`, `Đang giải trình`. Mỗi dòng ghi người phụ trách, hoặc `Chưa giao người`, hoặc `Tự tính` | Trưởng phòng báo cáo; nhấn `Space` để tạm dừng trong lúc trao đổi |
| 4 | `Việc bị treo` | Danh sách chỉ tiêu kèm cột `Lý do`, ví dụ "Bị chuyển, trả qua lại 3 lần", "Chưa giao người phụ trách sau 7 ngày", `Quá hạn trả lời giải trình` | Chủ trì kết luận người chịu trách nhiệm và thời hạn xử lý |

Dòng chỉ tiêu có kỳ báo cáo đã quá hạn mà chưa báo cáo sẽ ghi thêm chữ "thiếu" kèm tên kỳ (ví dụ "thiếu Quý III/2026"). Dòng chỉ tiêu có yêu cầu giải trình chưa trả lời ghi thêm "đang giải trình". Trang tổng quan chỉ xuất hiện khi có ít nhất một bộ chỉ tiêu được trình chiếu. Trang `Việc bị treo` chỉ xuất hiện khi có việc bị treo. Trang phòng không gồm chỉ tiêu loại thống kê.

#### Hỏi Jarvis trong lúc họp
Trang trình chiếu không có Jarvis. Khi cần số liệu ngoài nội dung đang chiếu, hoặc cần xem kỹ một chỉ tiêu:
1. Chuyển sang thẻ trình duyệt của khu vực quản trị.
2. Mở Jarvis bằng một trong các cách: bấm biểu tượng Jarvis trên thanh đầu trang; nhấn `Ctrl J`; hoặc nói "Jarvis" rồi nói câu hỏi (mục 1.6).
3. Đặt câu hỏi. Khi khung Jarvis chưa có hội thoại, có thể bấm một câu gợi ý như `Chỉ tiêu nào sắp trễ hạn?` hoặc `Chỉ tiêu nào chưa có số liệu?`.
4. Để xem số liệu từng kỳ, minh chứng và dòng thời gian, bấm tên chỉ tiêu trong câu trả lời để mở hồ sơ (CT-06).
5. Quay lại thẻ trình chiếu. Nhấn `F` nếu cần chiếu toàn màn hình trở lại.

Jarvis mặc định đọc to câu trả lời. Nếu không muốn phát tiếng trong phòng họp, bấm biểu tượng bánh răng của khung Jarvis và tắt `Đọc câu trả lời`. Jarvis trả lời trong phạm vi quyền của tài khoản đang đăng nhập.

#### Ghi kết luận sau họp
Kết luận của chủ trì được ghi vào hồ sơ từng chỉ tiêu liên quan (CT-06):
1. Văn thư mở thẻ `Chỉ đạo điều hành`, bấm `Thêm văn bản`, chọn `Loại văn bản` (ví dụ `Thông báo kết luận`) và ghi nội dung chỉ đạo.
2. Với chỉ tiêu cần giải trình, Lãnh đạo UBND bấm `Thao tác` › `Yêu cầu giải trình`. Trưởng phòng chủ trì và chuyên viên phụ trách nhận được thông báo.
3. Lãnh đạo UBND hoặc trưởng phòng chủ trì bấm `Đánh giá` để đánh giá kỳ. Để nhắc báo cáo, bấm `Thao tác` › `Nhắc việc`: thông báo gửi tới chuyên viên phụ trách, hoặc tới trưởng phòng chủ trì nếu chỉ tiêu chưa giao người.

Ở buổi họp sau, chỉ tiêu có yêu cầu giải trình chưa trả lời hiện "đang giải trình" trên trang phòng. Nếu quá hạn mà vẫn chưa trả lời, chỉ tiêu xuất hiện thêm ở trang `Việc bị treo`.

> **Thời hạn tự động.** Thời gian tự chuyển trang mặc định là 20 giây; quản trị viên chỉnh tại Cấu hình (`Chuyển trang sau`, từ 5 đến 300 giây). Số liệu trên trình chiếu tự tải lại khoảng 2 phút một lần, nên báo cáo được duyệt trong lúc họp sẽ hiện ở lần tải kế tiếp.

> **Khi nào chỉ tiêu vào trang Việc bị treo.** Có ba trường hợp. Thứ nhất, chỉ tiêu bị chuyển, trả qua lại từ 3 lần; khi đó hệ thống đồng thời gửi thông báo cho lãnh đạo UBND. Thứ hai, chỉ tiêu do cán bộ báo cáo (không tự tính, không phải loại thống kê) chưa được giao người phụ trách quá hai lần số ngày `Nhắc chưa giao người sau`, tính từ khi tạo chỉ tiêu. Số ngày này mặc định 3 ngày (tức quá 6 ngày); quản trị viên chỉnh tại Cấu hình, đặt 0 để tắt. Thứ ba, yêu cầu giải trình đã quá hạn mà chưa được trả lời. Hạn giải trình mặc định 3 ngày; quản trị viên chỉnh tại Cấu hình (`Hạn trả lời giải trình`), lãnh đạo cũng có thể nhập số ngày khác khi gửi yêu cầu.

> **Giới hạn quyền.** Mọi vai trò đều mở được trình chiếu, nhưng Trưởng phòng, Chuyên viên và Người xem chỉ thấy số liệu của phòng mình. Chỉ Lãnh đạo UBND, Văn thư và Quản trị hệ thống được bật, tắt trình chiếu của bộ chỉ tiêu. Chỉ Quản trị hệ thống sửa Cấu hình và thứ tự phòng. Chỉ Lãnh đạo UBND và Quản trị hệ thống gửi được `Yêu cầu giải trình`. `Đánh giá` và `Nhắc việc` dành cho Lãnh đạo UBND, Quản trị hệ thống và trưởng phòng chủ trì.

