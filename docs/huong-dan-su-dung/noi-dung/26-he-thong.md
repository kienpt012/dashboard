## 2.5 Nhóm Hệ thống

### HT-01 · Thiết lập địa phương

**Đường dẫn:** menu `Hệ thống` › `Thiết lập địa phương` (`/admin/thiet-lap`) · **Vai trò:** quản trị hệ thống.

Khai báo thông tin địa phương, chọn cơ cấu tổ chức, nạp bộ chỉ tiêu mẫu và đặt các thời hạn ban đầu. Có thể mở lại màn hình
để cập nhật thông tin; cần kiểm tra các lựa chọn trước khi áp dụng cho đơn vị đang vận hành.

![Thiết lập địa phương](anh/ht-01.png)

1. **Các bước thiết lập** — `Địa phương`, `Cơ cấu tổ chức`, `Bộ chỉ tiêu`, `Thời hạn`, `Áp dụng`.
2. **Thông tin địa phương** — loại đơn vị, tên đơn vị, tên cơ quan, tên ngắn, các mã định danh, `Màu chủ đạo` và thông tin liên hệ.
3. **Lưu thông tin địa phương** — `Chỉ lưu thông tin địa phương` cập nhật phần thông tin đang khai.

#### Cập nhật thông tin địa phương
1. Chọn `Loại đơn vị`; nhập `Tên đơn vị`, `Tên cơ quan`, `Tên ngắn` (bắt buộc). Dòng gợi ý dưới `Tên ngắn` cho biết tên ứng dụng sẽ hiển thị (IOC kèm tên ngắn).
2. Bổ sung `Tỉnh / Thành phố`, `Mã đơn vị hành chính`, `Mã định danh cơ quan`, `Màu chủ đạo`, `Địa chỉ`, `Điện thoại`, `Email liên hệ`, `Trang thông tin`, `Tên miền email công vụ` khi có.
3. Nếu chỉ cập nhật hồ sơ địa phương, bấm `Chỉ lưu thông tin địa phương`.

`Mã đơn vị hành chính` gồm 5 chữ số; `Mã định danh cơ quan` chỉ gồm chữ, số, dấu chấm, gạch ngang; `Trang thông tin` bắt
đầu bằng `http://` hoặc `https://`.

> [!CANH-BAO] `Tên ngắn` còn là tên hệ thống dùng để nhận ra phần của địa phương trong văn bản giao chỉ tiêu cho nhiều xã, phường (mỗi đơn vị một phần). Với văn bản loại này, AI chỉ trích xuất các trang thuộc phần của địa phương và việc tìm vị trí chỉ tiêu trong văn bản giao cũng chỉ tìm trong phần đó. Nhập `Tên ngắn` đúng địa danh như trên văn bản cấp trên, ví dụ "Lái Thiêu" (không phân biệt chữ hoa, chữ thường; có hay không chữ "Phường", "Xã" ở đầu đều được). Cơ chế này chỉ hoạt động sau khi đã `Áp dụng thiết lập` ít nhất một lần. Nếu không nhận ra phần của địa phương, AI đọc toàn văn bản và khung `Lượt xử lý` (DL-04) ghi lại điều này.

#### Áp dụng cơ cấu và bộ chỉ tiêu ban đầu
1. Từ bước `Địa phương`, bấm `Tiếp tục`. Tại `Cơ cấu tổ chức`, chọn các phòng ban cần dùng và kiểm tra `Tên phòng ban`; phải chọn ít nhất một đơn vị.
2. Bấm `Tiếp tục` đến `Bộ chỉ tiêu`. Chọn năm tại `Nạp cho năm` và chọn các bộ mẫu phù hợp. Có thể không chọn bộ nào nếu chưa cần nạp; chú ý nhãn `Đã nạp` và `Không đúng loại đơn vị`.
3. Tại `Thời hạn`, kiểm tra `Tự thông qua báo cáo sau`, `Tự thông qua đề xuất sau`, `Hạn trả lời giải trình`, `Nhắc chưa giao người sau`, `Số lần chuyển việc tối đa` và `Trình chiếu chuyển trang sau`. Ý nghĩa và giá trị mặc định xem HT-04 bên dưới.
4. Tại `Áp dụng`, đọc lại bảng tổng hợp. Bấm `Quay lại` nếu cần sửa; bấm `Áp dụng thiết lập` khi thông tin đã đúng.
5. Đọc kết quả tạo mới/cập nhật phòng ban và kết quả của **từng bộ chỉ tiêu**; mở `Bộ chỉ tiêu` để kiểm tra sau khi nạp.

> Khi áp dụng lại, phòng ban trùng mã được ghi đè tên, tên ngắn, loại, lĩnh vực, màu và thứ tự theo bảng ở bước `Cơ cấu tổ chức`; bộ mẫu đã nạp cho năm đó được bỏ qua. `Áp dụng thiết lập` cũng ghi các thời hạn ở bước `Thời hạn` vào Cấu hình và lấy năm tại `Nạp cho năm` làm `Năm kế hoạch mặc định` (HT-04). Một bộ mẫu có thể báo lỗi riêng dù thông tin địa phương, phòng ban và thời hạn đã lưu; cần đọc từng dòng kết quả, không chỉ thông báo chung.

### HT-02 · Phòng ban

**Đường dẫn:** menu `Hệ thống` › `Phòng ban` (`/admin/departments`) · **Vai trò:** tất cả được xem trong phạm vi quyền; chỉ quản trị được thêm và sửa.

Quản lý danh mục đơn vị, lĩnh vực phụ trách và trạng thái hoạt động. Với tài khoản giới hạn theo phòng, tiêu đề màn hình là
`Thông tin phòng`.

![Danh sách phòng ban](anh/ht-02.png)

1. **Thêm đơn vị** — `Thêm phòng ban` mở hộp nhập thông tin đơn vị mới.
2. **Tìm phòng ban** — ô `Tên, mã, lĩnh vực` xuất hiện khi danh sách có trên 5 đơn vị.
3. **Danh sách đơn vị** — xem loại, số cán bộ, chỉ tiêu, phản ánh và trạng thái; mở dấu `+` để đọc lĩnh vực, ghi chú hoặc bấm biểu tượng `Sửa` ở cuối dòng để cập nhật.

Cột `Cán bộ` tính các tài khoản gắn với đơn vị, kể cả đã khóa; `Chỉ tiêu` không tính chỉ tiêu đã lưu trữ; `Phản ánh` tính
các hồ sơ gắn với đơn vị. Bấm số ở cột `Chỉ tiêu` để mở danh sách tương ứng.

#### Thêm hoặc sửa phòng ban
1. Bấm `Thêm phòng ban`, hoặc biểu tượng `Sửa` tại đơn vị cần cập nhật.
2. Nhập `Mã`, `Tên đầy đủ`; bổ sung `Tên ngắn`, `Loại đơn vị`, `Thứ tự`, `Màu nhận diện`, `Lĩnh vực phụ trách`, `Ghi chú`.
3. Bấm `Lưu`. Mã phải riêng biệt, dài 2–30 ký tự, chỉ gồm chữ không dấu, số, dấu gạch ngang hoặc gạch dưới; hệ thống lưu mã bằng chữ hoa.

#### Ngừng hoặc khôi phục hoạt động phòng ban
1. Bấm `Sửa`, tắt `Đang hoạt động`, rồi bấm `Lưu`.
2. Đọc số tài khoản, chỉ tiêu và phản ánh trong hộp `Ngừng hoạt động phòng ban?`; bấm `Ngừng hoạt động` để xác nhận.
3. Khi cần dùng lại, mở `Sửa`, bật `Đang hoạt động`, rồi `Lưu`.

> Hệ thống không cho ngừng khi còn tài khoản hoạt động, chỉ tiêu chưa lưu trữ hoặc phản ánh chưa kết thúc/đang chờ xem xét lại. Cần chuyển hoặc khóa tài khoản, chuyển chỉ tiêu và xử lý xong phản ánh trước.

### HT-03 · Tài khoản

**Đường dẫn:** menu `Hệ thống` › `Tài khoản` (`/admin/users`) · **Vai trò:** quản trị hệ thống.

Tạo tài khoản cán bộ, gắn vai trò và phòng ban; cập nhật thông tin, đặt lại mật khẩu hoặc khóa khi ngừng sử dụng.
Phân biệt các vai trò theo mục 1.2.

![Quản lý tài khoản](anh/ht-03.png)

1. **Tạo tài khoản** — mở hộp khai báo tài khoản cán bộ mới.
2. **Tìm kiếm và lọc** — tìm tại `Tên, tên đăng nhập, email`; chọn `Vai trò` hoặc `Phòng ban` để thu hẹp danh sách.
3. **Thông tin tài khoản** — xem cán bộ, vai trò, chức vụ, phòng ban, lần đăng nhập gần nhất và trạng thái; bấm biểu tượng `Sửa` ở cuối dòng để cập nhật. Khi màn hình không đủ rộng, kéo ngang bảng để xem cột `Trạng thái`.

#### Tạo tài khoản cán bộ
1. Bấm `Tạo tài khoản`; nhập `Tên đăng nhập`, `Họ và tên`, chọn `Vai trò` (hộp mở sẵn `Chuyên viên`).
2. Chọn `Phòng ban` theo quy tắc dưới đây. Bổ sung `Chức vụ`, `Email công vụ` nếu có; cán bộ cần email công vụ để tự khôi phục mật khẩu (mục 1.3).
3. Nhập `Mật khẩu` theo yêu cầu tại mục 1.3, rồi bấm `Lưu`.

| Vai trò | `Phòng ban` | Phạm vi dữ liệu |
|---|---|---|
| Quản trị hệ thống | Không gắn (ô bị khóa) | Toàn địa phương |
| Lãnh đạo UBND, Văn thư | Không bắt buộc; để trống thì danh sách ghi `Toàn địa phương` | Toàn địa phương, kể cả khi có chọn phòng ban |
| Trưởng phòng, Chuyên viên, Người xem | Bắt buộc, chỉ chọn được phòng ban đang hoạt động | Chỉ phòng được gắn |

`Tên đăng nhập` dài 3–50 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới; được lưu bằng chữ thường và
không đổi trong hộp sửa. Tên đăng nhập và email không được trùng tài khoản khác. Quyền thao tác cụ thể của từng vai trò
xem mục 1.2.

#### Cập nhật, đặt lại mật khẩu hoặc khóa tài khoản
1. Tìm cán bộ và bấm `Sửa`.
2. Cập nhật thông tin cần thay đổi. Nhập `Đặt lại mật khẩu` nếu cần cấp mật khẩu khác; để trống để giữ mật khẩu hiện tại.
3. Tắt `Đang hoạt động` nếu cần khóa, hoặc bật lại để cho sử dụng; bấm `Lưu`.

Đổi vai trò, chuyển phòng, khóa, mở khóa hoặc đặt lại mật khẩu sẽ thu hồi các phiên đăng nhập đang có của tài khoản đó.
Khi sửa chính tài khoản đang đăng nhập, ô `Vai trò` và công tắc `Đang hoạt động` bị khóa, ô đặt lại mật khẩu được ẩn;
đổi mật khẩu của mình tại HT-07.

> Nếu tài khoản còn phản ánh đang xử lý, phải phân công lại trước khi khóa, chuyển phòng hoặc đổi sang vai trò khác Trưởng phòng, Chuyên viên. Khi đó các chỉ tiêu người này đang phụ trách được trả về trưởng phòng để phân công lại; dòng thời gian của chỉ tiêu ghi rõ lý do. Hệ thống luôn phải còn ít nhất một quản trị viên đang hoạt động.

### HT-04 · Cấu hình

**Đường dẫn:** menu `Hệ thống` › `Cấu hình` (`/admin/settings`) · **Vai trò:** quản trị hệ thống.

Đặt các giá trị dùng chung về năm kế hoạch, cảnh báo, thời hạn trách nhiệm, phản ánh người dân, trình chiếu và hiệu ứng Jarvis.
Đơn vị ngày, lần, giây hoặc phần trăm được ghi ngay tại ô nhập.

![Các nhóm cấu hình hệ thống](anh/ht-04.png)

1. **Kế hoạch và cảnh báo** — năm mặc định, số ngày cảnh báo trước hạn và ngưỡng có nguy cơ.
2. **Thời hạn trách nhiệm** — tự thông qua, giải trình, nhắc giao người và giới hạn chuyển việc.
3. **Phản ánh người dân** — hạn phản hồi đầu tiên, xử lý và chờ bổ sung.
4. **Trình chiếu và Jarvis** — thời gian chuyển trang và công tắc hiệu ứng toàn màn hình khi gọi Jarvis.

#### Điều chỉnh các giá trị dùng chung
1. Đọc giá trị hiện tại và dòng thời điểm/người cập nhật dưới tiêu đề.
2. Sửa trường cần điều chỉnh theo bảng dưới; số ngày, năm, số lần và số giây phải là số nguyên.
3. Bấm `Lưu cấu hình`. Nếu hệ thống báo cấu hình vừa được người khác cập nhật, tải lại và kiểm tra giá trị mới trước khi sửa tiếp.

Cột "Mặc định" là giá trị khi hệ thống chưa lưu cấu hình lần nào.

| Trường | Mặc định | Phạm vi nhập | Tác dụng |
|---|---|---|---|
| `Năm kế hoạch mặc định` | Năm hiện tại | 2000–2100 | Năm số liệu mặc định của cổng thông tin công khai và năm Jarvis dùng khi câu hỏi không nêu năm. Các màn hình quản trị vẫn mở sẵn năm hiện tại. |
| `Cảnh báo trước hạn` | 14 ngày | 1–365 ngày | Số ngày trước hạn hoàn thành để xếp chỉ tiêu chưa hoàn thành vào nhóm sắp đến hạn trong thống kê cảnh báo. |
| `Ngưỡng có nguy cơ` | 70% | 0–100% | Chỉ tiêu chưa đạt, chưa quá hạn có tiến độ dưới ngưỡng này được xếp `Có nguy cơ`, từ ngưỡng trở lên là `Đúng tiến độ`; cách tính tiến độ xem mục 1.5. |
| `Tự thông qua báo cáo sau` | 7 ngày | 0–60 ngày | Báo cáo số liệu chờ duyệt quá số ngày này, tính từ lúc gửi, được hệ thống tự thông qua và ghi trách nhiệm người duyệt. Nhập 0 để tắt. |
| `Tự thông qua đề xuất sau` | 3 ngày | 0–30 ngày | Hạn tự thông qua được ghi cho đề xuất tại lúc trình; quá hạn mà chưa được duyệt hoặc từ chối thì đề xuất tự thành chỉ tiêu. Nhập 0 để tắt: đề xuất trình sau đó không có hạn, đề xuất đã có hạn cũng không tự thông qua trong thời gian tắt. |
| `Hạn trả lời giải trình` | 3 ngày | 1–30 ngày | Hạn mặc định của yêu cầu giải trình, tính từ lúc gửi yêu cầu; người yêu cầu có thể nhập hạn riêng 1–30 ngày tại ô `Thời hạn trả lời (ngày)`. |
| `Nhắc chưa giao người sau` | 3 ngày | 0–30 ngày | Chỉ tiêu nhập số liệu thủ công, không có chỉ tiêu con, chưa có người phụ trách quá số ngày này (tính từ lúc tạo chỉ tiêu) thì nhắc trưởng phòng chủ trì; quá gấp đôi số ngày thì báo lãnh đạo và coi là việc bị treo. Nhập 0 để tắt. |
| `Số lần chuyển việc tối đa` | 1 lần | 0–5 lần | Số lần người phụ trách được chuyển chỉ tiêu cho cán bộ khác cùng phòng chủ trì, tính từ lần giao gần nhất; 0 là không cho chuyển. Hết lượt thì chỉ còn cách trả lại trưởng phòng để phân công lại. |
| `Hạn phản hồi đầu tiên` | 2 ngày | 1–30 ngày | Tính từ lúc tiếp nhận phản ánh mới. |
| `Hạn xử lý` | 10 ngày | 1–365 ngày | Thời hạn cơ sở để tính hạn xử lý phản ánh theo mức ưu tiên. |
| `Hạn người dân bổ sung` | 7 ngày | 1–60 ngày | Tính từ lúc cán bộ gửi yêu cầu bổ sung thông tin. |
| `Chuyển trang sau` | 20 giây | 5–300 giây | Thời gian hiển thị mỗi trang của Trình chiếu (DH-03); cùng giá trị với `Trình chiếu chuyển trang sau` ở HT-01. |
| `Hiệu ứng khi gọi Jarvis` | Bật | Bật / tắt | Cho phép hình ảnh toàn màn hình khi gọi Jarvis; thao tác hỏi và cài đặt giọng nói xem mục 1.6. |

`Hạn xử lý` phản ánh phải lớn hơn hoặc bằng `Hạn phản hồi đầu tiên`. Khi tính hạn theo ưu tiên: `Khẩn` là 1 ngày; `Cao`
là một nửa thời hạn cơ sở, làm tròn lên và tối thiểu 2 ngày; `Bình thường` bằng thời hạn cơ sở; `Thấp` thêm 5 ngày.
Quy trình theo dõi các hạn này xem ND-01, mục 2.4.

#### Theo dõi kết quả xử lý tự động
Hệ thống rà soát các thời hạn trên theo chu kỳ ngắn (mặc định mỗi phút). Thao tác tự động ghi người thực hiện là
**Hệ thống IOC** trên dòng thời gian của chỉ tiêu; riêng việc tự thông qua báo cáo, đề xuất còn được ghi vào Nhật ký hệ thống
(HT-05) với tài khoản "he-thong".

- **Báo cáo quá hạn duyệt** chỉ được tự thông qua khi chỉ tiêu chưa lưu trữ và số liệu chưa thay đổi sau lúc gửi; nếu không, hệ thống báo người duyệt và lãnh đạo để xử lý. Người duyệt chịu trách nhiệm là trưởng phòng chủ trì, hoặc lãnh đạo nếu báo cáo do trưởng phòng gửi.
- **Đề xuất quá hạn** mà không tạo được chỉ tiêu (ví dụ thiếu thông tin bắt buộc) thì dừng đếm hạn, hệ thống báo lãnh đạo và trưởng phòng phụ trách. Đề xuất còn dưới 24 giờ đến hạn được nhắc lãnh đạo và trưởng phòng phụ trách.
- **Báo cáo định kỳ** của chỉ tiêu nhập số liệu thủ công được nhắc khi kỳ hiện tại còn dưới 3 ngày đến hạn (trừ chỉ tiêu loại `Chấm điểm`); kỳ đã quá hạn mà chưa báo cáo được nhắc, trễ quá 7 ngày thì báo lãnh đạo. Các mốc 24 giờ, 3 ngày, 7 ngày cố định, không phụ thuộc ô `Cảnh báo trước hạn`.
- **Việc bị treo** gồm chỉ tiêu chưa giao người quá gấp đôi `Nhắc chưa giao người sau` (trừ chỉ tiêu loại thống kê) và chỉ tiêu bị chuyển, trả qua lại từ 3 lần trở lên (mốc 3 lần cố định; từ lần thứ 3, mỗi lần chuyển hoặc trả đều được báo lãnh đạo). Danh sách hiện ở thẻ `Việc bị treo` của DH-01 và trên Trình chiếu (DH-03); riêng Trình chiếu còn liệt kê thêm chỉ tiêu quá hạn trả lời giải trình.
- **Giải trình quá hạn** được thông báo tới người yêu cầu, trưởng phòng chủ trì và người phụ trách, ghi vào dòng thời gian; yêu cầu vẫn mở cho tới khi được trả lời.
- **Phản ánh quá hạn bổ sung** vẫn cần người có thẩm quyền quyết định kết thúc, không tự đóng theo cấu hình.

> Thay đổi `Tự thông qua báo cáo sau` và `Nhắc chưa giao người sau` áp dụng ngay cho cả việc đang chờ. Thay đổi số ngày của `Tự thông qua đề xuất sau` và `Hạn trả lời giải trình` chỉ áp dụng cho đề xuất trình và yêu cầu giải trình gửi sau khi lưu. Kết quả xử lý tự động được tổng hợp tại Trách nhiệm (DH-04).

### HT-05 · Nhật ký hệ thống

**Đường dẫn:** menu `Hệ thống` › `Nhật ký hệ thống` (`/admin/audit-logs`) · **Vai trò:** quản trị hệ thống.

Tra cứu ai đã thực hiện thao tác nào, vào thời điểm nào và với đối tượng nào. Dùng khi đối chiếu một thay đổi hoặc tìm
thông tin phục vụ xử lý sự cố.

![Nhật ký hệ thống](anh/ht-05.png)

1. **Điều kiện tra cứu** — tìm `Tài khoản, mã đối tượng`; kết hợp `Thao tác`, `Đối tượng`, `Phòng ban` và khoảng ngày.
2. **Bản ghi nhật ký** — thời điểm, người thực hiện (tên đăng nhập và vai trò), thao tác, đối tượng và phòng ban liên quan; biểu tượng sao chép cạnh mã đối tượng giúp lấy đúng mã khi đối chiếu.
3. **Chi tiết bản ghi** — phần mở ra khi bấm dấu `+` ở đầu dòng có thông tin bổ sung, ví dụ số dòng của một lần đối soát tệp Excel.

#### Tra cứu một thao tác
1. Nhập tên đăng nhập hoặc mã đối tượng (có thể nhập một phần), bấm `Enter`; chọn thêm các điều kiện cần dùng. Danh sách `Thao tác` và `Đối tượng` chỉ gồm các giá trị đã có trong nhật ký.
2. Chọn khoảng ngày để giới hạn thời gian. Ngày lọc được tính theo giờ Việt Nam và bao gồm cả ngày kết thúc.
3. Đọc bản ghi phù hợp; mở dấu `+` nếu có để xem trường đã thay đổi hoặc thông tin liên quan.
4. Bấm cột `Thời điểm` để đổi thứ tự; chọn 20, 50 hoặc 100 bản ghi mỗi trang khi cần.

Các thao tác ở nhóm Hệ thống được ghi với nhãn sau trong cột `Thao tác`:

| Thao tác | Nhãn trong nhật ký |
|---|---|
| HT-01: bấm `Chỉ lưu thông tin địa phương` | `Cập nhật thông tin địa phương` |
| HT-01: bấm `Áp dụng thiết lập` | `Thiết lập địa phương`, kèm `Cập nhật thông tin địa phương` và một dòng `Nạp bộ chỉ tiêu mẫu` cho mỗi bộ được nạp mới |
| HT-02: thêm, sửa phòng ban | `Tạo phòng ban`, `Cập nhật phòng ban` |
| HT-03: tạo, sửa tài khoản | `Tạo tài khoản`, `Cập nhật tài khoản`; phần chi tiết có `Đặt lại mật khẩu`, `Vai trò trước`, `Vai trò hiện tại` |
| HT-04: bấm `Lưu cấu hình` | `Cập nhật cấu hình`; phần chi tiết `Trường thay đổi` liệt kê tên các ô đã sửa |
| HT-06: lưu trạng thái báo lỗi | `Cập nhật báo lỗi` |
| HT-07: bấm `Đổi mật khẩu`; khôi phục khi quên (mục 1.3) | `Đổi mật khẩu`; `Khôi phục mật khẩu` |
| Hệ thống tự thông qua (HT-04) | `Tự thông qua số liệu`, `Tự thông qua đề xuất chỉ tiêu`, người thực hiện "he-thong" |

Nhật ký hiển thị thông tin được phép tra cứu, không phải bản sao toàn bộ nội dung hồ sơ. Hệ thống không cho sửa hoặc xóa
bản ghi tại màn hình này.

### HT-06 · Báo lỗi

**Đường dẫn:** menu `Hệ thống` › `Báo lỗi` (`/admin/bao-loi`) · **Vai trò:** quản trị hệ thống.

Tiếp nhận và theo dõi báo lỗi do người dùng gửi, kèm địa chỉ, mã màn hình và ảnh chụp nếu có. Cách gửi báo lỗi từ thanh đầu
trang đã trình bày ở mục 1.4.

![Danh sách báo lỗi chưa có bản ghi](anh/ht-06.png)

1. **Tìm và lọc báo lỗi** — tìm tại `Nội dung, địa chỉ, mã màn hình`; lọc `Tất cả`, `Mới`, `Đang xử lý`, `Đã sửa`, `Không sửa`.
2. **Danh sách** — các cột mô tả, màn hình, người gửi, ảnh, trạng thái và thời điểm gửi; khi chưa có dữ liệu hiển thị `Chưa có báo lỗi`.

#### Xem và cập nhật một báo lỗi
1. Khi có bản ghi, bấm dòng báo lỗi để mở chi tiết.
2. Đọc `Người gửi`, `Màn hình`, `Địa chỉ`, `Khung nhìn`, `Trình duyệt`, nội dung mô tả và ảnh đính kèm; bấm địa chỉ để mở màn hình được báo.
3. Chọn `Trạng thái`, nhập `Ghi chú xử lý` tối đa 2.000 ký tự, rồi bấm `Lưu`. Bấm `Đóng` để rời ngăn chi tiết.

| Trạng thái | Cách dùng |
|---|---|
| `Mới` | Chưa bắt đầu xử lý. |
| `Đang xử lý` | Đang kiểm tra hoặc sửa lỗi. |
| `Đã sửa` | Đã hoàn tất sửa; ghi kết quả kiểm tra trong ghi chú. |
| `Không sửa` | Kết thúc mà không sửa; ghi rõ lý do. |

> Ảnh minh họa là danh sách chưa có báo lỗi nên chưa thể hiện ngăn chi tiết. Danh sách hiện tải tối đa 200 báo lỗi mới nhất; số đếm và bộ lọc trên màn hình áp dụng trong các bản ghi đã tải.

### HT-07 · Hồ sơ cá nhân

**Đường dẫn:** menu `Hệ thống` › `Hồ sơ cá nhân` (`/admin/profile`), hoặc menu tài khoản › `Hồ sơ cá nhân` · **Vai trò:** tất cả.

Kiểm tra thông tin tài khoản đang đăng nhập và đổi mật khẩu của mình. Nếu họ tên, chức vụ, email hoặc phòng ban chưa đúng,
liên hệ quản trị viên cập nhật tại HT-03.

![Hồ sơ cá nhân và đổi mật khẩu](anh/ht-07.png)

1. **Thông tin tài khoản** — họ tên, tên đăng nhập, `Vai trò`, `Chức vụ`, `Phạm vi`, `Email công vụ` và `Đăng nhập gần nhất`. `Phạm vi` ghi toàn địa phương (ví dụ "Toàn phường Lái Thiêu") với quản trị, lãnh đạo, văn thư; ghi tên phòng với các vai trò còn lại.
2. **Đổi mật khẩu** — nhập mật khẩu hiện tại, mật khẩu mới và nhập lại để xác nhận.

#### Đổi mật khẩu của mình
1. Nhập `Mật khẩu hiện tại`.
2. Nhập `Mật khẩu mới` khác mật khẩu hiện tại và đáp ứng yêu cầu tại mục 1.3; nhập đúng lần nữa tại `Nhập lại mật khẩu mới`.
3. Bấm `Đổi mật khẩu`. Khi thành công, phiên đang dùng được giữ và các phiên đăng nhập khác bị thu hồi.

Mỗi tài khoản được thử đổi mật khẩu tối đa 5 lần trong 15 phút; vượt quá thì phải chờ hết khoảng thời gian này rồi thử lại.
Nếu quên mật khẩu hiện tại, dùng quy trình khôi phục ở mục 1.3 hoặc nhờ quản trị viên đặt lại tại HT-03; không thể đổi tại
đây khi chưa nhập đúng mật khẩu hiện tại.

