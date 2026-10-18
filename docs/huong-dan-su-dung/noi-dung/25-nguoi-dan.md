## 2.4 Nhóm Người dân

### ND-01 · Phản ánh

**Đường dẫn:** menu `Người dân` › `Phản ánh` (`/admin/feedback`); với tài khoản thuộc một phòng, menu ghi `Phản ánh của phòng` · **Vai trò:** tất cả; chuyên viên chỉ thấy hồ sơ được giao trực tiếp, trưởng phòng và người xem chỉ thấy hồ sơ của phòng mình.

Theo dõi phản ánh do người dân gửi qua cổng công khai; phân loại, phân công, xử lý và duyệt kết quả trên cùng một hồ sơ.
Quyền chung theo vai trò xem mục 1.2; thao tác gửi và tra cứu dành cho người dân xem mục 2.6.

![Danh sách phản ánh người dân](anh/nd-01.png)

1. **Thống kê** — số hồ sơ trong phạm vi được xem hoặc đơn vị đang chọn; không thay đổi theo ô tìm kiếm và các bộ lọc còn lại. `Đang xử lý` gồm hồ sơ đã phân công, đang xử lý, chờ người dân bổ sung và đang xem xét lại; `Hài lòng` là điểm đánh giá bình quân trên thang 5.
2. **Tìm kiếm và bộ lọc** — tìm theo mã, tiêu đề, nội dung; lọc theo người được giao, đề nghị xem xét lại, quá hạn bổ sung, trạng thái, ưu tiên và nhóm vấn đề. Vai trò xem toàn địa phương có thêm bộ lọc `Đơn vị`.
3. **Danh sách hồ sơ** — xem mã, nhóm vấn đề, ưu tiên, trạng thái, đơn vị và cán bộ xử lý, hạn, thời điểm tiếp nhận; bấm một dòng để mở chi tiết.

#### Tìm phản ánh cần xử lý
1. Nhập từ khóa vào ô `Mã, tiêu đề, nội dung`, nhấn `Enter`. Người xem chỉ có ô `Mã phản ánh`.
2. Chọn `Giao cho tôi` để xem hồ sơ giao trực tiếp cho mình; chọn `Xem xét lại` để xem **đề nghị của người dân đang chờ quyết định**; chọn `Quá hạn bổ sung` để xem hồ sơ đang chờ người dân nhưng đã hết hạn.
3. Chọn thêm `Trạng thái`, `Ưu tiên`, `Nhóm vấn đề` hoặc `Đơn vị` khi cần. Bấm dòng hồ sơ để xem nội dung.

> Bộ chọn `Xem xét lại` khác với trạng thái cùng tên: đề nghị đang chờ chưa làm đổi trạng thái hồ sơ; chỉ khi được chấp nhận, hồ sơ mới chuyển sang `Xem xét lại`. Ô thống kê `Quá hạn` tính quá hạn phản hồi hoặc xử lý; số quá hạn bổ sung được ghi riêng ở dòng phụ.

#### Xem nội dung và lịch sử hồ sơ

![Chi tiết phản ánh](anh/nd-01-chi-tiet.png)

1. **Thông tin hồ sơ** — người gửi, địa điểm, đơn vị và cán bộ xử lý, hạn, nội dung phản ánh; kết quả, lý do không tiếp nhận hoặc đề nghị xem xét lại xuất hiện khi hồ sơ có các thông tin đó.
2. **Các thẻ chi tiết** — `Trao đổi` phân biệt nội dung `Người dân thấy` với ghi chú `Nội bộ`; `Tệp` chứa minh chứng để tải về; `Lịch sử` ghi các bước đã thực hiện.
3. **Thao tác** — các nút ở cuối ngăn chi tiết thay đổi theo trạng thái hồ sơ và quyền của người đang đăng nhập.

Hạn hiển thị là `Hạn phản hồi` khi chưa có phản hồi đầu tiên, `Hạn xử lý` sau khi đã phản hồi, hoặc `Hạn bổ sung` khi đang
chờ người dân. Người xem được xem thông tin theo dõi nhưng nội dung chi tiết, thông tin cá nhân, ghi chú nội bộ và tệp bị giới hạn.

| Trạng thái | Ý nghĩa và bước tiếp theo |
|---|---|
| `Mới tiếp nhận` | Người dân đã gửi phản ánh; đầu mối rà soát, phân loại và phân công. |
| `Đã phân công` | Đã giao đơn vị, có thể đã giao cán bộ; người xử lý bắt đầu thực hiện. |
| `Đang xử lý` | Đang xác minh, trao đổi và chuẩn bị kết quả. |
| `Chờ người dân bổ sung` | Đã yêu cầu thêm thông tin; theo dõi hạn bổ sung. |
| `Chờ duyệt kết quả` | Người xử lý đã trình; người có thẩm quyền duyệt hoặc trả lại. |
| `Đã có kết quả` | Kết quả đã được duyệt và người dân có thể xem khi tra cứu; chưa đồng nghĩa đã công khai rộng rãi. |
| `Đã đóng` | Hồ sơ kết thúc sau khi có kết quả, hoặc do quá hạn bổ sung; xem lịch sử để biết lý do. |
| `Không tiếp nhận` | Quản trị hoặc lãnh đạo quyết định không tiếp nhận và đã ghi lý do. |
| `Xem xét lại` | Hồ sơ kết thúc đã được mở lại để xử lý tiếp. |

#### Phân loại phản ánh mới
1. Quản trị, lãnh đạo, văn thư hoặc trưởng phòng mở hồ sơ `Mới tiếp nhận` hoặc `Đã phân công`, bấm `Phân loại`.
2. Chọn `Nhóm vấn đề`, `Mức ưu tiên`; nhập `Ghi chú` từ 3 đến 1.000 ký tự.
3. Bấm `Xác nhận`. Thao tác này cập nhật phân loại, không đổi trạng thái hồ sơ.

> Đổi mức ưu tiên có thể làm tính lại hạn xử lý đã có. Các mức gồm `Khẩn`, `Cao`, `Bình thường`, `Thấp`.

#### Phân công đơn vị và cán bộ xử lý

![Phân công xử lý phản ánh|75](anh/nd-01-phan-cong.png)

1. **Đơn vị và cán bộ** — bắt buộc chọn `Đơn vị xử lý`; có thể chọn thêm `Cán bộ xử lý` thuộc đơn vị đó.
2. **Ưu tiên và thời hạn** — chọn `Mức ưu tiên`, kiểm tra `Hạn xử lý`; hạn phải ở tương lai.
3. **Ghi chú phân công** — nêu yêu cầu giao việc, từ 3 đến 1.000 ký tự.

1. Quản trị, lãnh đạo, văn thư hoặc trưởng phòng bấm `Phân công` ở hồ sơ cần giao. Trưởng phòng chỉ phân công trong phòng mình.
2. Điền các thông tin trên rồi bấm `Xác nhận`.
3. Hồ sơ chuyển sang `Đã phân công`. Nếu đang `Chờ người dân bổ sung`, việc phân công lại giữ nguyên trạng thái chờ bổ sung.

Không bắt buộc chỉ định cán bộ ngay khi giao đơn vị. Chuyên viên chỉ thấy và xử lý hồ sơ sau khi được giao trực tiếp.
Khi chưa có hạn, hệ thống tính từ cấu hình thời hạn và mức ưu tiên; người phân công có thể chọn hạn cụ thể.

#### Bắt đầu xử lý và trao đổi với người dân
1. Cán bộ được giao hoặc trưởng phòng mở hồ sơ `Đã phân công` hay `Xem xét lại`, bấm `Bắt đầu xử lý`, rồi `Xác nhận`.
2. Để trao đổi, bấm `Thêm trao đổi`; chọn `Gửi người dân` hoặc `Ghi chú nội bộ` tại `Phạm vi`, nhập `Nội dung`, rồi `Xác nhận`.
3. Khi đã gọi điện hoặc gửi email, bấm `Ghi nhận liên hệ`; chọn `Kênh`, `Kết quả`, nhập `Ghi chú`, rồi `Xác nhận`.

`Gửi người dân` chỉ có khi hồ sơ đang xử lý, chờ bổ sung hoặc xem xét lại. Ghi chú nội bộ không hiển thị trong kết quả tra cứu
của người dân. Ghi nhận `Đã liên hệ được` hoặc `Đã gửi tin nhắn` được tính là phản hồi đầu tiên; `Không bắt máy` và
`Thông tin liên hệ sai` chưa được tính. Quản trị và lãnh đạo cũng có quyền thực hiện các bước xử lý này.

#### Yêu cầu người dân bổ sung thông tin
1. Trong hồ sơ `Đang xử lý` hoặc `Xem xét lại`, bấm `Yêu cầu bổ sung`.
2. Nhập `Nội dung cần người dân bổ sung` từ 5 đến 3.000 ký tự, nêu rõ thông tin còn thiếu; bấm `Xác nhận`.
3. Hồ sơ chuyển sang `Chờ người dân bổ sung`, có `Hạn bổ sung` theo cấu hình. Theo dõi câu trả lời tại thẻ `Trao đổi`.

Khi người dân gửi nội dung bổ sung qua tra cứu, hồ sơ trở về `Đang xử lý`; hạn xử lý được cộng thêm thời gian đã chờ.
Nếu hết hạn mà chưa bổ sung, quản trị, lãnh đạo hoặc trưởng phòng có thể bấm `Kết thúc do quá hạn bổ sung`, ghi chú nếu cần,
rồi `Xác nhận`. Hồ sơ chuyển sang `Đã đóng`; trường hợp này chưa có kết quả chuyên môn để đánh giá hoặc công khai.

#### Trình kết quả xử lý
1. Trong hồ sơ `Đang xử lý` hoặc `Xem xét lại`, bấm `Trình duyệt kết quả`.
2. Nhập `Kết quả xử lý` từ 10 đến 5.000 ký tự; bấm `Xác nhận`.
3. Hồ sơ chuyển sang `Chờ duyệt kết quả`. Chờ người có thẩm quyền xem xét; người trình không được tự duyệt kết quả mình trình.

#### Duyệt hoặc trả lại kết quả

![Hồ sơ chờ duyệt kết quả](anh/nd-01-duyet.png)

1. **Kết quả chờ duyệt** — đọc nội dung đã trình, đối chiếu phản ánh, trao đổi và minh chứng trước khi quyết định.
2. **Quyết định** — `Trả lại` để yêu cầu hoàn thiện hoặc `Duyệt kết quả` để chấp thuận.

1. Quản trị, lãnh đạo hoặc trưởng phòng mở hồ sơ `Chờ duyệt kết quả` trong phạm vi mình được xem.
2. Nếu kết quả đáp ứng yêu cầu, bấm `Duyệt kết quả`, nhập `Ghi chú` nếu cần, rồi `Xác nhận`. Hồ sơ chuyển sang `Đã có kết quả`; kết quả được đưa vào trao đổi người dân thấy.
3. Nếu cần sửa, bấm `Trả lại`, nhập `Lý do trả lại` từ 3 đến 2.000 ký tự, rồi `Xác nhận`. Hồ sơ trở về `Đang xử lý`; người xử lý hoàn thiện và trình lại.

#### Đóng hồ sơ hoặc không tiếp nhận
- Với hồ sơ `Đã có kết quả`, quản trị, lãnh đạo hoặc trưởng phòng bấm `Đóng hồ sơ`, ghi chú nếu cần, rồi `Xác nhận`.
- Khi người dân đánh giá kết quả đã duyệt, hồ sơ `Đã có kết quả` cũng chuyển sang `Đã đóng`.
- Với hồ sơ `Mới tiếp nhận` hoặc `Đã phân công` không được tiếp nhận, quản trị hoặc lãnh đạo bấm `Không tiếp nhận`, nhập `Lý do` từ 10 đến 2.000 ký tự, rồi `Xác nhận`.

#### Công khai kết quả đã duyệt

![Xem trước nội dung công khai|75](anh/nd-01-cong-khai.png)

1. **Nội dung xem trước** — kiểm tra tiêu đề, nội dung, kết quả và trao đổi công khai sau khi hệ thống tự ẩn thông tin cá nhân.
2. **Xác nhận kiểm tra** — chỉ chọn khi đã đọc và xác định nội dung không còn thông tin cá nhân.

1. Quản trị hoặc lãnh đạo mở hồ sơ `Đã có kết quả` hay `Đã đóng` có kết quả chuyên môn đã duyệt, bấm `Công khai`.
2. Đọc toàn bộ nội dung trong hộp `Công khai kết quả`. Hộp này dùng để xem trước, không có ô sửa nội dung.
3. Chọn `Đã kiểm tra, nội dung không còn thông tin cá nhân`, rồi bấm `Xác nhận`. Kết quả xuất hiện trên cổng công khai.
4. Khi cần gỡ, mở lại hồ sơ, bấm `Gỡ công khai`, rồi `Xác nhận`.

> [!CANH-BAO] Không công khai hồ sơ đang có đề nghị xem xét lại chờ quyết định hoặc hồ sơ đóng do quá hạn bổ sung. Hệ thống có ẩn thông tin tự động nhưng người công khai vẫn phải kiểm tra nội dung xem trước; nếu còn thông tin cá nhân, đóng hộp thoại để rà soát trước khi công khai.

#### Xem xét đề nghị mở lại hồ sơ
1. Chọn bộ lọc `Xem xét lại`, mở hồ sơ và đọc nội dung đề nghị của người dân.
2. Quản trị, lãnh đạo hoặc trưởng phòng bấm `Chấp nhận mở lại` hoặc `Từ chối đề nghị`; nhập `Lý do` từ 10 đến 2.000 ký tự, rồi `Xác nhận`.
3. Nếu chấp nhận, hồ sơ chuyển sang `Xem xét lại`, được tính lại hạn và gỡ công khai. Kiểm tra đơn vị, phân công lại cán bộ rồi tiếp tục xử lý. Nếu từ chối, hồ sơ giữ trạng thái kết thúc và lưu lý do quyết định.

Người có thẩm quyền còn có thể chủ động bấm `Mở lại` ở hồ sơ đã có kết quả/đã đóng, hoặc `Khôi phục hồ sơ` ở hồ sơ không tiếp
nhận, dù chưa có đề nghị của người dân. Mở lại xóa cán bộ đang được giao, kết quả và đánh giá hiện tại; lịch sử trước đó vẫn được giữ.

> Người dân được đề nghị xem xét lại tối đa 3 lần, trong 30 ngày từ lần có kết quả hoặc đóng hồ sơ gần nhất; không gửi thêm khi một đề nghị đang chờ quyết định. Cách người dân thực hiện xem mục 2.6.

### ND-02 · Trang công khai

**Đường dẫn:** menu `Người dân` › `Trang công khai` (`/admin/public-dashboard`) · **Vai trò:** quản trị hệ thống.

Dùng để sắp xếp nội dung cổng thông tin người dân, lưu bản nháp và công bố từng phiên bản. Người dân chỉ thấy phiên bản đã công bố; sửa bản nháp chưa làm thay đổi trang đang hiển thị.

![Trình dựng trang công khai](anh/nd-02.png)

1. **Quản lý phiên bản** — mở trang đang công bố, xem lịch sử, quản lý văn bản, lưu nháp và công bố.
2. **Khung thiết kế** — chọn cỡ màn hình, chuyển giữa `Bố cục` và `Xem trước`, thêm khối hoặc chọn mẫu trang.
3. **Bố cục bản nháp** — bấm chọn khối để sửa nội dung; kéo thanh tên khối để di chuyển, kéo cạnh phải, cạnh dưới hoặc góc dưới bên phải để đổi kích thước.
4. **Thiết lập trang** — tên bản nháp, màu sắc, độ rộng, bo góc, dải tiêu đề và chân trang.

#### Sắp xếp bố cục và thêm khối
1. Chọn `Máy tính`, `Máy tính bảng` hoặc `Điện thoại`. Mỗi cỡ màn hình có bố cục riêng; cần kiểm tra cả ba trước khi công bố.
2. Nếu cần bố cục có sẵn, bấm `Mẫu trang`, chọn `Minh bạch điều hành`, `Chỉ tiêu trọng tâm` hoặc `Thông tin và văn bản`, rồi xác nhận `Dùng mẫu`. Thao tác này thay thế bố cục và các khối của bản nháp đang sửa.
3. Bấm `Thêm khối`, chọn loại khối trong bảng dưới. Khối mới được thêm vào cuối cả ba bố cục.
4. Bấm vào khối; chỉnh `Tiêu đề khối` và các trường riêng trong bảng bên phải. Dùng `Nhân bản` để tạo bản sao hoặc `Xoá khối` rồi xác nhận `Xoá` để bỏ khối.
5. Chuyển sang `Xem trước`, kiểm tra chữ, số liệu, liên kết và chiều cao từng khối. Bấm `Lưu nháp` khi hoàn tất.

| Loại khối | Nội dung và lựa chọn chính |
|---|---|
| `Số liệu tổng quan` | Chọn `Số liệu hiển thị`: đơn vị có chỉ tiêu, chỉ tiêu công khai, đã hoàn thành, đúng tiến độ, tiến độ chung, năm |
| `Danh sách chỉ tiêu` | `Nguồn chỉ tiêu`: `Nổi bật`, `Tất cả` hoặc `Chọn lọc`; với `Chọn lọc`, chọn ít nhất một `Chỉ tiêu`; `Số mục tối đa` từ 1 đến 100 |
| `Tiến độ theo đơn vị` | Tiến độ các đơn vị từ số liệu đã công khai; `Số mục tối đa` từ 1 đến 24 |
| `Kết quả phản ánh` | Kết quả phản ánh đã công khai; `Số mục tối đa` từ 1 đến 24 |
| `Văn bản công khai` | Chọn các `Văn bản` đã công khai trong thư viện; `Số mục tối đa` từ 1 đến 30 |
| `Đoạn văn bản` | Nhập `Nội dung` giới thiệu hoặc thông báo, tối đa 8.000 ký tự |
| `Khối HTML` | Nội dung tùy biến bằng HTML và `Biến dữ liệu` lấy từ `Tổng quan`, `Chỉ tiêu` hoặc `Văn bản`; cần người có chuyên môn hỗ trợ |
| `Nút điều hướng` | Nhập `Mô tả`, `Nhãn nút`, `Liên kết`; liên kết phải là đường dẫn nội bộ hoặc địa chỉ HTTPS |

![Chọn số liệu của một khối](anh/nd-02-khoi.png)

1. **Khối đang chọn** — có viền chọn trên bố cục.
2. **Thuộc tính khối** — sửa tiêu đề, chọn số liệu hiển thị; các loại khối khác có trường tương ứng.

Trang cần từ 1 đến 40 khối; `Tên bản nháp` tối thiểu 3 ký tự. Nếu có cảnh báo thiếu nội dung hoặc màu chữ không đủ tương phản, sửa theo thông báo trước khi lưu và công bố. Phím tắt `Ctrl S` lưu bản nháp đang thay đổi.

#### Công bố bản nháp
1. Kiểm tra `Xem trước` ở cả ba cỡ màn hình; đối chiếu nội dung, số liệu và văn bản được phép đưa ra công khai.
2. Bấm `Công bố`. Nhập `Nội dung thay đổi` từ 3 đến 500 ký tự.
3. Bấm `Công bố` trong hộp thoại. Nếu còn thay đổi chưa lưu, hệ thống lưu bản nháp trước khi công bố.
4. Kiểm tra dòng `Đã công bố lần …`, rồi bấm `Mở trang` để xem kết quả ở cổng công khai.

Nếu xuất hiện `Bản nháp đã thay đổi ở nơi khác`, đọc thông báo trước khi chọn `Tải bản mới`. Việc tải bản mới có thể thay phần đang sửa trên máy. Nếu rời trang khi còn `Chưa lưu`, hệ thống hỏi `Rời trang` hoặc `Ở lại`.

#### Xem và khôi phục phiên bản

![Lịch sử công bố trang](anh/nd-02-lich-su.png)

1. **Các lần công bố** — ghi nội dung thay đổi, người công bố, thời điểm; bản hiện hành có nhãn `Đang hiển thị`.
2. **Khôi phục** — đưa phiên bản được chọn vào bản nháp.

1. Bấm `Lịch sử`.
2. Tìm lần công bố cần dùng, bấm `Khôi phục`, rồi xác nhận `Khôi phục`.
3. Kiểm tra lại bản nháp và các văn bản còn được công khai. Muốn người dân thấy bản đã khôi phục, thực hiện `Công bố` thành một lần mới.

> Khôi phục chỉ thay bản nháp. Phiên bản đang công bố giữ nguyên cho đến lần công bố tiếp theo.

#### Công khai và thu hồi văn bản

![Thư viện văn bản công khai](anh/nd-02-van-ban.png)

1. **Văn bản trong thư viện** — tên, mã, tệp gốc và tình trạng công khai.
2. **Thao tác từng văn bản** — `Công khai` đối với văn bản chưa công khai; `Cập nhật` và `Thu hồi` đối với văn bản đang công khai.

1. Bấm `Văn bản` trên đầu trang hoặc `Quản lý văn bản công khai` trong thuộc tính khối văn bản.
2. Tìm văn bản đã xử lý hoàn tất trong kho, bấm `Công khai`.
3. Kiểm tra `Tiêu đề công khai` (3–300 ký tự), nhập `Trích yếu` nếu cần (tối đa 2.000 ký tự).
4. Đọc tệp, chọn `Đã kiểm tra văn bản không chứa thông tin cá nhân, bí mật nhà nước`, rồi bấm `Công khai` trong hộp thoại.
5. Chọn văn bản này trong trường `Văn bản` của khối `Văn bản công khai`, kiểm tra bản xem trước rồi công bố trang. Chỉ công khai trong thư viện chưa đủ để văn bản xuất hiện trên cổng.

Để sửa tiêu đề hoặc trích yếu của bản công khai, bấm `Cập nhật`, sửa nội dung rồi bấm `Công khai`. Để ngừng cung cấp văn bản, bấm `Thu hồi` và xác nhận `Thu hồi`; liên kết công khai ngừng tải được ngay. Kiểm tra lại khối văn bản và công bố bố cục đã điều chỉnh khi cần.

> Thư viện nhận văn bản đã xử lý hoàn tất, thuộc các định dạng PDF, Word (.docx), Excel (.xlsx), ảnh JPEG, PNG hoặc WebP. Không mặc nhiên công khai mọi tệp trong Kho văn bản. Cách người dân xem và tải văn bản được trình bày tại mục 2.6.
