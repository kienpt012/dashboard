# Quyết định kiến trúc

Mỗi quyết định: bối cảnh → phương án đã cân nhắc → lựa chọn → căn cứ. Quyết định chỉ được
đảo ngược khi có bằng chứng mới, ghi rõ lý do và tác động migration.

## D-001 · 2026-07-26 · Modular monolith, không tách microservice ở giai đoạn prototype

- **Phương án**: (a) giữ NestJS monolith mở rộng thêm module; (b) tách AI service Python/FastAPI; (c) microservices đầy đủ.
- **Chọn**: (a). Toàn bộ ingestion/OCR/extraction viết bằng Node trong `apps/api`.
- **Căn cứ**: repo hiện một-ngôn-ngữ với quy ước rất chặt (transaction+audit+version guard); máy dev 16GB RAM
  không gánh thêm stack Python nặng; mọi thư viện cần thiết có bản Node thuần hoặc native-prebuilt
  (unpdf/pdfjs, mammoth, exceljs, Tesseract spawn, Ollama HTTP). Python sidecar chỉ cân nhắc lại khi
  benchmark chứng minh cần PaddleOCR/RapidOCR (ghi ở AI_MODEL_STRATEGY).

## D-002 · 2026-07-26 · Local LLM: Qwen3-4B-Instruct-2507 Q4_K_M qua Ollama

- **Phương án**: qwen3:4b, qwen2.5:3b/7b, gemma3:4b, phi-4-mini, llama3.2, SeaLLMs, Sailor2, Vistral, PhoGPT.
- **Chọn**: `qwen3:4b-instruct-2507-q4_K_M` (2.5GB) chính; `qwen2.5:7b-instruct` là phương án accuracy-mode chạy batch nếu cần.
- **Căn cứ**: dòng Qwen có bằng chứng tiếng Việt mạnh nhất trong nhóm chạy vừa GPU 4GB (VMLU: Qwen2.5-7B 57.51
  vs Vistral-7B 50.07 vs SeaLLM-7b-v2 45.79); Apache 2.0; structured output + tool calling; đo thực tế trên
  GTX 1650: ~10 token/s, trích xuất 1 chunk ≈ 50–60s (chấp nhận được vì pipeline bất đồng bộ).
  qwen2.5:3b bị loại vì license non-commercial; phi-4-mini/llama3.2 không hỗ trợ tiếng Việt chính thức.
  Chi tiết benchmark: [AI_MODEL_STRATEGY.md](AI_MODEL_STRATEGY.md).

## D-003 · 2026-07-26 · Embedding bge-m3, OCR Tesseract native vie

- **bge-m3** (1.2GB, 1024d): top nhóm chạy được trên VN-MTEB (64.90), official Ollama, context 8K, không cần prefix.
- **Tesseract 5 native + vie (tessdata_best)**: nhanh trên CPU, cài 1 installer, spawn từ Node, không cần Python.
  Đường nâng cấp đã ghi nhận: RapidOCR (ONNX) → Qwen2.5-VL-3B/Vintern-1B khi gặp scan chất lượng xấu.

## D-004 · 2026-07-26 · Job bất đồng bộ bằng bảng ExtractionJob theo mô hình MailOutbox, chưa dùng Redis

- **Căn cứ**: repo đã có mô hình outbox hoàn chỉnh (claim `FOR UPDATE SKIP LOCKED`, lease, backoff, DEAD_LETTER,
  single-flight worker). Extraction là job nặng chạy phút nên lease 10 phút, mỗi vòng 1 job. Redis/BullMQ chỉ
  cần khi chạy nhiều API instance — ngoài phạm vi prototype (đồng bộ với ghi chú rate-limit hiện có của repo).

## D-005 · 2026-07-26 · Trì hoãn pgvector sang giai đoạn RAG

- Vertical slice không cần semantic search. Đổi image `postgres:17-alpine` → `pgvector/pgvector:pg17` là thao
  tác phá vỡ volume hiện có (musl→glibc collation) nên chỉ làm cùng lúc với giai đoạn RAG, kèm hướng dẫn
  dump/restore. Schema chunk đã thiết kế sẵn chỗ (DocumentChunk) để thêm cột vector sau.

## D-006 · 2026-07-26 · Luồng AI đề xuất → người duyệt (không auto-approve)

- IndicatorCandidate (PROPOSED → APPROVED/REJECTED) nhân bản trust-boundary của Import Excel
  (preview → duyệt → apply). Duyệt tạo Target qua đúng hàm cấp mã dùng chung (`createTargetWithGeneratedCode`).
  Ứng viên đã qua tay người (humanEdited) không bao giờ bị re-extract ghi đè. Mọi field AI có confidence
  riêng + sourceQuote được kiểm chứng lại bằng string-match với chunk (quote không khớp ⇒ confidence bị hạ trần 0.4).

## D-007 · 2026-07-26 · Chiến lược trích xuất hybrid: LLM chính, rule-based bổ khuyết + fallback

- LLM đọc từng chunk (đã lọc bằng heuristic `chunkLikelyHasIndicators` để tiết kiệm GPU); rule-based chạy song
  song, chỉ thêm ứng viên mà LLM bỏ sót (so theo giá trị số), gắn method RULE_BASED. Khi Ollama tắt, hệ thống
  vẫn hoạt động bằng rule-based (graceful degradation). Benchmark riêng từng phương án ở giai đoạn đánh giá.

## D-008 · 2026-07-26 · Tài liệu lưu Bytes trong Postgres (≤25MB), chưa dùng object storage

- Nhất quán với FeedbackAttachment hiện có; blob không bao giờ được select trong query danh sách;
  worker chỉ đọc blob khi xử lý. Giới hạn được ghi trong [hạn chế đã biết](KNOWN_ISSUES.md); object storage là hướng production.

## D-009 · 2026-10-14 · "Áp dụng nhiều địa bàn" = mỗi địa phương một bản cài, cấu hình bằng hồ sơ địa phương và thư viện mẫu

- **Bối cảnh**: buổi trao đổi với khách hàng (ghi âm 035_1) có lúc hiểu "nhiều địa bàn" là một hệ thống tổng hợp,
  so sánh nhiều xã. Ý của nhóm là **mang đi địa phương nào cũng cài và dùng được ngay**.
- **Phương án**: (a) đa thuê bao (multi-tenant) một CSDL nhiều xã; (b) mỗi địa phương một bản cài, mọi thứ đặc thù
  nằm trong dữ liệu cấu hình; (c) giữ nguyên, sửa tay mã nguồn cho từng nơi.
- **Chọn**: (b). Bảng `LocalityProfile` (một dòng `default`) giữ loại đơn vị, tên, cơ quan, tỉnh, mã ĐVHC, liên hệ,
  màu; trình hướng dẫn `/admin/thiet-lap` áp dụng mẫu cơ cấu tổ chức (`templates/org-templates.ts`) và bộ chỉ tiêu
  (`templates/*.ts`). Giao diện, email, tệp Excel xuất ra đều đọc tên từ hồ sơ địa phương.
- **Căn cứ**: dữ liệu chỉ tiêu và phản ánh của xã là dữ liệu nội bộ, quyền quản lý thuộc từng UBND; Nghị định
  150/2025 (sửa bởi 370/2025) cho tỉnh quyết định cơ cấu phòng nên không thể đóng cứng; đa thuê bao làm mọi truy vấn
  phải mang thêm khoá địa phương — rủi ro rò dữ liệu chéo cao hơn nhiều so với lợi ích ở quy mô cấp xã.

## D-010 · 2026-10-14 · Nhiều "bộ chỉ tiêu" song song, thư viện mẫu là mã nguồn có căn cứ đã xác minh

- **Bối cảnh**: một phường cùng lúc chịu nhiều hệ chỉ tiêu khác bản chất: kế hoạch KT-XH thành phố giao
  (QĐ 333/QĐ-UBND, báo cáo trước ngày 20 hằng tháng), chấm điểm chuyển đổi số DTI (QĐ 3336/QĐ-UBND, 8 nhóm 100 điểm),
  chỉ tiêu thống kê cấp xã (Thông tư 148/2026/TT-BTC, 55 chỉ tiêu), nhiệm vụ địa phương tự đặt.
- **Chọn**: bảng `Framework` với `kind` ∈ PLAN/SCORE/TASK/STAT và `issuingLevel`; chỉ tiêu có cha–con, số thứ tự,
  mã chuẩn, nhóm, điểm tối đa, thang chấm. Thư viện mẫu viết bằng TypeScript (kiểm tra bằng test: DTI tổng 100 điểm,
  TT148 đủ 55 mã, KT-XH đủ 30 chỉ tiêu) thay vì nhập tay qua giao diện.
- **Căn cứ**: mẫu là tri thức pháp lý cần được rà soát như mã (review, test, lịch sử thay đổi). Mỗi mẫu ghi căn cứ và
  phạm vi áp dụng; mẫu của một tỉnh chỉ gợi ý cho đơn vị thuộc tỉnh đó. Văn bản đầu vào chưa xác minh (vd kết quả của
  một công cụ AI đối chiếu sai với ảnh bản gốc) bị loại.

## D-011 · 2026-10-14 · Hồ sơ chỉ tiêu ba phần; minh chứng chỉ nhận ảnh/PDF ≤ 10 MB

- **Chọn**: mỗi chỉ tiêu có (1) chỉ đạo điều hành (`TargetDirective`), (2) thực hiện (báo cáo theo kỳ `periodKey` +
  nguồn số liệu + giải trình + minh chứng `Evidence`), (3) đánh giá theo kỳ (`TargetEvaluation`, bắt buộc ghi chú khi
  chưa đạt). Văn bản nguồn của đề xuất được duyệt tự trở thành văn bản chỉ đạo.
- **Căn cứ**: đây đúng là cách cán bộ đang làm hồ sơ chấm điểm DTI và báo cáo QĐ 333 (văn bản → số liệu → minh
  chứng → tự đánh giá). Minh chứng lưu `Bytes` như D-008 nhưng chỉ ảnh/PDF (kiểm tra magic-byte); Word/Excel đi qua
  Kho văn bản để được OCR/trích xuất và tránh tệp thực thi đội lốt.

## D-012 · 2026-10-14 · Chỉ tiêu tự tính bằng công thức JSON khai báo trên kho dữ liệu nghiệp vụ

- **Phương án**: (a) biểu thức dạng chuỗi chạy `eval`/thư viện biểu thức; (b) JSON khai báo có lược đồ cố định;
  (c) chỉ cho nhập tay.
- **Chọn**: (b). `Dataset` (cột có kiểu) + `DatasetRow` (JSONB); bộ máy `formula.ts` thuần TypeScript: phép gộp,
  điều kiện, tỷ lệ/phần trăm, quy tắc điểm (linear, capped, threshold, steps, binary, band), trả kèm dấu vết. Bảng hệ
  thống `feedback` đọc trực tiếp phân hệ phản ánh, không chép dữ liệu cá nhân.
- **Căn cứ**: người dùng không thể chèn mã; máy chủ kiểm tra cấu trúc trước khi lưu; mọi con số tự tính truy ngược
  được về dòng dữ liệu gốc — điều kiện để lãnh đạo tin số liệu. Nhập Excel theo mẫu sinh từ khai báo cột.

## D-013 · 2026-10-14 · Tự thông qua có trách nhiệm (bổ sung D-006)

- **Bối cảnh**: khách hàng nêu "trưởng phòng không duyệt thì việc treo mãi"; D-006 cấm tự duyệt kết quả AI.
- **Chọn**: báo cáo số liệu chờ duyệt quá `reportAutoApproveDays` và đề xuất chỉ tiêu **do người trình** quá
  `proposalAutoApproveDays` được hệ thống tự thông qua; sự kiện ghi rõ người đáng lẽ phải duyệt và được tính vào màn
  hình "Trách nhiệm người đứng đầu". Kết quả AI **không bao giờ** vào hàng chờ tự thông qua khi chưa có người bấm trình
  (D-006 giữ nguyên với AI). Không tự thông qua nếu số liệu chỉ tiêu đã thay đổi sau lúc gửi hoặc đề xuất thiếu trường
  bắt buộc — khi đó leo thang lên lãnh đạo.
- **Căn cứ**: biến "chờ vô hạn" thành "chờ có hạn và có người chịu trách nhiệm"; khớp tinh thần Nghị định 335/2025 về
  đánh giá công chức theo kết quả nhiệm vụ và tiến độ.

## D-014 · 2026-10-14 · Sáu vai trò và bộ giám sát thời hạn chạy trong tiến trình API

- **Chọn**: thêm `LEADER` (Chủ tịch/Phó Chủ tịch: giao, duyệt, đánh giá, yêu cầu giải trình toàn địa phương) và
  `CLERK` (Văn thư: tiếp nhận văn bản, rà soát đề xuất AI, chuyển phản ánh; không báo cáo số liệu) — tách thẩm quyền
  nghiệp vụ khỏi `ADMIN` kỹ thuật. Bộ giám sát (`accountability-worker.ts`) chạy định kỳ trong API như worker outbox
  (D-004): tự thông qua, nhắc thiếu báo cáo kỳ, nhắc chưa giao người, leo thang việc bị treo/giải trình quá hạn; mỗi
  thông báo có `dedupeKey` nên chạy lại không nhắc trùng.
- **Căn cứ**: bản 1 dồn mọi quyền nghiệp vụ vào tài khoản quản trị, không khớp bộ máy UBND cấp xã. Không thêm Redis
  hay cron ngoài vì một bản cài phục vụ một địa phương (D-009).
- **Câu hỏi mở**: thời hạn hiện tính theo ngày lịch; nếu khách hàng yêu cầu ngày làm việc cần thêm lịch nghỉ lễ.

## D-015 · 2026-11-01 · Quy trình xử lý văn bản bản 2: ocr-service (Docling + VietOCR), chia đoạn theo mục, B10, bge-m3 + pgvector

- **Bối cảnh**: đánh giá VB-2026-0007 cho thấy bộ đọc cũ bỏ trống trang scan sau trang 20, cắt đôi tên chỉ tiêu ở chỗ
  xuống dòng của PDF, ghi job COMPLETED kèm tên model dù Qwen hết giờ ở mọi đoạn, và so trùng chỉ bằng Dice. Bản quy
  trình chốt 26/10 (17 bước B1–B17) là căn cứ thiết kế.
- **Chọn**:
  - B2–B6 ở dịch vụ Python riêng `services/ocr`: Docling đọc thẳng PDF có lớp chữ và Word, dựng bảng bằng TableFormer
    và cấu trúc tài liệu; trang scan và ảnh qua OpenCV (xoay thẳng, gỡ dấu đỏ), RapidOCR tìm dòng, VietOCR đọc, bộ đọc
    thứ hai PP-OCRv5 latin để so; dòng hai bộ đọc lệch nhau hoặc có âm tiết sai luật tiếng Việt mang cờ `can_ra_soat`.
    Dịch vụ là tùy chọn (profile `ocr`); API giữ bộ đọc pdf.js + Tesseract làm dự phòng, bỏ trần 20 trang.
  - B7 ở API (cần cả văn bản): đoạn theo mục, mang `heading_path`, câu đầu mục, id phần tử nguồn; giữ định dạng
    `[Mục: …]` và bảng dạng chữ để mô hình fine-tune `qwen3-chitieu` đọc được.
  - B8: temperature 0, gọi lại một lần khi JSON hỏng; Qwen lỗi thì dùng luật và ghi rõ trên job và bản ghi; đoạn không
    có chữ số và ô biểu mẫu cố định không gửi Qwen.
  - B10: 8 luật (cấu trúc, bám nguồn, đơn vị, miền giá trị, năm và hạn, tên, nhất quán, chất lượng OCR) gắn cờ, chạy
    lại khi người duyệt sửa.
  - B11–B14: bge-m3 qua Ollama, vector lưu `double precision[]` + chỉ mục HNSW biểu thức `vector(1024)` riêng cho chỉ
    tiêu và danh mục; xếp TRUNG / GAN_TRUNG / MOI theo ngưỡng 0,95 / 0,85; gợi ý mã từ thư viện bộ chỉ tiêu mẫu.
  - pgvector biên dịch trên `postgres:17-alpine` để giữ volume (không đổi sang image Debian).
- **Khác với bản quy trình**: (1) bản ghi TRUNG không tự gộp vào kho; mọi đề xuất AI vẫn qua người duyệt theo D-006,
  người duyệt có thêm nút "Gộp vào" chỉ tiêu có sẵn. (2) Danh mục chỉ tiêu chưa đưa vào prompt Qwen (giữ đúng định
  dạng mô hình đang fine-tune); mã được gợi ý bằng vector. (3) Prisma chưa có kiểu vector nên cột là mảng số thực, chỉ
  mục HNSW trên biểu thức ép kiểu. (4) Ảnh dòng OCR đã sửa chưa được lưu thành dữ liệu huấn luyện VietOCR.
- **Câu hỏi mở**: CER của VietOCR trên dataset1, ngưỡng gộp hai bộ đọc, ngưỡng B14 trên vài trăm cặp đã gán nhãn, thời
  gian mỗi trang trên CPU máy chủ, dung lượng image ocr-service.

## D-016 · 2026-11-05 · Luật chỉ thay Qwen khi Qwen lỗi, bỏ bổ khuyết mặc định (sửa D-007; chốt 11/11)

- Chạy thử trên máy người dùng (QĐ 015 mẫu, Qwen gốc và bản fine-tune): Qwen bắt 29–30/30 chỉ tiêu, còn mọi ứng viên
  thừa của bản fine-tune đều do luật bổ khuyết thêm vào từ câu số liệu nền ("Số liệu nền năm 2025 là 80 hộ", "Kết quả
  cân, đo…"). Bổ khuyết theo giá trị số không phân biệt được chỉ tiêu với số liệu nền.
- Đoạn Qwen đọc được thì chỉ lấy kết quả Qwen. Luật vẫn chạy đầy đủ khi Qwen lỗi, hết giờ, Ollama tắt hoặc đoạn vượt
  trần `EXTRACTION_MAX_LLM_CHUNKS` (graceful degradation của D-007 giữ nguyên).
- `EXTRACTION_RULE_FILL_IN=true` bật lại bổ khuyết kiểu D-007 cho máy chỉ có model yếu.


## D-017 · 2026-11-06 · Thứ tự, số thứ tự, nhóm và lĩnh vực của đề xuất lấy từ cấu trúc văn bản

- **Bối cảnh**: chạy thử file mẫu QĐ 015 (32 chỉ tiêu, 3 mục) cho thấy màn hình duyệt không theo thứ tự văn bản và
  không gom theo mục. Nguyên nhân ở lớp ứng dụng: bước bỏ trùng sắp theo độ tin cậy, API trả theo thời điểm tạo, giao
  diện chỉ in đề mục thành một dòng chữ; số thứ tự do model điền (model gốc 0/32, bản fine-tune 22/31) và lĩnh vực
  do model đoán từng đoạn (từng xếp chỉ tiêu an toàn thực phẩm vào an ninh - quốc phòng dù đề mục ghi y tế).
- **Chọn**: không train hay viết prompt theo mẫu văn bản, mà lấy từ chính văn bản (`extraction-structure.ts`):
  - thứ tự đọc `documentOrder` = số đoạn × 10000 + vị trí câu trích trong đoạn; API sắp theo cột này khi xem một văn
    bản; bỏ trùng vẫn giữ bản tin cậy cao nhưng không đổi thứ tự;
  - số thứ tự dò trong văn bản gốc trước ("(9)", "9.", "a)", ô STT đầu hàng bảng), model là phương án phụ; hai chỉ
    tiêu cùng một mục dùng chung số như văn bản;
  - `groupName` = cấp đề mục đầu tiên mà các chỉ tiêu bắt đầu khác nhau, giữ đúng chữ của văn bản;
  - `category` là lĩnh vực chuẩn (8 lĩnh vực, sửa danh sách ở một chỗ), theo thứ tự: từ khoá trong đề mục, so nghĩa
    bge-m3 với mô tả lĩnh vực, gợi ý của model, từ khoá trong tên; không đủ căn cứ thì để trống cho người duyệt chọn;
  - duyệt thành chỉ tiêu thì mang theo số thứ tự, nhóm và thứ tự sang `Target.ordinal/groupName/sortOrder`.
- **Câu hỏi mở**: ngưỡng so nghĩa bge-m3 (0,45 và cách biệt 0,02) chưa đo trên dữ liệu thật; chỉ tiêu cha
  (`parentId`) chưa tự nối khi duyệt.
- **Đã chốt (06/11)**: màn hình duyệt mặc định gom theo đề mục văn bản; dashboard gom theo lĩnh vực chuẩn.

## D-018 · 2026-11-06 · Bảng chỉ tiêu Excel theo khuôn Phụ lục 1 để chuyên viên chuẩn hoá rồi tải lên

- **Bối cảnh**: chuyên viên cần xem kết quả bóc tách trực quan như phụ lục giao chỉ tiêu, sửa hàng loạt trong Excel,
  rồi đưa lên hệ thống để gửi các phòng chuyên môn.
- **Chọn**: `GET /documents/:id/candidate-sheet` xuất các đề xuất chưa duyệt theo khuôn PL1 (STT | Chỉ tiêu | Đơn vị
  tính | Kế hoạch năm | Đơn vị chủ trì báo cáo | Ghi chú), hàng nhóm số La Mã theo đề mục văn bản, hàng "-" cho chỉ
  tiêu thành phần, kế hoạch giữ chữ gốc ("≥ 95,5", "9.800 USD/người"); thêm cột Lĩnh vực, Kỳ báo cáo, Hạn, Chiều đánh
  giá, Xử lý (Giữ/Bỏ), trang và trích dẫn nguồn; mã và phiên bản đề xuất ở cột ẩn. `POST` cùng đường dẫn đọc file đã
  sửa: mặc định chỉ xem trước (sửa, thêm, loại, đổi thứ tự, lỗi); `apply=1` mới ghi, có lỗi thì không ghi gì;
  `submit=1` trình các đề xuất đủ thông tin, mỗi phòng chủ trì (trưởng phòng) và lãnh đạo nhận một thông báo cho đề
  xuất của phòng mình (D-006 giữ nguyên: vẫn phải duyệt).
- **Quy tắc**: phiên bản trong file khác trên hệ thống thì báo lỗi, không ghi đè; xoá hàng không loại đề xuất (phải
  chọn "Bỏ"); quyền sửa, chuyển phòng, loại giống các nút trên màn hình duyệt; không thêm bảng lưu lần nhập.

## D-019 · 2026-11-06 · Ký hiệu ngưỡng ở cột Kế hoạch đọc từ câu trích dẫn bằng bảng cụm từ

- **Bối cảnh**: văn bản ghi "ít nhất 125,5 tỷ đồng", "từ 8% trở lên", "không vượt quá 2%"; bảng PL1 chỉ có con số
  thì mất nghĩa ngưỡng. Người dùng cần cột Kế hoạch có ký hiệu >=, >, <=, <, =.
- **Chọn**: không dạy model hay thêm bảng giải thích vào prompt. `target-threshold.ts` dò cụm từ sát ngay con số mục
  tiêu trong câu trích dẫn (cụm phủ định và cụm dài xét trước; "từ 60 tuổi trở lên", "trẻ em dưới năm tuổi" không
  tính vì không đứng sát con số mục tiêu) và cho ">= 125,5", "< 6,5", "= 100", "70 - 75", "khoảng 12.000". Không
  thấy con số trong câu trích thì để nguyên số, không đoán.
- **Số trần** (bảng PL2 chỉ ghi "% | 60", khoảng một nửa số hàng): văn bản không ghi ký hiệu nên model hay code đều
  không "nhận ra" được. Tạm suy theo chiều đánh giá (càng cao càng tốt → >=, càng thấp càng tốt → <=), ô tô xanh kèm
  chú thích "hệ thống suy ra" để chuyên viên rà.
- **Thứ hạng** (bổ sung 09/11): số ngay sau "hạng", "top", "nhóm" thì số nhỏ hơn là tốt hơn: "từ hạng 10 trở lên",
  "top 10" là <= 10; "hạng 5" trần suy <= 5 (tô xanh). "Đạt tỉ lệ 38%", "tăng bình quân 7%" là "=".
- **Đã chốt (06/11)**: số trần suy theo chiều đánh giá như trên; ký hiệu và số ghi chung một cột Kế hoạch đúng kiểu
  PL1 (không tách cột Ký hiệu).
- **Phạm vi**: chỉ điền khi xuất bảng (đề xuất có `targetText` thì dùng chữ đó); ký hiệu tự điền mà chuyên viên giữ
  nguyên thì không tính là sửa. Chuyên viên sửa thành ">= 130" thì lưu `targetText`, màn hình chỉ tiêu ghép thêm
  đơn vị tính. Không ghi vào CSDL lúc bóc tách để các màn hình đang hiển thị `targetText` không mất đơn vị.
- **Câu hỏi mở**: đánh giá hoàn thành theo ký hiệu chưa làm; "khoảng X" tính đạt từ mức nào chờ người dùng chốt.

## D-020 · 2026-11-11 · Kiểm tra đủ mục: đếm mục đánh số trong văn bản, hỏi lại Qwen các mục thiếu

- **Bối cảnh**: VB-2026-0008 hai lần mất chỉ tiêu (mục (1)–(13), rồi (22)–(26)) mà lượt trích xuất vẫn báo hoàn tất;
  chỉ phát hiện khi so tay với PDF. B10 kiểm từng bản ghi nên không thấy bản ghi không tồn tại.
- **Chọn**: `extraction-completeness.ts` đếm các mục "(n)" (đầu dòng hoặc sau dấu kết câu) và hàng bảng có ô STT trong
  từng đoạn; mục có số liệu mục tiêu (bỏ số hiệu văn bản, điều khoản) mà không đề xuất nào trích từ đó là mục thiếu.
  Qwen được hỏi lại một lần với đoạn rút gọn chỉ gồm các mục thiếu (tối đa `EXTRACTION_RECHECK_MAX` lần mỗi văn bản);
  bản ghi tìm được ở lượt hỏi lại có cảnh báo riêng. Mục vẫn thiếu ghi vào ghi chú của lượt ("trang 3 mục (22): …") và
  `stats.missingItems` cho người duyệt đối chiếu.
- **Giới hạn**: chỉ áp dụng cho đoạn Qwen đọc được; văn bản không đánh số thì không kiểm được (đợt 2: kiểm "số chưa
  được trích"). Mục có số nhưng không phải chỉ tiêu sẽ thành ghi chú thừa, chấp nhận vì chỉ là nhắc đối chiếu.

## D-021 · 2026-11-11 · Nhớ kết quả Qwen theo đoạn

- **Bối cảnh**: trên CPU, Qwen chiếm khoảng 97% thời gian (VB-2026-0008: 2.068 giây cho 40 đoạn, đọc file 36 giây). Mỗi
  lần sửa code rồi "Đọc lại" là chạy lại cả 35 phút dù phần lớn đoạn không đổi.
- **Chọn**: bảng `LlmExtractionCache` lưu câu trả lời thô của Qwen, khoá bằng SHA-256 của mọi thứ quyết định câu trả
  lời ở temperature 0: phiên bản prompt, tên model, digest của model trong Ollama, schema, và toàn bộ tin nhắn gửi đi.
  Lưu câu trả lời thô (không lưu bản ghi đã làm sạch) để các sửa đổi ở bước làm sạch, B10, nhóm, ký hiệu vẫn có hiệu
  lực khi đọc lại. Không hỏi được digest thì không nhớ; câu trả lời hỏng JSON không được lưu.
- **Vệ sinh dữ liệu**: dòng gắn với văn bản tạo ra nó và bị xoá cùng văn bản; quá `EXTRACTION_LLM_CACHE_DAYS` (mặc định
  90) thì bỏ. Đặt 0 để tắt, ví dụ khi cần đo thời gian chạy thật.

## D-022 · 2026-11-11 · Bảng có hàng, cột được đọc bằng code, không gửi Qwen

- **Bối cảnh**: lần chạy trên máy người dùng (CPU) cho thấy Qwen chiếm gần hết thời gian, trong khi bảng chỉ tiêu
  (Phụ lục, biểu giao chỉ tiêu, file Excel) đã có sẵn cấu trúc hàng và cột. Qwen đọc bảng dễ lệch cột (lấy số của cột
  "Thực hiện" làm kế hoạch), bỏ hàng, và mất mã số, ô kế hoạch nguyên văn.
- **Chọn**: `table-extraction.ts` nhận vai trò từng cột theo chữ ở hàng tiêu đề (STT, tên chỉ tiêu, mã số, đơn vị tính,
  kế hoạch, thực hiện, so sánh, chủ trì, phối hợp, thời hạn, tần suất, ghi chú) rồi lập mỗi hàng một bản ghi
  (`ExtractionMethod.TABLE`, `promptVersion` = `table-v1`). Không có luật riêng cho một mẫu bảng nào: tiêu đề nhiều
  tầng, ô gộp, hàng đánh số cột, hàng nhóm (I, A, chữ in hoa, hàng gộp cả bảng), hàng con (a, -, +), bảng nối trang
  không lặp tiêu đề, và cột của từng địa phương đều suy từ cấu trúc.
- **Cột kế hoạch chính**: cột của chính địa phương, rồi năm của văn bản, rồi "cả năm"; cột quý, tháng bị trừ điểm; cột
  của năm trước coi là số thực hiện. Ô chính trống thì lấy cột kế hoạch khác có số và ghi cảnh báo; các cột kế hoạch
  còn lại chép vào mô tả. Ô kế hoạch giữ nguyên văn ở `targetText` ("Tăng 4-5%", "dưới 1,5%").
- **Bảng nhiệm vụ** (không có cột kế hoạch nhưng có cột chủ trì hoặc thời hạn): mỗi hàng thành đề xuất loại Nhiệm vụ
  (`targetKind = TASK`) theo quy ước hoàn thành 100% ("Hoàn thành", đơn vị %), hạn lấy ở cột thời hạn ("Quý II/2026" là
  30/6/2026), không có thì cuối năm văn bản. Lý do: màn duyệt bắt buộc đủ đơn vị, giá trị, năm, hạn cho mọi loại.
- **Khi nào Qwen vẫn đọc**: bảng không nhận ra hàng tiêu đề, dưới một nửa số hàng lập được bản ghi, hoặc văn bản đã đọc
  từ bản cũ nên hàng không khớp được với đoạn. Hàng có tên nhưng không có giá trị được ghi vào ghi chú của lượt
  ("Bảng có N hàng không lập được đề xuất") và `stats.tableUnreadRows`. `EXTRACTION_TABLE_READER=false` để tắt.
- **Excel**: API tự đọc .xlsx thành bảng có cấu trúc (ô, ô gộp, địa chỉ ô, chỉ sheet đang hiện) nên không cần
  ocr-service. Số trong ô được ghi theo cách người Việt nhìn thấy ("12,1", "95%"), giống nhau ở cả API và ocr-service.
- **Giới hạn**: bảng scan mà OCR đọc sai cấu trúc thì code đọc sai theo; người duyệt vẫn là bước chốt (D-006). Bảng
  ma trận (mỗi cột là một đơn vị) mới lấy cột của chính địa phương, các cột khác chép vào mô tả.
