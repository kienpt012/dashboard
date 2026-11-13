import { assertWorkspaceConfig } from '../../../../api/src/workspace-schema';
export type WidgetType = 'clock' | 'weather' | 'notes' | 'tasks' | 'focus' | 'calendar' | 'ioc' | 'work' | 'api' | 'embed' | 'calculator' | 'countdown' | 'my-targets' | 'target-chart' | 'alerts' | 'approvals' | 'departments' | 'feedback' | 'documents' | 'activity' | 'sent-notes' | 'agenda' | 'pins' | 'proposals';
export type WorkspaceWidget = { id: string; type: WidgetType; title: string; x: number; y: number; w: number; h: number; settings: Record<string, unknown> };
export type WorkspaceSpace = { id: string; name: string; widgets: WorkspaceWidget[] };
export type Shortcut = { id: string; title: string; url: string; icon: string; color: string; hotkey?: string };
export type WorkspaceConfig = {
  schemaVersion: 1 | 2;
  appearance: { wallpaper: string; customWallpaper: string; accent: string; blur: number; overlay: number; daylight?: boolean; dock?: 'bottom' | 'left' | 'hidden' };
  activeSpace: string;
  spaces: WorkspaceSpace[];
  shortcuts: Shortcut[];
};
export const uid = () => crypto.randomUUID();
export const WIDGETS: { type: WidgetType; title: string; description: string; icon: string; category: string; w: number; h: number; settings: Record<string, unknown> }[] = [
  { type: 'ioc', title: 'Tổng quan điều hành', description: 'Bức tranh chỉ tiêu IOC, cập nhật từ dữ liệu thực.', icon: '◈', category: 'Dữ liệu', w: 6, h: 6, settings: {} },
  { type: 'work', title: 'Công việc IOC', description: 'Việc được giao, báo cáo và những hạn cần chú ý.', icon: '▤', category: 'Dữ liệu', w: 6, h: 6, settings: {} },
  { type: 'api', title: 'Biểu đồ từ API', description: 'Kết nối JSON công khai. Biểu đồ, bảng hoặc thẻ số liệu.', icon: '⌁', category: 'Kết nối', w: 6, h: 6, settings: { display: 'line', interval: 300 } },
  { type: 'tasks', title: 'Việc hôm nay', description: 'Danh sách việc riêng, đánh dấu hoàn thành từng bước.', icon: '☑', category: 'Năng suất', w: 3, h: 6, settings: { items: [] } },
  { type: 'notes', title: 'Góc ghi chú', description: 'Lưu ý tưởng, nội dung cuộc họp và những điều cần nhớ.', icon: '✎', category: 'Năng suất', w: 4, h: 6, settings: { text: '' } },
  { type: 'focus', title: 'Đồng hồ tập trung', description: 'Đồng hồ Pomodoro cho công việc và thời gian nghỉ.', icon: '◷', category: 'Năng suất', w: 3, h: 6, settings: { minutes: 25, breakMinutes: 5 } },
  { type: 'weather', title: 'Thời tiết', description: 'Nhiệt độ và thời tiết trực tiếp tại nơi bạn chọn.', icon: '☀', category: 'Hằng ngày', w: 4, h: 6, settings: { city: 'Lái Thiêu', latitude: 10.905, longitude: 106.699 } },
  { type: 'clock', title: 'Đồng hồ thế giới', description: 'Thời gian theo múi giờ. Luôn đúng nhịp làm việc.', icon: '◴', category: 'Hằng ngày', w: 4, h: 4, settings: { timezone: 'Asia/Ho_Chi_Minh' } },
  { type: 'calendar', title: 'Lịch tháng', description: 'Lướt lịch, xem hôm nay và chuẩn bị kế hoạch mới.', icon: '▦', category: 'Hằng ngày', w: 4, h: 6, settings: {} },
  { type: 'countdown', title: 'Cột mốc sắp tới', description: 'Đếm ngược đến ngày quan trọng của riêng bạn.', icon: '⚑', category: 'Hằng ngày', w: 3, h: 4, settings: {} },
  { type: 'embed', title: 'Cửa sổ website', description: 'Đặt một trang HTTPS hỗ trợ nhúng vào bàn làm việc.', icon: '↗', category: 'Kết nối', w: 6, h: 7, settings: {} },
  { type: 'calculator', title: 'Máy tính', description: 'Tính nhanh ngay trong không gian làm việc.', icon: '⊞', category: 'Năng suất', w: 3, h: 6, settings: {} },
];
const extraWidgets: [WidgetType, string, string][] = [
  ['my-targets', 'Chỉ tiêu của tôi', 'Chỉ tiêu được giao cho tài khoản.'],
  ['target-chart', 'Biểu đồ chỉ tiêu', 'Số liệu đã duyệt theo kỳ và mức kế hoạch.'],
  ['alerts', 'Cảnh báo', 'Chỉ tiêu cần chú ý theo quyền truy cập.'],
  ['approvals', 'Chờ duyệt', 'Báo cáo đang chờ duyệt.'],
  ['departments', 'Tiến độ theo phòng', 'Tiến độ và số chỉ tiêu của từng phòng.'],
  ['feedback', 'Phản ánh', 'Số phản ánh đang mở và quá hạn.'],
  ['documents', 'Văn bản mới', 'Văn bản mới trong kho dùng chung.'],
  ['activity', 'Hoạt động gần đây', 'Các thao tác trên chỉ tiêu theo thời gian.'],
  ['sent-notes', 'Note đã dán', 'Theo dõi người nhận đã xem và đã xong.'],
  ['agenda', 'Lịch việc', 'Hạn báo cáo, nhiệm vụ và việc riêng.'],
  ['pins', 'Đã ghim', 'Chỉ tiêu và văn bản đã ghim lên bàn.'],
  ['proposals', 'Đề xuất chỉ tiêu', 'Đề xuất đang chờ xử lý.'],
];
WIDGETS.push(...extraWidgets.map(([type, title, description]) => ({ type, title, description, icon: type, category: 'Dữ liệu', w: 6, h: 6, settings: {} })));
export function makeWidget(type: WidgetType, x = 0, y = 0): WorkspaceWidget {
  const entry = WIDGETS.find(item => item.type === type)!;
  return { id: uid(), type, title: entry.title, x, y, w: entry.w, h: entry.h, settings: structuredClone(entry.settings) };
}
export function templateWidgets(template: string): WorkspaceWidget[] {
  const roles: Record<string, WidgetType[]> = {
    leader: ['ioc', 'departments', 'alerts', 'approvals', 'sent-notes'],
    admin: ['ioc', 'departments', 'alerts', 'approvals', 'sent-notes'],
    manager: ['work', 'approvals', 'my-targets', 'sent-notes'],
    staff: ['agenda', 'my-targets', 'notes', 'tasks'],
    clerk: ['documents', 'proposals', 'agenda'],
    viewer: ['ioc'],
  };
  if (roles[template]) return roles[template].map((type, index) => ({ ...makeWidget(type, (index % 2) * 6, Math.floor(index / 2) * 6), w: 6, h: 6 }));
  if (template === 'focus') return [makeWidget('focus', 0, 0), { ...makeWidget('tasks', 3, 0), w: 5 }, { ...makeWidget('notes', 8, 0), w: 4, h: 6 }, makeWidget('clock', 0, 6), makeWidget('calendar', 4, 6)];
  if (template === 'data') return [makeWidget('ioc', 0, 0), makeWidget('api', 6, 0), makeWidget('work', 0, 6), makeWidget('weather', 6, 6)];
  return [makeWidget('ioc', 0, 0), makeWidget('tasks', 6, 0), makeWidget('focus', 9, 0), makeWidget('notes', 0, 6), makeWidget('weather', 4, 6), makeWidget('calendar', 8, 6)];
}
export function defaultConfig(role = 'STAFF'): WorkspaceConfig {
  return {
    schemaVersion: 2,
    appearance: { wallpaper: 'aurora', customWallpaper: '', accent: '#7ce6c5', blur: 16, overlay: 25, dock: 'bottom' },
    activeSpace: 'home',
    spaces: [{ id: 'home', name: 'Tổng quan', widgets: templateWidgets(role.toLowerCase()) }, { id: 'focus', name: 'Tập trung', widgets: templateWidgets('focus') }],
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
  try { assertWorkspaceConfig(value); return true; } catch { return false; }
}

/** V1 layouts, notes and shortcuts remain intact when opening a v2 workspace. */
export function migrateConfig(config: WorkspaceConfig): WorkspaceConfig {
  return { ...config, schemaVersion: 2, appearance: { ...config.appearance, dock: config.appearance.dock ?? 'bottom' } };
}
