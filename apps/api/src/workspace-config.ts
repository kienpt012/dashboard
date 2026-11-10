import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
const WIDGET_TYPES = new Set(['clock', 'weather', 'notes', 'tasks', 'focus', 'calendar', 'ioc', 'work', 'api', 'embed', 'calculator', 'countdown']);
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function invalid(detail: string): never {
  throw new BadRequestException(`Cấu hình bàn làm việc không hợp lệ: ${detail}`);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(label);
  return value as Record<string, unknown>;
}

function string(value: unknown, max: number, label: string, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) invalid(label);
  return value;
}

function number(value: unknown, min: number, max: number, label: string, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) invalid(label);
  return value;
}

function array(value: unknown, max: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > max) invalid(label);
  return value;
}

/** Only inert JSON is persisted: no prototype keys, scripts, or executable expressions. */
function validateJson(value: unknown, depth = 0, budget = { nodes: 0 }) {
  if (++budget.nodes > 30_000 || depth > 12) invalid('dữ liệu lồng nhau quá lớn');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (value.length > 1_500_000) invalid('chuỗi quá dài');
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid('giá trị số');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 1000) invalid('danh sách quá dài');
    for (const child of value) validateJson(child, depth + 1, budget);
    return;
  }
  const record = object(value, 'dữ liệu JSON');
  if (Object.keys(record).length > 100) invalid('quá nhiều thuộc tính');
  for (const [key, child] of Object.entries(record)) {
    if (DANGEROUS_KEYS.has(key) || key.length > 100) invalid('tên thuộc tính');
    validateJson(child, depth + 1, budget);
  }
}

export function validateWorkspaceLink(value: unknown, allowRelative = true): string {
  const text = string(value, 2048, 'địa chỉ liên kết');
  if (allowRelative && /^\/(?!\/)/.test(text) && !/[\\\u0000-\u0020]/.test(text)) return text;
  let url: URL;
  try { url = new URL(text); } catch { return invalid('địa chỉ liên kết'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) invalid('liên kết phải dùng HTTP hoặc HTTPS, không kèm mật khẩu');
  return text;
}

function wallpaper(value: unknown) {
  const text = string(value, 1_500_000, 'hình nền', true);
  if (!text) return;
  if (!text.startsWith('data:')) invalid('hãy tải ảnh PNG, JPEG hoặc WebP từ thiết bị');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(text);
  if (!match) invalid('ảnh nền chỉ nhận PNG, JPEG hoặc WebP');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 1024 * 1024 || bytes.length < 12) invalid('ảnh nền tối đa 1 MB');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!(match[1] === 'png' && png || match[1] === 'jpeg' && jpeg || match[1] === 'webp' && webp)) invalid('nội dung ảnh nền không đúng định dạng');
}

export function validateWorkspaceConfig(value: unknown): Prisma.InputJsonObject {
  validateJson(value);
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_CONFIG_BYTES) invalid('tổng dung lượng tối đa 2 MB');
  const config = object(value, 'cấu hình');
  if (config.schemaVersion !== 1) invalid('phiên bản định dạng');
  const appearance = object(config.appearance, 'giao diện');
  if (appearance.daylight !== undefined && typeof appearance.daylight !== 'boolean') invalid('chế độ hình nền theo giờ');
  string(appearance.wallpaper, 100, 'mẫu hình nền');
  wallpaper(appearance.customWallpaper);
  const accent = string(appearance.accent, 30, 'màu chủ đạo');
  if (!/^#[\da-f]{6}$/i.test(accent)) invalid('màu chủ đạo phải có dạng #RRGGBB');
  number(appearance.blur, 0, 40, 'độ mờ');
  number(appearance.overlay, 0, 90, 'độ phủ hình nền');
  const spaces = array(config.spaces, 8, 'tối đa 8 không gian');
  if (!spaces.length) invalid('cần ít nhất một không gian');
  const ids = new Set<string>();
  for (const raw of spaces) {
    const space = object(raw, 'không gian');
    const id = string(space.id, 100, 'mã không gian');
    if (ids.has(id)) invalid('mã không gian bị trùng');
    ids.add(id);
    string(space.name, 80, 'tên không gian');
    const widgetIds = new Set<string>();
    for (const rawWidget of array(space.widgets, 40, 'tối đa 40 tiện ích mỗi không gian')) {
      const widget = object(rawWidget, 'tiện ích');
      const widgetId = string(widget.id, 100, 'mã tiện ích');
      if (widgetIds.has(widgetId)) invalid('mã tiện ích bị trùng');
      widgetIds.add(widgetId);
      if (!WIDGET_TYPES.has(string(widget.type, 40, 'loại tiện ích'))) invalid('loại tiện ích chưa được hỗ trợ');
      string(widget.title, 120, 'tên tiện ích');
      const x = number(widget.x, 0, 11, 'vị trí ngang', true);
      number(widget.y, 0, 1000, 'vị trí dọc', true);
      const w = number(widget.w, 1, 12, 'chiều rộng', true);
      if (x + w > 12) invalid('tiện ích vượt ngoài lưới');
      number(widget.h, 2, 24, 'chiều cao', true);
      const settings = object(widget.settings, 'thiết lập tiện ích');
      if (Buffer.byteLength(JSON.stringify(settings), 'utf8') > 128 * 1024) invalid('thiết lập tiện ích quá lớn');
      if (settings.url !== undefined && settings.url !== '') validateWorkspaceLink(settings.url, widget.type !== 'api' && widget.type !== 'embed');
    }
  }
  const activeSpace = string(config.activeSpace, 100, 'không gian đang mở');
  if (!ids.has(activeSpace)) invalid('không tìm thấy không gian đang mở');
  const shortcutIds = new Set<string>();
  for (const raw of array(config.shortcuts, 80, 'tối đa 80 lối tắt')) {
    const shortcut = object(raw, 'lối tắt');
    const id = string(shortcut.id, 100, 'mã lối tắt');
    if (shortcutIds.has(id)) invalid('mã lối tắt bị trùng');
    shortcutIds.add(id);
    string(shortcut.title, 80, 'tên lối tắt');
    validateWorkspaceLink(shortcut.url);
    string(shortcut.icon, 40, 'biểu tượng');
    if (!/^#[\da-f]{6}$/i.test(string(shortcut.color, 7, 'màu lối tắt'))) invalid('màu lối tắt phải có dạng #RRGGBB');
    if (shortcut.hotkey !== undefined && shortcut.hotkey !== '' && !/^[1-9]$/.test(string(shortcut.hotkey, 1, 'phím tắt'))) invalid('phím tắt từ 1 đến 9');
  }
  return config as Prisma.InputJsonObject;
}
