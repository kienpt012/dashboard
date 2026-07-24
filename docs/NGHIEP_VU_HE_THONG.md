# Nghiệp vụ hệ thống IOC Lái Thiêu

Tài liệu này là chuẩn nghiệp vụ dùng chung cho giao diện React, API NestJS và dữ liệu PostgreSQL. Mọi kiểm tra quyền quan trọng phải thực hiện ở API; việc ẩn nút trên giao diện chỉ nhằm cải thiện trải nghiệm.

## 1. Nhóm người dùng và phạm vi dữ liệu

| Chức năng | Quản trị hệ thống | Lãnh đạo đơn vị | Cán bộ cập nhật | Người dùng chỉ xem |
|---|---:|---:|---:|---:|
| Xem dashboard, chỉ tiêu, báo cáo | Toàn hệ thống | Đơn vị mình | Đơn vị mình | Đơn vị mình |
| Đặt và sửa chỉ tiêu | Có | Không | Không | Không |
| Báo cáo số liệu | Có, hiệu lực ngay | Gửi chờ duyệt | Gửi chờ duyệt | Không |
| Duyệt/từ chối báo cáo | Có | Người khác gửi trong đơn vị mình | Không | Không |
| Tải/nhập phiếu Excel | Theo phạm vi chọn, hiệu lực ngay | Đơn vị mình, chờ duyệt | Đơn vị mình, chờ duyệt | Không |
| Xem phản ánh | Toàn hệ thống | Đơn vị mình | Chỉ hồ sơ được giao | Đơn vị mình, thông tin người gửi đã ẩn |
| Phân loại, phân công phản ánh | Có | Trong đơn vị mình | Không | Không |
| Xử lý và trình kết quả phản ánh | Có | Trong đơn vị mình | Chỉ hồ sơ được giao | Không |
| Duyệt kết quả phản ánh | Có | Hồ sơ trong đơn vị do người khác trình | Không | Không |
| Công bố phản ánh đã ẩn danh | Có | Không | Không | Không |
| Quản lý phòng ban, tài khoản, cấu hình | Có | Không | Không | Không |
| Xem nhật ký hệ thống | Có | Không | Không | Không |
| Xem hồ sơ, đổi mật khẩu cá nhân | Có | Có | Có | Có |

Quy tắc bắt buộc:

- API nạp lại tài khoản và phòng ban từ cơ sở dữ liệu ở từng request.
- Tài khoản quản trị có phạm vi toàn hệ thống và không gắn cố định với phòng ban. Khi một thao tác cần phạm vi đơn vị (tạo chỉ tiêu, tải/nhập Excel), quản trị viên phải chọn rõ phòng ban thay vì kế thừa một đơn vị ngầm định.
- Tài khoản ngoài vai trò quản trị phải thuộc một phòng ban đang hoạt động.
- Tham số `departmentId` do trình duyệt gửi không được phép mở rộng phạm vi của người dùng.
- Cán bộ cập nhật chỉ thấy phản ánh được giao trực tiếp; người chỉ xem chỉ nhận trao đổi/sự kiện công khai và dữ liệu liên hệ đã che.
- Khi tài khoản bị khóa, đổi vai trò hoặc phòng ban ngừng hoạt động, API đọc trạng thái mới từ cơ sở dữ liệu nên token cũ không giúp vượt quyền.

## 2. Vòng đời chỉ tiêu

1. Quản trị viên tạo chỉ tiêu, chỉ định phòng ban, năm, hạn, trọng số và chiều đánh giá.
2. Chỉ tiêu mới chưa có báo cáo ở trạng thái `Chưa bắt đầu`.
3. Mỗi lần số liệu chính thức thay đổi, hệ thống tăng `version` và ghi thời điểm báo cáo.
4. Trạng thái được tính lại từ số liệu, mục tiêu, chiều đánh giá, hạn và ngưỡng rủi ro; người dùng không tự sửa trạng thái.
5. Chỉ quản trị viên quyết định chỉ tiêu nào được công khai trên trang người dân.

Năm mặc định được xác định theo múi giờ `Asia/Ho_Chi_Minh`, không theo múi giờ máy chủ. Tiến độ tổng hợp được tính theo công thức `Σ(tiến độ chỉ tiêu × trọng số) / Σ(trọng số)`; cùng một quy tắc được dùng cho toàn hệ thống, từng phòng ban, cổng công khai và báo cáo Excel. Chỉ tiêu đã lưu trữ không tham gia phép tính.

Hai chiều đánh giá:

- `Càng cao càng tốt`: ví dụ tỷ lệ đúng hạn, doanh thu, số công trình hoàn thành.
- `Càng thấp càng tốt`: ví dụ số vụ vi phạm, thời gian xử lý. Giá trị thực tế nhỏ hơn hoặc bằng mục tiêu mới được coi là hoàn thành.

Giá trị `0` của chỉ tiêu “càng thấp càng tốt” chỉ là kết quả hoàn thành nếu đã có một báo cáo thực tế; `0` mặc định trước lần báo cáo đầu tiên vẫn là `Chưa bắt đầu`.

## 3. Báo cáo và phê duyệt số liệu

### Cán bộ hoặc lãnh đạo đơn vị báo cáo

1. Chọn chỉ tiêu trong đơn vị mình.
2. Nhập giá trị mới và bắt buộc nêu kỳ/nguồn số liệu.
3. Hệ thống tạo bản ghi `PENDING`; kết quả chính thức chưa thay đổi.
4. Người gửi không thể gửi thêm một báo cáo cho cùng chỉ tiêu khi báo cáo trước còn chờ duyệt.

### Lãnh đạo đơn vị hoặc quản trị

1. Xem hàng đợi đúng phạm vi.
2. Đối chiếu giá trị hiện tại, giá trị đề xuất, nguồn số liệu và phiên bản.
3. Không được tự duyệt hoặc tự từ chối báo cáo do chính mình gửi; báo cáo của lãnh đạo đơn vị cần quản trị viên xử lý.
4. Duyệt: cập nhật kết quả chính thức, tăng phiên bản, lưu người/thời gian duyệt.
5. Từ chối: bắt buộc nêu lý do để người gửi sửa và báo cáo lại.
6. Nếu chỉ tiêu đã thay đổi sau lúc gửi, hệ thống chặn duyệt để tránh ghi đè số liệu mới.

## 4. Quy trình Excel không gây xung đột

Excel là phiếu cập nhật dữ liệu đang có, không phải công cụ tạo/upsert chỉ tiêu.

1. Người dùng tải phiếu từ máy chủ theo năm và phạm vi được phép.
2. Phiếu chứa đúng chỉ tiêu hiện tại; cột định danh và phiên bản được ẩn, các cột gốc được khóa.
3. Người dùng chỉ nhập `Giá trị mới` và `Ghi chú` trong ô màu vàng.
4. Khi tải lên, bước `Xem trước` không ghi vào chỉ tiêu. Hệ thống kiểm tra:
   - đúng mẫu và đúng năm;
   - đúng phòng ban;
   - không sửa cột khóa;
   - không có dòng trùng;
   - phiên bản và giá trị gốc còn khớp;
   - giá trị mới hợp lệ.
5. Chỉ file không lỗi mới có thể `Áp dụng`.
6. Trước khi áp dụng, toàn bộ phiên bản được kiểm tra lại trong transaction. Có xung đột thì không dòng nào được ghi.
7. Cán bộ/lãnh đạo áp dụng file tạo các báo cáo `PENDING`; chỉ quản trị viên áp dụng file thành kết quả đã duyệt.
8. Thao tác áp dụng có tính idempotent: gửi lại cùng yêu cầu không nhân đôi dữ liệu.

Mỗi lô import lưu trạng thái từng dòng và liên kết với báo cáo chờ duyệt đã sinh. Màn hình lịch sử hiển thị số dòng chờ duyệt/đã duyệt/bị từ chối, hỗ trợ trạng thái `PARTIALLY_APPROVED` và cho phép mở chi tiết để đối soát người duyệt, thời điểm, lý do. Cán bộ chỉ xem lô thuộc phạm vi của mình và không nhận payload kỹ thuật không cần thiết.

Báo cáo Excel được xuất riêng ở chế độ đọc, gồm tổng hợp, chi tiết và lịch sử. Cán bộ/người chỉ xem chỉ nhận lịch sử đã duyệt; quản trị/lãnh đạo có thể đối chiếu cả trạng thái duyệt. Công thức tổng hợp có tính trọng số nhất quán với dashboard.

## 5. Cổng thông tin công khai

### 5.1. Chỉ tiêu công khai

- Không yêu cầu đăng nhập tại `/`.
- Chỉ trả chỉ tiêu có `isPublic=true`, đã có bản chụp công bố và thuộc phòng ban đang hoạt động.
- Số liệu nội bộ sau khi duyệt không tự xuất hiện cho người dân. Quản trị viên phải bấm `Công bố`; hệ thống lưu riêng giá trị, mục tiêu, chiều đánh giá, trạng thái, người và thời điểm công bố.
- Chỉ tiêu nổi bật do quản trị viên lựa chọn, không phụ thuộc danh sách mã viết cứng.
- Không công khai tài khoản, lịch sử chờ duyệt/từ chối, định danh nội bộ hoặc nhật ký quản trị.
- Không dùng số liệu giả làm phương án dự phòng khi API lỗi; giao diện hiển thị trạng thái đang cập nhật rõ ràng.

### 5.2. Gửi và tra cứu phản ánh

- Người dân sử dụng `/phan-anh` mà không cần tài khoản.
- Khi gửi phản ánh, người dân phải cung cấp nội dung, nhóm vấn đề, thông tin liên hệ cần thiết và xác nhận đồng ý cho cơ quan sử dụng dữ liệu cá nhân để xác minh, phản hồi.
- Trình duyệt tạo `clientSubmissionId` và mã bảo mật trước khi gửi. Nếu mất mạng rồi gửi lại cùng biên nhận, API trả lại đúng hồ sơ đã tạo thay vì nhân đôi; dùng cùng `clientSubmissionId` với mã bảo mật khác bị từ chối.
- Hệ thống lưu thời điểm xác nhận phạm vi tiếp nhận, thời điểm đồng ý xử lý dữ liệu cá nhân và phiên bản chính sách để phục vụ kiểm toán.
- Hệ thống trả `mã phản ánh` và `mã bảo mật`. Mã bảo mật chỉ hiển thị một lần, chỉ lưu bản băm trong cơ sở dữ liệu và phải được người dân tự bảo quản.
- Tra cứu luôn yêu cầu đủ hai mã. Trường hợp sai mã phản ánh hoặc sai mã bảo mật dùng cùng một thông báo chung để hạn chế dò tìm hồ sơ.
- Người dân chỉ thấy trao đổi công khai và các mốc xử lý được phép công bố; không thấy ghi chú nội bộ, người thực hiện nội bộ hoặc nhật ký quản trị.
- Trong trạng thái phù hợp, người dân có thể bổ sung thông tin, đánh giá kết quả hoặc đề nghị xem xét lại. Mọi thay đổi đều dùng phiên bản hồ sơ để tránh ghi đè khi hai bên thao tác đồng thời.

## 6. Tiếp nhận và xử lý phản ánh

### 6.1. Vòng đời chuẩn

```text
Tiếp nhận -> Đã phân công -> Đang xử lý -> Chờ người dân bổ sung
                                      \-> Chờ duyệt kết quả -> Đã giải quyết -> Đã đóng
```

Các nhánh ngoại lệ:

- `Không tiếp nhận`: chỉ quản trị viên thực hiện với hồ sơ mới/đã phân công và bắt buộc nêu lý do.
- `Mở lại`: áp dụng cho hồ sơ đã giải quyết/đã đóng hoặc không tiếp nhận khi có căn cứ mới; hệ thống tăng số lần mở lại, xóa dữ liệu kết quả/công bố cũ khỏi luồng hiện hành và lưu bản chụp cũ trong nhật ký để đối soát.
- Người dân có thể đề nghị xem xét lại hồ sơ đã giải quyết, đã đóng hoặc không tiếp nhận trong 30 ngày, tối đa ba lần. Mỗi thời điểm chỉ có một đề nghị chờ xử lý; lãnh đạo/quản trị phải chấp thuận hoặc từ chối kèm lý do.
- Khi người dân bổ sung thông tin cho hồ sơ `Chờ người dân bổ sung`, hồ sơ tự quay lại `Đang xử lý`.
- Hồ sơ chờ bổ sung quá hạn có thể kết thúc với kết quả nghiệp vụ `Không nhận được bổ sung`, không bị tính nhầm vào KPI `Đã giải quyết`.

### 6.2. Phân loại, phân công và thời hạn

1. Quản trị viên hoặc lãnh đạo đơn vị phân loại nhóm vấn đề và mức ưu tiên, có căn cứ đi kèm.
2. Quản trị viên có thể phân công đến đơn vị phù hợp; lãnh đạo chỉ phân công trong chính đơn vị mình.
3. Cán bộ nhận việc phải đang hoạt động, có vai trò lãnh đạo/cán bộ và thuộc đúng đơn vị xử lý.
4. Hạn phản hồi đầu tiên được tính khi tiếp nhận theo cấu hình hệ thống, mặc định 2 ngày.
5. Hạn xử lý mặc định dựa trên cấu hình, mặc định 10 ngày, và được điều chỉnh theo mức ưu tiên: khẩn 1 ngày, cao bằng khoảng một nửa thời hạn chuẩn nhưng tối thiểu 2 ngày, thường theo thời hạn chuẩn, thấp cộng thêm 5 ngày. Người phân công có thể chọn hạn tương lai cụ thể.
6. Khi yêu cầu người dân bổ sung, đồng hồ SLA của cơ quan được tạm dừng và hệ thống đặt hạn phản hồi riêng cho người dân. Phân công lại trong thời gian chờ không được làm mất mốc tạm dừng; khi người dân trả lời, thời gian đã tạm dừng được cộng bù vào hạn xử lý.
7. Dashboard phản ánh tách quá hạn của cơ quan khỏi quá hạn bổ sung của người dân, đồng thời hiển thị hồ sơ sắp đến hạn, chờ duyệt và mức hài lòng để ưu tiên đúng hàng việc.

### 6.3. Xử lý, trao đổi và duyệt kết quả

1. Cán bộ chỉ xử lý hồ sơ được giao trực tiếp; lãnh đạo chỉ xử lý hồ sơ trong đơn vị; quản trị viên xử lý toàn hệ thống.
2. Trao đổi có hai phạm vi: `Công khai` để người dân thấy khi tra cứu và `Nội bộ` chỉ dành cho người có quyền xử lý. Người chỉ xem chỉ nhận phần công khai và dữ liệu người gửi đã che.
3. Cán bộ có thể yêu cầu người dân bổ sung; yêu cầu này đồng thời ghi nhận lần phản hồi đầu tiên nếu trước đó chưa phản hồi.
4. Mỗi lần gọi điện hoặc gửi email thủ công có thể được ghi thành sự kiện liên hệ, gồm kênh, kết quả và ghi chú; hệ thống không tuyên bố đã tự gửi email khi chưa có tích hợp nhà cung cấp thông báo.
5. Kết quả xử lý phải được trình duyệt. Người trình không được tự duyệt kết quả của chính mình.
6. Người duyệt có thể chấp thuận hoặc trả lại kèm lý do. Khi chấp thuận, tóm tắt kết quả trở thành phản hồi công khai cho người dân.
7. Mọi thao tác thay đổi hồ sơ phải gửi `expectedVersion`. Nếu hồ sơ đã được người khác cập nhật, API từ chối và yêu cầu tải lại để tránh mất dữ liệu.
8. Người dân có thể đánh giá đúng một lần sau khi có kết quả; đánh giá hồ sơ đang ở trạng thái `Đã giải quyết` đồng thời hoàn tất việc đóng hồ sơ.

### 6.4. Công bố phản ánh điển hình

- Chỉ quản trị viên được công bố hoặc hủy công bố và chỉ với hồ sơ đã giải quyết/đã đóng.
- Tiêu đề và nội dung công khai được lấy từ hồ sơ phản ánh gốc; cán bộ không phải nhập lại. Trước khi công bố, hệ thống tự loại bỏ tên, số điện thoại, email, địa chỉ và chi tiết có thể nhận diện người gửi; kết quả xử lý lấy từ nội dung đã được phê duyệt.
- Quản trị viên phải xác nhận rõ đã ẩn danh. API tiếp tục dò email, số điện thoại, định danh, họ tên và địa chỉ; phát hiện tín hiệu dữ liệu cá nhân thì từ chối công bố để người biên tập kiểm tra lại.
- Hệ thống lưu bản chụp công bố riêng gồm tiêu đề, tóm tắt, nhóm vấn đề, đơn vị xử lý, thời điểm giải quyết và thời điểm công bố. Dữ liệu nội bộ thay đổi sau đó không tự làm thay đổi nội dung đã công bố.

## 7. Quản trị danh mục và chỉnh sửa dữ liệu

### 7.1. Chỉ tiêu

- Chỉ quản trị viên được tạo/chỉnh sửa chỉ tiêu, thay đổi đơn vị phụ trách và cấu hình công khai.
- Mã chỉ tiêu do máy chủ tự cấp theo năm và mã đơn vị, duy nhất trên toàn hệ thống và không được sửa trong suốt vòng đời chỉ tiêu. Năm kế hoạch và đơn vị phụ trách cũng được khóa sau khi tạo để lịch sử báo cáo luôn nhất quán. Hạn hoàn thành phải là ngày có thật và thuộc cùng năm kế hoạch, được tính đến hết ngày theo giờ Việt Nam.
- Chỉnh sửa dùng `expectedVersion`; thay đổi cũ bị từ chối nếu dữ liệu đã có phiên bản mới.
- Không được chuyển chỉ tiêu sang phòng ban khác khi còn báo cáo chờ duyệt.
- Sau khi đã có lịch sử báo cáo, các trường định nghĩa làm thay đổi ý nghĩa chỉ tiêu không được sửa trực tiếp; cần tạo chỉ tiêu kế nhiệm để bảo toàn khả năng đối soát.
- Lưu trữ chỉ tiêu giữ nguyên toàn bộ lịch sử nhưng loại nó khỏi dashboard, cổng công khai, file mẫu và hàng vận hành. Không thể lưu trữ khi còn báo cáo chờ duyệt; chỉ tiêu đã lưu trữ không nhận báo cáo mới. Khôi phục đưa chỉ tiêu về nội bộ và bắt buộc công bố lại nếu muốn xuất hiện trên cổng người dân.
- Việc sửa dữ liệu nội bộ không tự cập nhật bản chụp công khai; quản trị viên phải công bố lại sau khi số liệu chính thức thay đổi.

### 7.2. Tài khoản

- Chỉ quản trị viên được tạo và chỉnh sửa tài khoản, vai trò, phòng ban, trạng thái hoặc đặt lại mật khẩu.
- Chỉnh sửa tài khoản dùng `expectedVersion`; giao diện cũ bị từ chối thay vì ghi đè thay đổi của quản trị viên khác.
- Tài khoản quản trị không gắn cố định với phòng ban; mọi vai trò khác bắt buộc thuộc phòng ban đang hoạt động.
- Không cho người đang đăng nhập tự khóa hoặc tự hạ quyền quản trị.
- Hệ thống luôn giữ ít nhất một quản trị viên hoạt động, kể cả khi có hai thao tác đồng thời.
- Đặt lại mật khẩu làm tăng phiên bản bảo mật và thu hồi toàn bộ token cũ của tài khoản đó.

### 7.3. Phòng ban

- Chỉ quản trị viên được tạo, chỉnh sửa hoặc thay đổi trạng thái phòng ban. Người dùng khác chỉ xem thông tin đơn vị thuộc phạm vi của mình.
- Chỉnh sửa phòng ban dùng `expectedVersion`; thay đổi đến sau phải tải lại nếu dữ liệu đã được cập nhật.
- Không thể ngừng phòng ban khi còn tài khoản hoạt động, còn chỉ tiêu chưa lưu trữ hoặc còn phản ánh chưa kết thúc. Quản trị viên phải chuyển/khóa tài khoản, lưu trữ/chuyển chỉ tiêu và hoàn tất phản ánh trước.
- Phòng ban đã ngừng hoạt động không được nhận tài khoản, chỉ tiêu hoặc phản ánh mới.

## 8. Bảo mật tài khoản và nhật ký hệ thống

### 8.1. Hồ sơ và đổi mật khẩu

- Mọi vai trò truy cập `/admin/profile` để xem họ tên, tài khoản, vai trò, phạm vi đơn vị, email và lần đăng nhập gần nhất.
- Người dùng tự đổi mật khẩu bằng mật khẩu hiện tại. Mật khẩu mới phải khác mật khẩu cũ, dài 8-128 ký tự và có chữ hoa, chữ thường, số, ký tự đặc biệt.
- Mật khẩu được băm bằng bcrypt; API không trả `passwordHash` hoặc mã bảo mật phản ánh đã băm.
- Sau khi đổi mật khẩu, hệ thống tăng `tokenVersion`, cấp token mới cho phiên hiện tại và từ chối mọi token cũ ở các thiết bị/phiên khác.
- Sai mật khẩu hiện tại không làm mất phiên đang dùng; API trả lỗi nghiệp vụ để người dùng nhập lại.

### 8.2. Nhật ký kiểm toán

- Các thao tác quan trọng về chỉ tiêu, báo cáo, duyệt, import, tài khoản, phòng ban, cấu hình, mật khẩu và phản ánh đều ghi nhật ký trong cùng transaction với dữ liệu nghiệp vụ.
- Chỉ quản trị viên được xem `/admin/audit-logs`.
- Có thể tìm kiếm theo tài khoản/thao tác/đối tượng/mã đối tượng và lọc theo thao tác, loại đối tượng, phòng ban, khoảng ngày; kết quả được phân trang.
- Khoảng ngày được hiểu theo múi giờ Việt Nam; ngày kết thúc bao gồm toàn bộ ngày được chọn.
- API chỉ trả danh sách khóa metadata an toàn. Mật khẩu, token, mã bảo mật, nội dung liên hệ và dữ liệu nhạy cảm không được hiển thị trong nhật ký.

### 8.3. Kiểm soát API

- DTO runtime từ chối trường lạ thay vì âm thầm nhận dữ liệu ngoài hợp đồng.
- API xác thực lại tài khoản, trạng thái hoạt động, vai trò, phòng ban và `tokenVersion` ở mỗi request được bảo vệ.
- Cấu hình hệ thống cũng dùng khóa phiên bản để hai quản trị viên không âm thầm ghi đè nhau.
- Các điểm công khai nhạy cảm có giới hạn tần suất trong tiến trình API. Khi triển khai nhiều bản sao API phải dùng kho giới hạn phân tán như Redis để toàn cụm dùng chung hạn mức.
- Thao tác nghiệp vụ và bản ghi audit được đặt trong transaction; lỗi giữa chừng không để lại dữ liệu cập nhật một phần.
- Dữ liệu seed là idempotent, không tự đặt lại mật khẩu hoặc dữ liệu vận hành mỗi lần khởi động; môi trường production có chốt bảo vệ riêng.
- Kịch bản khởi tạo mới từ cơ sở dữ liệu trống đã được xác minh: khi bật `RUN_DEMO_SEED=true`, tài khoản mẫu có vai trò `ADMIN` và `departmentId = NULL`, đúng phạm vi toàn hệ thống.
- PostgreSQL, API và web có healthcheck theo chuỗi phụ thuộc. `GET /api/health` chỉ trả trạng thái khỏe khi API truy vấn được cơ sở dữ liệu; lỗi kết nối trả trạng thái không sẵn sàng để Docker và công cụ giám sát phát hiện.
- Schema hiện có 17 migration. Migration `20260715162000_admin_global_scope` loại liên kết phòng ban còn sót trên tài khoản quản trị cũ, tăng phiên bản tài khoản/token và buộc đăng nhập lại để áp dụng đúng phạm vi toàn hệ thống. Migration `20260715170000_lai_thieu_rebrand` chuyển miền email tài khoản cũ sang `@laithieu.gov.vn` khi đổi thương hiệu sang Phường Lái Thiêu.

## 9. Kiểm thử chấp nhận và lệnh QA

Tiêu chí bắt buộc:

- Lãnh đạo/cán bộ/người chỉ xem của phòng A không đọc hay sửa dữ liệu phòng B, kể cả gọi API trực tiếp.
- Người chỉ xem không thấy và không gọi được import, duyệt, tài khoản, cấu hình hoặc cập nhật số liệu; dữ liệu liên hệ trong phản ánh được che.
- Cán bộ gửi báo cáo không làm thay đổi chỉ tiêu trước khi được duyệt; báo cáo cũ bị chặn nếu phiên bản chỉ tiêu đã thay đổi.
- File Excel tải từ phòng A không áp dụng được cho phòng B; sửa cột khóa hoặc dùng file cũ đều bị chặn.
- Chỉ tiêu lưu trữ không xuất hiện trong vận hành và không nhận báo cáo mới; khi khôi phục phải công bố lại dữ liệu công khai.
- Chỉ tiêu “càng thấp càng tốt” được tính đúng, bao gồm trường hợp chưa báo cáo và báo cáo giá trị 0.
- Trang công khai chỉ chứa dữ liệu đã được công bố bằng bản chụp; không rò rỉ dữ liệu nội bộ khi API công khai được gọi trực tiếp.
- Mã bảo mật sai không tra cứu được phản ánh. Cán bộ không mở được hồ sơ chưa giao cho mình; người trình kết quả không tự duyệt.
- Gửi lại phản ánh sau lỗi mạng không tạo hồ sơ trùng; nội dung công bố còn dữ liệu cá nhân bị chặn; quá hạn bổ sung không được tính thành đã giải quyết.
- Hai thao tác dùng cùng phiên bản phản ánh/chỉ tiêu không thể cùng ghi đè thành công; thao tác đến sau phải nhận lỗi xung đột.
- Đổi hoặc đặt lại mật khẩu làm token cũ hết hiệu lực, trong khi token mới của phiên đổi mật khẩu tiếp tục hoạt động.
- Không thể tự khóa tài khoản quản trị đang dùng, xóa quản trị viên hoạt động cuối cùng hoặc ngừng phòng ban còn dữ liệu vận hành.

Các lệnh kiểm thử tại thư mục gốc:

```powershell
# Kiểm thử đơn vị cho cách tính tiến độ và trạng thái
npm test

# Kiểm thử tích hợp phân quyền, phạm vi dữ liệu, ràng buộc quản trị và thu hồi token
npm run qa:access

# Kiểm thử tích hợp toàn bộ vòng đời phản ánh và chống xung đột
npm run qa:feedback

# Kiểm thử end-to-end quy trình Excel từ tải mẫu đến áp dụng và đối soát
npm run qa:import

# Xác nhận cả API và giao diện biên dịch thành công
npm run build
```

Các kịch bản `qa:*` cần API và PostgreSQL đang chạy. Chúng dùng dữ liệu có tiền tố kiểm thử, tự xác minh kết quả bằng API và dọn bản ghi do chính kịch bản tạo khi hoàn tất.

Kết quả vòng double-check gần nhất:

| Nhóm kiểm thử | Kết quả | Phạm vi chính |
|---|---:|---|
| Unit (`npm test`) | 18/18 đạt | Tính tiến độ/trạng thái, chỉ tiêu hai chiều, tổng hợp theo trọng số và ranh giới năm theo giờ Việt Nam |
| Truy cập (`npm run qa:access`) | 33/33 đạt | Đăng nhập, RBAC, cô lập phòng ban, ràng buộc quản trị, chặn tự đặt lại mật khẩu qua API, vòng đời chỉ tiêu và thu hồi token |
| Phản ánh (`npm run qa:feedback`) | 64/64 đạt | Gửi/tra cứu, idempotency, phân công, SLA, chờ bổ sung, duyệt/đóng/mở lại, đánh giá, ẩn danh, PII và xung đột phiên bản |
| Import (`npm run qa:import`) | 8/8 đạt | End-to-end tải mẫu Excel hiện hành, xem trước, kiểm tra phạm vi/xung đột, áp dụng và đối soát dữ liệu |
| Build (`npm run build`) | Đạt | TypeScript và bản dựng production của API + web |

Smoke test giao diện bao phủ trang chính công khai, trang gửi/tra cứu phản ánh và các màn hình quản trị (dashboard, chỉ tiêu, báo cáo, import, phê duyệt, phản ánh, phòng ban, tài khoản, cấu hình, nhật ký, hồ sơ) ở desktop và kích thước di động. Ngoài nội dung/điều hướng, vòng kiểm tra còn xác minh modal, phím `Escape`, khôi phục focus, menu di động, vùng cuộn bảng và không tràn ngang toàn trang.

## 10. Giới hạn hiện tại và pha nghiệp vụ kế tiếp

- Trường `frequency` hiện mô tả chu kỳ mong muốn của chỉ tiêu, nhưng mỗi chỉ tiêu vẫn có một giá trị hiện hành. Pha tiếp theo nên bổ sung `TargetReportingPeriod` với khóa kỳ như `2026-M07`, `2026-Q3`, `2026-Y1`; từng báo cáo phải liên kết một kỳ, mỗi kỳ có trạng thái mở/chốt/mở khóa và người phê duyệt. Excel V2 cần tải theo kỳ và khóa số liệu sau khi chốt.
- Tệp đính kèm phản ánh chưa nên bật trước khi có đủ quét mã độc, giới hạn dung lượng/loại tệp, kiểm soát truy cập và lịch lưu/xóa.
- Kênh email/Zalo chỉ được coi là đã gửi sau khi có nhà cung cấp, hàng đợi gửi, webhook trạng thái và cơ chế gửi lại; hiện hệ thống ghi nhận lần liên hệ thủ công.
- Môi trường công khai thật phải dùng HTTPS, bí mật do hệ thống quản lý secret cung cấp, sao lưu PostgreSQL có diễn tập phục hồi và giám sát lỗi/SLA.
