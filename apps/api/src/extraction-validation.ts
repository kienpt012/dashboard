import { diceSimilarity } from './matching';
import { baselineReason, hasTargetFigure, type SectionKind } from './target-signal';

// B10. Kiểm tra bản ghi chỉ tiêu bằng luật. Bản ghi trượt luật KHÔNG bị xóa: nó mang cờ và vào hàng chờ duyệt
// (B15) như mọi đề xuất AI khác (D-006), người duyệt thấy rõ trượt luật nào. Luật chạy lại khi người duyệt sửa bản ghi.

export type ValidationRule =
  | 'cau_truc'
  | 'bam_nguon'
  | 'don_vi'
  | 'mien_gia_tri'
  | 'nam_va_han'
  | 'ten_chi_tieu'
  | 'nhat_quan'
  | 'chat_luong_ocr'
  | 'loai_thong_tin';

export interface ValidationFlag {
  rule: ValidationRule;
  message: string;
}

export const VALIDATION_RULE_LABELS: Record<ValidationRule, string> = {
  cau_truc: 'Cấu trúc',
  bam_nguon: 'Bám nguồn',
  don_vi: 'Đơn vị',
  mien_gia_tri: 'Miền giá trị',
  nam_va_han: 'Năm và hạn',
  ten_chi_tieu: 'Tên chỉ tiêu',
  nhat_quan: 'Nhất quán',
  chat_luong_ocr: 'Chất lượng OCR',
  loai_thong_tin: 'Loại thông tin',
};

export interface ValidationRecord {
  name: string;
  unit: string | null;
  targetValue: number | null;
  targetYear: number | null;
  /** YYYY-MM-DD hoặc Date. */
  deadline: string | Date | null;
  sourceQuote: string;
  parentName?: string | null;
  /** Đầu ra LLM bị cắt và phải khôi phục (luật Cấu trúc). */
  structureRepaired?: boolean;
  /** Đơn vị hợp lệ theo mã chỉ tiêu (danh mục hoặc chỉ tiêu trùng đã có). */
  expectedUnits?: (string | null | undefined)[] | null;
  /** Cờ và độ tin cậy OCR thấp nhất của các phần tử nguồn. */
  ocr?: { flags: string[]; minConfidence: number | null } | null;
  /** Trường người duyệt đã sửa: không bắt bẻ lại bằng câu trích có thể đọc sai. */
  humanEditedFields?: string[];
  /** Nhiệm vụ (không phải chỉ tiêu số): mục tiêu quy ước "hoàn thành 100%" không cần có nguyên văn trong câu trích. */
  task?: boolean;
  /** Năm kế hoạch của văn bản, dùng khi bản ghi không có năm (nhận số liệu nền "năm 2025 là 80 hộ"). */
  planYear?: number | null;
  /** Phần của văn bản chứa câu trích (chỉ đặt cho bản ghi đọc từ văn xuôi). */
  section?: SectionKind;
}

export const OCR_MIN_CONFIDENCE = 0.7;
const MIN_NAME_WORDS = 4;

export function normalizeUnit(unit: string | null | undefined): string {
  return (unit ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/m²/g, 'm2')
    .replace(/phần trăm/g, '%')
    .replace(/\s+/g, '')
    .trim();
}

function normalizeText(value: string) {
  return value.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Mọi cách đọc một số trong văn bản: kiểu Việt ("3.450", "95,5") và kiểu Anh ("3,450", "95.5"). */
export function numberReadings(token: string): number[] {
  const values = new Set<number>();
  const compact = token.replace(/\s/g, '');
  const vietnamese = Number(compact.replace(/\./g, '').replace(',', '.'));
  if (Number.isFinite(vietnamese)) values.add(vietnamese);
  const english = Number(compact.replace(/,/g, ''));
  if (Number.isFinite(english)) values.add(english);
  if (/^\d+[.,]\d+$/.test(compact)) {
    const decimal = Number(compact.replace(',', '.'));
    if (Number.isFinite(decimal)) values.add(decimal);
  }
  return [...values];
}

const NUMBER_TOKEN = /\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?/g;

export function numbersInText(text: string): number[] {
  const values: number[] = [];
  for (const match of text.matchAll(NUMBER_TOKEN)) values.push(...numberReadings(match[0]));
  return values;
}

function sameNumber(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-9);
}

/** Ngày YYYY-MM-DD có xuất hiện trong câu trích (dd/mm/yyyy, d-m-yyyy, "ngày d tháng m năm yyyy")? */
export function dateAppearsIn(date: string, text: string): boolean {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, year, month, day] = match;
  const d = String(Number(day));
  const m = String(Number(month));
  const normalized = normalizeText(text);
  const patterns = [
    new RegExp(`\\b0?${d}\\s*[/.-]\\s*0?${m}\\s*[/.-]\\s*${year}\\b`),
    new RegExp(`ngày\\s+0?${d}\\s+tháng\\s+0?${m}\\s+năm\\s+${year}`),
    // "trước 30/6": ngày và tháng, không ghi năm.
    new RegExp(`(^|[^\\d/.-])0?${d}\\s*/\\s*0?${m}(?![\\d/])`),
  ];
  // Hạn là ngày cuối kỳ thì câu trích ghi kỳ là đủ: "tháng 6/2026", "quý II/2026", "6 tháng đầu năm".
  const monthNumber = Number(month);
  if (Number(day) === new Date(Date.UTC(Number(year), monthNumber, 0)).getUTCDate()) {
    patterns.push(new RegExp(`tháng\\s*0?${m}(?!\\d)`));
    if (monthNumber % 3 === 0) {
      const quarter = monthNumber / 3;
      patterns.push(new RegExp(`quý\\s*(${quarter}|${['i', 'ii', 'iii', 'iv'][quarter - 1]})(?![\\p{L}\\d])`, 'u'));
    }
    if (monthNumber === 6) patterns.push(/(6|sáu) tháng đầu năm/);
  }
  return patterns.some(pattern => pattern.test(normalized));
}

/** Năm chỉ xuất hiện trong cụm so sánh ("so với năm 2025", "so với cùng kỳ năm 2025") → không phải năm kế hoạch. */
export function yearOnlyFromComparison(year: number, text: string): boolean {
  const normalized = normalizeText(text);
  const all = [...normalized.matchAll(/\b(20\d{2})\b/g)].filter(match => Number(match[1]) === year);
  if (!all.length) return false;
  return all.every((match) => {
    const before = normalized.slice(Math.max(0, (match.index ?? 0) - 40), match.index ?? 0);
    return /(so với|so cùng kỳ|so với cùng kỳ|tăng so|giảm so)[^.;]*$/.test(before);
  });
}

function editedAny(record: ValidationRecord, fields: string[]) {
  return fields.some(field => record.humanEditedFields?.includes(field));
}

/** Kiểm tra một bản ghi theo các luật không cần nhìn bản ghi khác. */
export function validateRecord(record: ValidationRecord, sourceText?: string | null): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  const quote = record.sourceQuote?.trim() ?? '';

  // Cấu trúc: đủ trường bắt buộc của schema chỉ tiêu.
  const missing: string[] = [];
  if (!record.name || record.name.trim().length < 3) missing.push('tên');
  if (record.targetValue === null || record.targetValue === undefined) missing.push('giá trị');
  if (!record.unit) missing.push('đơn vị');
  if (!quote) missing.push('câu trích');
  if (missing.length) flags.push({ rule: 'cau_truc', message: `Thiếu trường bắt buộc: ${missing.join(', ')}.` });
  if (record.structureRepaired) {
    flags.push({ rule: 'cau_truc', message: 'Đầu ra của Qwen bị cắt và đã được khôi phục một phần.' });
  }

  // Bám nguồn: giá trị và ngày phải xuất hiện nguyên văn trong câu trích; câu trích phải có trong đoạn nguồn.
  if (quote) {
    if (sourceText && !normalizeText(sourceText).includes(normalizeText(quote))) {
      flags.push({ rule: 'bam_nguon', message: 'Câu trích không có nguyên văn trong đoạn nguồn.' });
    }
    if (record.targetValue !== null && record.targetValue !== undefined && !record.task && !editedAny(record, ['targetValue'])) {
      const found = numbersInText(quote).some(value => sameNumber(value, record.targetValue!));
      if (!found) {
        flags.push({ rule: 'bam_nguon', message: `Giá trị ${record.targetValue} không có nguyên văn trong câu trích, nghi bị suy ra.` });
      }
    }
    const deadline = record.deadline instanceof Date ? record.deadline.toISOString().slice(0, 10) : record.deadline;
    const yearEnd = record.targetYear ? `${record.targetYear}-12-31` : null;
    if (deadline && deadline !== yearEnd && !editedAny(record, ['deadline']) && !dateAppearsIn(deadline, quote)) {
      flags.push({ rule: 'bam_nguon', message: `Hạn ${deadline} không có nguyên văn trong câu trích.` });
    }
  }

  // Đơn vị: thuộc danh sách đơn vị của mã chỉ tiêu (khi biết mã).
  const expected = (record.expectedUnits ?? []).map(normalizeUnit).filter(Boolean);
  if (record.unit && expected.length && !expected.includes(normalizeUnit(record.unit))) {
    flags.push({ rule: 'don_vi', message: `Đơn vị "${record.unit}" khác đơn vị của chỉ tiêu trong danh mục (${[...new Set(record.expectedUnits!.filter(Boolean))].join(', ')}).` });
  }

  // Miền giá trị: phần trăm 0–100, số lượng không âm, năm và hạn hợp lệ.
  if (record.targetValue !== null && record.targetValue !== undefined) {
    if (record.targetValue < 0) flags.push({ rule: 'mien_gia_tri', message: 'Giá trị âm.' });
    if (normalizeUnit(record.unit) === '%' && record.targetValue > 100) {
      flags.push({ rule: 'mien_gia_tri', message: 'Tỷ lệ phần trăm lớn hơn 100.' });
    }
  }
  if (record.targetYear !== null && record.targetYear !== undefined && (record.targetYear < 2000 || record.targetYear > 2100)) {
    flags.push({ rule: 'mien_gia_tri', message: `Năm ${record.targetYear} ngoài kỳ báo cáo hợp lệ.` });
  }
  const deadlineDate = record.deadline instanceof Date ? record.deadline : record.deadline ? new Date(`${record.deadline}T00:00:00Z`) : null;
  if (deadlineDate && record.targetYear) {
    const year = deadlineDate.getUTCFullYear();
    if (Number.isNaN(year) || year < record.targetYear - 1 || year > record.targetYear + 10) {
      flags.push({ rule: 'mien_gia_tri', message: 'Hạn hoàn thành không khớp năm kế hoạch.' });
    }
  }

  // Năm và hạn: không lấy năm từ cụm "so với năm 20xx".
  if (record.targetYear && quote && !editedAny(record, ['targetYear']) && yearOnlyFromComparison(record.targetYear, quote)) {
    flags.push({ rule: 'nam_va_han', message: `Năm ${record.targetYear} lấy từ cụm so sánh ("so với năm…"), không phải năm kế hoạch.` });
  }

  // Tên chỉ tiêu: từ 4 từ trở lên, không bắt đầu bằng chữ thường (dấu hiệu tên bị cắt giữa câu).
  const name = (record.name ?? '').trim();
  const words = name.split(/\s+/).filter(word => /\p{L}/u.test(word));
  if (words.length < MIN_NAME_WORDS) {
    flags.push({ rule: 'ten_chi_tieu', message: `Tên chỉ có ${words.length} từ, có thể bị cắt.` });
  } else if (/^\p{Ll}/u.test(name)) {
    flags.push({ rule: 'ten_chi_tieu', message: 'Tên bắt đầu bằng chữ thường, có thể bị cắt giữa câu.' });
  }

  // Tên phải bám câu trích: model có lúc lấy tên của chỉ tiêu liền trước (giá trị và câu trích đúng, tên sai).
  // Chỉ tiêu thành phần mang tên cha ở đầu ("Tỷ lệ trường đạt chuẩn — Mầm non") mà câu trích chỉ là dòng "- Mầm non":
  // so phần tên riêng của nó.
  const parentPrefix = record.parentName ? `${record.parentName.trim()} — ` : '';
  const ownName = parentPrefix && name.startsWith(parentPrefix) ? name.slice(parentPrefix.length) : name;
  if (nameMissingFromQuote(ownName, record.sourceQuote)) {
    flags.push({ rule: 'ten_chi_tieu', message: 'Tên chỉ tiêu không khớp câu trích dẫn, có thể lấy nhầm tên của chỉ tiêu bên cạnh.' });
  }

  // Loại thông tin: số liệu nền (kết quả kỳ trước, hiện trạng) và câu giao việc không ghi mức cần đạt không phải
  // chỉ tiêu kế hoạch. Chỉ nhắc người duyệt, không tự bỏ bản ghi.
  if (quote && !record.task && record.targetValue !== null && record.targetValue !== undefined && !editedAny(record, ['targetValue'])) {
    const reason = baselineReason(quote, record.targetValue, record.targetYear ?? record.planYear ?? null);
    if (reason) flags.push({ rule: 'loai_thong_tin', message: `Có thể là số liệu nền, không phải mức cần đạt: ${reason}.` });
  }
  if (quote && !record.task && record.section === 'task' && !hasTargetFigure(quote, true)) {
    flags.push({ rule: 'loai_thong_tin', message: 'Câu nằm trong phần nhiệm vụ, giải pháp và không ghi rõ mức cần đạt: có thể là nhiệm vụ, không phải chỉ tiêu.' });
  }

  // Chất lượng OCR: dòng nguồn không mang cờ can_ra_soat và độ tin cậy OCR từ 70% trở lên.
  if (record.ocr && !editedAny(record, ['name', 'targetValue', 'unit'])) {
    if (record.ocr.flags.includes('can_ra_soat')) {
      flags.push({ rule: 'chat_luong_ocr', message: 'Dòng nguồn có chữ OCR cần rà soát (hai bộ đọc khác nhau hoặc âm tiết không hợp lệ).' });
    } else if (record.ocr.minConfidence !== null && record.ocr.minConfidence < OCR_MIN_CONFIDENCE) {
      flags.push({ rule: 'chat_luong_ocr', message: `Độ tin cậy OCR ${Math.round(record.ocr.minConfidence * 100)}% dưới 70%.` });
    }
  }
  return flags;
}

/** Hạ độ tin cậy khi trượt luật tên chỉ tiêu (theo B10) hoặc bám nguồn. */
export function adjustedConfidence(confidence: number, flags: ValidationFlag[]): number {
  let result = confidence;
  if (flags.some(flag => flag.rule === 'ten_chi_tieu')) result = Math.min(result, 0.5);
  if (flags.some(flag => flag.rule === 'bam_nguon')) result = Math.min(result, 0.4);
  return Math.round(result * 100) / 100;
}

/**
 * Luật Nhất quán: chỉ tiêu cha có giá trị tổng và các thành phần (cùng đơn vị, không phải tỷ lệ) phải cộng bằng nhau.
 * Trả về cờ theo chỉ số bản ghi.
 */
export function validateConsistency(records: ValidationRecord[]): Map<number, ValidationFlag[]> {
  const result = new Map<number, ValidationFlag[]>();
  const add = (index: number, flag: ValidationFlag) => result.set(index, [...(result.get(index) ?? []), flag]);
  const groups = new Map<string, number[]>();
  records.forEach((record, index) => {
    if (!record.parentName) return;
    const key = normalizeText(record.parentName);
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  for (const [parentKey, members] of groups) {
    const parentIndex = records.findIndex(record => !record.parentName
      && (normalizeText(record.name) === parentKey || diceSimilarity(record.name, parentKey) >= 0.9));
    if (parentIndex < 0) continue;
    const parent = records[parentIndex];
    const unit = normalizeUnit(parent.unit);
    if (parent.targetValue === null || unit === '%' || !unit) continue;
    const parts = members.map(index => records[index]);
    if (parts.length < 2 || parts.some(part => part.targetValue === null || normalizeUnit(part.unit) !== unit)) continue;
    const sum = parts.reduce((total, part) => total + (part.targetValue ?? 0), 0);
    if (Math.abs(sum - parent.targetValue) > Math.max(0.5, Math.abs(parent.targetValue) * 0.005)) {
      const message = `Tổng các thành phần (${round(sum)}) khác giá trị của "${parent.name}" (${round(parent.targetValue)}).`;
      add(parentIndex, { rule: 'nhat_quan', message });
      for (const index of members) add(index, { rule: 'nhat_quan', message });
    }
  }
  return result;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

// Âm tiết chung chung, có ở hầu hết tên chỉ tiêu nên không dùng để so tên với câu trích.
const GENERIC_SYLLABLES = new Set(('tỷ lệ tỉ số lượng tốc độ tăng giảm trưởng so với năm đạt trên dưới các của và được '
  + 'có là trong tại theo từ đến người bình quân tổng mức hơn ít nhất tối đa thiểu trở lên xuống khoảng cuối đầu kỳ').split(' '));

function contentBigrams(text: string): string[] {
  const syllables = text.normalize('NFC').toLowerCase().split(/[^\p{L}\d]+/u).filter(Boolean);
  const bigrams: string[] = [];
  for (let index = 0; index + 1 < syllables.length; index += 1) {
    const [first, second] = [syllables[index], syllables[index + 1]];
    if (/\d/.test(first + second) || GENERIC_SYLLABLES.has(first) || GENERIC_SYLLABLES.has(second)) continue;
    bigrams.push(`${first} ${second}`);
  }
  return bigrams;
}

/**
 * Tên không bám câu trích: tên có từ 2 cặp âm tiết nội dung ("ngân sách", "bán lẻ") mà câu trích chứa chưa tới một
 * phần ba số cặp đó. Câu trích là dòng bảng hay câu văn đều chứa phần lớn tên chỉ tiêu, nên lệch hẳn là dấu hiệu lấy
 * nhầm tên.
 */
export function nameMissingFromQuote(name: string, quote: string | null | undefined): boolean {
  if (!quote?.trim()) return false;
  // Viết tắt ("FDI", "BHYT") có trong câu trích là đủ bám tên.
  const acronyms = name.match(/\b\p{Lu}{2,}\b/gu) ?? [];
  if (acronyms.some(acronym => new RegExp(`(^|[^\\p{L}])${acronym}([^\\p{L}]|$)`, 'u').test(quote))) return false;
  const bigrams = [...new Set(contentBigrams(name))];
  if (bigrams.length < 2) return false;
  const inQuote = new Set(contentBigrams(quote));
  const found = bigrams.filter(bigram => inQuote.has(bigram)).length;
  return found * 3 < bigrams.length;
}
