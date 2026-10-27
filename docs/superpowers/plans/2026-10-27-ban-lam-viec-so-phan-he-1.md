# Bàn làm việc số — Phân hệ 1 (Nền tảng) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang chủ `/admin` trở thành bàn làm việc số cá nhân: nhiều không gian, kéo thả 28 widget, hình nền và hiệu ứng, dock lối tắt (kể cả web ngoài), ghim trang, lưu trên máy chủ có phiên bản.

**Architecture:** API NestJS thêm thư mục `apps/api/src/desk/` (sổ widget, kiểm tra cấu hình, bố cục, mẫu dựng sẵn, controller hồ sơ/không gian/ảnh/dữ liệu phòng). Web thêm `apps/web/src/pages/desk/` (kho trạng thái tự lưu + hoàn tác, mặt bàn, lưới `react-grid-layout`, widget tải lười, dock). Cấu hình là JSON chia theo hồ sơ và từng không gian, khoá lạc quan bằng `version`.

**Tech Stack:** NestJS 11, Prisma 6 (Postgres 16), `@napi-rs/canvas`; React 19, antd 6, TanStack Query 5, `react-grid-layout` 2.3, ECharts 6; kiểm thử `node:test` qua `tsx`.

**Spec:** `docs/requirements/04-thiet-ke-ban-lam-viec-so.md` (mục 3, 4, 5, 12, 13). Quyết định D-015…D-019.

## Global Constraints

- Lưới: máy tính ≥ 1200 px → 12 cột; máy tính bảng 768–1199 px → 8 cột; điện thoại < 768 px → 4 cột; hàng cao 36 px; khoảng cách 14 px.
- ≤ 12 không gian/người; ≤ 40 widget/không gian; ≤ 40 mục dock; thư mục ≤ 12 mục, không lồng thư mục.
- JSON hồ sơ ≤ 64 KB; JSON không gian ≤ 256 KB; trạng thái widget ≤ 64 KB.
- Widget dữ liệu: làm mới mặc định 60 giây, tối thiểu 30 giây, tối đa 3600 giây; máy chủ đệm gói dữ liệu phòng 30 giây.
- Ảnh: nhận JPEG/PNG/WebP ≤ 10 MB; ra WebP chất lượng 82, cạnh dài ≤ 2560 px; ảnh xem trước cạnh dài 480 px; ≤ 20 ảnh và ≤ 40 MB mỗi người; ảnh dùng chung ≤ 60.
- URL ngoài chỉ `http:`/`https:`, ≤ 2000 ký tự, không chứa thông tin đăng nhập. Đường dẫn nội bộ chỉ bắt đầu bằng `/admin`, `/trinh-chieu`, `/phan-anh`.
- Mã màn hình: DH-00 Bàn làm việc (`/admin`); DH-01 Trung tâm điều hành chuyển sang `/admin/dieu-hanh`.
- Chữ trên giao diện, thông báo lỗi và chú thích mã nguồn bằng tiếng Việt, theo giọng văn hiện có của dự án.
- Không thêm thư viện mới cho phân hệ 1.

## Review Focus

1. Lãnh đạo/quản trị không thuộc phòng nào mở bàn làm việc lần đầu: phòng đang xem mặc định là phòng hoạt động đầu tiên theo `sortOrder`; không có phòng nào thì widget dữ liệu hiện "Chưa có phòng ban", không lỗi. (Task 5, Task 16)
2. Vai trò đổi sau khi đã có bàn làm việc (chuyên viên lên trưởng phòng, hoặc ngược lại): widget không còn được phép bị loại khi trả về/lưu, không làm hỏng không gian; người thuộc phòng luôn xem phòng mình dù JSON ghi phòng khác. (Task 4, Task 6)
3. Hai tab cùng sửa một không gian: bản cũ gửi lên nhận 409, giao diện hỏi "Dùng bản mới nhất / Giữ bản của tôi", không mất dữ liệu âm thầm. (Task 6, Task 11)
4. Ảnh nền đã bị xoá nhưng hồ sơ vẫn trỏ tới: mặt bàn tự rơi về nền mặc định, không hiện ảnh vỡ. (Task 7, Task 13)
5. Bố cục chỉ có cỡ máy tính (hoặc thiếu mục của một widget) mở trên điện thoại: bố cục thiếu được tự sinh trong biên số cột. (Task 3)

---

### Task 1: Mô hình dữ liệu và migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (thêm 4 model, quan hệ `User.deskProfile DeskProfile?`)
- Create: `apps/api/prisma/migrations/20261027090000_desk_foundation/migration.sql`

**Interfaces:**
- Produces: các model `DeskProfile`, `DeskSpace`, `DeskWidgetState`, `DeskAsset` đúng như mục 4.2 của đặc tả (khoá ngoại `DeskProfile.userId → User.id` xoá dây chuyền; `DeskSpace.userId → DeskProfile.userId` xoá dây chuyền; `DeskAsset.ownerId → User.id` xoá dây chuyền; `DeskWidgetState.userId → User.id` xoá dây chuyền).

- [ ] **Step 1:** Thêm model vào `schema.prisma`, sinh SQL bằng `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` (cần `--shadow-database-url` trỏ CSDL tạm) và lưu thành `migration.sql`.
- [ ] **Step 2:** Run: `cd apps/api && npx prisma migrate deploy && npx prisma generate` trên CSDL cục bộ. Expected: "All migrations have been successfully applied".
- [ ] **Step 3:** Run: `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code`. Expected: exit 0 (không lệch).
- [ ] **Step 4:** Commit `feat(desk): mô hình dữ liệu bàn làm việc số`.

### Task 2: Sổ widget

**Files:**
- Create: `apps/api/src/desk/catalog.ts`
- Test: `apps/api/test/desk-catalog.test.ts`

**Interfaces:**
- Produces:
  - `type DeskBreakpoint = 'desktop' | 'tablet' | 'mobile'`; `const DESK_COLUMNS: Record<DeskBreakpoint, number> = { desktop: 12, tablet: 8, mobile: 4 }`.
  - `type SettingField` (union theo `type`): `text {max, placeholder?}` · `textarea {max}` · `number {min, max, step?, unit?}` · `boolean` · `select {options}` · `multiselect {options, max?}` · `color` · `department` · `target` · `targets {max}` · `date` · `datetime` · `url` · `asset` · `links {max}` · `list {max, itemMax}` · `searchProviders` · `timezones {max}`; mọi trường có `key`, `label`, `default?`, `help?`, `showIf?: { key: string; equals: string | number | boolean }`.
  - `interface WidgetDefinition { type; category: 'overview'|'department'|'targets'|'mine'|'personal'|'tools'|'content'; title; description; icon; roles?: Role[]; data: boolean; refresh?: number; multiple: boolean; size: Record<DeskBreakpoint, { w; h; minW; minH }>; fields: SettingField[] }`.
  - `const WIDGETS: WidgetDefinition[]` (28 loại của mục 5.5), `widgetDefinition(type: string): WidgetDefinition | undefined`, `catalogFor(role: Role): WidgetDefinition[]`, `fieldsOf(def): SettingField[]` (widget `data: true` được nối thêm `departmentId` kiểu `department` và `refreshSeconds` kiểu `number` 30..3600 mặc định `def.refresh ?? 60`).
- Quyết định: `dept.team` chỉ cho `ADMIN, LEADER, MANAGER`; `hero` có `multiple: false`; mọi loại khác `multiple: true`.

- [ ] **Step 1: Viết test lỗi** — `test('sổ widget đủ 28 loại, không trùng type')` (`WIDGETS.length === 28`, `new Set(types).size === 28`); `test('kích thước hợp lệ cho cả 3 cỡ')` (với mọi loại và cỡ: `1 ≤ minW ≤ w ≤ DESK_COLUMNS[bp]`, `1 ≤ minH ≤ h`); `test('khoá trường không trùng trong một widget')`; `test('nhân sự trong phòng không có cho chuyên viên')` (`catalogFor('STAFF')` không chứa `dept.team`, `catalogFor('MANAGER')` có); `test('widget dữ liệu có thêm phòng và chu kỳ làm mới')` (`fieldsOf(widgetDefinition('dept.status')!)` chứa khoá `departmentId` và `refreshSeconds`).
- [ ] **Step 2:** Run `npm test -w @ioc/api -- --test-name-pattern="sổ widget|kích thước|khoá trường|nhân sự|widget dữ liệu"`. Expected: FAIL (module chưa có).
- [ ] **Step 3:** Viết `catalog.ts`. Cài đặt riêng từng loại (ngoài trường chung): `dept.alerts {kinds: multiselect 8 loại cảnh báo, minSeverity: select info|warning|critical, maxItems: number 3..40 mặc định 12, compact: boolean}`; `dept.ticker {minSeverity mặc định critical, speed: select slow|normal|fast}`; `dept.recent {maxItems 5..25}`; `dept.deadlines {days: number 7..90 mặc định 30}`; `target.kpi {targetId: target, showTrend: boolean}`; `target.watchlist {mode: select manual|mine|risk|overdue, targetIds: targets max 12 showIf mode=manual, maxItems 3..20}`; `target.chart {targetIds: targets max 6, chartType: select line|bar|area, showPlan: boolean}`; `my.work {sections: multiselect needReport|toReview|explanations|proposals}`; `my.notifications {maxItems 3..20}`; `docs.recent {maxItems 3..12}`; `clock {style: select analog|digital, seconds: boolean, showDate: boolean, lunar: boolean, timezones: timezones max 3}`; `calendar {lunar: boolean, holidays: boolean, deadlines: boolean}`; `notepad {}`; `todo {showDone: boolean}`; `countdown {label: text 60, at: datetime, doneText: text 80}`; `focus {workMin: number 5..90 mặc định 25, breakMin: number 1..30 mặc định 5, sound: boolean}`; `launcher {items: links max 24, size: select s|m|l, showLabels: boolean}`; `search {providerIds: list max 12 itemMax 40, internal: boolean}`; `jarvis {prompts: list max 6 itemMax 120}`; `text {body: textarea 4000, align: select left|center}`; `image {assetId: asset, fit: select cover|contain, caption: text 120, link: url}`; `hero {showStats: boolean}`; `dept.status`, `dept.workload`, `dept.stalled`, `dept.frameworks`, `dept.team`, `dept.feedback` không có trường riêng.
- [ ] **Step 4:** Run lại lệnh Step 2. Expected: PASS.
- [ ] **Step 5:** Commit `feat(desk): sổ widget phía máy chủ`.

### Task 3: Bố cục

**Files:**
- Create: `apps/api/src/desk/layout.ts`
- Test: `apps/api/test/desk-layout.test.ts`

**Interfaces:**
- Consumes: `DESK_COLUMNS`, `WidgetDefinition['size']` (Task 2).
- Produces: `interface LayoutItem { i: string; x: number; y: number; w: number; h: number }`; `type DeskLayouts = Record<DeskBreakpoint, LayoutItem[]>`; `placeWidget(layouts: DeskLayouts, id: string, size: WidgetDefinition['size']): DeskLayouts` (vị trí trống đầu tiên quét hàng trên xuống, trái sang phải, cho cả 3 cỡ); `normalizeLayouts(raw: unknown, widgets: { id: string; size: WidgetDefinition['size'] }[]): DeskLayouts` (ép số nguyên, kẹp `x + w ≤ cột`, `w ≥ minW`, `h ≥ minH`, `h ≤ 40`, bỏ mục không có widget, bỏ mục trùng `i`, sinh mục thiếu bằng `placeWidget`).

- [ ] **Step 1: Viết test lỗi** — `placeWidget` vào lưới rỗng cho `{x:0,y:0}`; widget thứ hai 6 cột cạnh widget 6 cột đầu nằm ở `x=6,y=0`; widget 12 cột sau đó xuống `y` = đáy hàng trước; `normalizeLayouts` với chỉ `desktop` sinh `tablet`/`mobile` có `x + w ≤ 8` và `≤ 4`; mục `w=20` bị kẹp về 12; mục của widget không tồn tại bị bỏ; mục `h=0` nâng lên `minH`.
- [ ] **Step 2:** Run `npm test -w @ioc/api -- --test-name-pattern=bố cục`. Expected: FAIL.
- [ ] **Step 3:** Viết `layout.ts` — dựng bảng chiếm chỗ theo hàng, thử từng `(y, x)` tới khi khối `w×h` vừa.
- [ ] **Step 4:** Run lại. Expected: PASS.
- [ ] **Step 5:** Commit `feat(desk): xếp chỗ và chuẩn hoá bố cục`.

### Task 4: Kiểm tra cấu hình

**Files:**
- Create: `apps/api/src/desk/validate.ts`
- Test: `apps/api/test/desk-validate.test.ts`

**Interfaces:**
- Consumes: Task 2, Task 3.
- Produces:
  - Kiểu `Background`, `DockItem`, `DeskAppearance`, `DeskProfileConfig`, `WidgetInstance`, `DeskSpaceConfig` đúng mục 5.2–5.3 đặc tả (trường `shortcuts`, `alerts`, `noteTemplates` để mảng/đối tượng rỗng ở phân hệ 1).
  - `class DeskConfigError extends Error`.
  - `PRESET_IDS` = `binh-minh, trua, hoang-hon, dem-sao, cuc-quang, bien, rung-tram, sen, trong-dong, dia-hinh, kinh, than-chi, giay, luoi-xanh`.
  - `isSafeUrl(value: string): boolean`, `isInternalPath(value: string): boolean`.
  - `normalizeBackground(input: unknown, allowSlideshow = true): Background`.
  - `normalizeProfileConfig(input: unknown): DeskProfileConfig` (điền mặc định cho trường thiếu; ném `DeskConfigError` khi quá 64 KB hoặc không phải đối tượng).
  - `normalizeWidgetSettings(def: WidgetDefinition, input: unknown): Record<string, unknown>`.
  - `normalizeSpaceConfig(input: unknown, role: Role): DeskSpaceConfig` (bỏ widget có `type` lạ hoặc vai trò không được dùng, bỏ `hero` thứ hai, cắt còn 40 widget, chuẩn hoá bố cục bằng `normalizeLayouts`; ném `DeskConfigError` khi quá 256 KB).
- Quy tắc mềm/cứng: số ngoài khoảng → kẹp; chuỗi quá dài → cắt; khoá lạ → bỏ; URL không an toàn → bỏ mục chứa nó; cấu trúc sai kiểu ở gốc hoặc quá cỡ → `DeskConfigError`.

- [ ] **Step 1: Viết test lỗi** — `isSafeUrl('javascript:alert(1)') === false`, `isSafeUrl('https://user:pw@a.vn') === false`, `isSafeUrl('https://dichvucong.gov.vn/p/home') === true`; `isInternalPath('/admin/targets?status=OVERDUE') === true`, `isInternalPath('//evil.com') === false`, `isInternalPath('/api/users') === false`; `normalizeProfileConfig({})` trả đủ mặc định (`appearance.dim === 25`, `appearance.surface === 'glass'`, `startPage === 'desk'`, `dock.position === 'bottom'`); `dim: 500` thành `80`; mục dock `{kind:'link', url:'javascript:…'}` bị bỏ; thư mục lồng thư mục bị bỏ phần lồng; nền `slideshow` trong `slideshow` bị loại; `normalizeSpaceConfig` với `STAFF` bỏ widget `dept.team` và giữ `dept.status`; widget `type:'khong-co'` bị bỏ; hai `hero` còn một; cài đặt `dept.alerts.maxItems: 999` thành `40`; `image.link: 'javascript:x'` thành `null`; JSON 300 KB ném `DeskConfigError`.
- [ ] **Step 2:** Run `npm test -w @ioc/api -- --test-name-pattern="cấu hình|URL|đường dẫn"`. Expected: FAIL.
- [ ] **Step 3:** Viết `validate.ts`. Mặc định hồ sơ: nền `{kind:'daylight'}`, `dim 25`, `blur 0`, `surface 'glass'`, `surfaceOpacity 72`, `accent null`, `density 'comfortable'`, `fontScale 100`, `radius 14`, `motion 'auto'`; `greeting {show:true, name:null, lunar:true, holidays:true}`; `dock {position:'bottom', autoHide:false, magnify:true, items:[]}`; `startPage 'desk'`; `searchProviders` = Google (`https://www.google.com/search?q={q}`), Thư viện pháp luật (`https://thuvienphapluat.vn/page/tim-van-ban.aspx?keyword={q}`), Cổng Dịch vụ công (`https://dichvucong.gov.vn/p/home/dvc-tim-kiem-thu-tuc-hanh-chinh.html?keyword={q}`).
- [ ] **Step 4:** Run lại. Expected: PASS.
- [ ] **Step 5:** Commit `feat(desk): kiểm tra và chuẩn hoá cấu hình bàn làm việc`.

### Task 5: Bàn làm việc dựng sẵn theo vai trò

**Files:**
- Create: `apps/api/src/desk/defaults.ts`
- Test: `apps/api/test/desk-defaults.test.ts`

**Interfaces:**
- Consumes: Task 2–4.
- Produces: `defaultProfileConfig(role: Role): DeskProfileConfig` (dock mặc định mục 5.7, lọc theo quyền: `Duyệt báo cáo` chỉ khi vai trò thuộc `ADMIN, LEADER, MANAGER`); `defaultSpaces(role: Role, focusDepartmentId: string | null): { name: string; icon: string; config: DeskSpaceConfig }[]` theo bảng mục 5.7; `newWidgetId(): string` (`w_` + 12 ký tự base62 ngẫu nhiên).

- [ ] **Step 1: Viết test lỗi** — với mỗi vai trò trong 6 vai trò: mọi không gian qua `normalizeSpaceConfig(config, role)` không mất widget nào (so số lượng), mọi widget có mục bố cục ở cả 3 cỡ; `defaultSpaces('LEADER', null)[0].config.focusDepartmentId === null`; `defaultSpaces('MANAGER', 'd1')` có 2 không gian tên `Hằng ngày`, `Giao ban`; dock của `STAFF` không có `/admin/approvals`.
- [ ] **Step 2:** Run `npm test -w @ioc/api -- --test-name-pattern="dựng sẵn"`. Expected: FAIL.
- [ ] **Step 3:** Viết `defaults.ts`; kích thước widget lấy từ sổ, xếp bằng `placeWidget` theo thứ tự trong bảng.
- [ ] **Step 4:** Run lại. Expected: PASS.
- [ ] **Step 5:** Commit `feat(desk): bàn làm việc dựng sẵn theo vai trò`.

### Task 6: API hồ sơ, không gian, trạng thái widget, sổ widget

**Files:**
- Create: `apps/api/src/desk/desk.controller.ts`
- Modify: `apps/api/src/app.module.ts` (đăng ký controller)
- Create: `scripts/qa-desk.mjs` (kiểm thử API trên máy chủ đang chạy, theo khuôn `scripts/qa-access.mjs`); Modify: `package.json` thêm `"qa:desk": "node scripts/qa-desk.mjs"`

**Interfaces:**
- Consumes: Task 1–5; `getActor`, `isGlobalRole`, `JwtAuthGuard`, `audit` (`src/access.ts`, `src/common.ts`).
- Produces: các endpoint mục 5.4 (trừ ảnh và dữ liệu). Hình dạng trả về của `GET /desk`: `{ profile: { config: DeskProfileConfig; version: number }, spaces: { id; name; icon; position; config: DeskSpaceConfig; version }[], focusDepartments: { id; name; color }[] }` (`focusDepartments` = các phòng đang hoạt động người dùng được chọn: vai trò toàn địa phương → mọi phòng theo `sortOrder`; còn lại → chỉ phòng mình). Lỗi: `DeskConfigError` → 400 với thông điệp tiếng Việt; lệch phiên bản → 409 `"Không gian này vừa được sửa ở nơi khác"` / `"Cài đặt bàn làm việc vừa được sửa ở nơi khác"`.
- Quyết định: `GET /desk` luôn chạy `normalizeSpaceConfig(config, role hiện tại)` trước khi trả (vai trò đổi thì widget không còn quyền biến mất khỏi kết quả, CSDL giữ nguyên tới lần lưu sau); với người không thuộc vai trò toàn địa phương, `focusDepartmentId` trả về luôn là phòng của họ. Lần đầu: tạo hồ sơ + không gian trong một giao dịch, xử lý tranh chấp tạo đồng thời bằng bắt lỗi trùng khoá rồi đọc lại. `PUT /desk/widgets/:widgetId/state` chỉ nhận `widgetId` khớp `^w_[A-Za-z0-9]{8,24}$|^alerts\.seen$`.

- [ ] **Step 1: Viết `scripts/qa-desk.mjs` với các kiểm tra:** chuyên viên `GET /desk` lần đầu → 1 không gian `Hằng ngày`; `PUT /desk/profile` với `expectedVersion` đúng → `version` tăng 1; gửi lại phiên bản cũ → 409; `POST /desk/spaces` → 201; tạo tới không gian thứ 13 → 400; `PUT /desk/spaces/:id` thêm widget `dept.team` bằng tài khoản chuyên viên → lưu thành công nhưng `GET /desk` không có widget đó; `DELETE` không gian cuối cùng → 400; `PUT/GET /desk/widgets/w_abcdefgh12/state` khứ hồi đúng nội dung; người dùng khác không đọc được trạng thái đó (trả rỗng `{ state: null, version: 0 }`).
- [ ] **Step 2:** Run (API chưa có endpoint) `node scripts/qa-desk.mjs`. Expected: FAIL 404.
- [ ] **Step 3:** Viết controller.
- [ ] **Step 4:** Chạy API cục bộ (`npm run start:dev -w @ioc/api`), Run `node scripts/qa-desk.mjs`. Expected: mọi kiểm tra đạt. Run `npm test -w @ioc/api`. Expected: PASS toàn bộ.
- [ ] **Step 5:** Commit `feat(desk): API hồ sơ, không gian và trạng thái widget`.

### Task 7: Ảnh nền và ảnh dùng chung

**Files:**
- Create: `apps/api/src/desk/assets.ts` (`DeskAssetsController` + xử lý ảnh)
- Modify: `apps/api/src/app.module.ts`; `apps/web/nginx.conf` (không cần đổi: giới hạn 55 MB đã đủ)
- Test: `apps/api/test/desk-assets.test.ts`; bổ sung kiểm tra vào `scripts/qa-desk.mjs`

**Interfaces:**
- Produces: `sniffImage(buffer: Buffer): 'jpeg' | 'png' | 'webp' | null`; `processImage(buffer: Buffer): Promise<{ bytes: Buffer; thumb: Buffer; width: number; height: number }>` (ném `DeskConfigError('Tệp không phải ảnh JPEG, PNG hoặc WebP')`); endpoint mục 5.4: `GET /desk/assets` → `{ mine: AssetMeta[]; shared: AssetMeta[]; usedBytes; limitBytes }`, `AssetMeta = { id, name, width, height, sizeBytes, isShared, createdAt }`.
- Quyết định: tải lên dùng `FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 MB } })` như `documents.ts`; trùng `sha256` của chính người đó thì trả ảnh cũ; chỉ `ADMIN` đặt `isShared`; ghi nhật ký `DESK_ASSET_SHARED`.

- [ ] **Step 1: Viết test lỗi** — tạo PNG 3000×1500 bằng `createCanvas` → `processImage` trả `width 2560`, `height 1280`, `bytes` bắt đầu bằng `RIFF....WEBP`, ảnh xem trước cạnh dài 480; PNG 800×600 giữ nguyên kích thước; `sniffImage(Buffer.from('%PDF-1.7'))` là `null`; `processImage(Buffer.from('GIF89a...'))` ném lỗi.
- [ ] **Step 2:** Run `npm test -w @ioc/api -- --test-name-pattern=ảnh`. Expected: FAIL.
- [ ] **Step 3:** Viết `assets.ts` (`loadImage` → `createCanvas` → `drawImage` → `encode('webp', 82)`).
- [ ] **Step 4:** Run lại; thêm vào `qa-desk.mjs`: tải ảnh lên, `GET` lại đúng `content-type: image/webp` và `ETag`, người khác `GET` ảnh riêng → 404, chuyên viên đặt `isShared` → 403. Expected: PASS.
- [ ] **Step 5:** Commit `feat(desk): ảnh nền tải lên và ảnh dùng chung`.

### Task 8: Gói dữ liệu phòng, chuỗi số liệu, tìm chỉ tiêu

**Files:**
- Modify: `apps/api/src/ioc.ts` (tách `buildOverview`, `targetBrief`, `parseYear` thành hàm xuất; controller gọi lại, hành vi `/ioc/overview` không đổi)
- Create: `apps/api/src/desk/data.ts` (`DeskDataController`, `departmentSnapshot`, `buildDeadlines`, `buildTeam`, `TtlCache`)
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/desk-data.test.ts`

**Interfaces:**
- Produces: `type IocSnapshot = Awaited<ReturnType<typeof iocSnapshot>>`; `buildOverview(prisma, actor, year, snap: IocSnapshot)` trả đúng đối tượng `/ioc/overview` đang trả; `buildDeadlines(snap: IocSnapshot, proposals: { id; name; autoApproveAt: Date | null }[], now: Date, days: number): Deadline[]` (sắp tăng dần theo `at`, quá hạn chưa xong vẫn giữ); `buildTeam(snap: IocSnapshot, members: { id; fullName; position; role; lastLoginAt }[]): TeamMember[]`; `class TtlCache<T> { constructor(ttlMs: number, max: number); get(key: string): T | undefined; set(key: string, value: T): void }`; endpoint `GET /desk/data/department` (hình dạng mục 5.6 + `documents: { id; code; title; status; createdAt }[]` ≤ 8, của phòng hoặc không gắn phòng); `GET /desk/data/series` → `{ targets: { id; code; title; unit; kind; targetValue; targetText; status; progress; points: { periodKey; label; value }[] }[] }` (chỉ báo cáo đã duyệt, mỗi kỳ lấy bản mới nhất, ≤ 6 chỉ tiêu, chỉ tiêu ngoài quyền bị bỏ qua); `GET /desk/data/targets` → `{ id; code; title; departmentName; status; progress }[]` ≤ 50.
- Quyết định: vai trò toàn địa phương gọi không có `departmentId` → 400 `"Chọn phòng cần xem"`; khoá đệm `${departmentId}:${year}` chỉ tra sau khi `resolveDepartmentScope` đã cho phép.

- [ ] **Step 1: Viết test lỗi** — `buildDeadlines` với ảnh chụp giả lập (một chỉ tiêu hạn 3 ngày tới, một chỉ tiêu đã `COMPLETED` hạn hôm qua, một giải trình hạn mai, một đề xuất tự thông qua sau 2 ngày, một kỳ báo cáo còn hạn 5 ngày chưa nộp) → đúng 4 mục, không có chỉ tiêu đã hoàn thành, thứ tự tăng dần; `buildTeam` đếm đúng `targets`, `missingReports`, `overdue` theo `assigneeId`; `TtlCache` hết hạn sau `ttlMs` (giả lập `Date.now`), bỏ mục cũ nhất khi vượt `max`.
- [ ] **Step 2:** Run `npm test -w @ioc/api -- --test-name-pattern="hạn sắp tới|nhân sự|bộ đệm"`. Expected: FAIL.
- [ ] **Step 3:** Tách `ioc.ts`, viết `data.ts`.
- [ ] **Step 4:** Run lại + `npm test -w @ioc/api` (đặc biệt `ioc-v2.test.ts` không đổi kết quả); thêm vào `qa-desk.mjs`: lãnh đạo gọi gói dữ liệu một phòng → 200 có `totals`; chuyên viên gọi phòng khác → 403; chuỗi số liệu chỉ tiêu phòng khác với chuyên viên → mảng rỗng. Expected: PASS.
- [ ] **Step 5:** Commit `feat(desk): gói dữ liệu phòng cho widget`.

### Task 9: Nền móng phía web — kiểu, gọi API, bố cục, lịch sử thao tác

**Files:**
- Create: `apps/web/src/pages/desk/types.ts` (bản sao kiểu của Task 2, 4, 6, 8)
- Create: `apps/web/src/pages/desk/api.ts`
- Create: `apps/web/src/pages/desk/layout.ts` (bản sao `placeWidget`/`normalizeLayouts` + `ROW_HEIGHT = 36`, `GAP = 14`, `breakpointOf(width: number): DeskBreakpoint`)
- Create: `apps/web/src/pages/desk/history.ts`
- Test: `apps/web/src/pages/desk/layout.test.ts`, `apps/web/src/pages/desk/history.test.ts`
- Modify: `apps/web/package.json` (`"test": "tsx --test \"src/**/*.test.ts\""`), `package.json` gốc (`"test": "npm run test -w @ioc/api && npm run test -w @ioc/web"`)

**Interfaces:**
- Produces: `deskApi` = `{ load(): Promise<DeskPayload>; saveProfile(config, expectedVersion): Promise<{ version }>; createSpace(body); saveSpace(id, body: { name?; icon?; config?; expectedVersion }): Promise<{ version }>; deleteSpace(id); orderSpaces(ids); reset(); catalog(): Promise<WidgetDefinition[]>; getState<T>(widgetId): Promise<{ state: T | null; version: number }>; putState(widgetId, state, expectedVersion): Promise<{ version }>; assets(); uploadAsset(file: File); assetBlobUrl(id, size): Promise<string> }` (`assetBlobUrl` đọc Cache Storage `ioc-desk-assets` trước, lỗi thì trả chuỗi rỗng).
- `class History<T> { push(entry: T): void; undo(): T | undefined; redo(): T | undefined; get canUndo(): boolean; get canRedo(): boolean; clear(): void }` giới hạn 50 mục.

- [ ] **Step 1: Viết test lỗi** — các ca bố cục như Task 3 (cùng kết quả); `breakpointOf(1199) === 'tablet'`, `breakpointOf(767) === 'mobile'`, `breakpointOf(1200) === 'desktop'`; `History`: push 3 → undo trả mục 3 → redo trả lại mục 3 → push mới thì xoá nhánh redo; push 60 mục chỉ giữ 50.
- [ ] **Step 2:** Run `npm test -w @ioc/web`. Expected: FAIL.
- [ ] **Step 3:** Viết các tệp.
- [ ] **Step 4:** Run `npm test` ở gốc. Expected: PASS cả API và web.
- [ ] **Step 5:** Commit `feat(desk): nền móng phía web`.

### Task 10: Lịch âm, ngày lễ, Markdown gọn

**Files:**
- Create: `apps/web/src/lib/lunar.ts`, `apps/web/src/lib/holidays.ts`, `apps/web/src/lib/markdown.tsx`
- Test: `apps/web/src/lib/lunar.test.ts`, `apps/web/src/lib/holidays.test.ts`, `apps/web/src/lib/markdown.test.ts`

**Interfaces:**
- Produces: `solarToLunar(date: Date): { day; month; year; leap: boolean }` (múi giờ +7, thuật toán Hồ Ngọc Đức); `canChi(year: number): string` (vd `2026 → 'Bính Ngọ'`); `lunarLabel(date): string` (`'17/9 Bính Ngọ'`); `holidaysOn(date: Date): { name: string; official: boolean }[]` (dương: 1/1, 3/2, 8/3, 26/3, 30/4, 1/5, 19/5, 27/7, 2/9, 20/10, 20/11, 22/12; âm: 1/1–3/1 Tết Nguyên đán (chính thức), 15/1 Rằm tháng Giêng, 10/3 Giỗ Tổ Hùng Vương (chính thức), 15/7 Vu Lan, 15/8 Trung thu, 23/12 ông Công ông Táo); `parseMarkdown(text: string): Block[]` và `<Markdown text />` (đề mục `#`/`##`, đậm `**`, nghiêng `_`, mã `` ` ``, liên kết `[a](https://…)` chỉ http/https/đường dẫn nội bộ, danh sách `-`, ô đánh dấu `- [ ]`/`- [x]`; không dùng `dangerouslySetInnerHTML`).

- [ ] **Step 1: Viết test lỗi** — `solarToLunar(new Date('2026-02-17T05:00:00+07:00'))` là `1/1/2026`; `solarToLunar(new Date('2026-10-27T09:00:00+07:00'))` là `17/9/2026`; `solarToLunar(new Date('2023-03-22T09:00:00+07:00'))` là `1/2 nhuận/2023` (`leap: true`); `canChi(2026) === 'Bính Ngọ'`, `canChi(2025) === 'Ất Tỵ'`; `holidaysOn(2026-04-26)` có `Giỗ Tổ Hùng Vương` (10/3 âm 2026); `holidaysOn(2026-09-02)` có `Quốc khánh`; `parseMarkdown('[x](javascript:alert(1))')` không sinh nút liên kết; `parseMarkdown('- [x] Xong')` sinh mục danh sách `checked: true`.
- [ ] **Step 2:** Run `npm test -w @ioc/web`. Expected: FAIL.
- [ ] **Step 3:** Viết các tệp.
- [ ] **Step 4:** Run lại. Expected: PASS.
- [ ] **Step 5:** Commit `feat(lib): lịch âm, ngày lễ Việt Nam, Markdown an toàn`.

### Task 11: Kho trạng thái bàn làm việc

**Files:**
- Create: `apps/web/src/pages/desk/useDesk.tsx` (`DeskProvider`, `useDesk()`)

**Interfaces:**
- Consumes: Task 9.
- Produces: `useDesk(): DeskStore` với `{ status: 'loading' | 'ready' | 'error'; error?: string; profile; spaces; focusDepartments; catalog; activeSpaceId; setActiveSpace(id); editing; setEditing(on: boolean); breakpoint; previewBreakpoint: DeskBreakpoint | null; setPreviewBreakpoint(bp | null); updateProfile(recipe: (c: DeskProfileConfig) => DeskProfileConfig): void; updateSpace(id: string, recipe: (c: DeskSpaceConfig) => DeskSpaceConfig, meta?: { name?: string; icon?: string }): void; addSpace(name, icon, copyFromId?); removeSpace(id); moveSpace(id, toIndex); undo(); redo(); canUndo; canRedo; save: 'idle' | 'saving' | 'saved' | 'error' | 'offline'; conflict: null | { kind: 'profile' | 'space'; id?: string }; resolveConflict(choice: 'theirs' | 'mine'); reset(); reload() }`.
- Quyết định: vẽ ngay từ `localStorage['ioc_desk_v1:<userId>']` rồi tải lại ngầm; tự lưu sau 700 ms ngừng sửa, mỗi đích (hồ sơ, từng không gian) một hàng đợi; `navigator.onLine === false` → `save = 'offline'`, lưu khi có mạng (`online` event); 409 → `conflict`; chọn `mine` = tải phiên bản mới nhất rồi ghi lại bản của mình với phiên bản đó; lịch sử hoàn tác gộp hồ sơ và không gian (`{ kind, id?, before, after }`).

- [ ] **Step 1:** Viết `useDesk.tsx`.
- [ ] **Step 2:** Run `npm run typecheck -w @ioc/web`. Expected: không lỗi.
- [ ] **Step 3:** Commit `feat(desk): kho trạng thái tự lưu, hoàn tác, xử lý xung đột`.

### Task 12: Khung ứng dụng — trang chủ mới, menu, kính mờ, trang mở đầu, lối tắt, ghim trang

**Files:**
- Modify: `apps/web/src/app/router.tsx` (`/admin` → `Desk`; `/admin/dieu-hanh` → `OpsCenter`; `/admin` có `?year=` → chuyển `/admin/dieu-hanh?year=`)
- Modify: `apps/web/src/app/nav.tsx` (mục `Bàn làm việc` DH-00 `/admin`, `Trung tâm điều hành` DH-01 `/admin/dieu-hanh`, từ khoá không dấu)
- Modify: `apps/web/src/app/layout/AdminLayout.tsx`, `layout.css` (lớp `desk-mode` trên `.shell` khi ở `/admin`: thanh bên + đầu trang + dải định danh nền trong suốt kính mờ; nút **Lối tắt** trên đầu trang)
- Modify: `apps/web/src/components/Page.tsx` (nút ghim cạnh tiêu đề, ẩn trên trang bàn làm việc)
- Modify: `apps/web/src/pages/auth/Login.tsx` (đặt `sessionStorage['ioc_fresh_login'] = '1'` sau khi đăng nhập)
- Modify: mọi liên kết tới Trung tâm điều hành đang dùng `'/admin'` kèm ý "tổng quan" (tìm bằng `grep -rn "'/admin'" apps/web/src`) và `copilot.ts` nếu trả liên kết tổng quan
- Create: `apps/web/src/pages/desk/Desk.tsx` (vỏ trang: `DeskProvider`, xử lý trang mở đầu), `apps/web/src/pages/desk/PinPage.tsx`, `apps/web/src/pages/desk/LauncherButton.tsx`, `apps/web/src/pages/desk/icons.tsx`

**Interfaces:**
- Produces: `ICON_NAMES: string[]` (≈ 60 tên) và `<DeskIcon name color? size? />` (tên lạ → biểu tượng mặc định); `<PinPage />` (ghim `location.pathname + location.search` thành `DockItem` `view` vào dock hoặc widget lối tắt của không gian đang chọn — gọi API trực tiếp vì ngoài trang bàn làm việc không có `DeskProvider`); `<LauncherButton />` (bảng nổi: mục dock theo thứ tự + mọi chức năng người dùng có quyền).
- Quyết định: trang mở đầu chỉ áp dụng khi có cờ `ioc_fresh_login` (đọc rồi xoá ngay), nên bấm logo/mục menu luôn về bàn làm việc.

- [ ] **Step 1:** Sửa/viết các tệp.
- [ ] **Step 2:** Run `npm run typecheck -w @ioc/web && npm run build -w @ioc/web`. Expected: thành công.
- [ ] **Step 3:** Kiểm tra bằng Playwright (kịch bản tạm trong thư mục nháp): đăng nhập → ở `/admin` thấy bàn làm việc; `/admin?year=2026` chuyển `/admin/dieu-hanh?year=2026`; menu có hai mục DH-00/DH-01; đặt trang mở đầu `ops` rồi đăng nhập lại → về `/admin/dieu-hanh`.
- [ ] **Step 4:** Commit `feat(desk): bàn làm việc là trang chủ; trung tâm điều hành chuyển /admin/dieu-hanh`.

### Task 13: Hình nền và giao diện

**Files:**
- Create: `apps/web/src/pages/desk/background/presets.tsx`, `Backdrop.tsx`, `BackgroundPanel.tsx`, `daylight.ts`
- Create: `apps/web/src/pages/desk/desk.css`
- Test: `apps/web/src/pages/desk/background/daylight.test.ts`

**Interfaces:**
- Produces: `PRESETS: { id: PresetId; name: string; tone: 'light' | 'dark'; animated?: boolean; render(): ReactNode }[]` (14 nền mục 5.8, vẽ bằng CSS/SVG); `daylightPhase(date: Date): { id: 'dawn' | 'day' | 'dusk' | 'night'; next: Date }` (bình minh 5:00–7:59, ngày 8:00–16:59, hoàng hôn 17:00–18:59, đêm 19:00–4:59); `<Backdrop background dim blur motion onTone />` (ảnh lỗi/không tìm thấy → nền `daylight`; trình chiếu đổi ảnh có hiệu ứng mờ dần); `<BackgroundPanel />` (ngăn kéo: Bộ sưu tập · Màu và dải màu · Ảnh của tôi · Ảnh của đơn vị · Trình chiếu · Hiệu ứng: mờ, tối, kiểu thẻ, độ đặc, màu nhấn, mật độ, cỡ chữ, bo góc, chuyển động); biến CSS đặt trên gốc bàn làm việc: `--desk-surface`, `--desk-surface-strong`, `--desk-border`, `--desk-blur`, `--desk-radius`, `--desk-accent`, `--desk-ink` (màu chữ trên nền), `--desk-font-scale`.
- Quyết định: màu kính = trắng 72% (giao diện sáng) / `#121620` 62% (tối) nhân `surfaceOpacity`; khi `motion` là `reduced` hoặc máy bật `prefers-reduced-motion` thì tắt hoạt ảnh; khi `prefers-reduced-transparency` thì bỏ `backdrop-filter`.

- [ ] **Step 1: Viết test lỗi** — `daylightPhase(07:59)` là `dawn`, `daylightPhase(08:00)` là `day`, `daylightPhase(23:00).next` là 5:00 sáng hôm sau.
- [ ] **Step 2:** Run `npm test -w @ioc/web`. Expected: FAIL.
- [ ] **Step 3:** Viết các tệp.
- [ ] **Step 4:** Run lại; `npm run build -w @ioc/web`; chụp màn hình 14 nền + ảnh tải lên (Playwright, thư mục nháp) và tự xem lại độ tương phản chữ lời chào; xoá ảnh đang làm nền rồi tải lại trang → mặt bàn hiện nền `daylight`, không có ảnh vỡ. Expected: PASS, ảnh đạt.
- [ ] **Step 5:** Commit `feat(desk): hình nền, hiệu ứng và tuỳ chỉnh giao diện`.

### Task 14: Lưới, khung widget, chế độ tùy biến, không gian, phòng đang xem

**Files:**
- Create: `apps/web/src/pages/desk/DeskGrid.tsx`, `WidgetFrame.tsx`, `EditToolbar.tsx`, `SpaceTabs.tsx`, `DeskHeader.tsx`, `DepartmentFocus.tsx`
- Modify: `apps/web/src/pages/desk/Desk.tsx`, `desk.css`

**Interfaces:**
- Consumes: Task 11, Task 13.
- Produces: `<WidgetFrame widget def editing onSettings onRemove onDuplicate onMove onMaximize>{children}</WidgetFrame>` (ranh giới lỗi riêng; tiêu đề, biểu tượng, làm mới, menu ⋯; trong chế độ tùy biến: tay kéo `.dw-handle`, `Tab` để chọn, mũi tên dời 1 ô, `Shift`+mũi tên đổi cỡ, `Delete` xoá); `<DeskGrid space breakpoint editing />` (`GridLayout` với `dragConfig.handle = '.dw-handle'`, `dropConfig.enabled = editing`, `onDrop` đặt widget kéo từ kho tại ô thả); `useWidgetContext(): { widget; def; departmentId: string | null; year: number; refreshMs: number; maximized: boolean }`.
- Quyết định: phím `Alt+1…9` đổi không gian (ngoài ô nhập); `Ctrl+Z`/`Ctrl+Y`/`Ctrl+Shift+Z` chỉ trong chế độ tùy biến; `Esc` thoát tùy biến; phóng to widget = lớp phủ toàn bàn, `Esc` đóng; widget có `type` lạ hiện thẻ "Widget không còn dùng được" kèm nút gỡ.

- [ ] **Step 1:** Viết các tệp.
- [ ] **Step 2:** Run `npm run typecheck -w @ioc/web && npm run build -w @ioc/web`. Expected: thành công.
- [ ] **Step 3:** Playwright: bật tùy biến → kéo widget sang chỗ khác → tải lại trang vẫn giữ; dùng phím mũi tên dời widget; `Ctrl+Z` hoàn tác; thêm/đổi tên/xoá/sắp xếp không gian; xem trước cỡ điện thoại. Expected: đạt.
- [ ] **Step 4:** Commit `feat(desk): lưới kéo thả, chế độ tùy biến và không gian`.

### Task 15: Kho widget và cài đặt widget

**Files:**
- Create: `apps/web/src/pages/desk/WidgetLibrary.tsx`, `WidgetSettings.tsx`, `fields/SettingsForm.tsx`, `fields/editors.tsx` (department, target, targets, links, list, searchProviders, timezones, asset, color, datetime)

**Interfaces:**
- Consumes: `WidgetDefinition.fields`, `fieldsOf` (bản web trong `types.ts`), `useDesk`.
- Produces: `<WidgetLibrary open onClose />` (tìm kiếm không dấu bằng `fold`, nhóm theo `category`, thẻ có mô tả + kích thước; nút **Thêm** đặt bằng `placeWidget`; kéo thẻ thả vào lưới qua `dataTransfer` `application/x-ioc-widget` = `type`); `<WidgetSettings widgetId onClose />` (hai thẻ **Nội dung** — sinh từ trường — và **Giao diện**: tiêu đề, màu nhấn, kiểu thẻ, ẩn đầu widget; thay đổi áp dụng ngay, hoàn tác được).

- [ ] **Step 1:** Viết các tệp.
- [ ] **Step 2:** Run typecheck + build. Expected: thành công.
- [ ] **Step 3:** Playwright: thêm `countdown` bằng nút, thêm `clock` bằng kéo thả; đổi cài đặt `dept.alerts.maxItems` → danh sách đổi ngay; `showIf` ẩn/hiện đúng trường `targetIds` của `target.watchlist`. Expected: đạt.
- [ ] **Step 4:** Commit `feat(desk): kho widget và ô cài đặt tự sinh`.

### Task 16: Widget dữ liệu

**Files:**
- Create: `apps/web/src/pages/desk/widgets/department.tsx` (`dept.status`, `dept.workload`, `dept.alerts`, `dept.ticker`, `dept.stalled`, `dept.recent`, `dept.deadlines`, `dept.frameworks`, `dept.team`, `dept.feedback`), `widgets/targets.tsx` (`target.kpi`, `target.watchlist`, `target.chart`), `widgets/mine.tsx` (`my.work`, `my.notifications`, `docs.recent`), `widgets/useDepartmentData.ts`, `widgets/registry.tsx`
- Modify: `apps/web/src/pages/desk/DeskGrid.tsx` (vẽ qua `registry`)

**Interfaces:**
- Produces: `useDepartmentData(): { data?: DepartmentSnapshot; isLoading; isError; error; refetch; isStale }` (khoá truy vấn `/desk/data/department?departmentId&year`, `refetchInterval = refreshSeconds * 1000`, bản lưu `localStorage['ioc_desk_data_v1:<departmentId>:<year>']` làm dữ liệu ban đầu); `WIDGET_COMPONENTS: Record<string, LazyExoticComponent<ComponentType>>` (tải lười theo tệp nhóm).
- Quyết định: phòng đang xem = `settings.departmentId ?? space.focusDepartmentId ?? (người thuộc phòng ? phòng mình : null)`; `null` → "Chọn phòng ở đầu bàn làm việc" (hoặc "Chưa có phòng ban" khi `focusDepartments` rỗng); lỗi 403 → "Không xem được phòng này"; bấm số liệu mở danh mục đã lọc như Trung tâm điều hành đang làm (dùng lại `alertLink`, liên kết `/admin/targets?status=…&departmentId=…`); vòng tròn tình trạng dùng `Chart` sẵn có và `STATUS`.

- [ ] **Step 1:** Viết các tệp.
- [ ] **Step 2:** Run typecheck + build. Expected: thành công.
- [ ] **Step 3:** Chạy dữ liệu mẫu (`RUN_DEMO_SEED`/`db:seed`), Playwright đăng nhập lần lượt chuyên viên, trưởng phòng, lãnh đạo → chụp bàn làm việc; lãnh đạo đổi phòng đang xem → widget đổi số liệu; so con số `dept.status` với `/admin/dieu-hanh?departmentId` của cùng phòng. Expected: khớp.
- [ ] **Step 4:** Commit `feat(desk): widget dữ liệu phòng, chỉ tiêu và việc của tôi`.

### Task 17: Widget cá nhân

**Files:**
- Create: `apps/web/src/pages/desk/widgets/personal.tsx` (`hero`, `clock`, `calendar`, `notepad`, `todo`, `countdown`, `focus`), `widgets/useWidgetState.ts`

**Interfaces:**
- Produces: `useWidgetState<T>(widgetId: string, initial: T): { state: T; setState(next: T | ((prev: T) => T)): void; saving: boolean }` (tải `GET /desk/widgets/:id/state`, tự lưu sau 1 giây, 409 thì tải lại và gộp theo kiểu của widget: `todo` gộp theo `id` mục, `notepad` giữ bản người dùng đang gõ).
- Quyết định: `todo` mục `{ id; text ≤ 300; done; dueAt?; remindAt? }` ≤ 200 mục, nhắc giờ bằng `App.useApp().notification` khi bàn làm việc đang mở; `focus` giữ tiến trình trong `localStorage` để tải lại không mất; âm báo tổng hợp bằng Web Audio; `hero` chào theo giờ (`Chào buổi sáng` 4:00–10:59, `Chào buổi trưa` 11:00–13:59, `Chào buổi chiều` 14:00–17:59, `Chào buổi tối` còn lại), tên = `greeting.name || user.fullName`, dòng ngày `Thứ Ba, 27/10/2026 · 17/9 Bính Ngọ` + ngày lễ, chip số: việc của tôi (`/my-work` `counts`), cảnh báo phòng, thông báo chưa đọc.

- [ ] **Step 1:** Viết các tệp.
- [ ] **Step 2:** Run typecheck + build. Expected: thành công.
- [ ] **Step 3:** Playwright: gõ sổ ghi chú → tải lại vẫn còn; thêm 2 việc riêng, đánh dấu xong 1; đồng hồ kim chạy; lịch hiện ngày âm và chấm ngày lễ. Expected: đạt.
- [ ] **Step 4:** Commit `feat(desk): widget cá nhân — lời chào, đồng hồ, lịch âm dương, ghi chú, việc riêng, đếm ngược, tập trung`.

### Task 18: Widget lối tắt, tra cứu, nội dung

**Files:**
- Create: `apps/web/src/pages/desk/widgets/tools.tsx` (`launcher`, `search`, `jarvis`), `widgets/content.tsx` (`text`, `image`), `LinkTile.tsx` (ô biểu tượng dùng chung với dock)

**Interfaces:**
- Produces: `<LinkTile item: DockItem size onEdit? />` (màn hình hệ thống lọc theo quyền bằng `navItems`; web ngoài mở tab mới `rel="noopener noreferrer"`; biểu tượng web ngoài = chữ cái đầu trên nền màu băm từ tên miền; thư mục mở bảng nổi).
- Quyết định: `search` — Enter tìm trong hệ thống (gợi ý chỉ tiêu qua `/targets?search=`, màn hình qua `navItems`) và nút từng trang tra cứu (`url.replace('{q}', encodeURIComponent(q))`); `jarvis` — gửi `POST /copilot/messages` `{ message }`, hiện `reply` rút gọn + nút **Mở trong Jarvis**; câu có `pendingAction` thì chỉ hướng dẫn mở Jarvis để xác nhận; `image` — ảnh tải qua `assetBlobUrl`.

- [ ] **Step 1:** Viết các tệp.
- [ ] **Step 2:** Run typecheck + build. Expected: thành công.
- [ ] **Step 3:** Playwright: thêm lối tắt web ngoài `https://dichvucong.gov.vn` vào widget lối tắt → bấm mở tab mới; tìm "hộ nghèo" ra chỉ tiêu; hỏi Jarvis "Tình hình phòng" trả lời trong widget. Expected: đạt.
- [ ] **Step 4:** Commit `feat(desk): widget lối tắt, tìm kiếm, hỏi Jarvis, khối chữ, ảnh`.

### Task 19: Dock

**Files:**
- Create: `apps/web/src/pages/desk/dock/Dock.tsx`, `dock/DockItemEditor.tsx`
- Modify: `apps/web/src/pages/desk/Desk.tsx`, `desk.css`, `LauncherButton.tsx` (dùng chung `LinkTile`)

**Interfaces:**
- Produces: `<Dock />` (vị trí đáy/trái/phải/ẩn, tự ẩn, phóng to biểu tượng theo khoảng cách con trỏ — hệ số `1 + 0.45 * max(0, 1 - d/140)`, tắt khi `magnify: false` hoặc giảm chuyển động; huy hiệu số: `/admin/approvals` = số báo cáo chờ duyệt, `/admin/feedback` = phản ánh mới, `/admin/viec-cua-toi` = tổng `counts` việc của tôi; kéo sắp xếp trong chế độ tùy biến; chuột phải: Sửa · Xoá · Chuyển vào thư mục); `<DockItemEditor value onSave />` (thẻ: Chức năng · Trang đã lọc (dán đường dẫn nội bộ) · Web ngoài · Thư mục; kiểm tra URL bằng cùng quy tắc `isSafeUrl`/`isInternalPath` bản web).

- [ ] **Step 1:** Viết các tệp.
- [ ] **Step 2:** Run typecheck + build. Expected: thành công.
- [ ] **Step 3:** Playwright: thêm web ngoài vào dock, tạo thư mục, kéo sắp xếp, đổi vị trí dock sang trái, tải lại vẫn giữ; trên cỡ điện thoại dock thành thanh đáy. Expected: đạt.
- [ ] **Step 4:** Commit `feat(desk): dock lối tắt`.

### Task 20: Hoàn tất phân hệ 1

**Files:**
- Modify: `docs/huong-dan-su-dung/noi-dung/20-dieu-hanh.md` (thêm mục DH-00 Bàn làm việc; DH-01 ghi đường dẫn mới), `docs/huong-dan-su-dung/noi-dung/10-tong-quan.md` (trang chủ sau đăng nhập), `docs/huong-dan-su-dung/noi-dung/90-phu-luc.md` (phím tắt của bàn làm việc)
- Modify: `README.md` nếu có mô tả trang chủ

- [ ] **Step 1:** Run `npm test` (gốc) và `npm run build`. Expected: PASS và dựng thành công.
- [ ] **Step 2:** Run `node scripts/qa-desk.mjs` trên API cục bộ có dữ liệu mẫu. Expected: mọi kiểm tra đạt.
- [ ] **Step 3:** Chụp bàn làm việc của 3 vai trò, sáng và tối, máy tính và điện thoại; tự rà lỗi hiển thị (chữ tràn, tương phản, chồng lấn) và sửa.
- [ ] **Step 4:** Viết mục HDSD; commit `docs(hdsd): Bàn làm việc số (DH-00)`; push; cập nhật mô tả PR #26 (đánh dấu phân hệ 1).
