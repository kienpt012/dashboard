import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  DocumentStatus,
  FeedbackClosureReason,
  FeedbackStatus,
  Prisma,
  Role,
  TargetDirection,
  TargetStatus,
} from '@prisma/client';
import { Type, Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { Response } from 'express';
import { type Actor, audit, getActor } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { calculateProgress } from './metrics';
import { currentVietnamYear } from './planning-date';
import { PrismaService } from './prisma.service';

type SanitizeHtmlOptions = Record<string, unknown>;
const sanitizeHtml = require('sanitize-html') as (html: string, options: SanitizeHtmlOptions) => string;

export const PUBLIC_DASHBOARD_ID = 'public-home';
export const PUBLIC_DASHBOARD_SCHEMA_VERSION = 1 as const;
export const PUBLIC_DASHBOARD_CONFIG_MAX_BYTES = 5 * 1024 * 1024;
export const PUBLIC_DASHBOARD_BREAKPOINTS = ['desktop', 'tablet', 'mobile'] as const;
export const PUBLIC_DASHBOARD_COLUMNS = { desktop: 12, tablet: 8, mobile: 4 } as const;
export const PUBLIC_DASHBOARD_WIDGET_TYPES = [
  'overviewMetrics',
  'targetList',
  'departmentProgress',
  'feedbackList',
  'documentList',
  'richText',
  'customHtml',
  'cta',
] as const;

export type PublicDashboardBreakpoint = typeof PUBLIC_DASHBOARD_BREAKPOINTS[number];
export type PublicDashboardWidgetType = typeof PUBLIC_DASHBOARD_WIDGET_TYPES[number];

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

export interface PublicDashboardTheme {
  accent: string;
  background: string;
  surface: string;
  text: string;
  contentWidth: number;
  radius: number;
}

export interface PublicDashboardLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export type CustomHtmlBindingSource = 'overview' | 'target' | 'document';

export interface CustomHtmlBinding {
  slot: string;
  label: string;
  source: CustomHtmlBindingSource;
  field: string;
  format?: string;
  targetKey?: string;
  documentId?: string;
}

export interface PublicDashboardWidget {
  id: string;
  type: PublicDashboardWidgetType;
  title?: string;
  settings: Record<string, unknown> & {
    html?: string;
    bindings?: CustomHtmlBinding[];
    mode?: 'highlight' | 'all' | 'selected';
    targetKeys?: string[];
    publicationIds?: string[];
    maxItems?: number;
    body?: string;
    label?: string;
    href?: string;
    metricKeys?: string[];
  };
}

export interface PublicDashboardConfig {
  schemaVersion: 1;
  theme: PublicDashboardTheme;
  settings: {
    showHeader: boolean;
    showFooter: boolean;
  };
  widgets: PublicDashboardWidget[];
  layouts: Record<PublicDashboardBreakpoint, PublicDashboardLayoutItem[]>;
}

const WIDGET_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const PUBLIC_TARGET_KEY_PATTERN = /^target_[A-Za-z0-9_-]{22}$/;
const PUBLICATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SLOT_PATTERN = /^[a-z][a-z0-9_-]{0,49}$/;
const SAFE_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const ALLOWED_METRIC_KEYS = new Set([
  'year', 'departments', 'total', 'completed', 'onTrack', 'overallProgress', 'updatedAt',
]);
const ALLOWED_BINDING_FORMATS = new Set(['text', 'number', 'integer', 'percent', 'date', 'datetime']);

export const PUBLIC_DASHBOARD_BINDING_FIELDS = {
  overview: ['year', 'total', 'completed', 'onTrack', 'overallProgress', 'updatedAt'],
  target: [
    'code', 'title', 'currentValue', 'targetValue', 'unit', 'progress',
    'department', 'status', 'publishedAt',
  ],
  document: ['code', 'title', 'summary', 'publishedAt', 'downloadUrl'],
} as const;

const BINDING_FIELDS = {
  overview: new Set<string>(PUBLIC_DASHBOARD_BINDING_FIELDS.overview),
  target: new Set<string>(PUBLIC_DASHBOARD_BINDING_FIELDS.target),
  document: new Set<string>(PUBLIC_DASHBOARD_BINDING_FIELDS.document),
};

export const PUBLIC_DASHBOARD_TEMPLATES = [
  { key: 'transparency', name: 'Minh bạch điều hành', description: 'Cân bằng giữa chỉ tiêu, đơn vị, phản ánh và văn bản.' },
  { key: 'compact', name: 'Chỉ tiêu trọng tâm', description: 'Trang gọn, tập trung vào số liệu và chỉ tiêu nổi bật.' },
  { key: 'documents', name: 'Thông tin và văn bản', description: 'Ưu tiên văn bản công khai bên cạnh kết quả chỉ tiêu.' },
] as const;

const TEMPLATE_KEYS = new Set(PUBLIC_DASHBOARD_TEMPLATES.map(item => item.key));

function defaultLayout(
  i: string,
  x: number,
  y: number,
  w: number,
  h: number,
  minW = 2,
  minH = 2,
): PublicDashboardLayoutItem {
  return { i, x, y, w, h, minW, minH };
}

export const DEFAULT_PUBLIC_DASHBOARD_CONFIG: PublicDashboardConfig = {
  schemaVersion: 1,
  theme: {
    accent: '#0f8378',
    background: '#f3f8f7',
    surface: '#ffffff',
    text: '#173633',
    contentWidth: 1440,
    radius: 18,
  },
  settings: { showHeader: true, showFooter: true },
  widgets: [
    {
      id: 'overview',
      type: 'overviewMetrics',
      title: 'Kết quả thực hiện chỉ tiêu',
      settings: { metricKeys: ['departments', 'total', 'completed', 'overallProgress'] },
    },
    {
      id: 'targets',
      type: 'targetList',
      title: 'Chỉ tiêu nổi bật',
      settings: { mode: 'highlight', maxItems: 6, targetKeys: [] },
    },
    {
      id: 'departments',
      type: 'departmentProgress',
      title: 'Tiến độ theo đơn vị',
      settings: { maxItems: 8 },
    },
    {
      id: 'feedbacks',
      type: 'feedbackList',
      title: 'Kết quả phản ánh đã xử lý',
      settings: { maxItems: 4 },
    },
    {
      id: 'documents',
      type: 'documentList',
      title: 'Văn bản mới công bố',
      settings: { maxItems: 6, publicationIds: [] },
    },
    {
      id: 'citizen-cta',
      type: 'cta',
      title: 'Kênh phục vụ người dân',
      settings: {
        body: 'Gửi phản ánh trực tuyến và theo dõi toàn bộ quá trình xử lý.',
        label: 'Gửi hoặc tra cứu phản ánh',
        href: '/phan-anh',
      },
    },
  ],
  layouts: {
    desktop: [
      defaultLayout('overview', 0, 0, 12, 5, 6, 5),
      defaultLayout('targets', 0, 5, 8, 8, 4, 5),
      defaultLayout('departments', 8, 5, 4, 8, 3, 5),
      defaultLayout('feedbacks', 0, 13, 6, 6, 4, 4),
      defaultLayout('documents', 6, 13, 6, 6, 4, 4),
      defaultLayout('citizen-cta', 0, 19, 12, 3, 6, 2),
    ],
    tablet: [
      defaultLayout('overview', 0, 0, 8, 6, 4, 6),
      defaultLayout('targets', 0, 6, 8, 8, 4, 5),
      defaultLayout('departments', 0, 14, 8, 6, 4, 4),
      defaultLayout('feedbacks', 0, 20, 4, 7, 4, 4),
      defaultLayout('documents', 4, 20, 4, 7, 4, 4),
      defaultLayout('citizen-cta', 0, 27, 8, 3, 4, 2),
    ],
    mobile: [
      defaultLayout('overview', 0, 0, 4, 7, 4, 7),
      defaultLayout('targets', 0, 7, 4, 12, 4, 6),
      defaultLayout('departments', 0, 19, 4, 8, 4, 5),
      defaultLayout('feedbacks', 0, 27, 4, 9, 4, 5),
      defaultLayout('documents', 0, 36, 4, 9, 4, 5),
      defaultLayout('citizen-cta', 0, 45, 4, 5, 4, 3),
    ],
  },
};

function cloneDefaultConfig(): PublicDashboardConfig {
  return JSON.parse(JSON.stringify(DEFAULT_PUBLIC_DASHBOARD_CONFIG)) as PublicDashboardConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[], path: string) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find(key => !allowedSet.has(key));
  if (unknown) throw new BadRequestException(`${path} chứa thuộc tính không được hỗ trợ: ${unknown}`);
}

function requiredString(value: unknown, path: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new BadRequestException(`${path} phải là chuỗi`);
  const result = value.trim();
  if (result.length < min || result.length > max) {
    throw new BadRequestException(`${path} phải có từ ${min} đến ${max} ký tự`);
  }
  if (/<!--[\s\S]*?-->|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) {
    throw new BadRequestException(`${path} chứa nội dung không hợp lệ`);
  }
  return result;
}

function optionalString(value: unknown, path: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredString(value, path, 1, max);
}

function requiredInteger(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new BadRequestException(`${path} phải là số nguyên từ ${min} đến ${max}`);
  }
  return Number(value);
}

function optionalInteger(value: unknown, path: string, min: number, max: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  return requiredInteger(value, path, min, max);
}

function stringArray(
  value: unknown,
  path: string,
  pattern: RegExp,
  maxItems: number,
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new BadRequestException(`${path} phải là danh sách tối đa ${maxItems} phần tử`);
  }
  const items = value.map((item, index) => {
    if (typeof item !== 'string' || !pattern.test(item)) {
      throw new BadRequestException(`${path}[${index}] không hợp lệ`);
    }
    return item;
  });
  if (new Set(items).size !== items.length) throw new BadRequestException(`${path} không được chứa giá trị trùng`);
  return items;
}

const SAFE_STYLE_LENGTH = /^(?:0|(?:\d{1,3}(?:\.\d{1,2})?)(?:px|rem|em|%|vh|vw))(?:\s+(?:0|(?:\d{1,3}(?:\.\d{1,2})?)(?:px|rem|em|%|vh|vw))){0,3}$/i;
const SAFE_STYLE_COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)|hsla?\([\d\s.,%]+\)|transparent|currentcolor|inherit)$/i;
const SAFE_STYLE_BORDER = /^(?:0|(?:\d{1,2}(?:\.\d{1,2})?)(?:px|rem|em)\s+(?:solid|dashed|dotted)\s+(?:#[0-9a-f]{3,8}|transparent|currentcolor|inherit))$/i;
const SAFE_STYLE_GRID = /^(?:none|(?:repeat\(\d{1,2},\s*)?(?:minmax\(0,\s*)?\d{1,3}(?:\.\d+)?fr\)?(?:\s+\d{1,3}(?:\.\d+)?fr)*(?:\))?)$/i;

const SANITIZE_OPTIONS: SanitizeHtmlOptions = {
  allowedTags: [
    'section', 'article', 'header', 'footer', 'main', 'div', 'span', 'p', 'strong', 'b', 'em', 'i',
    'u', 'small', 'mark', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
    'dl', 'dt', 'dd', 'blockquote', 'code', 'pre', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    '*': ['class', 'style', 'data-ioc-slot'],
    a: ['href', 'title', 'target', 'rel', 'class', 'style', 'data-ioc-slot'],
    th: ['colspan', 'rowspan', 'scope', 'class', 'style', 'data-ioc-slot'],
    td: ['colspan', 'rowspan', 'class', 'style', 'data-ioc-slot'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  allowedStyles: {
    '*': {
      color: [SAFE_STYLE_COLOR],
      'background-color': [SAFE_STYLE_COLOR],
      background: [SAFE_STYLE_COLOR],
      'font-size': [SAFE_STYLE_LENGTH],
      'font-weight': [/^(?:normal|bold|[1-9]00)$/i],
      'font-style': [/^(?:normal|italic)$/i],
      'line-height': [/^(?:normal|\d(?:\.\d{1,2})?|\d{1,3}(?:\.\d{1,2})?(?:px|rem|em|%))$/i],
      'text-align': [/^(?:left|right|center|justify|start|end)$/i],
      'text-decoration': [/^(?:none|underline|line-through)$/i],
      padding: [SAFE_STYLE_LENGTH],
      'padding-top': [SAFE_STYLE_LENGTH],
      'padding-right': [SAFE_STYLE_LENGTH],
      'padding-bottom': [SAFE_STYLE_LENGTH],
      'padding-left': [SAFE_STYLE_LENGTH],
      margin: [SAFE_STYLE_LENGTH, /^auto(?:\s+auto){0,3}$/i],
      'margin-top': [SAFE_STYLE_LENGTH, /^auto$/i],
      'margin-right': [SAFE_STYLE_LENGTH, /^auto$/i],
      'margin-bottom': [SAFE_STYLE_LENGTH, /^auto$/i],
      'margin-left': [SAFE_STYLE_LENGTH, /^auto$/i],
      border: [SAFE_STYLE_BORDER],
      'border-top': [SAFE_STYLE_BORDER],
      'border-right': [SAFE_STYLE_BORDER],
      'border-bottom': [SAFE_STYLE_BORDER],
      'border-left': [SAFE_STYLE_BORDER],
      'border-color': [SAFE_STYLE_COLOR],
      'border-width': [SAFE_STYLE_LENGTH],
      'border-style': [/^(?:none|solid|dashed|dotted)$/i],
      'border-radius': [SAFE_STYLE_LENGTH],
      display: [/^(?:block|inline|inline-block|flex|inline-flex|grid|none)$/i],
      gap: [SAFE_STYLE_LENGTH],
      'row-gap': [SAFE_STYLE_LENGTH],
      'column-gap': [SAFE_STYLE_LENGTH],
      flex: [/^(?:none|auto|initial|\d{1,2}(?:\.\d+)?(?:\s+\d{1,2}(?:\.\d+)?(?:\s+(?:auto|0|\d{1,3}(?:\.\d+)?(?:px|rem|em|%)))?)?)$/i],
      'flex-direction': [/^(?:row|row-reverse|column|column-reverse)$/i],
      'flex-wrap': [/^(?:nowrap|wrap|wrap-reverse)$/i],
      'align-items': [/^(?:stretch|center|start|end|flex-start|flex-end|baseline)$/i],
      'align-content': [/^(?:stretch|center|start|end|space-between|space-around|space-evenly)$/i],
      'align-self': [/^(?:auto|stretch|center|start|end|flex-start|flex-end|baseline)$/i],
      'justify-content': [/^(?:start|end|center|flex-start|flex-end|space-between|space-around|space-evenly)$/i],
      'justify-items': [/^(?:start|end|center|stretch)$/i],
      'justify-self': [/^(?:auto|start|end|center|stretch)$/i],
      'grid-template-columns': [SAFE_STYLE_GRID],
      'grid-column': [/^(?:auto|\d{1,3}(?:\s*\/\s*(?:span\s+)?\d{1,3})?)$/i],
      'grid-row': [/^(?:auto|\d{1,3}(?:\s*\/\s*(?:span\s+)?\d{1,3})?)$/i],
      width: [SAFE_STYLE_LENGTH, /^auto$/i],
      'min-width': [SAFE_STYLE_LENGTH, /^auto$/i],
      'max-width': [SAFE_STYLE_LENGTH, /^none$/i],
      height: [SAFE_STYLE_LENGTH, /^auto$/i],
      'min-height': [SAFE_STYLE_LENGTH, /^auto$/i],
      'max-height': [SAFE_STYLE_LENGTH, /^none$/i],
    },
  },
  transformTags: {
    a: (_tagName: string, attribs: Record<string, string>) => ({
      tagName: 'a',
      attribs: {
        ...attribs,
        ...(attribs.target === '_blank' ? { rel: 'noopener noreferrer' } : {}),
      },
    }),
  },
};

export function sanitizePublicDashboardHtml(rawHtml: unknown): string {
  if (typeof rawHtml !== 'string') throw new BadRequestException('HTML tùy biến phải là chuỗi');
  const html = rawHtml.trim();
  if (!html || html.length > 30_000) {
    throw new BadRequestException('HTML tùy biến phải có nội dung và không vượt quá 30.000 ký tự');
  }
  const decodedForScan = html
    .replace(/&#x([0-9a-f]{1,6});?/gi, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : ' ';
    })
    .replace(/&#([0-9]{1,7});?/g, (_match, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : ' ';
    })
    .replace(/&(?:colon);/gi, ':')
    .replace(/&(?:tab|newline);/gi, ' ');
  const dangerous = /<\s*\/?\s*(?:script|style|iframe|object|embed|form|input|button|textarea|select|option|link|meta|base|svg|math)\b|\bon[a-z]+\s*=|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|(?:^|[;"'])\s*(?:position|z-index|animation(?:-[a-z-]+)?|transition(?:-[a-z-]+)?|transform|content)\s*:|url\s*\(|@import|expression\s*\(/i;
  const compactProtocols = decodedForScan.replace(/[\u0000-\u0020]+/g, '');
  if (dangerous.test(decodedForScan) || /(?:javascript|vbscript):|data:text\/html/i.test(compactProtocols)) {
    throw new BadRequestException('HTML tùy biến chứa thẻ, sự kiện, URL hoặc CSS không an toàn');
  }
  const clean = sanitizeHtml(html, SANITIZE_OPTIONS).trim();
  if (!clean) throw new BadRequestException('HTML tùy biến không còn nội dung hợp lệ sau khi kiểm tra');
  return clean;
}

function parseBindings(value: unknown, html: string, path: string): CustomHtmlBinding[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30) {
    throw new BadRequestException(`${path} phải là danh sách tối đa 30 binding`);
  }
  const slots = new Set<string>();
  return value.map((raw, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(raw)) throw new BadRequestException(`${itemPath} không hợp lệ`);
    assertKeys(raw, ['slot', 'label', 'source', 'field', 'format', 'targetKey', 'documentId'], itemPath);
    const slot = requiredString(raw.slot, `${itemPath}.slot`, 1, 50);
    if (!SLOT_PATTERN.test(slot)) throw new BadRequestException(`${itemPath}.slot không hợp lệ`);
    if (slots.has(slot)) throw new BadRequestException(`${path} không được trùng tên slot`);
    slots.add(slot);
    const label = requiredString(raw.label, `${itemPath}.label`, 1, 100);
    if (!['overview', 'target', 'document'].includes(String(raw.source))) {
      throw new BadRequestException(`${itemPath}.source không được hỗ trợ`);
    }
    const source = raw.source as CustomHtmlBindingSource;
    const field = requiredString(raw.field, `${itemPath}.field`, 1, 50);
    if (!BINDING_FIELDS[source].has(field)) {
      throw new BadRequestException(`${itemPath}.field không thuộc danh mục dữ liệu công khai`);
    }
    const format = optionalString(raw.format, `${itemPath}.format`, 20);
    if (format && !ALLOWED_BINDING_FORMATS.has(format)) {
      throw new BadRequestException(`${itemPath}.format không được hỗ trợ`);
    }
    const targetKey = optionalString(raw.targetKey, `${itemPath}.targetKey`, 64);
    const documentId = optionalString(raw.documentId, `${itemPath}.documentId`, 64);
    if (source === 'target' && (!targetKey || !PUBLIC_TARGET_KEY_PATTERN.test(targetKey))) {
      throw new BadRequestException(`${itemPath}.targetKey là bắt buộc đối với nguồn chỉ tiêu`);
    }
    if (source === 'document' && (!documentId || !PUBLICATION_ID_PATTERN.test(documentId))) {
      throw new BadRequestException(`${itemPath}.documentId là bắt buộc đối với nguồn văn bản`);
    }
    if (source !== 'target' && targetKey) throw new BadRequestException(`${itemPath}.targetKey không phù hợp với nguồn đã chọn`);
    if (source !== 'document' && documentId) throw new BadRequestException(`${itemPath}.documentId không phù hợp với nguồn đã chọn`);
    const escapedSlot = slot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const referenced = new RegExp(`\\{\\{\\s*${escapedSlot}\\s*\\}\\}|data-ioc-slot\\s*=\\s*["']${escapedSlot}["']`, 'i').test(html);
    if (!referenced) throw new BadRequestException(`${itemPath}.slot chưa được đặt trong HTML`);
    return {
      slot,
      label,
      source,
      field,
      ...(format ? { format } : {}),
      ...(targetKey ? { targetKey } : {}),
      ...(documentId ? { documentId } : {}),
    };
  });
}

function safeHref(value: unknown, path: string): string {
  const href = requiredString(value, path, 1, 500);
  const trustedOrigin = 'https://ioc.internal.invalid';
  if (/^#[A-Za-z0-9_-]+$/.test(href)) return href;
  if (href.startsWith('/') && !href.startsWith('//') && !/[\\\u0000-\u001f\u007f]/.test(href) && !/%5c/i.test(href)) {
    try {
      const internal = new URL(href, trustedOrigin);
      if (internal.origin === trustedOrigin) return `${internal.pathname}${internal.search}${internal.hash}`;
    } catch {
      // Continue to the external allowlist validation below.
    }
  }
  try {
    const url = new URL(href);
    const allowedHosts = new Set(
      (process.env.PUBLIC_DASHBOARD_ALLOWED_LINK_HOSTS ?? '')
        .split(',')
        .map(host => host.trim().toLowerCase().replace(/\.$/, ''))
        .filter(host => /^[a-z0-9.-]+$/.test(host)),
    );
    if (
      url.protocol === 'https:'
      && !url.username
      && !url.password
      && allowedHosts.has(url.hostname.toLowerCase().replace(/\.$/, ''))
    ) return url.toString();
  } catch {
    // Chuyển về thông báo nghiệp vụ thống nhất bên dưới.
  }
  throw new BadRequestException(`${path} chỉ chấp nhận đường dẫn nội bộ hoặc host HTTPS đã được quản trị viên cho phép`);
}

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = channels.map(channel => (
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(left: string, right: string) {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  return (Math.max(leftLuminance, rightLuminance) + 0.05)
    / (Math.min(leftLuminance, rightLuminance) + 0.05);
}

function assertThemeContrast(theme: PublicDashboardTheme) {
  if (contrastRatio(theme.text, theme.background) < 4.5) {
    throw new BadRequestException('Màu chữ và màu nền phải đạt độ tương phản tối thiểu 4.5:1');
  }
  if (contrastRatio(theme.text, theme.surface) < 4.5) {
    throw new BadRequestException('Màu chữ và màu khối nội dung phải đạt độ tương phản tối thiểu 4.5:1');
  }
  if (contrastRatio(theme.accent, theme.surface) < 3) {
    throw new BadRequestException('Màu nhấn và màu khối nội dung phải đạt độ tương phản tối thiểu 3:1');
  }
}

function parseWidgetSettings(
  type: PublicDashboardWidgetType,
  raw: unknown,
  path: string,
): PublicDashboardWidget['settings'] {
  if (!isRecord(raw)) throw new BadRequestException(`${path} phải là đối tượng`);
  switch (type) {
    case 'overviewMetrics': {
      assertKeys(raw, ['metricKeys'], path);
      const metricKeys = stringArray(raw.metricKeys, `${path}.metricKeys`, /^[A-Za-z][A-Za-z0-9]*$/, 10);
      if (metricKeys.some(key => !ALLOWED_METRIC_KEYS.has(key))) {
        throw new BadRequestException(`${path}.metricKeys chứa số liệu không được hỗ trợ`);
      }
      return { metricKeys: metricKeys.length ? metricKeys : ['departments', 'total', 'completed', 'overallProgress'] };
    }
    case 'targetList': {
      assertKeys(raw, ['mode', 'maxItems', 'targetKeys'], path);
      const mode = raw.mode === undefined ? 'highlight' : String(raw.mode);
      if (!['highlight', 'all', 'selected'].includes(mode)) throw new BadRequestException(`${path}.mode không hợp lệ`);
      const targetKeys = stringArray(raw.targetKeys, `${path}.targetKeys`, PUBLIC_TARGET_KEY_PATTERN, 100);
      if (mode === 'selected' && !targetKeys.length) {
        throw new BadRequestException(`${path}.targetKeys phải có ít nhất một chỉ tiêu khi chọn chế độ selected`);
      }
      return {
        mode: mode as 'highlight' | 'all' | 'selected',
        maxItems: optionalInteger(raw.maxItems, `${path}.maxItems`, 1, 100) ?? 6,
        targetKeys,
      };
    }
    case 'departmentProgress':
    case 'feedbackList': {
      assertKeys(raw, ['maxItems'], path);
      return { maxItems: optionalInteger(raw.maxItems, `${path}.maxItems`, 1, 24) ?? (type === 'feedbackList' ? 4 : 8) };
    }
    case 'documentList': {
      assertKeys(raw, ['maxItems', 'publicationIds'], path);
      return {
        maxItems: optionalInteger(raw.maxItems, `${path}.maxItems`, 1, 30) ?? 6,
        publicationIds: stringArray(raw.publicationIds, `${path}.publicationIds`, PUBLICATION_ID_PATTERN, 100),
      };
    }
    case 'richText': {
      assertKeys(raw, ['body'], path);
      return { body: requiredString(raw.body, `${path}.body`, 1, 8_000) };
    }
    case 'customHtml': {
      assertKeys(raw, ['html', 'bindings'], path);
      const html = sanitizePublicDashboardHtml(raw.html);
      return { html, bindings: parseBindings(raw.bindings, html, `${path}.bindings`) };
    }
    case 'cta': {
      assertKeys(raw, ['body', 'label', 'href'], path);
      return {
        body: requiredString(raw.body, `${path}.body`, 1, 1_000),
        label: requiredString(raw.label, `${path}.label`, 1, 100),
        href: safeHref(raw.href, `${path}.href`),
      };
    }
  }
}

function parseLayout(
  raw: unknown,
  breakpoint: PublicDashboardBreakpoint,
  widgetTypes: Map<string, PublicDashboardWidgetType>,
): PublicDashboardLayoutItem[] {
  const path = `config.layouts.${breakpoint}`;
  if (!Array.isArray(raw) || raw.length !== widgetTypes.size) {
    throw new BadRequestException(`${path} phải chứa đúng một vị trí cho mỗi widget`);
  }
  const cols = PUBLIC_DASHBOARD_COLUMNS[breakpoint];
  const seen = new Set<string>();
  const items = raw.map((entry, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(entry)) throw new BadRequestException(`${itemPath} không hợp lệ`);
    assertKeys(entry, ['i', 'x', 'y', 'w', 'h', 'minW', 'minH'], itemPath);
    const i = requiredString(entry.i, `${itemPath}.i`, 1, 64);
    if (!widgetTypes.has(i) || seen.has(i)) throw new BadRequestException(`${itemPath}.i không khớp widget hoặc bị trùng`);
    seen.add(i);
    const x = requiredInteger(entry.x, `${itemPath}.x`, 0, cols - 1);
    const y = requiredInteger(entry.y, `${itemPath}.y`, 0, 10_000);
    const w = requiredInteger(entry.w, `${itemPath}.w`, 1, cols);
    const h = requiredInteger(entry.h, `${itemPath}.h`, 1, 40);
    if (x + w > cols) throw new BadRequestException(`${itemPath} vượt khỏi lưới ${cols} cột`);
    const minW = optionalInteger(entry.minW, `${itemPath}.minW`, 1, cols);
    const minH = optionalInteger(entry.minH, `${itemPath}.minH`, 1, 40);
    if (minW && minW > w) throw new BadRequestException(`${itemPath}.minW không được lớn hơn w`);
    if (minH && minH > h) throw new BadRequestException(`${itemPath}.minH không được lớn hơn h`);
    return { i, x, y, w, h, ...(minW ? { minW } : {}), ...(minH ? { minH } : {}) };
  });
  const overlaps = (left: PublicDashboardLayoutItem, right: PublicDashboardLayoutItem) => left.x < right.x + right.w
    && left.x + left.w > right.x
    && left.y < right.y + right.h
    && left.y + left.h > right.y;
  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      const left = items[leftIndex];
      const right = items[rightIndex];
      if (overlaps(left, right)) throw new BadRequestException(`${path} có widget ${left.i} chồng lên ${right.i}`);
    }
  }

  // Nâng cấu hình cũ lên chiều cao tối thiểu theo loại khối rồi đẩy các khối
  // nằm sau xuống dưới. Cấu hình vốn chồng lấn vẫn bị từ chối ở bước trên.
  const expanded = items.map(item => {
    const type = widgetTypes.get(item.i)!;
    const minHeight = PUBLIC_DASHBOARD_WIDGET_MIN_HEIGHTS[type][breakpoint];
    return {
      ...item,
      h: Math.max(item.h, minHeight),
      minH: Math.max(item.minH ?? 1, minHeight),
    };
  });
  const placed: PublicDashboardLayoutItem[] = [];
  const sorted = expanded
    .map((item, index) => ({ item: { ...item }, index }))
    .sort((left, right) => left.item.y - right.item.y || left.item.x - right.item.x || left.index - right.index);
  for (const entry of sorted) {
    const candidate = entry.item;
    let collisions = placed.filter(other => overlaps(candidate, other));
    while (collisions.length) {
      candidate.y = Math.max(...collisions.map(other => other.y + other.h));
      collisions = placed.filter(other => overlaps(candidate, other));
    }
    placed.push(candidate);
  }
  const byId = new Map(placed.map(item => [item.i, item]));
  return items.map(item => byId.get(item.i)!);
}

/**
 * Kiểm tra nghiêm ngặt và trả về cấu hình canonical. Hàm không giữ thuộc tính
 * lạ và HTML được làm sạch trước khi cấu hình có thể được lưu hoặc công bố.
 */
export function normalizePublicDashboardConfig(input: unknown): PublicDashboardConfig {
  if (!isRecord(input)) throw new BadRequestException('config phải là đối tượng');
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > PUBLIC_DASHBOARD_CONFIG_MAX_BYTES) {
    throw new BadRequestException('config không được vượt quá 5 MB');
  }
  assertKeys(input, ['schemaVersion', 'theme', 'settings', 'widgets', 'layouts'], 'config');
  if (input.schemaVersion !== PUBLIC_DASHBOARD_SCHEMA_VERSION) {
    throw new BadRequestException(`Chỉ hỗ trợ schemaVersion ${PUBLIC_DASHBOARD_SCHEMA_VERSION}`);
  }
  if (!isRecord(input.theme)) throw new BadRequestException('config.theme phải là đối tượng');
  const themeInput = input.theme;
  assertKeys(themeInput, ['accent', 'background', 'surface', 'text', 'contentWidth', 'radius'], 'config.theme');
  const readColor = (key: keyof Pick<PublicDashboardTheme, 'accent' | 'background' | 'surface' | 'text'>) => {
    const value = requiredString(themeInput[key], `config.theme.${key}`, 7, 7);
    if (!SAFE_COLOR_PATTERN.test(value)) throw new BadRequestException(`config.theme.${key} phải là màu hex 6 ký tự`);
    return value.toLowerCase();
  };
  const theme: PublicDashboardTheme = {
    accent: readColor('accent'),
    background: readColor('background'),
    surface: readColor('surface'),
    text: readColor('text'),
    contentWidth: requiredInteger(themeInput.contentWidth, 'config.theme.contentWidth', 960, 1920),
    radius: requiredInteger(themeInput.radius, 'config.theme.radius', 0, 36),
  };
  assertThemeContrast(theme);
  if (!isRecord(input.settings)) throw new BadRequestException('config.settings phải là đối tượng');
  assertKeys(input.settings, ['showHeader', 'showFooter'], 'config.settings');
  if (typeof input.settings.showHeader !== 'boolean' || typeof input.settings.showFooter !== 'boolean') {
    throw new BadRequestException('config.settings.showHeader và showFooter phải là boolean');
  }
  if (!Array.isArray(input.widgets) || input.widgets.length < 1 || input.widgets.length > 40) {
    throw new BadRequestException('config.widgets phải có từ 1 đến 40 widget');
  }
  const widgetTypes = new Map<string, PublicDashboardWidgetType>();
  const widgets = input.widgets.map((raw, index): PublicDashboardWidget => {
    const path = `config.widgets[${index}]`;
    if (!isRecord(raw)) throw new BadRequestException(`${path} không hợp lệ`);
    assertKeys(raw, ['id', 'type', 'title', 'settings'], path);
    const id = requiredString(raw.id, `${path}.id`, 1, 64);
    if (!WIDGET_ID_PATTERN.test(id)) throw new BadRequestException(`${path}.id không hợp lệ`);
    if (widgetTypes.has(id)) throw new BadRequestException(`${path}.id bị trùng`);
    if (!PUBLIC_DASHBOARD_WIDGET_TYPES.includes(raw.type as PublicDashboardWidgetType)) {
      throw new BadRequestException(`${path}.type không thuộc thư viện widget`);
    }
    const type = raw.type as PublicDashboardWidgetType;
    widgetTypes.set(id, type);
    const title = optionalString(raw.title, `${path}.title`, 160);
    return {
      id,
      type,
      ...(title ? { title } : {}),
      settings: parseWidgetSettings(type, raw.settings, `${path}.settings`),
    };
  });
  if (!isRecord(input.layouts)) throw new BadRequestException('config.layouts phải là đối tượng');
  assertKeys(input.layouts, PUBLIC_DASHBOARD_BREAKPOINTS, 'config.layouts');
  const config: PublicDashboardConfig = {
    schemaVersion: 1,
    theme,
    settings: {
      showHeader: input.settings.showHeader,
      showFooter: input.settings.showFooter,
    },
    widgets,
    layouts: {
      desktop: parseLayout(input.layouts.desktop, 'desktop', widgetTypes),
      tablet: parseLayout(input.layouts.tablet, 'tablet', widgetTypes),
      mobile: parseLayout(input.layouts.mobile, 'mobile', widgetTypes),
    },
  };
  const references = collectPublicDashboardReferences(config);
  if (references.publicationIds.length > 100) {
    throw new BadRequestException('Dashboard chỉ được tham chiếu tối đa 100 văn bản công khai khác nhau');
  }
  return config;
}

export function collectPublicDashboardReferences(config: PublicDashboardConfig) {
  const targetKeys = new Set<string>();
  const publicationIds = new Set<string>();
  for (const widget of config.widgets) {
    if (widget.type === 'targetList') {
      for (const key of widget.settings.targetKeys ?? []) targetKeys.add(key);
    }
    if (widget.type === 'documentList') {
      for (const id of widget.settings.publicationIds ?? []) publicationIds.add(id);
    }
    if (widget.type === 'customHtml') {
      for (const binding of widget.settings.bindings ?? []) {
        if (binding.source === 'target' && binding.targetKey) targetKeys.add(binding.targetKey);
        if (binding.source === 'document' && binding.documentId) publicationIds.add(binding.documentId);
      }
    }
  }
  return { targetKeys: [...targetKeys], publicationIds: [...publicationIds] };
}

export function publicDashboardReferencesPublication(config: PublicDashboardConfig, publicationId: string) {
  return config.widgets.some(widget => {
    if (widget.type === 'documentList') {
      const selected = widget.settings.publicationIds ?? [];
      return selected.includes(publicationId);
    }
    return widget.type === 'customHtml'
      && (widget.settings.bindings ?? []).some(binding => binding.source === 'document' && binding.documentId === publicationId);
  });
}

const Trim = () => Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value);

export class SavePublicDashboardDraftDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @Trim() @IsString() @MinLength(3) @MaxLength(120) name!: string;
  @Trim() @IsString() @Matches(/^[a-z][a-z0-9-]{0,39}$/) templateKey!: string;
  @IsObject() config!: Record<string, unknown>;
}

export class PublishPublicDashboardDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @Trim() @IsString() @MinLength(3) @MaxLength(500) changeNote!: string;
}

export class RestorePublicDashboardDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class SetDocumentPublicationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
  @Trim() @IsString() @MinLength(3) @MaxLength(300) title!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(2_000) summary?: string;
  @Equals(true, { message: 'Phải xác nhận đã kiểm tra an toàn trước khi công bố' }) confirmedSafe!: true;
  @IsBoolean() public!: boolean;
}

class PublicDashboardQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
}

type DashboardDataClient = Pick<
  Prisma.TransactionClient,
  'target' | 'documentPublication' | 'publicDashboard' | 'publicDashboardRevision' | 'sourceDocument' | 'auditLog'
>;

function toJson(config: PublicDashboardConfig): Prisma.InputJsonValue {
  return config as unknown as Prisma.InputJsonValue;
}

function isConcurrencyError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && ['P2002', 'P2025', 'P2034'].includes(error.code);
}

function assertAdmin(actor: Actor) {
  if (actor.role !== Role.ADMIN) throw new ForbiddenException('Chỉ quản trị viên được cấu hình dashboard công khai');
}

function stablePublicKey(namespace: string, value: string) {
  return `${namespace}_${createHash('sha256').update(value).digest('base64url').slice(0, 22)}`;
}

export function publicDashboardTargetKey(id: string) {
  return stablePublicKey('target', id);
}

function publicDashboardDepartmentKey(id: string) {
  return stablePublicKey('dep', id);
}

const dashboardTargetSelect = Prisma.validator<Prisma.TargetSelect>()({
  id: true,
  departmentId: true,
  code: true,
  title: true,
  description: true,
  unit: true,
  weight: true,
  year: true,
  frequency: true,
  dueDate: true,
  isHighlighted: true,
  publicOrder: true,
  department: { select: { name: true, color: true } },
  publishedTargetValue: true,
  publishedValue: true,
  publishedDirection: true,
  publishedStatus: true,
  publishedCode: true,
  publishedTitle: true,
  publishedDescription: true,
  publishedUnit: true,
  publishedWeight: true,
  publishedYear: true,
  publishedFrequency: true,
  publishedDueDate: true,
  publishedDepartmentName: true,
  publishedDepartmentColor: true,
  publishedHighlighted: true,
  publishedOrder: true,
  publishedAt: true,
});

type DashboardTargetRow = Prisma.TargetGetPayload<{ select: typeof dashboardTargetSelect }>;

function dashboardTargetWhere(year?: number): Prisma.TargetWhereInput {
  return {
    isPublic: true,
    isArchived: false,
    publishedValue: { not: null },
    publishedTargetValue: { not: null },
    publishedDirection: { not: null },
    publishedStatus: { not: null },
    ...(year === undefined ? {} : {
      OR: [{ publishedYear: year }, { publishedYear: null, year }],
    }),
  };
}

function toPublicTarget(target: DashboardTargetRow) {
  const hasSnapshot = target.publishedCode !== null;
  const targetValue = target.publishedTargetValue!;
  const currentValue = target.publishedValue!;
  const direction = target.publishedDirection!;
  return {
    key: publicDashboardTargetKey(target.id),
    code: hasSnapshot ? target.publishedCode! : target.code,
    title: hasSnapshot ? target.publishedTitle! : target.title,
    description: hasSnapshot ? target.publishedDescription : target.description,
    unit: hasSnapshot ? target.publishedUnit! : target.unit,
    year: hasSnapshot ? target.publishedYear! : target.year,
    frequency: hasSnapshot ? target.publishedFrequency! : target.frequency,
    dueDate: hasSnapshot ? target.publishedDueDate! : target.dueDate,
    targetValue,
    currentValue,
    progress: calculateProgress(targetValue, currentValue, direction),
    direction,
    department: hasSnapshot ? target.publishedDepartmentName! : target.department.name,
    departmentColor: hasSnapshot ? target.publishedDepartmentColor! : target.department.color,
    departmentKey: publicDashboardDepartmentKey(target.departmentId),
    status: target.publishedStatus!,
    publishedAt: target.publishedAt,
    weight: hasSnapshot ? target.publishedWeight! : target.weight,
    isHighlighted: hasSnapshot ? target.publishedHighlighted! : target.isHighlighted,
    publicOrder: hasSnapshot ? target.publishedOrder : target.publicOrder,
  };
}

type PublicDashboardTargetView = ReturnType<typeof toPublicTarget>;

function stripTargetEditorFields(target: PublicDashboardTargetView) {
  const {
    weight: _weight,
    isHighlighted: _isHighlighted,
    publicOrder: _publicOrder,
    direction: _direction,
    ...publicTarget
  } = target;
  return publicTarget;
}

function buildPublicOverview(targets: PublicDashboardTargetView[], year: number) {
  const totalWeight = targets.reduce((sum, target) => sum + target.weight, 0);
  const weightedProgress = targets.reduce((sum, target) => sum + target.progress * target.weight, 0);
  const departments = new Map<string, {
    key: string;
    name: string;
    color: string;
    total: number;
    completed: number;
    progress: number;
    weight: number;
  }>();
  for (const target of targets) {
    const current = departments.get(target.departmentKey) ?? {
      key: target.departmentKey,
      name: target.department,
      color: target.departmentColor,
      total: 0,
      completed: 0,
      progress: 0,
      weight: 0,
    };
    current.total += 1;
    current.completed += target.status === TargetStatus.COMPLETED ? 1 : 0;
    current.progress += target.progress * target.weight;
    current.weight += target.weight;
    departments.set(target.departmentKey, current);
  }
  const latestTargetUpdate = targets.reduce<Date | null>((latest, target) => {
    const date = target.publishedAt;
    return date && (!latest || date > latest) ? date : latest;
  }, null);
  return {
    year,
    total: targets.length,
    completed: targets.filter(target => target.status === TargetStatus.COMPLETED).length,
    onTrack: targets.filter(target => target.status === TargetStatus.ON_TRACK).length,
    overallProgress: totalWeight ? Math.round(weightedProgress / totalWeight) : 0,
    updatedAt: latestTargetUpdate,
    departments: [...departments.values()]
      .map(({ weight, ...item }) => ({
        ...item,
        progress: weight ? Math.round(item.progress / weight) : 0,
      }))
      .sort((left, right) => right.progress - left.progress),
    highlights: targets
      .filter(target => target.isHighlighted)
      .slice(0, 6)
      .map(stripTargetEditorFields),
  };
}

function toPublishedFeedback(item: {
  code: string;
  publicCategory: string | null;
  publicTitle: string | null;
  publicSummary: string | null;
  publicPublishedAt: Date | null;
  publicResolvedAt: Date | null;
  publicDepartmentName: string | null;
}) {
  return {
    code: item.code,
    category: item.publicCategory,
    publicTitle: item.publicTitle,
    publicSummary: item.publicSummary,
    publicPublishedAt: item.publicPublishedAt,
    resolvedAt: item.publicResolvedAt,
    department: item.publicDepartmentName ? { name: item.publicDepartmentName } : null,
  };
}

type DownloadablePublication = {
  originalName: string;
  mimeType: string;
  size: number;
  data: Uint8Array;
};

const PUBLIC_DOWNLOAD_EXTENSIONS: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function publicDownloadName(publicCode: string, mimeType: string) {
  const code = publicCode.replace(/[^A-Za-z0-9_-]/g, '-') || 'van-ban-cong-khai';
  const extension = PUBLIC_DOWNLOAD_EXTENSIONS[mimeType] ?? 'bin';
  return `${code}.${extension}`;
}

function streamPublicationFile(
  publication: DownloadablePublication,
  response: Response,
  cacheControl: string,
  downloadName = publication.originalName,
) {
  const safeName = downloadName.replace(/[\r\n"]/g, '').replace(/[^\x20-\x7e]/g, '_') || 'document';
  response.setHeader('Content-Type', publication.mimeType);
  response.setHeader('Content-Length', String(publication.size));
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
  );
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', cacheControl);
  return new StreamableFile(Buffer.from(publication.data));
}

@Injectable()
export class PublicDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureDashboard() {
    return this.prisma.publicDashboard.upsert({
      where: { id: PUBLIC_DASHBOARD_ID },
      create: {
        id: PUBLIC_DASHBOARD_ID,
        draftName: 'Trang thông tin công khai',
        draftTemplateKey: 'transparency',
        draftConfig: toJson(cloneDefaultConfig()),
      },
      update: {},
    });
  }

  private async assertReferences(client: DashboardDataClient, config: PublicDashboardConfig) {
    const refs = collectPublicDashboardReferences(config);
    if (refs.targetKeys.length) {
      const rows = await client.target.findMany({
        where: dashboardTargetWhere(),
        select: { id: true },
      });
      const valid = new Set(rows.map(row => publicDashboardTargetKey(row.id)));
      const invalid = refs.targetKeys.filter(key => !valid.has(key));
      if (invalid.length) throw new BadRequestException(`Có chỉ tiêu chưa được công khai hoặc không tồn tại: ${invalid.join(', ')}`);
    }
    if (refs.publicationIds.length) {
      const rows = await client.documentPublication.findMany({
        where: { id: { in: refs.publicationIds }, revokedAt: null },
        select: { id: true },
      });
      const valid = new Set(rows.map(row => row.id));
      const invalid = refs.publicationIds.filter(id => !valid.has(id));
      if (invalid.length) throw new BadRequestException(`Có văn bản chưa công bố, đã thu hồi hoặc không tồn tại: ${invalid.join(', ')}`);
    }
    return refs;
  }

  private storedConfig(value: Prisma.JsonValue): PublicDashboardConfig {
    try {
      return normalizePublicDashboardConfig(value);
    } catch {
      throw new ServiceUnavailableException('Cấu hình dashboard đã lưu không hợp lệ. Chưa có dữ liệu nào được công khai.');
    }
  }

  async editor(actor: Actor) {
    assertAdmin(actor);
    const dashboard = await this.ensureDashboard();
    const [history, targetRows, documents, settings, feedbacks] = await Promise.all([
      this.prisma.publicDashboardRevision.findMany({
        where: { dashboardId: PUBLIC_DASHBOARD_ID },
        select: {
          revision: true,
          name: true,
          templateKey: true,
          changeNote: true,
          publishedAt: true,
          publishedBy: true,
        },
        orderBy: { revision: 'desc' },
        take: 30,
      }),
      this.prisma.target.findMany({
        where: dashboardTargetWhere(),
        select: dashboardTargetSelect,
        orderBy: [{ publishedYear: 'desc' }, { publishedOrder: 'asc' }, { code: 'asc' }],
        take: 500,
      }),
      this.prisma.sourceDocument.findMany({
        where: { status: DocumentStatus.PROCESSED },
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          originalName: true,
          mimeType: true,
          size: true,
          updatedAt: true,
          publications: {
            where: { revokedAt: null },
            select: {
              id: true,
              publicCode: true,
              title: true,
              summary: true,
              version: true,
              publishedAt: true,
              revokedAt: true,
            },
            take: 1,
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 200,
      }),
      this.prisma.systemSetting.findUnique({ where: { id: 'default' }, select: { defaultYear: true } }),
      this.prisma.feedback.findMany({
        where: {
          isPublic: true,
          publicSnapshotVersion: { gte: 1 },
          status: { in: [FeedbackStatus.RESOLVED, FeedbackStatus.CLOSED] },
          closureReason: FeedbackClosureReason.RESOLVED,
          publicPublishedAt: { not: null },
        },
        select: {
          code: true,
          publicCategory: true,
          publicTitle: true,
          publicSummary: true,
          publicPublishedAt: true,
          publicResolvedAt: true,
          publicDepartmentName: true,
        },
        orderBy: { publicPublishedAt: 'desc' },
        take: 12,
      }),
    ]);
    const previewYear = settings?.defaultYear ?? currentVietnamYear();
    const previewTargets = targetRows.map(toPublicTarget).filter(target => target.year === previewYear).slice(0, 200);
    const previewDocuments = documents.flatMap(document => {
      const publication = document.publications[0];
      return publication ? [{
        id: publication.id,
        sourceDocumentId: document.id,
        code: publication.publicCode,
        title: publication.title,
        summary: publication.summary,
        publishedAt: publication.publishedAt,
        downloadUrl: `/api/public-dashboard/documents/${publication.id}/download`,
      }] : [];
    });
    return {
      dashboard: {
        ...dashboard,
        draftConfig: this.storedConfig(dashboard.draftConfig),
      },
      history: history.map(item => ({
        revision: item.revision,
        name: item.name,
        templateKey: item.templateKey,
        changeNote: item.changeNote,
        publishedAt: item.publishedAt,
        publishedBy: item.publishedBy,
      })),
      catalog: {
        targets: targetRows.map(row => {
          const target = toPublicTarget(row);
          return {
            key: target.key,
            code: target.code,
            title: target.title,
            department: target.department,
            year: target.year,
          };
        }),
        documents: documents.map(document => ({
          id: document.id,
          code: document.code,
          title: document.title,
          status: document.status,
          originalName: document.originalName,
          mimeType: document.mimeType,
          size: document.size,
          publication: document.publications[0] ?? null,
        })),
      },
      previewData: {
        overview: buildPublicOverview(previewTargets, previewYear),
        targets: previewTargets.map(stripTargetEditorFields),
        feedbacks: feedbacks.map(toPublishedFeedback),
        documents: previewDocuments,
      },
      templates: PUBLIC_DASHBOARD_TEMPLATES,
      widgetTypes: PUBLIC_DASHBOARD_WIDGET_TYPES,
      bindingFields: PUBLIC_DASHBOARD_BINDING_FIELDS,
    };
  }

  async saveDraft(actor: Actor, dto: SavePublicDashboardDraftDto) {
    assertAdmin(actor);
    if (!TEMPLATE_KEYS.has(dto.templateKey as typeof PUBLIC_DASHBOARD_TEMPLATES[number]['key'])) {
      throw new BadRequestException('Template không thuộc danh mục hỗ trợ');
    }
    const config = normalizePublicDashboardConfig(dto.config);
    await this.ensureDashboard();
    try {
      return await this.prisma.$transaction(async tx => {
        const current = await tx.publicDashboard.findUniqueOrThrow({ where: { id: PUBLIC_DASHBOARD_ID } });
        if (current.draftVersion !== dto.expectedVersion) {
          throw new ConflictException('Bản nháp vừa được người khác cập nhật. Vui lòng tải lại Studio.');
        }
        await this.assertReferences(tx, config);
        const currentConfig = this.storedConfig(current.draftConfig);
        if (
          current.draftName === dto.name.trim()
          && current.draftTemplateKey === dto.templateKey
          && JSON.stringify(currentConfig) === JSON.stringify(config)
        ) {
          return { ...current, draftConfig: currentConfig, unchanged: true };
        }
        const changed = await tx.publicDashboard.updateMany({
          where: { id: PUBLIC_DASHBOARD_ID, draftVersion: dto.expectedVersion },
          data: {
            draftName: dto.name.trim(),
            draftTemplateKey: dto.templateKey,
            draftConfig: toJson(config),
            updatedBy: actor.username,
            draftVersion: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new ConflictException('Bản nháp vừa được người khác cập nhật. Vui lòng tải lại Studio.');
        const result = await tx.publicDashboard.findUniqueOrThrow({ where: { id: PUBLIC_DASHBOARD_ID } });
        const refs = collectPublicDashboardReferences(config);
        await audit(tx, actor, {
          action: 'PUBLIC_DASHBOARD_DRAFT_SAVED',
          entityType: 'PublicDashboard',
          entityId: PUBLIC_DASHBOARD_ID,
          departmentId: null,
          metadata: {
            dashboardId: PUBLIC_DASHBOARD_ID,
            previousVersion: dto.expectedVersion,
            version: result.draftVersion,
            templateKey: dto.templateKey,
            widgetCount: config.widgets.length,
            targetCount: refs.targetKeys.length,
            documentCount: refs.publicationIds.length,
          },
        });
        return { ...result, draftConfig: config };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) throw error;
      if (isConcurrencyError(error)) throw new ConflictException('Bản nháp vừa thay đổi. Vui lòng tải lại Studio.');
      throw error;
    }
  }

  async publish(actor: Actor, dto: PublishPublicDashboardDto) {
    assertAdmin(actor);
    await this.ensureDashboard();
    try {
      return await this.prisma.$transaction(async tx => {
        const dashboard = await tx.publicDashboard.findUniqueOrThrow({ where: { id: PUBLIC_DASHBOARD_ID } });
        if (dashboard.draftVersion !== dto.expectedVersion) {
          throw new ConflictException('Bản nháp vừa thay đổi. Vui lòng kiểm tra lại trước khi công bố.');
        }
        const config = normalizePublicDashboardConfig(dashboard.draftConfig);
        const refs = await this.assertReferences(tx, config);
        const maxRevision = await tx.publicDashboardRevision.aggregate({
          where: { dashboardId: PUBLIC_DASHBOARD_ID },
          _max: { revision: true },
        });
        const revision = (maxRevision._max.revision ?? 0) + 1;
        const published = await tx.publicDashboardRevision.create({
          data: {
            dashboardId: PUBLIC_DASHBOARD_ID,
            revision,
            name: dashboard.draftName,
            templateKey: dashboard.draftTemplateKey,
            config: toJson(config),
            changeNote: dto.changeNote.trim(),
            publishedBy: actor.username,
          },
        });
        const changed = await tx.publicDashboard.updateMany({
          where: { id: PUBLIC_DASHBOARD_ID, draftVersion: dto.expectedVersion },
          data: {
            publishedRevision: revision,
            draftConfig: toJson(config),
            updatedBy: actor.username,
            draftVersion: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new ConflictException('Bản nháp vừa thay đổi. Chưa có dữ liệu nào được công bố.');
        const dashboardAfter = await tx.publicDashboard.findUniqueOrThrow({ where: { id: PUBLIC_DASHBOARD_ID } });
        await audit(tx, actor, {
          action: 'PUBLIC_DASHBOARD_PUBLISHED',
          entityType: 'PublicDashboardRevision',
          entityId: published.id,
          departmentId: null,
          metadata: {
            dashboardId: PUBLIC_DASHBOARD_ID,
            revision,
            previousVersion: dto.expectedVersion,
            version: dashboardAfter.draftVersion,
            templateKey: dashboard.draftTemplateKey,
            widgetCount: config.widgets.length,
            targetCount: refs.targetKeys.length,
            documentCount: refs.publicationIds.length,
          },
        });
        return {
          dashboard: { ...dashboardAfter, draftConfig: config },
          revision: { ...published, config },
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) throw error;
      if (isConcurrencyError(error)) throw new ConflictException('Có phiên công bố đồng thời. Vui lòng tải lại Studio.');
      throw error;
    }
  }

  async restore(actor: Actor, revision: number, dto: RestorePublicDashboardDto) {
    assertAdmin(actor);
    await this.ensureDashboard();
    try {
      return await this.prisma.$transaction(async tx => {
        const source = await tx.publicDashboardRevision.findUnique({
          where: { dashboardId_revision: { dashboardId: PUBLIC_DASHBOARD_ID, revision } },
        });
        if (!source) throw new NotFoundException('Không tìm thấy revision cần khôi phục');
        const config = normalizePublicDashboardConfig(source.config);
        const refs = await this.assertReferences(tx, config);
        const changed = await tx.publicDashboard.updateMany({
          where: { id: PUBLIC_DASHBOARD_ID, draftVersion: dto.expectedVersion },
          data: {
            draftName: source.name,
            draftTemplateKey: source.templateKey,
            draftConfig: toJson(config),
            updatedBy: actor.username,
            draftVersion: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new ConflictException('Bản nháp vừa thay đổi. Vui lòng tải lại trước khi khôi phục.');
        const result = await tx.publicDashboard.findUniqueOrThrow({ where: { id: PUBLIC_DASHBOARD_ID } });
        await audit(tx, actor, {
          action: 'PUBLIC_DASHBOARD_REVISION_RESTORED',
          entityType: 'PublicDashboard',
          entityId: PUBLIC_DASHBOARD_ID,
          departmentId: null,
          metadata: {
            dashboardId: PUBLIC_DASHBOARD_ID,
            revision,
            previousVersion: dto.expectedVersion,
            version: result.draftVersion,
            templateKey: source.templateKey,
            widgetCount: config.widgets.length,
            targetCount: refs.targetKeys.length,
            documentCount: refs.publicationIds.length,
          },
        });
        return { ...result, draftConfig: config, restoredFromRevision: revision };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException || error instanceof BadRequestException) throw error;
      if (isConcurrencyError(error)) throw new ConflictException('Bản nháp vừa thay đổi. Vui lòng tải lại Studio.');
      throw error;
    }
  }

  async setDocumentPublication(actor: Actor, sourceDocumentId: string, dto: SetDocumentPublicationDto) {
    assertAdmin(actor);
    if (dto.confirmedSafe !== true) {
      throw new BadRequestException('Phải xác nhận đã kiểm tra dữ liệu nhạy cảm và quyền phát hành');
    }
    if (typeof dto.public !== 'boolean') throw new BadRequestException('Trạng thái công khai không hợp lệ');
    const publicationTitle = requiredString(dto.title, 'title', 3, 300);
    const publicationSummary = optionalString(dto.summary, 'summary', 2_000);
    const allowedMimes = new Set([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
    try {
      return await this.prisma.$transaction(async tx => {
        const source = await tx.sourceDocument.findUnique({ where: { id: sourceDocumentId } });
        if (!source) throw new NotFoundException('Không tìm thấy văn bản nguồn');
        const active = await tx.documentPublication.findFirst({
          where: { sourceDocumentId, revokedAt: null },
          orderBy: { publishedAt: 'desc' },
        });
        if (!dto.public) {
          if (!active) throw new ConflictException('Văn bản hiện không có bản công bố đang hiệu lực');
          if (dto.expectedVersion === undefined || dto.expectedVersion !== active.version) {
            throw new ConflictException('Bản công bố vừa thay đổi. Vui lòng tải lại Studio.');
          }
          const revokedAt = new Date();
          const changed = await tx.documentPublication.updateMany({
            where: { id: active.id, version: dto.expectedVersion, revokedAt: null },
            data: { revokedAt, revokedBy: actor.username },
          });
          if (changed.count !== 1) throw new ConflictException('Bản công bố vừa thay đổi. Vui lòng tải lại Studio.');
          await audit(tx, actor, {
            action: 'DOCUMENT_PUBLICATION_REVOKED',
            entityType: 'DocumentPublication',
            entityId: active.id,
            departmentId: null,
            metadata: {
              sourceDocumentId,
              publicCode: active.publicCode,
              publicationVersion: active.version,
              revoked: true,
            },
          });
          return { publication: { ...active, data: undefined, revokedAt, revokedBy: actor.username } };
        }
        if (source.status !== DocumentStatus.PROCESSED) {
          throw new ConflictException('Chỉ có thể công bố văn bản đã xử lý hoàn tất');
        }
        if (!allowedMimes.has(source.mimeType)) throw new BadRequestException('Định dạng tệp không được phép công bố');
        if (active && (dto.expectedVersion === undefined || dto.expectedVersion !== active.version)) {
          throw new ConflictException('Bản công bố vừa thay đổi. Vui lòng tải lại Studio.');
        }
        if (!active && dto.expectedVersion !== undefined) {
          throw new ConflictException('Bản công bố đã được thu hồi. Vui lòng tải lại Studio.');
        }
        if (active) {
          const publishedAt = new Date();
          const changed = await tx.documentPublication.updateMany({
            where: { id: active.id, version: active.version, revokedAt: null },
            data: {
              title: publicationTitle,
              summary: publicationSummary ?? null,
              publishedBy: actor.username,
              publishedAt,
              version: { increment: 1 },
            },
          });
          if (changed.count !== 1) throw new ConflictException('Bản công bố vừa thay đổi. Vui lòng tải lại Studio.');
          const publication = await tx.documentPublication.findUniqueOrThrow({
            where: { id: active.id },
            select: {
              id: true,
              sourceDocumentId: true,
              publicCode: true,
              title: true,
              summary: true,
              originalName: true,
              mimeType: true,
              size: true,
              sha256: true,
              publishedBy: true,
              publishedAt: true,
              revokedAt: true,
              revokedBy: true,
              version: true,
            },
          });
          await audit(tx, actor, {
            action: 'DOCUMENT_PUBLICATION_UPDATED',
            entityType: 'DocumentPublication',
            entityId: publication.id,
            departmentId: null,
            metadata: {
              sourceDocumentId,
              publicCode: publication.publicCode,
              previousVersion: active.version,
              publicationVersion: publication.version,
              before: {
                title: active.title,
                summary: active.summary,
                version: active.version,
              },
              after: {
                title: publication.title,
                summary: publication.summary,
                version: publication.version,
              },
              revoked: false,
              mimeType: publication.mimeType,
              size: publication.size,
            },
          });
          return { publication };
        }
        const last = await tx.documentPublication.findFirst({
          where: { sourceDocumentId },
          select: { version: true },
          orderBy: { version: 'desc' },
        });
        const version = (last?.version ?? 0) + 1;
        const publication = await tx.documentPublication.create({
          data: {
            sourceDocumentId,
            publicCode: `VBCK-${currentVietnamYear()}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`,
            title: publicationTitle,
            summary: publicationSummary ?? null,
            originalName: source.originalName,
            mimeType: source.mimeType,
            size: source.size,
            sha256: source.sha256,
            data: source.data,
            publishedBy: actor.username,
            version,
          },
        });
        await audit(tx, actor, {
          action: 'DOCUMENT_PUBLICATION_PUBLISHED',
          entityType: 'DocumentPublication',
          entityId: publication.id,
          departmentId: null,
          metadata: {
            sourceDocumentId,
            publicCode: publication.publicCode,
            publicationVersion: publication.version,
            previousVersion: last?.version ?? 0,
            revoked: false,
            mimeType: publication.mimeType,
            size: publication.size,
          },
        });
        return { publication: { ...publication, data: undefined } };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException || error instanceof BadRequestException) throw error;
      if (isConcurrencyError(error)) throw new ConflictException('Có thao tác công bố văn bản đồng thời. Vui lòng tải lại Studio.');
      throw error;
    }
  }

  async downloadEditorDocument(actor: Actor, id: string, response: Response) {
    assertAdmin(actor);
    if (!PUBLICATION_ID_PATTERN.test(id)) throw new NotFoundException('Không tìm thấy văn bản công khai');
    const publication = await this.prisma.documentPublication.findFirst({
      where: {
        id,
        revokedAt: null,
        sourceDocument: { status: DocumentStatus.PROCESSED },
      },
      select: { originalName: true, mimeType: true, size: true, data: true },
    });
    if (!publication) throw new NotFoundException('Văn bản đã được thu hồi hoặc không còn trong thư viện Studio');
    return streamPublicationFile(publication, response, 'private, no-store');
  }

  private async resolveYear(requested?: number) {
    if (requested) return requested;
    const settings = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    return settings?.defaultYear ?? currentVietnamYear();
  }

  async publicDashboard(requestedYear?: number) {
    const year = await this.resolveYear(requestedYear);
    const dashboard = await this.prisma.publicDashboard.findUnique({
      where: { id: PUBLIC_DASHBOARD_ID },
      select: { publishedRevision: true },
    });
    const revision = dashboard?.publishedRevision
      ? await this.prisma.publicDashboardRevision.findUnique({
          where: { dashboardId_revision: { dashboardId: PUBLIC_DASHBOARD_ID, revision: dashboard.publishedRevision } },
        })
      : null;
    const config = revision ? this.storedConfig(revision.config) : cloneDefaultConfig();
    const refs = revision ? collectPublicDashboardReferences(config) : { targetKeys: [], publicationIds: [] };
    const selectedTargetKeys = new Set(refs.targetKeys);
    const selectedTargetIds = refs.targetKeys.length
      ? (await this.prisma.target.findMany({
          where: dashboardTargetWhere(year),
          select: { id: true },
        }))
          .filter(row => selectedTargetKeys.has(publicDashboardTargetKey(row.id)))
          .map(row => row.id)
      : [];
    const [baseTargetRows, selectedTargetRows, feedbacks, publications] = await Promise.all([
      this.prisma.target.findMany({
        where: dashboardTargetWhere(year),
        select: dashboardTargetSelect,
        orderBy: [
          { publishedHighlighted: 'desc' },
          { publishedOrder: 'asc' },
          { code: 'asc' },
          { id: 'asc' },
        ],
        take: 200,
      }),
      selectedTargetIds.length
        ? this.prisma.target.findMany({
            where: { ...dashboardTargetWhere(year), id: { in: selectedTargetIds } },
            select: dashboardTargetSelect,
            orderBy: [
              { publishedHighlighted: 'desc' },
              { publishedOrder: 'asc' },
              { code: 'asc' },
              { id: 'asc' },
            ],
          })
        : Promise.resolve([] as DashboardTargetRow[]),
      this.prisma.feedback.findMany({
        where: {
          isPublic: true,
          publicSnapshotVersion: { gte: 1 },
          status: { in: [FeedbackStatus.RESOLVED, FeedbackStatus.CLOSED] },
          closureReason: FeedbackClosureReason.RESOLVED,
          publicPublishedAt: { not: null },
        },
        select: {
          code: true,
          publicCategory: true,
          publicTitle: true,
          publicSummary: true,
          publicPublishedAt: true,
          publicResolvedAt: true,
          publicDepartmentName: true,
        },
        orderBy: { publicPublishedAt: 'desc' },
        take: 12,
      }),
      refs.publicationIds.length
        ? this.prisma.documentPublication.findMany({
            where: {
              revokedAt: null,
              id: { in: refs.publicationIds },
            },
            select: {
              id: true,
              publicCode: true,
              title: true,
              summary: true,
              publishedAt: true,
            },
            orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
            take: 100,
          })
        : Promise.resolve([]),
    ]);
    const selectedSeen = new Set(baseTargetRows.map(row => row.id));
    const targetRows = [
      ...baseTargetRows,
      ...selectedTargetRows.filter(row => !selectedSeen.has(row.id)),
    ];
    const targets = targetRows.map(toPublicTarget);
    const totalWeight = targets.reduce((sum, target) => sum + target.weight, 0);
    const weightedProgress = targets.reduce((sum, target) => sum + target.progress * target.weight, 0);
    const departments = new Map<string, {
      key: string;
      name: string;
      color: string;
      total: number;
      completed: number;
      progress: number;
      weight: number;
    }>();
    for (const target of targets) {
      const current = departments.get(target.departmentKey) ?? {
        key: target.departmentKey,
        name: target.department,
        color: target.departmentColor,
        total: 0,
        completed: 0,
        progress: 0,
        weight: 0,
      };
      current.total += 1;
      current.completed += target.status === TargetStatus.COMPLETED ? 1 : 0;
      current.progress += target.progress * target.weight;
      current.weight += target.weight;
      departments.set(target.departmentKey, current);
    }
    const latestTargetUpdate = targets.reduce<Date | null>((latest, target) => {
      const date = target.publishedAt;
      return date && (!latest || date > latest) ? date : latest;
    }, null);
    return {
      revision: revision?.revision ?? 0,
      config,
      data: {
        overview: {
          year,
          total: targets.length,
          completed: targets.filter(target => target.status === TargetStatus.COMPLETED).length,
          onTrack: targets.filter(target => target.status === TargetStatus.ON_TRACK).length,
          overallProgress: totalWeight ? Math.round(weightedProgress / totalWeight) : 0,
          updatedAt: latestTargetUpdate,
          departments: [...departments.values()]
            .map(({ weight, ...item }) => ({
              ...item,
              progress: weight ? Math.round(item.progress / weight) : 0,
            }))
            .sort((left, right) => right.progress - left.progress),
          highlights: targets.filter(target => target.isHighlighted).slice(0, 6).map(({ weight: _weight, isHighlighted: _highlight, publicOrder: _order, direction: _direction, ...target }) => target),
        },
        targets: targets.map(({ weight: _weight, isHighlighted: _highlight, publicOrder: _order, direction: _direction, ...target }) => target),
        feedbacks: feedbacks.map(item => ({
          code: item.code,
          category: item.publicCategory,
          publicTitle: item.publicTitle,
          publicSummary: item.publicSummary,
          publicPublishedAt: item.publicPublishedAt,
          resolvedAt: item.publicResolvedAt,
          department: item.publicDepartmentName ? { name: item.publicDepartmentName } : null,
        })),
        documents: publications.map(item => ({
            id: item.id,
            code: item.publicCode,
            title: item.title,
            summary: item.summary,
            publishedAt: item.publishedAt,
            downloadUrl: `/api/public/dashboard/documents/${item.id}/download`,
          })),
      },
    };
  }

  async downloadPublicDocument(id: string, response: Response) {
    if (!PUBLICATION_ID_PATTERN.test(id)) throw new NotFoundException('Không tìm thấy văn bản công khai');
    const dashboard = await this.prisma.publicDashboard.findUnique({
      where: { id: PUBLIC_DASHBOARD_ID },
      select: { publishedRevision: true },
    });
    if (!dashboard?.publishedRevision) throw new NotFoundException('Không tìm thấy văn bản công khai');
    const revision = await this.prisma.publicDashboardRevision.findUnique({
      where: { dashboardId_revision: { dashboardId: PUBLIC_DASHBOARD_ID, revision: dashboard.publishedRevision } },
      select: { config: true },
    });
    if (!revision) throw new NotFoundException('Không tìm thấy văn bản công khai');
    const config = this.storedConfig(revision.config);
    if (!publicDashboardReferencesPublication(config, id)) {
      throw new NotFoundException('Văn bản không thuộc dashboard đang công bố');
    }
    const publication = await this.prisma.documentPublication.findFirst({
      where: { id, revokedAt: null },
      select: { publicCode: true, originalName: true, mimeType: true, size: true, data: true },
    });
    if (!publication) throw new NotFoundException('Văn bản đã được thu hồi hoặc không tồn tại');
    return streamPublicationFile(
      publication,
      response,
      'no-store',
      publicDownloadName(publication.publicCode, publication.mimeType),
    );
  }
}

@Controller('public-dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class PublicDashboardAdminController {
  constructor(private readonly service: PublicDashboardService) {}

  @Get('editor')
  editor(@Req() req: any) {
    return this.service.editor(getActor(req));
  }

  @Put('draft')
  saveDraft(@Req() req: any, @Body() dto: SavePublicDashboardDraftDto) {
    return this.service.saveDraft(getActor(req), dto);
  }

  @Post('publish')
  publish(@Req() req: any, @Body() dto: PublishPublicDashboardDto) {
    return this.service.publish(getActor(req), dto);
  }

  @Post('revisions/:revision/restore')
  restore(
    @Req() req: any,
    @Param('revision') revisionRaw: string,
    @Body() dto: RestorePublicDashboardDto,
  ) {
    const revision = Number(revisionRaw);
    if (!Number.isInteger(revision) || revision < 1) throw new BadRequestException('Revision không hợp lệ');
    return this.service.restore(getActor(req), revision, dto);
  }

  @Put('documents/:sourceDocumentId/publication')
  setDocumentPublication(
    @Req() req: any,
    @Param('sourceDocumentId') sourceDocumentId: string,
    @Body() dto: SetDocumentPublicationDto,
  ) {
    return this.service.setDocumentPublication(getActor(req), sourceDocumentId, dto);
  }

  @Get('documents/:publicationId/download')
  downloadEditorDocument(
    @Req() req: any,
    @Param('publicationId') publicationId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.service.downloadEditorDocument(getActor(req), publicationId, response);
  }
}

@Controller('public/dashboard')
export class PublicDashboardPublicController {
  constructor(private readonly service: PublicDashboardService) {}

  @Get()
  dashboard(
    @Query() query: PublicDashboardQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.service.publicDashboard(query.year);
  }

  @Get('documents/:id/download')
  download(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.service.downloadPublicDocument(id, response);
  }
}
