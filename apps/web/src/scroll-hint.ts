/** Gợi ý "còn nội dung ở phía này" cho các vùng cuộn.
 *
 *  Bảng trong hệ thống này thường rộng hơn khung chứa, và cột thao tác nằm ở mép
 *  phải. Không có dấu hiệu nào thì người dùng không biết là cuộn ngang được —
 *  cột đó coi như không tồn tại. Mô-đun này gắn thuộc tính `data-edge` cho mỗi
 *  vùng cuộn để CSS vẽ một dải bóng mảnh ở đúng phía đang bị khuất.
 *
 *  Vì sao làm ở tầng toàn cục thay vì trong từng trang: mọi bảng đều dùng chung
 *  lớp `.table-wrap`, nên một chỗ lo là đủ; trang nào thêm bảng mới cũng tự có,
 *  không ai phải nhớ gắn thêm gì.
 *
 *  Chi phí: một trình quan sát thay đổi DOM đã gộp nhịp, một trình quan sát kích
 *  thước, và một trình nghe sự kiện cuộn ở pha bắt (sự kiện cuộn không nổi bọt).
 *  Không có vòng lặp theo khung hình nào.
 */

const SELECTOR = '.table-wrap, .scroll-x';
const TOLERANCE = 2; // Bỏ qua sai số làm tròn của trình duyệt.

function describeEdges(element: HTMLElement) {
  const edges: string[] = [];
  if (element.scrollLeft > TOLERANCE) edges.push('left');
  if (element.scrollLeft + element.clientWidth < element.scrollWidth - TOLERANCE) edges.push('right');
  if (element.scrollTop > TOLERANCE) edges.push('top');
  return edges.join(' ');
}

function refresh(element: HTMLElement) {
  const value = describeEdges(element);
  if (value) element.setAttribute('data-edge', value);
  else element.removeAttribute('data-edge');
}

export function startScrollHints() {
  if (typeof document === 'undefined') return;

  const sizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(entries => {
          entries.forEach(entry => refresh(entry.target as HTMLElement));
        })
      : null;

  const tracked = new WeakSet<HTMLElement>();

  const scan = () => {
    document.querySelectorAll<HTMLElement>(SELECTOR).forEach(element => {
      refresh(element);
      if (tracked.has(element)) return;
      tracked.add(element);
      // Theo dõi cả khung chứa lẫn nội dung: bảng đổi số cột thì mép khuất cũng đổi.
      sizeObserver?.observe(element);
      if (element.firstElementChild) sizeObserver?.observe(element.firstElementChild);
    });
  };

  // Cuộn không nổi bọt, nên phải nghe ở pha bắt để bắt được mọi vùng cuộn con.
  document.addEventListener(
    'scroll',
    event => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches(SELECTOR)) refresh(target);
    },
    { capture: true, passive: true },
  );

  /* React thay nội dung liên tục nên phải gộp các đợt thay đổi lại.
   *
   *  Dùng bộ đếm giờ chứ KHÔNG dùng `requestAnimationFrame`: rAF chỉ chạy khi trang
   *  thật sự được vẽ, nên trong thẻ nền hoặc cửa sổ bị che, bảng sẽ không bao giờ
   *  được đo và mất hẳn dấu hiệu cuộn. Bộ đếm giờ vẫn chạy trong mọi trường hợp. */
  let queued = 0;
  const schedule = () => {
    if (queued) return;
    queued = window.setTimeout(() => {
      queued = 0;
      scan();
    }, 32);
  };

  const observer = new MutationObserver(schedule);
  window.addEventListener('resize', schedule, { passive: true });

  const start = () => {
    scan();
    observer.observe(document.body, { childList: true, subtree: true });
    // Quét lại vài nhịp đầu: dữ liệu về sau khi gọi API, bảng đổi số cột, phông chữ
    // tải xong đều làm bề rộng thay đổi.
    [200, 800, 2000].forEach(delay => window.setTimeout(scan, delay));
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
