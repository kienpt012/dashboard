// Kiểu dữ liệu Bàn làm việc số — bản sao các kiểu phía máy chủ (apps/api/src/desk/*), giữ khớp khi sửa.

import type { AlertItem, Overview, TargetStatusKey, WorkEventItem } from '@/types/domain';

export type DeskBreakpoint = 'desktop' | 'tablet' | 'mobile';
export const DESK_BREAKPOINTS: DeskBreakpoint[] = ['desktop', 'tablet', 'mobile'];
export const DESK_COLUMNS: Record<DeskBreakpoint, number> = { desktop: 12, tablet: 8, mobile: 4 };
export const BREAKPOINT_LABEL: Record<DeskBreakpoint, string> = { desktop: 'Máy tính', tablet: 'Máy tính bảng', mobile: 'Điện thoại' };

export const MAX_SPACES = 12;
export const MAX_WIDGETS = 40;
export const MAX_DOCK_ITEMS = 40;
export const MAX_FOLDER_ITEMS = 12;

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
export type WidgetSizes = Record<DeskBreakpoint, WidgetSize>;

/** Sổ widget do máy chủ trả (GET /desk/catalog): `fields` đã gồm ô chọn phòng và chu kỳ làm mới. */
export interface WidgetDefinition {
  type: string;
  category: WidgetCategory;
  title: string;
  description: string;
  icon: string;
  roles?: string[];
  data: boolean;
  refresh?: number;
  multiple: boolean;
  size: WidgetSizes;
  fields: SettingField[];
}

export const PRESET_IDS = [
  'binh-minh', 'trua', 'hoang-hon', 'dem-sao', 'cuc-quang', 'bien', 'rung-tram',
  'sen', 'trong-dong', 'gom', 'dia-hinh', 'kinh', 'than-chi', 'giay', 'luoi-xanh',
] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export type Background =
  | { kind: 'preset'; id: PresetId }
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; stops: string[]; angle: number }
  | { kind: 'image'; assetId: string; fit: 'cover' | 'contain'; focus: { x: number; y: number } }
  | { kind: 'slideshow'; items: Background[]; minutes: number; shuffle: boolean }
  | { kind: 'daylight' };

export interface DeskAppearance {
  background: Background;
  dim: number;
  blur: number;
  surface: 'glass' | 'solid' | 'outline';
  surfaceOpacity: number;
  accent: string | null;
  density: 'comfortable' | 'compact';
  fontScale: number;
  radius: number;
  motion: 'auto' | 'full' | 'reduced';
}

export type DockItem =
  | { id: string; kind: 'screen'; path: string; label: string; icon: string }
  | { id: string; kind: 'view'; path: string; label: string; icon: string; color: string | null }
  | { id: string; kind: 'link'; url: string; label: string; icon: string; color: string | null }
  | { id: string; kind: 'folder'; label: string; icon: string; color: string | null; items: DockItem[] }
  | { id: string; kind: 'action'; actionId: string; label: string; icon: string; color: string | null };

export interface SearchProvider {
  id: string;
  name: string;
  url: string;
}

export interface DeskProfileConfig {
  schemaVersion: 1;
  appearance: DeskAppearance;
  greeting: { show: boolean; name: string | null; lunar: boolean; holidays: boolean };
  dock: { position: 'bottom' | 'left' | 'right' | 'hidden'; autoHide: boolean; magnify: boolean; items: DockItem[] };
  startPage: 'desk' | 'ops' | 'work';
  searchProviders: SearchProvider[];
  shortcuts: unknown[];
  alerts: Record<string, unknown>;
  noteTemplates: string[];
}

export interface WidgetStyle {
  accent: string | null;
  appearance: 'inherit' | 'glass' | 'solid' | 'outline' | 'plain';
  hideHeader: boolean;
}

export interface WidgetInstance {
  id: string;
  type: string;
  title: string | null;
  settings: Record<string, unknown>;
  style: WidgetStyle;
  templateKey?: string;
  locked?: boolean;
}

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DeskLayouts = Record<DeskBreakpoint, LayoutItem[]>;

export interface DeskSpaceConfig {
  schemaVersion: 1;
  background: Background | null;
  focusDepartmentId: string | null;
  widgets: WidgetInstance[];
  layouts: DeskLayouts;
  schedule: { days: number[]; from: string; to: string } | null;
}

export interface DeskSpace {
  id: string;
  name: string;
  icon: string;
  position: number;
  version: number;
  config: DeskSpaceConfig;
}

export interface FocusDepartment {
  id: string;
  name: string;
  color: string;
}

export interface DeskPayload {
  profile: { config: DeskProfileConfig; version: number };
  spaces: DeskSpace[];
  focusDepartments: FocusDepartment[];
}

export interface AssetMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  sizeBytes: number;
  isShared: boolean;
  ownerId: string;
  createdAt: string;
}

export interface AssetList {
  mine: AssetMeta[];
  shared: AssetMeta[];
  usedBytes: number;
  limitBytes: number;
  limitCount: number;
}

export type DeadlineKind = 'TARGET_DUE' | 'PERIOD_REPORT' | 'EXPLANATION_DUE' | 'PROPOSAL_AUTO_APPROVE';

export interface Deadline {
  kind: DeadlineKind;
  at: string;
  title: string;
  detail: string;
  link: string;
  overdue: boolean;
}

export interface TeamMember {
  userId: string;
  fullName: string;
  position: string | null;
  role: string;
  targets: number;
  missingReports: number;
  overdue: number;
  lastLoginAt: string | null;
}

/** Gói dữ liệu một phòng (GET /desk/data/department). */
export interface DepartmentSnapshot {
  department: FocusDepartment;
  year: number;
  generatedAt: string;
  dataAsOf?: string | null;
  totals: Overview['totals'] & { oldestPendingDays: number };
  frameworks: Overview['frameworks'];
  alerts: AlertItem[];
  stalled: Overview['stalled'];
  recent: WorkEventItem[];
  deadlines: Deadline[];
  team: TeamMember[];
  feedback: {
    counts: Partial<Record<string, number>>;
    latest: { id: string; code: string; title: string; status: string; createdAt: string; dueAt: string | null }[];
  };
  documents: { id: string; code: string; title: string; status: string; createdAt: string }[];
}

export interface SeriesTarget {
  id: string;
  code: string;
  title: string;
  unit: string;
  kind: string;
  targetValue: number;
  targetText: string | null;
  currentValue: number;
  status: TargetStatusKey;
  progress: number;
  points: { periodKey: string; label: string; value: number }[];
}

export interface TargetOption {
  id: string;
  code: string;
  title: string;
  departmentName: string;
  status: TargetStatusKey;
  progress: number;
}
