// Mô hình trang công khai: thư viện khối, mẫu trang, thao tác bố cục. Ràng buộc khớp apps/api/src/public-dashboard.ts.
import { verticalCompactor } from 'react-grid-layout';
import type {
  PublicDashboardBreakpoint,
  PublicDashboardConfig,
  PublicDashboardData,
  PublicDashboardLayoutItem,
  PublicDashboardWidget,
  PublicDashboardWidgetSettings,
  PublicDashboardWidgetType,
} from './types';

export const BREAKPOINTS: PublicDashboardBreakpoint[] = ['desktop', 'tablet', 'mobile'];
export const COLS: Record<PublicDashboardBreakpoint, number> = { desktop: 12, tablet: 8, mobile: 4 };
export const BREAKPOINT_LABEL: Record<PublicDashboardBreakpoint, string> = { desktop: 'Máy tính', tablet: 'Máy tính bảng', mobile: 'Điện thoại' };
/** Chiều rộng khung xem trước khi chỉnh bố cục (px). */
export const CANVAS_WIDTH: Record<PublicDashboardBreakpoint, number | null> = { desktop: null, tablet: 820, mobile: 400 };
export const ROW_HEIGHT = 40;
export const GAP = 16;
/** Giới hạn của máy chủ: số khối 1–40, chiều cao khối tối đa 40 hàng. */
export const MAX_WIDGETS = 40;
export const MAX_H = 40;

/** Chiều cao tối thiểu theo loại khối (đơn vị hàng lưới) — máy chủ nâng khối thấp hơn lên mức này. */
export const MIN_H: Record<PublicDashboardWidgetType, Record<PublicDashboardBreakpoint, number>> = {
  overviewMetrics: { desktop: 5, tablet: 6, mobile: 7 },
  targetList: { desktop: 5, tablet: 5, mobile: 6 },
  departmentProgress: { desktop: 5, tablet: 4, mobile: 5 },
  feedbackList: { desktop: 4, tablet: 4, mobile: 5 },
  documentList: { desktop: 4, tablet: 4, mobile: 5 },
  richText: { desktop: 2, tablet: 2, mobile: 2 },
  customHtml: { desktop: 2, tablet: 2, mobile: 2 },
  cta: { desktop: 2, tablet: 2, mobile: 3 },
};

type Size = [w: number, h: number];

export const WIDGETS: Record<PublicDashboardWidgetType, { label: string; title: string; size: Record<PublicDashboardBreakpoint, Size>; minW: number }> = {
  overviewMetrics: { label: 'Số liệu tổng quan', title: 'Kết quả thực hiện chỉ tiêu', size: { desktop: [12, 5], tablet: [8, 6], mobile: [4, 7] }, minW: 6 },
  targetList: { label: 'Danh sách chỉ tiêu', title: 'Chỉ tiêu nổi bật', size: { desktop: [8, 8], tablet: [8, 8], mobile: [4, 12] }, minW: 4 },
  departmentProgress: { label: 'Tiến độ theo đơn vị', title: 'Tiến độ theo đơn vị', size: { desktop: [4, 8], tablet: [8, 6], mobile: [4, 8] }, minW: 3 },
  feedbackList: { label: 'Kết quả phản ánh', title: 'Kết quả phản ánh đã xử lý', size: { desktop: [6, 6], tablet: [4, 7], mobile: [4, 9] }, minW: 4 },
  documentList: { label: 'Văn bản công khai', title: 'Văn bản mới công bố', size: { desktop: [6, 6], tablet: [4, 7], mobile: [4, 9] }, minW: 4 },
  richText: { label: 'Đoạn văn bản', title: 'Thông tin', size: { desktop: [12, 3], tablet: [8, 4], mobile: [4, 6] }, minW: 3 },
  customHtml: { label: 'Khối HTML', title: 'Nội dung tùy biến', size: { desktop: [6, 4], tablet: [8, 4], mobile: [4, 5] }, minW: 2 },
  cta: { label: 'Nút điều hướng', title: 'Kênh phục vụ người dân', size: { desktop: [12, 3], tablet: [8, 3], mobile: [4, 5] }, minW: 4 },
};

export const WIDGET_TYPES = Object.keys(WIDGETS) as PublicDashboardWidgetType[];

export const METRICS: Record<string, { label: string; value: (data: PublicDashboardData) => number | null; suffix?: string }> = {
  departments: { label: 'Đơn vị có chỉ tiêu', value: data => data.overview.departments.length },
  total: { label: 'Chỉ tiêu công khai', value: data => data.overview.total },
  completed: { label: 'Đã hoàn thành', value: data => data.overview.completed },
  onTrack: { label: 'Đúng tiến độ', value: data => data.overview.onTrack },
  overallProgress: { label: 'Tiến độ chung', value: data => data.overview.overallProgress, suffix: '%' },
  year: { label: 'Năm', value: data => data.overview.year },
};

export const METRIC_KEYS = Object.keys(METRICS);

export const BINDING_FIELD_LABEL: Record<string, string> = {
  year: 'Năm',
  total: 'Tổng chỉ tiêu',
  completed: 'Đã hoàn thành',
  onTrack: 'Đúng tiến độ',
  overallProgress: 'Tiến độ chung',
  updatedAt: 'Cập nhật lúc',
  code: 'Mã',
  title: 'Tên',
  currentValue: 'Giá trị thực hiện',
  targetValue: 'Giá trị kế hoạch',
  unit: 'Đơn vị tính',
  progress: 'Tiến độ',
  department: 'Đơn vị',
  status: 'Tình trạng',
  publishedAt: 'Ngày công bố',
  summary: 'Trích yếu',
  downloadUrl: 'Đường dẫn tải',
};

export const BINDING_FORMATS = [
  { value: 'text', label: 'Chữ' },
  { value: 'number', label: 'Số' },
  { value: 'integer', label: 'Số nguyên' },
  { value: 'percent', label: 'Phần trăm' },
  { value: 'date', label: 'Ngày' },
  { value: 'datetime', label: 'Ngày giờ' },
];

export function defaultSettings(type: PublicDashboardWidgetType): PublicDashboardWidgetSettings {
  switch (type) {
    case 'overviewMetrics':
      return { metricKeys: ['departments', 'total', 'completed', 'overallProgress'] };
    case 'targetList':
      return { mode: 'highlight', maxItems: 6, targetKeys: [] };
    case 'departmentProgress':
      return { maxItems: 8 };
    case 'feedbackList':
      return { maxItems: 4 };
    case 'documentList':
      return { maxItems: 6, publicationIds: [] };
    case 'richText':
      return { body: 'Nội dung giới thiệu.' };
    case 'customHtml':
      return {
        html: '<section style="padding: 16px; text-align: center"><p style="margin: 0">Chỉ tiêu đang công khai</p><strong style="font-size: 32px" data-ioc-slot="tong">0</strong></section>',
        bindings: [{ slot: 'tong', label: 'Tổng chỉ tiêu', source: 'overview', field: 'total', format: 'integer' }],
      };
    case 'cta':
      return { body: 'Gửi phản ánh trực tuyến và theo dõi quá trình xử lý.', label: 'Gửi hoặc tra cứu phản ánh', href: '/phan-anh' };
  }
}

function bottom(layout: PublicDashboardLayoutItem[]) {
  return layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
}

function uniqueId(type: string, taken: Set<string>) {
  let index = 1;
  while (taken.has(`${type}-${index}`)) index += 1;
  return `${type}-${index}`;
}

function item(i: string, type: PublicDashboardWidgetType, breakpoint: PublicDashboardBreakpoint, x: number, y: number, w: number, h: number): PublicDashboardLayoutItem {
  const minH = MIN_H[type][breakpoint];
  return { i, x, y, w, h: Math.min(MAX_H, Math.max(h, minH)), minW: Math.min(w, WIDGETS[type].minW, COLS[breakpoint]), minH };
}

/** Thêm khối mới vào cuối trang ở cả ba cỡ màn hình. */
export function addWidget(config: PublicDashboardConfig, type: PublicDashboardWidgetType): { config: PublicDashboardConfig; id: string } {
  const id = uniqueId(type, new Set(config.widgets.map(widget => widget.id)));
  const widget: PublicDashboardWidget = { id, type, title: WIDGETS[type].title, settings: defaultSettings(type) };
  const layouts = { ...config.layouts };
  for (const breakpoint of BREAKPOINTS) {
    const [w, h] = WIDGETS[type].size[breakpoint];
    layouts[breakpoint] = [...config.layouts[breakpoint], item(id, type, breakpoint, 0, bottom(config.layouts[breakpoint]), Math.min(w, COLS[breakpoint]), h)];
  }
  return { config: { ...config, widgets: [...config.widgets, widget], layouts }, id };
}

/** Dồn các khối lên trên (cùng thuật toán lưới kéo thả dùng), giữ đúng dạng dữ liệu máy chủ nhận. */
export function compactLayout(layout: PublicDashboardLayoutItem[], breakpoint: PublicDashboardBreakpoint): PublicDashboardLayoutItem[] {
  return verticalCompactor.compact(layout.map(entry => ({ ...entry })), COLS[breakpoint]).map(({ i, x, y, w, h, minW, minH }) => ({
    i,
    x,
    y,
    w,
    h,
    ...(minW ? { minW } : {}),
    ...(minH ? { minH } : {}),
  }));
}

export function removeWidget(config: PublicDashboardConfig, id: string): PublicDashboardConfig {
  const layouts = { ...config.layouts };
  for (const breakpoint of BREAKPOINTS) layouts[breakpoint] = compactLayout(config.layouts[breakpoint].filter(entry => entry.i !== id), breakpoint);
  return { ...config, widgets: config.widgets.filter(widget => widget.id !== id), layouts };
}

export function duplicateWidget(config: PublicDashboardConfig, id: string): { config: PublicDashboardConfig; id: string } {
  const source = config.widgets.find(widget => widget.id === id);
  if (!source) return { config, id };
  const copyId = uniqueId(source.type, new Set(config.widgets.map(widget => widget.id)));
  const widget: PublicDashboardWidget = { ...structuredClone(source), id: copyId, title: source.title ? `${source.title} (bản sao)`.slice(0, 160) : undefined };
  const layouts = { ...config.layouts };
  for (const breakpoint of BREAKPOINTS) {
    const original = config.layouts[breakpoint].find(entry => entry.i === id);
    const [w, h] = original ? [original.w, original.h] : WIDGETS[source.type].size[breakpoint];
    layouts[breakpoint] = [...config.layouts[breakpoint], item(copyId, source.type, breakpoint, 0, bottom(config.layouts[breakpoint]), w, h)];
  }
  return { config: { ...config, widgets: [...config.widgets, widget], layouts }, id: copyId };
}

export function updateWidget(config: PublicDashboardConfig, id: string, patch: Partial<Omit<PublicDashboardWidget, 'id' | 'type'>>): PublicDashboardConfig {
  return { ...config, widgets: config.widgets.map(widget => (widget.id === id ? { ...widget, ...patch, settings: { ...widget.settings, ...patch.settings } } : widget)) };
}

/** Bố cục nhận từ lưới kéo thả: giữ minW/minH, bỏ thuộc tính phụ của thư viện. */
export function cleanLayout(layout: readonly PublicDashboardLayoutItem[], config: PublicDashboardConfig, breakpoint: PublicDashboardBreakpoint): PublicDashboardLayoutItem[] {
  const types = new Map(config.widgets.map(widget => [widget.id, widget.type]));
  return layout
    .filter(entry => types.has(entry.i))
    .map(entry => {
      const type = types.get(entry.i)!;
      const minH = MIN_H[type][breakpoint];
      const w = Math.max(1, Math.min(COLS[breakpoint], entry.w));
      return { i: entry.i, x: Math.max(0, Math.min(COLS[breakpoint] - w, entry.x)), y: Math.max(0, entry.y), w, h: Math.min(MAX_H, Math.max(minH, entry.h)), minW: Math.min(w, entry.minW ?? 1), minH };
    });
}

// ---------------------------------------------------------------- Kiểm tra trước khi lưu (khớp parseBindings, safeHref của máy chủ)

const SLOT_PATTERN = /^[a-z][a-z0-9_-]{0,49}$/;

export function slotUsed(html: string, slot: string) {
  const escaped = slot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}|data-ioc-slot\\s*=\\s*["']${escaped}["']`, 'i').test(html);
}

export function hrefAllowed(href: string) {
  return /^#[A-Za-z0-9_-]+$/.test(href) || (href.startsWith('/') && !href.startsWith('//') && !/[\\\u0000-\u001f\u007f]|%5c/i.test(href)) || /^https:\/\//i.test(href);
}

/** Lỗi của từng khối: rỗng là hợp lệ. activePublications là các văn bản đang công khai. */
export function widgetProblems(widget: PublicDashboardWidget, label: string, activePublications: Set<string>): string[] {
  const s = widget.settings;
  switch (widget.type) {
    case 'targetList':
      return s.mode === 'selected' && !s.targetKeys?.length ? [`${label}: chưa chọn chỉ tiêu`] : [];
    case 'richText':
      return s.body?.trim() ? [] : [`${label}: chưa có nội dung`];
    case 'cta':
      if (!s.body?.trim() || !s.label?.trim() || !s.href?.trim()) return [`${label}: thiếu mô tả, nhãn hoặc liên kết`];
      return hrefAllowed(s.href.trim()) ? [] : [`${label}: liên kết phải là đường dẫn nội bộ hoặc https://`];
    case 'documentList':
      return (s.publicationIds ?? []).some(id => !activePublications.has(id)) ? [`${label}: có văn bản đã thu hồi`] : [];
    case 'customHtml': {
      const html = s.html?.trim() ?? '';
      if (!html) return [`${label}: chưa có HTML`];
      const seen = new Set<string>();
      for (const binding of s.bindings ?? []) {
        if (!SLOT_PATTERN.test(binding.slot) || seen.has(binding.slot)) return [`${label}: tên biến "${binding.slot}" không hợp lệ hoặc bị trùng`];
        seen.add(binding.slot);
        if (!binding.label?.trim()) return [`${label}: biến "${binding.slot}" chưa có tên hiển thị`];
        if (binding.source === 'target' && !binding.targetKey) return [`${label}: biến "${binding.slot}" chưa chọn chỉ tiêu`];
        if (binding.source === 'document' && !binding.documentId) return [`${label}: biến "${binding.slot}" chưa chọn văn bản`];
        if (binding.source === 'document' && binding.documentId && !activePublications.has(binding.documentId)) return [`${label}: biến "${binding.slot}" trỏ tới văn bản đã thu hồi`];
        if (!slotUsed(html, binding.slot)) return [`${label}: chưa đặt {{${binding.slot}}} trong HTML`];
      }
      return [];
    }
    default:
      return [];
  }
}

/** Bỏ mọi tham chiếu tới một văn bản vừa thu hồi khỏi bản nháp. */
export function dropPublication(config: PublicDashboardConfig, publicationId: string): PublicDashboardConfig {
  return {
    ...config,
    widgets: config.widgets.map(widget =>
      widget.type === 'documentList'
        ? { ...widget, settings: { ...widget.settings, publicationIds: (widget.settings.publicationIds ?? []).filter(id => id !== publicationId) } }
        : widget.type === 'customHtml'
          ? { ...widget, settings: { ...widget.settings, bindings: (widget.settings.bindings ?? []).map(binding => (binding.source === 'document' && binding.documentId === publicationId ? { ...binding, documentId: undefined } : binding)) } }
          : widget,
    ),
  };
}

// ---------------------------------------------------------------- Mẫu trang

const THEME = { accent: '#1d4ed8', background: '#f4f6fb', surface: '#ffffff', text: '#172033', contentWidth: 1440, radius: 14 };

type Placement = Record<PublicDashboardBreakpoint, [x: number, y: number, w: number, h: number]>;

function build(widgets: { id: string; type: PublicDashboardWidgetType; title: string; settings?: PublicDashboardWidgetSettings; at: Placement }[], theme = THEME): PublicDashboardConfig {
  const layouts = { desktop: [], tablet: [], mobile: [] } as Record<PublicDashboardBreakpoint, PublicDashboardLayoutItem[]>;
  for (const widget of widgets) {
    for (const breakpoint of BREAKPOINTS) {
      const [x, y, w, h] = widget.at[breakpoint];
      layouts[breakpoint].push(item(widget.id, widget.type, breakpoint, x, y, w, h));
    }
  }
  return {
    schemaVersion: 1,
    theme: { ...theme },
    settings: { showHeader: true, showFooter: true },
    widgets: widgets.map(widget => ({ id: widget.id, type: widget.type, title: widget.title, settings: widget.settings ?? defaultSettings(widget.type) })),
    layouts,
  };
}

const CTA = { body: 'Gửi phản ánh trực tuyến và theo dõi quá trình xử lý bằng mã hồ sơ.', label: 'Gửi hoặc tra cứu phản ánh', href: '/phan-anh' };

export const TEMPLATES: { key: string; name: string; build: () => PublicDashboardConfig }[] = [
  {
    key: 'transparency',
    name: 'Minh bạch điều hành',
    build: () =>
      build([
        { id: 'overview', type: 'overviewMetrics', title: 'Kết quả thực hiện chỉ tiêu', at: { desktop: [0, 4, 12, 5], tablet: [0, 5, 8, 6], mobile: [0, 10, 4, 7] } },
        { id: 'targets', type: 'targetList', title: 'Chỉ tiêu nổi bật', at: { desktop: [0, 9, 8, 8], tablet: [0, 11, 8, 8], mobile: [0, 17, 4, 12] } },
        { id: 'departments', type: 'departmentProgress', title: 'Tiến độ theo đơn vị', at: { desktop: [8, 9, 4, 8], tablet: [0, 19, 8, 6], mobile: [0, 29, 4, 8] } },
        { id: 'feedbacks', type: 'feedbackList', title: 'Kết quả phản ánh đã xử lý', at: { desktop: [0, 0, 6, 4], tablet: [0, 0, 4, 5], mobile: [0, 0, 4, 5] } },
        { id: 'documents', type: 'documentList', title: 'Văn bản mới công bố', at: { desktop: [6, 0, 6, 4], tablet: [4, 0, 4, 5], mobile: [0, 5, 4, 5] } },
        { id: 'citizen-cta', type: 'cta', title: 'Kênh phục vụ người dân', settings: CTA, at: { desktop: [0, 17, 12, 3], tablet: [0, 25, 8, 3], mobile: [0, 37, 4, 5] } },
      ]),
  },
  {
    key: 'compact',
    name: 'Chỉ tiêu trọng tâm',
    build: () =>
      build([
        { id: 'overview', type: 'overviewMetrics', title: 'Kết quả thực hiện chỉ tiêu', at: { desktop: [0, 0, 12, 5], tablet: [0, 0, 8, 6], mobile: [0, 0, 4, 7] } },
        { id: 'targets', type: 'targetList', title: 'Chỉ tiêu trọng tâm', at: { desktop: [0, 5, 12, 8], tablet: [0, 6, 8, 9], mobile: [0, 7, 4, 12] } },
        { id: 'citizen-cta', type: 'cta', title: 'Kênh phục vụ người dân', settings: CTA, at: { desktop: [0, 13, 12, 3], tablet: [0, 15, 8, 3], mobile: [0, 19, 4, 5] } },
      ]),
  },
  {
    key: 'documents',
    name: 'Thông tin và văn bản',
    build: () =>
      build(
        [
          { id: 'intro', type: 'richText', title: 'Thông tin công khai', settings: { body: 'Chỉ tiêu, văn bản và kết quả xử lý phản ánh đã được kiểm duyệt trước khi công bố.' }, at: { desktop: [0, 0, 12, 3], tablet: [0, 0, 8, 4], mobile: [0, 0, 4, 6] } },
          { id: 'overview', type: 'overviewMetrics', title: 'Tổng quan', settings: { metricKeys: ['total', 'completed', 'overallProgress'] }, at: { desktop: [0, 3, 12, 5], tablet: [0, 4, 8, 6], mobile: [0, 6, 4, 7] } },
          { id: 'documents', type: 'documentList', title: 'Văn bản mới ban hành', settings: { maxItems: 10, publicationIds: [] }, at: { desktop: [0, 8, 5, 9], tablet: [0, 10, 8, 8], mobile: [0, 13, 4, 11] } },
          { id: 'targets', type: 'targetList', title: 'Kết quả thực hiện chỉ tiêu', at: { desktop: [5, 8, 7, 9], tablet: [0, 18, 8, 9], mobile: [0, 24, 4, 12] } },
          { id: 'citizen-cta', type: 'cta', title: 'Phản ánh hiện trường', settings: CTA, at: { desktop: [0, 17, 12, 3], tablet: [0, 27, 8, 3], mobile: [0, 36, 4, 5] } },
        ],
        { ...THEME, accent: '#1e40af', background: '#f5f6f8', radius: 10 },
      ),
  },
];

// ---------------------------------------------------------------- Màu: độ tương phản WCAG (máy chủ kiểm tra cùng ngưỡng)

function luminance(hex: string) {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrast(left: string, right: string) {
  if (!/^#[0-9a-f]{6}$/i.test(left) || !/^#[0-9a-f]{6}$/i.test(right)) return 0;
  const [a, b] = [luminance(left), luminance(right)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

export function themeIssues(theme: PublicDashboardConfig['theme']) {
  const issues: string[] = [];
  if (contrast(theme.text, theme.background) < 4.5) issues.push('Màu chữ trên nền trang chưa đủ tương phản (cần ≥ 4,5:1)');
  if (contrast(theme.text, theme.surface) < 4.5) issues.push('Màu chữ trên nền khối chưa đủ tương phản (cần ≥ 4,5:1)');
  if (contrast(theme.accent, theme.surface) < 3) issues.push('Màu nhấn trên nền khối chưa đủ tương phản (cần ≥ 3:1)');
  return issues;
}
