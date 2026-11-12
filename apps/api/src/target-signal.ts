// Nhận biết "con số là mức cần đạt" trong câu văn hành chính, dùng chung cho kiểm tra đủ mục, lọc đoạn trước khi gọi
// Qwen, liệt kê số chưa được trích và cờ số liệu nền. Chỉ dựa vào cách viết quanh con số, không có luật riêng cho một
// văn bản nào.

/** Số hiệu văn bản và điều khoản ("Nghị quyết số 05", "khoản 2 Điều 7"): không phải số liệu mục tiêu. */
export const DOCUMENT_REFERENCE = /(?<![\p{L}])(?<!tổng\s)(?<!chỉ\s)(?<!con\s)(số|điều|khoản|điểm|mục|nghị\s+quyết|quyết\s+định|chỉ\s+thị|thông\s+tư|nghị\s+định|công\s+văn|chương\s+trình|đề\s+án|kế\s+hoạch|luật)\s+(số\s+)?\d+(?![\d.,]*\s*[%‰])[\p{L}\d/.\-]*/giu;

const YEAR = String.raw`(?:19|20)\d{2}`;
const NOT_TARGET: RegExp[] = [
  // Ký hiệu văn bản: "05-NQ/TW", "1234/QĐ-UBND", "30/2020/NĐ-CP".
  /\d+(?:\/\d{4})?[/-][\p{Lu}Đ]{1,8}(?:[-/][\p{Lu}Đ]{1,8})*/gu,
  DOCUMENT_REFERENCE,
  // Ngày tháng: "30/6/2026", "ngày 30 tháng 6 năm 2026", "ngày 15/3", "tháng 6/2026", "quý II/2026".
  new RegExp(String.raw`\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*${YEAR}`, 'gu'),
  new RegExp(String.raw`ngày\s+\d{1,2}(?:\s*[/-]\s*\d{1,2}|\s+tháng\s+\d{1,2})?(?:\s+năm\s+${YEAR})?`, 'giu'),
  /(?:\d{1,2}|sáu|ba|chín)\s+tháng\s+(?:đầu|cuối)\s+năm/giu,
  new RegExp(String.raw`tháng\s+\d{1,2}(?:\s*[/-]\s*${YEAR}|\s+năm\s+${YEAR})?`, 'giu'),
  new RegExp(String.raw`quý\s+(?:[IV]{1,3}|[1-4])(?![\p{L}\d])(?:\s*[/-]\s*${YEAR}|\s+năm\s+${YEAR})?`, 'giu'),
  new RegExp(String.raw`(?:năm|giai\s+đoạn|nhiệm\s+kỳ|khóa|khoá|niên\s+độ|năm\s+học)\s+${YEAR}(?:\s*[-–/]\s*${YEAR})?`, 'giu'),
  new RegExp(String.raw`${YEAR}\s*[-–]\s*${YEAR}`, 'gu'),
  new RegExp(String.raw`(?<!\d)(?<!\d[.,])${YEAR}(?![.,]?\d|\s*[%‰])`, 'gu'),
  // Số thứ tự và tên riêng có số: "lần thứ 3", "đợt 1", "mức độ 4", "khu phố 3", "(9)".
  /(?<![\p{L}])(?:lần\s+thứ|thứ|đợt|bước|cấp\s+độ|mức\s+độ|loại|khu\s+phố|tổ\s+dân\s+phố|ấp|đường\s+số|quốc\s+lộ|tỉnh\s+lộ|ĐT|QL)\s*\.?\s*\d+(?![\d.,]*\s*%)/giu,
  /\(\d{1,3}[a-zđ]?\)/gu,
  // Mốc tuổi và mẫu số dân: "từ 15 tuổi trở lên", "trẻ em dưới 5 tuổi", "trên 10.000 dân".
  /\d+(?:\s*[-–]\s*\d+)?\s*tuổi/giu,
  /\d+(?:[.,]\d+)*\s*(?:dân|vạn\s+dân|trẻ\s+đẻ\s+sống|trẻ\s+sinh\s+sống|ca\s+sinh)/giu,
];

/** Thay các con số không thể là mức cần đạt bằng khoảng trắng cùng độ dài (vị trí ký tự giữ nguyên). */
export function maskNonTargetNumbers(text: string): string {
  let masked = text;
  for (const pattern of NOT_TARGET) masked = masked.replace(pattern, match => ' '.repeat(match.length));
  return masked;
}

// Từ đứng ngay trước con số cho biết đó là mức cần đạt.
const MEASURE_TRIGGER = /(?<![\p{L}])(?:đạt|trên|dưới|ít\s+nhất|tối\s+thiểu|không\s+quá|không\s+vượt\s+quá|không\s+dưới|không\s+thấp\s+hơn|tối\s+đa|tăng|giảm|còn|khoảng|bằng|vượt|≥|≤|>=|<=|>|<)(?:\s+(?:từ|khoảng|trên|dưới|thêm|còn|xuống|lên|bình\s+quân|ít\s+nhất|tối\s+thiểu))*\s*$/iu;
const WEAK_TRIGGER = /(?:(?<![\p{L}])(?:là|từ|có)|:|=)\s*$/iu;
const UNIT_AFTER = /^\s*(%|‰|phần\s+trăm|\p{L}[\p{L}\d²³]*)/u;
const NUMBER = /\d+(?:[.,]\d+)*/g;

export interface TargetFigure {
  /** Vị trí con số trong văn bản gốc. */
  index: number;
  raw: string;
  percent: boolean;
  /** Có chữ đơn vị ngay sau ("02 đợt", "1.133 tỷ đồng"). */
  unit: boolean;
  /** Có từ đo lường ngay trước ("đạt", "trên", "ít nhất", "giảm"…). */
  trigger: boolean;
  weakTrigger: boolean;
}

/** Mọi con số còn lại sau khi bỏ số hiệu, ngày tháng, năm, số thứ tự; kèm dấu hiệu quanh con số. */
export function targetFigures(text: string): TargetFigure[] {
  const masked = maskNonTargetNumbers(text);
  const figures: TargetFigure[] = [];
  for (const match of masked.matchAll(NUMBER)) {
    const index = match.index ?? 0;
    const before = masked.slice(Math.max(0, index - 40), index);
    // "3 - 5%": con số đầu của khoảng mang đơn vị của con số sau.
    const after = masked.slice(index + match[0].length, index + match[0].length + 30).replace(/^\s*[-–]\s*\d+(?:[.,]\d+)*/u, '');
    const unitMatch = UNIT_AFTER.exec(after);
    const percent = !!unitMatch && /^(%|‰|phần)/u.test(unitMatch[1]);
    figures.push({
      index,
      raw: match[0],
      percent,
      unit: !!unitMatch && !percent,
      trigger: MEASURE_TRIGGER.test(before),
      weakTrigger: WEAK_TRIGGER.test(before),
    });
  }
  return figures;
}

/**
 * Con số là mức cần đạt. Mặc định: có %, có đơn vị, hoặc đứng sau từ đo lường. `strict` (phần nhiệm vụ, giải pháp):
 * phải có % hoặc vừa có từ đo lường vừa có đơn vị, vì câu giao việc cũng đầy con số ("tổ chức 02 đợt tập huấn").
 */
export function isTargetFigure(figure: TargetFigure, strict = false): boolean {
  if (strict) return figure.percent || (figure.trigger && figure.unit);
  return figure.percent || figure.unit || figure.trigger || figure.weakTrigger;
}

export function hasTargetFigure(text: string, strict = false): boolean {
  return targetFigures(text).some(figure => isTargetFigure(figure, strict));
}

export type SectionKind = 'target' | 'task' | 'other';

const TARGET_HEADING = /chỉ\s+tiêu|mục\s+tiêu|kết\s+quả\s+(?:cần|phải)\s+đạt/iu;
const TASK_HEADING = /nhiệm\s+vụ|giải\s+pháp|tổ\s+chức\s+thực\s+hiện|phân\s+công|trách\s+nhiệm|biện\s+pháp|tiến\s+độ|kinh\s+phí|điều\s+khoản\s+thi\s+hành|chế\s+độ\s+(?:thông\s+tin|báo\s+cáo)/iu;

/** Phần của văn bản theo đề mục gần nhất có nghĩa: phần chỉ tiêu, phần nhiệm vụ/giải pháp, hay phần khác. */
export function sectionKind(headingPath: readonly string[]): SectionKind {
  for (let index = headingPath.length - 1; index >= 0; index -= 1) {
    const heading = headingPath[index];
    if (TARGET_HEADING.test(heading)) return 'target';
    if (TASK_HEADING.test(heading)) return 'task';
  }
  return 'other';
}

// Câu kể số liệu đã có: "ước thực hiện", "đã đạt", "hiện có", "tính đến ngày…", "đến nay".
const BASELINE_BEFORE = /(?<![\p{L}])(?:ước\s+(?:thực\s+hiện|đạt)|thực\s+hiện\s+được|đã\s+(?:đạt|thực\s+hiện|hoàn\s+thành|có|giải\s+quyết|cấp|tổ\s+chức)|hiện\s+(?:nay\s+)?(?:có|đạt|còn|là)|tính\s+đến|đến\s+nay)[^.;]{0,60}$/iu;

/**
 * Giá trị trong câu trích là số liệu nền (kết quả kỳ trước, hiện trạng) chứ không phải mức cần đạt: con số đứng sau cụm
 * kể kết quả, hoặc sau "năm N" với N nhỏ hơn năm kế hoạch, mà trong câu không có từ giao mục tiêu cho chính con số đó.
 */
export function baselineReason(quote: string | null | undefined, value: number | null | undefined, planYear: number | null | undefined): string | null {
  if (!quote || value === null || value === undefined) return null;
  const position = positionOfValue(quote, value);
  if (position === null) return null;
  const before = quote.slice(Math.max(0, position - 90), position);
  // Từ giao mục tiêu đứng sát con số ("phấn đấu đạt", "đến năm 2030 đạt") thì đó là mức cần đạt.
  if (/(?<![\p{L}])(?:phấn\s+đấu|mục\s+tiêu|kế\s+hoạch|chỉ\s+tiêu|giao|đến\s+(?:hết\s+|cuối\s+)?năm\s+(?:19|20)\d{2})[^.;,]{0,40}$/iu.test(before)) return null;
  // "so với năm 2025 tăng 8%" là mức tăng cần đạt, không phải số của năm 2025.
  const year = /(?<!so\s+với\s+)(?<!cùng\s+kỳ\s+)(?<![\p{L}])năm\s+((?:19|20)\d{2})(?:[^.;\d]{0,30})$/iu.exec(before);
  if (year && planYear && Number(year[1]) < planYear) return `con số đứng sau "năm ${year[1]}", trước năm kế hoạch ${planYear}`;
  const told = BASELINE_BEFORE.exec(before);
  if (told) return `con số đứng sau cụm kể kết quả "${told[0].trim().split(/\s+/).slice(0, 3).join(' ')}…"`;
  return null;
}

/** Vị trí con số (theo cách viết Việt hoặc quốc tế) trong câu; không thấy thì null. */
export function positionOfValue(text: string, value: number): number | null {
  for (const match of text.matchAll(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g)) {
    const raw = match[0];
    const readings = [Number(raw.replace(/\./g, '').replace(',', '.')), Number(raw.replace(/,/g, ''))];
    if (readings.some(reading => Number.isFinite(reading) && Math.abs(reading - value) < 1e-9)) return match.index ?? 0;
  }
  return null;
}

// Mẫu số dân của chỉ tiêu bình quân: "/10.000 dân", "trên vạn dân", "trên 1.000 trẻ đẻ sống".
const DENOMINATOR = /(?:\/|(?<![\p{L}])trên\s+(?:mỗi\s+|một\s+)?)\s*(1\.000|10\.000|100\.000|1000|10000|100000|một\s+vạn|vạn|một\s+nghìn|nghìn)\s*(dân|trẻ\s+đẻ\s+sống|trẻ\s+sinh\s+sống)(?![\p{L}])/iu;

/**
 * Đơn vị của chỉ tiêu bình quân theo dân số: câu trích ghi "giường bệnh trên 10.000 dân" mà đơn vị chỉ còn "giường"
 * thì trả "giường/10.000 dân". Đơn vị đã có mẫu số, là % hoặc chính là dân số thì giữ nguyên.
 */
export function unitWithDenominator(unit: string | null | undefined, quote: string | null | undefined): string | null {
  const value = unit?.trim() || null;
  if (!value || !quote) return value;
  if (/[%‰/]|dân|người/iu.test(value)) return value;
  const match = DENOMINATOR.exec(quote);
  if (!match) return value;
  const amount = match[1].toLowerCase().replace(/\s+/g, ' ');
  const number = /vạn/.test(amount) ? '10.000' : /nghìn/.test(amount) ? '1.000' : amount.replace(/^(\d+)(\d{3})$/u, '$1.$2');
  return `${value}/${number} ${match[2].toLowerCase().replace(/\s+/g, ' ')}`;
}
