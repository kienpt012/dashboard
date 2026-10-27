import { randomBytes } from 'node:crypto';
import { Role } from '@prisma/client';
import { widgetDefinition, type DeskBreakpoint } from './catalog';
import { placeWidget, type DeskLayouts } from './layout';
import { normalizeProfileConfig, normalizeWidgetSettings, type DeskProfileConfig, type DeskSpaceConfig, type DockItem, type WidgetInstance } from './validate';

// Bàn làm việc dựng sẵn cho người dùng lần đầu: mỗi vai trò một bộ widget hợp với việc hằng ngày của họ (mục 5.7 đặc
// tả). Mẫu do quản trị soạn (phân hệ 6) sẽ được ưu tiên hơn các bộ này.

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function newWidgetId(): string {
  const random = randomBytes(12);
  let id = 'w_';
  for (const byte of random) id += BASE62[byte % 62];
  return id;
}

type Override = Partial<Record<DeskBreakpoint, { w: number; h: number }>>;
type Planned = { type: string; settings?: Record<string, unknown>; size?: Override };

const APPROVER_ROLES: Role[] = [Role.ADMIN, Role.LEADER, Role.MANAGER];

const screen = (id: string, path: string, label: string, icon: string): DockItem => ({ id, kind: 'screen', path, label, icon });

function dockFor(role: Role): DockItem[] {
  return [
    screen('d-viec', '/admin/viec-cua-toi', 'Việc của tôi', 'inbox'),
    screen('d-chitieu', '/admin/targets', 'Danh mục chỉ tiêu', 'aim'),
    ...(APPROVER_ROLES.includes(role) ? [screen('d-duyet', '/admin/approvals', 'Duyệt báo cáo', 'file-done')] : []),
    screen('d-phananh', '/admin/feedback', 'Phản ánh', 'message'),
    screen('d-vanban', '/admin/documents', 'Kho văn bản', 'file-text'),
    screen('d-baocao', '/admin/reports', 'Báo cáo tổng hợp', 'bar-chart'),
    screen('d-trinhchieu', '/trinh-chieu', 'Trình chiếu', 'fund-projection-screen'),
  ];
}

const LAUNCHERS: Partial<Record<Role, DockItem[]>> = {
  [Role.ADMIN]: [
    screen('l-taikhoan', '/admin/users', 'Tài khoản', 'team'),
    screen('l-cauhinh', '/admin/settings', 'Cấu hình', 'control'),
    screen('l-nhatky', '/admin/audit-logs', 'Nhật ký hệ thống', 'history'),
    screen('l-baoloi', '/admin/bao-loi', 'Báo lỗi', 'bug'),
    screen('l-thietlap', '/admin/thiet-lap', 'Thiết lập địa phương', 'tool'),
    screen('l-congkhai', '/admin/public-dashboard', 'Trang công khai', 'global'),
  ],
  [Role.CLERK]: [
    screen('l-vanban', '/admin/documents', 'Kho văn bản', 'file-text'),
    screen('l-dexuat', '/admin/proposals', 'Đề xuất chỉ tiêu', 'file-add'),
    screen('l-bochitieu', '/admin/bo-chi-tieu', 'Bộ chỉ tiêu', 'appstore'),
    screen('l-phananh', '/admin/feedback', 'Phản ánh', 'message'),
  ],
  [Role.STAFF]: [
    screen('l-excel', '/admin/imports', 'Nộp báo cáo Excel', 'file-excel'),
    screen('l-dexuat', '/admin/proposals', 'Đề xuất chỉ tiêu', 'file-add'),
    screen('l-khodulieu', '/admin/kho-du-lieu', 'Kho dữ liệu', 'database'),
    screen('l-hoso', '/admin/profile', 'Hồ sơ cá nhân', 'user'),
  ],
};

const MEETING: Planned[] = [
  { type: 'dept.ticker' },
  { type: 'dept.status', size: { desktop: { w: 5, h: 9 }, tablet: { w: 4, h: 9 } } },
  { type: 'dept.frameworks', size: { desktop: { w: 7, h: 9 }, tablet: { w: 4, h: 9 } } },
  { type: 'target.chart', settings: { chartType: 'bar' }, size: { desktop: { w: 12, h: 8 } } },
];

const PLANS: Record<Role, { name: string; icon: string; widgets: Planned[] }[]> = {
  [Role.STAFF]: [
    {
      name: 'Hằng ngày', icon: 'home',
      widgets: [
        { type: 'hero' }, { type: 'my.work' }, { type: 'dept.deadlines' }, { type: 'target.watchlist', settings: { mode: 'mine' } },
        { type: 'dept.alerts' }, { type: 'notepad' }, { type: 'todo' }, { type: 'calendar' },
        { type: 'launcher', settings: { items: LAUNCHERS[Role.STAFF] } },
      ],
    },
  ],
  [Role.MANAGER]: [
    {
      name: 'Hằng ngày', icon: 'home',
      widgets: [
        { type: 'hero' }, { type: 'dept.workload' }, { type: 'dept.status' }, { type: 'dept.team' }, { type: 'dept.alerts' },
        { type: 'dept.deadlines' }, { type: 'my.work' }, { type: 'dept.recent' },
      ],
    },
    { name: 'Giao ban', icon: 'team', widgets: MEETING },
  ],
  [Role.LEADER]: [
    {
      name: 'Hằng ngày', icon: 'home',
      widgets: [
        { type: 'hero' }, { type: 'dept.status' }, { type: 'dept.workload' }, { type: 'dept.alerts' }, { type: 'dept.frameworks' },
        { type: 'dept.stalled' }, { type: 'jarvis' }, { type: 'calendar' },
      ],
    },
    { name: 'Giao ban', icon: 'team', widgets: MEETING },
  ],
  [Role.CLERK]: [
    {
      name: 'Hằng ngày', icon: 'home',
      widgets: [
        { type: 'hero' }, { type: 'my.work' }, { type: 'docs.recent' }, { type: 'dept.feedback' }, { type: 'dept.deadlines' },
        { type: 'launcher', settings: { items: LAUNCHERS[Role.CLERK] } },
      ],
    },
  ],
  [Role.ADMIN]: [
    {
      name: 'Hằng ngày', icon: 'home',
      widgets: [
        { type: 'hero' }, { type: 'dept.status' }, { type: 'my.notifications' },
        { type: 'launcher', settings: { items: LAUNCHERS[Role.ADMIN] } }, { type: 'clock' },
      ],
    },
  ],
  [Role.VIEWER]: [
    {
      name: 'Hằng ngày', icon: 'home',
      widgets: [{ type: 'hero' }, { type: 'dept.status' }, { type: 'dept.frameworks' }, { type: 'dept.recent' }],
    },
  ],
};

function buildSpace(widgets: Planned[], focusDepartmentId: string | null): DeskSpaceConfig {
  const instances: WidgetInstance[] = [];
  let layouts: DeskLayouts = { desktop: [], tablet: [], mobile: [] };
  for (const plan of widgets) {
    const def = widgetDefinition(plan.type);
    if (!def) continue;
    const id = newWidgetId();
    const size = {
      desktop: { ...def.size.desktop, ...plan.size?.desktop },
      tablet: { ...def.size.tablet, ...plan.size?.tablet },
      mobile: { ...def.size.mobile, ...plan.size?.mobile },
    };
    instances.push({
      id,
      type: def.type,
      title: null,
      settings: normalizeWidgetSettings(def, plan.settings ?? {}),
      style: { accent: null, appearance: 'inherit', hideHeader: false },
    });
    layouts = placeWidget(layouts, id, size);
  }
  return { schemaVersion: 1, background: null, focusDepartmentId, widgets: instances, layouts, schedule: null };
}

export function defaultProfileConfig(role: Role): DeskProfileConfig {
  return normalizeProfileConfig({ dock: { items: dockFor(role) } });
}

export function defaultSpaces(role: Role, focusDepartmentId: string | null): { name: string; icon: string; config: DeskSpaceConfig }[] {
  return PLANS[role].map(plan => ({ name: plan.name, icon: plan.icon, config: buildSpace(plan.widgets, focusDepartmentId) }));
}
