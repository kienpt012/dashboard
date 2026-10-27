import { Role } from '@prisma/client';

// Sổ widget của bàn làm việc số: nguồn sự thật duy nhất. Trình duyệt dựng ô cài đặt từ các trường khai báo ở đây,
// máy chủ dùng chính các trường đó để kiểm tra cài đặt gửi lên (validate.ts). Thêm widget mới = một khai báo + một
// thành phần vẽ phía trình duyệt.

export type DeskBreakpoint = 'desktop' | 'tablet' | 'mobile';
export const DESK_BREAKPOINTS: DeskBreakpoint[] = ['desktop', 'tablet', 'mobile'];
export const DESK_COLUMNS: Record<DeskBreakpoint, number> = { desktop: 12, tablet: 8, mobile: 4 };

export type FieldOption = { value: string; label: string };
export type ShowIf = { key: string; equals: string | number | boolean };

type FieldBase = { key: string; label: string; help?: string; showIf?: ShowIf };

export type SettingField =
  | (FieldBase & { type: 'text'; max: number; placeholder?: string; default?: string })
  | (FieldBase & { type: 'textarea'; max: number; default?: string })
  | (FieldBase & { type: 'number'; min: number; max: number; step?: number; unit?: string; default: number })
  | (FieldBase & { type: 'boolean'; default: boolean })
  | (FieldBase & { type: 'select'; options: FieldOption[]; default: string })
  | (FieldBase & { type: 'multiselect'; options: FieldOption[]; max?: number; default: string[] })
  | (FieldBase & { type: 'color'; default: string | null })
  | (FieldBase & { type: 'department' })
  | (FieldBase & { type: 'target' })
  | (FieldBase & { type: 'targets'; max: number })
  | (FieldBase & { type: 'date' })
  | (FieldBase & { type: 'datetime' })
  | (FieldBase & { type: 'url' })
  | (FieldBase & { type: 'asset' })
  | (FieldBase & { type: 'links'; max: number })
  | (FieldBase & { type: 'list'; max: number; itemMax: number; default?: string[] })
  | (FieldBase & { type: 'searchProviders' })
  | (FieldBase & { type: 'timezones'; max: number });

export type WidgetCategory = 'overview' | 'department' | 'targets' | 'mine' | 'personal' | 'tools' | 'content';

export const WIDGET_CATEGORIES: { key: WidgetCategory; label: string }[] = [
  { key: 'overview', label: 'Tổng quan' },
  { key: 'department', label: 'Dữ liệu phòng' },
  { key: 'targets', label: 'Chỉ tiêu' },
  { key: 'mine', label: 'Việc của tôi' },
  { key: 'personal', label: 'Cá nhân' },
  { key: 'tools', label: 'Lối tắt và tra cứu' },
  { key: 'content', label: 'Nội dung' },
];

export type WidgetSize = { w: number; h: number; minW: number; minH: number };

export interface WidgetDefinition {
  type: string;
  category: WidgetCategory;
  title: string;
  description: string;
  icon: string;
  /** Vai trò được dùng; bỏ trống là mọi vai trò. */
  roles?: Role[];
  /** Widget số liệu của một phòng: có ô chọn phòng (mặc định theo phòng đang xem). */
  data: boolean;
  /** Chu kỳ tự làm mới mặc định (giây); bỏ trống là widget không tự làm mới. */
  refresh?: number;
  /** Đặt được nhiều widget cùng loại trong một không gian. */
  multiple: boolean;
  size: Record<DeskBreakpoint, WidgetSize>;
  fields: SettingField[];
}

const size = (desktop: [number, number, number, number], tablet: [number, number, number, number], mobile: [number, number, number, number]) => {
  const toSize = ([w, h, minW, minH]: [number, number, number, number]): WidgetSize => ({ w, h, minW, minH });
  return { desktop: toSize(desktop), tablet: toSize(tablet), mobile: toSize(mobile) };
};

export const ALERT_KIND_OPTIONS: FieldOption[] = [
  { value: 'OVERDUE', label: 'Quá hạn' },
  { value: 'AT_RISK', label: 'Nguy cơ không đạt' },
  { value: 'MISSING_REPORT', label: 'Thiếu báo cáo' },
  { value: 'EXPLANATION_OVERDUE', label: 'Giải trình quá hạn' },
  { value: 'STALLED', label: 'Bị treo' },
  { value: 'UNASSIGNED', label: 'Chưa giao' },
  { value: 'PROPOSAL_PENDING', label: 'Đề xuất chờ duyệt' },
  { value: 'REPORT_PENDING', label: 'Báo cáo chờ duyệt' },
];

const SEVERITY_OPTIONS: FieldOption[] = [
  { value: 'info', label: 'Mọi mức' },
  { value: 'warning', label: 'Cần chú ý trở lên' },
  { value: 'critical', label: 'Chỉ nghiêm trọng' },
];

const maxItems = (min: number, max: number, value: number): SettingField => ({ key: 'maxItems', label: 'Số dòng tối đa', type: 'number', min, max, default: value });

export const WIDGETS: WidgetDefinition[] = [
  {
    type: 'hero', category: 'overview', title: 'Lời chào', icon: 'smile', data: false, refresh: 120, multiple: false,
    description: 'Chào theo buổi, ngày dương và âm lịch, ngày lễ, các con số cần chú ý hôm nay.',
    size: size([12, 3, 6, 2], [8, 3, 6, 2], [4, 4, 4, 3]),
    fields: [{ key: 'showStats', label: 'Hiện các con số cần chú ý', type: 'boolean', default: true }],
  },
  {
    type: 'dept.status', category: 'department', title: 'Tình trạng chỉ tiêu', icon: 'pie', data: true, refresh: 60, multiple: true,
    description: 'Vòng tròn năm tình trạng và tiến độ chung của phòng; bấm để mở danh mục đã lọc.',
    size: size([4, 7, 3, 5], [4, 7, 3, 5], [4, 7, 4, 5]),
    fields: [],
  },
  {
    type: 'dept.workload', category: 'department', title: 'Việc cần xử lý', icon: 'tasks', data: true, refresh: 60, multiple: true,
    description: 'Thiếu báo cáo, chưa giao, chờ duyệt, giải trình, bị treo, phản ánh quá hạn.',
    size: size([8, 4, 4, 3], [8, 5, 4, 3], [4, 7, 4, 4]),
    fields: [],
  },
  {
    type: 'dept.alerts', category: 'department', title: 'Cảnh báo', icon: 'alert', data: true, refresh: 60, multiple: true,
    description: 'Danh sách cảnh báo của phòng — đặt ở đâu tuỳ ý, chọn loại và mức độ muốn thấy.',
    size: size([6, 7, 3, 4], [4, 7, 3, 4], [4, 7, 4, 4]),
    fields: [
      { key: 'kinds', label: 'Loại cảnh báo', type: 'multiselect', options: ALERT_KIND_OPTIONS, default: [], help: 'Để trống: mọi loại.' },
      { key: 'minSeverity', label: 'Mức độ', type: 'select', options: SEVERITY_OPTIONS, default: 'info' },
      maxItems(3, 40, 12),
      { key: 'compact', label: 'Gọn (một dòng mỗi cảnh báo)', type: 'boolean', default: false },
    ],
  },
  {
    type: 'dept.ticker', category: 'department', title: 'Dải cảnh báo', icon: 'notification', data: true, refresh: 60, multiple: true,
    description: 'Chữ chạy cho cảnh báo nghiêm trọng, đặt ở mép bàn làm việc.',
    size: size([12, 1, 4, 1], [8, 1, 4, 1], [4, 1, 4, 1]),
    fields: [
      { key: 'minSeverity', label: 'Mức độ', type: 'select', options: SEVERITY_OPTIONS, default: 'critical' },
      {
        key: 'speed', label: 'Tốc độ chạy', type: 'select', default: 'normal',
        options: [{ value: 'slow', label: 'Chậm' }, { value: 'normal', label: 'Vừa' }, { value: 'fast', label: 'Nhanh' }],
      },
    ],
  },
  {
    type: 'dept.stalled', category: 'department', title: 'Việc bị treo', icon: 'stop', data: true, refresh: 60, multiple: true,
    description: 'Chỉ tiêu bị chuyển qua lại hoặc lâu chưa giao người, kèm lý do.',
    size: size([4, 6, 3, 3], [4, 6, 3, 3], [4, 6, 4, 3]),
    fields: [],
  },
  {
    type: 'dept.recent', category: 'department', title: 'Hoạt động gần đây', icon: 'history', data: true, refresh: 60, multiple: true,
    description: 'Ai vừa làm gì trong phòng, lúc nào.',
    size: size([4, 8, 3, 4], [4, 8, 3, 4], [4, 8, 4, 4]),
    fields: [maxItems(5, 25, 10)],
  },
  {
    type: 'dept.deadlines', category: 'department', title: 'Hạn sắp tới', icon: 'field-time', data: true, refresh: 60, multiple: true,
    description: 'Hạn chỉ tiêu, hạn báo cáo kỳ, hạn giải trình, giờ tự thông qua đề xuất.',
    size: size([4, 7, 3, 4], [4, 7, 3, 4], [4, 7, 4, 4]),
    fields: [{ key: 'days', label: 'Xem trước', type: 'number', min: 7, max: 90, unit: 'ngày', default: 30 }],
  },
  {
    type: 'dept.frameworks', category: 'department', title: 'Bộ chỉ tiêu', icon: 'appstore', data: true, refresh: 60, multiple: true,
    description: 'Tiến độ từng bộ chỉ tiêu có chỉ tiêu của phòng.',
    size: size([6, 6, 4, 3], [8, 6, 4, 3], [4, 7, 4, 4]),
    fields: [],
  },
  {
    type: 'dept.team', category: 'department', title: 'Nhân sự trong phòng', icon: 'team', data: true, refresh: 60, multiple: true,
    roles: [Role.ADMIN, Role.LEADER, Role.MANAGER],
    description: 'Ai phụ trách bao nhiêu chỉ tiêu, thiếu báo cáo, quá hạn, lần đăng nhập gần nhất.',
    size: size([6, 7, 4, 4], [8, 7, 4, 4], [4, 8, 4, 4]),
    fields: [],
  },
  {
    type: 'dept.feedback', category: 'department', title: 'Phản ánh', icon: 'message', data: true, refresh: 60, multiple: true,
    description: 'Số phản ánh theo trạng thái và phản ánh mới nhất của phòng.',
    size: size([4, 6, 3, 4], [4, 6, 3, 4], [4, 7, 4, 4]),
    fields: [],
  },
  {
    type: 'target.kpi', category: 'targets', title: 'Thẻ chỉ tiêu', icon: 'aim', data: true, refresh: 60, multiple: true,
    description: 'Một chỉ tiêu: số lớn, kế hoạch, vòng tiến độ, tình trạng, đường xu hướng.',
    size: size([3, 4, 2, 3], [4, 4, 2, 3], [2, 4, 2, 3]),
    fields: [
      { key: 'targetId', label: 'Chỉ tiêu', type: 'target' },
      { key: 'showTrend', label: 'Hiện đường xu hướng', type: 'boolean', default: true },
    ],
  },
  {
    type: 'target.watchlist', category: 'targets', title: 'Chỉ tiêu theo dõi', icon: 'eye', data: true, refresh: 60, multiple: true,
    description: 'Danh sách chỉ tiêu chọn tay hoặc tự động: của tôi, nguy cơ cao nhất, quá hạn.',
    size: size([4, 7, 3, 4], [4, 7, 3, 4], [4, 7, 4, 4]),
    fields: [
      {
        key: 'mode', label: 'Lấy chỉ tiêu', type: 'select', default: 'mine',
        options: [
          { value: 'manual', label: 'Chọn tay' },
          { value: 'mine', label: 'Tôi phụ trách' },
          { value: 'risk', label: 'Tiến độ thấp nhất' },
          { value: 'overdue', label: 'Quá hạn' },
        ],
      },
      { key: 'targetIds', label: 'Chỉ tiêu', type: 'targets', max: 12, showIf: { key: 'mode', equals: 'manual' } },
      maxItems(3, 20, 8),
    ],
  },
  {
    type: 'target.chart', category: 'targets', title: 'Biểu đồ chỉ tiêu', icon: 'line-chart', data: true, refresh: 300, multiple: true,
    description: 'Số liệu theo kỳ của một đến sáu chỉ tiêu, có vạch kế hoạch.',
    size: size([6, 7, 4, 4], [8, 7, 4, 4], [4, 7, 4, 4]),
    fields: [
      { key: 'targetIds', label: 'Chỉ tiêu', type: 'targets', max: 6 },
      {
        key: 'chartType', label: 'Kiểu biểu đồ', type: 'select', default: 'line',
        options: [{ value: 'line', label: 'Đường' }, { value: 'bar', label: 'Cột' }, { value: 'area', label: 'Vùng' }],
      },
      { key: 'showPlan', label: 'Vạch kế hoạch', type: 'boolean', default: true },
    ],
  },
  {
    type: 'my.work', category: 'mine', title: 'Việc của tôi', icon: 'inbox', data: false, refresh: 60, multiple: true,
    description: 'Cần báo cáo, chờ tôi duyệt, giải trình, đề xuất — đếm và danh sách gọn.',
    size: size([4, 7, 3, 4], [4, 7, 3, 4], [4, 7, 4, 4]),
    fields: [
      {
        key: 'sections', label: 'Mục hiện', type: 'multiselect', default: [],
        help: 'Để trống: mọi mục có việc.',
        options: [
          { value: 'needReport', label: 'Cần báo cáo' },
          { value: 'toReview', label: 'Chờ tôi duyệt' },
          { value: 'explanations', label: 'Giải trình' },
          { value: 'proposals', label: 'Đề xuất' },
        ],
      },
    ],
  },
  {
    type: 'my.notifications', category: 'mine', title: 'Thông báo', icon: 'bell', data: false, refresh: 60, multiple: true,
    description: 'Thông báo mới nhất, đánh dấu đã đọc ngay tại chỗ.',
    size: size([4, 6, 3, 3], [4, 6, 3, 3], [4, 6, 4, 3]),
    fields: [maxItems(3, 20, 8)],
  },
  {
    type: 'docs.recent', category: 'mine', title: 'Văn bản mới', icon: 'file-text', data: true, refresh: 300, multiple: true,
    description: 'Văn bản vừa tải lên hoặc vừa trích xuất của phòng và văn bản dùng chung.',
    size: size([4, 6, 3, 3], [4, 6, 3, 3], [4, 6, 4, 3]),
    fields: [maxItems(3, 8, 6)],
  },
  {
    type: 'clock', category: 'personal', title: 'Đồng hồ', icon: 'clock', data: false, multiple: true,
    description: 'Đồng hồ kim hoặc số, ngày âm lịch, thêm giờ nơi khác.',
    size: size([3, 4, 2, 3], [3, 4, 2, 3], [2, 4, 2, 3]),
    fields: [
      { key: 'style', label: 'Kiểu', type: 'select', default: 'analog', options: [{ value: 'analog', label: 'Kim' }, { value: 'digital', label: 'Số' }] },
      { key: 'seconds', label: 'Hiện giây', type: 'boolean', default: true },
      { key: 'showDate', label: 'Hiện ngày', type: 'boolean', default: true },
      { key: 'lunar', label: 'Ngày âm lịch', type: 'boolean', default: true },
      { key: 'timezones', label: 'Giờ nơi khác', type: 'timezones', max: 3 },
    ],
  },
  {
    type: 'calendar', category: 'personal', title: 'Lịch', icon: 'calendar', data: false, multiple: true,
    description: 'Lịch tháng kèm ngày âm, ngày lễ, hạn công việc và việc riêng.',
    size: size([4, 7, 3, 6], [4, 7, 3, 6], [4, 7, 4, 6]),
    fields: [
      { key: 'lunar', label: 'Ngày âm lịch', type: 'boolean', default: true },
      { key: 'holidays', label: 'Ngày lễ', type: 'boolean', default: true },
      { key: 'deadlines', label: 'Chấm hạn công việc', type: 'boolean', default: true },
    ],
  },
  {
    type: 'notepad', category: 'personal', title: 'Sổ ghi chú', icon: 'edit', data: false, multiple: true,
    description: 'Ghi nhanh, định dạng gọn kiểu Markdown, tự lưu.',
    size: size([4, 6, 2, 3], [4, 6, 2, 3], [4, 6, 2, 3]),
    fields: [],
  },
  {
    type: 'todo', category: 'personal', title: 'Việc riêng', icon: 'check-square', data: false, multiple: true,
    description: 'Danh sách việc của riêng bạn, có hạn và nhắc giờ.',
    size: size([4, 6, 3, 3], [4, 6, 3, 3], [4, 6, 4, 3]),
    fields: [{ key: 'showDone', label: 'Hiện việc đã xong', type: 'boolean', default: true }],
  },
  {
    type: 'countdown', category: 'personal', title: 'Đếm ngược', icon: 'hourglass', data: false, multiple: true,
    description: 'Đếm ngược tới một mốc: hạn nộp báo cáo năm, kỳ họp…',
    size: size([3, 3, 2, 2], [3, 3, 2, 2], [2, 3, 2, 2]),
    fields: [
      { key: 'label', label: 'Tên mốc', type: 'text', max: 60, default: 'Hạn nộp báo cáo' },
      { key: 'at', label: 'Thời điểm', type: 'datetime' },
      { key: 'doneText', label: 'Khi đã tới', type: 'text', max: 80, default: 'Đã tới hạn' },
    ],
  },
  {
    type: 'focus', category: 'personal', title: 'Tập trung', icon: 'fire', data: false, multiple: true,
    description: 'Hẹn giờ làm việc và nghỉ xen kẽ, có âm báo.',
    size: size([3, 4, 2, 3], [3, 4, 2, 3], [2, 4, 2, 3]),
    fields: [
      { key: 'workMin', label: 'Làm việc', type: 'number', min: 5, max: 90, unit: 'phút', default: 25 },
      { key: 'breakMin', label: 'Nghỉ', type: 'number', min: 1, max: 30, unit: 'phút', default: 5 },
      { key: 'sound', label: 'Âm báo', type: 'boolean', default: true },
    ],
  },
  {
    type: 'launcher', category: 'tools', title: 'Lối tắt', icon: 'rocket', data: false, multiple: true,
    description: 'Lưới biểu tượng tới chức năng, trang đã lọc, trang web ngoài, thư mục.',
    size: size([4, 4, 2, 2], [4, 4, 2, 2], [4, 4, 2, 2]),
    fields: [
      { key: 'items', label: 'Lối tắt', type: 'links', max: 24 },
      { key: 'size', label: 'Cỡ biểu tượng', type: 'select', default: 'm', options: [{ value: 's', label: 'Nhỏ' }, { value: 'm', label: 'Vừa' }, { value: 'l', label: 'Lớn' }] },
      { key: 'showLabels', label: 'Hiện tên', type: 'boolean', default: true },
    ],
  },
  {
    type: 'search', category: 'tools', title: 'Tìm kiếm', icon: 'search', data: false, multiple: true,
    description: 'Tìm trong hệ thống và trên các trang tra cứu: văn bản pháp luật, dịch vụ công…',
    size: size([6, 2, 3, 2], [8, 2, 3, 2], [4, 2, 4, 2]),
    fields: [
      { key: 'internal', label: 'Tìm trong hệ thống', type: 'boolean', default: true },
      { key: 'providerIds', label: 'Trang tra cứu', type: 'list', max: 12, itemMax: 40, help: 'Để trống: mọi trang tra cứu trong cài đặt bàn làm việc.' },
    ],
  },
  {
    type: 'jarvis', category: 'tools', title: 'Hỏi Jarvis', icon: 'jarvis', data: false, multiple: true,
    description: 'Hỏi nhanh, trả lời ngay trong widget; câu hỏi soạn sẵn bấm một lần.',
    size: size([4, 5, 3, 3], [4, 5, 3, 3], [4, 5, 4, 3]),
    fields: [
      {
        key: 'prompts', label: 'Câu hỏi soạn sẵn', type: 'list', max: 6, itemMax: 120,
        default: ['Tình hình phòng hôm nay thế nào?', 'Chỉ tiêu nào đang có nguy cơ?', 'Chỉ tiêu nào thiếu báo cáo?'],
      },
    ],
  },
  {
    type: 'text', category: 'content', title: 'Khối chữ', icon: 'font-size', data: false, multiple: true,
    description: 'Ghi chú cố định: số điện thoại, quy trình, lời nhắn — định dạng kiểu Markdown.',
    size: size([4, 3, 2, 1], [4, 3, 2, 1], [4, 3, 2, 1]),
    fields: [
      { key: 'body', label: 'Nội dung', type: 'textarea', max: 4000, default: '' },
      { key: 'align', label: 'Căn chữ', type: 'select', default: 'left', options: [{ value: 'left', label: 'Trái' }, { value: 'center', label: 'Giữa' }] },
    ],
  },
  {
    type: 'image', category: 'content', title: 'Ảnh', icon: 'picture', data: false, multiple: true,
    description: 'Ảnh đã tải lên: sơ đồ tổ chức, bản đồ, ảnh đơn vị — có chú thích và liên kết.',
    size: size([4, 5, 2, 2], [4, 5, 2, 2], [4, 5, 2, 2]),
    fields: [
      { key: 'assetId', label: 'Ảnh', type: 'asset' },
      { key: 'fit', label: 'Cách hiện', type: 'select', default: 'cover', options: [{ value: 'cover', label: 'Phủ kín' }, { value: 'contain', label: 'Vừa khung' }] },
      { key: 'caption', label: 'Chú thích', type: 'text', max: 120, default: '' },
      { key: 'link', label: 'Liên kết khi bấm', type: 'url' },
    ],
  },
];

const BY_TYPE = new Map(WIDGETS.map(widget => [widget.type, widget]));

export function widgetDefinition(type: string): WidgetDefinition | undefined {
  return BY_TYPE.get(type);
}

export function catalogFor(role: Role): WidgetDefinition[] {
  return WIDGETS.filter(widget => !widget.roles || widget.roles.includes(role));
}

/** Trường cài đặt đầy đủ: trường riêng + ô chọn phòng (widget số liệu phòng) + chu kỳ làm mới (widget tự làm mới). */
export function fieldsOf(def: WidgetDefinition): SettingField[] {
  const fields = [...def.fields];
  if (def.data) {
    fields.push({ key: 'departmentId', label: 'Phòng', type: 'department', help: 'Để trống: theo phòng đang xem ở đầu bàn làm việc.' });
  }
  if (def.data || def.refresh !== undefined) {
    fields.push({ key: 'refreshSeconds', label: 'Tự làm mới sau', type: 'number', min: 30, max: 3600, unit: 'giây', default: def.refresh ?? 60 });
  }
  return fields;
}
