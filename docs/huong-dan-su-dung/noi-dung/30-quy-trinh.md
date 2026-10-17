# Phần 3. Quy trình nghiệp vụ

Mỗi quy trình dưới đây đi qua nhiều màn hình và nhiều người. Đầu mỗi mục có bảng tóm tắt các bước (ai làm, ở màn hình nào, kết quả); các tiểu mục sau đó hướng dẫn từng bước. Mã màn hình (DH-, CT-, DL-, ND-, HT-) dẫn tới hướng dẫn chi tiết ở Phần 2.

## 3.1 Khởi tạo hệ thống cho một địa phương mới

Quy trình áp dụng khi đưa hệ thống vào sử dụng lần đầu tại một xã, phường, đặc khu (hoặc trường học, cơ quan khác), trên máy chủ mới cài đặt và chưa có dữ liệu. Khi hoàn tất, hệ thống mang tên đơn vị; đã có cơ cấu phòng ban, bộ chỉ tiêu của năm kế hoạch được gán phòng chủ trì và các thời hạn trách nhiệm; mỗi cán bộ có tài khoản đúng vai trò.

| Bước | Người thực hiện | Màn hình | Việc làm | Kết quả, trạng thái |
|---|---|---|---|---|
| 1 | Đơn vị cài đặt, Quản trị hệ thống | DH-01, HT-01 | Bàn giao tài khoản quản trị đầu tiên; đăng nhập, mở trình thiết lập | DH-01 hiện cảnh báo `Chưa thiết lập thông tin địa phương` |
| 2 | Quản trị hệ thống | HT-01, bước `Địa phương` | Khai loại đơn vị, tên đơn vị, tên cơ quan, tên ngắn | Xác định tên ứng dụng, ví dụ "IOC Lái Thiêu" |
| 3 | Quản trị hệ thống | HT-01, bước `Cơ cấu tổ chức` | Chọn phòng ban theo mẫu, sửa tên phòng | Danh sách phòng ban sẽ tạo |
| 4 | Quản trị hệ thống | HT-01, bước `Bộ chỉ tiêu` | Chọn năm và bộ chỉ tiêu mẫu | Danh sách bộ sẽ nạp, hoặc `Không nạp` |
| 5 | Quản trị hệ thống | HT-01, bước `Thời hạn` | Đặt thời hạn trách nhiệm | Giá trị chờ áp dụng |
| 6 | Quản trị hệ thống | HT-01, bước `Áp dụng` | Kiểm tra tóm tắt, bấm `Áp dụng thiết lập` | `Đã thiết lập địa phương`; phòng ban và chỉ tiêu được tạo, chỉ tiêu chưa giao người |
| 7 | Quản trị hệ thống | HT-02 | Bổ sung, sửa phòng ban ngoài mẫu | Phòng ban ở trạng thái `Hoạt động` |
| 8 | Quản trị hệ thống | HT-03 | Tạo tài khoản theo vai trò | Tài khoản `Hoạt động`, `Chưa đăng nhập` |
| 9 | Quản trị hệ thống | HT-04 | Rà soát ngưỡng cảnh báo, hạn phản ánh | `Đã lưu cấu hình` |
| 10 | Mọi cán bộ | HT-07 | Đăng nhập lần đầu, đổi mật khẩu | Cột `Đăng nhập gần nhất` ở HT-03 có thời điểm |
| 11 | Lãnh đạo UBND hoặc Quản trị hệ thống | CT-01, CT-02 | Nhập mức giao cho chỉ tiêu mẫu chưa có số | Chỉ tiêu có `Giá trị kế hoạch` |

#### Bước 1. Mở trình thiết lập
1. Đơn vị cài đặt tạo tài khoản `Quản trị hệ thống` đầu tiên khi cài máy chủ và bàn giao tên đăng nhập, mật khẩu. Hệ thống mới cài chưa có phòng ban, chỉ tiêu và không có dữ liệu mẫu.
2. Đăng nhập khu vực quản trị (mục 1.3). Đổi ngay mật khẩu được bàn giao tại `Hồ sơ cá nhân` (HT-07).
3. Trên Trung tâm điều hành (DH-01), bấm `Thiết lập` trên cảnh báo `Chưa thiết lập thông tin địa phương`, hoặc chọn `Thiết lập địa phương` trong nhóm menu **Hệ thống** (HT-01).
4. Trình thiết lập gồm năm bước: `Địa phương`, `Cơ cấu tổ chức`, `Bộ chỉ tiêu`, `Thời hạn`, `Áp dụng`. Bấm `Tiếp tục` để sang bước sau; bấm `Quay lại` hoặc bấm tên một bước đã qua để sửa.

> Các lựa chọn trong trình thiết lập chỉ được ghi vào hệ thống khi bấm `Áp dụng thiết lập` ở bước cuối. Nếu rời trang giữa chừng thì phải chọn lại; riêng thông tin đơn vị có thể lưu trước bằng nút `Chỉ lưu thông tin địa phương`.

#### Bước 2. Khai thông tin đơn vị
1. Chọn `Loại đơn vị`: `Xã`, `Phường`, `Đặc khu`, `Trường học` hoặc `Cơ quan, đơn vị khác`. Loại đơn vị quyết định mẫu cơ cấu tổ chức ở bước 3; đổi loại đơn vị thì danh sách phòng ban được nạp lại theo mẫu mới.
2. Nhập các trường bắt buộc `Tên đơn vị`, `Tên cơ quan`, `Tên ngắn`. Dòng gợi ý dưới `Tên ngắn` cho biết tên ứng dụng sẽ hiển thị.
3. Nhập các trường không bắt buộc nếu có (`Tỉnh / Thành phố`, `Mã đơn vị hành chính`, địa chỉ, thông tin liên hệ, `Màu chủ đạo`…). Chi tiết từng trường xem Phần 2, màn hình HT-01.
4. Bấm `Tiếp tục`. Để lưu riêng phần này, bấm `Chỉ lưu thông tin địa phương`; hệ thống báo `Đã lưu thông tin địa phương`, nhưng cảnh báo ở DH-01 chỉ mất sau khi áp dụng thiết lập.

#### Bước 3. Chọn cơ cấu tổ chức
1. Bảng phòng ban hiện theo mẫu của loại đơn vị. Với xã, phường, đặc khu, các phòng thuộc bộ máy UBND được chọn sẵn: Văn phòng HĐND và UBND; Phòng Kinh tế (ở phường là Phòng Kinh tế, Hạ tầng và Đô thị); Phòng Văn hóa – Xã hội; Trung tâm Phục vụ hành chính công.
2. Các đơn vị phối hợp mang nhãn `Tuỳ chọn` và mặc định không được chọn: Công an, Ban Chỉ huy Quân sự, Ủy ban Mặt trận Tổ quốc Việt Nam, Bảo hiểm xã hội cơ sở, Thống kê cơ sở. Đánh dấu chọn những đơn vị có chỉ tiêu cần theo dõi trên hệ thống.
3. Sửa tên phòng trực tiếp trong cột `Tên phòng ban` cho đúng quyết định của địa phương (từ 2 đến 160 ký tự). Cột `Mã` giữ theo mẫu.
4. Bấm `Tiếp tục`. Phải chọn ít nhất một phòng ban.

Với trường học và cơ quan khác, mẫu gồm các bộ phận tương ứng (Ban Giám hiệu, Văn phòng, các tổ chuyên môn; hoặc Lãnh đạo đơn vị, Văn phòng, Phòng Nghiệp vụ). Phòng mang nhãn `Đã có` là phòng đã tạo từ lần thiết lập trước. Phòng không có trong mẫu được thêm ở bước 7.

> [!CANH-BAO] Khi nạp bộ chỉ tiêu, hệ thống tự gán phòng chủ trì cho từng chỉ tiêu theo lĩnh vực. Lĩnh vực không có phòng tương ứng được giao cho phòng thay thế, chủ yếu là Văn phòng HĐND và UBND (ví dụ không chọn Công an thì chỉ tiêu về ma túy được giao cho Văn phòng). Phòng chủ trì không đổi được sau khi đã tạo chỉ tiêu, vì mã chỉ tiêu chứa mã phòng (ví dụ CT-2026-VHXH-001). Cần chọn đủ đơn vị phối hợp trước khi áp dụng thiết lập có nạp bộ chỉ tiêu.

#### Bước 4. Chọn bộ chỉ tiêu từ thư viện
1. Chọn năm tại `Nạp cho năm` (mặc định là năm hiện tại). Năm này đồng thời được ghi thành `Năm kế hoạch mặc định` trong Cấu hình (HT-04).
2. Đánh dấu ô chọn ở bộ chỉ tiêu cần nạp. Mỗi bộ ghi căn cứ pháp lý, số chỉ tiêu và số chỉ tiêu tự tính. Nhãn `Không đúng loại đơn vị` cho biết bộ không dành cho loại đơn vị đã khai; nhãn `Đã nạp` kèm năm cho biết bộ đã có cho năm đó.
3. Bấm `Tiếp tục`. Có thể không chọn bộ nào (bước `Áp dụng` ghi `Không nạp`); khi đó bộ chỉ tiêu được nạp sau tại CT-01.

Thư viện hiện có:
- Chỉ tiêu thống kê cấp xã theo Thông tư 148/2026/TT-BTC: dùng cho xã, phường, đặc khu trên cả nước.
- Chỉ tiêu KT-XH Thành phố giao theo Quyết định 333/QĐ-UBND và chỉ số chuyển đổi số cấp xã theo Quyết định 3336/QĐ-UBND: chỉ dành cho xã, phường, đặc khu thuộc Thành phố Hồ Chí Minh. Trình thiết lập không kiểm tra tỉnh, thành phố; đơn vị ngoài Thành phố Hồ Chí Minh không chọn hai bộ này.

#### Bước 5. Đặt thời hạn trách nhiệm
Các ô đã điền sẵn giá trị đang dùng (lần đầu là giá trị mặc định). Ô nào cho phép giá trị 0 thì đặt 0 để tắt cơ chế tương ứng.

| Trường | Mặc định (khoảng cho phép) | Tác dụng |
|---|---|---|
| `Tự thông qua báo cáo sau` | 7 ngày (0–60) | Báo cáo số liệu chờ duyệt quá số ngày này được hệ thống tự thông qua và ghi trách nhiệm người duyệt; 0 là tắt |
| `Tự thông qua đề xuất sau` | 3 ngày (0–30) | Đề xuất chỉ tiêu đã trình mà không được duyệt hoặc từ chối trong số ngày này tự thành chỉ tiêu; 0 là tắt |
| `Hạn trả lời giải trình` | 3 ngày (1–30) | Hạn mặc định của yêu cầu giải trình do lãnh đạo gửi |
| `Nhắc chưa giao người sau` | 3 ngày (0–30) | Chỉ tiêu chưa giao chuyên viên quá số ngày này thì nhắc trưởng phòng; 0 là tắt |
| `Số lần chuyển việc tối đa` | 1 lần (0–5) | Số lần chuyên viên được chuyển chỉ tiêu cho đồng nghiệp; hết lượt thì chỉ được trả về trưởng phòng |
| `Trình chiếu chuyển trang sau` | 20 giây (5–300) | Thời gian hiển thị mỗi trang ở Trình chiếu (DH-03) |

Bấm `Tiếp tục`. Giá trị ngoài khoảng cho phép bị báo lỗi ngay dưới ô. Sau khởi tạo, quản trị viên chỉnh các giá trị này tại Cấu hình (HT-04), nhóm `Thời hạn trách nhiệm`; thời gian chuyển trang nằm ở nhóm `Trình chiếu và Jarvis`, trường `Chuyển trang sau`.

#### Bước 6. Áp dụng thiết lập
1. Kiểm tra bảng tóm tắt gồm `Đơn vị`, `Tên ứng dụng`, `Phòng ban`, `Bộ chỉ tiêu`, `Thời hạn`.
2. Bấm `Áp dụng thiết lập`. Hệ thống lưu thông tin đơn vị, tạo phòng ban mới và cập nhật phòng đã có cùng mã, lưu thời hạn, rồi nạp lần lượt từng bộ chỉ tiêu.
3. Màn hình `Đã thiết lập địa phương` cho biết số phòng ban tạo mới, cập nhật và kết quả từng bộ: "đã tạo … chỉ tiêu", "đã có sẵn, bỏ qua" (bộ đã nạp cho năm đó) hoặc dòng lỗi màu đỏ.
4. Bấm `Bộ chỉ tiêu` để xem các bộ vừa nạp (CT-01), hoặc bấm `Về trung tâm điều hành`.

Sau khi áp dụng:
- Tên đơn vị hiện trên khu vực quản trị, cổng thông tin công khai và bản in; cảnh báo ở DH-01 không còn.
- Mỗi chỉ tiêu mẫu có phòng chủ trì, phòng phối hợp (nếu có), kỳ báo cáo theo văn bản giao và hạn hoàn thành 31/12 của năm nạp; chưa có chuyên viên phụ trách. Chỉ tiêu nhập tay ở tình trạng `Chưa bắt đầu`.
- Bảng dữ liệu mà bộ mẫu cần nhưng chưa có được tạo trong Kho dữ liệu (DL-01); chỉ tiêu tự tính được tính ngay từ dữ liệu sẵn có.

> Trình thiết lập chạy lại được nhiều lần: bộ đã nạp cho năm đó được bỏ qua, phòng đã có được cập nhật, phòng không chọn giữ nguyên. Nếu một bộ báo lỗi, thông tin đơn vị, phòng ban và thời hạn vẫn đã được lưu; khắc phục nguyên nhân rồi chạy lại. Khi chạy lại, tên, lĩnh vực phụ trách, màu và thứ tự của phòng đã có bị ghi đè theo bảng ở bước `Cơ cấu tổ chức` (bảng luôn lấy tên theo mẫu); nếu đã sửa phòng ban tại HT-02, cần sửa lại tên trong bảng trước khi áp dụng.

#### Bước 7. Rà soát, bổ sung phòng ban
1. Mở `Phòng ban` (HT-02), kiểm tra danh sách và trạng thái `Hoạt động`.
2. Thêm phòng ngoài mẫu: bấm `Thêm phòng ban`, nhập `Mã`, `Tên đầy đủ`, chọn `Loại đơn vị`, nhập `Lĩnh vực phụ trách`, bấm `Lưu`.
3. Sửa phòng: bấm biểu tượng bút cuối dòng, sửa thông tin, bấm `Lưu`.

#### Bước 8. Tạo tài khoản theo vai trò
Nên tạo theo thứ tự: Lãnh đạo UBND, Văn thư, Trưởng phòng của từng phòng, sau đó Chuyên viên và Người xem. Thông báo nhắc việc và báo lãnh đạo được gửi tới trưởng phòng và lãnh đạo, nên các tài khoản này cần có trước khi chỉ tiêu phát sinh việc.

1. Mở `Tài khoản` (HT-03), bấm `Tạo tài khoản`.
2. Nhập `Tên đăng nhập` (3–50 ký tự gồm chữ, số, dấu chấm, gạch ngang, gạch dưới) và `Họ và tên`. Tên đăng nhập và email không được trùng với tài khoản khác.
3. Chọn `Vai trò` và `Phòng ban` theo quy tắc ở dưới.
4. Nhập `Chức vụ` và `Email công vụ`. Email công vụ cần có để cán bộ tự khôi phục mật khẩu (mục 1.3).
5. Nhập `Mật khẩu` ban đầu (tối thiểu 10 ký tự, có chữ hoa, chữ thường, chữ số và ký tự đặc biệt), bấm `Lưu`. Hệ thống báo `Đã tạo tài khoản`; tài khoản ở trạng thái `Hoạt động`, cột `Đăng nhập gần nhất` ghi `Chưa đăng nhập`.
6. Giao tên đăng nhập và mật khẩu ban đầu trực tiếp cho cán bộ; hệ thống không tự gửi thông tin tài khoản.

Quy tắc chọn `Phòng ban` theo `Vai trò`:
- `Trưởng phòng`, `Chuyên viên`, `Người xem`: bắt buộc chọn một phòng ban đang hoạt động; người dùng chỉ thấy số liệu của phòng đó.
- `Lãnh đạo UBND`, `Văn thư`: không bắt buộc; để trống thì danh sách tài khoản ghi `Toàn địa phương`.
- `Quản trị hệ thống`: không gắn phòng ban (ô bị khóa).

#### Bước 9. Rà soát cấu hình còn lại
1. Mở `Cấu hình` (HT-04).
2. Nhóm `Kế hoạch và cảnh báo`: kiểm tra `Năm kế hoạch mặc định`, `Cảnh báo trước hạn` (mặc định 14 ngày), `Ngưỡng có nguy cơ` (mặc định 70%).
3. Nhóm `Phản ánh người dân`: kiểm tra `Hạn phản hồi đầu tiên` (mặc định 2 ngày), `Hạn xử lý` (mặc định 10 ngày, không được nhỏ hơn hạn phản hồi đầu tiên), `Hạn người dân bổ sung` (mặc định 7 ngày).
4. Nhóm `Trình chiếu và Jarvis`: bật hoặc tắt `Hiệu ứng khi gọi Jarvis`.
5. Bấm `Lưu cấu hình`. Hệ thống báo `Đã lưu cấu hình`.

#### Bước 10. Cán bộ đăng nhập lần đầu
1. Cán bộ đăng nhập bằng tài khoản được cấp (mục 1.3).
2. Mở `Hồ sơ cá nhân` (HT-07), nhập `Mật khẩu hiện tại`, `Mật khẩu mới`, `Nhập lại mật khẩu mới`, bấm `Đổi mật khẩu`.
3. Quản trị viên theo dõi tại HT-03: tài khoản chưa sử dụng vẫn ghi `Chưa đăng nhập` ở cột `Đăng nhập gần nhất`.

#### Bước 11. Nhập mức giao cho chỉ tiêu mẫu
Một số chỉ tiêu mẫu không có mức giao chung cho mọi địa phương (ví dụ chỉ tiêu ghi "Theo mức giao cho đơn vị tại Phụ lục 2 Quyết định 333/QĐ-UBND"). Các chỉ tiêu này được tạo với `Giá trị kế hoạch` bằng 0.
1. Lãnh đạo UBND hoặc Quản trị hệ thống mở `Bộ chỉ tiêu` (CT-01), bấm tên bộ để mở danh sách chỉ tiêu của bộ (CT-02).
2. Trên dòng chỉ tiêu, bấm nút ba chấm cuối dòng, chọn `Sửa`.
3. Nhập `Giá trị kế hoạch` theo văn bản giao, bấm `Lưu`.

> **Thời hạn tự động sau khởi tạo.** Với chỉ tiêu nhập tay, không có chỉ tiêu con và chưa có chuyên viên phụ trách, thời hạn giao việc được tính từ lúc nạp bộ chỉ tiêu. Quá `Nhắc chưa giao người sau` (mặc định 3 ngày, quản trị viên chỉnh tại Cấu hình), hệ thống nhắc trưởng phòng chủ trì; quá gấp đôi số ngày đó (mặc định 6 ngày), hệ thống báo lãnh đạo là chỉ tiêu bị treo và ghi nhận trách nhiệm của trưởng phòng. Vì vậy cần tạo tài khoản Trưởng phòng ngay sau khi áp dụng thiết lập để trưởng phòng giao chuyên viên tại hồ sơ chỉ tiêu (CT-06).

> **Khi thiếu tài khoản.** Phòng chưa có tài khoản Trưởng phòng đang hoạt động thì nhắc việc của phòng đó không có người nhận. Đơn vị chưa có tài khoản Lãnh đạo UBND thì thông báo dành cho lãnh đạo được gửi cho Quản trị hệ thống.

> **Hiệu lực khi đổi thời hạn.** Thay đổi `Tự thông qua báo cáo sau` và `Nhắc chưa giao người sau` áp dụng ngay cho cả việc đang chờ. Thay đổi `Tự thông qua đề xuất sau` và `Hạn trả lời giải trình` chỉ áp dụng cho đề xuất được trình và yêu cầu giải trình tạo sau thời điểm lưu.

> **Giới hạn quyền.** HT-01, HT-03, HT-04 và việc thêm, sửa phòng ban tại HT-02 chỉ dành cho Quản trị hệ thống. Nạp thêm bộ mẫu sau khởi tạo (CT-01 › `Thư viện mẫu` › `Nạp`) và sửa `Giá trị kế hoạch` do Lãnh đạo UBND hoặc Quản trị hệ thống thực hiện. Tại HT-03, quản trị viên không tự khóa, tự đổi vai trò hay đặt lại mật khẩu của chính mình (đổi mật khẩu tại HT-07); hệ thống luôn phải còn ít nhất một quản trị viên đang hoạt động. Các thao tác được ghi vào Nhật ký hệ thống (HT-05) với tên `Thiết lập địa phương`, `Nạp bộ chỉ tiêu mẫu`, `Tạo tài khoản`, `Cập nhật cấu hình`.


## 3.2 Giao chỉ tiêu cho chuyên viên; chuyển và trả việc

Quy trình này dùng sau khi chỉ tiêu đã có trong danh mục, để mỗi chỉ tiêu do cán bộ báo cáo số liệu có một người chịu trách nhiệm cập nhật. Khi kết thúc, chỉ tiêu có người phụ trách là trưởng phòng hoặc chuyên viên của phòng chủ trì. Mọi lần giao, chuyển, trả đều được ghi vào `Dòng thời gian` của hồ sơ chỉ tiêu, kèm người thực hiện và lý do.

| Bước | Người thực hiện | Màn hình | Việc làm | Kết quả, trạng thái |
|---|---|---|---|---|
| 1 | Trưởng phòng chủ trì | DH-02, DH-01, CT-02 | Tìm chỉ tiêu chưa có người phụ trách | Danh sách chỉ tiêu `Chưa giao người` |
| 2 | Trưởng phòng chủ trì hoặc lãnh đạo UBND | CT-06 | Bấm `Giao chuyên viên`, chọn người | Chỉ tiêu có người phụ trách; người được giao nhận thông báo |
| 3 | Người được giao | DH-02, CT-06 | Nhận việc tại `Chỉ tiêu của tôi`, `Cần báo cáo` | Bắt đầu báo cáo số liệu theo kỳ |
| 4a | Người đang phụ trách | CT-06 | Bấm `Chuyển đồng nghiệp`, nêu lý do | Người nhận trở thành người phụ trách; dùng một lượt chuyển |
| 4b | Người đang phụ trách | CT-06 | Bấm `Trả về trưởng phòng`, nêu lý do | Chỉ tiêu trở về `Chưa giao người phụ trách`; trưởng phòng được báo |
| 5 | Trưởng phòng chủ trì | CT-06 | Bấm `Giao chuyên viên` hoặc `Giao lại` | Có người phụ trách mới; số lượt chuyển tính lại từ đầu |
| 6 | Lãnh đạo UBND, trưởng phòng | DH-01, DH-03, DH-04 | Theo dõi `Việc bị treo`, nhóm cột `Giao việc` | Chỉ đạo xử lý việc bị đẩy qua lại hoặc chưa giao |

#### Bước 1. Tìm chỉ tiêu chưa giao người
Trưởng phòng chọn một trong các cách sau:
- **Việc của tôi** (DH-02), thẻ `Chưa giao người`: liệt kê chỉ tiêu của phòng chưa có người phụ trách. Bấm `Giao việc` ở cuối dòng để mở hồ sơ chỉ tiêu. Lãnh đạo UBND thấy chỉ tiêu của mọi phòng, có thêm cột `Phòng`.
- **Trung tâm điều hành** (DH-01): bấm ô `Chưa giao người` trong khung `Việc cần xử lý`, hoặc bấm số ở cột `Chưa giao` của bảng `Theo phòng ban`.
- **Danh mục chỉ tiêu** (CT-02): tại bộ lọc `Người phụ trách`, chọn `Chưa giao người`.

Các danh sách này không gồm chỉ tiêu tự tính và chỉ tiêu tổng hợp từ chỉ tiêu con. Với chỉ tiêu có chỉ tiêu con, hãy giao người cho từng chỉ tiêu con. Bảng `Chỉ tiêu con` trong hồ sơ chỉ tiêu cha có cột `Phụ trách` để kiểm tra.

#### Bước 2. Giao chuyên viên phụ trách
1. Mở hồ sơ chỉ tiêu (CT-06). Khung `Trách nhiệm` ở bên phải ghi `Chưa giao người phụ trách`.
2. Bấm `Giao chuyên viên` trong khung `Trách nhiệm`, hoặc bấm `Thao tác` › `Giao chuyên viên` ở đầu trang.
3. Trong hộp `Giao chuyên viên phụ trách`, chọn `Người phụ trách`. Danh sách chỉ gồm trưởng phòng và chuyên viên đang hoạt động của phòng chủ trì.
4. Nhập `Lời nhắn` nếu cần (không bắt buộc), rồi bấm `Xác nhận`. Hệ thống báo `Đã giao việc`.

Kết quả: khung `Trách nhiệm` hiện tên người phụ trách và thời điểm giao. Người được giao nhận thông báo "Bạn được giao phụ trách chỉ tiêu <mã>". Lời nhắn được ghi vào `Dòng thời gian` của hồ sơ.

#### Bước 3. Nhận việc
1. Người được giao bấm thông báo trên chuông để mở hồ sơ chỉ tiêu, hoặc mở **Việc của tôi** (DH-02).
2. Thẻ `Chỉ tiêu của tôi` liệt kê các chỉ tiêu mình đang phụ trách.
3. Thẻ `Cần báo cáo` liệt kê các chỉ tiêu còn thiếu báo cáo kỳ hoặc chưa có số liệu. Bấm `Báo cáo` để báo cáo số liệu (xem quy trình báo cáo số liệu trong Phần 3).
4. Nếu chỉ tiêu không thuộc việc của mình, chuyển cho đồng nghiệp (bước 4a) hoặc trả về trưởng phòng (bước 4b).

#### Bước 4a. Chuyển cho đồng nghiệp
Dùng khi việc thuộc về người khác trong cùng phòng chủ trì.
1. Trong hồ sơ chỉ tiêu, bấm `Chuyển đồng nghiệp` (trong khung `Trách nhiệm` hoặc menu `Thao tác`).
2. Hộp `Chuyển cho đồng nghiệp` cho biết số lượt chuyển còn lại. Tại `Chuyển cho`, chọn trưởng phòng hoặc chuyên viên cùng phòng. Danh sách không có tên mình.
3. Nhập `Lý do` (ít nhất 5 ký tự), rồi bấm `Xác nhận`. Hệ thống báo `Đã chuyển việc`.

Kết quả: người nhận trở thành người phụ trách. Người nhận và trưởng phòng chủ trì nhận thông báo kèm lý do. Lần chuyển được cộng vào số lượt đã chuyển và số lần qua lại.

Nút `Chuyển đồng nghiệp` chỉ hiện với người đang phụ trách khi chỉ tiêu còn lượt chuyển. Ví dụ, với mức mặc định 1 lần: người được trưởng phòng giao chuyển được một lần. Người nhận không chuyển tiếp được nữa, chỉ có thể báo cáo hoặc trả về trưởng phòng.

#### Bước 4b. Trả về trưởng phòng
Dùng khi việc không thuộc trách nhiệm của mình và không có người phù hợp trong phòng để chuyển.
1. Trong hồ sơ chỉ tiêu, bấm `Trả về trưởng phòng` (trong khung `Trách nhiệm` hoặc menu `Thao tác`).
2. Nhập `Lý do` (ít nhất 5 ký tự), rồi bấm `Xác nhận`. Hệ thống báo `Đã trả về trưởng phòng`.

Kết quả: chỉ tiêu không còn người phụ trách. Khung `Trách nhiệm` ghi `Chưa giao người phụ trách`, và chỉ tiêu trở lại thẻ `Chưa giao người` của trưởng phòng. Trưởng phòng chủ trì nhận thông báo "… trả lại chỉ tiêu <mã> — cần phân công lại", kèm lý do.

#### Bước 5. Phân công lại
1. Trưởng phòng mở hồ sơ chỉ tiêu từ thông báo, hoặc từ thẻ `Chưa giao người` (DH-02).
2. Đọc lý do chuyển, trả tại thẻ `Dòng thời gian`.
3. Bấm `Giao chuyên viên` (chỉ tiêu đang không có người phụ trách) hoặc `Giao lại` (đổi người đang phụ trách), chọn người, rồi bấm `Xác nhận`.

Khi giao hoặc giao lại, số lượt chuyển được đặt lại về 0, nên người mới được dùng đủ số lượt chuyển. Số lần qua lại thì không đặt lại. Bản thân thao tác `Giao lại` không tính là một lần qua lại.

#### Bước 6. Theo dõi việc bị đẩy qua lại và việc chưa giao
- Mỗi lần chuyển hoặc trả được tính là một lần qua lại. Khung `Trách nhiệm` có dòng `Chuyển / trả` ghi số lượt đã chuyển trên số lượt tối đa và số lần qua lại. Từ 3 lần qua lại trở lên, dòng này có thêm nhãn `Bị treo`.
- Khi số lần qua lại đạt 3, hệ thống gửi thông báo cho lãnh đạo UBND và ghi việc báo lên lãnh đạo vào `Dòng thời gian`. Nếu địa phương chưa có tài khoản lãnh đạo, thông báo gửi cho quản trị hệ thống. Mỗi lần chuyển, trả tiếp theo đều được báo tiếp.
- Chỉ tiêu bị treo hiện ở thẻ `Việc bị treo` của Trung tâm điều hành (DH-01) và trên màn hình Trình chiếu (DH-03), với lý do "Bị chuyển, trả qua lại N lần".
- Màn hình Trách nhiệm (DH-04) có nhóm cột `Giao việc` (`Chưa giao`, `Chuyển, trả`, `Báo lãnh đạo`), cho biết số liệu từng phòng trong năm.
- Để nhắc người phụ trách cập nhật số liệu, trưởng phòng hoặc lãnh đạo bấm `Thao tác` › `Nhắc việc` trong hồ sơ chỉ tiêu. Nếu chỉ tiêu chưa có người phụ trách, lời nhắc gửi cho trưởng phòng chủ trì. Mỗi chỉ tiêu được nhắc tối đa một lần mỗi ngày.

> **Thời hạn tự động.** Chỉ tiêu do cán bộ báo cáo số liệu mà chưa có người phụ trách sẽ được nhắc sau thời hạn `Nhắc chưa giao người sau`, tính từ ngày tạo chỉ tiêu (mặc định 3 ngày, quản trị viên chỉnh tại Cấu hình). Khi quá hạn, hệ thống nhắc trưởng phòng chủ trì (mỗi chỉ tiêu tối đa một lần trong tháng), và Trung tâm điều hành hiện cảnh báo `Chưa giao` theo phòng. Khi quá gấp đôi thời hạn (mặc định 6 ngày), hệ thống báo lãnh đạo UBND một lần, ghi việc báo lên lãnh đạo vào `Dòng thời gian`, và đưa chỉ tiêu vào danh sách `Việc bị treo` với lý do "Chưa giao người phụ trách sau N ngày". Đặt 0 ngày để tắt việc nhắc này.

> [!CANH-BAO] Thời hạn nhắc chưa giao người luôn tính từ ngày tạo chỉ tiêu, không tính lại từ lúc chỉ tiêu bị trả về. Vì vậy, chỉ tiêu tạo đã lâu mà bị trả về sẽ sớm được nhắc và báo lãnh đạo, nếu chưa từng báo. Tương tự, số lần qua lại không được xoá khi giao lại: chỉ tiêu đã có nhãn `Bị treo` vẫn giữ nhãn này và vẫn được tính ở màn hình Trách nhiệm (DH-04).

> **Giới hạn quyền.** Các nút `Giao chuyên viên`, `Giao lại` và `Nhắc việc` dành cho trưởng phòng của phòng chủ trì, lãnh đạo UBND và quản trị hệ thống. Văn thư, người xem và trưởng phòng của phòng phối hợp không có các nút này. Chỉ người đang phụ trách chỉ tiêu mới thấy `Chuyển đồng nghiệp` và `Trả về trưởng phòng`. Chỉ giao hoặc chuyển được cho trưởng phòng, chuyên viên đang hoạt động của phòng chủ trì, không chuyển sang phòng khác. Chỉ tiêu đã lưu trữ không hiện các nút giao, chuyển, trả. `Số lần chuyển việc tối đa` mặc định là 1 lần, quản trị viên chỉnh tại Cấu hình (từ 0 đến 5 lần). Nếu đặt 0, không ai chuyển được, chỉ có thể trả về trưởng phòng.

> Khi quản trị viên khoá tài khoản, chuyển phòng, hoặc đổi vai trò của người đang phụ trách sang vai trò khác trưởng phòng, chuyên viên tại **Tài khoản** (HT-03), các chỉ tiêu người đó phụ trách tự trở về trạng thái chưa giao. `Dòng thời gian` ghi rõ lý do. Trưởng phòng cần giao lại theo bước 5.


## 3.3 Báo cáo số liệu một kỳ và duyệt báo cáo

Quy trình dùng khi đến kỳ báo cáo (tháng, quý, 6 tháng hoặc năm) của chỉ tiêu nhập số liệu tay. Kết thúc quy trình, báo cáo của kỳ được duyệt hoặc tự thông qua. Giá trị báo cáo khi đó trở thành số liệu chính thức của chỉ tiêu, tiến độ và tình trạng được tính lại.

| Bước | Người thực hiện | Màn hình | Việc làm | Kết quả, trạng thái |
|---|---|---|---|---|
| 1 | Hệ thống; trưởng phòng, lãnh đạo UBND | Thông báo, DH-02, CT-06 | Nhắc hạn báo cáo của kỳ | Chỉ tiêu hiện trong tab `Cần báo cáo` của chuyên viên phụ trách |
| 2 | Chuyên viên phụ trách hoặc cán bộ khác của phòng chủ trì | CT-06 | Lập báo cáo kỳ kèm minh chứng, bấm `Gửi báo cáo` | Báo cáo `Chờ duyệt`; kỳ được tính là đã báo cáo; trưởng phòng nhận thông báo |
| 3 | Trưởng phòng chủ trì, lãnh đạo UBND | CT-04 hoặc CT-06 | Kiểm tra số liệu, nguồn, minh chứng; bấm `Duyệt` hoặc `Trả lại` | `Đã duyệt`: số liệu chính thức được cập nhật. `Trả lại`: người gửi nhận lý do |
| 4 | Người gửi báo cáo | DH-02, CT-06 | Báo cáo lại theo lý do trả lại | Báo cáo mới `Chờ duyệt`, quay lại bước 3 |
| 5 | Hệ thống | — | Tự thông qua báo cáo chờ quá thời hạn duyệt | `Tự thông qua`; ghi trách nhiệm người duyệt |
| — | Lãnh đạo UBND, quản trị | CT-06 | Ghi nhận số liệu trực tiếp, bấm `Ghi nhận` | `Đã duyệt` ngay, không qua bước 3 |

#### Xác định kỳ và hạn báo cáo
- Tần suất báo cáo của chỉ tiêu hiện ở ô `Kỳ báo cáo` đầu hồ sơ (CT-06). Hạn báo cáo của một kỳ mặc định là **ngày 20 của tháng cuối kỳ**, ví dụ: Quý I hạn ngày 20/3, 6 tháng đầu năm hạn ngày 20/6, kỳ năm hạn ngày 20/12. Hạn đang áp dụng xem tại thẻ `Nguồn số liệu`, dòng `Hạn báo cáo`.
- Hạn báo cáo được đặt riêng cho từng chỉ tiêu: tại thẻ `Nguồn số liệu`, bấm `Sửa`, nhập `Hạn báo cáo (ngày trong tháng cuối kỳ)`, bấm `Lưu`. Người được sửa: lãnh đạo UBND, quản trị, văn thư, trưởng phòng chủ trì và chuyên viên phụ trách.
- Tab `Thực hiện` của hồ sơ có dải ô theo từng kỳ: kỳ đã báo cáo màu xanh lá, kỳ quá hạn chưa báo cáo màu đỏ, kỳ hiện tại có viền nổi bật. Rê chuột lên ô để xem hạn. Một kỳ được tính là đã báo cáo khi có báo cáo đang chờ duyệt hoặc đã duyệt; báo cáo bị trả lại không được tính.
- Hai loại chỉ tiêu không nhận báo cáo tay và không có nút `Báo cáo số liệu`. Chỉ tiêu gắn nhãn `Tự tính` lấy số từ kho dữ liệu, nên muốn thay đổi kết quả phải cập nhật bảng dữ liệu nguồn (DL-01, DL-05). Chỉ tiêu gắn nhãn `Tổng hợp từ chỉ tiêu con` được báo cáo ở từng chỉ tiêu con.

#### Bước 1. Nhắc hạn báo cáo
1. Hệ thống tự gửi thông báo nhắc trước hạn và khi quá hạn (xem khung cuối mục).
2. Trưởng phòng chủ trì hoặc lãnh đạo UBND nhắc trực tiếp tại hồ sơ chỉ tiêu: bấm `Thao tác` › `Nhắc việc`. Thông báo gửi tới chuyên viên phụ trách; nếu chỉ tiêu chưa giao người thì gửi tới trưởng phòng. Mỗi chỉ tiêu chỉ nhắc được một lần trong ngày.

#### Bước 2. Lập và gửi báo cáo
Người được báo cáo: chuyên viên và trưởng phòng của phòng chủ trì (không chỉ người phụ trách), lãnh đạo UBND, quản trị. Văn thư, người xem và cán bộ phòng phối hợp không báo cáo số liệu.

1. Mở hộp `Báo cáo số liệu` theo một trong ba cách:
   tại DH-02, tab `Cần báo cáo`, bấm `Báo cáo` ở dòng chỉ tiêu (hồ sơ mở sẵn hộp báo cáo với kỳ cần báo cáo);
   tại CT-02, mở menu của dòng chỉ tiêu, chọn `Báo cáo số liệu`;
   tại CT-06, bấm `Báo cáo số liệu` ở góc phải, hoặc bấm vào ô kỳ chưa báo cáo trên dải kỳ.
2. Kiểm tra `Kỳ báo cáo`. Mỗi kỳ trong danh sách ghi kèm "đã báo cáo", "quá hạn" hoặc ngày hạn.
3. Nhập `Giá trị thực hiện`. Dòng `Chỉ tiêu giao` dưới ô dùng để đối chiếu. Nếu kết quả cần ghi bằng lời, nhập thêm `Ghi bằng chữ`.
4. Ghi `Nguồn số liệu` hoặc `Ghi chú`. Bắt buộc có ít nhất một trong hai ô.
5. Ghi `Giải trình` khi hệ thống yêu cầu. Trường hợp kỳ đã quá hạn, nêu lý do nộp muộn. Trường hợp chỉ tiêu đang `Có nguy cơ` hoặc `Quá hạn` mà giá trị mới vẫn chưa đạt, nêu nguyên nhân và hướng khắc phục.
6. Bấm `Đính kèm minh chứng`, chọn ảnh hoặc tệp PDF (tối đa 10MB mỗi tệp, 10 tệp mỗi lần). Nếu chỉ tiêu có `Yêu cầu minh chứng`, nội dung yêu cầu hiện dưới ô này.
7. Bấm `Gửi báo cáo`.

Kết quả:
- Báo cáo hiện trong mục `Báo cáo số liệu` của tab `Thực hiện`, nhãn `Chờ duyệt`. Kỳ đó không còn bị nhắc thiếu báo cáo.
- Số liệu chính thức (ô `Thực hiện` đầu hồ sơ) **chưa thay đổi** cho đến khi báo cáo được duyệt.
- Trưởng phòng của phòng chủ trì (trừ người gửi) nhận thông báo có báo cáo chờ duyệt.
- Trong thời gian chờ duyệt, nút `Báo cáo số liệu` của người gửi đổi thành `Đang chờ duyệt` và không bấm được. Mỗi người chỉ có một báo cáo chờ duyệt cho mỗi chỉ tiêu.

> Nếu số liệu của chỉ tiêu vừa được người khác cập nhật trong lúc bạn đang lập báo cáo, hệ thống không nhận báo cáo và yêu cầu tải lại. Tải lại trang hồ sơ, xem số liệu mới rồi lập lại báo cáo.

#### Bước 3. Duyệt hoặc trả lại báo cáo
Người duyệt:
- Báo cáo của chuyên viên: trưởng phòng của phòng chủ trì. Lãnh đạo UBND và quản trị cũng duyệt được.
- Báo cáo của trưởng phòng: lãnh đạo UBND hoặc quản trị. Khi trưởng phòng gửi báo cáo, lãnh đạo không nhận thông báo riêng; lãnh đạo xem báo cáo này tại CT-04.
- Trưởng phòng chỉ thấy và duyệt báo cáo của phòng mình. Không ai được duyệt hoặc trả lại báo cáo do chính mình gửi; tại CT-04, dòng đó ghi "Báo cáo của bạn" thay cho các nút.

Duyệt tại màn hình Duyệt báo cáo (CT-04), thuận tiện khi có nhiều báo cáo:
1. Mở `Duyệt báo cáo` (số đỏ trên menu là số báo cáo chờ duyệt). Cách khác: mở DH-02, tab `Chờ tôi duyệt`, hoặc bấm vào thông báo có báo cáo chờ duyệt. Báo cáo gửi sớm nhất xếp trên cùng.
2. Bấm dấu `+` đầu dòng để xem `Nguồn số liệu`, `Giải trình`, `Ghi chú` và số tệp `Minh chứng`. Muốn mở tệp minh chứng, bấm tên chỉ tiêu để vào hồ sơ.
3. So sánh giá trị cũ và mới ở cột `Hiện tại → Đề xuất`. Cột `Tự thông qua` cho biết thời gian còn lại trước khi hệ thống tự thông qua: màu cam khi còn dưới 2 ngày, màu đỏ khi còn dưới 1 ngày.
4. Nếu đồng ý: bấm `Duyệt`, ghi `Ghi chú duyệt` nếu cần, bấm `Duyệt`.
5. Nếu không đồng ý: bấm `Trả lại`, nhập `Lý do trả lại` (ít nhất 3 ký tự), bấm `Trả lại`.

Duyệt ngay trong hồ sơ chỉ tiêu (CT-06), thuận tiện khi cần xem kỹ minh chứng:
1. Mở tab `Thực hiện`, mục `Báo cáo số liệu`. Tệp minh chứng hiện ngay dưới từng báo cáo.
2. Ở báo cáo `Chờ duyệt`, bấm `Duyệt` (báo cáo được duyệt ngay, không có ô ghi chú) hoặc `Trả lại` (nhập `Lý do trả lại`).

Kết quả:
- **Duyệt:** báo cáo có nhãn `Đã duyệt` kèm tên người duyệt. Giá trị trở thành số liệu chính thức, tiến độ và tình trạng được tính lại. Nếu đây là chỉ tiêu con, chỉ tiêu cha được tổng hợp lại. Người gửi nhận thông báo báo cáo đã được duyệt.
- **Trả lại:** báo cáo có nhãn `Trả lại` và dòng `Lý do trả lại`. Người gửi nhận thông báo kèm lý do. Kỳ đó lại được tính là chưa báo cáo.

> [!CANH-BAO] Báo cáo không còn duyệt được nếu số liệu chính thức của chỉ tiêu đã thay đổi sau lúc gửi, ví dụ vừa duyệt một báo cáo khác của cùng chỉ tiêu hoặc lãnh đạo vừa ghi nhận trực tiếp. Tại CT-04, nút `Duyệt` của báo cáo đó được thay bằng nhãn `Dữ liệu đã đổi`. Hãy bấm `Trả lại` để người gửi đối chiếu số liệu mới và báo cáo lại.

#### Bước 4. Báo cáo lại khi bị trả lại
1. Bấm vào thông báo báo cáo bị trả lại, hoặc mở DH-02, tab `Bị trả lại`, để xem `Lý do trả lại`.
2. Bấm `Báo cáo lại`. Hồ sơ chỉ tiêu mở sẵn hộp `Báo cáo số liệu`.
3. Chọn lại đúng `Kỳ báo cáo`, sửa số liệu, nguồn, minh chứng theo lý do trả lại, bấm `Gửi báo cáo`.

Báo cáo cũ vẫn lưu trong hồ sơ với nhãn `Trả lại`. Theo dõi kết quả các báo cáo đã gửi tại DH-02, tab `Báo cáo đã gửi`, cột `Kết quả`.

#### Lãnh đạo UBND ghi nhận số liệu trực tiếp
Lãnh đạo UBND và quản trị lập báo cáo như Bước 2, có hai điểm khác: hộp `Báo cáo số liệu` có nút `Ghi nhận` thay cho `Gửi báo cáo`, và ô `Nguồn số liệu` không bắt buộc. Số liệu có hiệu lực ngay với nhãn `Đã duyệt`; `Dòng thời gian` của hồ sơ ghi rõ lãnh đạo cập nhật trực tiếp. Sau lần ghi nhận này, các báo cáo khác của chỉ tiêu còn đang chờ duyệt không duyệt được nữa (xem khung cảnh báo ở Bước 3).

#### Bước 5. Hệ thống tự thông qua khi quá hạn duyệt
Báo cáo chờ duyệt quá thời hạn `Tự thông qua báo cáo sau` sẽ được hệ thống tự thông qua. Thời hạn tính từ lúc gửi, mặc định 7 ngày, quản trị viên chỉnh tại Cấu hình (HT-04); đặt 0 để tắt cơ chế này.
- Báo cáo có nhãn `Tự thông qua`. Giá trị trở thành số liệu chính thức như khi được duyệt.
- Hệ thống ghi trách nhiệm cho người duyệt để chậm: trưởng phòng chủ trì nếu báo cáo do chuyên viên gửi, lãnh đạo UBND nếu báo cáo do trưởng phòng gửi. Thông báo ghi tên người duyệt chịu trách nhiệm và được gửi tới người gửi, người duyệt và lãnh đạo UBND.
- Mỗi lần tự thông qua được đếm tại DH-04, cột `Tự thông qua` của nhóm `Duyệt báo cáo`.
- Nếu số liệu của chỉ tiêu đã thay đổi sau lúc gửi, hệ thống không tự thông qua. Thay vào đó, hệ thống thông báo cho người duyệt và lãnh đạo UBND để trả lại báo cáo.

> Thời hạn tự động: còn dưới 3 ngày đến hạn mà kỳ hiện tại chưa có báo cáo, hệ thống nhắc chuyên viên phụ trách; chỉ tiêu chưa giao người thì nhắc trưởng phòng. Nhắc trước hạn không áp dụng cho chỉ tiêu loại `Chấm điểm`. Qua hạn mà chưa có báo cáo, hệ thống thông báo cho chuyên viên phụ trách và trưởng phòng. Quá hạn trên 7 ngày, hệ thống báo lãnh đạo UBND và ghi vào `Dòng thời gian` của hồ sơ. Hai mốc 3 ngày và 7 ngày cố định, không chỉnh được trong Cấu hình. Báo cáo chờ duyệt tự thông qua sau mặc định 7 ngày, quản trị viên chỉnh tại Cấu hình (`Tự thông qua báo cáo sau`).

> Giới hạn quyền: không ai duyệt hoặc trả lại báo cáo do chính mình gửi. Trưởng phòng chỉ duyệt báo cáo của phòng mình. Văn thư và người xem không báo cáo số liệu. Chỉ tiêu `Tự tính` và chỉ tiêu `Tổng hợp từ chỉ tiêu con` không nhận báo cáo tay. Chỉ tiêu đã lưu trữ không nhận báo cáo mới, và chỉ tiêu còn báo cáo chờ duyệt thì chưa lưu trữ được. Số liệu vừa duyệt chưa tự lên trang công khai: lãnh đạo UBND phải bấm `Cập nhật bản công khai` ở dòng chỉ tiêu trên CT-02.

## 3.4 Văn bản giao chỉ tiêu: AI trích xuất, xác minh và duyệt thành chỉ tiêu

Quy trình dùng khi phường nhận văn bản giao chỉ tiêu (quyết định, kế hoạch, phụ lục). Hệ thống đọc văn bản, AI đề xuất các chỉ tiêu kèm trang và câu trích dẫn; cán bộ đối chiếu từng đề xuất trên bản gốc, trình; trưởng phòng hoặc lãnh đạo duyệt thành chỉ tiêu. Kết thúc quy trình, chỉ tiêu mới có trong danh mục và mở được đúng dòng của nó trong văn bản giao.

> Đề xuất do AI tạo không bao giờ tự trở thành chỉ tiêu. Chỉ đề xuất đã có người **trình** mới được duyệt hoặc tự thông qua.

| Bước | Người thực hiện | Màn hình | Việc làm | Kết quả, trạng thái |
|---|---|---|---|---|
| 1 | Văn thư, cán bộ các phòng | DL-02 | Tải văn bản lên kho | Văn bản `Chờ xử lý` |
| 2 | Hệ thống | DL-04 | Đọc văn bản, ghi vị trí từng dòng; AI trích xuất (nếu bật) | Văn bản `Đã xử lý`; đề xuất `Chưa trình` |
| 3 | Cán bộ phòng chủ trì, văn thư | DL-04 | Đối chiếu từng đề xuất trên bản gốc, sửa nếu sai | Đề xuất `Đã hiệu chỉnh` (nếu có sửa) |
| 4 | Người đề xuất, trưởng phòng phụ trách, văn thư, lãnh đạo | DL-04 hoặc CT-03 | Bấm `Trình` | `Chờ duyệt`; người duyệt nhận thông báo |
| 5 | Trưởng phòng phụ trách, lãnh đạo UBND | DL-04 hoặc CT-03 | Bấm `Duyệt` hoặc `Từ chối` | `Đã duyệt`: chỉ tiêu mới được tạo. `Từ chối`: ghi lý do |
| 6 | Hệ thống | — | Tự thông qua đề xuất đã trình quá thời hạn duyệt | `Tự thông qua` |
| 7 | Hệ thống; cán bộ có quyền | CT-06 | Tự định vị chỉ tiêu trong văn bản giao; chỉ lại khi sai | Nút `Xem đúng dòng trong văn bản` |

#### Bước 1. Tải văn bản lên kho
1. Mở `Kho văn bản` (DL-02), bấm `Tải văn bản lên`.
2. Kéo tệp vào khung hoặc bấm để chọn. Hệ thống nhận PDF (kể cả bản scan), Word (.docx), Excel (.xlsx) và ảnh chụp JPEG, PNG, WEBP; tối đa 25MB mỗi tệp.
3. Nhập thông tin văn bản: `Trích yếu`, `Loại văn bản`, `Số hiệu`, `Cơ quan ban hành`, `Ngày ban hành`, `Năm áp dụng`, `Phòng liên quan`, `Ghi chú`. Trích yếu để trống thì lấy theo tên tệp.
4. Chọn bật hoặc tắt `AI tự đề xuất chỉ tiêu từ văn bản này`:
   - Bật (mặc định) với văn bản giao chỉ tiêu cần đưa vào danh mục.
   - Tắt với văn bản chỉ để lưu, tra cứu và làm căn cứ (quyết định chung, phụ lục chương trình công tác). Văn bản vẫn được đọc đầy đủ để tìm kiếm và định vị nguồn; muốn trích xuất sau, mở văn bản và bấm `Trích xuất lại`.
5. Bấm `Tải lên`. Hệ thống cấp mã văn bản (VB-năm-số thứ tự) và mở trang `Xác minh trích xuất` (DL-04) của văn bản.

> Một tệp chỉ tải lên được một lần. Tải lại tệp đã có, hệ thống báo mã văn bản đang lưu tệp đó. Thông tin văn bản (trích yếu, số hiệu, cơ quan, ngày ban hành) sửa được sau tại DL-02: menu dòng văn bản › `Sửa thông tin`.

#### Bước 2. Hệ thống đọc và trích xuất
- Trạng thái văn bản đổi lần lượt `Chờ xử lý` › `Đang xử lý` › `Đã xử lý` (hoặc `Lỗi xử lý`, rê chuột lên nhãn để xem lý do). Trang DL-04 tự cập nhật; khi đang trích xuất có thanh tiến độ theo số đoạn văn bản.
- PDF có lớp chữ được đọc trực tiếp. PDF scan và ảnh chụp được nhận dạng ký tự (OCR); độ tin cậy nhận dạng hiện ở chế độ `Chữ đã đọc`.
- Khi đọc, hệ thống ghi lại vị trí từng dòng chữ trên trang. Vị trí này dùng để mở đúng trang và tô sáng đúng dòng ở bước 3 và bước 7.
- Văn bản giao chỉ tiêu cho nhiều xã, phường (mỗi đơn vị một phần, ví dụ phụ lục chỉ tiêu cấp xã của Thành phố): AI chỉ đọc phần của địa phương mình, theo tên đơn vị khai báo tại `Thiết lập địa phương` (HT-01). Thông tin "chỉ trích xuất phần của …, trang …" được ghi ở lượt trích xuất.
- Muốn dừng lượt trích xuất đang chạy, bấm `Dừng trích xuất`, xác nhận `Dừng`. Các đề xuất đã tạo trước khi dừng được giữ lại.

#### Bước 3. Đối chiếu từng đề xuất trên bản gốc
1. Tại DL-04, cột phải liệt kê đề xuất. Mỗi thẻ có:
   - nhãn `Tin cậy` (xanh lá từ 80%, vàng từ 60%, đỏ dưới 60%);
   - loại đề xuất `Chỉ tiêu mới` hoặc `Cập nhật số liệu`, trang lấy ra (`Trang n`);
   - nhãn `Có thể trùng` và dòng "Gần giống CT-…" khi danh mục đã có chỉ tiêu tương tự.
2. Bấm vào một thẻ. Khung trái ở chế độ `Bản gốc` mở đúng trang của văn bản và tô sáng dòng có nhãn **Đề xuất lấy từ đây**. Chế độ `Chữ đã đọc` hiện nội dung đã đọc, câu trích dẫn được tô màu.
3. So tên chỉ tiêu, giá trị mục tiêu, đơn vị, năm, kỳ báo cáo, phòng chủ trì với dòng được tô sáng.
4. Nếu sai hoặc thiếu, bấm `Sửa`, điều chỉnh các trường (`Tên chỉ tiêu`, `Giá trị mục tiêu`, `Đơn vị tính`, `Mục tiêu ghi bằng chữ`, `Chiều đánh giá`, `Năm`, `Kỳ báo cáo`, `Hạn hoàn thành`, `Phòng chủ trì`, `Bộ chỉ tiêu`, `Căn cứ`…), bấm `Lưu`. Thẻ có thêm nhãn `Đã hiệu chỉnh`.
5. Đề xuất trùng hoặc không phải chỉ tiêu: trưởng phòng, lãnh đạo bấm `Từ chối`; văn thư bấm `Loại` (chỉ với đề xuất của AI chưa trình). Nhập lý do, bấm `Từ chối`.

> Trước khi trình hoặc duyệt, đề xuất phải có đủ: tên chỉ tiêu, đơn vị đo, giá trị mục tiêu, năm kế hoạch, phòng ban phụ trách, kỳ báo cáo và hạn hoàn thành. Thiếu mục nào, hệ thống báo tên mục đó.

#### Bước 4. Trình đề xuất
1. Bấm `Trình` trên thẻ đề xuất (DL-04) hoặc trong ngăn chi tiết đề xuất (CT-03).
2. Đề xuất chuyển `Chờ duyệt`. Trưởng phòng phụ trách và lãnh đạo UBND nhận thông báo.
3. Thẻ ghi "Đã trình · tự thông qua sau …" theo thời hạn tại `Cấu hình` (HT-04), mặc định 3 ngày; đặt 0 để tắt tự thông qua.

Người được trình: người tạo đề xuất, trưởng phòng của phòng phụ trách, văn thư, lãnh đạo UBND, quản trị.

#### Bước 5. Duyệt hoặc từ chối
Người duyệt: trưởng phòng của phòng phụ trách và lãnh đạo UBND. Trưởng phòng không tự duyệt đề xuất do chính mình tạo.

1. Mở đề xuất tại DL-04 hoặc tại `Đề xuất chỉ tiêu` (CT-03).
2. Duyệt: bấm `Duyệt`, kiểm tra `Trọng số` (mặc định 1, từ 0,1 đến 10), bấm `Duyệt`. Hệ thống báo "Đã tạo chỉ tiêu CT-…", bấm `Mở hồ sơ chỉ tiêu` để xem.
3. Từ chối: bấm `Từ chối`, nhập `Lý do từ chối`, bấm `Từ chối`. Người tạo đề xuất xem được lý do trên thẻ.

#### Bước 6. Tự thông qua khi quá hạn duyệt
Đề xuất đã trình mà quá thời hạn chưa ai duyệt hoặc từ chối được hệ thống tự thông qua thành chỉ tiêu. Thẻ đề xuất ghi `Tự thông qua` và "Hệ thống tự thông qua"; dòng thời gian của chỉ tiêu ghi nhận việc người duyệt không xử lý đúng hạn.

#### Bước 7. Mở chỉ tiêu đúng dòng trong văn bản giao
Chỉ tiêu tạo từ đề xuất được gắn văn bản đề xuất được trích ra. Chỉ tiêu thuộc bộ chỉ tiêu có `Văn bản giao (trong kho)` (khai báo tại CT-01, nút `Sửa` của bộ) dùng văn bản đó. Hệ thống tự tìm dòng của chỉ tiêu trong văn bản, kể cả văn bản hàng trăm trang chia phần theo từng xã, phường.

1. Tại hồ sơ chỉ tiêu (CT-06), bấm nhãn văn bản dưới tên chỉ tiêu (ví dụ "Phụ lục 2 · trang 101") hoặc nút `Xem đúng dòng trong văn bản` ở thẻ `Căn cứ`, dòng `Văn bản giao`.
2. Văn bản mở ngay trong hệ thống, đúng trang; hàng của chỉ tiêu được tô vàng, có nhãn **Chỉ tiêu ở đây**. Dòng thông báo phía trên cho biết vị trí do hệ thống tự tìm hay do cán bộ chỉ.
3. Dùng thanh công cụ để chuyển trang, phóng to, thu nhỏ; bấm `Về dòng tô sáng` để quay lại dòng của chỉ tiêu. `Tệp gốc` tải tệp về máy, `Mở trong kho` mở trang văn bản.

Khi hệ thống tô sai dòng hoặc báo "chưa tìm thấy dòng của chỉ tiêu":
1. Người có quyền (lãnh đạo UBND, quản trị, văn thư, trưởng phòng chủ trì, chuyên viên phụ trách) bấm `Sai dòng? Chỉ lại` (hoặc `Chỉ vị trí`).
2. Rê chuột lên trang văn bản: hàng dưới con trỏ được viền xanh. Bấm vào hàng đúng.
3. Hệ thống ghi nhận vị trí mới, thông báo "Đã ghi nhận vị trí chỉ tiêu ở trang …" và ghi vào `Nhật ký hệ thống`. Từ đó hệ thống không tự định vị đè lên vị trí do cán bộ chỉ.
4. Muốn trả lại cho hệ thống tự định vị, bấm `Tự định vị`.

> Đổi tên chỉ tiêu hoặc đổi văn bản giao, hệ thống tự định vị lại ở lần mở sau. Văn bản Word, Excel không có hình trang: hệ thống mở phần nội dung đã đọc, cuộn tới và tô màu câu của chỉ tiêu.

#### Đề xuất chỉ tiêu thủ công
Cán bộ đề xuất được chỉ tiêu không có trong văn bản đã tải lên (ví dụ chỉ tiêu phường tự đặt):
1. Mở `Đề xuất chỉ tiêu` (CT-03), bấm `Đề xuất mới`.
2. Nhập các trường như bước 3; chọn `Căn cứ` hoặc văn bản trong kho nếu có.
3. Lưu rồi `Trình`; các bước sau giống bước 4 và 5.


