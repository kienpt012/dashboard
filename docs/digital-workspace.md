# Bàn làm việc số cá nhân

Sau khi đăng nhập thông thường, người dùng vào `/admin`. Trung tâm điều hành cũ được giữ tại `/admin/dieu-hanh`; cả hai có trong menu bên và bảng tìm kiếm `Ctrl K`. Đăng nhập từ một liên kết nghiệp vụ cụ thể vẫn quay lại liên kết đó.

## Không gian và tiện ích

Mỗi tài khoản có bố cục, hình nền, ghi chú, danh sách việc riêng và lối tắt riêng. Kho tiện ích gồm:

- Tổng quan điều hành và Công việc IOC: đọc dữ liệu hiện có theo quyền của tài khoản.
- Biểu đồ từ API: đọc JSON từ API công khai để trình bày số liệu, biểu đồ hoặc bảng.
- Ghi chú, danh sách việc, đồng hồ tập trung Pomodoro và máy tính.
- Thời tiết Open-Meteo, đồng hồ múi giờ, lịch tháng và đếm ngược.
- Cửa sổ website: nhúng trang HTTPS cho phép nhúng; luôn có phương án mở trang riêng.

Có tối đa 8 không gian, 40 tiện ích mỗi không gian và 80 lối tắt. Các mẫu mặc định phục vụ tổng quan, tập trung và theo dõi dữ liệu. Lối tắt có thể trỏ đến màn hình nội bộ hoặc trang HTTP/HTTPS bên ngoài. Phân quyền của màn hình nội bộ vẫn được kiểm tra khi mở.

Nút ghim trên thanh đầu các màn hình IOC lưu trang hiện tại kèm bộ lọc vào lối tắt. Ghi chú có chế độ Viết/Xem trước Markdown và ô đánh dấu tương tác; lịch tháng hỗ trợ âm lịch Việt Nam, ngày lễ và kỷ niệm (không phải lịch nghỉ bù hằng năm).

Kho hình nền có 13 mẫu, gồm các cảnh SVG ngoại tuyến như Men gốm Lái Thiêu, Trống đồng, Rừng tràm và Sen thanh. Bật “Theo nhịp ngày đêm” để nền đổi theo giờ trên thiết bị; chọn một nền riêng sẽ tắt chế độ tự động.

Hình nền tải lên dùng PNG, JPEG hoặc WebP, tối đa 1 MB sau xử lý. Tổng cấu hình tối đa 2 MB. Mỗi tiện ích có thiết lập riêng; một trang web ngoài có thể từ chối nhúng bằng chính sách của nhà cung cấp. Không nhập HTML hoặc JavaScript để chạy trong bàn làm việc.

## Đồng bộ và quyền riêng tư

Cấu hình được lưu trong bảng `UserWorkspace`, khóa theo `userId` lấy từ phiên đăng nhập. Máy chủ không nhận người sở hữu do trình duyệt chỉ định. Hai phiên đồng thời sử dụng số phiên bản để ngăn ghi đè ngoài ý muốn; khi gặp xung đột, chọn **Tải bản đã lưu** hoặc **Giữ bản của tôi**. Giữ bản của tôi đọc phiên bản mới rồi ghi với kiểm tra phiên bản; nếu có thêm thay đổi đồng thời, máy chủ vẫn trả 409.

Thay đổi chưa đồng bộ được giữ thành bản nháp trên thiết bị, tách theo tài khoản và thẻ trình duyệt. Rời sang màn hình IOC khác rồi quay lại sẽ khôi phục bản nháp. Chỉ bản nháp dựa trên cùng phiên bản máy chủ mới được lưu tiếp tự động; bản cũ được giữ để xuất bản sao và không ghi đè dữ liệu mới trên máy chủ.

Ghi chú và danh sách việc cá nhân không trở thành dữ liệu nghiệp vụ IOC. Nhật ký chỉ ghi nhận việc cập nhật cấu hình và phiên bản, không chép nội dung ghi chú, lối tắt hoặc ảnh nền vào nhật ký chung.

Khi đổi tài khoản hoặc đăng xuất trong một tab khác, các tab còn lại đồng bộ phiên và tải lại trang để bỏ dữ liệu đệm và biểu mẫu của tài khoản cũ. Bản nháp bàn làm việc vẫn được tách theo tài khoản.

## Kết nối API bên ngoài

`POST /api/workspace/fetch` chỉ đọc JSON công khai bằng `GET` đến HTTPS cổng 443. Không chuyển tiếp cookie hay token IOC; không hỗ trợ khóa bí mật hoặc header xác thực riêng. Không đưa khóa bí mật vào URL của tiện ích.

Máy chủ kiểm tra địa chỉ IP, chặn mạng nội bộ/loopback/link-local và cố định kết quả DNS cho kết nối TLS. Không đi theo chuyển hướng. Phản hồi tối đa 1 MB; thời gian phân giải DNS tối đa 5 giây và kết nối tải tối đa 8 giây. Giới hạn tải là 60 yêu cầu mỗi phút cho mỗi tài khoản và 600 yêu cầu mỗi phút toàn hệ thống.

Nginx chỉ mở khung HTTPS cho tài liệu SPA `/admin` và `/login`; nguồn ảnh ngoài không được mở rộng. Trang công khai giữ chính sách bảo mật cũ. Iframe chỉ có `sandbox="allow-scripts"`, `referrerPolicy="no-referrer"`, không có quyền camera, micro hay cùng nguồn. Trình duyệt tiếp tục gọi API cùng nguồn, qua máy chủ IOC.

## Khởi động và kiểm tra

Chạy `start-ioc.cmd` như trước. Khi cập nhật mã nguồn local, có thể chạy:

```powershell
.\start-ioc.cmd -NoUpdate -NoAI -NoBrowser -NoPause
```

Không dùng `-SkipBuild` cho lần đầu chạy thay đổi này. Migration thêm bảng cá nhân được áp dụng khi API khởi động; không cần đặt lại dữ liệu.

Kiểm tra mã nguồn:

```powershell
npm run build
npm test
npm run test:workspace
```

Kiểm tra API trên hệ thống đang chạy:

```powershell
node scripts/qa-workspace.mjs
```

Bộ kiểm tra tạo các tài khoản QA tạm thời, kiểm tra lưu cấu hình/cách ly người dùng/xung đột phiên bản/chặn địa chỉ API không hợp lệ, rồi dọn tài khoản, cấu hình và nhật ký của lần QA. Cần ít nhất hai phòng ban đang hoạt động. `QA_API_URL` và `DATABASE_URL` cho phép chọn môi trường kiểm thử. Đặt `QA_EXTERNAL_API=1` nếu cần kiểm tra thêm dữ liệu thời tiết thật từ Open-Meteo.


## Bàn làm việc 2.0 (G-01 đến G-09)

Đầu bàn có tên gọi, thứ/ngày dương/ngày âm, đồng hồ và lịch **Hôm nay · Ngày mai** (tối đa bốn mục mỗi ngày, mở đầy đủ bằng Xem tất cả). Lịch gom hạn báo cáo, nhiệm vụ, note có hạn, việc riêng có ngày và ngày lễ/kỷ niệm. Số đếm được máy chủ tính theo người đăng nhập. Lịch dùng ngày Việt Nam, Tuần này tính từ thứ Hai đến Chủ nhật; mốc kỷ niệm không phải lịch nghỉ bù chính thức.

### Giấy note

Dán note ở đầu bàn hoặc **Hồ sơ chỉ tiêu → Thao tác → Dán note nhắc việc**. Nội dung văn bản thuần tối đa 500 ký tự, trả lời tối đa 300 ký tự. Có bốn màu giấy, hạn tùy chọn và chỉ tiêu liên quan. Note theo chỉ tiêu mặc định chọn người phụ trách và trưởng phòng chủ trì; người gửi phải xem được hồ sơ và được gửi tới những người nhận đó.

| Vai trò | Đối tượng gửi |
|---|---|
| Người xem | Chính mình |
| Chuyên viên, văn thư | Chính mình, cùng phòng, lãnh đạo UBND, Chánh Văn phòng |
| Trưởng phòng | Các đối tượng trên, cả phòng mình và các trưởng phòng khác |
| Chánh Văn phòng (MANAGER của phòng OFFICE), lãnh đạo, quản trị | Bất kỳ người, phòng, vai trò hoặc toàn cơ quan |

Chỉ tác giả và người nhận đọc/trả lời. Kéo tay nắm để di chuyển giấy; khi dùng bàn phím, chọn tay nắm rồi bấm phím mũi tên. Trên điện thoại, chạm chồng note để mở. Đánh dấu đã xong hoặc gỡ khỏi bàn không thu hồi note của người khác. Tác giả xem **Note đã dán** để kiểm tra thời điểm từng người đã xem/đã xong và thu hồi. Máy chủ giới hạn 30 note/giờ, 60 trả lời/giờ/người. Thông báo chỉ chứa người gửi và liên kết; nhật ký không chứa nội dung note. Danh sách cập nhật mỗi 30 giây.

Note hệ thống tính trực tiếp từ dữ liệu IOC: thiếu/đến hạn báo cáo, rủi ro/quá hạn, nhiệm vụ sắp đến hạn, giải trình, chưa giao người, báo cáo và đề xuất chờ xử lý. Chuyên viên xem việc mình; trưởng phòng xem việc phòng kèm tên và tên đăng nhập của người phụ trách; lãnh đạo/quản trị xem số đếm tổng. Người xem không nhận công việc nghiệp vụ. **Ẩn đến mai** giữ trạng thái trên thiết bị của đúng tài khoản và hết hạn lúc 0 giờ Việt Nam; dữ liệu hoàn thành tự biến mất khi làm mới.

### Ứng dụng công vụ — HT-08

Quản trị mở `/admin/ung-dung` để khai báo tên, HTTP(S), biểu tượng hoặc chữ viết tắt, màu, nhóm, công dụng, đối tượng và thứ tự. Ẩn ứng dụng bằng tắt Đang dùng. Đối tượng rỗng nghĩa là mọi người; khi chọn vai trò và phòng, người dùng khớp một trong hai điều kiện được dùng. Máy chủ kiểm tra và lọc danh sách trước khi trả về.

Dock nổi ở đáy, cạnh trái hoặc ẩn, cấu hình trong Cá nhân hóa. Lối tắt riêng và ứng dụng cơ quan nằm chung khay; **Tất cả ứng dụng** mở lưới tìm theo tên, nhóm và công dụng. Huy hiệu màn hình nội bộ lấy số IOC theo quyền. Huy hiệu ngoài chỉ gọi JSON HTTPS công khai qua bộ gọi SSRF an toàn; nhớ đệm cả kết quả và lỗi năm phút, lỗi không hiện huy hiệu. Không khai báo khóa bí mật vào URL. Các địa chỉ dữ liệu mẫu là những địa chỉ được chỉ định trong đề bài, không đặt giả địa chỉ phần mềm của cơ quan.

### Ghim và tiện ích

Nút ghim trong hồ sơ chỉ tiêu hoặc ngăn xem văn bản thêm vào tiện ích **Đã ghim** của không gian hiện tại. Chỉ tiêu hiển thị giá trị, tiến độ và trạng thái trực tiếp; máy chủ ẩn mục không còn quyền. Văn bản mở trong ngăn xem. Nút ghim trên đầu các trang khác vẫn lưu URL kèm bộ lọc.

Giữ 12 tiện ích cũ và thêm 12 tiện ích: Chỉ tiêu của tôi, Biểu đồ chỉ tiêu, Cảnh báo, Chờ duyệt, Tiến độ theo phòng, Phản ánh, Văn bản mới, Hoạt động gần đây, Note đã dán, Lịch việc, Đã ghim và Đề xuất chỉ tiêu. Biểu đồ chỉ lấy báo cáo đã duyệt, lấy bản mới nhất khi cùng kỳ được sửa; đường Mức giao là mức giao của hồ sơ, không nội suy kế hoạch theo tháng khi chưa có dữ liệu kế hoạch tháng. Hoạt động hiển thị nhãn màu theo loại thao tác và ngày giờ trực tiếp.

Cấu hình mới dùng `schemaVersion: 2`. V1 được chuyển khi mở mà giữ nguyên không gian, vị trí, ghi chú, việc riêng và lối tắt. Tài khoản chưa có cấu hình nhận bố cục theo vai trò: lãnh đạo điều hành/phòng/cảnh báo/chờ duyệt; trưởng phòng công việc/chờ duyệt/chỉ tiêu/note; chuyên viên lịch/chỉ tiêu/ghi chú/việc; văn thư văn bản/đề xuất; người xem tổng quan. Kiểm tra cấu hình dùng cùng module thuần `workspace-schema.ts` ở web và API.

### API và triển khai

- `GET /workspace/briefing`, `GET /workspace/pins?targetIds=...&documentIds=...`.
- `GET /workspace/notes`, `GET /workspace/notes/:id`, `GET /workspace/note-recipients?targetId=...`.
- `POST /workspace/notes`, `PATCH /workspace/notes/:id/recipient`, `POST /workspace/notes/:id/replies`, `POST /workspace/notes/:id/recall`.
- `GET /workspace/apps`; `GET/POST /workspace/apps/admin`, `PUT /workspace/apps/admin/:id` chỉ ADMIN.

Migration `20261113100000_desk_notes_apps` thêm DeskNote, DeskNoteRecipient, DeskNoteReply, WorkApp; không xóa dữ liệu. Sau khi áp dụng migration và generate Prisma, chạy `npx tsx apps/api/prisma/demo/extras-desk.ts` với DATABASE_URL của CSDL mẫu để thêm sáu ứng dụng và note minh họa; chạy lại không nhân đôi.

Migration `20261113100100_desk_note_initial_position` cho phép vị trí note chưa kéo là `null` để giao diện xếp chồng ở góc phải; các vị trí cũ `(0, 0)` được chuyển sang trạng thái mặc định này. Vị trí đã kéo khác được giữ nguyên.

Kiểm tra bổ sung: `node scripts/qa-desk.mjs` với `QA_API_URL` và `DATABASE_URL` trỏ vào CSDL QA riêng. Không chạy kịch bản QA hoặc seed vào CSDL sản xuất.

`node scripts/qa-workspace-browser.mjs` dùng Chrome headless thật để kiểm tra Markdown/iframe, hai tab xung đột, refresh bản nháp, API mất kết nối, và luồng hồ sơ → dán note → ghim → người nhận trả lời. Cần `QA_API_URL`, `QA_WEB_URL`, `DATABASE_URL`; có thể đặt `CHROME_PATH` nếu Chrome ở vị trí khác. Kịch bản tự tạo và dọn tài khoản/dữ liệu tạm, không thay bố cục tài khoản mẫu. `QA_SHOTS_DIR` tùy chọn lưu ảnh trạng thái 409.
