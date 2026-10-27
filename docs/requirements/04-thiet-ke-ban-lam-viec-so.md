# Thiết kế Bàn làm việc số

> Đầu vào: yêu cầu của chủ đầu tư (10/2026) — mỗi cán bộ có một bàn làm việc số riêng, tự đổi hình nền, tự sắp đặt
> không gian; nút dẫn tới mọi chức năng; tiện ích (widget) của từng chức năng như biểu đồ trực tiếp, chọn vị trí đặt
> cảnh báo; phím tắt gọi API kể cả API bên ngoài; lối tắt tới trang web ngoài; lãnh đạo dán giấy note lên bàn làm
> việc của người khác; "tùy chỉnh theo ý mình, nghĩ rộng và vượt mong đợi". Widget dữ liệu giai đoạn đầu chỉ hiện
> số liệu trong phòng.
>
> Trạng thái: đặc tả để triển khai, chia 7 phân hệ, mỗi phân hệ dùng được ngay khi xong. Quyết định kiến trúc ghi ở
> [DECISIONS.md](../DECISIONS.md) (D-015…D-019).

## 1. Mục tiêu

Bàn làm việc số là **môi trường làm việc cá nhân** của từng cán bộ, đồng thời là **trang chủ** của khu vực quản trị:

1. Mở máy là thấy ngay việc của mình, số liệu phòng mình, lời nhắc của cấp trên — không phải đi qua menu.
2. Mỗi người tự sắp đặt mọi thứ: hình nền, bố cục, widget, lối tắt, phím tắt, cách hiện cảnh báo.
3. Nối được ra bên ngoài: lối tắt tới web ngoài, nhúng trang ngoài, đọc và gọi API của hệ thống khác — an toàn.
4. Lãnh đạo nhắc việc nhanh bằng giấy note, biết ai đã xem, ai đã làm.
5. Đẹp và nhanh: mở ra là hiện ngay (bản sao trên máy), hiệu ứng nhẹ, đọc rõ trên mọi hình nền, dùng được trên
   điện thoại.

**Nguyên tắc không thoả hiệp**

- Máy chủ quyết định quyền. Widget chỉ hiện dữ liệu người dùng được phép xem; giao diện chỉ ẩn thao tác.
- Trình duyệt không bao giờ tự gọi ra ngoài và không bao giờ cầm khoá bí mật. Mọi lời gọi ra ngoài đi qua máy chủ.
- Thao tác làm thay đổi dữ liệu luôn hỏi xác nhận và ghi nhật ký.
- Cấu hình người dùng gửi lên luôn được máy chủ kiểm tra theo lược đồ; cấu hình hỏng không vào được CSDL.
- Không có ô nào cho chạy mã tuỳ ý. HTML tuỳ biến chỉ chạy trong iframe sandbox sau khi làm sạch (như Trang công khai).

## 2. Hiện trạng liên quan

| Thành phần sẵn có | Dùng lại thế nào |
|---|---|
| `react-grid-layout` trong Trang công khai (`PublicStudio`), bố cục 3 cỡ màn hình 12/8/4 cột | Lưới kéo thả của bàn làm việc, cùng quy ước cỡ màn hình |
| Khoá lạc quan theo `version` + `expectedVersion` (Trang công khai) | Lưu hồ sơ và từng không gian, chống ghi đè giữa hai tab/hai máy |
| `iocSnapshot` (tổng quan, cảnh báo, việc treo, hoạt động) nhận tham số phòng | Gói dữ liệu phòng cho widget |
| `/my-work`, `/notifications`, `/feedbacks/stats`, `/targets`, `/documents` | Widget Việc của tôi, Thông báo, Phản ánh, chỉ tiêu, văn bản |
| Jarvis (`/copilot/messages`, hàng chờ xác nhận `AgentAction`) | Widget hỏi Jarvis; phân hệ 7 cho Jarvis điều khiển bàn làm việc |
| `Notification` có `dedupeKey` | Báo note mới, note được trả lời |
| `RateLimitService`, `audit()` | Giới hạn tần suất gọi ngoài, gửi note, webhook; ghi nhật ký |
| `@napi-rs/canvas` | Thu nhỏ, nén lại ảnh nền (xoá EXIF/GPS) |
| CSP nginx: `connect-src 'self'`, `frame-src 'self' data: blob:` | Lý do bắt buộc mọi lời gọi ngoài đi qua máy chủ; mở `frame-src` có kiểm soát cho widget nhúng |

## 3. Trải nghiệm tổng thể

```text
┌───────────┬───────────────────────────────────────────────────────────────────────────┐
│ Thanh     │ [☰] [Tìm kiếm Ctrl K]                       [Jarvis][Lỗi][🔔][Lối tắt][👤] │ ← đầu trang dạng kính mờ
│ điều      ├───────────────────────────────────────────────────────────────────────────┤
│ hướng     │  Chào buổi sáng, Phan Trung Kiên            ⏷ Phòng Kinh tế  ✎ Tùy biến  ⋯  │
│ (kính mờ  │  Thứ Ba, 27/10/2026 · 17/9 Bính Ngọ (âm lịch)                              │
│ trên      │  ( Hằng ngày )( Giao ban )( + )                                            │
│ hình nền) │ ┌──────────────┐┌───────────────────────┐┌──────────┐      ┌─────────────┐  │
│           │ │ Việc của tôi │ │ Tình trạng chỉ tiêu   ││ Đồng hồ  │      │ NOTE (giấy) │  │ ← lớp note
│           │ │ 5 cần báo cáo│ │   ◔ 64%               ││  09:41   │      │ Chủ tịch:   │  │   dán đè
│           │ └──────────────┘│                       │└──────────┘      │ Nộp báo cáo │  │
│           │ ┌──────────────┐└───────────────────────┘┌──────────┐      │ trước 17h   │  │
│           │ │ Cảnh báo     │ ┌───────────────────────┐│ Lịch     │      └─────────────┘  │
│           │ │ ● Quá hạn …  │ │ Hạn sắp tới           ││ âm dương │                       │
│           │ └──────────────┘ └───────────────────────┘└──────────┘                       │
│           │            ╭──────────────────────────────────────────────╮                  │
│           │            │ 📥 📊 ✅ 💬 📄 📈 📽 │ 🌐 DVC  🌐 iOffice  ＋  │ ← dock      │
│           │            ╰──────────────────────────────────────────────╯                  │
└───────────┴───────────────────────────────────────────────────────────────────────────┘
```

- Hình nền phủ toàn cửa sổ; thanh điều hướng và đầu trang chuyển sang kính mờ khi đang ở bàn làm việc.
- Widget là thẻ kính mờ (hoặc nền đặc, chỉ viền — tùy chọn), chữ luôn đủ tương phản: màu kính tự theo tông sáng/tối
  của hình nền và chế độ sáng/tối của giao diện.
- Ba lớp chồng nhau: **hình nền** → **lưới widget** → **lớp note** (giấy note kéo thả tự do, đè lên widget). Dock nổi
  ở đáy (hoặc cạnh trái/phải, hoặc ẩn).
- **Chế độ tùy biến** (bấm "Tùy biến"): hiện lưới, tay kéo, tay đổi cỡ; thanh công cụ nổi: Thêm widget · Hình nền ·
  Hoàn tác · Làm lại · Cỡ màn hình (máy tính / máy tính bảng / điện thoại) · Xong. Mọi thay đổi tự lưu.
- Trên điện thoại: một cột, vuốt ngang đổi không gian, note gom thành chồng ở góc, dock thành thanh đáy 5 mục.

### 3.1 Vị trí trong hệ thống

- `/admin` mở bàn làm việc (mã màn hình **DH-00**). Trung tâm điều hành chuyển sang `/admin/dieu-hanh` (giữ **DH-01**).
  Liên kết cũ `/admin?year=…` tự chuyển sang `/admin/dieu-hanh?year=…`.
- **Trang mở đầu** (cài đặt cá nhân): Bàn làm việc (mặc định) · Trung tâm điều hành · Việc của tôi. Áp dụng ngay sau
  đăng nhập; logo và mục "Bàn làm việc" luôn mở bàn làm việc.
- Màn hình quản trị mới: **HT-08 Bàn làm việc mẫu** (`/admin/ban-lam-viec-mau`), **HT-09 Kết nối ngoài**
  (`/admin/ket-noi`).
- Đầu trang mọi màn hình có nút **Lối tắt** (mở bảng lối tắt giống dock) và mọi trang có nút **Ghim trang này** (ghim
  đường dẫn kèm bộ lọc hiện tại vào dock hoặc widget lối tắt).

## 4. Kiến trúc

```text
Trình duyệt                                               Máy chủ NestJS (một tiến trình)
┌───────────────────────────────────────────┐            ┌─────────────────────────────────────────────┐
│ DeskPage                                  │  REST      │ DeskController      hồ sơ, không gian, tài   │
│  ├ Mặt bàn (nền, hiệu ứng)                │──────────▶ │                     sản, trạng thái widget   │
│  ├ Lưới widget (react-grid-layout)        │            │ DeskDataController  gói dữ liệu phòng, chuỗi │
│  │   └ Sổ widget phía trình duyệt: vẽ     │            │                     số liệu chỉ tiêu          │
│  ├ Lớp note                               │            │ DeskNotesController note, bảng tin            │
│  ├ Dock / Lối tắt / Phím tắt              │            │ DeskActionsController thao tác                │
│  └ Bộ chạy thao tác                       │  SSE       │ DeskIntegration     kết nối, tên miền, gọi    │
│ Bộ nhớ đệm: localStorage (cấu hình),      │◀────────── │                     ngoài, webhook, RSS, thời │
│  Cache Storage (ảnh nền)                  │  sự kiện   │                     tiết, favicon             │
└───────────────────────────────────────────┘            │ DeskEventBus (SSE)  DeskRuleWorker            │
                                                          │ DeskTemplates       Sổ widget (lược đồ cài    │
             hệ thống ngoài ◀── chỉ máy chủ gọi ──────────│                     đặt) — nguồn sự thật      │
                                                          └─────────────────────────────────────────────┘
```

### 4.1 Lưu trữ: kết hợp JSON theo đơn vị sửa + bảng cho thứ có vòng đời riêng (D-015)

- **Hồ sơ bàn làm việc** (`DeskProfile`, một dòng mỗi người): giao diện, hình nền, dock, trang mở đầu, phím tắt,
  cài đặt cảnh báo. JSON có `version` riêng.
- **Không gian** (`DeskSpace`, nhiều dòng mỗi người): tên, biểu tượng, thứ tự, JSON gồm widget + bố cục 3 cỡ màn hình
  + hình nền riêng (tuỳ chọn) + phòng đang xem + lịch tự chuyển. Mỗi không gian một `version` → hai tab sửa hai không
  gian không đụng nhau; sửa trùng một không gian thì báo, không ghi đè.
- **Trạng thái widget** (`DeskWidgetState`): dữ liệu thay đổi thường xuyên của widget cá nhân (sổ ghi chú, việc
  riêng, cảnh báo đã thấy) tách khỏi bố cục, để gõ chữ không làm tăng phiên bản bố cục.
- **Bảng riêng** cho thứ có chủ sở hữu, quyền hoặc vòng đời riêng: ảnh nền, note, thao tác, tên miền được phép, kết
  nối, khoá bí mật, webhook, sự kiện vào, quy tắc, mẫu.

### 4.2 Mô hình dữ liệu

Phân hệ 1:

```prisma
model DeskProfile {
  userId          String      @id
  user            User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  config          Json        // DeskProfileConfig (mục 5.2)
  version         Int         @default(1)
  templateId      String?     // mẫu đã dùng (phân hệ 6)
  templateVersion Int?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  spaces          DeskSpace[]
}

model DeskSpace {
  id        String      @id @default(cuid())
  userId    String
  profile   DeskProfile @relation(fields: [userId], references: [userId], onDelete: Cascade)
  name      String      @db.VarChar(40)
  icon      String      @db.VarChar(40)
  position  Int
  config    Json        // DeskSpaceConfig (mục 5.3)
  version   Int         @default(1)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  @@index([userId, position])
}

model DeskWidgetState {
  userId    String
  widgetId  String      @db.VarChar(64)
  state     Json
  version   Int         @default(1)
  updatedAt DateTime    @updatedAt
  @@id([userId, widgetId])
}

model DeskAsset {
  id        String   @id @default(cuid())
  ownerId   String
  isShared  Boolean  @default(false)   // ảnh dùng chung của đơn vị (quản trị đăng)
  name      String   @db.VarChar(120)
  mimeType  String   @db.VarChar(40)
  width     Int
  height    Int
  sizeBytes Int
  sha256    String   @db.VarChar(64)
  bytes     Bytes
  thumb     Bytes
  createdAt DateTime @default(now())
  @@index([ownerId, createdAt])
  @@index([isShared])
}
```

Phân hệ 2–6 (chi tiết trường ở mục của từng phân hệ):

| Bảng | Phân hệ | Nội dung chính |
|---|---|---|
| `DeskNote` | 2 | Người viết, loại `PERSONAL`/`DIRECT`/`BOARD`, phòng (bảng tin), màu, mức độ, nội dung, nét viết tay, liên kết, hạn, yêu cầu xác nhận, ghim, hết hạn, thu hồi, đóng |
| `DeskNoteRecipient` | 2 | Người nhận, trạng thái `NEW`/`SEEN`/`DONE`, thời điểm, vị trí trên bàn, cất đi |
| `DeskNoteMessage` | 2 | Trả lời theo từng người nhận |
| `DeskAction` | 3 | Thao tác: loại, định nghĩa JSON, hỏi xác nhận, dùng chung (quản trị) |
| `DeskAllowedHost` | 4 | Tên miền được phép: mẫu, cho gọi API, cho nhúng, cho địa chỉ nội bộ |
| `DeskConnector` | 4 | Kết nối: chủ sở hữu (rỗng = dùng chung), địa chỉ gốc, kiểu xác thực, khoá bí mật mã hoá, đối tượng được dùng |
| `DeskWebhook`, `DeskInboundEvent` | 4 | Kênh nhận sự kiện từ hệ thống ngoài |
| `DeskRule`, `DeskAlertMute` | 5 | Quy tắc "Nếu… thì…", cảnh báo đã tạm ẩn |
| `DeskTemplate` | 6 | Mẫu bàn làm việc theo vai trò/phòng |

### 4.3 Sổ widget (D-016)

Một nguồn sự thật ở máy chủ (`desk/catalog.ts`): mỗi loại widget khai báo `type`, nhóm, tên, mô tả, biểu tượng,
vai trò được dùng, kích thước mặc định/tối thiểu cho 3 cỡ màn hình, có phải widget dữ liệu không, chu kỳ làm mới mặc
định, và **danh sách trường cài đặt** theo một ngôn ngữ khai báo nhỏ:

`text` · `textarea` · `number` · `boolean` · `select` · `multiselect` · `color` · `department` · `target` · `targets`
· `date` · `datetime` · `url` · `asset` · `links` · `list` · `searchProviders` · `timezones` · `actions` · `connector`
· `request` · `mapping`, kèm `default`, `min`/`max`, `help`, `showIf`.

- `GET /desk/catalog` trả sổ đã lọc theo vai trò. Trình duyệt tự dựng ô cài đặt từ khai báo; trình duyệt chỉ giữ phần
  **vẽ** widget (`type → component`, tải lười theo nhóm).
- Máy chủ dùng chính khai báo đó để kiểm tra `settings` khi lưu không gian: sai kiểu bị loại, trường lạ bị bỏ, chuỗi
  bị cắt theo `max`, URL chỉ nhận `http:`/`https:`, đường dẫn nội bộ chỉ nhận `/admin…`, `/trinh-chieu`, `/phan-anh…`.
- Thêm widget mới = một khai báo + một thành phần vẽ.

### 4.4 Kênh sự kiện (D-017)

- Phân hệ 1: widget dữ liệu tự làm mới theo chu kỳ (mặc định 60 giây, tối thiểu 30 giây, người dùng chỉnh được);
  máy chủ đệm gói dữ liệu phòng 30 giây để nhiều người cùng xem không làm nặng CSDL.
- Từ phân hệ 2: **SSE** `GET /desk/stream?ticket=…`. Vé dùng một lần, sống 60 giây, lấy bằng `POST /desk/stream/ticket`
  (có JWT) — không đưa JWT lên URL. Nhịp giữ kết nối 25 giây. Sự kiện: `note.new`, `note.changed`, `note.message`,
  `board.changed`, `desk.changed` (hồ sơ/không gian vừa sửa ở máy khác), `inbound.event`, `rule.fired`,
  `template.updated`. Mất kết nối thì thử lại có giãn cách; quá 3 lần thì chuyển sang hỏi `GET /desk/pulse` mỗi 30
  giây (đếm note mới, phiên bản hồ sơ/không gian).
- nginx: vị trí `/api/desk/stream` tắt đệm (`proxy_buffering off`), `proxy_read_timeout 1h`.
- Một bản cài một tiến trình API (D-009, D-014) nên bus sự kiện nằm trong bộ nhớ; nếu sau này chạy nhiều tiến trình
  thì thay bằng `LISTEN/NOTIFY` của Postgres mà không đổi giao diện.

### 4.5 Bảo mật

| Rủi ro | Biện pháp |
|---|---|
| Xem trộm bàn làm việc người khác | Mọi API bàn làm việc lấy `userId` từ JWT; không có API đọc bàn làm việc của người khác (quản trị chỉ được **đặt lại**) |
| Widget lộ dữ liệu ngoài phạm vi | Gói dữ liệu phòng qua `resolveDepartmentScope`; chuỗi số liệu kiểm tra quyền từng chỉ tiêu |
| Cấu hình độc (XSS) | Lược đồ kiểm tra phía máy chủ; Markdown tự viết chỉ sinh thẻ an toàn; HTML tuỳ biến làm sạch + iframe sandbox |
| Ảnh tải lên độc | Kiểm tra magic-byte, giải mã rồi mã hoá lại WebP (mất mọi siêu dữ liệu), giới hạn kích thước, hạn mức |
| SSRF qua kết nối ngoài | Chỉ tên miền trong danh sách quản trị duyệt; phân giải DNS rồi chặn địa chỉ nội bộ/loopback/link-local/multicast (trừ mục quản trị đánh dấu "cho địa chỉ nội bộ"); kết nối thẳng tới IP đã kiểm tra (chống đổi DNS); tự đi theo chuyển hướng tối đa 3 lần, kiểm tra lại mỗi lần; chỉ cổng 80/443 hoặc cổng quản trị khai báo |
| Lộ khoá bí mật | AES-256-GCM, khoá `DESK_SECRET_KEY` (thiếu thì dẫn xuất HKDF từ `JWT_SECRET` với nhãn riêng); trường chỉ ghi, chỉ trả về gợi ý 4 ký tự cuối; không ghi vào nhật ký |
| Lạm dụng gọi ngoài | Giới hạn 60 lần/phút/người, 600 lần/phút/kết nối; thời gian chờ ≤ 20 giây; phản hồi ≤ 1 MB; đệm kết quả GET dùng chung |
| Spam note | Chỉ người có quyền chỉ đạo được gửi; ≤ 30 note/10 phút/người gửi; ≤ 200 người nhận/note |
| Webhook giả mạo | Khoá bí mật 32 byte, lưu băm SHA-256, so sánh hằng thời gian; ≤ 60 sự kiện/phút; nội dung ≤ 32 KB |

Nhật ký (`AuditLog`): `DESK_ASSET_SHARED`, `DESK_NOTE_SENT`, `DESK_NOTE_RECALLED`, `DESK_NOTE_CLOSED`,
`DESK_BOARD_POSTED`, `DESK_HOST_ALLOWED`, `DESK_HOST_REMOVED`, `DESK_CONNECTOR_CREATED|UPDATED|DELETED`,
`DESK_HTTP_INVOKED` (chỉ lời gọi làm thay đổi: không phải GET/HEAD), `DESK_WEBHOOK_CREATED|DELETED`,
`DESK_TEMPLATE_PUBLISHED`, `DESK_RESET`.

## 5. Phân hệ 1 — Nền tảng

### 5.1 Phạm vi

Trang chủ mới; hồ sơ và nhiều không gian; chế độ tùy biến (kéo thả, đổi cỡ, phím mũi tên, hoàn tác/làm lại, tự lưu);
kho widget; 28 widget (mục 5.5); hình nền (bộ sưu tập, màu, dải màu, ảnh tải lên, ảnh dùng chung của đơn vị, trình
chiếu nhiều ảnh, theo giờ trong ngày) và hiệu ứng (mờ, tối, độ trong của thẻ, màu nhấn, mật độ, cỡ chữ, bo góc, chuyển
động); dock và bảng lối tắt (chức năng, trang đã lọc, web ngoài, thư mục); nút "Ghim trang này"; lời chào và lịch
âm; trang mở đầu; bản sao trên máy để hiện ngay.

### 5.2 `DeskProfileConfig`

```ts
{
  schemaVersion: 1,
  appearance: {
    background: Background,               // xem dưới
    dim: 0..80,                           // % lớp tối phủ lên nền
    blur: 0..24,                          // px làm mờ nền
    surface: 'glass' | 'solid' | 'outline',
    surfaceOpacity: 40..100,              // % độ đặc của thẻ
    accent: '#rrggbb' | null,             // null: màu thương hiệu địa phương
    density: 'comfortable' | 'compact',
    fontScale: 90..125,                   // %
    radius: 4..20,                        // px
    motion: 'auto' | 'full' | 'reduced',  // auto: theo "giảm chuyển động" của máy
  },
  greeting: { show: boolean, name: string | null /* ≤ 40 ký tự, rỗng: họ tên */, lunar: boolean, holidays: boolean },
  dock: { position: 'bottom' | 'left' | 'right' | 'hidden', autoHide: boolean, magnify: boolean, items: DockItem[] /* ≤ 40 */ },
  startPage: 'desk' | 'ops' | 'work',
  searchProviders: { id, name, url /* có {q} */ }[],      // ≤ 12, dùng chung cho widget tìm kiếm
  shortcuts: Shortcut[],                                  // phân hệ 3
  alerts: AlertPrefs,                                     // phân hệ 5
  noteTemplates: string[],                                // phân hệ 2, ≤ 20 câu soạn sẵn
}

Background =
  | { kind: 'preset', id: PresetId }
  | { kind: 'color', color: '#rrggbb' }
  | { kind: 'gradient', stops: ['#rrggbb', '#rrggbb', '#rrggbb'?], angle: 0..360 }
  | { kind: 'image', assetId: string, fit: 'cover' | 'contain', focus: { x: 0..100, y: 0..100 } }
  | { kind: 'slideshow', items: Background[] /* 2..12, không lồng trình chiếu */, minutes: 1..240, shuffle: boolean }
  | { kind: 'daylight' }                  // tự đổi bình minh → ngày → hoàng hôn → đêm theo giờ máy

DockItem =
  | { id, kind: 'screen', path: '/admin/…', label, icon }     // chức năng hệ thống (lọc theo quyền khi hiện)
  | { id, kind: 'view', path: '/admin/…?…', label, icon, color }  // trang đã lọc
  | { id, kind: 'link', url: 'https://…', label, icon, color }    // web ngoài, mở tab mới, rel="noopener noreferrer"
  | { id, kind: 'folder', label, icon, color, items: DockItem[] /* ≤ 12, không lồng thư mục */ }
  | { id, kind: 'action', actionId, label, icon, color }          // phân hệ 3
```

Giới hạn JSON hồ sơ ≤ 64 KB. Máy chủ bổ sung giá trị mặc định cho trường thiếu (đọc được cấu hình của phiên bản cũ).

### 5.3 `DeskSpaceConfig`

```ts
{
  schemaVersion: 1,
  background: Background | null,           // null: dùng nền của hồ sơ
  focusDepartmentId: string | null,        // phòng đang xem (chỉ vai trò toàn địa phương mới đổi được)
  widgets: WidgetInstance[],               // ≤ 40
  layouts: { desktop: LayoutItem[], tablet: LayoutItem[], mobile: LayoutItem[] },
  schedule: { days: (1..7)[], from: 'HH:mm', to: 'HH:mm' } | null,   // phân hệ 5: tự chuyển
}
WidgetInstance = {
  id: string /* ^w_[A-Za-z0-9]{8,24}$ */, type: string, title: string | null /* ≤ 60 */,
  settings: object /* theo sổ widget */,
  style: { accent: '#rrggbb' | null, appearance: 'inherit' | 'glass' | 'solid' | 'outline' | 'plain', hideHeader: boolean },
  templateKey?: string, locked?: boolean,  // phân hệ 6
}
LayoutItem = { i: widgetId, x, y, w, h }   // trong biên số cột; w/h ≥ tối thiểu của loại widget
```

Lưới: máy tính ≥ 1200 px → 12 cột; máy tính bảng 768–1199 px → 8 cột; điện thoại < 768 px → 4 cột. Hàng cao 36 px,
khoảng cách 14 px. Thêm widget thì máy tính toán vị trí trống cho cả 3 cỡ (xếp gọn theo chiều dọc). Giới hạn JSON
không gian ≤ 256 KB; ≤ 12 không gian mỗi người.

### 5.4 API phân hệ 1

| Phương thức | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/desk` | Hồ sơ + danh sách không gian (kèm cấu hình, phiên bản). Lần đầu tạo bàn làm việc từ mẫu dựng sẵn theo vai trò |
| PUT | `/desk/profile` | `{ config, expectedVersion }` → `{ version }`; 409 nếu lệch phiên bản |
| POST | `/desk/spaces` | `{ name, icon, copyFromId? }` |
| PUT | `/desk/spaces/:id` | `{ name?, icon?, config?, expectedVersion }` |
| DELETE | `/desk/spaces/:id` | Không xoá được không gian cuối cùng |
| POST | `/desk/spaces/order` | `{ ids: string[] }` |
| POST | `/desk/reset` | Về mẫu (giữ ảnh đã tải lên) |
| GET | `/desk/catalog` | Sổ widget theo vai trò |
| GET/PUT | `/desk/widgets/:widgetId/state` | Trạng thái widget cá nhân, có `expectedVersion` |
| GET | `/desk/assets` | Ảnh của tôi + ảnh dùng chung |
| POST | `/desk/assets` | Tải ảnh (multipart `file`) |
| GET | `/desk/assets/:id?size=full\|thumb` | Trả byte, `Cache-Control: private, max-age=31536000, immutable`, ETag = sha256 |
| PATCH | `/desk/assets/:id` | Đổi tên; quản trị đặt `isShared` |
| DELETE | `/desk/assets/:id` | Chủ sở hữu hoặc quản trị (ảnh dùng chung) |
| GET | `/desk/data/department?departmentId&year` | Gói dữ liệu phòng (mục 5.6) |
| GET | `/desk/data/series?ids&year` | Chuỗi số liệu theo kỳ của tối đa 6 chỉ tiêu |
| GET | `/desk/data/targets?departmentId&search` | Chọn chỉ tiêu cho widget (≤ 50 kết quả) |

Ảnh: nhận JPEG/PNG/WebP ≤ 10 MB (kiểm tra magic-byte); thu về cạnh dài ≤ 2560 px, WebP chất lượng 82; ảnh xem trước
480 px; ≤ 20 ảnh và ≤ 40 MB mỗi người; ảnh dùng chung ≤ 60. Trình duyệt tải bằng `fetch` có JWT rồi tạo `blob:` URL
(CSP đã cho `img-src blob:`), lưu vào Cache Storage theo id (ảnh bất biến) để lần sau hiện ngay.

### 5.5 Danh mục widget

Widget dữ liệu lấy **phòng đang xem**: người thuộc phòng → luôn là phòng mình (không có ô chọn); lãnh đạo, văn thư,
quản trị → chọn phòng ở đầu bàn làm việc (lưu theo từng không gian — mỗi không gian có thể là "phòng họp" của một
phòng), mỗi widget được chọn riêng một phòng khác nếu muốn.

| Nhóm | Widget (`type`) | Nội dung |
|---|---|---|
| Tổng quan | Lời chào (`hero`) | Chào theo buổi, ngày dương + âm, ngày lễ, các con số cần chú ý (việc của tôi, cảnh báo, note mới) |
| Dữ liệu phòng | Tình trạng chỉ tiêu (`dept.status`) | Vòng tròn 5 tình trạng + tiến độ chung; bấm mở danh mục đã lọc |
| | Việc cần xử lý (`dept.workload`) | Thiếu báo cáo, chưa giao, chờ duyệt, giải trình, bị treo, phản ánh quá hạn |
| | Cảnh báo (`dept.alerts`) | Danh sách cảnh báo; chọn loại, mức độ tối thiểu, số dòng — "đặt cảnh báo ở đâu tuỳ ý" |
| | Dải cảnh báo (`dept.ticker`) | Chữ chạy cho cảnh báo nghiêm trọng, đặt ở mép bàn |
| | Việc bị treo (`dept.stalled`) | Chỉ tiêu bị treo kèm lý do |
| | Hoạt động gần đây (`dept.recent`) | Ai làm gì, lúc nào |
| | Hạn sắp tới (`dept.deadlines`) | Hạn chỉ tiêu, hạn báo cáo kỳ, hạn giải trình, giờ tự thông qua đề xuất — chia Hôm nay / 7 ngày / Sau đó |
| | Bộ chỉ tiêu (`dept.frameworks`) | Tiến độ từng bộ chỉ tiêu của phòng |
| | Nhân sự trong phòng (`dept.team`) | Ai phụ trách bao nhiêu, thiếu báo cáo, quá hạn, lần đăng nhập gần nhất (trưởng phòng, lãnh đạo) |
| | Phản ánh (`dept.feedback`) | Số theo trạng thái + phản ánh mới nhất của phòng |
| Chỉ tiêu | Thẻ chỉ tiêu (`target.kpi`) | Một chỉ tiêu: số lớn, kế hoạch, vòng tiến độ, tình trạng, đường xu hướng |
| | Chỉ tiêu theo dõi (`target.watchlist`) | Danh sách chọn tay hoặc tự động: của tôi / nguy cơ cao nhất / quá hạn |
| | Biểu đồ chỉ tiêu (`target.chart`) | Đường/cột/vùng theo kỳ cho 1–6 chỉ tiêu, có vạch kế hoạch |
| Việc của tôi | Việc của tôi (`my.work`) | Cần báo cáo, chờ tôi duyệt, giải trình, đề xuất — đếm và danh sách gọn |
| | Thông báo (`my.notifications`) | Thông báo mới, đánh dấu đã đọc |
| | Văn bản mới (`docs.recent`) | Văn bản vừa tải lên/trích xuất trong phạm vi được xem |
| Cá nhân | Đồng hồ (`clock`) | Kim hoặc số, giây, ngày âm, thêm múi giờ |
| | Lịch (`calendar`) | Tháng dương kèm ngày âm, ngày lễ, chấm hạn công việc và việc riêng |
| | Sổ ghi chú (`notepad`) | Markdown gọn, tự lưu |
| | Việc riêng (`todo`) | Danh sách có hạn, nhắc giờ, kéo sắp xếp |
| | Đếm ngược (`countdown`) | Tới một mốc (hạn nộp báo cáo năm, kỳ họp…) |
| | Tập trung (`focus`) | Hẹn giờ làm việc/nghỉ, âm báo |
| Lối tắt & tra cứu | Lối tắt (`launcher`) | Lưới biểu tượng tới chức năng, trang đã lọc, web ngoài, thư mục, thao tác |
| | Tìm kiếm (`search`) | Tìm trong hệ thống và trên các trang tra cứu (thư viện pháp luật, dịch vụ công…) |
| | Hỏi Jarvis (`jarvis`) | Ô hỏi + câu soạn sẵn, trả lời ngay trong widget |
| Nội dung | Khối chữ (`text`) | Markdown: số điện thoại, quy trình, lời nhắn cố định |
| | Ảnh (`image`) | Ảnh đã tải lên (sơ đồ tổ chức, bản đồ…), chú thích, liên kết |

Các phân hệ sau thêm: `board`, `notes` (2) · `actions` (3) · `embed`, `rss`, `weather`, `api`, `inbox` (4).

Khung chung mỗi widget: tiêu đề (đổi được), biểu tượng, nút làm mới, thời điểm số liệu, phóng to toàn bàn, menu ⋯
(Cài đặt · Nhân bản · Chuyển sang không gian… · Xoá); trạng thái đang tải dạng khung xương, trạng thái lỗi có nút thử
lại; widget dữ liệu hết hạn phiên thì không xoá số cũ mà mờ đi và ghi "chưa cập nhật".

### 5.6 Gói dữ liệu phòng

`GET /desk/data/department` gói một lần mọi thứ widget phòng cần (các widget cùng phòng dùng chung một truy vấn):

```ts
{
  department: { id, name, color }, year, generatedAt, dataAsOf,
  totals: { targets, completed, onTrack, atRisk, overdue, notStarted, progress, missingReports, unassigned,
            pendingReports, oldestPendingDays, openExplanations, stalled, statTotal, statReported,
            feedbackOpen, feedbackOverdue },
  frameworks: { id, name, kind, kindLabel, progress, total, counts }[],
  alerts: AlertItem[], stalled: StalledItem[], recent: RecentEvent[],
  deadlines: { kind: 'TARGET_DUE' | 'PERIOD_REPORT' | 'EXPLANATION_DUE' | 'PROPOSAL_AUTO_APPROVE', at, title, detail, link }[],
  team: { userId, fullName, position, role, targets, missingReports, overdue, lastLoginAt }[],
  feedback: { counts: Record<FeedbackStatus, number>, latest: { id, code, title, status, createdAt, dueAt }[] },
}
```

Tính bằng `iocSnapshot` có tham số phòng (dùng lại logic tổng quan, tách khỏi controller thành hàm dùng chung).

### 5.7 Mẫu dựng sẵn theo vai trò

| Vai trò | Không gian "Hằng ngày" | Không gian thứ hai |
|---|---|---|
| Chuyên viên | Lời chào · Việc của tôi · Hạn sắp tới · Chỉ tiêu theo dõi (của tôi) · Cảnh báo · Sổ ghi chú · Việc riêng · Lịch · Lối tắt | — |
| Trưởng phòng | Lời chào · Việc cần xử lý · Tình trạng chỉ tiêu · Nhân sự trong phòng · Cảnh báo · Hạn sắp tới · Việc của tôi · Hoạt động gần đây | "Giao ban": Tình trạng (lớn) · Bộ chỉ tiêu · Dải cảnh báo · Biểu đồ chỉ tiêu |
| Lãnh đạo | Lời chào · Tình trạng chỉ tiêu · Việc cần xử lý · Cảnh báo · Bộ chỉ tiêu · Việc bị treo · Hỏi Jarvis · Lịch | "Giao ban" như trên |
| Văn thư | Lời chào · Việc của tôi · Văn bản mới · Phản ánh · Hạn sắp tới · Lối tắt | — |
| Quản trị | Lời chào · Tình trạng chỉ tiêu · Thông báo · Lối tắt (màn hình hệ thống) · Đồng hồ | — |
| Người xem | Lời chào · Tình trạng chỉ tiêu · Bộ chỉ tiêu · Hoạt động gần đây | — |

Dock mặc định: Việc của tôi · Danh mục chỉ tiêu · Duyệt báo cáo (nếu có quyền) · Phản ánh · Kho văn bản · Báo cáo tổng
hợp · Trình chiếu; ngăn cách; ô "＋" thêm web ngoài.

### 5.8 Hình nền dựng sẵn

Vẽ bằng CSS/SVG (nhẹ, nét ở mọi độ phân giải, không phụ thuộc mạng), mỗi nền khai báo tông sáng/tối để chọn màu kính
và màu chữ lời chào: Bình minh · Trời trưa · Hoàng hôn · Đêm sao · Cực quang (chuyển động nhẹ) · Biển · Rừng tràm ·
Sen · Trống đồng · Địa hình · Kính · Than chì · Giấy · Lưới xanh; cộng **Theo giờ trong ngày**. Chuyển động tắt khi
máy bật "giảm chuyển động" hoặc người dùng chọn "giảm".

### 5.9 Tiện lợi

- **Mở ra là hiện ngay**: cấu hình bàn làm việc và gói dữ liệu phòng gần nhất lưu trong `localStorage` theo tài khoản;
  vẽ ngay từ bản lưu rồi cập nhật ngầm.
- **Tự lưu** sau 0,7 giây ngừng sửa; chỉ báo "Đang lưu… / Đã lưu / Lưu lỗi — thử lại". Hoàn tác/làm lại 50 bước
  (`Ctrl Z`, `Ctrl Y`, `Ctrl Shift Z`).
- **Bàn phím trong chế độ tùy biến**: chọn widget bằng `Tab`, mũi tên để dời, `Shift` + mũi tên để đổi cỡ,
  `Delete` để xoá, `Esc` thoát. Ngoài chế độ tùy biến: `Alt 1…9` đổi không gian.
- **Kéo từ kho widget thả thẳng vào lưới**; widget mới hiện hiệu ứng "đặt xuống".
- **Ghim trang này**: ở mọi màn hình, ghim đường dẫn kèm bộ lọc vào dock hoặc vào widget lối tắt.
- Đổi màn hình ngoài bàn làm việc vẫn có **Lối tắt** trên đầu trang.

## 6. Phân hệ 2 — Giấy note và bảng tin phòng

### 6.1 Ai gửi cho ai

| Người gửi | Gửi được cho |
|---|---|
| Quản trị, Lãnh đạo UBND | Mọi người đang hoạt động; cả một phòng; nhiều phòng |
| Trưởng phòng | Người trong phòng mình; cả phòng mình |
| Mọi người | Note cá nhân cho chính mình |

Bảng tin phòng: trưởng phòng đăng cho phòng mình; lãnh đạo, quản trị đăng cho phòng bất kỳ. Thành viên phòng (và vai
trò toàn địa phương) đọc được.

### 6.2 Dữ liệu

```prisma
enum DeskNoteKind { PERSONAL DIRECT BOARD }
enum DeskNotePriority { NORMAL IMPORTANT URGENT }
enum DeskNoteStatus { NEW SEEN DONE }

model DeskNote {
  id           String           @id @default(cuid())
  authorId     String
  kind         DeskNoteKind
  departmentId String?          // BOARD: phòng của bảng tin
  color        String           @db.VarChar(16)   // yellow pink green blue purple orange
  priority     DeskNotePriority @default(NORMAL)
  title        String?          @db.VarChar(120)  // bảng tin
  body         String           @db.VarChar(2000)
  ink          Json?            // nét viết tay chuẩn hoá 0..1, ≤ 60 KB
  links        Json             // ≤ 5: { type: 'target'|'document'|'feedback'|'url', id?, url?, label }
  dueAt        DateTime?
  requireAck   Boolean          @default(false)
  pinned       Boolean          @default(false)
  expiresAt    DateTime?
  recalledAt   DateTime?
  closedAt     DateTime?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt
  recipients   DeskNoteRecipient[]
  messages     DeskNoteMessage[]
  @@index([authorId, createdAt])
  @@index([kind, departmentId, createdAt])
}

model DeskNoteRecipient {
  noteId     String
  note       DeskNote       @relation(fields: [noteId], references: [id], onDelete: Cascade)
  userId     String
  status     DeskNoteStatus @default(NEW)
  seenAt     DateTime?
  doneAt     DateTime?
  placement  Json?          // { spaceId|null, x: 0..100, y: 0..100, z, collapsed }
  archivedAt DateTime?
  createdAt  DateTime       @default(now())
  @@id([noteId, userId])
  @@index([userId, archivedAt, createdAt])
}

model DeskNoteMessage {
  id           String   @id @default(cuid())
  noteId       String
  note         DeskNote @relation(fields: [noteId], references: [id], onDelete: Cascade)
  threadUserId String   // người nhận của luồng trả lời
  authorId     String
  body         String   @db.VarChar(500)
  createdAt    DateTime @default(now())
  @@index([noteId, threadUserId, createdAt])
}
```

Note cá nhân là `PERSONAL` với chính mình là người nhận. Bảng tin tạo dòng người nhận khi thành viên mở xem lần đầu.

### 6.3 Hành vi

- **Gửi**: hộp soạn — người nhận (tìm theo tên, nhóm theo phòng, "cả phòng…"), nội dung hoặc **viết tay** (bút cảm
  ứng/chuột, màu bút, tẩy, hoàn tác), màu giấy, mức độ (Thường · Quan trọng · Khẩn), hạn, "yêu cầu xác nhận đã xong",
  gắn chỉ tiêu/văn bản/phản ánh/đường dẫn, câu soạn sẵn. Mở được từ: đầu bàn làm việc, widget Nhân sự trong phòng, hồ
  sơ chỉ tiêu ("Dán note cho người phụ trách"), danh sách tài khoản.
- **Giao**: thông báo trong ứng dụng (`DESK_NOTE`), sự kiện SSE → note "bay" vào bàn làm việc kèm âm báo nhẹ; note
  **Khẩn** gửi thêm thư điện tử nếu người nhận có email và máy chủ có SMTP (gửi một lần, lỗi thì bỏ qua — note trong
  ứng dụng vẫn đến).
- **Người nhận**: note nằm trên lớp note, kéo đi đâu cũng được (vị trí lưu theo người nhận, theo %), thu nhỏ thành
  chồng ở góc. Note tự chuyển **Đã xem** khi hiện trên màn hình ≥ 1,5 giây lúc cửa sổ đang mở. Bấm **Đã xong**, **Trả
  lời**. Note có yêu cầu xác nhận thì chỉ cất đi được sau khi bấm Đã xong. Note hết hạn đổi viền đỏ.
- **Người gửi**: ngăn "Note đã gửi" — trạng thái từng người (vòng xám chưa xem · xanh dương đã xem · xanh lá đã xong),
  luồng trả lời, **Nhắc lại** (gửi lại thông báo cho người chưa xong), **Thu hồi** (khi chưa ai xem), **Đóng note**.
- **Bảng tin phòng** (`board`): bài ghim lên đầu, hết hạn tự ẩn, đánh dấu đã đọc.
- **Widget `notes`**: danh sách note dành cho ai thích xem dạng danh sách thay vì giấy dán.

API: `GET /desk/notes` (của tôi: nhận + cá nhân) · `POST /desk/notes` · `PATCH /desk/notes/:id` (sửa note cá nhân;
người gửi sửa khi chưa ai xem) · `POST /desk/notes/:id/seen|done|archive|placement` · `POST /desk/notes/:id/messages` ·
`GET /desk/notes/sent` · `POST /desk/notes/:id/remind|recall|close` · `GET /desk/notes/recipients` (danh sách người
gửi được) · `GET/POST /desk/board` · `POST /desk/board/:id/read` · `POST /desk/stream/ticket` · `GET /desk/stream` ·
`GET /desk/pulse`.

## 7. Phân hệ 3 — Thao tác và phím tắt

### 7.1 Thao tác

```prisma
enum DeskActionKind { NAVIGATE OPEN_URL INTERNAL HTTP JARVIS MACRO COPY }
model DeskAction {
  id           String         @id @default(cuid())
  ownerId      String?        // null: thao tác dùng chung do quản trị tạo
  name         String         @db.VarChar(60)
  icon         String         @db.VarChar(40)
  color        String?        @db.VarChar(7)
  kind         DeskActionKind
  definition   Json
  confirm      Boolean        @default(false)
  audienceRoles Role[]        // dùng chung: vai trò được dùng
  version      Int            @default(1)
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  @@index([ownerId])
}
```

| Loại | Định nghĩa | Ví dụ |
|---|---|---|
| `NAVIGATE` | `{ path }` (nội bộ) | Mở "Chỉ tiêu quá hạn của phòng" |
| `OPEN_URL` | `{ url }` có biến | Mở cổng dịch vụ công tra mã hồ sơ `{{input.ma}}` |
| `INTERNAL` | `{ operation, params }` | `remindTarget`, `requestExplanation`, `exportReport`, `composeNote`, `sendNote`, `switchSpace`, `toggleFocus`, `refreshDesk`, `toggleTheme`, `openJarvis`, `openWallboard`, `newPersonalNote` |
| `HTTP` | `{ connectorId, method, path, query, headers, body, output }` | Gọi API hệ thống ngoài (phân hệ 4 cung cấp kết nối) |
| `JARVIS` | `{ prompt }` | "Tóm tắt tình hình phòng hôm nay" |
| `MACRO` | `{ steps: { actionId, delayMs }[] }` ≤ 10 bước, không lồng macro | "Giao ban sáng" |
| `COPY` | `{ text }` có biến | Chép câu trả lời mẫu |

- **Biến**: `{{user.name}}`, `{{user.username}}`, `{{department.name}}`, `{{department.code}}`, `{{date}}` (dd/mm/yyyy),
  `{{isoDate}}`, `{{year}}`, `{{month}}`, `{{quarter}}`, `{{input.<khoá>}}`. Tự mã hoá theo ngữ cảnh: trong URL dùng
  `encodeURIComponent`, trong thân JSON dùng thoát chuỗi JSON.
- **Tham số nhập** (`inputs`): văn bản, số, ngày, chọn, chỉ tiêu, phòng, người — hiện hộp nhập trước khi chạy.
- **Xác nhận**: bắt buộc với thao tác nghiệp vụ làm thay đổi dữ liệu và `HTTP` khác GET (mặc định bật, người dùng tắt
  được với kết nối của riêng mình); nhật ký ghi ở máy chủ.
- **Kết quả**: thông báo nhỏ, hộp chi tiết (bảng/JSON có cây), hoặc đổ vào widget.

### 7.2 Gắn thao tác

Nút trong widget **Nút thao tác** (`actions`: lưới, viên thuốc hoặc danh sách) · mục dock/lối tắt · hộp tìm kiếm
`Ctrl K` (nhóm "Thao tác của tôi") · phím tắt · Jarvis (phân hệ 7) · lịch và quy tắc (phân hệ 5).

### 7.3 Phím tắt

`Shortcut = { id, combo: 'Ctrl+Shift+1', target: { kind: 'action', actionId } | { kind: 'command', command }, whileTyping: boolean }`
(≤ 60). Lệnh có sẵn: đổi không gian 1–9, bật/tắt tùy biến, dán note, note cá nhân mới, chế độ tập trung, làm mới
bàn làm việc, mở trình chiếu. Hoạt động trên mọi màn hình quản trị. Ô **ghi phím** bắt tổ hợp; báo trùng với phím của
hệ thống (`Ctrl K`, `Ctrl J`), của trình duyệt (`Ctrl C/V/X/Z/Y/A/S/P/F/R/T/W/N/L/D/H/O/U`, `Ctrl Tab`, `F5`, `F11`,
`F12`, `Alt F4`) và phím đã gán. Gợi ý dùng `Alt` + chữ/số, `Ctrl Shift` + chữ/số, hoặc chuỗi hai phím (`G` rồi `D`).
`?` mở bảng tra phím tắt.

API: `GET/POST /desk/actions`, `PUT/DELETE /desk/actions/:id`, `POST /desk/actions/:id/run` (chỉ cho `INTERNAL` phía
máy chủ và `HTTP`; các loại còn lại chạy trong trình duyệt).

## 8. Phân hệ 4 — Kết nối bên ngoài

### 8.1 Chính sách (đã chốt)

Quản trị lập **danh sách tên miền được phép** (`example.gov.vn`, `*.example.vn`; cờ cho gọi API, cho nhúng, cho địa
chỉ nội bộ) và tạo **kết nối dùng chung** (giao cho vai trò/phòng). Mỗi người tự tạo **kết nối riêng** nhưng chỉ tới
tên miền trong danh sách. Khoá bí mật của kết nối dùng chung không ai xem được, kể cả người dùng kết nối đó.

### 8.2 Dữ liệu

```prisma
enum DeskAuthType { NONE HEADER QUERY BEARER BASIC }

model DeskAllowedHost {
  id           String   @id @default(cuid())
  pattern      String   @unique   // "example.gov.vn", "*.example.vn", "10.0.0.5:8080"
  allowApi     Boolean  @default(true)
  allowEmbed   Boolean  @default(false)
  allowPrivate Boolean  @default(false)   // cho địa chỉ nội bộ/LAN và http:
  note         String?
  createdById  String
  createdAt    DateTime @default(now())
}

model DeskConnector {
  id                    String       @id @default(cuid())
  ownerId               String?      // null: dùng chung
  name                  String
  description           String?
  baseUrl               String
  authType              DeskAuthType @default(NONE)
  authName              String?      // tên header/tham số, hoặc tên đăng nhập BASIC
  secretCipher          String?      // base64(iv | tag | bản mã)
  secretHint            String?      // 4 ký tự cuối
  headers               Json         // header không bí mật
  timeoutMs             Int          @default(8000)
  cacheSeconds          Int          @default(0)
  audienceRoles         Role[]
  audienceDepartmentIds String[]
  isActive              Boolean      @default(true)
  lastStatus            Int?
  lastError             String?
  lastUsedAt            DateTime?
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt
  @@index([ownerId])
}

model DeskWebhook {
  id          String    @id @default(cuid())
  ownerId     String
  name        String
  tokenHash   String
  tokenHint   String
  deliver     String    @default("ALERT")   // ALERT | NOTE
  isActive    Boolean   @default(true)
  lastEventAt DateTime?
  eventCount  Int       @default(0)
  createdAt   DateTime  @default(now())
  @@index([ownerId])
}

model DeskInboundEvent {
  id        String    @id @default(cuid())
  webhookId String
  ownerId   String
  title     String
  body      String?
  severity  String    // info | warning | critical
  link      String?
  payload   Json
  readAt    DateTime?
  createdAt DateTime  @default(now())
  @@index([ownerId, createdAt])
}
```

### 8.3 Bộ gọi an toàn (`SafeFetcher`)

Kiểm tra theo thứ tự: giao thức `https:` (hoặc `http:` khi mục danh sách cho phép địa chỉ nội bộ) → tên máy khớp danh
sách và cờ phù hợp (API/nhúng) → phân giải DNS, mọi địa chỉ phải công khai (trừ cờ nội bộ) → kết nối thẳng tới IP đã
kiểm tra, gửi `Host` gốc → chỉ cổng 80/443, hoặc đúng cổng ghi trong mục danh sách → chuyển hướng tự xử lý ≤ 3 lần,
kiểm tra lại từ đầu → đọc tối đa 1 MB → hết giờ thì huỷ.
Không chuyển tiếp cookie, không gửi header của người dùng; thêm `User-Agent: IOC-Desk/1.0`.

### 8.4 Khả năng

- **Gọi API**: `POST /desk/connectors/:id/invoke { method, path, query, headers, body }` → `{ status, ms, contentType,
  data | text, truncated }`. Đường dẫn ghép sau địa chỉ gốc, không được đổi máy chủ. Kết quả GET được đệm dùng chung
  theo `cacheSeconds`.
- **Widget Dữ liệu API** (`api`): chọn kết nối + yêu cầu → **chọn dữ liệu** bằng cây JSON mẫu (bấm vào nút để lấy
  đường dẫn kiểu `data.items[*].name`) → hiện thành: con số (định dạng, đơn vị, ngưỡng màu), danh sách, bảng, biểu đồ
  (đường/cột/tròn), hoặc khối HTML có gắn dữ liệu (làm sạch + iframe sandbox như Trang công khai).
- **Widget Nhúng trang** (`embed`): URL phải thuộc tên miền có cờ nhúng; máy chủ kiểm tra trước `X-Frame-Options` /
  `frame-ancestors` — trang không cho nhúng thì widget hiện thẻ xem trước + "Mở trong tab mới". iframe có `sandbox`
  (`allow-scripts allow-same-origin allow-forms allow-popups`), `referrerpolicy="no-referrer"`. CSP nginx đổi
  `frame-src` thành `'self' https:` cộng biến `DESK_FRAME_SRC_EXTRA` (cho máy nội bộ `http:` mà quản trị duyệt) qua
  mẫu cấu hình nginx; danh sách tên miền mới là lớp kiểm soát chính.
- **Widget RSS** (`rss`): đọc RSS/Atom từ tên miền được phép, làm sạch tiêu đề/tóm tắt, liên kết chỉ `http(s)`.
- **Widget Thời tiết** (`weather`): Open-Meteo (không cần khoá) qua máy chủ, đệm 10 phút; chọn địa điểm bằng tìm kiếm
  địa danh. Hai tên miền Open-Meteo được thêm sẵn vào danh sách (quản trị gỡ được).
- **Widget Sự kiện ngoài** (`inbox`) và **webhook**: `POST /api/desk/hooks/:id` kèm header `X-IOC-Token` →
  `{ title, body?, severity?: info|warning|critical, link? }` → hiện thành cảnh báo hoặc note trên bàn của chủ webhook.
- **Biểu tượng web ngoài**: `GET /desk/favicon?url=` qua bộ gọi an toàn (chỉ tên miền được phép), đệm 1 ngày; còn lại
  dùng chữ cái đầu trên nền màu sinh từ tên miền.

Màn hình **HT-09 Kết nối ngoài** (quản trị): tên miền được phép · kết nối dùng chung · webhook toàn hệ thống · lời gọi
gần đây. Người dùng: ngăn **Kết nối của tôi** trong cài đặt bàn làm việc (tạo, thử, xem cây JSON mẫu, webhook).

## 9. Phân hệ 5 — Cảnh báo và tự động hoá

### 9.1 Cảnh báo (`AlertPrefs` trong hồ sơ)

```ts
{
  toast: { position: 'topRight' | 'topLeft' | 'bottomRight' | 'bottomLeft' | 'top' | 'bottom', durationSec: 3..30 },
  sound: { enabled: boolean, tone: 'soft' | 'chime' | 'bell' | 'urgent', volume: 0..100 },
  system: boolean,                 // thông báo của hệ điều hành khi đang ở tab khác (cần HTTPS hoặc localhost)
  kinds: AlertKind[],              // loại cảnh báo muốn nhận
  minSeverity: 'info' | 'warning' | 'critical',
  quietHours: { enabled: boolean, from: 'HH:mm', to: 'HH:mm', days: (1..7)[] },
  focus: { enabled: boolean, allowUrgent: boolean },
}
```

- Cảnh báo mới = cảnh báo trong gói dữ liệu phòng chưa có trong tập "đã thấy" (lưu ở `DeskWidgetState` khoá
  `alerts.seen`), cộng sự kiện SSE (note, webhook, quy tắc). Âm báo tổng hợp bằng Web Audio (không cần tệp âm thanh).
- **Tạm ẩn** một cảnh báo 1 giờ / 1 ngày / 1 tuần (`DeskAlertMute`). **Chế độ tập trung**: chỉ còn note khẩn và cảnh
  báo nghiêm trọng, widget không thuộc "tập trung" mờ đi.

### 9.2 Quy tắc "Nếu… thì…"

```prisma
model DeskRule {
  id          String    @id @default(cuid())
  ownerId     String
  name        String
  isActive    Boolean   @default(true)
  trigger     Json
  actions     Json
  lastFiredAt DateTime?
  lastResult  String?
  fireCount   Int       @default(0)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@index([ownerId])
}

model DeskAlertMute {
  userId   String
  alertKey String
  until    DateTime
  @@id([userId, alertKey])
}
```

| Khi (trigger) | Chạy ở | Ví dụ |
|---|---|---|
| Có cảnh báo mới (loại, mức độ) | Trình duyệt | Bật note đỏ + âm báo khẩn |
| Có note mới (từ ai, mức độ) | Trình duyệt | Đọc to nội dung note bằng giọng Jarvis |
| Sự kiện webhook | Máy chủ + trình duyệt | Sự kiện "Ngập úng" → cảnh báo nghiêm trọng + chuyển không gian "Ứng phó" |
| Theo lịch (thứ, giờ — giờ Việt Nam) | Máy chủ | 7:30 thứ Hai chạy thao tác "Giao ban" |
| Giá trị API vượt ngưỡng (kết nối, đường dẫn, phép so sánh, chu kỳ ≥ 5 phút) | Máy chủ | AQI > 150 → cảnh báo |

Hiệu ứng: thông báo, âm báo, thông báo hệ điều hành, note cho chính mình, chuyển không gian, bật tập trung, chạy thao
tác. Hiệu ứng giao diện được gửi qua SSE khi người dùng đang mở; hiệu ứng máy chủ (gọi HTTP qua kết nối, tạo note,
thông báo) chạy kể cả khi không ai mở trình duyệt. Bộ chạy quy tắc nằm trong tiến trình API như bộ giám sát thời hạn
(D-014), mỗi phút một lượt, chống chạy trùng bằng `lastFiredAt`.

**Không gian theo lịch**: không gian có `schedule` được tự chuyển tới khi vào khung giờ (không chuyển khi đang tùy
biến hoặc vừa thao tác trong 60 giây), kèm thông báo "Đã chuyển sang … theo lịch".

## 10. Phân hệ 6 — Mẫu và quản trị

```prisma
model DeskTemplate {
  id                    String    @id @default(cuid())
  name                  String
  description           String?
  audienceRoles         Role[]
  audienceDepartmentIds String[]
  priority              Int       @default(0)
  isActive              Boolean   @default(true)
  profileConfig         Json
  spaces                Json
  lockedKeys            String[]
  version               Int       @default(1)
  publishedAt           DateTime?
  createdById           String
  updatedAt             DateTime  @updatedAt
}
```

- **HT-08 Bàn làm việc mẫu**: tạo/sửa mẫu bằng chính trình tùy biến (xem trước theo vai trò), đối tượng áp dụng (vai
  trò, phòng), độ ưu tiên, widget **bắt buộc** (khoá).
- Người mới nhận mẫu khớp nhất (phòng > vai trò > mặc định dựng sẵn). **Khôi phục mẫu** trong menu bàn làm việc.
- **Cập nhật mẫu**: khi tăng phiên bản, widget bắt buộc được thay/bổ sung ngay; phần còn lại hiện lời mời "Mẫu vừa cập
  nhật — Áp dụng thay đổi" và chỉ thêm widget mới, không xoá widget người dùng đã tự thêm hay đã tự gỡ (khớp theo
  `templateKey`).
- **Chính sách** (Cấu hình HT-04, nhóm "Bàn làm việc"): cho tải ảnh nền; số ảnh tối đa; cho kết nối riêng; cho nhân viên
  gửi note cho đồng nghiệp cùng phòng; gửi thư cho note khẩn.
- **Chia sẻ**: xuất/nhập không gian thành tệp `.ioc-desk.json`; "Gửi cho đồng nghiệp" (đính không gian vào note, người
  nhận bấm "Thêm không gian này"). Widget dùng kết nối riêng hay ảnh riêng của người gửi được đánh dấu cần chọn lại.
- Tài khoản (HT-03): **Đặt lại bàn làm việc** của một người (ghi nhật ký `DESK_RESET`).

## 11. Phân hệ 7 — Jarvis điều khiển bàn làm việc

Ý định mới (luật trước, Qwen3 dự phòng như hiện nay):

| Câu nói | Ý định | Thực hiện |
|---|---|---|
| "Hôm nay tôi có gì?" | `DESK_BRIEFING` | Tổng hợp note chưa xong, hạn hôm nay, cảnh báo phòng, việc của tôi; đọc to được |
| "Thêm widget thời tiết" | `DESK_ADD_WIDGET` | Thêm ngay (không đổi dữ liệu nghiệp vụ) |
| "Đổi sang nền tối / nền biển" | `DESK_BACKGROUND` | Đổi ngay, hoàn tác được |
| "Mở không gian giao ban" | `DESK_SWITCH_SPACE` | Chuyển ngay |
| "Chạy giao ban sáng" | `DESK_RUN_ACTION` | Chạy thao tác theo tên (thao tác ghi vẫn hỏi xác nhận) |
| "Dán note cho chị Lan Anh: nộp báo cáo trước 5 giờ" | `DESK_SEND_NOTE` | Soạn sẵn, chờ bấm xác nhận (hàng chờ `AgentAction`) |
| "Bật chế độ tập trung" | `DESK_FOCUS` | Bật/tắt |

Máy chủ trả `clientAction` cho các ý định giao diện; trình duyệt thực hiện và báo lại. Bàn làm việc đăng ký ngữ cảnh
màn hình (không gian, widget đang có, các con số) để Jarvis hiểu "widget này", "số đó".

## 12. Lỗi, hiệu năng, khả năng truy cập

- **Xung đột phiên bản (409)**: tải bản mới nhất; nếu đang có thay đổi chưa lưu thì hỏi "Dùng bản mới nhất" hay "Giữ
  bản của tôi" (ghi đè bằng phiên bản mới).
- **Widget lỗi** không làm sập bàn làm việc (ranh giới lỗi riêng từng widget). Loại widget không còn trong sổ (bị gỡ
  hoặc mất quyền) hiện thẻ "Widget không còn dùng được" kèm nút gỡ.
- **Mất mạng**: vẽ từ bản lưu, ghi "Ngoại tuyến"; thay đổi bố cục chờ có mạng rồi lưu.
- **Hiệu năng**: tải lười từng nhóm widget; biểu đồ SVG; đệm gói dữ liệu phòng 30 giây phía máy chủ; ảnh nền từ Cache
  Storage; tắt kính mờ (`backdrop-filter`) khi người dùng chọn "giảm hiệu ứng" hoặc máy bật giảm trong suốt.
- **Khả năng truy cập**: thao tác được hoàn toàn bằng bàn phím; nhãn `aria` cho widget và note; tương phản chữ ≥ 4,5:1
  trên mọi hình nền nhờ lớp kính và lớp tối.

## 13. Kiểm thử

| Mức | Nội dung |
|---|---|
| Đơn vị (API, `node --test`) | Kiểm tra cấu hình hồ sơ/không gian/cài đặt widget (đúng, sai, thừa trường, quá cỡ); xếp chỗ widget; quyền gửi note; trạng thái note; bộ gọi an toàn (dải IP, chuyển hướng, đổi DNS, cổng, quá cỡ, hết giờ); mã hoá khoá bí mật; chèn biến; trích dữ liệu theo đường dẫn JSON; lịch quy tắc; gộp mẫu |
| Đơn vị (web, `tsx --test`) | Lịch âm (đối chiếu ngày đã biết), ngày lễ, phân tích tổ hợp phím, hàm bố cục, nội suy biến |
| Đầu-cuối (`scripts/qa-desk.mjs`, Playwright) | Chuyên viên đăng nhập → bàn làm việc theo mẫu; thêm widget, đổi nền, tải lại vẫn giữ; lãnh đạo dán note → chuyên viên thấy ngay, bấm Đã xong → lãnh đạo thấy trạng thái; phím tắt chạy thao tác; widget API qua kết nối thử |
| Hồi quy | Toàn bộ kiểm thử hiện có; `npm run build` cả API và web |

## 14. Triển khai và tài liệu

- Mỗi phân hệ một migration Prisma, chạy được trên dữ liệu đang có (chỉ thêm bảng/cột).
- Biến môi trường mới: `DESK_SECRET_KEY` (khuyến nghị đặt), `DESK_FRAME_SRC_EXTRA` (tuỳ chọn).
- nginx: tắt đệm cho SSE; `frame-src` theo mục 8.4; giới hạn tải ảnh 10 MB.
- Hướng dẫn sử dụng: thêm mục DH-00 Bàn làm việc, HT-08, HT-09; cập nhật đường dẫn DH-01; xuất lại DOCX/PDF bằng công
  cụ sẵn có trên máy Windows.

## 15. Lộ trình

| Phân hệ | Nội dung | Điều kiện xong |
|---|---|---|
| 1. Nền tảng | Mục 5 | Kiểm thử đơn vị + kịch bản đầu-cuối phần bàn làm việc; trang chủ mới |
| 2. Note và bảng tin | Mục 6 + kênh SSE | Kịch bản lãnh đạo ↔ chuyên viên |
| 3. Thao tác và phím tắt | Mục 7 | Phím tắt chạy macro có xác nhận |
| 4. Kết nối ngoài | Mục 8 | Bộ kiểm thử SSRF; widget API, nhúng, RSS, thời tiết, webhook |
| 5. Cảnh báo và tự động hoá | Mục 9 | Quy tắc lịch chạy ở máy chủ; thông báo theo vị trí đã chọn |
| 6. Mẫu và quản trị | Mục 10 | Cập nhật mẫu không mất phần cá nhân |
| 7. Jarvis | Mục 11 | Bộ câu lệnh bàn làm việc trong bộ đánh giá Jarvis |
