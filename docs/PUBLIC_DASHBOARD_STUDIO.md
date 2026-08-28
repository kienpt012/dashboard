# Public Dashboard Studio

## 1. Mục tiêu

Public Dashboard Studio là không gian dành riêng cho quản trị viên để thiết kế trang dashboard công khai mà người dân xem tại `/`. Công cụ tách phần **biên tập** khỏi phần **đang công bố**, nhờ đó quản trị viên có thể thử bố cục, đổi nội dung và xem trước mà không làm thay đổi trang đang phục vụ người dân.

Studio giải quyết bốn nhu cầu chính:

1. Chọn nhanh một template phù hợp thay vì phải thiết kế từ trang trắng.
2. Thêm, di chuyển và thay đổi kích thước các khối dữ liệu theo lưới responsive.
3. Gắn dữ liệu công khai vào widget hoặc khối HTML bằng cấu hình có kiểm soát, không cho nhập SQL hay JavaScript.
4. Quản lý đầy đủ vòng đời bản nháp, xem trước, công bố, lịch sử và khôi phục phiên bản.

Trang quản trị của tính năng nằm tại:

```text
http://localhost:8080/admin/public-dashboard
```

Chỉ tài khoản có vai trò `ADMIN` được mở Studio, chỉnh sửa bản nháp, thay đổi trạng thái công khai của văn bản và công bố phiên bản mới.

## 2. Kiến trúc và nguyên tắc bảo mật

### 2.1. Tách bản nháp và bản công bố

`PublicDashboard` lưu bản nháp hiện tại, số phiên bản bản nháp và revision đang được công bố. Mỗi lần công bố tạo một bản ghi bất biến về bố cục, cấu hình widget và các định danh dữ liệu được chọn trong `PublicDashboardRevision`. Trang người dân chỉ đọc revision đã công bố; thao tác lưu bản nháp chỉ tăng phiên bản chống xung đột và không làm thay đổi trang đang phục vụ người dân. Metadata của một bản công bố văn bản có vòng đời kiểm duyệt và nhật ký thay đổi riêng; revision dashboard không sao chép metadata này.

Khi khôi phục một phiên bản cũ, hệ thống không sửa lịch sử. Nội dung của phiên bản được chọn được sao chép thành một bản nháp mới để quản trị viên kiểm tra và công bố lại. Cách này giúp giữ được đầy đủ dấu vết thay đổi.

### 2.2. Nguồn dữ liệu có danh mục

Widget không được phép chứa SQL, URL API tùy ý hoặc mã JavaScript. Mỗi widget chỉ lưu khóa nguồn dữ liệu, bộ lọc, ánh xạ trường và định dạng hiển thị. Backend quyết định nguồn nào được phép dùng trên trang công khai và chỉ trả dữ liệu đã đi qua quy trình công bố.

Các nhóm dữ liệu công khai có thể sử dụng gồm số liệu tổng quan, chỉ tiêu đã công bố, kết quả theo đơn vị, phản ánh đã công khai và văn bản có `DocumentPublication` hợp lệ. Dữ liệu nội bộ, bản ghi đang chờ duyệt và thông tin cá nhân không được đưa vào danh mục nguồn.

### 2.3. HTML tùy biến có giới hạn

Khối HTML dành cho việc trình bày nội dung đặc thù, không phải nơi chạy ứng dụng con. Hệ thống không chấp nhận `script`, trình xử lý sự kiện dạng `on...`, URL `javascript:`, biểu mẫu, object nhúng hoặc mã có khả năng gọi mạng tùy ý. Không nhập mật khẩu, token, dữ liệu cá nhân hay nội dung nội bộ vào HTML.

Dữ liệu được đưa vào HTML bằng **slot**. Slot là vị trí đã đặt tên trong HTML và có binding riêng. Giá trị dữ liệu được chèn dưới dạng văn bản an toàn; quản trị viên không cần và không được viết JavaScript để lấy dữ liệu.

Ví dụ HTML:

```html
<section class="public-note">
  <strong>{{overall_progress}}</strong>
  <span>tiến độ chung</span>
</section>
```

Binding tương ứng:

```json
{
  "slot": "overall_progress",
  "label": "Tiến độ chung",
  "source": "overview",
  "field": "overallProgress",
  "format": "percent"
}
```

Không dùng `innerHTML` để chèn giá trị của binding. Nội dung dữ liệu phức tạp hoặc có tương tác nên dùng widget chuẩn của hệ thống thay vì cố viết bằng HTML tùy biến.

### 2.4. Công bố văn bản theo bản chụp

`SourceDocument` là kho văn bản nội bộ và không tự động trở thành dữ liệu công khai. Một văn bản chỉ xuất hiện trong Studio sau khi quản trị viên chủ động tạo hoặc cập nhật `DocumentPublication`. API tải công khai chỉ phục vụ những bản công bố hợp lệ, không mở trực tiếp trường dữ liệu tệp trong kho nội bộ.

Trước khi công bố, quản trị viên phải kiểm tra nội dung, thông tin cá nhân, mức độ mật, tên tệp, MIME type và quyền phát hành. Việc thêm widget “Văn bản công khai” không thay thế bước kiểm tra này.

## 3. Vai trò và trách nhiệm

| Vai trò | Quyền trong Public Dashboard Studio |
| --- | --- |
| `ADMIN` | Mở Studio, chọn template, thêm/sửa/xóa widget, kéo thả, resize, cấu hình binding, quản lý HTML, công bố văn bản, lưu nháp, công bố dashboard và khôi phục phiên bản |
| `MANAGER` | Không chỉnh sửa hoặc công bố dashboard công khai |
| `STAFF` | Không chỉnh sửa hoặc công bố dashboard công khai |
| `VIEWER` | Không chỉnh sửa hoặc công bố dashboard công khai |
| Người dân | Chỉ xem phiên bản đã công bố qua API và trang công khai, không cần đăng nhập |

Quản trị viên chịu trách nhiệm cuối cùng về nội dung và nguồn dữ liệu xuất hiện trên trang người dân. Studio hỗ trợ kiểm tra kỹ thuật nhưng không thay thế quy trình phê duyệt nghiệp vụ của đơn vị.

## 4. Hướng dẫn sử dụng

### 4.1. Mở Studio

1. Đăng nhập bằng tài khoản quản trị tại `/admin/login`.
2. Chọn **Thiết kế trang công khai** trong thanh điều hướng quản trị hoặc truy cập trực tiếp `/admin/public-dashboard`.
3. Chờ hệ thống tải bản nháp hiện tại, phiên bản đang công bố, danh mục dữ liệu và danh sách văn bản.
4. Kiểm tra nhãn trạng thái trên thanh công cụ trước khi bắt đầu. Nếu màn hình báo xung đột phiên bản, tải lại dữ liệu trước khi tiếp tục.

### 4.2. Chọn template

1. Mở khu vực **Template**.
2. Đọc tên và mô tả của từng bố cục.
3. Chọn template phù hợp với mục tiêu công bố.
4. Xác nhận áp dụng nếu bản nháp đang có nội dung. Việc áp dụng template thay đổi bản nháp nhưng không thay đổi phiên bản đang công bố.
5. Điều chỉnh widget và binding sau khi template được đưa vào canvas.

Nên bắt đầu bằng template gần nhất với nhu cầu rồi tinh chỉnh. Không nên tạo quá nhiều widget cùng loại vì sẽ làm trang dài, tải chậm và khó đọc trên điện thoại.

### 4.3. Thêm widget

1. Mở **Thư viện khối**.
2. Chọn một trong các loại widget được hỗ trợ: số liệu tổng quan, danh sách chỉ tiêu, tiến độ theo đơn vị, kết quả phản ánh, văn bản công khai, nội dung văn bản, HTML tùy biến hoặc nút kêu gọi hành động.
3. Kéo widget vào canvas hoặc dùng nút **Thêm**.
4. Chọn widget vừa tạo để mở bảng thuộc tính.
5. Đặt tiêu đề và các tùy chọn phù hợp với loại widget, chẳng hạn số lượng bản ghi, chế độ chọn chỉ tiêu, chỉ tiêu cụ thể hoặc văn bản cụ thể.
6. Kiểm tra trạng thái tải, trạng thái rỗng và thông báo lỗi trong phần xem trước.

### 4.4. Kéo, thả và thay đổi kích thước

1. Giữ tay nắm kéo ở đầu widget và di chuyển đến vị trí mong muốn.
2. Thả widget khi ô đích được đánh dấu.
3. Dùng tay nắm resize ở góc widget để thay đổi chiều rộng hoặc chiều cao.
4. Chuyển lần lượt qua chế độ desktop, tablet và mobile để điều chỉnh bố cục riêng cho từng kích thước.
5. Không đặt widget chồng lên nhau. Nếu hệ thống tự dồn lưới, kiểm tra lại thứ tự đọc từ trên xuống dưới.

Việc thiết kế nên thực hiện trên máy tính có chuột hoặc bàn di chuột. Sau mỗi thay đổi lớn nên lưu nháp và xem trước trên cả ba kích thước.

### 4.5. Hoàn tác, nhân bản và chỉnh giao diện chung

1. Dùng **Hoàn tác** hoặc **Làm lại** trên thanh lệnh để quay lại các thay đổi bố cục gần nhất.
2. Chọn một widget và bấm **Nhân bản** nếu cần tạo khối mới với cùng cấu hình; đổi tiêu đề và nguồn dữ liệu sau khi nhân bản.
3. Mở phần **Giao diện chung** trong bảng thuộc tính để chỉnh màu nhấn, màu nền trang, nền khối và màu chữ.
4. Điều chỉnh độ rộng vùng nội dung và độ bo góc trong giới hạn giao diện cho phép.
5. Dùng nút **Header** và **Footer** trên thanh canvas để bật hoặc tắt hai vùng này trong bản thiết kế.
6. Kiểm tra độ tương phản và khoảng trống trên cả ba chế độ thiết bị trước khi lưu.

### 4.6. Gắn dữ liệu cho widget

1. Chọn widget cần cấu hình.
2. Với widget chuẩn, dùng các trường cấu hình được hiển thị trong bảng thuộc tính. Ví dụ: widget chỉ tiêu có chế độ **Nổi bật**, **Tất cả** hoặc **Đã chọn**; widget văn bản cho phép chọn đúng các bản công bố cần hiển thị.
3. Đặt giới hạn số bản ghi để trang công khai không quá dài.
4. Với HTML tùy biến, tạo binding bằng cách chọn một nguồn được backend cung cấp: tổng quan, chỉ tiêu hoặc văn bản.
5. Chọn trường dữ liệu và định dạng số, phần trăm hoặc ngày khi phù hợp.
6. Xem dữ liệu mẫu, kiểm tra đơn vị và trạng thái rỗng trước khi lưu.

Nếu không tìm thấy trường cần dùng, không nhập đường dẫn API hoặc SQL vào widget. Hãy yêu cầu bổ sung nguồn vào danh mục dữ liệu công khai và kiểm thử backend trước.

### 4.7. Tạo khối HTML và chèn slot dữ liệu

1. Thêm widget **HTML tùy biến**.
2. Chọn một mẫu nhanh hoặc nhập cấu trúc trình bày trong vùng mã HTML.
3. Đặt con trỏ tại vị trí cần hiển thị dữ liệu.
4. Chọn **Thêm dữ liệu** để tạo binding.
5. Đặt tên slot dễ hiểu, chỉ dùng chữ thường, số và dấu gạch dưới, ví dụ `overall_progress`.
6. Chọn nguồn, trường và định dạng cho slot trong bảng binding.
7. Chọn **Chèn tại con trỏ** để hệ thống đặt token `{{ten_slot}}` đúng vị trí, sau đó kiểm tra dữ liệu mẫu trong chế độ xem trước.
8. Lưu nháp và thử lại ở desktop, tablet và mobile.

Không chèn `script`, iframe, form hoặc mã theo dõi. Không dùng HTML tùy biến để thay thế danh sách lớn hoặc chức năng cần tương tác với API.

### 4.8. Chọn và công bố văn bản

1. Mở khu vực **Văn bản công khai** trong Studio.
2. Tìm văn bản theo mã hoặc tiêu đề.
3. Chỉ chọn văn bản có trạng thái **Đã xử lý**. Trước đó, mở văn bản trong Kho văn bản để kiểm tra nội dung gốc, dữ liệu nhạy cảm và quyền phát hành.
4. Chọn **Chuẩn bị công bố**, nhập tiêu đề dành cho người dân và tóm tắt an toàn.
5. Đánh dấu xác nhận đã loại bỏ thông tin cá nhân, nội dung nội bộ và dữ liệu không được phép công bố, sau đó lưu trạng thái công khai.
6. Nếu gỡ công khai, kiểm tra trước các widget đang tham chiếu đến văn bản đó.
7. Thêm widget **Văn bản công khai**, chọn các bản công bố được phép hiển thị và đặt số lượng tối đa.
8. Kiểm tra thử liên kết tải trong chế độ preview trước khi công bố dashboard.

### 4.9. Xem trước đa thiết bị

1. Chọn **Xem trước** trên thanh công cụ.
2. Kiểm tra lần lượt desktop, tablet và mobile.
3. Kiểm tra thứ tự đọc, chữ bị cắt, widget tràn lề, danh sách quá chật, liên kết và trạng thái rỗng.
4. Kiểm tra cả trường hợp có nhiều dữ liệu và không có dữ liệu.
5. Tắt chế độ xem trước để quay lại canvas chỉnh sửa; trang `/` vẫn hiển thị revision đang công bố.

Nội dung xem trước không phải là trang đã công bố và không được dùng thay cho đường dẫn chính thức `/`.

### 4.10. Lưu bản nháp

Studio tự gửi yêu cầu lưu bản nháp sau một khoảng dừng ngắn khi có thay đổi. Nút **Lưu** vẫn được cung cấp để quản trị viên chủ động tạo điểm lưu trước khi chuyển việc hoặc công bố.

1. Chọn **Lưu** sau khi hoàn tất một nhóm thay đổi quan trọng.
2. Chờ thanh trạng thái chuyển sang **Đã lưu bản nháp**.
3. Nếu hệ thống báo phiên bản đã thay đổi bởi người khác, không tiếp tục ghi đè. Tải lại editor, đối chiếu thay đổi và áp dụng lại phần cần thiết.

Trước khi đóng trình duyệt, luôn kiểm tra trạng thái **Đã lưu bản nháp**. Hoàn tác/làm lại chỉ tồn tại trong phiên biên tập hiện tại và không thay thế lịch sử revision đã công bố.

### 4.11. Công bố

1. Lưu bản nháp mới nhất.
2. Chọn **Xem trước** và hoàn thành kiểm tra desktop, tablet, mobile.
3. Kiểm tra các cảnh báo về binding, văn bản, HTML, widget không có dữ liệu hoặc liên kết không hợp lệ.
4. Chọn **Công bố**.
5. Nhập ghi chú ngắn mô tả thay đổi để phục vụ lịch sử vận hành.
6. Xác nhận công bố.
7. Mở `/` trong tab riêng và kiểm tra lại phiên bản thực tế mà người dân nhận được.

Việc công bố phải là thao tác chủ động của quản trị viên. API công khai chỉ thay đổi sau khi transaction công bố hoàn tất.

### 4.12. Lịch sử và khôi phục

1. Mở **Lịch sử phiên bản**.
2. Xem thời điểm, người thao tác, trạng thái và ghi chú của từng phiên bản.
3. Chọn **Khôi phục thành bản nháp** ở phiên bản muốn dùng lại.
4. Hệ thống sao chép cấu hình của revision đó vào bản nháp hiện tại.
5. Đóng lịch sử, dùng chế độ xem trước để kiểm tra bản nháp vừa khôi phục.
6. Kiểm tra nguồn dữ liệu và văn bản vì trạng thái công khai hiện tại có thể đã thay đổi.
7. Công bố bản nháp mới sau khi kiểm tra hoàn tất.

Khôi phục không tự động đưa nội dung lên trang người dân và không xóa phiên bản mới hơn.

## 5. Lưu ý an toàn

1. Chỉ sử dụng dữ liệu và văn bản đã được phê duyệt cho mục đích công khai.
2. Không đưa họ tên, số điện thoại, email, địa chỉ hoặc nội dung nội bộ vào widget.
3. Không nhập SQL, token, mật khẩu, khóa API hoặc JavaScript vào cấu hình và HTML.
4. Không dùng URL ngoài danh sách miền được đơn vị chấp thuận.
5. Luôn xem trước trên mobile; bố cục tốt trên desktop có thể không phù hợp với điện thoại.
6. Không gỡ công khai văn bản mà chưa kiểm tra widget đang sử dụng văn bản đó.
7. Khi có cảnh báo binding hoặc sanitization, sửa nội dung thay vì tìm cách bỏ qua kiểm tra.
8. Luôn ghi chú thay đổi khi công bố để thuận tiện truy vết và khôi phục.
9. Sau khi công bố, kiểm tra trực tiếp trang `/`; không chỉ dựa vào preview.

## 6. Xử lý lỗi thường gặp

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| Không mở được Studio | Tài khoản không phải `ADMIN`, phiên hết hạn hoặc API chưa sẵn sàng | Đăng nhập lại bằng quản trị viên; kiểm tra `/api/health` và log API |
| Bản nháp không lưu | Xung đột phiên bản, mất mạng hoặc cấu hình không hợp lệ | Không ghi đè; tải lại editor, kiểm tra thông báo validation rồi lưu lại |
| Widget không có dữ liệu | Nguồn chưa có bản ghi công khai, chế độ chọn sai hoặc chưa chọn bản ghi | Kiểm tra chế độ, danh sách đã chọn, số lượng tối đa và trạng thái công bố của dữ liệu |
| Widget báo binding lỗi | Trường đã đổi, sai nguồn hoặc định dạng không phù hợp | Chọn lại nguồn và trường từ danh mục; không sửa JSON thủ công nếu không cần thiết |
| HTML bị loại bỏ một phần | Nội dung chứa thẻ, thuộc tính hoặc URL không an toàn | Dùng HTML/CSS đơn giản; thay chức năng tương tác bằng widget chuẩn |
| Văn bản không xuất hiện | Chưa tạo `DocumentPublication`, đã bị gỡ công khai hoặc tệp không hợp lệ | Kiểm tra trạng thái trong mục Văn bản công khai và công bố lại sau khi rà soát |
| Preview đúng nhưng trang `/` chưa đổi | Bản nháp chưa được công bố hoặc trình duyệt/proxy đang cache | Kiểm tra phiên bản đang công bố; tải lại trang; kiểm tra response của API public |
| Không thể công bố | Có widget/binding/văn bản không hợp lệ hoặc phiên bản đã thay đổi | Sửa toàn bộ cảnh báo, tải lại editor nếu có conflict rồi thử lại |
| Khôi phục xong nhưng trang chưa đổi | Khôi phục chỉ tạo bản nháp | Xem trước bản nháp khôi phục và thực hiện công bố |

Các lệnh chẩn đoán cơ bản:

```powershell
docker compose ps
Invoke-RestMethod http://127.0.0.1:3000/api/health
docker compose logs --tail 200 api
docker compose logs --tail 200 web
```

## 7. API tóm tắt

Các endpoint nội bộ yêu cầu JWT hợp lệ và vai trò `ADMIN`.

| Phương thức | Endpoint | Mục đích |
| --- | --- | --- |
| `GET` | `/api/public-dashboard/editor` | Tải trạng thái editor, bản nháp, phiên bản công bố, lịch sử, danh mục dữ liệu và văn bản cần thiết cho Studio |
| `PUT` | `/api/public-dashboard/draft` | Kiểm tra và lưu cấu hình bản nháp; áp dụng kiểm soát phiên bản để chống ghi đè |
| `POST` | `/api/public-dashboard/publish` | Kiểm tra bản nháp và công bố một revision mới trong giao dịch nguyên tử |
| `POST` | `/api/public-dashboard/revisions/:revision/restore` | Sao chép một revision cũ thành bản nháp mới để kiểm tra trước khi công bố lại |
| `PUT` | `/api/public-dashboard/documents/:sourceDocumentId/publication` | Tạo, cập nhật hoặc gỡ trạng thái công khai của một văn bản nguồn |

Các endpoint công khai không yêu cầu đăng nhập nhưng chỉ trả snapshot đã công bố.

| Phương thức | Endpoint | Mục đích |
| --- | --- | --- |
| `GET` | `/api/public/dashboard` | Trả cấu hình dashboard đang công bố và dữ liệu công khai cần để render trang người dân |
| `GET` | `/api/public/dashboard/documents/:id/download` | Tải tệp từ một `DocumentPublication` còn hiệu lực |

Không dùng API nội bộ từ trang người dân. Không thêm endpoint cho phép truyền SQL, URL tùy ý hoặc tên model Prisma từ client.

## 8. Checklist trước khi công bố

### Nội dung và dữ liệu

- [ ] Mọi chỉ tiêu trong widget đã được công bố.
- [ ] Mọi văn bản đã được kiểm tra và có `DocumentPublication` hợp lệ.
- [ ] Không có thông tin cá nhân, ghi chú nội bộ hoặc dữ liệu đang chờ duyệt.
- [ ] Tiêu đề, đơn vị, mốc thời gian và nguồn dữ liệu rõ ràng.
- [ ] Trạng thái không có dữ liệu được trình bày dễ hiểu.

### Giao diện

- [ ] Không có widget chồng lấn hoặc tràn khỏi canvas.
- [ ] Bố cục desktop, tablet và mobile đều đã được xem trước.
- [ ] Chữ đủ lớn, tương phản phù hợp và không bị cắt.
- [ ] Thứ tự đọc trên mobile hợp lý.
- [ ] Liên kết, nút và tệp tải hoạt động.

### An toàn

- [ ] HTML không chứa JavaScript, iframe, form hoặc URL không được phép.
- [ ] Mọi slot HTML có binding hợp lệ và giá trị được chèn dưới dạng text.
- [ ] Không có widget sử dụng nguồn dữ liệu nội bộ.
- [ ] Tệp công khai có MIME type, tên tải và quyền phát hành đúng.
- [ ] Không còn cảnh báo validation hoặc xung đột phiên bản.

### Vận hành

- [ ] Bản nháp đã lưu thành công.
- [ ] Ghi chú phiên bản mô tả đúng nội dung thay đổi.
- [ ] Công bố hoàn tất không có lỗi transaction.
- [ ] Trang `/` đã được kiểm tra sau khi công bố.
- [ ] Phiên bản trước vẫn xuất hiện trong lịch sử và có thể khôi phục thành bản nháp.
