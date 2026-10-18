## Phụ lục C. Câu hỏi thường gặp và xử lý sự cố

#### Quên mật khẩu thì làm thế nào?
1. Ở màn hình đăng nhập, bấm `Quên mật khẩu?`, nhập `Tên đăng nhập hoặc email công vụ`. Nhập `Mã xác thực` 6 chữ số
   gửi về email công vụ, rồi đặt `Mật khẩu mới`.
2. Tài khoản không có email: nhờ quản trị viên mở `Tài khoản` (HT-03), sửa tài khoản và nhập `Đặt lại mật khẩu`.
   Sau khi đăng nhập, đổi mật khẩu tại hồ sơ cá nhân (HT-07).

#### Vì sao tôi không thấy một số menu, nút?
Menu và nút phụ thuộc vai trò (mục 1.2). Trưởng phòng, chuyên viên, người xem chỉ thấy số liệu của phòng mình; nút
`Duyệt` không hiện với báo cáo do chính mình gửi. Cần thêm quyền, liên hệ quản trị viên.

#### Số liệu trên màn hình chưa cập nhật?
Báo cáo chỉ thành số liệu chính thức khi đã được duyệt (hoặc tự thông qua). Báo cáo `Chờ duyệt` chưa làm đổi ô
`Thực hiện`. Chỉ tiêu `Tự tính` đổi khi bảng dữ liệu nguồn được cập nhật (DL-05). Tải lại trang để lấy số mới nhất.

#### Vì sao chỉ tiêu bị "Quá hạn" dù tôi chưa đến lượt báo cáo?
Tình trạng tính theo hạn hoàn thành của chỉ tiêu và tiến độ hiện có (mục 1.5), không chỉ theo việc đã báo cáo hay chưa.
Kiểm tra `Hạn hoàn thành` và số liệu kỳ gần nhất trong hồ sơ chỉ tiêu.

#### Vì sao báo cáo của tôi "Tự thông qua"?
Người duyệt không xử lý trong số ngày `Tự thông qua báo cáo sau` tại `Cấu hình` (mặc định 7 ngày, tính từ lúc gửi). Hệ thống duyệt thay để số liệu không bị
treo và ghi trách nhiệm người duyệt vào dòng thời gian của chỉ tiêu.

#### Không bấm được `Báo cáo số liệu`?
- Chỉ tiêu `Tự tính` lấy số từ kho dữ liệu, chỉ tiêu `Tổng hợp từ chỉ tiêu con` báo cáo ở từng chỉ tiêu con.
- Bạn đã có một báo cáo đang chờ duyệt cho chỉ tiêu này (nút ghi `Đang chờ duyệt`).
- Chỉ tiêu đã lưu trữ, hoặc bạn không thuộc phòng chủ trì, hoặc vai trò của bạn là văn thư, người xem.

#### Không chuyển được việc cho đồng nghiệp?
Chỉ người đang phụ trách mới chuyển được, và chỉ chuyển cho trưởng phòng, chuyên viên đang hoạt động của phòng chủ trì.
Số lần chuyển giới hạn theo `Số lần chuyển việc tối đa` tại `Cấu hình` (mặc định 1 lần, tính từ lần giao gần nhất). Hết lượt
chuyển, bấm `Trả về trưởng phòng` kèm lý do để trưởng phòng giao lại.

#### Tệp Excel bị từ chối khi nhập số liệu?
Dùng phiếu mẫu tải từ màn hình `Nhập số liệu Excel` (DL-03); tệp `.xlsx`, tối đa 5 MB và 5.000 dòng; không đổi tên cột,
không xoá cột mã chỉ tiêu.

#### Tải minh chứng lên bị báo lỗi?
Minh chứng nhận ảnh JPEG, PNG, WEBP hoặc tệp PDF, tối đa 10 MB mỗi tệp và 10 tệp mỗi lần. Văn bản Word, Excel: tải vào
`Kho văn bản` (DL-02) rồi chọn làm minh chứng dạng văn bản trong kho.

#### Nói "Hey Jarvis" mà Jarvis không xuất hiện?
1. Dùng Chrome hoặc Edge; địa chỉ phải là HTTPS hoặc `localhost` (truy cập bằng địa chỉ IP qua `http://` thì micro bị chặn).
2. Cho phép trang dùng micro (biểu tượng ổ khoá cạnh thanh địa chỉ).
3. Mở khung Jarvis › bánh răng: kiểm tra `Gọi bằng tên “Jarvis”` đang bật, xem `Micro nghe được gần nhất` có ghi lại
   câu bạn nói không. Nói rõ, gần micro, ngắt nhẹ sau chữ "Jarvis".

#### Jarvis trả lời chung chung?
Hỏi cụ thể đối tượng và phạm vi: tên chỉ tiêu hoặc mã, phòng, kỳ, năm (ví dụ "chỉ tiêu nào của Phòng Văn hóa – Xã hội
còn thiếu báo cáo quý III"). Jarvis chỉ trả lời trong phạm vi số liệu bạn được xem.

#### Mở văn bản giao mà không thấy dòng tô sáng, hoặc tô sai dòng?
- Văn bản Word, Excel không có hình trang: hệ thống mở nội dung đã đọc và tô màu câu của chỉ tiêu.
- Tô sai dòng hoặc "chưa tìm thấy": người có quyền bấm `Sai dòng? Chỉ lại` / `Chỉ vị trí` rồi bấm vào dòng đúng (mục 3.4).
- Văn bản giao cho nhiều xã, phường: hệ thống chỉ tìm trong phần của địa phương mình; kiểm tra `Tên ngắn` tại
  `Thiết lập địa phương` (HT-01) khớp với địa danh trên văn bản.

#### Văn bản hàng trăm trang mà AI chỉ đề xuất vài chỉ tiêu?
Với phụ lục giao chỉ tiêu cho nhiều đơn vị, AI chỉ đọc phần của địa phương mình (xem ghi chú của lượt trích xuất ở DL-04).
Văn bản chỉ để tra cứu thì tắt `AI tự đề xuất chỉ tiêu từ văn bản này` khi tải lên.

#### In hoặc xuất báo cáo thế nào?
Mở `Báo cáo tổng hợp` (CT-05), chọn năm, bộ chỉ tiêu, phòng, rồi bấm `Xuất Excel` hoặc `In báo cáo`. Danh mục chỉ tiêu
cũng xuất được Excel bằng `Xuất Excel` (CT-02).

#### Người dân mất mã bảo mật của phản ánh?
`Mã bảo mật` chỉ hiện một lần trên biên nhận; hệ thống không lưu mã này ở dạng đọc được nên cán bộ không xem lại hay cấp lại
được (CC-02). Người dân liên hệ bộ phận tiếp nhận, mô tả nội dung đã gửi; cán bộ tìm phản ánh theo mã phản ánh, tiêu đề hoặc
nội dung tại `Phản ánh` (ND-01), đối chiếu thông tin người gửi và liên hệ lại qua số điện thoại đã khai.

#### Chạy `start-ioc` báo lỗi Docker?
1. Mở Docker Desktop, đợi biểu tượng chuyển xanh rồi chạy lại `start-ioc.cmd`.
2. Docker Desktop báo lỗi khi khởi động: chọn `Quit` rồi mở lại (`start-ioc` tự dọn tệp kẹt của Docker). **Không** chọn
   khôi phục cài đặt gốc — thao tác này xoá dữ liệu.
3. Cổng 8080 bị chương trình khác chiếm: tắt chương trình đó, hoặc đổi `WEB_PORT` trong tệp `.env` rồi chạy lại.

#### Cài đặt trên máy khác có tự cập nhật phiên bản mới?
Có. Mỗi lần chạy `start-ioc.cmd`, trình khởi động lấy phiên bản mới nhất, cập nhật cơ sở dữ liệu và dữ liệu mẫu (có sao
lưu trước vào thư mục `backups`). Dữ liệu thật của địa phương không bao giờ bị thay.

## Phụ lục D. Thuật ngữ

| Thuật ngữ | Giải thích |
|---|---|
| Bộ chỉ tiêu | Tập chỉ tiêu cùng một văn bản giao hoặc cùng mục đích theo dõi (ví dụ chỉ tiêu KT-XH Thành phố giao năm 2026) |
| Loại bộ chỉ tiêu | `Kế hoạch – thực hiện` (so thực hiện với kế hoạch), `Chấm điểm` (cộng điểm theo thang), `Nhiệm vụ`, `Thống kê` (chỉ ghi số liệu, không có mục tiêu) |
| Cấp giao | `Trung ương giao`, `Tỉnh/Thành phố giao`, `Địa phương tự đặt` |
| Chỉ tiêu cha, chỉ tiêu con | Chỉ tiêu cha tổng hợp từ các chỉ tiêu con; báo cáo ở chỉ tiêu con |
| Chỉ tiêu tự tính | Chỉ tiêu lấy số từ bảng dữ liệu theo công thức, không nhập tay |
| Nguồn số liệu | Thẻ ghi số liệu lấy ở đâu, cơ quan nào cung cấp, cách lấy, yêu cầu minh chứng, hạn báo cáo |
| Kỳ báo cáo | Tháng, quý, 6 tháng hoặc năm, theo tần suất của chỉ tiêu |
| Hạn báo cáo | Ngày trong tháng cuối kỳ phải có báo cáo (mặc định ngày 20) |
| Minh chứng | Ảnh, tệp PDF, đường dẫn hoặc văn bản trong kho chứng minh số liệu báo cáo |
| Chỉ đạo điều hành | Văn bản, kết luận của lãnh đạo gắn với chỉ tiêu (kế hoạch, thông báo kết luận, công văn…) |
| Giải trình | Lãnh đạo yêu cầu phòng chủ trì nêu nguyên nhân, giải pháp khi chỉ tiêu chậm |
| Đánh giá | Kết luận theo kỳ: `Vượt`, `Đạt`, `Đạt một phần`, `Không đạt` |
| Tự thông qua | Hệ thống tự duyệt báo cáo, đề xuất khi người duyệt để quá hạn, và ghi trách nhiệm |
| Việc bị treo | Chỉ tiêu bị chuyển, trả qua lại từ 3 lần trở lên, hoặc chưa giao người phụ trách quá gấp đôi số ngày `Nhắc chưa giao người sau` tại `Cấu hình` (trừ chỉ tiêu thống kê); hệ thống báo lãnh đạo. Trên Trình chiếu còn gồm chỉ tiêu quá hạn trả lời giải trình |
| Chuyển việc, trả việc | Người đang phụ trách chuyển chỉ tiêu cho đồng nghiệp cùng phòng chủ trì (có giới hạn số lần) hoặc trả về trưởng phòng kèm lý do |
| Kho dữ liệu, bảng dữ liệu | Nơi lưu số liệu nghiệp vụ theo dòng (ví dụ hồ sơ thủ tục, cuộc họp) để chỉ tiêu tự tính |
| Công thức | Cách tính chỉ tiêu tự tính từ bảng dữ liệu (đếm, tổng, tỷ lệ theo điều kiện) |
| Kho văn bản | Nơi lưu văn bản giao, chỉ đạo, minh chứng; hệ thống đọc chữ và vị trí từng dòng |
| Văn bản giao | Văn bản giao chỉ tiêu (gắn ở chỉ tiêu hoặc bộ chỉ tiêu); mở được đúng dòng của chỉ tiêu |
| Vị trí nguồn | Trang và dòng của chỉ tiêu trong văn bản giao, do hệ thống tự tìm hoặc cán bộ chỉ |
| Văn bản giao cho nhiều đơn vị | Phụ lục giao chỉ tiêu cho mọi xã, phường, mỗi đơn vị một phần mở đầu bằng "ĐƠN VỊ: …" |
| Trích xuất | AI đọc văn bản và đề xuất chỉ tiêu kèm trang, câu trích dẫn |
| Xác minh trích xuất | Màn hình đối chiếu từng đề xuất với bản gốc trước khi trình (DL-04) |
| Đề xuất chỉ tiêu | Chỉ tiêu chờ được duyệt đưa vào danh mục, do AI trích xuất hoặc cán bộ tạo |
| Lượt nhập | Một lần tải phiếu Excel số liệu lên, đối soát rồi ghi nhận hoặc gửi duyệt (DL-03) |
| Cổng thông tin công khai | Trang web cho người dân, không cần đăng nhập: kết quả thực hiện, gửi và tra cứu phản ánh, văn bản công khai (mục 2.6) |
| Trang công khai | Bố cục cổng thông tin công khai do quản trị viên biên tập và công bố tại màn hình `Trang công khai` (ND-02) |
| Phiên bản công khai | Mỗi lần công bố trang công khai được lưu thành một phiên bản, khôi phục được |
| Mã màn hình | Mã như `DH-01`, `CT-06` hiện ở dải định danh cuối trang khu vực quản trị, dùng khi báo lỗi và tra tài liệu; mã CC- của cổng công khai chỉ dùng trong tài liệu |
| Jarvis | Trợ lý điều hành trả lời câu hỏi về số liệu bằng chữ hoặc giọng nói |
