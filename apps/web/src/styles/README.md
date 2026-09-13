# Hệ thống thiết kế IOC Lái Thiêu

Tầng giao diện toàn cục nằm ở `src/styles/`, được nhập một lần trong `main.tsx` qua `index.css`.
Mỗi tính năng có một file CSS riêng, do chính trang đó nhập, và luôn xếp sau tầng toàn cục.

```
styles/
  index.css       nhập theo thứ tự: tokens → base → primitives → shell → copilot
  tokens.css      biến thiết kế (màu, chữ, nhịp, bo góc, bóng, chuyển động, tầng z) + chế độ tối
  base.css        thiết lập lại trình duyệt, kiểu chữ gốc, thanh cuộn, vòng focus, in ấn
  primitives.css  nút, trường nhập, thẻ, huy hiệu, bảng, tiến độ, hộp thoại, khung xương…
  shell.css       thanh bên, thanh trên, thanh tiến độ cuộn, bảng lệnh, thông báo nổi, khung trang
  copilot.css     nút nổi và bảng trợ lý AI
  <tính-năng>.css CSS riêng của từng màn hình
```

## Ba quy tắc bắt buộc

1. **Không mã màu trực tiếp.** Chỉ dùng token ngữ nghĩa: `--bg-*`, `--tx-*`, `--bd-*`, `--sh-*`.
   Thang màu gốc (`--brand-600`, `--ok-500`…) chỉ được dùng bên trong `tokens.css`.
2. **Không cỡ chữ và khoảng cách tuỳ tiện.** Chỉ dùng `var(--fs-*)` và `var(--sp-*)`.
   Ngoại lệ duy nhất: 1–3px cho viền và đường kẻ.
3. **Luôn kiểm tra ở cả hai chế độ sáng và tối** trước khi coi là xong.

## Bảng màu

| Nhóm | Vai trò | Token ngữ nghĩa |
|---|---|---|
| Lam công vụ | nhận diện, điều hướng, hành động chính | `--bg-brand`, `--tx-brand`, `--bd-brand` |
| Ngọc | dữ liệu, điểm nhấn, biểu đồ | `--bg-accent`, `--tx-accent` |
| Tím | trợ lý AI, đề xuất do máy sinh, độ tin cậy | `--bg-ai`, `--tx-ai` |
| Lục | hoàn thành, đúng tiến độ | `--bg-ok`, `--tx-ok`, `--bg-ok-soft` |
| Hổ phách | cần theo dõi, cảnh báo | `--bg-warn`, `--tx-warn`, `--bg-warn-soft` |
| Hồng đỏ | quá hạn, lỗi, từ chối | `--bg-bad`, `--tx-bad`, `--bg-bad-soft` |

Màu thương hiệu tách bạch hoàn toàn với màu trạng thái. Bản cũ dùng xanh lá cho cả nhận diện lẫn
"đúng tiến độ", khiến người xem không phân biệt được phần tử giao diện với ý nghĩa dữ liệu — đây là
lý do chính khiến bảng màu được dựng lại.

## Thang chữ

`--fs-micro` 11px (nhãn viết hoa) · `--fs-xs` 12 · `--fs-sm` 13 · `--fs-base` 14 (chữ nền) ·
`--fs-md` 16 · `--fs-lg` 18 (tiêu đề thẻ) · `--fs-xl` 22 · `--fs-2xl` 28 (tiêu đề trang) ·
`--fs-3xl` 36 (số liệu lớn) · `--fs-4xl` 48 · `--fs-5xl` 60 (hero công khai).

Không bao giờ dùng cỡ dưới 11px. Một họ chữ duy nhất: **Be Vietnam Pro** (bộ dấu tiếng Việt được
thiết kế riêng); `--font-mono` chỉ dành cho mã chỉ tiêu, mã phản ánh, số văn bản.

## Nhịp

`--sp-1` 4px → `--sp-12` 96px, toàn bộ là bội số của 4.

## Nguyên thể dùng lại

Trước khi viết CSS mới, kiểm tra `primitives.css` — nhiều thứ đã có sẵn:

`.btn` (`.primary .secondary .ghost .danger .accent .ai .sm .lg .icon .block .loading`) ·
`.row-action` · `.segmented` · `.chip` · `.badge` (`.ok .warn .bad .info .accent .ai .neutral .dot`) ·
`.panel` / `.card` + `.panel-head` · `.table-wrap` + `table` (thêm `.tall` cho bảng dài để đầu bảng
dính và phân trang luôn trong tầm mắt) · `.toolbar` · `.search` ·
`.form-grid` · `.field-hint` / `.field-error` · `.notice` / `.form-error` / `.form-success` / `.info-box` ·
`.empty` · `.spinner` · `.skeleton` (+ `.skeleton-text .skeleton-title`) · `.modal` · `.progress` · `.ring` ·
`.avatar` · `.stat-grid` / `.stat-card` / `.stat-icon` · `.mini-stat-grid` · `.year-picker` · `.switch` ·
`.code` · `.kbd` · `[data-tooltip]`.

Thành phần React tương ứng ở `components/UI.tsx`: `PageHead`, `Modal`, `Empty`, `Spinner`,
`Skeleton`, `SkeletonText`, `SkeletonCards`, `SkeletonTable`, `Badge`, `StateCard`.
Thông báo kết quả thao tác: `toast.ok(...)`, `toast.error(...)` từ `components/Toast.tsx`.

## Vỏ ứng dụng

- **Thanh tiến độ cuộn** (`components/ScrollProgress.tsx`): ghi tiến độ vào biến CSS
  `--scroll-progress` trong một khung `requestAnimationFrame`, không làm React vẽ lại khi cuộn.
- **Thanh bên**: điều hướng chia nhóm (`src/nav.ts`), thu gọn được thành dải biểu tượng,
  trên màn hình hẹp là ngăn kéo có bẫy tiêu điểm.
- **Bảng lệnh** `Ctrl/⌘ + K`: tìm màn hình và thao tác, gõ không dấu vẫn khớp.
- **Chế độ sáng/tối** (`src/theme.ts`): sáng / tối / theo hệ thống, áp dụng trước khi vẽ nhờ đoạn
  mã nội tuyến trong `index.html` nên không bị chớp màu.
- **Copilot** là nút nổi + bảng trượt (`components/CopilotDock.tsx`), không còn là màn hình riêng;
  hội thoại được giữ khi chuyển trang. Phím tắt `Ctrl + J`.

## Khả năng tiếp cận

- Mọi phần tử tương tác phải có `:hover`, `:focus-visible`, `:active`, `:disabled`.
- Vùng chạm tối thiểu 44px trên thiết bị cảm ứng.
- Mọi hoạt ảnh phải tắt được qua `@media (prefers-reduced-motion: reduce)`.
- Chuỗi hiển thị 100% tiếng Việt, giọng hành chính.
