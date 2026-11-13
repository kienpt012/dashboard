# Quyền xem liên phòng, báo cáo và dự báo

Gói C triển khai G-21, G-22, G-23, G-24 và G-26. G-25 thuộc luồng duyệt đề xuất của gói B. Không gộp bản ghi chỉ tiêu và không đổi mã chuẩn phục vụ báo cáo nhiều mức giao.

## Phạm vi đọc và ghi

`SystemSetting.crossDepartmentView` mặc định `true`, quản trị đổi tại Cấu hình (HT-04). `GET /settings/client` công bố cờ này cho các tài khoản đăng nhập.

| Vai trò | Đọc liên phòng khi bật | Gửi số liệu | Duyệt, yêu cầu cập nhật lại | Quản lý mô hình |
| --- | --- | --- | --- | --- |
| ADMIN | Toàn địa phương | Ghi nhận trực tiếp | Toàn địa phương | Có |
| LEADER | Toàn địa phương | Không | Toàn địa phương | Có |
| CLERK | Giữ phạm vi đọc cũ | Không | Không | Không |
| MANAGER | Có | Phòng chủ trì của mình | Phòng chủ trì của mình | Không |
| STAFF | Có | Phòng chủ trì của mình | Không | Không |
| VIEWER | Có | Không | Không | Không |

`resolveDepartmentScope` vẫn là phạm vi ghi. `resolveReadDepartmentScope` chỉ dùng cho đọc chỉ tiêu, hồ sơ, minh chứng, nguồn văn bản, tổng hợp, xuất Excel và dự báo. Các truy vấn danh mục, tổng hợp và trình chiếu nhận `scope=mine|all`; phạm vi mặc định của người thuộc phòng là phòng mình, lựa chọn giao diện được lưu theo tài khoản. Khi tắt cấu hình, đọc phòng khác bị từ chối và `scope=all` trở về phạm vi cũ. Hồ sơ phòng khác có nhãn **Chỉ xem**. Người thuộc phòng chưa hoạt động không được mở rộng quyền đọc.

Việc của tôi, hàng chờ duyệt, mục việc cần xử lý và phản ánh giữ phạm vi riêng trước đây. Phạm vi đọc không được truyền vào hàm kiểm tra quyền ghi. Nhật ký ghi sự kiện, đối tượng, kỳ và trường thay đổi; lý do cá nhân không được sao chép vào audit metadata.

Lãnh đạo bị chặn ở gửi báo cáo trực tiếp, xem trước/ghi nhận Excel và thêm/sửa/xóa/nhập dòng kho dữ liệu có thể thay số thực hiện. Quản trị vẫn ghi nhận dữ liệu ban đầu; dòng thời gian dùng nhãn **Quản trị ghi nhận**. Quyền giao việc, đánh giá, chỉ đạo và duyệt của lãnh đạo giữ nguyên.

## Yêu cầu cập nhật lại

`POST /targets/:id/updates/:updateId/request-revision` nhận `{ "reason": "Lý do ít nhất 5 ký tự" }`. Chỉ quản trị, lãnh đạo hoặc trưởng phòng chủ trì được gọi trên báo cáo đã duyệt của chỉ tiêu đang hoạt động, có kỳ xác định. Yêu cầu trùng đang mở và báo cáo đã có bản duyệt mới hơn bị từ chối. Giới hạn 20 yêu cầu/phút/tài khoản.

Yêu cầu được lưu ở `revisionRequestedAt`, `revisionRequestedBy`, `revisionReason`, `revisionResolvedAt` của báo cáo, tạo thông báo, dòng thời gian và mục **Cần cập nhật lại** tại Việc của tôi. Khi chưa giao chuyên viên, trưởng phòng nhận thông báo. Báo cáo gốc và số chính thức được giữ nguyên. Báo cáo thay thế cùng kỳ chỉ đổi số chính thức và đóng yêu cầu khi được duyệt, tự thông qua hoặc quản trị ghi nhận; nhóm liên kết cũng đóng yêu cầu cùng kỳ sau đồng bộ. Bản ghi cũ vẫn hiện trong lịch sử.

## Liên kết các mức giao

`Target.linkGroupId` nhóm các chỉ tiêu cùng số liệu thực hiện. Gợi ý chỉ xét khác bộ, cùng năm, cùng đơn vị, cùng mã chuẩn hoặc độ giống tên Levenshtein chuẩn hóa ít nhất 0,85. Chuẩn hóa bỏ dấu, không phân biệt hoa thường và gộp khoảng trắng. Máy không tự quyết định liên kết.

Chỉ liên kết chỉ tiêu nhập tay đang hoạt động và không có con. Tần suất và chiều đánh giá phải giống nhau để một kỳ dùng chung có nghĩa. Muốn thay đơn vị, tần suất, chiều, năm, bộ hoặc nguồn số liệu phải bỏ liên kết trước; không được thêm con dưới chỉ tiêu đang liên kết. Các mức giao được phép khác nhau.

| API | Chức năng |
| --- | --- |
| `GET /target-links/suggestions?year=2026` | Gợi ý và quyền xử lý từng cặp |
| `GET /target-links/targets/:id` | Các mức giao, sắp Trung ương → Thành phố → Địa phương |
| `POST /target-links/link` | Liên kết `{targetId, otherTargetId}` |
| `POST /target-links/ignore` | Bỏ qua gợi ý cùng cấu trúc dữ liệu |
| `DELETE /target-links/targets/:id` | Bỏ chỉ tiêu khỏi nhóm; giữ lịch sử |

Quản trị/lãnh đạo được quản lý; trưởng phòng phải quản lý tất cả phòng chủ trì của nhóm. Người phân việc là trưởng phòng OFFICE được nhận diện khi cấu hình `dispatchMode=OFFICE` của gói B có mặt; nếu chưa có cấu hình thì không tự mở rộng quyền.

Khi báo cáo nguồn được duyệt, tự thông qua hoặc quản trị ghi nhận, `mirrorApprovedReport` chạy trong cùng transaction, tạo báo cáo đã duyệt cho các chỉ tiêu còn lại với `mirroredFromId`, cùng kỳ và giá trị. Khóa duy nhất `(targetId, mirroredFromId)` chống tạo trùng. Mỗi chỉ tiêu đánh giá theo mức giao riêng. Minh chứng đọc từ báo cáo gốc, kể cả tệp bổ sung sau duyệt; không sao chép tệp hoặc tạo bản minh chứng thứ hai. Kỳ có báo cáo đồng bộ không bị tính thiếu.

## Mô hình dự báo

Màn hình **Mô hình dự báo** HT-09 tại `/admin/du-bao` dành cho quản trị và lãnh đạo. Hồ sơ, Danh mục, Trung tâm điều hành và Trình chiếu sử dụng kết quả chỉ đọc theo quyền.

Mô hình logistic TypeScript thuần, phiên bản đặc trưng `ioc-risk-v1`, chuẩn hóa theo tập huấn luyện, tối ưu gradient descent 1.800 vòng, tốc độ học 0,07, L2 0,015, hạt giống 20261113. Ràng buộc dấu các hệ số nhịp và chất lượng báo cáo để kết quả không đi ngược chiều nghiệp vụ khi các yếu tố khác giữ nguyên.

Đặc trưng gồm tỷ lệ đạt, thời gian đã trôi, chênh lệch nhịp, độ dốc năm kỳ gần nhất, tỷ lệ báo cáo trễ/thiếu, số lần trả báo cáo, chuyển/trả việc, giải trình đang mở, số ngày chưa giao người, loại bộ, chiều đánh giá, tần suất và loại tỷ lệ. Đặc trưng tại mốc t không dùng số liệu được duyệt hoặc sự kiện xảy ra sau t.

Chỉ tiêu đã hết kỳ và có ít nhất hai quan sát được lấy tại các mốc 25%, 50%, 65%, 80%. Nhãn 1 là không đạt cuối kỳ hoặc chỉ đạt sau hạn; nhãn 0 là đạt đúng hạn. Chia khoảng 75%/25% theo nhóm chỉ tiêu, không chia lẫn các mốc và các năm của cùng mã chuẩn. Chuẩn hóa chỉ học từ tập huấn luyện. Lưu AUC, accuracy, Brier và ma trận nhầm lẫn từ tập kiểm tra riêng, không dùng để tối ưu siêu tham số.

Cần ít nhất 40 mẫu và 12 nhóm, có cả hai lớp ở tập huấn luyện và kiểm tra. Nếu thiếu, dùng hệ số tiên nghiệm cố định, `trained=false`, `metrics=null`, hiện **Ước lượng theo nhịp thực hiện (chưa đủ dữ liệu huấn luyện)**. Không gán độ chính xác cho mô hình tiên nghiệm.

Nguy cơ Thấp: p < 0,4; Trung bình: 0,4 ≤ p < 0,7; Cao: p ≥ 0,7. Xác suất này là ước lượng mô hình, chưa được hiệu chuẩn trên dữ liệu thật của địa phương. Hai–ba yếu tố hiển thị được chọn theo độ lớn đóng góp vào logit.

Giá trị cuối kỳ: ngoại suy giá trị/thời gian đã qua cho cộng dồn; hồi quy tuyến tính theo thời gian cho tỷ lệ, chấm điểm và chiều càng thấp càng tốt. Không tự giới hạn đơn vị `%` ở 100 vì tỷ lệ thực hiện kế hoạch có thể vượt 100. Khoảng dự báo 95% ước lượng từ phần dư, chỉ trả khi có hơn hai điểm; không có đủ kỳ thì nêu rõ. Biểu đồ dùng trục thời gian thật. Dự báo chỉ áp dụng PLAN/SCORE/TASK còn hạn; STAT không có mức giao bị loại.

### API và huấn luyện

| API | Chức năng |
| --- | --- |
| `GET /forecast?year=2026&scope=all&risk=HIGH` | Danh sách, lọc nguy cơ/phòng/bộ |
| `GET /forecast/targets/:id` | Xác suất, giá trị cuối kỳ, khoảng dự báo, chuỗi đồ thị và giải thích |
| `GET /forecast/model` | Thông tin mô hình, chỉ số, trọng số, số dòng thật/mô phỏng |
| `POST /forecast/train` | Huấn luyện lại; ADMIN/LEADER; tối đa 3 lần/10 phút |
| `GET /forecast/history/template` | Biểu mẫu Excel và trang hướng dẫn |
| `POST /forecast/history` | Multipart `file`, `simulated`, `source`; ADMIN/LEADER |
| `GET /forecast/export` | Excel dự báo, dùng cùng phạm vi đọc |

Huấn luyện dòng lệnh, sau khi nạp `DATABASE_URL`:

```sh
npx tsx apps/api/src/forecast/train-cli.ts
```

Lịch sử Excel/CSV UTF-8 có năm, mã/tên, kỳ, giá trị, mức giao, ngày báo cáo, hạn; có thêm đơn vị, chiều, loại bộ. Tối đa 5 MB và 5.000 dòng, số thập phân CSV dùng dấu chấm. Chỉ nhận kỳ đánh giá đã kết thúc; kiểm tra ngày thật, kỳ/năm, tính nhất quán chuỗi; từ chối công thức Excel. Tệp lỗi không ghi một phần. Nhập lại cùng mã/năm/kỳ được bỏ qua. Dữ liệu ở `ForecastHistory`, không thay số vận hành. `ForecastModel` lưu hệ số, chuẩn hóa, số mẫu, chỉ số và thời điểm huấn luyện.

Jarvis có công cụ chỉ đọc `forecastRisk`: hỏi “Dự báo chỉ tiêu nào có nguy cơ không đạt toàn địa phương năm 2026”. Công cụ gọi cùng ForecastService và kiểm tra cùng quyền đọc, không tự viết SQL hoặc thay đổi số liệu.

## Dữ liệu trình diễn và kiểm tra

```sh
npx tsx apps/api/prisma/demo/extras-forecast.ts
```

Script chỉ chạy ở `ioc_wp_c`: thêm 768 dòng mô phỏng 2024–2025, 32 chuỗi; bộ Nghị quyết Đảng uỷ 2026 có 7 chỉ tiêu, 4 cặp liên kết, 3 gợi ý. Chạy lại không nhân đôi. Mọi lịch sử có `simulated=true` và nguồn ghi rõ MÔ PHỎNG. Chỉ số rất cao trên tập này không chứng minh khả năng dự báo trên thực tế; chủ đầu tư cần cung cấp lịch sử thật trước khi dùng để ra quyết định.

Kiểm tra: `npm run build`, `npm test`, `npm run test:workspace`. Sau khi nạp môi trường dev và đặt `QA_API_URL=http://localhost:3103/api`, chạy tuần tự `node scripts/qa-access.mjs`, `node scripts/qa-target-links.mjs`, `node scripts/qa-forecast.mjs`. Các bộ API tạo dữ liệu thử riêng và dọn sau khi chạy; cấu hình xem liên phòng được phục hồi.
