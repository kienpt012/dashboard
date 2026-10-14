# Kịch bản demo

Hai phần: **IOC bản 2 — từ dữ liệu đến trách nhiệm** (khoảng 20 phút, phần chính) và **AI trích xuất văn bản**
(khoảng 15 phút, phụ lục). Điều kiện: API, web và PostgreSQL đang chạy trên CSDL vừa seed
(`docker compose exec api ./docker-entrypoint.sh seed` hoặc `RUN_DEMO_SEED=true ALLOW_DEMO_SEED=true npx tsx prisma/seed.ts`).
Dữ liệu mẫu là một phường giả lập ở TP.HCM: mức giao KT-XH lấy theo văn bản công khai, mọi số liệu thực hiện là giả lập.

Mở sẵn hai cửa sổ: một đăng nhập `chu.tich` (lãnh đạo), một đăng nhập lần lượt `lan.anh` / `staff.ktht` (trưởng phòng,
chuyên viên). Mật khẩu theo `.env` (`DEMO_USER_PASSWORD`).

## Phần 1 — IOC bản 2

### 1. Trung tâm điều hành (lãnh đạo, `/admin`, mã DH-01)

- Ba bộ chỉ tiêu song song: KT-XH thành phố giao (kế hoạch, báo cáo trước ngày 20 hằng tháng), chuyển đổi số DTI
  (chấm điểm 100), 55 chỉ tiêu thống kê cấp xã theo TT 148/2026/TT-BTC. *Talking point*: IOC không phải một bảng chỉ tiêu
  phẳng — mỗi bộ có bản chất riêng (đạt/không đạt, điểm, có/không có số liệu).
- Dải cảnh báo: thiếu báo cáo kỳ, chưa giao người, báo cáo chờ duyệt, đề xuất sắp tự thông qua, **việc bị treo**.
- Ma trận phòng ban: phòng nào đang chậm, trưởng phòng là ai, lần đăng nhập gần nhất. Dòng "Dữ liệu cập nhật lúc …" ở
  đầu trang và dải định danh ở chân trang (mã màn hình · tên ứng dụng · thời điểm) — ảnh chụp màn hình luôn truy được nguồn.

### 2. Trình chiếu phòng họp (`/trinh-chieu`, DH-03)

- Toàn màn hình, tự chuyển qua từng bộ chỉ tiêu, từng phòng, mục việc bị treo; chỉ tiêu đỏ lên trước.
- Phím cách tạm dừng, ←/→ chuyển trang, F toàn màn hình. *Talking point*: dùng thẳng trong giao ban, không ai phải
  tổng hợp slide.

### 3. Hồ sơ chỉ tiêu ba phần (mở chỉ tiêu "Tổng thu ngân sách", CT-06)

- **Chỉ đạo điều hành**: văn bản giao chỉ tiêu, thông báo kết luận. **Thực hiện**: số liệu theo từng kỳ tháng, nguồn số
  liệu, minh chứng. **Đánh giá**: quý II "Đạt một phần" kèm nguyên nhân và biện pháp khắc phục.
- Phiếu nguồn số liệu: số này lấy từ hệ thống nào, ai cung cấp, cách lấy.
- Dòng thời gian trách nhiệm: ai giao, ai báo cáo, ai duyệt, lúc nào.

### 4. Chỉ tiêu tự tính từ dữ liệu (Kho dữ liệu `/admin/kho-du-lieu`, DL-01)

- Mở bảng "Số liệu hồ sơ thủ tục hành chính theo tháng" → các chỉ tiêu DTI đang dùng bảng này.
- Thêm một dòng dữ liệu → mở lại chỉ tiêu DTI liên quan: điểm đã tự tính lại, bấm vào thấy dấu vết (bao nhiêu dòng
  khớp, công thức). *Talking point*: "câu chuyện IOC là câu chuyện dữ liệu" — số liệu không gõ tay thì không cãi được.
- Chỉ tiêu "Tỷ lệ xử lý phản ánh đúng hạn" tự tính trực tiếp từ phân hệ phản ánh của người dân.

### 5. Giao việc và chống đá việc (trưởng phòng `lan.anh`, rồi chuyên viên `staff.ktht`)

- Trưởng phòng: **Việc của tôi** (`/admin/viec-cua-toi`, DH-02) → tab "Chưa giao người" → mở hồ sơ → giao chuyên viên.
- Chuyên viên nhận thông báo (chuông), chuyển cho đồng nghiệp **một lần** (kèm lý do); lần sau chỉ còn "Trả về trưởng
  phòng". Chỉ tiêu "Số lao động được giới thiệu việc làm" đã bị đá qua lại 3 lần → nằm ở mục **Việc bị treo** của lãnh đạo.

### 6. Báo cáo, duyệt và tự thông qua có trách nhiệm

- Chuyên viên báo cáo kỳ tháng 10 kèm nguồn số liệu và ảnh minh chứng → trưởng phòng duyệt trong hồ sơ hoặc Việc của tôi.
- Báo cáo tỷ lệ tiêm chủng đầy đủ quý III đã chờ 10 ngày: bộ giám sát **tự thông qua** và ghi rõ "trưởng phòng không duyệt trong
  7 ngày". Mở **Trách nhiệm người đứng đầu** (`/admin/trach-nhiem`, DH-04): số báo cáo bị tự thông qua, đề xuất bị từ
  chối và lý do, việc bị đá, giải trình quá hạn, lần đăng nhập — đầu vào đánh giá cán bộ theo Nghị định 335/2025.

### 7. Yêu cầu giải trình (lãnh đạo)

- Chỉ tiêu "Tỷ lệ giải ngân vốn đầu tư công" đỏ → **Yêu cầu giải trình** → trưởng phòng nhận thông báo, trả lời trong
  hạn; nội dung nằm trong hồ sơ, quá hạn thì leo thang.

### 8. Đề xuất chỉ tiêu (`/admin/proposals`, CT-03)

- Đề xuất "Tỷ lệ hộ kinh doanh thanh toán không dùng tiền mặt" do chuyên viên trình: đếm ngược tự thông qua (còn dưới
  1 ngày). Lãnh đạo duyệt → thành chỉ tiêu, có văn bản căn cứ. Đề xuất bị từ chối luôn kèm lý do.
- *Talking point an toàn*: đề xuất do AI trích xuất **không bao giờ** tự thông qua — phải có văn thư rà soát và bấm trình.

### 9. Mang sang địa phương khác (quản trị, `/admin/thiet-lap`, HT-01)

- Trình hướng dẫn 5 bước: thông tin đơn vị → mẫu cơ cấu tổ chức (xã/phường/đặc khu/trường học, sửa tự do) → bộ chỉ tiêu
  từ thư viện → thời hạn trách nhiệm → áp dụng. Tên ứng dụng, tiêu đề, email, tệp Excel đổi theo ngay.
- Nút **Báo lỗi** nổi ở mọi màn hình: tự ghi địa chỉ trang, mã màn hình, thời điểm, dán được ảnh chụp.

### Thông điệp chốt

- **Dữ liệu → chỉ tiêu → trách nhiệm** khép kín: mọi con số truy được nguồn, mọi việc chờ đều có hạn và có người chịu
  trách nhiệm.
- **Không chờ vô hạn**: quá hạn thì hệ thống tự xử lý và ghi trách nhiệm, không để việc treo.
- **Cài cho địa phương nào cũng được**: không tên địa phương nào nằm trong mã nguồn.

## Phụ lục — AI trích xuất văn bản

Điều kiện thêm: Ollama sẵn sàng; bộ `samples/` đã tạo bằng `python scripts/generate-sample-documents.py`.

1. Đăng nhập `van.thu` (văn thư). Vào **Kho văn bản**, tải `samples/ke-hoach-ktxh-2026.docx`, chọn loại KE_HOACH, nhập
   số văn bản. Hệ thống trả lời ngay: cấp mã `VB-2026-NNNN`, kiểm tra magic-byte, chống trùng SHA-256; việc nặng chạy nền.
2. Theo dõi UPLOADED → PROCESSING → PROCESSED; tiến độ đoạn `chunksDone/chunksTotal`. LLM cục bộ ~10 token/s nên chạy
   bất đồng bộ (outbox + worker).
3. Mở **Xác minh trích xuất**: mỗi đề xuất mang tài liệu/trang/đoạn nguồn, model + phiên bản prompt, phương pháp
   (LLM hay RULE_BASED); câu trích nguyên văn được kiểm chứng bằng string-match, không khớp thì độ tin cậy bị hạ trần 0,4;
   độ tin cậy từng trường.
4. Văn thư sửa trường còn thiếu (vd phòng chủ trì) rồi **Trình lãnh đạo** → đề xuất chuyển sang "Đã trình", bắt đầu đếm
   ngược. Đăng nhập `chu.tich` duyệt → chỉ tiêu mới có văn bản nguồn làm "văn bản chỉ đạo" trong hồ sơ.
5. OCR: tải `samples/ke-hoach-ktxh-2026-scan.pdf` (scan không có lớp chữ) — Tesseract `vie`, độ tin cậy từng trang.
6. Trích xuất lại: đề xuất chưa ai đụng được thay bằng kết quả mới, đề xuất đã sửa/đã duyệt giữ nguyên. Nhật ký hệ thống
   cho thấy chuỗi DOCUMENT_UPLOADED → AI_CANDIDATE_EDITED → … → TARGET_CREATED.
7. (Nếu được hỏi) tắt Ollama và trích xuất lại: vẫn ra đề xuất RULE_BASED — suy giảm có kiểm soát.
