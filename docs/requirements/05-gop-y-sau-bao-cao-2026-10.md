# Góp ý sau buổi báo cáo tháng 10/2026 và hướng xử lý

> Nguồn: buổi báo cáo sản phẩm ngày 21/10/2026, buổi trao đổi ngày 23/10/2026 và hai cuộc gọi cùng ngày (bản ghi âm
> do nhóm giữ, không đưa vào kho mã). Tài liệu này chỉ ghi yêu cầu nghiệp vụ đã rút ra; chỗ nghe không rõ được ghi là
> "cần xác nhận". Mã G-xx dùng để dẫn chiếu trong mô tả PR và quyết định kiến trúc.

## 1. Bàn làm việc số

| Mã | Góp ý | Hướng xử lý |
|---|---|---|
| G-01 | Mỗi công chức đang dùng khoảng năm phần mềm (thư công vụ, quản lý văn bản, dịch vụ công…), mỗi lần làm việc phải tự lưu dấu trang. Bàn làm việc số là nơi bấm một cái là mở đúng phần mềm theo vai trò của mình. | Khay **Ứng dụng công vụ**: danh mục do quản trị khai báo (tên, địa chỉ, biểu tượng, nhóm, công dụng, đối tượng dùng), cộng với lối tắt riêng của từng người. |
| G-02 | Đưa chuột vào biểu tượng thì thấy phần mở rộng: cái đó để làm gì. | Chú giải công dụng trên từng ứng dụng. |
| G-03 | Nếu nối được (API hoặc RPA) thì hiện số việc mới ngay trên biểu tượng, ví dụ "3 văn bản mới"; chưa nối được thì chỉ cần biểu tượng. Chỉ làm ở mức đơn giản. | Huy hiệu số: ứng dụng nội bộ lấy số từ IOC; ứng dụng ngoài lấy từ một địa chỉ JSON do quản trị khai báo (gọi qua máy chủ). |
| G-04 | Giấy note dán trên màn hình: lãnh đạo ở bất cứ đâu dán note lên bàn làm việc của cán bộ; chuyên viên cũng dán được cho lãnh đạo; trong nhóm trao đổi với nhau qua note. Xong thì đánh dấu. | **Giấy note** gửi giữa người với người: người nhận thấy trên bàn, đánh dấu đã xem/đã xong, trả lời ngắn; người gửi biết ai đã xem, ai đã xong. |
| G-05 | Hệ thống là hệ thống chỉ tiêu: khi chỉ tiêu chậm hoặc đến lịch cập nhật ("8 giờ sáng mai phải cập nhật thu ngân sách") thì tờ note của hệ thống tự hiện trên bàn của người được giao; dưới tờ note ghi tên người phụ trách; trưởng phòng cũng thấy vì là số liệu của phòng; không dán lên mọi màn hình. | **Giấy note hệ thống** sinh từ dữ liệu IOC: kỳ báo cáo đến hạn hôm nay/ngày mai, kỳ quá hạn, chỉ tiêu có nguy cơ, giải trình chờ trả lời, báo cáo chờ duyệt sắp tự thông qua. Hiện cho người phụ trách và trưởng phòng chủ trì. |
| G-06 | Người dùng không vào trang chủ để xem cảnh báo. Sáng đăng nhập là ở bàn làm việc và thấy ngay hôm nay phải làm gì, ngày mai có việc gì. | Khối **Hôm nay · Ngày mai** ở đầu bàn làm việc và tiện ích lịch việc. |
| G-07 | Công cụ nào, văn bản nào hay dùng thì kéo ra để ở góc bàn. | Ghim văn bản, chỉ tiêu, trang đang lọc lên bàn. |
| G-08 | Đặt ngày giờ ở góc cho lịch sự; cá nhân hoá càng nhiều càng hay. | Giữ đồng hồ, lịch âm dương, hình nền; thay các câu khẩu hiệu bằng thông tin thật. |
| G-09 | Chưa có cơ chế API với hệ thống khác; về sau sẽ khai báo để lấy số liệu qua API. | Giữ tiện ích biểu đồ từ API; khai báo kết nối tập trung để sau này mở rộng. |

## 2. Văn bản chỉ đạo và nhiệm vụ

| Mã | Góp ý | Hướng xử lý |
|---|---|---|
| G-10 | Quản lý văn bản chỉ đạo: chương trình công tác, thông báo kết luận, kế hoạch. | Màn hình **Văn bản chỉ đạo**: mỗi văn bản là một bộ nhiệm vụ gắn với tệp trong Kho văn bản. |
| G-11 | Phân rã văn bản chỉ đạo thành việc giao cho phòng chuyên môn. Việc giống một chỉ tiêu nhưng có hạn cụ thể, khác chỉ tiêu năm hay chỉ tiêu cập nhật hằng tháng. | Nhiệm vụ là chỉ tiêu loại Nhiệm vụ (hoàn thành 100%), có phòng chủ trì, phối hợp, hạn; dùng lại hồ sơ, báo cáo, duyệt, minh chứng sẵn có. |
| G-12 | Ở Lái Thiêu, Chánh Văn phòng là người phân việc cho các phòng; nơi khác do lãnh đạo UBND phân. | Thiết lập **Người phân việc**: Lãnh đạo UBND hoặc Chánh Văn phòng. |
| G-13 | Nhìn được "tháng 10 Phòng Kinh tế phải làm gì": danh sách chỉ tiêu và công việc, theo thông báo kết luận số mấy. | Bảng **Việc theo tháng** của từng phòng, gom theo văn bản, in được. |
| G-14 | Thống kê việc thực hiện văn bản chỉ đạo. | Thống kê theo văn bản, theo phòng, theo tháng; xuất Excel. |
| G-15 | Văn bản chỉ đạo có hạn thì đến lúc phải hiện lên để khỏi trễ. | Nhắc hạn nhiệm vụ qua thông báo và giấy note hệ thống. |
| G-16 | Một chỉ tiêu kéo theo nhiều văn bản hướng dẫn, cuộc họp, nhắc nhở; nhìn vào chỉ tiêu phải thấy lãnh đạo đã chỉ đạo, thúc đẩy thế nào. | Nhiệm vụ liên kết được với chỉ tiêu; hồ sơ chỉ tiêu hiện các nhiệm vụ liên quan cùng văn bản chỉ đạo. |

Hệ thống không thay phần mềm quản lý văn bản đến/đi của cơ quan (đăng ký số đến, ký số, phát hành).

## 3. Chỉ tiêu

| Mã | Góp ý | Hướng xử lý |
|---|---|---|
| G-20 | Người dùng không cần biết mã do hệ thống tự sinh. Ở danh mục, báo cáo, cảnh báo phải thấy chỉ tiêu nằm trong quyết định, văn bản nào. | Thay mã hệ thống bằng số ký hiệu văn bản giao và số thứ tự trong văn bản; mã hệ thống chỉ còn trong hồ sơ và tìm kiếm. |
| G-21 | Một chỉ tiêu có thể được giao bởi hai văn bản với mức khác nhau (Thành phố giao một mức, Đảng uỷ phường giao cao hơn một nấc). AI chỉ phát hiện và báo; trưởng phòng quyết định gộp. Sau khi gộp phải thấy cả hai văn bản. | Liên kết các chỉ tiêu cùng nội dung giữa các văn bản: báo cáo một lần, đánh giá theo từng mức giao. |
| G-22 | Cần biết văn bản nào cấp cao hơn. | Hiện cấp giao (Trung ương, Thành phố, địa phương) cạnh văn bản và sắp theo cấp. |
| G-23 | Chuyên viên, trưởng phòng muốn xem chỉ tiêu của phòng khác thì xem được (chỉ xem, không sửa). Thành viên Uỷ ban giám sát được các phòng. | Quyền **xem liên phòng** bật mặc định; sửa vẫn theo phòng. |
| G-24 | Lãnh đạo chỉ xem và duyệt; số liệu chưa đúng thì trả cho chuyên viên cập nhật lại. Lãnh đạo không tự sửa số liệu. | Lãnh đạo không còn ghi nhận số liệu trực tiếp. |
| G-25 | Đề xuất chỉ tiêu do Văn phòng hoặc lãnh đạo duyệt; ai duyệt phải được ghi lại. | Người phân việc duyệt được đề xuất của mọi phòng; người duyệt hiện trên từng đề xuất. |
| G-26 | Đề tài cần AI dự đoán khả năng trễ của chỉ tiêu; dữ liệu các kỳ cũ sẽ được cung cấp sau. | Mô hình dự báo khả năng không đạt, huấn luyện lại được khi có dữ liệu thật. |
| G-27 | Văn bản giao cho mọi phường dài hàng trăm trang; chỉ cần phần của phường mình. Tốc độ đọc không phải vấn đề. | Đã có: chỉ đọc phần của địa phương. Không tối ưu thêm tốc độ. |

## 4. Giao diện

| Mã | Góp ý | Hướng xử lý |
|---|---|---|
| G-30 | Gọn nhưng thiếu điểm nhấn: tiêu đề khối, tiêu đề bảng chìm vào nền và cỡ chữ ngang nội dung; thanh trên và nội dung dính vào nhau. | Tăng phân cấp thị giác cho tiêu đề khối, tiêu đề bảng, thanh đầu trang. |
| G-31 | Cuộn bảng dài thì mất dòng tiêu đề. | Giữ dòng tiêu đề bảng khi cuộn. |
| G-32 | Cảnh báo phải đọc ra ngay "chỉ tiêu nào – bị gì" (ví dụ "Tỷ lệ giải ngân vốn đầu tư công – có nguy cơ không đạt"), bỏ mã và câu dài của hệ thống. | Tên chỉ tiêu đứng đầu, kèm cụm trạng thái ngắn. |
| G-33 | Hoạt động gần đây: mỗi loại việc (gửi báo cáo, duyệt…) một màu, gom theo loại, ngày giờ hiện sẵn không phải rê chuột, sắp theo thời gian. | Nhãn màu theo loại thao tác, hiện ngày giờ. |
| G-34 | Màn hình phản ánh không cần cầu kỳ: thấy ngay lĩnh vực, bấm vào mới xem nội dung. | Giữ gọn; lĩnh vực hiện rõ ở danh sách. |

## 5. Trang công khai và tài khoản

| Mã | Góp ý | Hướng xử lý |
|---|---|---|
| G-40 | Người dân cần xem lịch làm việc của lãnh đạo UBND; các phường chưa có. Cách làm: tải tệp lịch lên như văn bản công khai rồi xem ngay trên trang. | Khối **Lịch làm việc của lãnh đạo** trên trang công khai, lấy từ tệp lịch tuần do văn phòng tải lên. |
| G-41 | Quên mật khẩu phải tự lấy lại được qua thư hoặc tin nhắn, có giới hạn số lần gửi mã. | Đã có qua thư công vụ. Tin nhắn cần cổng SMS của đơn vị; chừa sẵn cấu hình. |

## 6. Ghi nhận khác

- Bản hướng dẫn sử dụng sẽ được chuyển cho lãnh đạo xem trước khi triển khai; cần cập nhật theo các thay đổi trên.
- Chỉ tiêu đầu tư công cần theo dõi theo công trình và tiến độ giải ngân (cần xác nhận phạm vi).
