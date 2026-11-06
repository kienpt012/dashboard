import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CandidateOrigin,
  CandidateStatus,
  ExtractionMethod,
  FrameworkKind,
  Prisma,
  TargetDirection,
  TargetFrequency,
} from '@prisma/client';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { audit, getActor, isGlobalRole, WORKING_ROLES, type Actor } from './access';
import {
  approverIds,
  canDecideCandidate,
  canEditCandidate,
  deadlineDate,
  isConcurrencyError,
  missingApprovalFields,
  REVALIDATE_SELECT,
  revalidatedFlags,
} from './candidates';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { parseVietnameseNumber } from './extraction-rules';
import { STANDARD_CATEGORIES } from './extraction-structure';
import { brandName, loadLocality } from './locality';
import { matchDepartmentByName, normalizeVietnamese } from './matching';
import { PrismaService } from './prisma.service';
import { notifyUsers, recordWorkEvent } from './work';

// Bảng chỉ tiêu trích xuất theo khuôn Phụ lục 1 (STT | Chỉ tiêu | Đơn vị tính | Kế hoạch | Đơn vị chủ trì | Ghi chú):
// chuyên viên tải về, rà soát và chuẩn hoá trong Excel, rồi tải lên lại để cập nhật đề xuất và trình các phòng.
// Mỗi hàng chỉ tiêu mang mã và phiên bản đề xuất (cột ẩn) để tải lên không ghi đè nhầm bản người khác vừa sửa.

export const SHEET_VERSION = 'bang-chi-tieu-1';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const SHEET_NAME = 'Chỉ tiêu';
const META_SHEET = '_meta';

const COLUMNS = [
  { key: 'stt', header: 'STT', width: 7 },
  { key: 'name', header: 'Chỉ tiêu', width: 52 },
  { key: 'unit', header: 'Đơn vị tính', width: 14 },
  { key: 'plan', header: 'Kế hoạch năm', width: 16 },
  { key: 'department', header: 'Đơn vị chủ trì báo cáo', width: 28 },
  { key: 'note', header: 'Ghi chú', width: 24 },
  { key: 'category', header: 'Lĩnh vực', width: 22 },
  { key: 'frequency', header: 'Kỳ báo cáo', width: 12 },
  { key: 'deadline', header: 'Hạn hoàn thành', width: 14 },
  { key: 'direction', header: 'Chiều đánh giá', width: 18 },
  { key: 'action', header: 'Xử lý', width: 9 },
  { key: 'page', header: 'Trang', width: 7 },
  { key: 'quote', header: 'Trích dẫn nguồn', width: 60 },
  { key: 'id', header: 'Mã đề xuất', width: 28 },
  { key: 'version', header: 'Phiên bản', width: 9 },
] as const;
type ColumnKey = (typeof COLUMNS)[number]['key'];
const COL = Object.fromEntries(COLUMNS.map((column, index) => [column.key, index + 1])) as Record<ColumnKey, number>;

const FREQUENCY_LABELS: Record<TargetFrequency, string> = {
  MONTHLY: 'Tháng',
  QUARTERLY: 'Quý',
  SEMIANNUAL: '6 tháng',
  YEARLY: 'Năm',
};
const DIRECTION_LABELS: Record<TargetDirection, string> = {
  HIGHER_IS_BETTER: 'Càng cao càng tốt',
  LOWER_IS_BETTER: 'Càng thấp càng tốt',
};
const DROP_LABEL = 'Bỏ';
const KEEP_LABEL = 'Giữ';

export interface SheetCandidate {
  id: string;
  version: number;
  name: string;
  ordinal: string | null;
  parentName: string | null;
  description: string | null;
  category: string | null;
  groupName: string | null;
  unit: string | null;
  targetValue: number | null;
  targetText: string | null;
  direction: TargetDirection | null;
  frequency: TargetFrequency | null;
  deadline: Date | null;
  departmentName: string | null;
  pageNumber: number | null;
  sourceQuote: string;
  confidence: number;
  flagged: boolean;
}

export interface SheetDocument {
  id: string;
  title: string;
  docNumber: string | null;
  year: number | null;
}

const ROMAN: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(value: number): string {
  let rest = value;
  let text = '';
  for (const [size, letters] of ROMAN) while (rest >= size) { text += letters; rest -= size; }
  return text;
}

/** Ngày của hạn theo giờ Việt Nam, ghi vào Excel dạng ngày (không lệch múi giờ khi mở). */
function excelDate(value: Date): Date {
  const local = new Date(value.getTime() + 7 * 3_600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

function formatPlan(candidate: SheetCandidate): string | number | null {
  if (candidate.targetText?.trim()) return candidate.targetText.trim();
  return candidate.targetValue;
}

/** Dựng bảng theo khuôn PL1: nhóm theo đề mục (số La Mã), chỉ tiêu theo thứ tự văn bản, dòng "-" dưới chỉ tiêu cha. */
export function buildCandidateWorkbook(input: {
  document: SheetDocument;
  candidates: SheetCandidate[];
  departments: string[];
  creator?: string;
}): ExcelJS.Workbook {
  const { document, candidates } = input;
  const year = document.year ?? new Date().getFullYear();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = input.creator ?? 'IOC';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(SHEET_NAME, {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '5:5' },
    views: [{ state: 'frozen', ySplit: 5 }],
  });
  sheet.columns = COLUMNS.map(column => ({ key: column.key, width: column.width }));
  const lastVisible = COL.note;

  const title = (rowNumber: number, text: string, font: Partial<ExcelJS.Font>) => {
    sheet.mergeCells(rowNumber, 1, rowNumber, lastVisible);
    const cell = sheet.getCell(rowNumber, 1);
    cell.value = text;
    cell.font = { name: 'Times New Roman', size: 13, ...font };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  };
  title(1, 'PHỤ LỤC', { bold: true });
  title(2, `Chỉ tiêu trích xuất từ văn bản: ${document.title}`, { bold: true });
  title(3, `(Kèm theo ${document.docNumber ? `văn bản số ${document.docNumber}` : 'văn bản nguồn'}; năm kế hoạch ${year})`, { italic: true, size: 12 });
  sheet.getRow(2).height = 34;
  sheet.mergeCells(4, 1, 4, COLUMNS.length);
  const guide = sheet.getCell(4, 1);
  guide.value = 'Sửa trực tiếp trong bảng; thêm hàng mới thì để trống "Mã đề xuất". Hàng tô vàng cần đối chiếu kỹ. Cột "Xử lý" chọn "Bỏ" để loại chỉ tiêu. '
    + 'Hàng số La Mã là nhóm; hàng "-" là chỉ tiêu thành phần của hàng phía trên. Không sửa cột "Mã đề xuất" và "Phiên bản".';
  guide.font = { italic: true, size: 10, color: { argb: 'FF475569' } };
  guide.alignment = { wrapText: true, vertical: 'middle' };
  sheet.getRow(4).height = 30;

  const header = sheet.getRow(5);
  COLUMNS.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.key === 'plan' ? `Kế hoạch năm ${year}` : column.header;
    cell.font = { bold: true, name: 'Times New Roman', size: 12 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index < lastVisible ? 'FFE2E8F0' : 'FFF1F5F9' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  header.height = 32;

  const border: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF94A3B8' } },
    bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
    left: { style: 'thin', color: { argb: 'FF94A3B8' } },
    right: { style: 'thin', color: { argb: 'FF94A3B8' } },
  };
  const finish = (row: ExcelJS.Row) => {
    for (let column = 1; column <= COLUMNS.length; column += 1) {
      const cell = row.getCell(column);
      cell.border = border;
      cell.alignment = { vertical: 'middle', wrapText: true, ...(column === COL.stt || column === COL.unit || column === COL.plan ? { horizontal: 'center' } : {}) };
      if (!cell.font) cell.font = { name: 'Times New Roman', size: 12 };
    }
  };

  const names = new Set(candidates.map(candidate => normalizeVietnamese(candidate.name)));
  let groupIndex = 0;
  let currentGroup: string | null | undefined;
  let lastParent: string | null = null;
  for (const candidate of candidates) {
    const group = candidate.groupName?.trim() || null;
    if (group !== currentGroup && group) {
      groupIndex += 1;
      const row = sheet.addRow([]);
      row.getCell(COL.stt).value = roman(groupIndex);
      row.getCell(COL.name).value = group;
      finish(row);
      for (let column = 1; column <= lastVisible; column += 1) {
        row.getCell(column).font = { bold: true, name: 'Times New Roman', size: 12 };
        row.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
      lastParent = null;
    }
    currentGroup = group;
    // Chỉ tiêu cha chỉ để dẫn dòng "-" (vd "Đến cuối năm 2026,") không phải đề xuất: thêm một hàng dẫn không có mã.
    const parent = candidate.parentName?.trim() || null;
    if (parent && parent !== lastParent && !names.has(normalizeVietnamese(parent))) {
      const row = sheet.addRow([]);
      row.getCell(COL.name).value = parent;
      finish(row);
      lastParent = parent;
    }
    const row = sheet.addRow([]);
    row.getCell(COL.stt).value = parent ? '-' : candidate.ordinal ?? '';
    row.getCell(COL.name).value = candidate.name;
    row.getCell(COL.unit).value = candidate.unit ?? '';
    const plan = formatPlan(candidate);
    row.getCell(COL.plan).value = plan ?? '';
    if (typeof plan === 'number') row.getCell(COL.plan).numFmt = Number.isInteger(plan) ? '#,##0' : '#,##0.0##';
    row.getCell(COL.department).value = candidate.departmentName ?? '';
    row.getCell(COL.note).value = candidate.description ?? '';
    row.getCell(COL.category).value = candidate.category ?? '';
    row.getCell(COL.frequency).value = candidate.frequency ? FREQUENCY_LABELS[candidate.frequency] : '';
    if (candidate.deadline) {
      row.getCell(COL.deadline).value = excelDate(candidate.deadline);
      row.getCell(COL.deadline).numFmt = 'dd/mm/yyyy';
    }
    row.getCell(COL.direction).value = DIRECTION_LABELS[candidate.direction ?? TargetDirection.HIGHER_IS_BETTER];
    row.getCell(COL.page).value = candidate.pageNumber ?? '';
    row.getCell(COL.quote).value = candidate.sourceQuote.slice(0, 1000);
    row.getCell(COL.id).value = candidate.id;
    row.getCell(COL.version).value = candidate.version;
    finish(row);
    if (candidate.flagged || candidate.confidence < 0.6) {
      for (const column of [COL.name, COL.unit, COL.plan]) {
        row.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      }
    }
    if (!parent) lastParent = candidate.name;
  }

  // In ra giống phụ lục giao chỉ tiêu: chỉ 6 cột PL1, các cột làm việc còn lại không in.
  sheet.pageSetup.printArea = `A1:F${Math.max(sheet.rowCount, 6)}`;
  const lastRow = Math.max(sheet.rowCount + 200, 300);
  const list = (column: number, values: string[]) => {
    if (!values.length) return;
    const formula = `"${values.map(value => value.replace(/"/g, '""')).join(',')}"`;
    // Danh sách chọn của Excel giới hạn 255 ký tự; dài hơn thì để nhập tự do (tải lên vẫn kiểm tra).
    if (formula.length > 255) return;
    for (let rowNumber = 6; rowNumber <= lastRow; rowNumber += 1) {
      sheet.getCell(rowNumber, column).dataValidation = { type: 'list', allowBlank: true, formulae: [formula] };
    }
  };
  list(COL.department, input.departments);
  list(COL.category, STANDARD_CATEGORIES.map(category => category.name));
  list(COL.frequency, Object.values(FREQUENCY_LABELS));
  list(COL.direction, Object.values(DIRECTION_LABELS));
  list(COL.action, [KEEP_LABEL, DROP_LABEL]);
  sheet.getColumn(COL.id).hidden = true;
  sheet.getColumn(COL.version).hidden = true;

  const meta = workbook.addWorksheet(META_SHEET, { state: 'veryHidden' });
  meta.addRow(['schemaVersion', SHEET_VERSION]);
  meta.addRow(['documentId', document.id]);
  meta.addRow(['exportedAt', new Date().toISOString()]);
  return workbook;
}

export interface SheetRow {
  rowNumber: number;
  id: string | null;
  version: number | null;
  ordinal: string | null;
  name: string;
  unit: string | null;
  targetValue: number | null;
  targetText: string | null;
  departmentName: string | null;
  description: string | null;
  category: string | null;
  frequency: TargetFrequency | null;
  deadline: string | null;
  direction: TargetDirection | null;
  drop: boolean;
  groupName: string | null;
  parentName: string | null;
  /** Thứ tự của hàng trong bảng (chuyên viên có thể đổi chỗ hàng). */
  order: number;
}

export interface SheetIssue {
  row: number;
  message: string;
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value as unknown;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const object = value as { richText?: { text: string }[]; result?: unknown; text?: unknown };
    if (Array.isArray(object.richText)) return object.richText.map(part => part.text).join('').trim();
    if ('result' in object) return object.result === null || object.result === undefined ? '' : String(object.result).trim();
    if (typeof object.text === 'string') return object.text.trim();
    return '';
  }
  return String(value).replace(/\s+/g, ' ').trim();
}

function byLabel<T extends string>(labels: Record<T, string>, raw: string): T | null | undefined {
  if (!raw) return null;
  const key = normalizeVietnamese(raw);
  const found = (Object.entries(labels) as [T, string][]).find(([code, label]) => normalizeVietnamese(label) === key || normalizeVietnamese(code) === key);
  return found ? found[0] : undefined;
}

/** "≥ 95,5" → 95,5; "9.800 USD/người" → 9800; "2 - 3%" → 2 (giữ chữ gốc ở targetText). */
export function parsePlan(raw: unknown): { targetValue: number | null; targetText: string | null } {
  if (typeof raw === 'number' && Number.isFinite(raw)) return { targetValue: raw, targetText: null };
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { targetValue: null, targetText: null };
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(text)) return { targetValue: parseVietnameseNumber(text), targetText: null };
  const first = text.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/);
  return { targetValue: first ? parseVietnameseNumber(first[0]) : null, targetText: text.slice(0, 300) };
}

function parseDeadline(cell: ExcelJS.Cell): string | null | undefined {
  const value = cell.value as unknown;
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = cellText(cell);
  if (!text) return null;
  const vn = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (vn) {
    const [day, month, year] = [Number(vn[1]), Number(vn[2]), Number(vn[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCDate() === day && date.getUTCMonth() === month - 1) return date.toISOString().slice(0, 10);
    return undefined;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return undefined;
}

const GROUP_ORDINAL = /^[IVXLC]{1,6}\.?$/;

/** Đọc bảng chuyên viên tải lên: hàng nhóm, hàng dẫn, hàng chỉ tiêu (có mã: sửa; không mã: thêm mới). */
export function readCandidateWorkbook(workbook: ExcelJS.Workbook): { documentId: string; rows: SheetRow[]; issues: SheetIssue[] } {
  const meta = workbook.getWorksheet(META_SHEET);
  const metaValues = new Map<string, string>();
  meta?.eachRow(row => metaValues.set(cellText(row.getCell(1)), cellText(row.getCell(2))));
  if (metaValues.get('schemaVersion') !== SHEET_VERSION || !metaValues.get('documentId')) {
    throw new BadRequestException('File không phải bảng chỉ tiêu tải từ hệ thống, hoặc đã cũ. Hãy tải bảng mới từ trang văn bản.');
  }
  const sheet = workbook.getWorksheet(SHEET_NAME) ?? workbook.worksheets.find(item => item.name !== META_SHEET);
  if (!sheet) throw new BadRequestException('Không tìm thấy trang "Chỉ tiêu" trong file');
  let headerRow = 0;
  for (let index = 1; index <= Math.min(15, sheet.rowCount); index += 1) {
    const row = sheet.getRow(index);
    if (normalizeVietnamese(cellText(row.getCell(1))) === 'stt' && normalizeVietnamese(cellText(row.getCell(2))) === normalizeVietnamese('Chỉ tiêu')) {
      headerRow = index;
      break;
    }
  }
  if (!headerRow) throw new BadRequestException('Không tìm thấy hàng tiêu đề "STT | Chỉ tiêu"; đừng xoá hoặc đổi tên hàng tiêu đề.');

  const rows: SheetRow[] = [];
  const issues: SheetIssue[] = [];
  let group: string | null = null;
  let parent: string | null = null;
  for (let index = headerRow + 1; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    const text = (key: ColumnKey) => cellText(row.getCell(COL[key]));
    const stt = text('stt');
    const name = text('name');
    const id = text('id') || null;
    const planCell = row.getCell(COL.plan).value as unknown;
    const plan = parsePlan(typeof planCell === 'number' ? planCell : text('plan'));
    const unit = text('unit') || null;
    if (!stt && !name && !id && !unit && plan.targetValue === null && !plan.targetText) continue;
    if (!id && !unit && plan.targetValue === null && !plan.targetText) {
      if (GROUP_ORDINAL.test(stt)) {
        group = name || null;
        parent = null;
      } else if (name) {
        parent = name;
      }
      continue;
    }
    const sub = /^[-–+•]/.test(stt);
    const frequency = byLabel(FREQUENCY_LABELS, text('frequency'));
    const direction = byLabel(DIRECTION_LABELS, text('direction'));
    const deadline = parseDeadline(row.getCell(COL.deadline));
    const versionText = text('version');
    const problems: string[] = [];
    if (name.length < 3 || name.length > 300) problems.push('tên chỉ tiêu phải có 3–300 ký tự');
    if (unit && unit.length > 50) problems.push('đơn vị tính tối đa 50 ký tự');
    if (plan.targetValue !== null && plan.targetValue < 0) problems.push('kế hoạch không được âm');
    if (frequency === undefined) problems.push(`kỳ báo cáo "${text('frequency')}" không hợp lệ (Tháng, Quý, 6 tháng, Năm)`);
    if (direction === undefined) problems.push(`chiều đánh giá "${text('direction')}" không hợp lệ`);
    if (deadline === undefined) problems.push(`hạn hoàn thành "${text('deadline')}" không đọc được (dd/mm/yyyy)`);
    if (id && !/^\d+$/.test(versionText)) problems.push('thiếu cột "Phiên bản" của hàng có mã đề xuất');
    const action = normalizeVietnamese(text('action'));
    if (action && action !== normalizeVietnamese(KEEP_LABEL) && action !== normalizeVietnamese(DROP_LABEL)) problems.push('cột "Xử lý" chỉ nhận "Giữ" hoặc "Bỏ"');
    if (problems.length) issues.push({ row: index, message: problems.join('; ') });
    rows.push({
      rowNumber: index,
      id,
      version: id && /^\d+$/.test(versionText) ? Number(versionText) : null,
      ordinal: sub || !stt ? null : stt.replace(/[.)]$/, '').slice(0, 10),
      name: name.slice(0, 300),
      unit,
      targetValue: plan.targetValue,
      targetText: plan.targetText,
      departmentName: text('department') || null,
      description: text('note').slice(0, 1000) || null,
      category: text('category').slice(0, 100) || null,
      frequency: frequency ?? null,
      deadline: deadline ?? null,
      direction: direction ?? null,
      drop: action === normalizeVietnamese(DROP_LABEL),
      groupName: group,
      parentName: sub ? parent : null,
      order: rows.length,
    });
    if (!sub) parent = name;
  }
  return { documentId: metaValues.get('documentId')!, rows, issues };
}

const SHEET_SELECT = {
  id: true, version: true, status: true, documentId: true, name: true, ordinal: true, parentName: true, description: true,
  category: true, groupName: true, documentOrder: true, unit: true, targetValue: true, targetText: true, targetYear: true,
  direction: true, frequency: true, deadline: true, responsibleDepartmentId: true, proposedById: true, origin: true,
  pageNumber: true, sourceQuote: true, confidence: true, validationFlags: true,
  responsibleDepartment: { select: { name: true } },
} satisfies Prisma.IndicatorCandidateSelect;
type SheetRecord = Prisma.IndicatorCandidateGetPayload<{ select: typeof SHEET_SELECT }>;

type Editable = 'name' | 'ordinal' | 'parentName' | 'description' | 'category' | 'groupName' | 'unit' | 'targetValue' | 'targetText'
  | 'direction' | 'frequency' | 'deadline' | 'responsibleDepartmentId' | 'documentOrder';

export interface PlannedChange {
  row: number;
  id: string;
  name: string;
  fields: Editable[];
  data: Partial<Record<Editable, unknown>>;
  version: number;
}

export interface SheetPlan {
  updates: PlannedChange[];
  creates: (SheetRow & { responsibleDepartmentId: string | null })[];
  drops: { row: number; id: string; name: string; version: number }[];
  unchanged: number;
  notInFile: { id: string; name: string }[];
  errors: SheetIssue[];
  warnings: SheetIssue[];
}

function sameDate(a: Date | null, b: string | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return excelDate(a).toISOString().slice(0, 10) === b;
}

/** So bảng tải lên với đề xuất hiện có: hàng nào sửa trường gì, hàng nào thêm, hàng nào bỏ, hàng nào lỗi. */
export function planSheet(
  rows: SheetRow[],
  issues: SheetIssue[],
  existing: SheetRecord[],
  departments: { id: string; name: string; code: string }[],
  actor: Actor,
): SheetPlan {
  const byId = new Map(existing.map(candidate => [candidate.id, candidate]));
  const plan: SheetPlan = { updates: [], creates: [], drops: [], unchanged: 0, notInFile: [], errors: [...issues], warnings: [] };
  const seen = new Set<string>();
  const erroneous = new Set(issues.map(issue => issue.row));
  // Thứ tự lưu theo bảng chỉ khi chuyên viên đổi chỗ hàng hoặc chèn hàng mới; nếu không, giữ thứ tự đọc của văn bản.
  const known = rows.filter(row => row.id && byId.has(row.id)).map(row => row.id!);
  const position = (id: string) => byId.get(id)?.documentOrder ?? Number.MAX_SAFE_INTEGER;
  const expected = [...known].sort((a, b) => position(a) - position(b));
  const renumber = known.some((id, index) => id !== expected[index]) || rows.some(row => !row.id && !row.drop);
  for (const row of rows) {
    const departmentId = row.departmentName ? matchDepartmentByName(row.departmentName, departments)?.id ?? null : null;
    if (row.departmentName && !departmentId) {
      plan.errors.push({ row: row.rowNumber, message: `không tìm thấy phòng ban "${row.departmentName}" trong danh mục` });
      continue;
    }
    if (erroneous.has(row.rowNumber)) continue;
    if (!row.id) {
      if (!row.drop) plan.creates.push({ ...row, responsibleDepartmentId: departmentId });
      continue;
    }
    const current = byId.get(row.id);
    if (!current) {
      plan.errors.push({ row: row.rowNumber, message: 'mã đề xuất không thuộc văn bản này (đừng chép hàng từ file khác)' });
      continue;
    }
    if (seen.has(row.id)) {
      plan.errors.push({ row: row.rowNumber, message: 'hàng bị lặp mã đề xuất; hàng sao chép phải xoá mã để thành chỉ tiêu mới' });
      continue;
    }
    seen.add(row.id);
    if (current.status !== CandidateStatus.PROPOSED && current.status !== CandidateStatus.SUBMITTED) {
      plan.warnings.push({ row: row.rowNumber, message: `"${current.name}" đã ${current.status === CandidateStatus.APPROVED ? 'được duyệt' : 'bị từ chối'}, bỏ qua hàng này` });
      continue;
    }
    if (row.version !== current.version) {
      plan.errors.push({ row: row.rowNumber, message: `"${current.name}" đã được sửa trên hệ thống sau khi tải bảng; hãy tải bảng mới` });
      continue;
    }
    if (!canEditCandidate(actor, current)) {
      plan.errors.push({ row: row.rowNumber, message: `bạn không được sửa đề xuất "${current.name}" của phòng khác` });
      continue;
    }
    if (row.drop) {
      const clerkScreening = actor.role === 'CLERK' && current.origin === CandidateOrigin.AI && current.status === CandidateStatus.PROPOSED;
      // Như nút "Từ chối": văn thư loại kết quả AI chưa trình; đề xuất khác do người có quyền duyệt quyết định.
      const decider = ['ADMIN', 'LEADER', 'MANAGER', 'CLERK'].includes(actor.role) && canDecideCandidate(actor, current);
      if (!clerkScreening && !decider) {
        plan.errors.push({ row: row.rowNumber, message: `bạn không có quyền loại đề xuất "${current.name}"` });
        continue;
      }
      plan.drops.push({ row: row.rowNumber, id: current.id, name: current.name, version: current.version });
      continue;
    }
    if (departmentId && departmentId !== current.responsibleDepartmentId && !isGlobalRole(actor.role)
      && departmentId !== actor.departmentId && current.proposedById !== actor.id) {
      plan.errors.push({ row: row.rowNumber, message: 'chỉ văn thư hoặc lãnh đạo được chuyển đề xuất sang phòng khác' });
      continue;
    }
    const next: Record<Editable, unknown> = {
      name: row.name,
      ordinal: row.ordinal,
      parentName: row.parentName,
      description: row.description,
      category: row.category,
      groupName: row.groupName,
      unit: row.unit,
      targetValue: row.targetValue,
      targetText: row.targetText,
      direction: row.direction ?? current.direction ?? TargetDirection.HIGHER_IS_BETTER,
      frequency: row.frequency,
      deadline: row.deadline,
      responsibleDepartmentId: departmentId,
      documentOrder: row.order,
    };
    const fields = (Object.keys(next) as Editable[]).filter(field => {
      if (field === 'deadline') return !sameDate(current.deadline, row.deadline);
      if (field === 'documentOrder') return false;
      return (current[field] ?? null) !== (next[field] ?? null);
    });
    const reordered = renumber && current.documentOrder !== row.order;
    if (!fields.length && !reordered) {
      plan.unchanged += 1;
      continue;
    }
    const data = Object.fromEntries(fields.map(field => [field, field === 'deadline' ? (row.deadline ? deadlineDate(row.deadline) : null) : next[field]]));
    plan.updates.push({ row: row.rowNumber, id: current.id, name: row.name, fields, data: renumber ? { ...data, documentOrder: row.order } : data, version: current.version });
  }
  plan.notInFile = existing
    .filter(candidate => !seen.has(candidate.id) && (candidate.status === CandidateStatus.PROPOSED || candidate.status === CandidateStatus.SUBMITTED))
    .map(candidate => ({ id: candidate.id, name: candidate.name }));
  return plan;
}

function sendWorkbook(res: Response, buffer: ExcelJS.Buffer, fileName: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('Cache-Control', 'no-store');
  return res.send(Buffer.from(buffer as ArrayBuffer));
}

function filePart(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'van-ban';
}

@Controller('documents/:id/candidate-sheet')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CandidateSheetController {
  constructor(private prisma: PrismaService) {}

  private async loadDocument(id: string) {
    const document = await this.prisma.sourceDocument.findUnique({ where: { id }, select: { id: true, code: true, title: true, docNumber: true, year: true } });
    if (!document) throw new NotFoundException('Không tìm thấy văn bản');
    return document;
  }

  private scope(actor: Actor): Prisma.IndicatorCandidateWhereInput {
    if (isGlobalRole(actor.role)) return {};
    return { OR: [{ responsibleDepartmentId: actor.departmentId ?? '__none__' }, { proposedById: actor.id }] };
  }

  /** Tải bảng chỉ tiêu (khuôn PL1) của các đề xuất chưa duyệt, theo nhóm và thứ tự văn bản. */
  @Get()
  @Roles(...WORKING_ROLES)
  async download(@Req() req: any, @Res() res: Response, @Param('id') id: string) {
    const actor = getActor(req);
    const document = await this.loadDocument(id);
    const [records, departments, locality] = await Promise.all([
      this.prisma.indicatorCandidate.findMany({
        where: { AND: [{ documentId: id, status: { in: [CandidateStatus.PROPOSED, CandidateStatus.SUBMITTED] } }, this.scope(actor)] },
        select: SHEET_SELECT,
        orderBy: [{ documentOrder: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.department.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: 'asc' } }),
      loadLocality(this.prisma),
    ]);
    const workbook = buildCandidateWorkbook({
      document,
      departments: departments.map(department => department.name),
      creator: brandName(locality),
      candidates: records.map(record => ({
        ...record,
        departmentName: record.responsibleDepartment?.name ?? null,
        flagged: Array.isArray(record.validationFlags) && record.validationFlags.length > 0,
      })),
    });
    return sendWorkbook(res, await workbook.xlsx.writeBuffer(), `Bang_chi_tieu_${filePart(document.docNumber ?? document.code)}.xlsx`);
  }

  /**
   * Tải bảng đã chuẩn hoá lên. Mặc định chỉ xem trước thay đổi; `apply=1` mới ghi; `submit=1` trình luôn các đề xuất đủ
   * thông tin để phòng chủ trì (trưởng phòng) và lãnh đạo duyệt — mỗi phòng nhận đề xuất của phòng mình.
   */
  @Post()
  @Roles(...WORKING_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE, files: 1 } }))
  async upload(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
    @Query('apply') applyRaw?: string,
    @Query('submit') submitRaw?: string,
  ) {
    const actor = getActor(req);
    if (!file) throw new BadRequestException('Vui lòng chọn file Excel');
    if (!file.originalname.toLowerCase().endsWith('.xlsx') || file.buffer.length < 4 || file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) {
      throw new BadRequestException('Chỉ nhận file Excel .xlsx');
    }
    const document = await this.loadDocument(id);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer as any);
    } catch {
      throw new BadRequestException('Không đọc được file .xlsx; file có thể bị hỏng');
    }
    const parsed = readCandidateWorkbook(workbook);
    if (parsed.documentId !== document.id) throw new BadRequestException('Bảng này được tải từ văn bản khác');
    const apply = applyRaw === '1' || applyRaw === 'true';
    const submit = submitRaw === '1' || submitRaw === 'true';

    const load = async (client: Prisma.TransactionClient | PrismaService) => {
      const [existing, departments] = await Promise.all([
        client.indicatorCandidate.findMany({ where: { AND: [{ documentId: id }, this.scope(actor)] }, select: SHEET_SELECT }),
        client.department.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
      ]);
      return planSheet(parsed.rows, parsed.issues, existing, departments, actor);
    };
    const summary = (plan: SheetPlan) => ({
      updates: plan.updates.filter(item => item.fields.length).map(item => ({ row: item.row, id: item.id, name: item.name, fields: item.fields })),
      creates: plan.creates.map(item => ({ row: item.rowNumber, name: item.name })),
      reordered: plan.updates.filter(item => !item.fields.length).length,
      drops: plan.drops.map(item => ({ row: item.row, id: item.id, name: item.name })),
      unchanged: plan.unchanged,
      notInFile: plan.notInFile,
      errors: plan.errors.sort((a, b) => a.row - b.row),
      warnings: plan.warnings,
      totalRows: parsed.rows.length,
    });
    if (!apply) return { applied: false, ...summary(await load(this.prisma)) };

    const setting = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    const autoDays = setting?.proposalAutoApproveDays ?? 3;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const plan = await load(tx);
        if (plan.errors.length) {
          throw new BadRequestException(`Bảng còn ${plan.errors.length} lỗi; sửa rồi tải lên lại: ${plan.errors.slice(0, 3).map(error => `hàng ${error.row}: ${error.message}`).join('; ')}`);
        }
        const touched: string[] = [];
        for (const change of plan.updates) {
          const done = await tx.indicatorCandidate.updateMany({
            where: { id: change.id, version: change.version, status: { in: [CandidateStatus.PROPOSED, CandidateStatus.SUBMITTED] } },
            data: {
              ...(change.data as Prisma.IndicatorCandidateUpdateManyMutationInput),
              ...(change.fields.length ? { humanEdited: true } : {}),
              version: { increment: 1 },
            },
          });
          if (done.count !== 1) throw new ConflictException(`"${change.name}" vừa được người khác sửa; hãy tải bảng mới`);
          if (change.fields.length) {
            const edited = await tx.indicatorCandidate.findUniqueOrThrow({ where: { id: change.id }, select: { ...REVALIDATE_SELECT, editedFields: true } });
            const editedFields = [...new Set([...(Array.isArray(edited.editedFields) ? (edited.editedFields as string[]) : []), ...change.fields])];
            await tx.indicatorCandidate.update({
              where: { id: change.id },
              data: { editedFields, validationFlags: (revalidatedFlags(edited, editedFields) as unknown as Prisma.InputJsonValue) ?? Prisma.DbNull },
            });
          }
          touched.push(change.id);
        }
        for (const row of plan.creates) {
          const created = await tx.indicatorCandidate.create({
            data: {
              documentId: id,
              origin: CandidateOrigin.HUMAN,
              status: CandidateStatus.PROPOSED,
              extractionMethod: ExtractionMethod.RULE_BASED,
              name: row.name,
              ordinal: row.ordinal,
              parentName: row.parentName,
              description: row.description,
              category: row.category,
              groupName: row.groupName,
              documentOrder: row.order,
              unit: row.unit,
              targetValue: row.targetValue,
              targetText: row.targetText,
              targetYear: document.year,
              direction: row.direction ?? TargetDirection.HIGHER_IS_BETTER,
              frequency: row.frequency,
              deadline: row.deadline ? deadlineDate(row.deadline) : null,
              responsibleDepartmentId: row.responsibleDepartmentId ?? (isGlobalRole(actor.role) ? null : actor.departmentId ?? null),
              legalBasis: document.docNumber,
              targetKind: FrameworkKind.PLAN,
              sourceQuote: '',
              confidence: 1,
              humanEdited: true,
              proposedById: actor.id,
            },
            select: { id: true },
          });
          touched.push(created.id);
        }
        for (const drop of plan.drops) {
          const done = await tx.indicatorCandidate.updateMany({
            where: { id: drop.id, version: drop.version, status: { in: [CandidateStatus.PROPOSED, CandidateStatus.SUBMITTED] } },
            data: {
              status: CandidateStatus.REJECTED,
              reviewNote: 'Chuyên viên loại khi chuẩn hoá bảng chỉ tiêu',
              reviewedById: actor.id,
              reviewedAt: new Date(),
              autoApproveAt: null,
              version: { increment: 1 },
            },
          });
          if (done.count !== 1) throw new ConflictException(`"${drop.name}" vừa được người khác sửa; hãy tải bảng mới`);
        }

        // Trình: mỗi đề xuất đủ thông tin chuyển sang chờ duyệt; mỗi phòng nhận một thông báo cho các đề xuất của mình.
        const submitted: { id: string; name: string; departmentId: string | null }[] = [];
        const incomplete: { id: string; name: string; missing: string[] }[] = [];
        if (submit) {
          const now = new Date();
          const fresh = await tx.indicatorCandidate.findMany({
            where: { AND: [{ documentId: id, status: CandidateStatus.PROPOSED }, this.scope(actor)] },
            select: { id: true, name: true, unit: true, targetValue: true, targetYear: true, responsibleDepartmentId: true, frequency: true, deadline: true, proposedById: true },
          });
          for (const candidate of fresh) {
            if (!canEditCandidate(actor, candidate)) continue;
            const missing = missingApprovalFields(candidate);
            if (missing.length) {
              incomplete.push({ id: candidate.id, name: candidate.name, missing });
              continue;
            }
            await tx.indicatorCandidate.update({
              where: { id: candidate.id },
              data: {
                status: CandidateStatus.SUBMITTED,
                submittedById: actor.id,
                submittedAt: now,
                autoApproveAt: autoDays > 0 ? new Date(now.getTime() + autoDays * 86_400_000) : null,
                version: { increment: 1 },
              },
            });
            await recordWorkEvent(tx, {
              action: 'PROPOSAL_SUBMITTED', actor, candidateId: candidate.id, departmentId: candidate.responsibleDepartmentId,
              note: `Trình từ bảng chỉ tiêu của văn bản ${document.code}${autoDays > 0 ? `; tự thông qua sau ${autoDays} ngày nếu không ai xử lý` : ''}`,
            });
            submitted.push({ id: candidate.id, name: candidate.name, departmentId: candidate.responsibleDepartmentId });
          }
          const byDepartment = new Map<string | null, typeof submitted>();
          for (const item of submitted) byDepartment.set(item.departmentId, [...(byDepartment.get(item.departmentId) ?? []), item]);
          for (const [departmentId, items] of byDepartment) {
            await notifyUsers(tx, await approverIds(tx, departmentId), {
              kind: 'PROPOSAL_SUBMITTED',
              title: `${items.length} đề xuất chỉ tiêu chờ duyệt từ văn bản ${document.docNumber ?? document.code}`,
              body: `${actor.fullName} trình sau khi chuẩn hoá bảng chỉ tiêu: ${items.slice(0, 5).map(item => item.name).join('; ')}${items.length > 5 ? '…' : ''}`,
              link: `/documents/${id}`,
              entityType: 'SourceDocument',
              entityId: id,
              dedupeKey: `candidate-sheet:${id}:${departmentId ?? 'none'}:${now.getTime()}`,
            }, actor.id);
          }
        }
        await audit(tx, actor, {
          action: 'CANDIDATE_SHEET_IMPORTED',
          entityType: 'SourceDocument',
          entityId: id,
          metadata: {
            fileName: file.originalname.slice(0, 160),
            updated: plan.updates.length, created: plan.creates.length, dropped: plan.drops.length, submitted: submitted.length,
          },
        });
        return { applied: true, ...summary(plan), submitted: submitted.length, incomplete };
      }, { timeout: 60_000 });
    } catch (error) {
      if (isConcurrencyError(error)) throw new ConflictException('Đề xuất vừa thay đổi. Vui lòng tải bảng mới.');
      throw error;
    }
  }
}
