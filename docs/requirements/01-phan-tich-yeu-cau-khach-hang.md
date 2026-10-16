# Phân tích yêu cầu khách hàng — buổi trao đổi "Thoại 035_1"

> Tài liệu gốc của đợt thiết kế lại IOC (phiên bản 2). Mọi yêu cầu đều dẫn về mốc thời gian trong
> bản ghi âm để có thể nghe lại và đối chiếu. Bản chép lời thô không đưa vào kho mã vì có tên cán bộ thật.

## 1. Nguồn và phương pháp

| Mục | Nội dung |
|---|---|
| Nguồn | Ghi âm buổi trao đổi giữa nhóm phát triển và cán bộ nghiệp vụ UBND phường (khách hàng), 66 phút, ngày 18/08/2026 |
| Chép lời | Whisper `large-v3` và `large-v3-turbo` chạy cục bộ trên GPU, tiếng Việt; lọc 10 đoạn "ảo giác" kiểu câu quảng cáo YouTube mà Whisper hay sinh ra khi gặp tiếng ồn; chép bù các khoảng bị bộ lọc giọng nói bỏ qua |
| Chất lượng | Âm thanh xa, nhiều người nói chồng; nhiều từ bị nhận sai có hệ thống ("tránh giam phòng" = Chánh Văn phòng, "quỹ ban" = Ủy ban, "dân bản/nhân bản" = văn bản). Các ý dưới đây đã được đối chiếu ngữ cảnh, không trích nguyên văn từng chữ |
| Phạm vi loại trừ | Đoạn **37:35–47:58**, khách hàng hiểu "áp dụng nhiều địa bàn" là một hệ thống tổng hợp, so sánh nhiều phường. Theo chỉ đạo của chủ nhiệm dự án, ý đúng là **mang đi địa phương nào cũng triển khai được dễ dàng**, nên các yêu cầu so sánh liên địa bàn trong đoạn này không đưa vào phạm vi |

Ký hiệu ưu tiên: **M** phải có · **S** nên có · **C** có thì tốt. Cột "Hiện trạng" so với mã nguồn trước khi thiết kế lại.

## 2. Bên liên quan và vai trò thực tế

Khách hàng mô tả bộ máy cấp xã sau sắp xếp (01:38–02:13): hiện có 4 đầu mối — **Văn phòng HĐND và UBND**, **Phòng Kinh tế** (phường: Kinh tế, Hạ tầng và Đô thị), **Phòng Văn hóa – Xã hội**, **Trung tâm Phục vụ hành chính công** — và sắp có thêm phòng thứ 5. Điều này khớp Nghị định 150/2025/NĐ-CP, được sửa bởi Nghị định 370/2025/NĐ-CP cho phép tỉnh quyết định số lượng, tên phòng.

| Vai trò nghiệp vụ | Việc làm trong hệ thống | Bằng chứng |
|---|---|---|
| Chủ tịch, Phó Chủ tịch UBND | Giao chỉ tiêu, xem màn hình điều hành, yêu cầu trưởng phòng giải trình chỉ tiêu "đỏ" | 02:34–02:53, 16:21–16:41 |
| Chánh/Phó Chánh Văn phòng | Phân văn bản về phòng chuyên môn; ủy quyền cho phó khi bận | 03:49–04:20 |
| Văn thư | Đầu mối tiếp nhận văn bản; khởi tạo bộ chỉ tiêu từ văn bản (vd QĐ 333) rồi giao về phòng | 03:40–03:52, 07:26–07:52 |
| Trưởng phòng (người đứng đầu đơn vị) | Chịu trách nhiệm toàn bộ chỉ tiêu UBND giao cho phòng; giao từng chỉ tiêu cho từng chuyên viên; theo dõi ai chưa cập nhật | 11:24–12:20, 18:50–18:56 |
| Chuyên viên | Biết số liệu nằm ở đâu, cập nhật số liệu và minh chứng | 12:20–12:49, 18:36–18:45 |
| Mọi cán bộ | Được đề xuất chỉ tiêu mới phát hiện trong văn bản | 23:19–24:09 |

Cùng mô hình áp dụng được cho **trường học** (văn thư → hiệu trưởng/phó → tổ/bộ môn → giáo viên) với khác biệt về thẩm quyền ký, đóng dấu (05:29–06:52). Vì vậy tên vai trò, đơn vị phải cấu hình được, không đóng cứng theo UBND.

## 3. Quy trình hiện trạng

### 3.1 Luồng văn bản (02:14–05:28)

Văn bản đến (PDF ký số qua trục liên thông hoặc thư giấy) → **Văn thư** tiếp nhận → **Chánh Văn phòng** (hoặc Phó khi được giao quyền) xem và phân về phòng theo lĩnh vực → **Trưởng phòng** giao chuyên viên → chuyên viên xử lý, dự thảo → trưởng phòng ký nháy, trình → **lãnh đạo UBND** ký, đóng dấu, phát hành. Thẩm quyền phát hành khác nhau giữa các đơn vị (Trung tâm PVHCC có dấu riêng; phòng chuyên môn trong UBND phải trình UBND ký).

Khách hàng nói rõ hệ thống này **không phải phần mềm quản lý văn bản** — cơ quan đã có nhiều phần mềm khác nhau (07:52–08:01). Hệ thống cần làm **giao chỉ tiêu và đánh giá kết quả theo KPI**: "tôi giao về cho anh, anh làm tốt hay không làm tốt, làm tốt như thế nào" (08:01–08:11), theo hướng Thành ủy TP.HCM đang triển khai.

### 3.2 Luồng chỉ tiêu mong muốn

```text
Văn bản chỉ đạo (cấp trên hoặc của phường)
  → khởi tạo chỉ tiêu có căn cứ (văn thư, AI hỗ trợ, hoặc bất kỳ cán bộ nào phát hiện)
  → lãnh đạo giao về phòng; trưởng phòng giao chuyên viên
  → chuyên viên cập nhật số liệu theo kỳ + minh chứng + nguồn số liệu
  → trưởng phòng duyệt (quá hạn duyệt thì tự thông qua, ghi trách nhiệm)
  → đánh giá đạt / vượt / không đạt; không đạt thì giải trình, có văn bản chấn chỉnh
  → màn hình điều hành: đỏ thì lãnh đạo mời trưởng phòng giải trình
```

## 4. Yêu cầu chức năng

### 4.1 Hồ sơ chỉ tiêu ba phần — trái tim của hệ thống

| Mã | Yêu cầu | Ưu tiên | Bằng chứng | Hiện trạng |
|---|---|---|---|---|
| CT-01 | Mỗi chỉ tiêu có **ba phần**: (1) **Chỉ đạo điều hành** — văn bản nào, số mấy, chỉ đạo bao nhiêu lần (kế hoạch, chương trình, thông báo kết luận, công văn; chỉ đạo miệng không tính); (2) **Thực hiện** — kết quả cập nhật theo kỳ kèm minh chứng; (3) **Đánh giá** — đạt, vượt, hay mức nào; không đạt thì có văn bản chấn chỉnh | M | 13:21–15:33 | Chỉ có 1 `legalBasis` + 1 `sourceDocumentId`; không có phần đánh giá |
| CT-02 | Một chỉ tiêu gắn **nhiều văn bản chỉ đạo** ("một con chim én không làm nên mùa xuân") | M | 08:19–08:47 | Không có |
| CT-03 | **Chỉ tiêu cha – con**, mỗi chỉ tiêu con có đơn vị chịu trách nhiệm riêng (vd Thu ngân sách = thu phí, lệ phí do Trung tâm PVHCC + thuế phi nông nghiệp…); được tạo thêm chỉ tiêu con khi cần | M | 08:31–09:00, 16:50–17:00 | Không có (chỉ `parentName` dạng chuỗi ở ứng viên AI) |
| CT-04 | **Phiếu mô tả nguồn số liệu**: số liệu lấy ở phần mềm/hệ thống nào (vd Kho bạc), cơ quan cung cấp, cách lấy, năm trước lấy ở đâu — để người mới thay thế vẫn biết lấy số ở đâu | M | 09:00–10:00, 12:20–12:49 | Không có |
| CT-05 | **Minh chứng** gắn với từng lần cập nhật: ảnh chụp màn hình phần mềm nguồn, kế hoạch/báo cáo đã thực hiện (vd kế hoạch Tết trồng cây cho chỉ tiêu trồng cây xanh) | M | 09:30–11:24 | Báo cáo chỉ có số + ghi chú |
| CT-06 | **Phân bổ chỉ tiêu theo kỳ** (tháng, quý); xem tháng này đạt bao nhiêu %, quý I, quý II | S | 17:53–18:14 | Mỗi chỉ tiêu một giá trị hiện hành, không có kỳ |
| CT-07 | Chỉ tiêu có **cấp giao**: Trung ương giao, Tỉnh/Thành phố giao, chỉ tiêu riêng của địa phương | M | 37:21–37:31 | Không có |
| CT-08 | **Mã đơn vị hành chính** ghép với **mã chỉ tiêu** để thống nhất | S | 34:36–37:14 | Mã tự sinh `CT-năm-phòng-số` |
| CT-09 | Màn hình chỉ rõ chỉ tiêu nào **thiếu văn bản chỉ đạo / thiếu kết quả / thiếu đánh giá** | M | 45:54–46:46 | Không có |

### 4.2 Giao việc và trách nhiệm

| Mã | Yêu cầu | Ưu tiên | Bằng chứng | Hiện trạng |
|---|---|---|---|---|
| GV-01 | Trưởng phòng **giao từng chỉ tiêu cho từng chuyên viên** và thấy ngay ai đã/chưa cập nhật để nhắc | M | 11:54–12:20 | Chỉ giao tới phòng |
| GV-02 | Ghi nhận ai tạo, ai giao, ai nhận, ai cập nhật, ai duyệt, khi nào | M | toàn buổi | Audit log có, nhưng không có dòng thời gian theo chỉ tiêu |
| GV-03 | **Quá hạn duyệt thì tự thông qua**: chuyên viên gửi số liệu, trưởng phòng không duyệt trong 7 ngày thì hệ thống tự thông qua, đồng thời ghi rõ đây là trách nhiệm của người duyệt để lãnh đạo thấy | M | 18:59–19:31 | Báo cáo chờ duyệt vô thời hạn |
| GV-04 | Công việc đã gửi nhưng lãnh đạo chưa xác nhận **vẫn tính là việc** của người gửi; sự chậm trễ tính vào trách nhiệm người đứng đầu (kể cả không đăng nhập kiểm tra) | M | 21:37–22:26 | Không có |
| GV-05 | **Ai cũng được đề xuất chỉ tiêu mới** phát hiện trong văn bản (đính kèm văn bản làm minh chứng) | M | 22:29–24:09, 25:57–26:26 | Chỉ ADMIN tạo chỉ tiêu |
| GV-06 | Đề xuất **quá 3 ngày** lãnh đạo không xử lý thì **tự trở thành chỉ tiêu** — "không để công việc bị treo" | M | 22:45–23:09, 26:32–26:52 | Không có |
| GV-07 | **Từ chối đề xuất phải lưu lý do**; lãnh đạo UBND thấy được mỗi trưởng phòng từ chối bao nhiêu đề xuất và vì sao | M | 25:21–25:49 | Không có |
| GV-08 | Lãnh đạo không phân công thì việc **tự chuyển xuống**; người khác được tạo nhiệm vụ đó | S | 27:09–27:31 | Không có |
| GV-09 | **Chống "đá việc"**: chuyên viên **chỉ được chuyển việc một lần**, lần sau phải lên trưởng phòng quyết; việc bị ngâm lâu hoặc bị thay đổi nhiều lần mà chưa ai duyệt thì **báo lên màn hình của Chủ tịch** | M | 27:35–31:12 | Không có |
| GV-10 | Lãnh đạo **yêu cầu trưởng phòng giải trình** chỉ tiêu chưa đạt | M | 16:31–16:43, 46:04–46:46 | Không có |

### 4.3 Tiếp nhận văn bản và AI

| Mã | Yêu cầu | Ưu tiên | Bằng chứng | Hiện trạng |
|---|---|---|---|---|
| AI-01 | Tải văn bản lên → hệ thống tự trích xuất chỉ tiêu → văn thư xem lại, sửa sai rồi trình lên (khách hàng đồng ý hướng nhóm đã làm) | M | 33:15–34:01 | Đã có, nhưng chỉ ADMIN duyệt và không có bước trình lãnh đạo |
| AI-02 | Phát hiện chỉ tiêu **"ẩn" trong thông báo kết luận** — loại văn bản ít ai đọc (vd yêu cầu giải ngân vốn đầu tư công đạt X%) — vì bỏ sót chỉ tiêu cấp trên giao sẽ bị đánh giá | M | 44:14–45:38 | Trích xuất mọi loại văn bản nhưng chưa nhận diện nhiệm vụ định tính |
| AI-03 | Chỉ tiêu do AI đề xuất không bao giờ tự thành dữ liệu chính thức khi chưa có người xem (ràng buộc an toàn của dự án) | M | quyết định D-006 | Đã có |

### 4.4 Màn hình điều hành

| Mã | Yêu cầu | Ưu tiên | Bằng chứng | Hiện trạng |
|---|---|---|---|---|
| DH-01 | **Màn hình trình chiếu** ở phòng họp lãnh đạo/Chủ tịch, **tự chuyển** qua từng phòng sau mỗi N giây, nhảy số liệu toàn bộ | M | 15:42–16:28 | Không có |
| DH-02 | Chỉ tiêu chưa đạt hiện **màu đỏ** để lãnh đạo thấy ngay và mời trưởng phòng giải trình | M | 16:28–16:41 | Có màu trạng thái, chưa có giải trình |
| DH-03 | Trưởng phòng có màn hình theo dõi chỉ tiêu của phòng mình | M | 11:24–11:54 | Có dashboard theo phòng |
| DH-04 | Đi sâu từ tổng → phòng → chỉ tiêu → chỉ tiêu con → văn bản, minh chứng, lịch sử | M | 18:18–18:31 | Cảnh báo chỉ dẫn sang tìm theo mã |
| DH-05 | So sánh **giữa các phòng trong cùng địa phương** (phòng nào làm tốt/chưa tốt và vì sao) | S | 41:33–41:46, 46:04–46:46 | Có tiến độ theo phòng |

### 4.5 Trải nghiệm và vận hành

| Mã | Yêu cầu | Ưu tiên | Bằng chứng | Hiện trạng |
|---|---|---|---|---|
| UX-01 | **Nút báo lỗi** ghi lại địa chỉ trang (URL), tiêu đề trang, thời điểm và nội dung để biết lỗi ở đâu mà sửa | M | 50:53–53:43 | Không có |
| UX-02 | Mỗi màn hình luôn hiện **dòng định danh trang + thời điểm dữ liệu** để ảnh chụp màn hình biết là màn hình nào, chụp lúc nào (có trang khi chụp bị mất dòng tiêu đề) | S | 52:00–53:30 | Không có |
| UX-03 | Giao diện điện thoại **được chỉnh riêng**, không chỉ thu nhỏ | M | 53:43–53:53 | Đã có responsive, cần luồng di động cho cập nhật/duyệt |
| VH-01 | **Mang đi địa phương nào cũng dùng được dễ dàng** — khách hàng dự kiến phối hợp IT của 36 phường | M | 32:58–33:15, 53:58–54:37 | Tên "Lái Thiêu" gắn cứng ở 57 tệp |
| VH-02 | Chạy được trên máy chủ nhỏ; truy cập từ Internet bằng chuyển cổng + tên miền động (No-IP/DynDNS) | S | 56:13–1:00:00 | Đã có Docker + trình khởi động |

### 4.6 Dữ liệu thật của phường: IOC là câu chuyện về dữ liệu

Chủ nhiệm dự án cung cấp thêm bảng chỉ tiêu phường đang thực sự quản lý và hướng dẫn tính điểm chỉ số chuyển đổi số
(DTI) từ dữ liệu nguồn. Phân tích cho thấy phường không quản lý **một** danh sách chỉ tiêu mà **nhiều bộ chỉ tiêu
khác bản chất**, mỗi bộ có căn cứ, cách đo và cách đánh giá riêng:

| Bộ chỉ tiêu | Bản chất | Trường dữ liệu đặc trưng |
|---|---|---|
| Chỉ tiêu KT-XH Thành phố giao (QĐ 333/QĐ-UBND 15/01/2026, 30 chỉ tiêu) | Kế hoạch – thực hiện | Đơn vị tính, kế hoạch năm, kỳ báo cáo (tháng/quý/6 tháng/năm), cơ quan chủ trì, phối hợp; hạn báo cáo ngày 20 |
| Chỉ tiêu Nghị quyết Đảng ủy | Kế hoạch – thực hiện | **Mã CT1…CT46**, thực hiện năm trước, lũy kế đến hiện tại, ghi chú giải trình |
| Bộ chỉ số chuyển đổi số (DTI) cấp xã | **Chấm điểm** (8 nhóm, 100 điểm) | Điểm tối đa, cách xác định và tính điểm; mỗi chỉ số **tính từ bảng dữ liệu nguồn** (cuộc họp, văn bản, máy tính, hồ sơ TTHC, phản ánh 1022…) |
| Chỉ số cải cách hành chính | **Chấm điểm** | Cách chấm, **tài liệu kiểm chứng** bắt buộc cho từng tiêu chí |
| Kế hoạch CCHC năm | **Nhiệm vụ** | Nhiệm vụ cụ thể, sản phẩm, cơ quan chủ trì, phối hợp, thời gian hoàn thành |
| 10 chỉ tiêu cam kết thi đua | Cam kết định tính | Nội dung cam kết |
| Hệ thống chỉ tiêu thống kê cấp xã (TT 148/2026/TT-BTC, 55 chỉ tiêu, hiệu lực 01/12/2026) | **Thống kê** (thu thập theo kỳ, không có mục tiêu) | Mã X0101…X0322, mã chỉ tiêu cấp tỉnh tương ứng |

Hướng dẫn DTI cho thấy cách tiếp cận đúng của một IOC: **chỉ số không gõ tay mà tính ra từ dữ liệu nghiệp vụ**
(vd chỉ số 1.2 = số cuộc họp CĐS do Bí thư/Chủ tịch chủ trì ÷ tổng số cuộc họp CĐS × 2 điểm; chỉ số 6.4 = hồ sơ
trực tuyến toàn trình ÷ tổng hồ sơ, ≥80% được 5 điểm). Từ đó rút ra các yêu cầu bổ sung:

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| DL-01 | Quản lý **nhiều bộ chỉ tiêu** cùng lúc, mỗi bộ thuộc một loại: kế hoạch – thực hiện, chấm điểm, nhiệm vụ, thống kê | M |
| DL-02 | **Kho dữ liệu nghiệp vụ**: bảng dữ liệu có cấu trúc (cột, kiểu), đơn vị chủ quản, tần suất cập nhật, nguồn; nhập tay hoặc từ Excel; mỗi dòng biết ai nhập, khi nào | M |
| DL-03 | **Chỉ tiêu tính tự động** từ bảng dữ liệu bằng công thức khai báo (đếm, tổng, tỷ lệ, có điều kiện lọc) và quy tắc chấm điểm (tuyến tính, theo ngưỡng, có/không); bấm vào số thấy được các dòng dữ liệu tạo ra nó | M |
| DL-04 | Chỉ tiêu chấm điểm có **điểm tối đa, cách chấm, tài liệu kiểm chứng yêu cầu** | M |
| DL-05 | **Thư viện bộ chỉ tiêu mẫu** để địa phương mới chọn và nạp ngay (TT 148, chỉ số CĐS, KT-XH…) | M |
| DL-06 | Hiển thị **độ mới của dữ liệu** (cập nhật lần cuối, quá hạn cập nhật) — số liệu cũ phải được đánh dấu | S |

Trang tham khảo giảng viên gửi (nền tảng chính quyền số của VNTT) thiên về GIS, mô phỏng 3D và cảm biến; khái niệm
**"kịch bản điều hành"** của trang này trùng với Nghị định 269/2025/NĐ-CP và Công văn 1709/BKHCN-CĐSQG, nên được
dùng để tổ chức màn hình điều hành theo từng bộ chỉ tiêu. Phần GIS/cảm biến nằm ngoài phạm vi vì phường chưa có dữ liệu.

## 5. Yêu cầu phi chức năng

1. **Trách nhiệm giải trình**: mọi chậm trễ phải quy được về người cụ thể (người duyệt, người giao, người thực hiện) kèm thời điểm.
2. **Không treo việc**: mọi trạng thái chờ đều có hạn và hành vi khi quá hạn (nhắc, tự chuyển, tự thông qua, báo lên lãnh đạo).
3. **Cấu hình được theo địa phương**: tên, mã đơn vị hành chính, cơ cấu tổ chức, vai trò, danh mục chỉ tiêu, thời hạn.
4. **Chi phí thấp**: khách hàng so sánh với phần mềm thương mại 500 triệu – 1 tỷ đồng (54:46–55:03); hệ thống chạy trên một máy chủ nhỏ.
5. **Riêng tư**: AI chạy cục bộ, văn bản không gửi ra ngoài (giữ quyết định D-002).

## 6. Ngoài phạm vi

- Hệ thống tổng hợp, so sánh nhiều phường/xã với nhau; lãnh đạo thành phố chuyển qua lại giữa IOC các phường; cảnh báo chéo "đơn vị khác đã phát hiện chỉ tiêu mới" (đoạn 37:35–47:58).
- Ký số, đóng dấu, phát hành văn bản — thuộc phần mềm quản lý văn bản sẵn có (07:52–08:01).
- Camera, cảm biến (không được nêu trong buổi trao đổi).

Mã chỉ tiêu chuẩn và mã đơn vị hành chính vẫn được đưa vào (CT-08) vì đó là **chuẩn dữ liệu** giúp mỗi bản triển khai dùng cùng danh mục, không phải tính năng so sánh liên địa bàn.

## 7. Khoảng cách so với hệ thống hiện tại

Ngoài các ô "Hiện trạng" ở trên, rà soát mã nguồn phát hiện 4 lỗi đã kiểm chứng trực tiếp:

| # | Lỗi | Vị trí | Hệ quả |
|---|---|---|---|
| L1 | Duyệt ứng viên AI tạo chỉ tiêu **ngoài transaction** rồi mới cập nhật ứng viên | `candidates.ts` `approveCandidateById` | Hai lượt duyệt đồng thời có thể sinh hai chỉ tiêu |
| L2 | Copilot xác nhận hành động **không kiểm tra lại quyền** | `copilot.ts` `confirmAction` | Người vừa bị hạ quyền vẫn xác nhận được thao tác cũ trong 15 phút |
| L3 | Trưởng phòng sửa/từ chối **ứng viên của phòng khác**; danh sách ứng viên không lọc phạm vi | `candidates.ts` `update`, `reject`, `list` | Vượt phạm vi đơn vị |
| L4 | Chỉ tiêu **chưa báo cáo dù đã quá hạn** vẫn hiện "Chưa bắt đầu" | `metrics.ts` `evaluateTarget` | Lãnh đạo không thấy chỉ tiêu bị bỏ quên — đúng loại việc khách hàng muốn bắt |

Các điểm thiết kế chưa hợp lý:

1. **Quản trị kỹ thuật bị dùng làm thẩm quyền nghiệp vụ**: chỉ `ADMIN` được tạo chỉ tiêu, duyệt AI, công bố — trong khi người giao chỉ tiêu là lãnh đạo UBND và người khởi tạo là văn thư.
2. **Chỉ tiêu là một con số đơn lẻ**: không có kỳ, cây cha–con, nguồn số liệu, minh chứng, đánh giá.
3. **Không có cơ chế thời hạn cho trạng thái chờ** ngoài phân hệ phản ánh.
4. **Gắn cứng một địa phương**: tên, email, tiêu đề, dữ liệu mẫu.

## 8. Câu hỏi cần xác nhận với khách hàng

1. Thời hạn tự thông qua báo cáo (7 ngày) và tự thành chỉ tiêu (3 ngày) tính theo **ngày làm việc** hay ngày lịch? (Bản 2 mặc định ngày lịch, cấu hình được.)
2. Đề xuất chỉ tiêu tự thành chỉ tiêu sau 3 ngày sẽ giao cho **đơn vị người đề xuất chọn** hay để lãnh đạo phân sau? (Bản 2: giao đơn vị được đề xuất; trưởng phòng đơn vị đó được thông báo.)
3. Thang đánh giá chỉ tiêu: chỉ "Đạt/Vượt/Không đạt" hay có mức "Đạt một phần"?
4. Mốc báo cáo với giảng viên: bản ghi nhắc "25 tháng 10" và "18 tháng…" nhưng âm thanh không rõ — cần nhóm xác nhận.
