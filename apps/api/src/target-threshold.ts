// Ngưỡng của chỉ tiêu ("ít nhất 125,5", "trên 10%", "không vượt quá 2%", "từ 70% đến 75%", "khoảng 12.000") đọc từ
// câu trích dẫn bằng bảng cụm từ cố định, không nhờ mô hình. Chỉ xét cụm từ sát ngay con số mục tiêu, vì cùng câu có
// thể có "từ 60 tuổi trở lên", "trẻ em dưới năm tuổi" nói về đối tượng chứ không phải ngưỡng.

export type ThresholdOperator = '>=' | '>' | '<=' | '<' | '=' | '~' | 'range';

export interface Threshold {
  operator: ThresholdOperator;
  value: number;
  /** Cận trên khi là khoảng giá trị. */
  upper: number | null;
  /** Văn bản chỉ ghi số trần; ký hiệu do hệ thống suy theo chiều đánh giá, chuyên viên cần rà. */
  inferred?: boolean;
}

export type ThresholdDirection = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';

/** 125.5 → "125,5"; 12000 → "12.000". */
export function formatVietnameseNumber(value: number): string {
  const [integer, decimal] = String(value).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimal ? `${grouped},${decimal}` : grouped;
}

function spellings(value: number): string[] {
  const plain = String(value);
  const [integer, decimal] = plain.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return [...new Set([decimal ? `${grouped},${decimal}` : grouped, decimal ? `${integer},${decimal}` : integer, plain])];
}

function parseNumber(raw: string): number | null {
  const value = Number(raw.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

const NUMBER = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?`;
// Đơn vị ngắn có thể đứng giữa con số và cụm từ phía sau ("8% trở lên", "45 doanh nghiệp trở lên").
const UNIT_GAP = String.raw`\s*(?:%|[\p{L}/.]+(?:\s+[\p{L}/.]+){0,2})?\s*`;

// Thứ tự quan trọng: cụm phủ định và cụm dài khớp trước ("không vượt quá" trước "vượt").
const BEFORE: [ThresholdOperator, RegExp][] = [
  ['<=', /(không\s+(vượt\s+quá|vượt|quá|cao\s+hơn|lớn\s+hơn|nhiều\s+hơn)|tối\s+đa|nhiều\s+nhất|≤|<=)\s*(là\s+|ở\s+)?(mức\s+)?$/u],
  ['>=', /(không\s+(thấp\s+hơn|dưới|ít\s+hơn|nhỏ\s+hơn)|ít\s+nhất|tối\s+thiểu|trên\s+hoặc\s+bằng|≥|>=)\s*(là\s+|ở\s+)?(mức\s+)?$/u],
  ['~', /(khoảng|xấp\s+xỉ|ước\s+(khoảng|đạt)|gần)\s*$/u],
  ['>', /(trên|hơn|vượt|cao\s+hơn|lớn\s+hơn|>)\s*(mức\s+)?$/u],
  ['<', /(dưới|thấp\s+hơn|nhỏ\s+hơn|ít\s+hơn|<)\s*(mức\s+)?$/u],
  // Văn bản ghi rõ mức cần đạt ("đạt 100%", "duy trì ở mức 0 vụ", "phấn đấu 100%", "giảm 10%").
  // "đạt tỉ lệ 38%", "tăng bình quân 7%": cho phép một cụm danh từ ngắn chen giữa động từ và con số.
  ['=', /((đạt|duy\s+trì|phấn\s+đấu|giảm|tăng|bằng|=)\s*(là\s+|ở\s+)?((mức|tỉ\s+lệ|tỷ\s+lệ|tỉ\s+trọng|tỷ\s+trọng|tốc\s+độ|bình\s+quân|chỉ\s+số)\s+)?|ở\s+mức\s*)$/u],
];

// Thứ hạng ("xếp hạng từ hạng 10 trở lên", "PAPI hạng 5", "top 10"): số nhỏ hơn là tốt hơn, nên "trở lên" là <=.
const RANK_BEFORE = /(hạng|thứ\s+hạng|top|nhóm)\s*(thứ\s+)?$/u;

/**
 * Ngưỡng của giá trị mục tiêu trong câu trích; không tìm thấy con số trong câu thì null. Văn bản chỉ ghi số trần (bảng
 * "Tỷ lệ trường đạt chuẩn | % | 60"): có chiều đánh giá thì suy >= hoặc <= và đánh dấu `inferred`, không thì "=".
 */
export function detectThreshold(
  quote: string | null | undefined,
  value: number | null | undefined,
  direction?: ThresholdDirection | null,
): Threshold | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const text = (quote ?? '').normalize('NFC').replace(/\s+/g, ' ');
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const spelling of spellings(value)) {
    const escaped = spelling.replace(/\./g, '\\.');
    // "hạng 05": cho phép số 0 đứng đầu.
    const at = new RegExp(`(^|[^\\d.,])(0*${escaped})(?![\\d]|[.,]\\d)`, 'gu');
    for (let match = at.exec(lower); match; match = at.exec(lower)) {
      const start = match.index + match[1].length;
      const end = start + match[2].length;
      const before = lower.slice(Math.max(0, start - 40), start);
      const after = lower.slice(end, end + 40);
      // Khoảng giá trị: "từ 70% đến 75%", "70 - 75%", "2–3%".
      const range = new RegExp(`^${UNIT_GAP}(?:đến|tới|-|–)\\s*(${NUMBER})`, 'u').exec(after);
      if (range && (/từ\s*$/u.test(before) || /^\s*[-–]/u.test(after) || /^\s*%?\s*[-–]/u.test(after))) {
        const upper = parseNumber(range[1]);
        if (upper !== null && upper > value) return { operator: 'range', value, upper };
      }
      if (RANK_BEFORE.test(before)) {
        if (new RegExp(`^${UNIT_GAP}trở\\s+xuống`, 'u').test(after)) return { operator: '>=', value, upper: null };
        if (/(top|nhóm)\s*$/u.test(before) || new RegExp(`^${UNIT_GAP}trở\\s+lên`, 'u').test(after)) return { operator: '<=', value, upper: null };
        return { operator: '<=', value, upper: null, inferred: true };
      }
      if (new RegExp(`^${UNIT_GAP}trở\\s+lên`, 'u').test(after)) return { operator: '>=', value, upper: null };
      if (new RegExp(`^${UNIT_GAP}trở\\s+xuống`, 'u').test(after)) return { operator: '<=', value, upper: null };
      for (const [operator, pattern] of BEFORE) {
        if (pattern.test(before)) return { operator, value, upper: null };
      }
      // Câu liệt kê "đạt 35 giường bệnh, 18 bác sĩ và 31 điều dưỡng": số sau dùng chung cụm từ của số đầu.
      const listed = listHead(lower.slice(Math.max(0, start - 160), start));
      if (listed !== null) {
        for (const [operator, pattern] of BEFORE) {
          if (pattern.test(listed)) return { operator, value, upper: null };
        }
      }
      if (direction) return { operator: direction === 'LOWER_IS_BETTER' ? '<=' : '>=', value, upper: null, inferred: true };
      return { operator: '=', value, upper: null, inferred: true };
    }
  }
  return null;
}

const LIST_ITEM = new RegExp(`(?:${NUMBER})\\s*%?[^\\d,;.]{0,40}?\\s*(?:,|;|\\svà)\\s*$`, 'u');

/** Phần câu trước số đầu tiên của chuỗi liệt kê; con số không nằm trong chuỗi liệt kê thì null. */
function listHead(before: string): string | null {
  let rest = before;
  let stripped = false;
  for (let guard = 0; guard < 8; guard += 1) {
    const match = LIST_ITEM.exec(rest);
    if (!match) break;
    rest = rest.slice(0, match.index);
    stripped = true;
  }
  return stripped ? rest : null;
}

/** Chữ hiển thị ở cột Kế hoạch: ">= 125,5", "< 6,5", "= 100", "70 - 75", "khoảng 12.000". */
export function thresholdText(threshold: Threshold | null): string | null {
  if (!threshold) return null;
  const value = formatVietnameseNumber(threshold.value);
  if (threshold.operator === 'range') return `${value} - ${formatVietnameseNumber(threshold.upper!)}`;
  if (threshold.operator === '~') return `khoảng ${value}`;
  return `${threshold.operator} ${value}`;
}
