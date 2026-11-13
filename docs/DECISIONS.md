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

## D-030 · 2026-11-13 · Bàn làm việc số là trang vào của cán bộ; cấu hình cá nhân một bản ghi JSON, nghiệp vụ lấy trực tiếp

- **Bối cảnh**: góp ý sau buổi báo cáo 21/10/2026 (G-01…G-09): công chức dùng khoảng năm phần mềm, sáng đăng nhập cần
  thấy ngay hôm nay làm gì; lãnh đạo muốn dán giấy nhắc lên bàn của cán bộ.
- **Chọn**: `/admin` là Bàn làm việc; Trung tâm điều hành chuyển sang `/admin/dieu-hanh`. Bố cục, tiện ích, lối tắt, hình
  nền của mỗi người nằm trong một bản ghi `UserWorkspace` (JSON có phiên bản, kiểm tra bằng một bộ quy tắc dùng chung cho
  máy chủ và trình duyệt). Dữ liệu nghiệp vụ trên bàn (nhắc việc, lịch, số đếm, mục ghim) **không lưu trong cấu hình** mà
  tính trực tiếp theo quyền mỗi lần mở (`GET /workspace/briefing`, `/workspace/pins`) — mất quyền là mất mục, không có bản
  sao lệch.
- **Không chọn**: kiến trúc connector/macro và kênh SSE riêng của bản thử trước (PR #26): thêm một tầng hạ tầng cho nhu cầu
  mà hỏi lại định kỳ 30 giây đã đáp ứng.
- **Căn cứ**: một nguồn sự thật cho quyền (các hàm phạm vi sẵn có), cấu hình cá nhân tách khỏi nghiệp vụ nên hỏng cấu hình
  không ảnh hưởng số liệu.

## D-031 · 2026-11-13 · Giấy note là thư riêng giữa người gửi và người nhận; nhắc việc của hệ thống không lưu bảng

- **Chọn**: note người gửi (`DeskNote`, `DeskNoteRecipient`, `DeskNoteReply`) chỉ tác giả và người nhận đọc được — kể cả
  quản trị viên cũng không đọc note của người khác; nhật ký chỉ ghi siêu dữ liệu, không ghi nội dung. Ai gửi được cho ai
  theo bậc: chuyên viên → cùng phòng, lãnh đạo, Chánh Văn phòng; trưởng phòng → thêm cả phòng mình và trưởng phòng khác;
  lãnh đạo, Chánh Văn phòng, quản trị → bất kỳ ai, một phòng, một vai trò hoặc toàn cơ quan. Giới hạn 30 note và 60 trả lời
  mỗi giờ cho một người.
- **Chọn**: "note hệ thống" (thiếu báo cáo, có nguy cơ, nhiệm vụ đến hạn, chờ giải trình, chờ duyệt…) là kết quả tính từ
  dữ liệu chỉ tiêu tại thời điểm xem, không tạo bản ghi; "Ẩn đến mai" lưu trên thiết bị.
- **Căn cứ**: note là kênh nhắc việc cá nhân chứ không phải văn bản giao việc — việc chính thức vẫn là chỉ tiêu, nhiệm vụ,
  chỉ đạo có nhật ký. Nhắc việc tính trực tiếp thì việc xong là giấy tự biến mất, không phải dọn.

## D-032 · 2026-11-13 · Ứng dụng công vụ là danh mục liên kết do quản trị viên khai báo; số trên biểu tượng lấy từ JSON công khai

- **Chọn**: bảng `WorkApp` (tên, địa chỉ, biểu tượng, nhóm, công dụng, đối tượng theo vai trò HOẶC phòng, thứ tự, ẩn/hiện).
  Hệ thống chỉ mở liên kết sang phần mềm khác, không đăng nhập hộ. Huy hiệu số: ứng dụng nội bộ lấy từ IOC theo quyền; ứng
  dụng ngoài khai báo một địa chỉ JSON HTTPS công khai, máy chủ gọi hộ qua lớp chống SSRF (chặn địa chỉ nội bộ, chuyển
  hướng, phản hồi nén/quá cỡ), lưu tạm 5 phút cả khi lỗi; lỗi thì chỉ ẩn con số.
- **Không chọn**: lưu tài khoản/mật khẩu phần mềm khác hoặc RPA đăng nhập hộ — rủi ro bảo mật vượt quá lợi ích "thấy con số".
- **Câu hỏi mở**: khi các phần mềm của tỉnh có API xác thực (SSO), huy hiệu cần thêm cơ chế uỷ quyền theo người dùng.

## D-033 · 2026-11-13 · Lịch làm việc của lãnh đạo: dòng lịch có cấu trúc theo tuần, kèm tệp đã ký; công khai theo tuần và theo dòng

- **Bối cảnh**: G-40 — người dân cần xem lịch làm việc của lãnh đạo UBND; đề xuất ban đầu là tải tệp lịch lên như văn bản.
- **Chọn**: mỗi tuần một `WorkSchedule` (thứ Hai là khoá) gồm các `WorkScheduleEntry` (ngày, buổi/giờ, nội dung, lãnh đạo
  chủ trì, địa điểm, thành phần, có công khai không) và tuỳ chọn một tệp PDF lịch đã ký. Văn phòng, văn thư, lãnh đạo, quản
  trị lập lịch; mọi cán bộ xem. Trang công khai chỉ nhận tuần đã bấm công khai và chỉ các dòng được đánh dấu công khai —
  máy chủ lọc, không trả mã bản ghi hay ghi chú nội bộ.
- **Căn cứ**: dòng lịch có cấu trúc mới đưa được vào "Hôm nay · Ngày mai" của Bàn làm việc, đọc tốt trên điện thoại và
  tách được cuộc họp nội bộ khỏi bản công khai; tệp PDF giữ giá trị pháp lý của bản đã ký.

## D-034 · 2026-11-13 · Mã khôi phục mật khẩu qua tin nhắn: cổng SMS HTTP tuỳ chọn, số điện thoại do quản trị viên khai báo

- **Chọn**: giữ luồng mã một lần sẵn có (HMAC, 10 phút, 5 lần thử, không lộ tài khoản có tồn tại hay không) và thêm kênh
  tin nhắn gọi một cổng SMS HTTP bất kỳ qua biến môi trường (`SMS_GATEWAY_URL`, `SMS_GATEWAY_TOKEN`, `SMS_GATEWAY_BODY`,
  `SMS_OTP_TEMPLATE`). Chưa khai báo thì màn Quên mật khẩu không hiện lựa chọn tin nhắn. Thêm trần 5 yêu cầu tin nhắn mỗi
  giờ cho một tài khoản. Số di động thuộc hồ sơ tài khoản và chỉ quản trị viên sửa được, như email công vụ.
- **Căn cứ**: hệ thống không ràng buộc nhà mạng; người dùng không tự đổi được nơi nhận mã nên chiếm phiên đăng nhập không
  dẫn tới chiếm tài khoản.

## D-035 · 2026-11-14 · Nhiệm vụ của văn bản chỉ đạo là chỉ tiêu loại Nhiệm vụ; mỗi văn bản chỉ đạo là một bộ loại TASK

- **Bối cảnh**: G-10…G-16 — quản lý chương trình công tác, thông báo kết luận, kế hoạch; phân rã thành việc giao cho phòng;
  xem "tháng này phòng phải làm gì"; thống kê việc thực hiện.
- **Chọn**: không dựng hệ thống nhiệm vụ riêng. Mỗi văn bản chỉ đạo là một `Framework(kind=TASK)` có loại văn bản, số ký
  hiệu, ngày ban hành và tệp trong Kho văn bản; mỗi việc là một `Target` loại TASK (mức giao 100 %, một hạn hoàn thành, không
  có kỳ báo cáo định kỳ). Nhờ vậy nhiệm vụ dùng lại nguyên hồ sơ, báo cáo kết quả, minh chứng, duyệt, chỉ đạo, giải trình,
  dòng thời gian và nhắc hạn của chỉ tiêu. Nhiệm vụ gắn được với một chỉ tiêu (`relatedTargetId`) để hồ sơ chỉ tiêu thấy
  lãnh đạo đã chỉ đạo, thúc đẩy bằng những văn bản nào.
- **Quy ước thống kê**: tháng thống kê là tháng đến hạn; "đúng hạn" tính theo ngày nộp báo cáo 100 % đã được duyệt (không
  tính thời gian chờ duyệt vào lỗi của người làm); ngày trễ bình quân tính trên việc hoàn thành trễ, việc còn quá hạn đếm riêng.
- **Căn cứ**: một cơ chế trách nhiệm cho cả chỉ tiêu và nhiệm vụ; ít mã, ít chỗ lệch quyền.

## D-036 · 2026-11-14 · "Người phân việc" là thiết lập của địa phương: Lãnh đạo UBND hoặc Chánh Văn phòng

- **Bối cảnh**: G-12 — ở Lái Thiêu Chánh Văn phòng phân việc cho các phòng; nơi khác do lãnh đạo UBND phân.
- **Chọn**: `SystemSetting.dispatchMode` = `LEADER` (mặc định) hoặc `OFFICE`. Ở chế độ `OFFICE`, trưởng phòng của phòng loại
  Văn phòng được tạo văn bản chỉ đạo, giao việc cho mọi phòng và duyệt đề xuất chỉ tiêu liên phòng (không tự duyệt đề xuất
  của mình). Quyền phân việc **không** kèm quyền báo cáo thay chuyên viên hay giao chuyên viên thay trưởng phòng. Người phân
  việc và thời điểm được ghi trên từng nhiệm vụ, từng đề xuất. Mọi nơi cần biết ai là người phân việc đều gọi `dispatch.ts`.
- **Căn cứ**: D-009 — khác biệt giữa các địa phương là cấu hình, không phải mã riêng.

## D-037 · 2026-11-14 · Quyền xem tách khỏi quyền ghi; lãnh đạo không ghi số liệu

- **Bối cảnh**: G-23 (cán bộ xem được chỉ tiêu phòng khác, không sửa) và G-24 (lãnh đạo chỉ xem và duyệt; số chưa đúng thì
  trả cho chuyên viên cập nhật lại).
- **Chọn**: hai hàm phạm vi riêng — `resolveReadDepartmentScope` cho mọi truy vấn đọc, `resolveDepartmentScope` cho thao tác
  ghi. Thiết lập `crossDepartmentView` (bật mặc định) cho chuyên viên, trưởng phòng, người xem đọc toàn địa phương; công tắc
  "Phòng tôi / Toàn địa phương" mặc định là phòng mình. Việc của tôi, hàng chờ duyệt, số việc cần xử lý vẫn theo phạm vi công
  việc. Vai trò `LEADER` bị chặn gửi báo cáo, nhập Excel và sửa kho dữ liệu; `ADMIN` vẫn ghi nhận số liệu ban đầu và được
  ghi rõ "Quản trị ghi nhận".
- **Chọn**: "Yêu cầu cập nhật lại" trên báo cáo đã duyệt — bản cũ giữ hiệu lực và số chính thức không đổi cho tới khi bản
  thay thế của cùng kỳ được duyệt; toàn bộ lịch sử được giữ.
- **Căn cứ**: người duyệt không đồng thời là người nhập; số chính thức không bao giờ rơi vào trạng thái "đang sửa".

## D-038 · 2026-11-14 · Chỉ tiêu được nhiều văn bản giao: liên kết theo nhóm, không gộp bản ghi

- **Bối cảnh**: G-21 — Thành phố giao một mức, Đảng uỷ phường giao cao hơn một nấc; AI chỉ phát hiện và báo, người có thẩm
  quyền quyết định; sau khi xử lý phải thấy cả hai văn bản.
- **Chọn**: các chỉ tiêu cùng nội dung ở những bộ khác nhau được đặt chung `linkGroupId`. Mỗi chỉ tiêu giữ nguyên mức giao,
  văn bản giao và tiến độ riêng; báo cáo đã duyệt của một chỉ tiêu được **đồng bộ** sang các chỉ tiêu cùng nhóm (bản đồng bộ
  trỏ về báo cáo gốc, minh chứng không sao chép). Hệ thống chỉ **gợi ý** cặp trùng (cùng mã chuẩn hoặc tên tương đồng, cùng
  năm, đơn vị); liên kết, bỏ qua, bỏ liên kết đều do người có quyền bấm và có nhật ký. Chỉ liên kết chỉ tiêu nhập tay, không
  có chỉ tiêu con, cùng tần suất và chiều đánh giá; nhiệm vụ của văn bản chỉ đạo không tham gia.
- **Không chọn**: gộp thành một bản ghi nhiều mức giao — mất khả năng báo cáo riêng theo từng văn bản và khó tương thích với
  báo cáo hai cấp giao của nhánh xử lý văn bản.
- **Căn cứ**: nhập một lần, hai văn bản đều có số; đánh giá đạt/không đạt theo đúng mức của từng cấp giao.

## D-039 · 2026-11-14 · Dự báo khả năng không đạt: hồi quy logistic thuần TypeScript, nói rõ khi chưa đủ dữ liệu

- **Bối cảnh**: G-26 — đề tài cần AI dự đoán khả năng trễ của chỉ tiêu; dữ liệu các kỳ cũ sẽ được cung cấp sau.
- **Chọn**: mô hình hồi quy logistic có chuẩn hoá và điều chuẩn L2, viết bằng TypeScript chạy ngay trong API (không thêm
  dịch vụ Python). 17 đặc trưng lấy từ dữ liệu trách nhiệm sẵn có: mức đạt so với thời gian đã qua, xu hướng các kỳ gần,
  tỷ lệ báo cáo trễ/thiếu, số lần trả lại, chuyển việc, giải trình đang mở, số ngày chưa giao người… Mẫu huấn luyện dựng tại
  các mốc 25/50/65/80 % thời gian của những chỉ tiêu đã kết thúc và **không đọc dữ liệu sau mốc**; tách tập kiểm tra theo
  nhóm chỉ tiêu. Giá trị cuối kỳ ngoại suy theo nhịp thực hiện, kèm khoảng dự báo từ phần dư.
- **Trung thực về dữ liệu**: dưới 40 mẫu, 12 nhóm hoặc thiếu một lớp thì dùng hệ số tiên nghiệm và ghi rõ "chưa đủ dữ liệu";
  lịch sử nhập để huấn luyện nằm ở bảng riêng (`ForecastHistory`), không đụng số vận hành; dữ liệu mô phỏng mang cờ
  `simulated` và mọi màn hình, tệp xuất đều ghi nguồn. Bộ mẫu hiện là mô phỏng — chỉ số đánh giá chưa nói lên độ chính xác
  trên số liệu thật.
- **Phạm vi**: chỉ dự báo chỉ tiêu kế hoạch và chấm điểm; chỉ tiêu thống kê không có mức giao, nhiệm vụ chỉ có xong/chưa
  xong nên theo dõi bằng hạn.
- **Câu hỏi mở**: cần lịch sử thật của địa phương để hiệu chuẩn và đánh giá lại trước khi dùng xác suất cho quyết định.
