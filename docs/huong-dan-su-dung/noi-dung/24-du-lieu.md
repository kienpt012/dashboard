## 2.3 Nhóm Dữ liệu

Nhóm `Dữ liệu` gồm kho số liệu nghiệp vụ để chỉ tiêu tự tính, kho văn bản (văn bản giao, chỉ đạo, minh chứng) có AI đọc và đề xuất chỉ tiêu, và màn hình nhập số liệu hàng loạt bằng Excel.

### DL-01 · Kho dữ liệu

**Đường dẫn:** menu `Dữ liệu` › `Kho dữ liệu` (`/admin/kho-du-lieu`) · **Vai trò:** tất cả xem được; quản trị, lãnh đạo, văn thư tạo bảng mới.

Kho dữ liệu lưu số liệu nghiệp vụ theo dòng — ví dụ số hồ sơ thủ tục hành chính từng tháng, các cuộc họp, tin bài. Chỉ tiêu tự tính lấy số từ các bảng này theo công thức, nên cập nhật bảng là cập nhật chỉ tiêu.

![Kho dữ liệu](anh/dl-01.png)

1. **`Tạo bảng dữ liệu`** — khai báo bảng mới: tên, mã bảng, phòng quản lý, chu kỳ cập nhật, cách thu thập và các cột.
2. **Ô tìm kiếm** — theo tên, mã bảng hoặc phòng quản lý.
3. **Lọc loại bảng** — `Tất cả`, `Dữ liệu hệ thống` (hệ thống tự ghi, ví dụ phản ánh của người dân), `Tự khai báo` (cán bộ nhập).
4. **Tên và mã bảng** — bấm để mở **Bảng dữ liệu** (DL-05).
5. **`Số dòng`, `Dữ liệu mới nhất`, `Chu kỳ`** — kiểm tra bảng có được cập nhật đúng chu kỳ không.
6. **`Chỉ tiêu dùng`** — số chỉ tiêu tự tính từ bảng; rê chuột để xem danh sách.
7. **`Loại`** — `Hệ thống` hoặc `Tự khai báo`.

### DL-05 · Bảng dữ liệu

**Đường dẫn:** bấm tên bảng ở DL-01 (`/admin/kho-du-lieu/<mã bảng>`) · **Vai trò:** tất cả xem được; trưởng phòng, chuyên viên của phòng quản lý cùng quản trị, lãnh đạo, văn thư thêm, sửa dòng.

![Bảng dữ liệu](anh/dl-05.png)

1. **Tên bảng và loại** — `Tự khai báo` hoặc `Dữ liệu hệ thống`.
2. **Mã bảng, phòng quản lý, số dòng, thời điểm có dữ liệu mới nhất.**
3. **`Sửa cấu trúc`** — đổi thông tin bảng, thêm, sửa cột (quản trị, lãnh đạo, văn thư).
4. **`Tải mẫu Excel`, `Nhập Excel`** — tải tệp mẫu đúng cột của bảng, điền nhiều dòng rồi nhập một lần.
5. **`Thêm dòng`** — nhập một dòng dữ liệu.
6. **Các thẻ** — `Dữ liệu`, `Cấu trúc` (mã cột, nhãn, kiểu, bắt buộc, giá trị danh mục), `Chỉ tiêu dùng` (chỉ tiêu tự tính từ bảng, bấm để mở CT-06), `Thông tin` (hệ thống nguồn, chu kỳ cập nhật, cách thu thập, mô tả).
7. **Sửa, xoá dòng** — biểu tượng bút và thùng rác ở cuối dòng; xoá có hỏi xác nhận.

#### Cập nhật số liệu cho chỉ tiêu tự tính

1. Mở bảng nguồn — từ DL-01, hoặc bấm liên kết `Nguồn` trong khung `Cách tính` của hồ sơ chỉ tiêu (CT-06).
2. Bấm `Thêm dòng`, nhập các cột (cột bắt buộc có dấu \*), bấm `Lưu`. Sửa dòng sai bằng biểu tượng bút.
3. Nhiều dòng một lúc: bấm `Tải mẫu Excel`, điền tệp, bấm `Nhập Excel` và kéo tệp vào.
4. Hệ thống tính lại ngay các chỉ tiêu dùng bảng này và ghi một báo cáo tự tính vào hồ sơ từng chỉ tiêu, nêu người đã cập nhật dữ liệu.

> Bảng `Dữ liệu hệ thống` do hệ thống tự ghi (ví dụ phản ánh của người dân), không thêm, sửa tay được.

### DL-02 · Kho văn bản

**Đường dẫn:** menu `Dữ liệu` › `Kho văn bản` (`/admin/documents`) · **Vai trò:** tất cả xem được; quản trị, lãnh đạo, văn thư, trưởng phòng, chuyên viên tải lên và sửa thông tin; chỉ quản trị xoá.

Kho văn bản lưu văn bản giao chỉ tiêu, văn bản chỉ đạo và minh chứng. Văn bản tải lên được hệ thống đọc chữ (cả bản quét), ghi vị trí từng dòng để mở đúng chỗ khi tra cứu, và — nếu được bật — AI đọc để đề xuất chỉ tiêu.

![Kho văn bản](anh/dl-02.png)

1. **`Tải văn bản lên`.**
2. **Tìm kiếm và lọc** — theo trích yếu, số hiệu, mã, tên tệp; lọc `Trạng thái` và `Phòng liên quan`.
3. **Văn bản** — trích yếu; dòng dưới ghi mã văn bản (VB-năm-số), số hiệu và tên tệp. Bấm để mở **Xác minh trích xuất** (DL-04).
4. **`Trạng thái`** — `Chờ xử lý`, `Đang xử lý`, `Đã xử lý` hoặc `Lỗi xử lý` (rê chuột để xem lỗi).
5. **`Đề xuất`** — số chỉ tiêu AI đề xuất từ văn bản.
6. **`Tải lên`** — người tải và thời điểm.
7. **Menu dòng** — `Xác minh trích xuất`, `Tải tệp gốc`, `Sửa thông tin`, `Xoá` (chỉ quản trị).

#### Tải văn bản lên

1. Bấm `Tải văn bản lên`.
2. Kéo tệp vào khung hoặc bấm để chọn: PDF (kể cả bản quét), Word (.docx), Excel (.xlsx) hoặc ảnh chụp JPEG, PNG, WEBP; tối đa 25 MB mỗi tệp.
3. Nhập `Trích yếu` (bỏ trống thì hệ thống lấy theo tên tệp) và các thông tin còn lại.
4. Chọn bật hoặc tắt `AI tự đề xuất chỉ tiêu từ văn bản này`.
5. Bấm `Tải lên`. Hệ thống mở **Xác minh trích xuất** (DL-04) của văn bản vừa tải; văn bản ở trạng thái `Chờ xử lý`, rồi `Đang xử lý` trong lúc hệ thống đọc; văn bản dài, bản quét cần vài phút.

![Hộp tải văn bản lên](anh/dl-02-tai-len.png)

1. **Khung chọn tệp.**
2. **`Trích yếu`** — từ 3 đến 300 ký tự.
3. **`Loại văn bản`, `Số hiệu`, `Cơ quan ban hành`, `Ngày ban hành`.**
4. **`Năm áp dụng`, `Phòng liên quan`.**
5. **`Ghi chú`.**
6. **`AI tự đề xuất chỉ tiêu từ văn bản này`** — bật với văn bản giao chỉ tiêu mới. Tắt khi văn bản chỉ để lưu, tra cứu và định vị nguồn (ví dụ phụ lục giao chỉ tiêu cho nhiều xã, phường đã có chỉ tiêu trong hệ thống); vẫn chạy trích xuất sau được tại DL-04.
7. **`Tải lên`.**

#### Sửa thông tin văn bản

Ở menu cuối dòng, chọn `Sửa thông tin`; sửa trích yếu, loại, số hiệu, cơ quan, ngày ban hành, năm, phòng liên quan, ghi chú rồi bấm `Lưu`. Tệp đã tải không thay được — muốn thay tệp, tải văn bản mới. Mọi lần sửa được ghi vào **Nhật ký hệ thống** (HT-05).

> Văn bản đã tải vào kho dùng được ở nhiều nơi: làm `Văn bản giao` của bộ chỉ tiêu (CT-01) hoặc chỉ tiêu, làm văn bản chỉ đạo, minh chứng báo cáo (CT-06).

### DL-04 · Xác minh trích xuất

**Đường dẫn:** bấm tên văn bản ở DL-02 (`/admin/documents/<mã hồ sơ>`) · **Vai trò:** tất cả xem được; xử lý đề xuất theo quyền ở mục 3.4.

Màn hình đặt bản gốc của văn bản cạnh các chỉ tiêu AI đề xuất, để cán bộ đối chiếu từng đề xuất trước khi trình, duyệt. Đề xuất của AI không bao giờ tự thành chỉ tiêu chính thức.

![Xác minh trích xuất](anh/dl-04.png)

1. **`Tệp gốc`, `Trích xuất lại`** — tải tệp; yêu cầu AI đọc lại văn bản (có hỏi xác nhận). Khi AI đang chạy, nút `Dừng trích xuất` hiện thay; kết quả chưa hoàn tất sẽ không được áp dụng.
2. **`Bản gốc` / `Chữ đã đọc`** — xem hình trang văn bản hoặc phần chữ hệ thống đọc được (dùng để kiểm tra bản quét có đọc đúng không).
3. **`Về dòng tô sáng`** — đưa khung xem về đoạn của đề xuất đang chọn.
4. **Đoạn tô sáng "Đề xuất lấy từ đây"** — bấm vào một thẻ đề xuất, bản gốc tự chuyển đúng trang và tô đoạn văn AI đã dựa vào.
5. **Lọc đề xuất** — `Chờ xử lý`, `Đã duyệt`, `Từ chối`, `Tất cả`.
6. **Thẻ đề xuất** — tên chỉ tiêu, mục tiêu, kỳ báo cáo, phòng chủ trì, năm, hạn, căn cứ; góc phải ghi trạng thái (`Chưa trình`, `Chờ duyệt`…).
7. **Nhãn của thẻ** — độ tin cậy, `Chỉ tiêu mới` hoặc `Cập nhật số liệu`, trang lấy đề xuất.
8. **Nút xử lý** — `Sửa` (hiệu chỉnh trước khi trình), `Trình`, `Từ chối` (kèm lý do), `Duyệt`; nút hiện theo vai trò.
9. **`Có thể trùng`** — đề xuất giống một chỉ tiêu đã có; kiểm tra kỹ trước khi duyệt để tránh tạo trùng.

#### Đối chiếu và xử lý đề xuất

1. Bấm từng thẻ đề xuất; đọc đoạn tô sáng ở bản gốc, so với tên, mục tiêu, kỳ báo cáo, phòng chủ trì trên thẻ.
2. Sai hoặc thiếu: bấm `Sửa`, chỉnh rồi lưu (thẻ có nhãn `Đã hiệu chỉnh`).
3. Đúng: bấm `Trình` để gửi lãnh đạo, hoặc `Duyệt` nếu có quyền; không phải chỉ tiêu: bấm `Từ chối` và ghi lý do.
4. Chỉ tiêu được duyệt xuất hiện ở **Danh mục chỉ tiêu** (CT-02), có liên kết về đúng dòng của văn bản này. Toàn bộ quy trình xem mục 3.4.

> Văn bản giao chỉ tiêu cho nhiều xã, phường (mỗi đơn vị một phần mở đầu bằng "ĐƠN VỊ: …"): AI chỉ đọc phần của địa phương mình; khung `Lượt xử lý` cuối trang ghi rõ các trang đã đọc. Nếu không nhận ra phần của địa phương, AI đọc toàn văn bản và khung `Lượt xử lý` cũng ghi lại điều này — kiểm tra `Tên ngắn` tại **Thiết lập địa phương** (HT-01).

### DL-03 · Nhập số liệu Excel

**Đường dẫn:** menu `Dữ liệu` › `Nhập số liệu Excel` (`/admin/imports`); với trưởng phòng, chuyên viên menu ghi `Nộp báo cáo Excel` · **Vai trò:** quản trị, lãnh đạo, trưởng phòng, chuyên viên.

Dùng khi cần cập nhật số liệu nhiều chỉ tiêu của một phòng cùng lúc bằng phiếu Excel do hệ thống phát hành. Các bước chi tiết, cách điền phiếu và xử lý lỗi xem mục 3.5.

![Nhập số liệu Excel](anh/dl-03.png)

1. **Bước 1 `Tải phiếu hiện trạng`** — chọn năm (lãnh đạo, quản trị chọn thêm `Phòng ban`), bấm `Tải phiếu Excel`.
2. **Bước 2 `Tải lên và đối soát`** — kéo phiếu đã điền vào khung, bấm `Đối soát`. Đối soát chỉ kiểm tra, chưa đổi số liệu.
3. **Bước 3 `Ghi nhận`** (với trưởng phòng, chuyên viên là `Gửi duyệt`) — lãnh đạo, quản trị bấm `Ghi nhận số liệu` (số liệu chính thức ngay); trưởng phòng, chuyên viên bấm `Gửi số liệu` (mỗi dòng thành một báo cáo chờ duyệt ở CT-04).
4. **`Kết quả đối soát`** — `Tổng dòng`, `Có thay đổi`, `Không đổi`, `Lỗi` và bảng số cũ → số mới hoặc nội dung lỗi từng dòng.
5. **`Lịch sử nhập`** — các lượt nhập với tệp, phòng, người nộp, số dòng, trạng thái, thời gian.
