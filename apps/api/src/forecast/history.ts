import { BadRequestException } from '@nestjs/common';
import { FrameworkKind, TargetDirection, TargetFrequency } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { parsePeriodKey } from '../periods';
import { parsePlanningDueDate } from '../planning-date';

export const HISTORY_HEADERS = ['Năm', 'Mã chỉ tiêu', 'Tên chỉ tiêu', 'Kỳ', 'Giá trị', 'Mức giao', 'Ngày báo cáo', 'Hạn', 'Đơn vị', 'Chiều đánh giá', 'Loại bộ'];
export interface HistoricalRow {
  seriesKey: string; year: number; title: string; periodKey: string; value: number; targetValue: number;
  unit: string; direction: TargetDirection; kind: FrameworkKind; frequency: TargetFrequency; reportedAt: Date; dueDate: Date;
}
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim().replace(/\s+/g, ' ');

/** RFC 4180: hỗ trợ dấu phẩy/chấm phẩy, dấu nháy kép và xuống dòng trong ô. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, ''), delimiter = clean.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',';
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let index = 0; index < clean.length; index++) {
    const char = clean[index];
    if (char === '"') {
      if (quoted && clean[index + 1] === '"') { cell += '"'; index++; }
      else if (!cell || quoted) quoted = !quoted;
      else throw new BadRequestException('CSV có dấu nháy không hợp lệ');
    } else if (char === delimiter && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && clean[index + 1] === '\n') index++;
      row.push(cell); if (row.some(value => value.trim())) rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new BadRequestException('CSV thiếu dấu nháy đóng');
  row.push(cell); if (row.some(value => value.trim())) rows.push(row);
  return rows;
}
function dateValue(raw: unknown, deadline: boolean): Date {
  if (raw instanceof Date && Number.isFinite(raw.getTime())) return deadline ? parsePlanningDueDate(raw.toISOString().slice(0, 10)) : raw;
  const text = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return deadline ? parsePlanningDueDate(text) : new Date(parsePlanningDueDate(text).getTime() - 8 * 60 * 60 * 1000);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) throw new Error('Ngày phải theo YYYY-MM-DD hoặc thời điểm ISO có múi giờ');
  parsePlanningDueDate(text.slice(0, 10));
  const result = new Date(text); if (!Number.isFinite(result.getTime())) throw new Error('Ngày không hợp lệ'); return result;
}
export function validateHistoryRows(table: unknown[][], now = new Date()): HistoricalRow[] {
  if (table.length < 2) throw new BadRequestException('Tệp chưa có dòng dữ liệu');
  if (table.length > 5001) throw new BadRequestException('Mỗi tệp tối đa 5.000 dòng');
  const aliases = [ ['nam', 'year'], ['ma chi tieu', 'code', 'serieskey'], ['ten chi tieu', 'title', 'name'], ['ky', 'periodkey', 'period'], ['gia tri', 'value'], ['muc giao', 'targetvalue'], ['ngay bao cao', 'reportedat'], ['han', 'duedate'], ['don vi', 'unit'], ['chieu danh gia', 'direction'], ['loai bo', 'kind'] ];
  const headers = table[0].map(normalize), columns = aliases.map(names => headers.findIndex(header => names.includes(header)));
  for (const index of [0, 3, 4, 5, 6, 7]) if (columns[index] < 0) throw new BadRequestException(`Thiếu cột ${HISTORY_HEADERS[index]}`);
  if (columns[1] < 0 && columns[2] < 0) throw new BadRequestException('Cần cột Mã chỉ tiêu hoặc Tên chỉ tiêu');
  const rows: HistoricalRow[] = [], errors: string[] = [], consistency = new Map<string, string>();
  table.slice(1).forEach((row, offset) => {
    if (!row.some(value => value !== null && value !== undefined && String(value).trim())) return;
    const get = (index: number) => columns[index] < 0 ? '' : row[columns[index]];
    try {
      if (row.some(value => typeof value === 'object' && value !== null && !(value instanceof Date))) throw new Error('Không nhận công thức, siêu liên kết hoặc ô dữ liệu đặc biệt');
      const year = Number(get(0)), periodKey = String(get(3)).trim(), period = parsePeriodKey(periodKey);
      if (!Number.isInteger(year) || year < 2000 || year > now.getUTCFullYear() || period?.year !== year) throw new Error('Năm hoặc kỳ không hợp lệ');
      const code = String(get(1) ?? '').trim(), title = String(get(2) || code).trim();
      if (!title || title.length > 500 || code.length > 150) throw new Error('Tên/mã chỉ tiêu trống hoặc quá dài');
      const rawValue = String(get(4) ?? '').trim(), rawTarget = String(get(5) ?? '').trim();
      const value = Number(rawValue), targetValue = Number(rawTarget);
      if (!rawValue || !rawTarget || !Number.isFinite(value) || !Number.isFinite(targetValue) || Math.abs(value) > 1e15 || Math.abs(targetValue) > 1e15 || targetValue < 0) throw new Error('Giá trị/mức giao phải là số hữu hạn; mức giao không âm');
      const reportedAt = dateValue(get(6), false), dueDate = dateValue(get(7), true);
      if (dueDate >= now || dueDate.getUTCFullYear() !== year || reportedAt > now || reportedAt.getUTCFullYear() < year || reportedAt.getTime() > dueDate.getTime() + 366 * 86_400_000) throw new Error('Chỉ nhận kỳ đánh giá đã kết thúc và ngày báo cáo phù hợp');
      const unit = String(get(8) ?? '').trim(), directionText = String(get(9) || 'HIGHER_IS_BETTER').trim().toUpperCase(), kindText = String(get(10) || 'PLAN').trim().toUpperCase();
      if (unit.length > 80 || !['HIGHER_IS_BETTER', 'LOWER_IS_BETTER'].includes(directionText) || !['PLAN', 'SCORE', 'TASK'].includes(kindText)) throw new Error('Đơn vị, chiều đánh giá hoặc loại bộ không hợp lệ');
      const seriesKey = normalize(code || title), direction = directionText as TargetDirection, kind = kindText as FrameworkKind;
      const key = `${seriesKey}:${year}`, signature = JSON.stringify([targetValue, direction, kind, unit, dueDate.toISOString(), period.frequency]);
      if (consistency.has(key) && consistency.get(key) !== signature) throw new Error('Các kỳ của cùng chỉ tiêu/năm phải cùng mức giao, hạn, đơn vị, chiều, loại và tần suất');
      consistency.set(key, signature);
      rows.push({ seriesKey, year, title, periodKey, value, targetValue, unit, direction, kind, frequency: period.frequency, reportedAt, dueDate });
    } catch (error) { errors.push(`Dòng ${offset + 2}: ${error instanceof Error ? error.message : 'Dữ liệu không hợp lệ'}`); }
  });
  if (errors.length) throw new BadRequestException({ message: 'Tệp có dữ liệu không hợp lệ, chưa nhập dòng nào', errors: errors.slice(0, 30), errorCount: errors.length });
  if (!rows.length) throw new BadRequestException('Tệp chưa có dòng dữ liệu');
  const keys = new Set<string>();
  for (const row of rows) { const key = `${row.seriesKey}:${row.year}:${row.periodKey}`; if (keys.has(key)) throw new BadRequestException('Tệp có kỳ bị trùng cho cùng một chỉ tiêu'); keys.add(key); }
  return rows;
}
export async function readHistoryFile(file: Express.Multer.File): Promise<HistoricalRow[]> {
  if (!file?.buffer?.length) throw new BadRequestException('Chọn tệp Excel hoặc CSV');
  if (file.size > 5 * 1024 * 1024) throw new BadRequestException('Tệp tối đa 5 MB');
  if (/\.csv$/i.test(file.originalname)) return validateHistoryRows(parseCsv(file.buffer.toString('utf8')));
  if (!/\.xlsx$/i.test(file.originalname)) throw new BadRequestException('Chỉ nhận .xlsx hoặc .csv');
  try {
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(file.buffer as any);
    const sheet = workbook.getWorksheet('LICH_SU') ?? workbook.worksheets[0];
    if (!sheet || sheet.rowCount > 5001) throw new BadRequestException('Tệp tối đa 5.000 dòng dữ liệu');
    const rows: unknown[][] = []; sheet.eachRow({ includeEmpty: true }, row => rows.push((row.values as unknown[]).slice(1)));
    return validateHistoryRows(rows);
  } catch (error) { if (error instanceof BadRequestException) throw error; throw new BadRequestException('Không đọc được tệp Excel'); }
}
export function historyTemplate(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('LICH_SU');
  sheet.addRow(HISTORY_HEADERS); sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.columns.forEach(column => { column.width = 22; }); sheet.getColumn(3).width = 45;
  const guide = workbook.addWorksheet('HUONG_DAN');
  [
    'Dữ liệu chỉ dùng huấn luyện, không ghi vào số liệu vận hành. Chỉ nhập năm/kỳ đánh giá đã kết thúc.',
    'Mỗi dòng là một kỳ. Mã chỉ tiêu phải ổn định qua các năm; nếu không có mã thì dùng tên thống nhất.',
    'Kỳ: 2025-M01, 2025-Q1, 2025-H1 hoặc 2025. Ngày báo cáo và hạn: YYYY-MM-DD.',
    'Chiều đánh giá: HIGHER_IS_BETTER hoặc LOWER_IS_BETTER. Loại bộ: PLAN, SCORE hoặc TASK.',
    'Đơn vị % dùng hồi quy tuyến tính; các đơn vị cộng dồn dùng ngoại suy theo nhịp. Chỉ tiêu càng thấp càng tốt dùng hồi quy tuyến tính.',
    'Mỗi chỉ tiêu/năm cần ít nhất hai kỳ. Nên cung cấp các kỳ giữa năm và kỳ cuối, kể cả báo cáo sau hạn.',
    'Cùng chỉ tiêu/năm phải cùng mức giao, hạn, đơn vị và tần suất. Không dùng công thức Excel.',
    'Tệp CSV UTF-8 có cùng tên cột; số thập phân dùng dấu chấm. Tối đa 5.000 dòng, 5 MB mỗi tệp.',
    'Nhập lại cùng mã/năm/kỳ được bỏ qua; lịch sử đã nhập không bị ghi đè. Đánh dấu mô phỏng nếu không phải số liệu thật.',
  ].forEach(text => guide.addRow([text])); guide.getColumn(1).width = 120;
  return workbook;
}
