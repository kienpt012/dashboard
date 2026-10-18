## 2.2 Nhóm Chỉ tiêu

Nhóm `Chỉ tiêu` gồm nơi quản lý các bộ chỉ tiêu, danh mục và hồ sơ từng chỉ tiêu, đề xuất chỉ tiêu mới, duyệt báo cáo số liệu và báo cáo tổng hợp.

### CT-01 · Bộ chỉ tiêu

**Đường dẫn:** menu `Chỉ tiêu` › `Bộ chỉ tiêu` (`/admin/bo-chi-tieu`) · **Vai trò:** tất cả xem được; quản trị, lãnh đạo, văn thư tạo, sửa bộ; quản trị, lãnh đạo nạp bộ mẫu.

Bộ chỉ tiêu gom các chỉ tiêu cùng một văn bản giao hoặc cùng mục đích theo dõi — ví dụ chỉ tiêu KT-XH Thành phố giao theo Quyết định 333/QĐ-UBND, bộ chỉ tiêu thống kê theo Thông tư 148/2026/TT-BTC.

![Bộ chỉ tiêu](anh/ct-01.png)

1. **Năm và phạm vi** — chọn năm; `Đang dùng` hoặc `Tất cả` (gồm bộ đã ngừng sử dụng).
2. **`Thư viện mẫu`** — các bộ chỉ tiêu mẫu nạp sẵn được cho mọi xã, phường.
3. **`Tạo bộ chỉ tiêu`.**
4. **Số tổng hợp** — số bộ đang dùng, số chỉ tiêu, đã có số liệu, có nguy cơ, quá hạn trong năm.
5. **Tên bộ** — bấm để mở **Danh mục chỉ tiêu** (CT-02) đã lọc theo bộ; biểu tượng ⋮ mở menu của bộ.
6. **Loại, cấp giao, mã bộ và căn cứ** — loại: `Kế hoạch – thực hiện`, `Chấm điểm`, `Nhiệm vụ`, `Thống kê` (phụ lục D).
7. **`Văn bản giao`** — văn bản trong kho gắn với bộ; bấm để xem văn bản. Mỗi chỉ tiêu của bộ mở được đúng dòng của mình trong văn bản này (CT-06).
8. **Kết quả của bộ** — số chỉ tiêu, tiến độ (bộ chấm điểm ghi điểm đạt trên điểm tối đa, bộ thống kê ghi số chỉ tiêu đã có số liệu), số chỉ tiêu có chỉ đạo, đã đánh giá; thanh màu chia theo tình trạng.

**Menu ⋮ của bộ:** `Sửa`; `Tính lại chỉ tiêu tự tính` (tính lại ngay các chỉ tiêu tự tính của bộ, kèm bảng lưu ý nếu thiếu dữ liệu); `Hiện trên trình chiếu` / `Ẩn khỏi trình chiếu` (DH-03); `Ngừng sử dụng` / `Dùng lại` — bộ ngừng sử dụng ẩn khỏi trung tâm điều hành và trình chiếu, chỉ tiêu vẫn được giữ.

#### Sửa bộ chỉ tiêu, gắn văn bản giao

1. Bấm ⋮ ở góc thẻ bộ, chọn `Sửa`.
2. Sửa thông tin như hình dưới. Để mở được văn bản giao đúng dòng của từng chỉ tiêu, chọn văn bản tại `Văn bản giao (trong kho)` (văn bản phải tải vào **Kho văn bản** trước, DL-02).
3. Bấm `Lưu`. Hệ thống tự tìm dòng của từng chỉ tiêu trong văn bản khi có người mở hồ sơ.

![Sửa bộ chỉ tiêu](anh/ct-01-sua.png)

1. **`Tên bộ chỉ tiêu`** — bắt buộc.
2. **`Cấp giao`** — `Trung ương giao`, `Tỉnh/Thành phố giao`, `Địa phương tự đặt`.
3. **`Căn cứ`** — số, ngày, cơ quan ban hành văn bản giao.
4. **`Văn bản giao (trong kho)`** — văn bản để định vị nguồn của chỉ tiêu.
5. **`Mô tả`.**
6. **`Thứ tự hiển thị`, `Hiện trên trình chiếu`, `Đang sử dụng`.**
7. **`Lưu`.**

> Khi tạo bộ mới, biểu mẫu có thêm `Mã bộ` (chữ in hoa không dấu, số, gạch ngang), `Loại`, `Năm` và `Điểm tối đa` (bộ chấm điểm). Sau khi tạo, thêm chỉ tiêu cho bộ tại CT-02, hoặc tải văn bản giao lên DL-02 để AI đề xuất chỉ tiêu (mục 3.4).

#### Nạp bộ chỉ tiêu mẫu

1. Bấm `Thư viện mẫu`. Khung bên phải liệt kê các bộ mẫu: căn cứ, mô tả, phạm vi áp dụng, số chỉ tiêu, số chỉ tiêu tự tính, số bảng dữ liệu đi kèm.
2. Chọn năm áp dụng ở cuối thẻ mẫu, bấm `Nạp`. Hệ thống tạo bộ, các chỉ tiêu và bảng dữ liệu cần cho chỉ tiêu tự tính; phòng chủ trì, phòng phối hợp gán theo vai trò của từng phòng ban đã khai báo ở **Thiết lập địa phương** (HT-01) và **Phòng ban** (HT-02); kiểm tra lại sau khi nạp.
3. Mẫu đã nạp cho năm nào thì có nhãn `Đã nạp <năm>`, nút `Nạp` cho năm đó bị khoá.

![Thư viện bộ chỉ tiêu mẫu](anh/ct-01-mau.png)

1. **Thẻ bộ mẫu** — tên, loại, căn cứ, mô tả.
2. **Nhãn** — cấp giao, phạm vi áp dụng, số chỉ tiêu, số chỉ tiêu tự tính, số bảng dữ liệu, năm đã nạp.
3. **Năm và nút `Nạp`** — chỉ quản trị, lãnh đạo.

### CT-02 · Danh mục chỉ tiêu

**Đường dẫn:** menu `Chỉ tiêu` › `Danh mục chỉ tiêu` (`/admin/targets`); với tài khoản thuộc một phòng, menu ghi `Chỉ tiêu của phòng` · **Vai trò:** tất cả, phạm vi theo mục 1.2; quản trị, lãnh đạo thêm, sửa, lưu trữ chỉ tiêu.

Danh mục liệt kê mọi chỉ tiêu trong phạm vi được xem, lọc theo năm, bộ, phòng, tình trạng; bấm tên chỉ tiêu để mở **Hồ sơ chỉ tiêu** (CT-06).

![Danh mục chỉ tiêu](anh/ct-02.png)

1. **`Xuất Excel`, `Nhập Excel`, `Thêm chỉ tiêu`** — xuất danh mục đang lọc ra Excel; `Nhập Excel` mở DL-03; `Thêm chỉ tiêu` dành cho quản trị, lãnh đạo.
2. **Tìm kiếm và lọc** — mã, tên, người phụ trách; `Năm`, `Bộ chỉ tiêu` (có lựa chọn `Không thuộc bộ nào`), `Phòng ban`, `Loại`, `Tình trạng`, `Người phụ trách` (`Tôi phụ trách`, `Chưa giao người`).
3. **`Đang theo dõi` / `Lưu trữ`** — chuyển sang danh sách chỉ tiêu đã lưu trữ.
4. **Dấu `+`** — mở rộng dòng để xem loại, cấp giao, kỳ báo cáo, hạn, chiều đánh giá, số văn bản chỉ đạo, đánh giá, chỉ tiêu con, phòng phối hợp, trạng thái trang công khai, bộ, nhóm và số liệu gần nhất.
5. **`Chỉ tiêu`** — tên (bấm để mở CT-06), mã hệ thống, mã và số thứ tự theo văn bản giao.
6. **`Phụ trách`** — phòng chủ trì và chuyên viên phụ trách.
7. **`Kế hoạch`, `Thực hiện`** — chỉ tiêu giao và số liệu chính thức gần nhất kèm thời điểm.
8. **`Tiến độ`, `Tình trạng`** — chấm vàng có số là số báo cáo đang chờ duyệt của chỉ tiêu.
9. **Menu ⋮ của dòng** — `Mở hồ sơ`, `Báo cáo số liệu`, `Sửa`, `Hiển thị trên trang công khai` / `Ẩn khỏi trang công khai`, `Cập nhật bản công khai`, `Lưu trữ` / `Khôi phục`; mục hiện theo vai trò.

Bấm tiêu đề cột để sắp xếp. Bộ lọc được giữ trên địa chỉ trang, nên có thể gửi đường dẫn cho đồng nghiệp để mở đúng danh sách đã lọc.

#### Thêm chỉ tiêu

1. Bấm `Thêm chỉ tiêu`.
2. Điền biểu mẫu; mục có dấu \* là bắt buộc.
3. Bấm `Tạo chỉ tiêu`. Chỉ tiêu mới ở tình trạng chưa giao người; trưởng phòng chủ trì giao chuyên viên tại hồ sơ (CT-06).

![Biểu mẫu thêm chỉ tiêu](anh/ct-02-them.png)

1. **`Tên chỉ tiêu`** — 3 đến 300 ký tự.
2. **`Mô tả`.**
3. **`Bộ chỉ tiêu`, `Loại`** — loại `Kế hoạch – thực hiện`, `Chấm điểm`, `Nhiệm vụ`, `Thống kê`.
4. **`Phòng chủ trì`, `Phòng phối hợp`.**
5. **`Giá trị kế hoạch`, `Đơn vị tính`** — số dùng để tính tiến độ.
6. **`Chỉ tiêu ghi bằng chữ`, `Chiều đánh giá`** — ghi đúng câu chữ của văn bản giao (ví dụ "Phấn đấu đạt 100%"); `Càng cao càng tốt` hoặc `Càng thấp càng tốt` (ví dụ tỷ lệ hộ nghèo).
7. **`Kỳ báo cáo`, `Năm kế hoạch`.**
8. **`Hạn hoàn thành`, `Trọng số`** — hạn phải thuộc năm kế hoạch; trọng số dùng khi tính tiến độ bình quân.
9. **`Mã, nhóm và hiển thị công khai`** — mở thêm: mã theo văn bản, nhóm chỉ tiêu, nổi bật và thứ tự trên trang công khai.
10. **`Tạo chỉ tiêu`.**

#### Lưu trữ và khôi phục chỉ tiêu

1. Ở menu ⋮ của dòng, chọn `Lưu trữ`, nhập lý do (mặc định "Kết thúc kỳ kế hoạch"), xác nhận. Chỉ tiêu chuyển sang danh sách `Lưu trữ`, không còn tính vào tiến độ và không nhận báo cáo; số liệu cũ được giữ. Chỉ tiêu còn báo cáo chờ duyệt thì chưa lưu trữ được; cần duyệt hoặc trả lại các báo cáo đó trước.
2. Muốn dùng lại: chọn `Lưu trữ` ở góc phải bộ lọc, mở menu ⋮ của dòng, chọn `Khôi phục`.

#### Hiển thị chỉ tiêu trên trang công khai

Quản trị, lãnh đạo chọn `Hiển thị trên trang công khai` ở menu ⋮ (chỉ khi chỉ tiêu đã có số liệu chính thức). Khi số liệu thay đổi, phần mở rộng của dòng ghi `Có thay đổi chưa công bố`; chọn `Cập nhật bản công khai` để người dân thấy số mới. Xem thêm ND-02 và mục 3.8.
