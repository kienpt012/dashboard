export type WidgetType = 'clock' | 'weather' | 'notes' | 'tasks' | 'focus' | 'calendar' | 'ioc' | 'work' | 'api' | 'embed' | 'calculator' | 'countdown';
export type WorkspaceWidget = { id: string; type: WidgetType; title: string; x: number; y: number; w: number; h: number; settings: Record<string, unknown> };
export type WorkspaceSpace = { id: string; name: string; widgets: WorkspaceWidget[] };
export type Shortcut = { id: string; title: string; url: string; icon: string; color: string; hotkey?: string };
export type WorkspaceConfig = {
  schemaVersion: 1;
  appearance: { wallpaper: string; customWallpaper: string; accent: string; blur: number; overlay: number };
  activeSpace: string;
  spaces: WorkspaceSpace[];
  shortcuts: Shortcut[];
};
export const uid = () => crypto.randomUUID();
export const WIDGETS: { type: WidgetType; title: string; description: string; icon: string; category: string; w: number; h: number; settings: Record<string, unknown> }[] = [
  { type: 'ioc', title: 'Nhịp điều hành', description: 'Bức tranh chỉ tiêu IOC, cập nhật từ dữ liệu thực.', icon: '◈', category: 'Dữ liệu', w: 6, h: 6, settings: {} },
  { type: 'work', title: 'Công việc IOC', description: 'Việc được giao, báo cáo và những hạn cần chú ý.', icon: '▤', category: 'Dữ liệu', w: 6, h: 6, settings: {} },
  { type: 'api', title: 'Biểu đồ từ API', description: 'Kết nối JSON công khai. Biểu đồ, bảng hoặc thẻ số liệu.', icon: '⌁', category: 'Kết nối', w: 6, h: 6, settings: { display: 'line', interval: 300 } },
  { type: 'tasks', title: 'Việc hôm nay', description: 'Danh sách việc riêng, đánh dấu hoàn thành từng bước.', icon: '☑', category: 'Năng suất', w: 3, h: 6, settings: { items: [] } },
  { type: 'notes', title: 'Góc ghi chú', description: 'Lưu ý tưởng, nội dung cuộc họp và những điều cần nhớ.', icon: '✎', category: 'Năng suất', w: 4, h: 6, settings: { text: '' } },
  { type: 'focus', title: 'Một khoảng tập trung', description: 'Đồng hồ Pomodoro cho công việc và thời gian nghỉ.', icon: '◷', category: 'Năng suất', w: 3, h: 6, settings: { minutes: 25, breakMinutes: 5 } },
  { type: 'weather', title: 'Thời tiết', description: 'Nhiệt độ và thời tiết trực tiếp tại nơi bạn chọn.', icon: '☀', category: 'Hằng ngày', w: 4, h: 6, settings: { city: 'Lái Thiêu', latitude: 10.905, longitude: 106.699 } },
  { type: 'clock', title: 'Đồng hồ thế giới', description: 'Thời gian theo múi giờ. Luôn đúng nhịp làm việc.', icon: '◴', category: 'Hằng ngày', w: 4, h: 4, settings: { timezone: 'Asia/Ho_Chi_Minh' } },
  { type: 'calendar', title: 'Lịch tháng', description: 'Lướt lịch, xem hôm nay và chuẩn bị kế hoạch mới.', icon: '▦', category: 'Hằng ngày', w: 4, h: 6, settings: {} },
  { type: 'countdown', title: 'Cột mốc sắp tới', description: 'Đếm ngược đến ngày quan trọng của riêng bạn.', icon: '⚑', category: 'Hằng ngày', w: 3, h: 4, settings: {} },
  { type: 'embed', title: 'Cửa sổ website', description: 'Đặt một trang HTTPS hỗ trợ nhúng vào bàn làm việc.', icon: '↗', category: 'Kết nối', w: 6, h: 7, settings: {} },
  { type: 'calculator', title: 'Máy tính', description: 'Tính nhanh ngay trong không gian làm việc.', icon: '⊞', category: 'Năng suất', w: 3, h: 6, settings: {} },
];
export function makeWidget(type: WidgetType, x = 0, y = 0): WorkspaceWidget {
  const entry = WIDGETS.find(item => item.type === type)!;
  return { id: uid(), type, title: entry.title, x, y, w: entry.w, h: entry.h, settings: structuredClone(entry.settings) };
}
export function templateWidgets(template: string): WorkspaceWidget[] {
  if (template === 'focus') return [makeWidget('focus', 0, 0), { ...makeWidget('tasks', 3, 0), w: 5 }, { ...makeWidget('notes', 8, 0), w: 4, h: 6 }, makeWidget('clock', 0, 6), makeWidget('calendar', 4, 6)];
  if (template === 'data') return [makeWidget('ioc', 0, 0), makeWidget('api', 6, 0), makeWidget('work', 0, 6), makeWidget('weather', 6, 6)];
  return [makeWidget('ioc', 0, 0), makeWidget('tasks', 6, 0), makeWidget('focus', 9, 0), makeWidget('notes', 0, 6), makeWidget('weather', 4, 6), makeWidget('calendar', 8, 6)];
}
export function defaultConfig(): WorkspaceConfig {
  return {
    schemaVersion: 1,
    appearance: { wallpaper: 'aurora', customWallpaper: '', accent: '#7ce6c5', blur: 16, overlay: 25 },
    activeSpace: 'home',
    spaces: [{ id: 'home', name: 'Tổng quan', widgets: templateWidgets('default') }, { id: 'focus', name: 'Tập trung', widgets: templateWidgets('focus') }],
    shortcuts: [
      { id: 'ops', title: 'Điều hành', url: '/admin/dieu-hanh', icon: '◈', color: '#63dcc0', hotkey: '1' },
      { id: 'work', title: 'Việc của tôi', url: '/admin/viec-cua-toi', icon: '☑', color: '#9bbcff', hotkey: '2' },
      { id: 'docs', title: 'Văn bản', url: '/admin/documents', icon: '▤', color: '#eec68e', hotkey: '3' },
      { id: 'reports', title: 'Báo cáo', url: '/admin/reports', icon: '▥', color: '#bca4ff', hotkey: '4' },
      { id: 'data', title: 'Kho dữ liệu', url: '/admin/kho-du-lieu', icon: '▦', color: '#99d8e8', hotkey: '5' },
    ],
  };
}
export function safeShortcut(raw: string): boolean {
  if (/^\/(?!\/)[^\\\s]*$/.test(raw)) return true;
  try { const url = new URL(raw); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
export function validConfig(value: unknown): value is WorkspaceConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const c = value as WorkspaceConfig;
  const object = (item: unknown) => !!item && typeof item === 'object' && !Array.isArray(item);
  const text = (s: unknown, max: number, allowEmpty = false) => typeof s === 'string' && s.length <= max && (allowEmpty || s.trim().length > 0);
  const id = (s: unknown) => typeof s === 'string' && s.length > 0 && s.length <= 100;
  const ids = (items: { id: string }[]) => items.every(item => object(item) && id(item.id)) && new Set(items.map(item => item.id)).size === items.length;
  if (c.schemaVersion !== 1 || !object(c.appearance) || !Array.isArray(c.spaces) || !c.spaces.length || c.spaces.length > 8 || !Array.isArray(c.shortcuts) || c.shortcuts.length > 80) return false;
  const a = c.appearance;
  if (!text(a.wallpaper, 100) || !text(a.customWallpaper, 1_500_000, true) || !/^#[0-9a-f]{6}$/i.test(a.accent) || !Number.isFinite(a.blur) || a.blur < 0 || a.blur > 40 || !Number.isFinite(a.overlay) || a.overlay < 0 || a.overlay > 90) return false;
  if (a.customWallpaper && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a.customWallpaper)) return false;
  return ids(c.spaces) && c.spaces.some(s => s.id === c.activeSpace) && c.spaces.every(s => id(s.id) && text(s.name, 80) && Array.isArray(s.widgets) && s.widgets.length <= 40 && ids(s.widgets) && s.widgets.every(w => id(w.id) && WIDGETS.some(e => e.type === w.type) && text(w.title, 120) && [w.x,w.y,w.w,w.h].every(Number.isInteger) && w.x >= 0 && w.x < 12 && w.y >= 0 && w.y <= 1000 && w.w >= 1 && w.w <= 12 && w.x + w.w <= 12 && w.h >= 2 && w.h <= 24 && !!w.settings && typeof w.settings === 'object' && !Array.isArray(w.settings))) && ids(c.shortcuts) && c.shortcuts.every(s => id(s.id) && text(s.title, 80) && text(s.url, 2048) && safeShortcut(s.url) && text(s.icon, 40) && /^#[0-9a-f]{6}$/i.test(s.color) && (!s.hotkey || /^[1-9]$/.test(s.hotkey)));
}
