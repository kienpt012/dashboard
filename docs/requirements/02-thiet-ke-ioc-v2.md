# Thiết kế IOC phiên bản 2 — "Từ dữ liệu đến trách nhiệm"

> Đầu vào: [phân tích yêu cầu khách hàng](01-phan-tich-yeu-cau-khach-hang.md), nghiên cứu khung pháp lý IOC
> (mục 7) và rà soát mã nguồn bản 1. Tài liệu này là đặc tả để triển khai; quyết định kiến trúc mới ghi ở
> [DECISIONS.md](../DECISIONS.md) (D-009…D-014).

## 1. IOC là gì, và bản 1 sai ở đâu

Theo Công văn 1709/BKHCN-CĐSQG (2025) và Nghị định 269/2025/NĐ-CP, trung tâm giám sát, điều hành thông minh là nơi
**tổng hợp dữ liệu nhiều lĩnh vực để lãnh đạo giám sát, chỉ đạo và phối hợp xử lý**, vận hành theo **kịch bản điều
hành** có ngưỡng kích hoạt, quy trình phối hợp và trách nhiệm rõ ràng. Cấp xã không bắt buộc có trung tâm vật lý;
giá trị cốt lõi mà lãnh đạo xã nêu khi khai trương IOC là: *nắm tình hình, chủ động điều hành, minh bạch tiến độ và
trách nhiệm, giảm báo cáo thủ công*.

Một IOC thực sự vì vậy là **vòng khép kín**:

```text
 DỮ LIỆU ──► CHỈ TIÊU ──► GIÁM SÁT ──► CHỈ ĐẠO ──► THỰC HIỆN ──► ĐÁNH GIÁ
   ▲            (tự tính    (cảnh báo,   (giao việc,  (số liệu,     (đạt / không đạt,
   │             hoặc báo    màn hình     yêu cầu      minh chứng,   giải trình,
   │             cáo)        điều hành)   giải trình)  nguồn số)     chấn chỉnh)
   └──────────────────────── dữ liệu mới từ chính quá trình thực hiện ◄──────────┘
```

Bản 1 mới làm tốt hai mắt xích (kho văn bản + AI trích xuất; nhập/duyệt số liệu) nhưng **đứt vòng** ở ba chỗ:
không có lớp dữ liệu (mọi con số gõ tay), không có cơ chế trách nhiệm (trạng thái chờ không có hạn, không có người
chịu trách nhiệm cụ thể, không có đánh giá) và gắn cứng một địa phương.

## 2. Ba lớp của bản 2

| Lớp | Thành phần | Trả lời câu hỏi |
|---|---|---|
| **Dữ liệu** | Kho dữ liệu nghiệp vụ (bảng có cấu trúc), kho văn bản (AI đọc), dữ liệu vận hành sẵn có (phản ánh) | Số liệu ở đâu, ai giữ, cập nhật khi nào? |
| **Chỉ tiêu** | Nhiều **bộ chỉ tiêu** (kế hoạch, chấm điểm, nhiệm vụ, thống kê); chỉ tiêu tự tính từ dữ liệu hoặc báo cáo kèm minh chứng; hồ sơ 3 phần | Đang đạt bao nhiêu, căn cứ đâu, chứng minh bằng gì? |
| **Điều hành** | Giao việc tới từng người, thời hạn cho mọi trạng thái chờ, tự thông qua có truy vết, chống treo và đá việc, yêu cầu giải trình, màn hình trình chiếu, thông báo | Ai đang chậm, vì sao, lãnh đạo cần làm gì? |

## 3. Mô hình dữ liệu (bổ sung vào schema hiện có, migrate được)

### 3.1 Địa phương và tổ chức

- **`LocalityProfile`** (một bản ghi): loại đơn vị (xã, phường, đặc khu, trường học, cơ quan khác), tên, tên cơ quan
  ("UBND Phường …"), tên ngắn cho tiêu đề, tỉnh/thành, **mã đơn vị hành chính** (QĐ 19/2025/QĐ-TTg), **mã định danh
  cơ quan** (QĐ 20/2020/QĐ-TTg), liên hệ, tên miền email, màu thương hiệu, thời điểm hoàn tất thiết lập.
- **`Department`** thêm `kind` (văn phòng, phòng chuyên môn, trung tâm, đơn vị khác), `shortName`, `sortOrder`,
  `responsibilities` (lĩnh vực phụ trách — dùng gợi ý đơn vị chủ trì).
- **`Role`** thêm `LEADER` (Lãnh đạo UBND: giao, đánh giá, yêu cầu giải trình) và `CLERK` (Văn thư/Chánh VP: tiếp
  nhận văn bản, rà soát AI, trình đề xuất). `ADMIN` trở về đúng nghĩa **quản trị hệ thống** (vẫn giữ toàn quyền để
  tương thích). `User.position` lưu chức vụ hiển thị (Chủ tịch, Trưởng phòng…).
- Phạm vi: `ADMIN`, `LEADER`, `CLERK` xem toàn địa phương; `MANAGER`, `STAFF`, `VIEWER` theo phòng.

### 3.2 Bộ chỉ tiêu và chỉ tiêu

- **`Framework`** (bộ chỉ tiêu): mã, tên, **loại** `PLAN` (kế hoạch–thực hiện) · `SCORE` (chấm điểm) · `TASK` (nhiệm
  vụ) · `STAT` (thống kê), năm, **cấp giao** `CENTRAL` · `PROVINCE` · `LOCAL`, căn cứ, điểm tối đa (bộ chấm điểm),
  khóa mẫu nguồn, có hiện trên màn hình trình chiếu không.
- **`Target`** (giữ tên bảng để không phá dữ liệu cũ) thêm:
  `frameworkId`, `kind`, `parentId` (cây cha–con), `ordinal` (STT trong bộ), `standardCode` (mã chuẩn: CT3, X0210,
  6.4…), `issuingLevel`, `targetText` (mục tiêu nguyên văn: "≥95", "Phấn đấu 100%"), `maxScore`, `scoringRule`,
  `evidenceRequirement` (tài liệu kiểm chứng yêu cầu), **phiếu nguồn số liệu** (`dataSourceSystem`,
  `dataSourceAgency`, `collectionGuide`, `dataSourceUrl`), `reportDueDay`, `valueSource` (`MANUAL` · `COMPUTED` ·
  `CHILDREN`), `formula`, **giao việc** (`assigneeId`, `assignedAt`, `assignedById`, `transferCount`, `bounceCount`),
  `coordinators` (đơn vị phối hợp).
- `TargetFrequency` thêm `SEMIANNUAL` (6 tháng — có trong QĐ 333, bản 1 không biểu diễn được).
- Quy ước theo loại: `TASK` đo bằng % hoàn thành (mục tiêu 100); `SCORE` đo bằng điểm (mục tiêu = điểm tối đa);
  `STAT` không có mục tiêu, chỉ theo dõi **đã cập nhật kỳ này hay chưa** và không tính vào tiến độ chung.

### 3.3 Hồ sơ chỉ tiêu ba phần

| Phần | Bảng | Nội dung |
|---|---|---|
| Chỉ đạo điều hành | **`TargetDirective`** | Loại văn bản (kế hoạch, chương trình, thông báo kết luận, công văn, quyết định, nghị quyết, chỉ thị…), số ký hiệu, ngày, cơ quan ban hành, trích yếu, liên kết kho văn bản |
| Thực hiện | `ProgressUpdate` thêm `periodKey`, `valueText`, `dataSource`, `explanation`, `autoApproved` + **`Evidence`** | Số liệu theo kỳ, nguồn lần này, giải trình nếu chưa đạt, minh chứng (tệp, ảnh chụp, liên kết, văn bản) |
| Đánh giá | **`TargetEvaluation`** | Kỳ, kết quả (vượt, đạt, đạt một phần, không đạt), điểm, nhận xét, biện pháp/văn bản chấn chỉnh, người đánh giá |

Mã kỳ: `2026` · `2026-H1` · `2026-Q3` · `2026-M09`. Hạn báo cáo = ngày `reportDueDay` (mặc định 20, theo QĐ 333)
của tháng cuối kỳ. **Độ đầy đủ hồ sơ** = có ≥1 văn bản chỉ đạo · có kết quả kỳ hiện hành · có đánh giá kỳ đã qua.

### 3.4 Trách nhiệm và thông báo

- **`WorkEvent`**: dòng thời gian trách nhiệm của từng chỉ tiêu/đề xuất (giao, chuyển, trả lại, nhắc, leo thang, tự
  thông qua, yêu cầu giải trình…), tác nhân có thể là **hệ thống**.
- **`ExplanationRequest`**: lãnh đạo yêu cầu giải trình một chỉ tiêu, hạn trả lời, nội dung trả lời.
- **`Notification`**: hộp thông báo trong ứng dụng; `dedupeKey` duy nhất để bộ giám sát chạy lại không nhắc trùng.
- **`IndicatorCandidate`** (đề xuất) thêm: `origin` (`AI` · `HUMAN`), trạng thái `SUBMITTED`, người đề xuất, người
  trình, `autoApproveAt`, `frameworkId`, `targetKind`; `documentId` thành tùy chọn (đề xuất của người có thể chưa có tệp).
- `SystemSetting` thêm: `reportAutoApproveDays` (7), `proposalAutoApproveDays` (3), `explanationDueDays` (3),
  `assignmentStallDays` (3), `maxTransfers` (1), `wallboardRotateSeconds` (20). Đặt 0 để tắt cơ chế tự động.

### 3.5 Kho dữ liệu nghiệp vụ

- **`Dataset`**: mã, tên, đơn vị chủ quản, **danh sách cột** (khóa, nhãn, kiểu `text` · `number` · `date` ·
  `boolean` · `enum`), tần suất cập nhật, hệ thống nguồn, hướng dẫn thu thập.
- **`DatasetRow`**: dữ liệu JSON đã kiểm tra theo cột, ai tạo/sửa, phiên bản.
- **Nguồn dựng sẵn**: `feedback` — dữ liệu phản ánh của chính hệ thống, để chỉ tiêu "tỷ lệ xử lý phản ánh đúng hạn"
  tự tính, không ai phải gõ.

### 3.6 Báo lỗi có ngữ cảnh

**`BugReport`**: URL, tiêu đề trang, mã màn hình, kích thước khung nhìn, thời điểm, mô tả, ảnh chụp tùy chọn, trạng thái xử lý.

## 4. Công thức chỉ tiêu tự tính (D-012)

Công thức là **JSON khai báo**, không phải mã thực thi — người dùng không thể chèn biểu thức tùy ý, máy chủ kiểm tra
cấu trúc trước khi lưu:

```json
{
  "value": {
    "op": "ratio",
    "num": { "agg": "count", "dataset": "cuoc_hop_cds",
             "where": [["chuc_danh_chu_tri", "in", ["Bí thư", "Chủ tịch"]]] },
    "den": { "agg": "count", "dataset": "cuoc_hop_cds" }
  },
  "score": { "type": "linear", "max": 2 }
}
```

- Phép gộp: `count`, `sum`, `avg`, `min`, `max`, `countDistinct`. Điều kiện: `eq`, `ne`, `in`, `nin`, `gt`, `gte`,
  `lt`, `lte`, `contains`, `notEmpty`, `isTrue`, `isFalse`. Lọc theo năm qua cột ngày (`yearColumn`).
- Biểu thức: số hằng, tham chiếu một phép gộp, `ratio` (chia an toàn khi mẫu bằng 0), `percent`, `add`, `sub`, `mul`, `min`, `max`.
- Quy tắc điểm: `linear` (r × tối đa, chặn trên), `capped` (min(r,1) × tối đa), `threshold` (r ≥ ngưỡng thì đủ điểm,
  dưới ngưỡng thì r × tối đa hoặc 0), `steps` (bậc thang theo giá trị, vd ≥52 tin → 2, 20–51 → 1, <20 → 0,5),
  `binary` (có → đủ điểm).
- Kết quả trả kèm **dấu vết**: số dòng tử/mẫu, các dòng tạo ra con số — lãnh đạo bấm vào điểm là thấy dữ liệu gốc.
- Mỗi khi dữ liệu thay đổi, chỉ tiêu liên quan được tính lại; giá trị đổi thì ghi một báo cáo đã duyệt có ghi chú
  "tự tính từ dữ liệu", người ghi là người vừa sửa dữ liệu.

## 5. Luồng nghiệp vụ

### 5.1 Đề xuất chỉ tiêu — "không để việc bị treo" (GV-05…GV-07)

```text
AI trích xuất ─► PROPOSED ─(văn thư rà soát, sửa)─┐
Cán bộ bất kỳ đề xuất (kèm văn bản) ─────────────┴─► SUBMITTED ──(lãnh đạo/ trưởng phòng)──► APPROVED → tạo chỉ tiêu
                                                        │                                └─► REJECTED (bắt buộc lý do)
                                                        └─ quá proposalAutoApproveDays ─► APPROVED tự động
                                                           (sự kiện ghi trách nhiệm người duyệt)
```

Ràng buộc an toàn: kết quả AI **không bao giờ** tự vào hàng chờ tự thông qua — chỉ sau khi một người (văn thư) đã
xem và bấm trình. Đề xuất thiếu trường bắt buộc khi đến hạn thì không tự tạo được, mà leo thang lên lãnh đạo.

### 5.2 Giao việc và chống "đá việc" (GV-01, GV-08, GV-09)

- Trưởng phòng giao chỉ tiêu cho chuyên viên. Chuyên viên **chuyển cho đồng nghiệp tối đa `maxTransfers` lần**
  (kèm lý do); hết lượt thì chỉ được **trả về trưởng phòng**. Mỗi lần chuyển/trả tăng `bounceCount`.
- Chỉ tiêu chưa giao người quá `assignmentStallDays` → nhắc trưởng phòng; quá gấp đôi → báo lãnh đạo.
- `bounceCount ≥ 3` → hiện ở mục **"Việc bị treo"** trên màn hình lãnh đạo.

### 5.3 Báo cáo và tự thông qua (GV-03, GV-04)

Chuyên viên gửi số liệu kỳ + minh chứng + nguồn → `PENDING`. Quá `reportAutoApproveDays` mà người duyệt không xử lý
→ hệ thống **tự thông qua** (`autoApproved`), ghi sự kiện "trưởng phòng … không duyệt trong 7 ngày" và tính vào mục
trách nhiệm người đứng đầu. Nếu số liệu chỉ tiêu đã đổi sau lúc gửi, không tự thông qua mà leo thang.

### 5.4 Bộ giám sát thời hạn (worker)

Chạy định kỳ trong tiến trình API (một luồng, bỏ qua nếu vòng trước chưa xong), mỗi việc là một transaction có điều
kiện chống ghi đè: tự thông qua báo cáo, tự duyệt đề xuất, nhắc thiếu báo cáo kỳ, nhắc chưa giao người, leo thang việc
bị treo, nhắc giải trình quá hạn. Mọi thông báo có `dedupeKey` nên chạy lại không nhắc trùng.

### 5.5 Yêu cầu giải trình (GV-10)

Lãnh đạo bấm "Yêu cầu giải trình" trên chỉ tiêu đỏ → trưởng phòng và chuyên viên phụ trách nhận thông báo → trả lời
trong `explanationDueDays` ngày → nội dung hiện trong hồ sơ chỉ tiêu và trên màn hình trình chiếu.

## 6. Màn hình

| Màn hình | Ai dùng | Nội dung chính |
|---|---|---|
| **Trung tâm điều hành** | Lãnh đạo | Theo kịch bản/bộ chỉ tiêu: số đạt, nguy cơ, quá hạn, thiếu báo cáo; điểm bộ chấm điểm; bảng phòng × trạng thái; luồng cảnh báo; việc bị treo; độ mới dữ liệu |
| **Trình chiếu** | Phòng họp | Toàn màn hình, tự chuyển qua từng bộ chỉ tiêu và từng phòng sau N giây, đỏ nổi bật, tạm dừng bằng phím cách |
| **Việc của tôi** | Mọi người | Cần báo cáo kỳ này, bị trả lại, chờ tôi duyệt, đề xuất chờ xử lý, giải trình được yêu cầu, chỉ tiêu chưa giao người |
| **Hồ sơ chỉ tiêu** | Mọi người | Ba cột Chỉ đạo – Thực hiện – Đánh giá, phiếu nguồn số liệu, chỉ tiêu con, dòng thời gian trách nhiệm |
| **Bộ chỉ tiêu** | Lãnh đạo, văn thư | Danh sách bộ, nạp từ thư viện mẫu, nhập từ Excel |
| **Đề xuất chỉ tiêu** | Mọi người | Đề xuất của AI và của người, trình, duyệt, từ chối có lý do, đếm ngược tự thông qua |
| **Trách nhiệm người đứng đầu** | Lãnh đạo | Theo từng phòng: báo cáo chờ duyệt lâu nhất, số lần bị tự thông qua, đề xuất đã từ chối và lý do, việc bị đá, giải trình quá hạn, lần đăng nhập gần nhất |
| **Kho dữ liệu** | Đơn vị chủ quản | Bảng dữ liệu, nhập Excel, chỉ tiêu nào đang dùng bảng này |
| **Thiết lập địa phương** | Quản trị | Trình hướng dẫn 5 bước (mục 8) |
| **Báo lỗi** | Mọi người / quản trị | Nút nổi trên mọi màn hình; danh sách báo lỗi |

Mọi màn hình quản trị có **dải định danh** ở chân trang: mã màn hình · thời điểm dữ liệu · tên địa phương (UX-02).

## 7. Căn cứ đã xác minh

| Văn bản | Dùng cho |
|---|---|
| Công văn 1709/BKHCN-CĐSQG (21/5/2025), 3640/BKHCN-CĐSQG (04/8/2025); Nghị định 269/2025/NĐ-CP | Khái niệm IOC, kịch bản điều hành, trách nhiệm cung cấp dữ liệu của xã |
| Nghị định 150/2025/NĐ-CP, sửa bởi 370/2025/NĐ-CP (hiệu lực 01/01/2026) | Mẫu cơ cấu phòng cấp xã, nhưng **không đóng cứng** vì tỉnh được quyết định |
| Thông tư 148/2026/TT-BTC (07/10/2026, hiệu lực 01/12/2026) | Thư viện 55 chỉ tiêu thống kê cấp xã, chép từ ảnh bản gốc Phụ lục II |
| Nghị định 335/2025/NĐ-CP (hiệu lực 2026) | Đánh giá công chức 30 điểm tiêu chí chung + 70 điểm kết quả nhiệm vụ → số liệu giao việc, đúng hạn làm đầu vào KPI |
| Nghị định 09/2019/NĐ-CP; Nghị định 30/2020/NĐ-CP | Kỳ báo cáo, hạn chốt số liệu; luồng văn bản đến (ngoài phạm vi phát hành) |
| QĐ 19/2025/QĐ-TTg; QĐ 20/2020/QĐ-TTg (sửa bởi 09/2025/QĐ-TTg) | Mã đơn vị hành chính, mã định danh cơ quan |

## 8. Mang đi địa phương khác (VH-01)

1. **Thông tin địa phương**: loại, tên, tỉnh, mã đơn vị hành chính, liên hệ, màu.
2. **Cơ cấu tổ chức**: chọn mẫu theo loại (xã, phường, đặc khu, trường học) rồi sửa tự do; hoặc giữ phòng ban sẵn có.
3. **Bộ chỉ tiêu**: chọn từ thư viện — TT 148 (55 chỉ tiêu thống kê, dùng được ở mọi xã), các bộ riêng của tỉnh nếu
   có (vd KT-XH và chuyển đổi số của TP.HCM); hoặc nhập Excel bộ của địa phương.
4. **Thời hạn trách nhiệm**: số ngày tự thông qua, chuyển việc tối đa, giây chuyển màn hình.
5. **Tài khoản**: tạo tài khoản lãnh đạo, văn thư, trưởng phòng.

Không còn chuỗi địa phương nào trong mã nguồn; tiêu đề, chân trang, email, tệp Excel xuất ra đều đọc từ hồ sơ địa phương.

## 9. Ngoài phạm vi bản 2

So sánh liên địa bàn; ký số, phát hành văn bản; GIS, camera, cảm biến; đồng bộ tự động với hệ thống cấp tỉnh
(LGSP/NDXP) — chừa đường mở rộng qua "nguồn dữ liệu dựng sẵn" và nhập Excel.
