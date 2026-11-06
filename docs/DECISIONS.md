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
