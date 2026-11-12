import { FrameworkKind, IssuingLevel, TargetDirection, TargetFrequency } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { calculateProgress } from './metrics';
import { parsePeriodKey, periodBounds, periodLabel } from './periods';
import { formatVietnameseNumber } from './target-threshold';

// Báo cáo tổng kết tháng, quý, năm theo mẫu "Phụ lục 1" kèm báo cáo của UBND phường: mỗi chỉ tiêu một dòng, mức giao
// của Đảng ủy (chỉ tiêu địa phương tự đặt) và của cấp trên đứng cạnh nhau, rồi số luỹ kế đến hết kỳ và ghi chú.

export interface SummaryTarget {
  id: string;
  title: string;
  standardCode: string | null;
  groupName: string | null;
  unit: string;
  targetText: string | null;
  targetValue: number;
  direction: TargetDirection;
  kind: FrameworkKind;
  issuingLevel: IssuingLevel;
}

export interface SummaryUpdate {
  targetId: string;
  value: number;
  valueText: string | null;
  note: string | null;
  periodKey: string | null;
  createdAt: Date;
}

export interface SummaryRow {
  group: string;
  title: string;
  code: string;
  unit: string;
  local: string;
  upper: string;
  cumulative: string;
  note: string;
}

const NONE = 'Không';

function withUnit(value: number, unit: string) {
  const text = formatVietnameseNumber(value);
  return unit === '%' ? `${text}%` : `${text} ${unit}`.trim();
}

function planText(target: SummaryTarget | undefined) {
  if (!target) return NONE;
  if (target.kind === FrameworkKind.STAT) return '';
  return target.targetText?.trim() || withUnit(target.targetValue, target.unit);
}

/** Thời điểm một lượt báo cáo có hiệu lực: hết kỳ tháng/quý/6 tháng nó ghi, còn báo cáo năm thì tính lúc nhập. */
function effectiveTime(update: SummaryUpdate) {
  const parts = update.periodKey ? parsePeriodKey(update.periodKey) : null;
  return parts && parts.frequency !== TargetFrequency.YEARLY ? periodBounds(update.periodKey!)!.end : update.createdAt;
}

/**
 * Gộp chỉ tiêu thành dòng báo cáo. Chỉ tiêu cùng mã số (hoặc cùng tên khi không có mã) ở bộ của địa phương và bộ cấp
 * trên giao là một dòng. `targets` đã theo thứ tự hiển thị; `updates` là các lượt báo cáo đã duyệt.
 */
export function summaryRows(targets: SummaryTarget[], updates: SummaryUpdate[], periodKey: string): SummaryRow[] {
  const end = periodBounds(periodKey)?.end;
  if (!end) throw new Error(`Mã kỳ không hợp lệ: ${periodKey}`);
  const latest = new Map<string, SummaryUpdate>();
  for (const update of updates) {
    const at = effectiveTime(update);
    if (at > end) continue;
    const current = latest.get(update.targetId);
    if (!current || at > effectiveTime(current) || (+at === +effectiveTime(current) && update.createdAt > current.createdAt)) {
      latest.set(update.targetId, update);
    }
  }

  const merged = new Map<string, { local?: SummaryTarget; upper?: SummaryTarget }>();
  for (const target of targets) {
    const key = target.standardCode?.trim().toUpperCase() || target.title.replace(/\s+/g, ' ').trim().toLowerCase();
    const entry = merged.get(key) ?? {};
    if (target.issuingLevel === IssuingLevel.LOCAL) entry.local ??= target;
    else entry.upper ??= target;
    merged.set(key, entry);
  }

  const rows = [...merged.values()].map(({ local, upper }) => {
    const main = (local ?? upper)!;
    // Số thực hiện lấy ở chỉ tiêu của địa phương trước; chưa có thì lấy ở chỉ tiêu cấp trên giao.
    const reported = [local, upper].find(target => target && latest.has(target.id));
    const update = reported && latest.get(reported.id);
    const verdict = update && reported.kind !== FrameworkKind.STAT
      ? calculateProgress(reported.targetValue, update.value, reported.direction) >= 100 ? 'Đạt' : 'Chưa đạt'
      : '';
    return {
      group: main.groupName?.trim() ?? '',
      title: main.title,
      code: main.standardCode?.trim() ?? '',
      unit: main.unit,
      local: planText(local),
      upper: planText(upper),
      cumulative: update ? update.valueText?.trim() || withUnit(update.value, reported!.unit) : '',
      note: [update?.note?.trim(), verdict].filter(Boolean).join('; '),
    };
  });
  // Giữ thứ tự nhóm theo lần xuất hiện đầu, các dòng cùng nhóm đứng liền nhau.
  const groups = [...new Set(rows.map(row => row.group))];
  return groups.flatMap(group => rows.filter(row => row.group === group));
}

function roman(value: number) {
  const steps: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let text = '';
  for (const [size, symbol] of steps) for (; value >= size; value -= size) text += symbol;
  return text;
}

export const SUMMARY_SHEET_NAME = 'PHU_LUC_1';
export const SUMMARY_HEADER_ROW = 8;
const HEADERS = ['STT', 'CHỈ TIÊU CHỦ YẾU', 'Mã số', 'Đơn vị tính', 'Chỉ tiêu Đảng ủy', 'Chỉ tiêu UBND TP', 'Luỹ kế đến hiện tại', 'Ghi chú'];
const WIDTHS = [6, 40, 9, 10, 14, 14, 16, 46];
const FONT = 'Times New Roman';
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' },
};

export function buildSummaryWorkbook(input: {
  rows: SummaryRow[];
  periodKey: string;
  agencyName: string;
  localityName: string;
}): ExcelJS.Workbook {
  const year = parsePeriodKey(input.periodKey)!.year;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SUMMARY_SHEET_NAME, {
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      printTitlesRow: `${SUMMARY_HEADER_ROW}:${SUMMARY_HEADER_ROW}`,
      margins: { left: 0.5, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    views: [{ showGridLines: false }],
  });
  sheet.columns = WIDTHS.map(width => ({ width }));

  const line = (rowNumber: number, range: string, text: string, font: Partial<ExcelJS.Font> = {}) => {
    sheet.mergeCells(`${range.split(':')[0]}${rowNumber}:${range.split(':')[1]}${rowNumber}`);
    const cell = sheet.getCell(`${range.split(':')[0]}${rowNumber}`);
    cell.value = text;
    cell.font = { name: FONT, size: 12, ...font };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  };
  const agencyShort = /^[uủ]y ban nhân dân$/i.test(input.agencyName.trim()) ? 'UBND' : input.agencyName.trim();
  const locality = input.localityName.trim();
  line(1, 'A:C', input.agencyName.toUpperCase(), { bold: true });
  line(2, 'A:C', locality.toUpperCase(), { bold: true });
  line(1, 'E:H', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true });
  line(2, 'E:H', 'Độc lập - Tự do - Hạnh phúc', { bold: true, size: 13 });
  line(4, 'A:H', 'PHỤ LỤC 1', { bold: true, size: 14 });
  line(5, 'A:H', `KẾT QUẢ THỰC HIỆN CÁC CHỈ TIÊU CHỦ YẾU ${periodLabel(input.periodKey).toUpperCase()}`, { bold: true, size: 13 });
  line(6, 'A:H', `(Kèm theo Báo cáo số      /BC-UBND ngày    tháng    năm ${year} của ${agencyShort} ${locality.charAt(0).toLowerCase()}${locality.slice(1)})`, { italic: true, size: 13 });

  const style = (row: ExcelJS.Row, bold: boolean, centered: number[]) => {
    for (let column = 1; column <= HEADERS.length; column++) {
      const cell = row.getCell(column);
      cell.font = { name: FONT, size: 12, bold: bold || column === 1 };
      cell.border = BORDER;
      cell.alignment = { horizontal: centered.includes(column) ? 'center' : 'left', vertical: 'middle', wrapText: true };
    }
  };
  const head = sheet.getRow(SUMMARY_HEADER_ROW);
  head.values = HEADERS;
  head.height = 34;
  style(head, true, [1, 3, 4, 5, 6, 7]);

  let stt = 0;
  let groupIndex = 0;
  let group: string | null = null;
  for (const row of input.rows) {
    if (row.group !== group) {
      group = row.group;
      // Chỉ tiêu không thuộc nhóm nào đứng liền dưới tiêu đề, không có dòng nhóm.
      if (group) style(sheet.addRow([roman(++groupIndex), group.replace(/^(?:\d+|[IVX]+)[.)]\s+/, '').toUpperCase()]), true, [1]);
    }
    style(sheet.addRow([++stt, row.title, row.code, row.unit, row.local, row.upper, row.cumulative, row.note]), false, [1, 3, 4, 5, 6, 7]);
  }
  return workbook;
}
