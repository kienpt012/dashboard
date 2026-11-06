# Bàn làm việc số cá nhân

Sau khi đăng nhập thông thường, người dùng vào `/admin`. Trung tâm điều hành cũ được giữ tại `/admin/dieu-hanh`; cả hai có trong menu bên và bảng tìm kiếm `Ctrl K`. Đăng nhập từ một liên kết nghiệp vụ cụ thể vẫn quay lại liên kết đó.

## Không gian và tiện ích

Mỗi tài khoản có bố cục, hình nền, ghi chú, danh sách việc riêng và lối tắt riêng. Kho tiện ích gồm:

- Nhịp điều hành và Công việc IOC: đọc dữ liệu hiện có theo quyền của tài khoản.
- Biểu đồ từ API: đọc JSON từ API công khai để trình bày số liệu, biểu đồ hoặc bảng.
- Ghi chú, danh sách việc, đồng hồ tập trung Pomodoro và máy tính.
- Thời tiết Open-Meteo, đồng hồ múi giờ, lịch tháng và đếm ngược.
- Cửa sổ website: nhúng trang HTTPS cho phép nhúng; luôn có phương án mở trang riêng.

Có tối đa 8 không gian, 40 tiện ích mỗi không gian và 80 lối tắt. Các mẫu mặc định phục vụ tổng quan, tập trung và theo dõi dữ liệu. Lối tắt có thể trỏ đến màn hình nội bộ hoặc trang HTTP/HTTPS bên ngoài. Phân quyền của màn hình nội bộ vẫn được kiểm tra khi mở.

Hình nền tải lên dùng PNG, JPEG hoặc WebP, tối đa 1 MB sau xử lý. Tổng cấu hình tối đa 2 MB. Mỗi tiện ích có thiết lập riêng; một trang web ngoài có thể từ chối nhúng bằng chính sách của nhà cung cấp. Không nhập HTML hoặc JavaScript để chạy trong bàn làm việc.

## Đồng bộ và quyền riêng tư

Cấu hình được lưu trong bảng `UserWorkspace`, khóa theo `userId` lấy từ phiên đăng nhập. Máy chủ không nhận người sở hữu do trình duyệt chỉ định. Hai phiên đồng thời sử dụng số phiên bản để ngăn ghi đè ngoài ý muốn; khi gặp xung đột, kiểm tra bản đang chỉnh rồi tải lại cấu hình máy chủ.

Thay đổi chưa đồng bộ được giữ thành bản nháp trên thiết bị, tách theo tài khoản và thẻ trình duyệt. Rời sang màn hình IOC khác rồi quay lại sẽ khôi phục bản nháp. Chỉ bản nháp dựa trên cùng phiên bản máy chủ mới được lưu tiếp tự động; bản cũ được giữ để xuất bản sao và không ghi đè dữ liệu mới trên máy chủ.

Ghi chú và danh sách việc cá nhân không trở thành dữ liệu nghiệp vụ IOC. Nhật ký chỉ ghi nhận việc cập nhật cấu hình và phiên bản, không chép nội dung ghi chú, lối tắt hoặc ảnh nền vào nhật ký chung.

## Kết nối API bên ngoài

`POST /api/workspace/fetch` chỉ đọc JSON công khai bằng `GET` đến HTTPS cổng 443. Không chuyển tiếp cookie hay token IOC; không hỗ trợ khóa bí mật hoặc header xác thực riêng. Không đưa khóa bí mật vào URL của tiện ích.

Máy chủ kiểm tra địa chỉ IP, chặn mạng nội bộ/loopback/link-local và cố định kết quả DNS cho kết nối TLS. Không đi theo chuyển hướng. Phản hồi tối đa 1 MB; thời gian phân giải DNS tối đa 5 giây và kết nối tải tối đa 8 giây. Giới hạn tải là 60 yêu cầu mỗi phút cho mỗi tài khoản và 600 yêu cầu mỗi phút toàn hệ thống.

Nginx chỉ mở thêm nguồn ảnh và khung HTTPS cho đường dẫn `/admin`; trang công khai giữ chính sách bảo mật cũ. Trình duyệt tiếp tục gọi API cùng nguồn, qua máy chủ IOC.

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
node --import tsx --test scripts/qa-workspace-draft.test.ts
```

Kiểm tra API trên hệ thống đang chạy:

```powershell
node scripts/qa-workspace.mjs
```

Bộ kiểm tra tạo các tài khoản QA tạm thời, kiểm tra lưu cấu hình/cách ly người dùng/xung đột phiên bản/chặn địa chỉ API không hợp lệ, rồi dọn tài khoản, cấu hình và nhật ký của lần QA. Cần ít nhất hai phòng ban đang hoạt động. `QA_API_URL` và `DATABASE_URL` cho phép chọn môi trường kiểm thử. Đặt `QA_EXTERNAL_API=1` nếu cần kiểm tra thêm dữ liệu thời tiết thật từ Open-Meteo.
