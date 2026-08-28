import type {
  PublicDashboardBreakpoint,
  PublicDashboardConfig,
  PublicDashboardLayoutItem,
  PublicDashboardWidget,
  PublicDashboardWidgetType,
} from './types';

export const PUBLIC_DASHBOARD_COLS: Record<PublicDashboardBreakpoint, number> = {
  desktop: 12,
  tablet: 8,
  mobile: 4,
};

export const PUBLIC_DASHBOARD_WIDGET_MIN_HEIGHTS: Record<
  PublicDashboardWidgetType,
  Record<PublicDashboardBreakpoint, number>
> = {
  overviewMetrics: { desktop: 5, tablet: 6, mobile: 7 },
  targetList: { desktop: 5, tablet: 5, mobile: 6 },
  departmentProgress: { desktop: 5, tablet: 4, mobile: 5 },
  feedbackList: { desktop: 4, tablet: 4, mobile: 5 },
  documentList: { desktop: 4, tablet: 4, mobile: 5 },
  richText: { desktop: 2, tablet: 2, mobile: 2 },
  customHtml: { desktop: 2, tablet: 2, mobile: 2 },
  cta: { desktop: 2, tablet: 2, mobile: 3 },
};

export function publicDashboardWidgetMinHeight(
  type: PublicDashboardWidgetType,
  breakpoint: PublicDashboardBreakpoint,
) {
  return PUBLIC_DASHBOARD_WIDGET_MIN_HEIGHTS[type][breakpoint];
}

export const PUBLIC_DASHBOARD_WIDGET_LABELS: Record<PublicDashboardWidgetType, string> = {
  overviewMetrics: 'Số liệu tổng quan',
  targetList: 'Danh sách chỉ tiêu',
  departmentProgress: 'Tiến độ theo đơn vị',
  feedbackList: 'Kết quả phản ánh',
  documentList: 'Văn bản công khai',
  richText: 'Nội dung văn bản',
  customHtml: 'Khối HTML tùy biến',
  cta: 'Nút kêu gọi hành động',
};

export const PUBLIC_DASHBOARD_WIDGET_DESCRIPTIONS: Record<PublicDashboardWidgetType, string> = {
  overviewMetrics: 'Tổng chỉ tiêu, đơn vị, hoàn thành và tiến độ chung.',
  targetList: 'Hiển thị chỉ tiêu nổi bật, toàn bộ hoặc danh sách đã chọn.',
  departmentProgress: 'So sánh kết quả thực hiện giữa các đơn vị.',
  feedbackList: 'Các phản ánh đã xử lý và được duyệt công khai.',
  documentList: 'Danh sách văn bản đã qua quy trình công bố.',
  richText: 'Tiêu đề và nội dung giới thiệu theo định dạng an toàn.',
  customHtml: 'HTML giới hạn có thể chèn dữ liệu bằng biến trực quan.',
  cta: 'Khối điều hướng đến phản ánh hoặc dịch vụ công.',
};

const defaultTheme = {
  accent: '#0f8378',
  background: '#f3f8f7',
  surface: '#ffffff',
  text: '#173633',
  contentWidth: 1440,
  radius: 18,
};

function widget(id: string, type: PublicDashboardWidgetType, title: string, settings: PublicDashboardWidget['settings'] = {}): PublicDashboardWidget {
  return { id, type, title, settings };
}

function layout(i: string, x: number, y: number, w: number, h: number, minW = 2, minH = 2): PublicDashboardLayoutItem {
  return { i, x, y, w, h, minW, minH };
}

export function createDefaultPublicDashboardConfig(): PublicDashboardConfig {
  return {
    schemaVersion: 1,
    theme: { ...defaultTheme },
    settings: { showHeader: true, showFooter: true },
    widgets: [
      widget('overview', 'overviewMetrics', 'Kết quả thực hiện chỉ tiêu', { metricKeys: ['departments', 'total', 'completed', 'overallProgress'] }),
      widget('targets', 'targetList', 'Chỉ tiêu nổi bật', { mode: 'highlight', maxItems: 6, targetKeys: [] }),
      widget('departments', 'departmentProgress', 'Tiến độ theo đơn vị', { maxItems: 8 }),
      widget('feedbacks', 'feedbackList', 'Kết quả phản ánh đã xử lý', { maxItems: 4 }),
      widget('documents', 'documentList', 'Văn bản mới công bố', { maxItems: 6, publicationIds: [] }),
      widget('citizen-cta', 'cta', 'Kênh phục vụ người dân', { body: 'Gửi phản ánh trực tuyến và theo dõi toàn bộ quá trình xử lý.', label: 'Gửi hoặc tra cứu phản ánh', href: '/phan-anh' }),
    ],
    layouts: {
      desktop: [
        layout('overview', 0, 0, 12, 5, 6, 5),
        layout('targets', 0, 5, 8, 8, 4, 5),
        layout('departments', 8, 5, 4, 8, 3, 5),
        layout('feedbacks', 0, 13, 6, 6, 4, 4),
        layout('documents', 6, 13, 6, 6, 4, 4),
        layout('citizen-cta', 0, 19, 12, 3, 6, 2),
      ],
      tablet: [
        layout('overview', 0, 0, 8, 6, 4, 6),
        layout('targets', 0, 6, 8, 8, 4, 5),
        layout('departments', 0, 14, 8, 6, 4, 4),
        layout('feedbacks', 0, 20, 4, 7, 4, 4),
        layout('documents', 4, 20, 4, 7, 4, 4),
        layout('citizen-cta', 0, 27, 8, 3, 4, 2),
      ],
      mobile: [
        layout('overview', 0, 0, 4, 7, 4, 7),
        layout('targets', 0, 7, 4, 12, 4, 6),
        layout('departments', 0, 19, 4, 8, 4, 5),
        layout('feedbacks', 0, 27, 4, 9, 4, 5),
        layout('documents', 0, 36, 4, 9, 4, 5),
        layout('citizen-cta', 0, 45, 4, 5, 4, 3),
      ],
    },
  };
}

export function clonePublicDashboardConfig(config: PublicDashboardConfig): PublicDashboardConfig {
  return JSON.parse(JSON.stringify(config)) as PublicDashboardConfig;
}

function uniqueId(base: string, used: Set<string>) {
  let result = base.replace(/[^a-zA-Z0-9_-]/g, '-') || 'widget';
  let suffix = 2;
  while (used.has(result)) result = `${base}-${suffix++}`;
  used.add(result);
  return result;
}

function layoutsOverlap(left: PublicDashboardLayoutItem, right: PublicDashboardLayoutItem) {
  return left.x < right.x + right.w
    && left.x + left.w > right.x
    && left.y < right.y + right.h
    && left.y + left.h > right.y;
}

function reflowLayout(items: PublicDashboardLayoutItem[]) {
  const placed: PublicDashboardLayoutItem[] = [];
  const sorted = items
    .map((item, index) => ({ item: { ...item }, index }))
    .sort((left, right) => left.item.y - right.item.y || left.item.x - right.item.x || left.index - right.index);
  for (const entry of sorted) {
    const candidate = entry.item;
    let collisions = placed.filter(other => layoutsOverlap(candidate, other));
    while (collisions.length) {
      candidate.y = Math.max(...collisions.map(other => other.y + other.h));
      collisions = placed.filter(other => layoutsOverlap(candidate, other));
    }
    placed.push(candidate);
  }
  const byId = new Map(placed.map(item => [item.i, item]));
  return items.map(item => byId.get(item.i)!);
}

export function normalizePublicDashboardConfig(input: unknown): PublicDashboardConfig {
  const fallback = createDefaultPublicDashboardConfig();
  if (!input || typeof input !== 'object') return fallback;
  const raw = input as Partial<PublicDashboardConfig>;
  const allowed = new Set(Object.keys(PUBLIC_DASHBOARD_WIDGET_LABELS));
  const used = new Set<string>();
  const widgets = Array.isArray(raw.widgets)
    ? raw.widgets.filter(item => item && allowed.has(item.type)).map((item, index) => ({
        id: uniqueId(typeof item.id === 'string' ? item.id : `widget-${index + 1}`, used),
        type: item.type,
        title: typeof item.title === 'string' ? item.title : PUBLIC_DASHBOARD_WIDGET_LABELS[item.type],
        settings: item.settings && typeof item.settings === 'object' ? item.settings : {},
      }))
    : fallback.widgets;
  const normalized: PublicDashboardConfig = {
    schemaVersion: 1,
    theme: {
      accent: typeof raw.theme?.accent === 'string' ? raw.theme.accent : fallback.theme.accent,
      background: typeof raw.theme?.background === 'string' ? raw.theme.background : fallback.theme.background,
      surface: typeof raw.theme?.surface === 'string' ? raw.theme.surface : fallback.theme.surface,
      text: typeof raw.theme?.text === 'string' ? raw.theme.text : fallback.theme.text,
      contentWidth: Number.isFinite(raw.theme?.contentWidth) ? Math.max(960, Math.min(1920, Number(raw.theme?.contentWidth))) : fallback.theme.contentWidth,
      radius: Number.isFinite(raw.theme?.radius) ? Math.max(0, Math.min(36, Number(raw.theme?.radius))) : fallback.theme.radius,
    },
    settings: {
      showHeader: raw.settings?.showHeader !== false,
      showFooter: raw.settings?.showFooter !== false,
    },
    widgets,
    layouts: { desktop: [], tablet: [], mobile: [] },
  };
  for (const breakpoint of ['desktop', 'tablet', 'mobile'] as const) {
    const cols = PUBLIC_DASHBOARD_COLS[breakpoint];
    const source = Array.isArray(raw.layouts?.[breakpoint]) ? raw.layouts![breakpoint] : [];
    const byId = new Map(source.map(item => [item.i, item]));
    let nextY = 0;
    const unflowed = widgets.map((item, index) => {
      const current = byId.get(item.id);
      const defaultItem = fallback.layouts[breakpoint].find(candidate => candidate.i === item.id);
      const typeMinHeight = publicDashboardWidgetMinHeight(item.type, breakpoint);
      const w = Math.max(1, Math.min(cols, Number(current?.w ?? defaultItem?.w ?? cols)));
      const h = Math.max(typeMinHeight, Math.min(30, Number(current?.h ?? defaultItem?.h ?? 5)));
      const result = {
        i: item.id,
        x: Math.max(0, Math.min(cols - w, Number(current?.x ?? defaultItem?.x ?? 0))),
        y: Math.max(0, Number(current?.y ?? defaultItem?.y ?? nextY)),
        w,
        h,
        minW: Math.max(1, Math.min(w, Number(current?.minW ?? defaultItem?.minW ?? 2))),
        minH: Math.max(typeMinHeight, Math.min(h, Number(current?.minH ?? defaultItem?.minH ?? typeMinHeight))),
      };
      nextY = Math.max(nextY, result.y + result.h);
      return result;
    });
    normalized.layouts[breakpoint] = reflowLayout(unflowed);
  }
  return normalized;
}

function compactTemplate(): PublicDashboardConfig {
  const config = createDefaultPublicDashboardConfig();
  config.widgets = config.widgets.filter(item => ['overview', 'targets', 'citizen-cta'].includes(item.id));
  config.layouts.desktop = [layout('overview', 0, 0, 12, 5, 2, 5), layout('targets', 0, 5, 12, 7, 2, 5), layout('citizen-cta', 0, 12, 12, 3, 2, 2)];
  config.layouts.tablet = [layout('overview', 0, 0, 8, 6, 2, 6), layout('targets', 0, 6, 8, 8, 2, 5), layout('citizen-cta', 0, 14, 8, 3, 2, 2)];
  config.layouts.mobile = [layout('overview', 0, 0, 4, 7, 2, 7), layout('targets', 0, 7, 4, 12, 2, 6), layout('citizen-cta', 0, 19, 4, 5, 2, 3)];
  return config;
}

function documentTemplate(): PublicDashboardConfig {
  const config = createDefaultPublicDashboardConfig();
  config.theme = { ...config.theme, accent: '#246a73', background: '#f4f7f8', radius: 12 };
  config.widgets = [
    widget('intro', 'richText', 'Thông tin công khai', { body: 'Theo dõi chỉ tiêu, văn bản và kết quả phục vụ người dân đã được kiểm duyệt trước khi công bố.' }),
    widget('overview', 'overviewMetrics', 'Tổng quan dữ liệu', { metricKeys: ['total', 'completed', 'overallProgress'] }),
    widget('documents', 'documentList', 'Văn bản mới ban hành', { maxItems: 10, publicationIds: [] }),
    widget('targets', 'targetList', 'Kết quả thực hiện chỉ tiêu', { mode: 'highlight', maxItems: 6 }),
    widget('citizen-cta', 'cta', 'Phản ánh hiện trường', { body: 'Gửi thông tin và theo dõi kết quả xử lý bằng mã hồ sơ.', label: 'Mở kênh phản ánh', href: '/phan-anh' }),
  ];
  config.layouts.desktop = [layout('intro', 0, 0, 12, 3), layout('overview', 0, 3, 12, 5, 2, 5), layout('documents', 0, 8, 5, 9, 2, 4), layout('targets', 5, 8, 7, 9, 2, 5), layout('citizen-cta', 0, 17, 12, 3, 2, 2)];
  config.layouts.tablet = [layout('intro', 0, 0, 8, 4), layout('overview', 0, 4, 8, 6, 2, 6), layout('documents', 0, 10, 8, 8, 2, 4), layout('targets', 0, 18, 8, 9, 2, 5), layout('citizen-cta', 0, 27, 8, 3, 2, 2)];
  config.layouts.mobile = [layout('intro', 0, 0, 4, 6), layout('overview', 0, 6, 4, 7, 2, 7), layout('documents', 0, 13, 4, 11, 2, 5), layout('targets', 0, 24, 4, 12, 2, 6), layout('citizen-cta', 0, 36, 4, 5, 2, 3)];
  return config;
}

export const PUBLIC_DASHBOARD_TEMPLATES = [
  { key: 'transparency', name: 'Minh bạch điều hành', description: 'Cân bằng giữa chỉ tiêu, đơn vị, phản ánh và văn bản.', create: createDefaultPublicDashboardConfig },
  { key: 'compact', name: 'Chỉ tiêu trọng tâm', description: 'Trang gọn, tập trung vào số liệu và chỉ tiêu nổi bật.', create: compactTemplate },
  { key: 'documents', name: 'Thông tin và văn bản', description: 'Ưu tiên văn bản công khai bên cạnh kết quả chỉ tiêu.', create: documentTemplate },
] as const;

export function createWidget(type: PublicDashboardWidgetType, id = `${type}-${Date.now().toString(36)}`): PublicDashboardWidget {
  const settings: PublicDashboardWidget['settings'] = type === 'overviewMetrics'
    ? { metricKeys: ['departments', 'total', 'completed', 'overallProgress'] }
    : type === 'targetList'
      ? { mode: 'highlight', maxItems: 6, targetKeys: [] }
    : type === 'documentList'
      ? { maxItems: 6, publicationIds: [] }
      : type === 'customHtml'
        ? { html: '<section class="custom-card"><p>Số chỉ tiêu đang công khai</p><strong>{{tong_chi_tieu}}</strong></section>', bindings: [{ slot: 'tong_chi_tieu', label: 'Tổng chỉ tiêu', source: 'overview', field: 'total', format: 'number' }] }
        : type === 'richText'
          ? { body: 'Nhập nội dung giới thiệu dành cho người dân.' }
          : type === 'cta'
            ? { body: 'Mô tả ngắn về dịch vụ hoặc nội dung cần điều hướng.', label: 'Xem chi tiết', href: '/phan-anh' }
            : { maxItems: 6 };
  return widget(id, type, PUBLIC_DASHBOARD_WIDGET_LABELS[type], settings);
}
