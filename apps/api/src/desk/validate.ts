import { Role } from '@prisma/client';
import { catalogFor, fieldsOf, widgetDefinition, type SettingField, type WidgetDefinition } from './catalog';
import { normalizeLayouts, type DeskLayouts } from './layout';

// Kiểm tra cấu hình bàn làm việc trước khi lưu. Nguyên tắc: lỗi nhỏ thì sửa êm (kẹp số, cắt chuỗi, bỏ khoá lạ, bỏ mục
// có URL không an toàn), lỗi cấu trúc hoặc quá cỡ thì từ chối cả lần lưu. Không có đường nào để chèn mã vào giao diện.

export class DeskConfigError extends Error {}

export const PROFILE_MAX_BYTES = 64 * 1024;
export const SPACE_MAX_BYTES = 256 * 1024;
export const STATE_MAX_BYTES = 64 * 1024;
export const MAX_SPACES = 12;
export const MAX_WIDGETS = 40;
export const MAX_DOCK_ITEMS = 40;
export const MAX_FOLDER_ITEMS = 12;

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
  /** Phân hệ 3. */
  shortcuts: unknown[];
  /** Phân hệ 5. */
  alerts: Record<string, unknown>;
  /** Phân hệ 2. */
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

export interface SpaceSchedule {
  days: number[];
  from: string;
  to: string;
}

export interface DeskSpaceConfig {
  schemaVersion: 1;
  background: Background | null;
  focusDepartmentId: string | null;
  widgets: WidgetInstance[];
  layouts: DeskLayouts;
  schedule: SpaceSchedule | null;
}

export const DEFAULT_SEARCH_PROVIDERS: SearchProvider[] = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q={q}' },
  { id: 'tvpl', name: 'Thư viện pháp luật', url: 'https://thuvienphapluat.vn/page/tim-van-ban.aspx?keyword={q}' },
  { id: 'dvc', name: 'Cổng Dịch vụ công', url: 'https://dichvucong.gov.vn/p/home/dvc-tim-kiem-thu-tuc-hanh-chinh.html?keyword={q}' },
];

const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const WIDGET_ID = /^w_[A-Za-z0-9]{8,24}$/;
const ITEM_ID = /^[A-Za-z0-9_-]{1,40}$/;
const ICON = /^[a-z0-9-]{1,40}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const INTERNAL_PREFIXES = ['/admin', '/trinh-chieu', '/phan-anh'];

type Dict = Record<string, unknown>;

const isObject = (value: unknown): value is Dict => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');

function clamp(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

function text(value: unknown, max: number, fallback = ''): string {
  return typeof value === 'string' ? value.slice(0, max) : fallback;
}

/** Chuỗi trình bày một dòng: bỏ ký tự điều khiển, cắt độ dài; rỗng thì trả null. */
function label(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  return clean || null;
}

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const color = (value: unknown) => (typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : null);
const id = (value: unknown) => (typeof value === 'string' && ID.test(value) ? value : null);

export function isSafeUrl(value: string): boolean {
  if (typeof value !== 'string' || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isInternalPath(value: string): boolean {
  if (typeof value !== 'string' || value.length > 500 || !value.startsWith('/') || value.startsWith('//')) return false;
  if (/[\s\\]/.test(value) || /(^|\/)\.\.?(\/|$|\?|#)/.test(value)) return false;
  return INTERNAL_PREFIXES.some(prefix => value === prefix || ['/', '?', '#'].some(next => value.startsWith(prefix + next)));
}

export function normalizeBackground(input: unknown, allowSlideshow = true): Background {
  const fallback: Background = { kind: 'daylight' };
  if (!isObject(input)) return fallback;
  switch (input.kind) {
    case 'preset':
      return (PRESET_IDS as readonly string[]).includes(input.id as string) ? { kind: 'preset', id: input.id as PresetId } : fallback;
    case 'color': {
      const value = color(input.color);
      return value ? { kind: 'color', color: value } : fallback;
    }
    case 'gradient': {
      const stops = Array.isArray(input.stops) ? input.stops.map(color) : [];
      if (stops.length < 2 || stops.length > 3 || stops.some(stop => !stop)) return fallback;
      return { kind: 'gradient', stops: stops as string[], angle: clamp(input.angle, 0, 360, 135) };
    }
    case 'image': {
      const assetId = id(input.assetId);
      if (!assetId) return fallback;
      const focus = isObject(input.focus) ? input.focus : {};
      return { kind: 'image', assetId, fit: oneOf(input.fit, ['cover', 'contain'] as const, 'cover'), focus: { x: clamp(focus.x, 0, 100, 50), y: clamp(focus.y, 0, 100, 50) } };
    }
    case 'slideshow': {
      if (!allowSlideshow) return fallback;
      const items = (Array.isArray(input.items) ? input.items : [])
        .filter(item => isObject(item) && item.kind !== 'slideshow' && item.kind !== 'daylight')
        .map(item => normalizeBackground(item, false))
        .filter(item => item.kind !== 'daylight')
        .slice(0, 12);
      if (items.length < 2) return items[0] ?? fallback;
      return { kind: 'slideshow', items, minutes: clamp(input.minutes, 1, 240, 30), shuffle: bool(input.shuffle, false) };
    }
    default:
      return fallback;
  }
}

function normalizeDockItem(input: unknown, allowFolder: boolean): DockItem | null {
  if (!isObject(input) || typeof input.id !== 'string' || !ITEM_ID.test(input.id)) return null;
  const base = {
    id: input.id,
    label: label(input.label, 40) ?? '',
    icon: typeof input.icon === 'string' && ICON.test(input.icon) ? input.icon : 'link',
  };
  const itemColor = color(input.color);
  switch (input.kind) {
    case 'screen':
      return typeof input.path === 'string' && isInternalPath(input.path) ? { ...base, kind: 'screen', path: input.path } : null;
    case 'view':
      return typeof input.path === 'string' && isInternalPath(input.path) ? { ...base, kind: 'view', path: input.path, color: itemColor } : null;
    case 'link':
      return typeof input.url === 'string' && isSafeUrl(input.url) ? { ...base, kind: 'link', url: input.url, color: itemColor } : null;
    case 'action':
      return id(input.actionId) ? { ...base, kind: 'action', actionId: input.actionId as string, color: itemColor } : null;
    case 'folder': {
      if (!allowFolder) return null;
      const items = normalizeDockItems(input.items, MAX_FOLDER_ITEMS, false);
      return { ...base, kind: 'folder', color: itemColor, items };
    }
    default:
      return null;
  }
}

export function normalizeDockItems(input: unknown, max: number, allowFolder = true): DockItem[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const items: DockItem[] = [];
  for (const entry of input) {
    const item = normalizeDockItem(entry, allowFolder);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    if (items.length >= max) break;
  }
  return items;
}

function normalizeSearchProviders(input: unknown): SearchProvider[] {
  if (!Array.isArray(input)) return DEFAULT_SEARCH_PROVIDERS.map(provider => ({ ...provider }));
  const seen = new Set<string>();
  const providers: SearchProvider[] = [];
  for (const entry of input) {
    if (!isObject(entry) || typeof entry.id !== 'string' || !ITEM_ID.test(entry.id) || seen.has(entry.id)) continue;
    const name = label(entry.name, 40);
    const url = typeof entry.url === 'string' && entry.url.includes('{q}') && isSafeUrl(entry.url.replace('{q}', 'x')) ? entry.url : null;
    if (!name || !url) continue;
    seen.add(entry.id);
    providers.push({ id: entry.id, name, url });
    if (providers.length >= 12) break;
  }
  return providers;
}

export function normalizeProfileConfig(input: unknown): DeskProfileConfig {
  if (!isObject(input)) throw new DeskConfigError('Cấu hình bàn làm việc không hợp lệ');
  if (bytes(input) > PROFILE_MAX_BYTES) throw new DeskConfigError('Cấu hình bàn làm việc vượt quá 64 KB');
  const appearance = isObject(input.appearance) ? input.appearance : {};
  const greeting = isObject(input.greeting) ? input.greeting : {};
  const dock = isObject(input.dock) ? input.dock : {};
  return {
    schemaVersion: 1,
    appearance: {
      background: normalizeBackground(appearance.background),
      dim: clamp(appearance.dim, 0, 80, 25),
      blur: clamp(appearance.blur, 0, 24, 0),
      surface: oneOf(appearance.surface, ['glass', 'solid', 'outline'] as const, 'glass'),
      surfaceOpacity: clamp(appearance.surfaceOpacity, 40, 100, 72),
      accent: color(appearance.accent),
      density: oneOf(appearance.density, ['comfortable', 'compact'] as const, 'comfortable'),
      fontScale: clamp(appearance.fontScale, 90, 125, 100),
      radius: clamp(appearance.radius, 4, 20, 14),
      motion: oneOf(appearance.motion, ['auto', 'full', 'reduced'] as const, 'auto'),
    },
    greeting: {
      show: bool(greeting.show, true),
      name: label(greeting.name, 40),
      lunar: bool(greeting.lunar, true),
      holidays: bool(greeting.holidays, true),
    },
    dock: {
      position: oneOf(dock.position, ['bottom', 'left', 'right', 'hidden'] as const, 'bottom'),
      autoHide: bool(dock.autoHide, false),
      magnify: bool(dock.magnify, true),
      items: normalizeDockItems(dock.items, MAX_DOCK_ITEMS),
    },
    startPage: oneOf(input.startPage, ['desk', 'ops', 'work'] as const, 'desk'),
    searchProviders: normalizeSearchProviders(input.searchProviders),
    shortcuts: [],
    alerts: {},
    noteTemplates: [],
  };
}

function validTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function normalizeField(field: SettingField, value: unknown): unknown {
  switch (field.type) {
    case 'text':
    case 'textarea':
      return text(value, field.max, field.default ?? '');
    case 'number':
      return clamp(value, field.min, field.max, field.default);
    case 'boolean':
      return bool(value, field.default);
    case 'select':
      return oneOf(value, field.options.map(option => option.value), field.default);
    case 'multiselect': {
      if (!Array.isArray(value)) return [...field.default];
      const allowed = new Set(field.options.map(option => option.value));
      return unique(value.filter((entry): entry is string => typeof entry === 'string' && allowed.has(entry))).slice(0, field.max ?? field.options.length);
    }
    case 'color':
      return color(value) ?? field.default;
    case 'department':
    case 'target':
    case 'asset':
      return id(value);
    case 'targets':
      return Array.isArray(value) ? unique(value.map(id).filter((entry): entry is string => Boolean(entry))).slice(0, field.max) : [];
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : null;
    case 'datetime': {
      if (typeof value !== 'string' || value.length > 40) return null;
      const time = Date.parse(value);
      return Number.isNaN(time) ? null : new Date(time).toISOString();
    }
    case 'url':
      return typeof value === 'string' && isSafeUrl(value) ? value : null;
    case 'links':
      return normalizeDockItems(value, field.max);
    case 'list':
      if (!Array.isArray(value)) return [...(field.default ?? [])];
      return value
        .map(entry => label(entry, field.itemMax))
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, field.max);
    case 'searchProviders':
      return normalizeSearchProviders(value);
    case 'timezones':
      return Array.isArray(value)
        ? unique(value.filter((entry): entry is string => typeof entry === 'string' && entry.length <= 64 && validTimeZone(entry))).slice(0, field.max)
        : [];
    default:
      return null;
  }
}

export function normalizeWidgetSettings(def: WidgetDefinition, input: unknown): Record<string, unknown> {
  const source = isObject(input) ? input : {};
  const settings: Record<string, unknown> = {};
  for (const field of fieldsOf(def)) settings[field.key] = normalizeField(field, source[field.key]);
  return settings;
}

function normalizeStyle(input: unknown): WidgetStyle {
  const style = isObject(input) ? input : {};
  return {
    accent: color(style.accent),
    appearance: oneOf(style.appearance, ['inherit', 'glass', 'solid', 'outline', 'plain'] as const, 'inherit'),
    hideHeader: bool(style.hideHeader, false),
  };
}

function normalizeSchedule(input: unknown): SpaceSchedule | null {
  if (!isObject(input)) return null;
  const days = Array.isArray(input.days)
    ? unique(input.days.filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 7)).sort()
    : [];
  if (!days.length || typeof input.from !== 'string' || typeof input.to !== 'string' || !TIME.test(input.from) || !TIME.test(input.to)) return null;
  return { days, from: input.from, to: input.to };
}

export function normalizeSpaceConfig(input: unknown, role: Role): DeskSpaceConfig {
  if (!isObject(input)) throw new DeskConfigError('Cấu hình không gian không hợp lệ');
  if (bytes(input) > SPACE_MAX_BYTES) throw new DeskConfigError('Không gian vượt quá 256 KB, hãy bớt widget hoặc nội dung');
  const allowed = new Set(catalogFor(role).map(def => def.type));
  const seen = new Set<string>();
  const singletons = new Set<string>();
  const widgets: WidgetInstance[] = [];
  for (const entry of Array.isArray(input.widgets) ? input.widgets : []) {
    if (widgets.length >= MAX_WIDGETS) break;
    if (!isObject(entry) || typeof entry.id !== 'string' || !WIDGET_ID.test(entry.id) || seen.has(entry.id)) continue;
    const def = typeof entry.type === 'string' ? widgetDefinition(entry.type) : undefined;
    if (!def || !allowed.has(def.type)) continue;
    if (!def.multiple) {
      if (singletons.has(def.type)) continue;
      singletons.add(def.type);
    }
    seen.add(entry.id);
    const instance: WidgetInstance = {
      id: entry.id,
      type: def.type,
      title: label(entry.title, 60),
      settings: normalizeWidgetSettings(def, entry.settings),
      style: normalizeStyle(entry.style),
    };
    if (typeof entry.templateKey === 'string' && ITEM_ID.test(entry.templateKey)) instance.templateKey = entry.templateKey;
    if (entry.locked === true) instance.locked = true;
    widgets.push(instance);
  }
  const layouts = normalizeLayouts(
    input.layouts,
    widgets.map(widget => ({ id: widget.id, size: widgetDefinition(widget.type)!.size })),
  );
  return {
    schemaVersion: 1,
    background: input.background == null ? null : normalizeBackground(input.background),
    focusDepartmentId: id(input.focusDepartmentId),
    widgets,
    layouts,
    schedule: normalizeSchedule(input.schedule),
  };
}
