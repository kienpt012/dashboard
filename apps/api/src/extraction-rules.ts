import { TargetDirection, TargetFrequency } from '@prisma/client';

// Bộ trích xuất chỉ tiêu dựa trên luật cho văn bản hành chính tiếng Việt.
// Đây là baseline đối chứng với LLM (RQ2) và cũng là bộ lọc nhanh không tốn GPU.

export interface RuleExtractedIndicator {
  name: string;
  targetValue: number | null;
  unit: string | null;
  direction: TargetDirection;
  frequency: TargetFrequency | null;
  deadline: string | null; // YYYY-MM-DD
  targetYear: number | null;
  responsibleDepartmentName: string | null;
  coordinatingDepartments: string | null;
  sourceQuote: string;
  confidence: number;
  fieldConfidence: Record<string, number>;
  warnings: string[];
}

const UNIT_PATTERN = [
  '%',
  'tỷ đồng',
  'triệu đồng',
  'nghìn đồng',
  'đồng',
  'người',
  'hộ',
  'hộ dân',
  'vụ',
  'vụ việc',
  'cây',
  'cây xanh',
  'công trình',
  'dự án',
  'tuyến đường',
  'tuyến',
  'điểm',
  'trường',
  'lớp',
  'cơ sở',
  'doanh nghiệp',
  'sản phẩm',
  'mô hình',
  'đợt',
  'cuộc',
  'buổi',
  'lượt',
  'lượt người',
  'hồ sơ',
  'văn bản',
  'ha',
  'héc ta',
  'km',
  'm2',
  'm²',
  'căn',
  'tấn',
].sort((a, b) => b.length - a.length);

const NUMBER_REGEX = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?`;

const TRIGGER_REGEX = /(đạt|hoàn thành|phấn đấu|duy trì|giữ vững|tối thiểu|ít nhất|không quá|tối đa|giảm còn|giảm xuống|giảm|tăng thêm|tăng lên|trồng mới|xây dựng mới|thành lập mới|kết nạp|thu hút|giải quyết|xử lý)/i;

const LOWER_IS_BETTER_REGEX = /(không quá|tối đa|giảm còn|giảm xuống|giảm(?!\s*nghèo)|dưới|thấp hơn|kéo giảm|hạn chế)/i;

// "giảm nghèo" là tên lĩnh vực, không phải chiều hướng giảm giá trị.

export function parseVietnameseNumber(raw: string): number | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const normalized = cleaned.replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function detectFrequency(text: string): { frequency: TargetFrequency | null; warning?: string } {
  if (/(hàng|hằng|định kỳ)\s*tháng|theo tháng|báo cáo tháng/i.test(text)) {
    return { frequency: TargetFrequency.MONTHLY };
  }
  if (/(hàng|hằng|định kỳ)\s*quý|theo quý|báo cáo quý/i.test(text)) {
    return { frequency: TargetFrequency.QUARTERLY };
  }
  if (/(6|sáu)\s*tháng|nửa năm/i.test(text)) {
    return {
      frequency: null,
      warning: 'Văn bản ghi chu kỳ 6 tháng; hệ thống hiện chỉ hỗ trợ tháng/quý/năm, cần chọn thủ công.',
    };
  }
  if (/(hàng|hằng|cả|trong)\s*năm|theo năm|cuối năm|báo cáo năm/i.test(text)) {
    return { frequency: TargetFrequency.YEARLY };
  }
  return { frequency: null };
}

export function detectDeadline(text: string, fallbackYear: number | null): string | null {
  const explicit = text.match(/trước\s+(?:ngày\s+)?(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/i)
    ?? text.match(/hoàn thành\s+(?:trong\s+)?(?:ngày\s+)?(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/i);
  if (explicit) {
    const [, day, month, year] = explicit;
    const dayNum = Number(day);
    const monthNum = Number(month);
    if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12) {
      return `${year}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    }
  }
  const yearOnly = text.match(/(?:trong|hết|cuối)\s+năm\s+(\d{4})/i);
  if (yearOnly) return `${yearOnly[1]}-12-31`;
  if (fallbackYear) return `${fallbackYear}-12-31`;
  return null;
}

export function detectTargetYear(text: string): number | null {
  const match = text.match(/năm\s+(20\d{2})/i);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 2000 && year <= 2100 ? year : null;
}

export function detectResponsibleDepartment(text: string): string | null {
  const match = text.match(
    /(?:đơn vị\s+(?:chủ trì|thực hiện|phụ trách)|chủ trì(?:\s+thực hiện)?|đơn vị)\s*[:：]\s*([^.;\n]+)/i,
  );
  if (!match) return null;
  const value = match[1].split(/,\s*phối hợp|;\s*phối hợp|\.\s|phối hợp\s*[:：]/i)[0].trim();
  return value.replace(/[.,;]$/, '').trim() || null;
}

export function detectCoordinating(text: string): string | null {
  const match = text.match(/phối hợp\s*[:：]?\s*([^.;\n]+)/i);
  if (!match) return null;
  const value = match[1].trim().replace(/[.,;]$/, '');
  return value || null;
}

interface ValueMatch {
  value: number;
  unit: string | null;
  index: number;
  raw: string;
}

export function findValueWithUnit(text: string): ValueMatch[] {
  const unitAlternatives = UNIT_PATTERN
    .map(unit => unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const regex = new RegExp(
    String.raw`(${NUMBER_REGEX})\s*(${unitAlternatives})(?![\p{L}\d])`,
    'giu',
  );
  const matches: ValueMatch[] = [];
  for (const match of text.matchAll(regex)) {
    const value = parseVietnameseNumber(match[1]);
    if (value === null) continue;
    matches.push({ value, unit: normalizeUnit(match[2]), index: match.index ?? 0, raw: match[0] });
  }
  return matches;
}

function normalizeUnit(unit: string): string {
  const trimmed = unit.trim();
  if (trimmed === 'héc ta') return 'ha';
  if (trimmed === 'm²') return 'm2';
  if (trimmed === 'hộ dân') return 'hộ';
  if (trimmed === 'vụ việc') return 'vụ';
  if (trimmed === 'cây xanh') return 'cây';
  if (trimmed === 'lượt người') return 'lượt';
  return trimmed;
}

// Tách câu ứng viên: mỗi dòng hoặc mỗi câu là một đơn vị xét.
export function splitCandidateSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap(line => line.split(/(?<=[.;])\s+(?=[A-ZĐÀ-Ỹ0-9])/u))
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length >= 15);
}

function cleanIndicatorName(raw: string): string {
  return raw
    .replace(/^[-–—•*+]\s*/, '')
    .replace(/^(?:\d+|[a-zđ])[.)]\s*/iu, '')
    .replace(/^(?:điều|mục|khoản)\s+\d+[.:]?\s*/iu, '')
    .replace(/[,:;\s]+$/u, '')
    .trim();
}

// Câu thuộc tính đi kèm ("Đơn vị chủ trì: ...", "Báo cáo hàng quý.") thường đứng
// NGAY SAU câu chỉ tiêu trong văn bản hành chính — cho phép nhìn trước tối đa 2 câu.
function isAttributeSentence(sentence: string): boolean {
  return /^(đơn vị|chủ trì|phối hợp|báo cáo|định kỳ|hoàn thành trước)/i.test(sentence.trim())
    && !findValueWithUnit(sentence).some(match => match.unit !== null && !/^(tháng|quý|năm)$/.test(match.unit));
}

export function extractIndicatorsFromText(text: string): RuleExtractedIndicator[] {
  const results: RuleExtractedIndicator[] = [];
  const seen = new Set<string>();
  const documentYear = detectTargetYear(text.slice(0, 600));
  const sentences = splitCandidateSentences(text);
  for (const [sentenceIndex, sentence] of sentences.entries()) {
    const trigger = sentence.match(TRIGGER_REGEX);
    if (!trigger || trigger.index === undefined) continue;
    const triggerIndex = trigger.index;
    const values = findValueWithUnit(sentence);
    if (!values.length) continue;
    // Ngữ cảnh mở rộng: câu hiện tại + các câu thuộc tính liền kề phía sau.
    let extendedContext = sentence;
    for (let lookAhead = 1; lookAhead <= 2; lookAhead += 1) {
      const nextSentence = sentences[sentenceIndex + lookAhead];
      if (!nextSentence || !isAttributeSentence(nextSentence)) break;
      extendedContext += ` ${nextSentence}`;
    }

    // Giá trị mục tiêu: số đầu tiên xuất hiện sau (hoặc gần) động từ mục tiêu.
    const afterTrigger = values.filter(match => match.index >= triggerIndex);
    const primary = afterTrigger[0] ?? values[0];

    let name = cleanIndicatorName(sentence.slice(0, trigger.index));
    const warnings: string[] = [];
    if (!name || name.length < 8) {
      // Câu dạng "Trồng mới 1.200 cây xanh...": lấy cả câu làm tên, bỏ phần số liệu.
      name = cleanIndicatorName(sentence.replace(primary.raw, '').replace(/\s{2,}/g, ' '));
      warnings.push('Tên chỉ tiêu được suy ra từ cả câu, cần người kiểm tra lại.');
    }
    if (!name || name.length < 8) continue;
    if (name.length > 250) name = `${name.slice(0, 247)}...`;

    const key = `${name.toLowerCase()}|${primary.value}|${primary.unit ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const direction = LOWER_IS_BETTER_REGEX.test(sentence)
      ? TargetDirection.LOWER_IS_BETTER
      : TargetDirection.HIGHER_IS_BETTER;
    const { frequency, warning: frequencyWarning } = detectFrequency(extendedContext);
    if (frequencyWarning) warnings.push(frequencyWarning);
    const targetYear = detectTargetYear(extendedContext) ?? documentYear;
    const deadline = detectDeadline(extendedContext, targetYear);
    const responsible = detectResponsibleDepartment(extendedContext);
    const coordinating = detectCoordinating(extendedContext);

    const fieldConfidence: Record<string, number> = {
      name: warnings.length ? 0.5 : 0.7,
      targetValue: afterTrigger.length ? 0.85 : 0.6,
      unit: primary.unit ? 0.85 : 0.2,
      direction: LOWER_IS_BETTER_REGEX.test(sentence) ? 0.8 : 0.7,
      frequency: frequency ? 0.75 : 0.3,
      deadline: deadline && /trước|hoàn thành/i.test(sentence) ? 0.8 : deadline ? 0.5 : 0.2,
      responsibleDepartment: responsible ? 0.8 : 0.2,
    };
    if (!primary.unit) warnings.push('Không nhận diện được đơn vị đo.');
    if (values.length > 1) {
      fieldConfidence.targetValue = Math.min(fieldConfidence.targetValue, 0.6);
      warnings.push('Câu chứa nhiều giá trị số, cần xác nhận giá trị mục tiêu.');
    }

    const confidence = Math.round(
      (fieldConfidence.name * 0.3
        + fieldConfidence.targetValue * 0.3
        + fieldConfidence.unit * 0.2
        + fieldConfidence.responsibleDepartment * 0.1
        + fieldConfidence.frequency * 0.05
        + fieldConfidence.deadline * 0.05) * 100,
    ) / 100;

    results.push({
      name,
      targetValue: primary.value,
      unit: primary.unit,
      direction,
      frequency,
      deadline,
      targetYear,
      responsibleDepartmentName: responsible,
      coordinatingDepartments: coordinating,
      sourceQuote: sentence.length > 500 ? `${sentence.slice(0, 497)}...` : sentence,
      confidence,
      fieldConfidence,
      warnings,
    });
  }
  return results;
}

// Tín hiệu nhanh cho biết một đoạn văn có khả năng chứa chỉ tiêu hay không
// (dùng để bỏ qua các đoạn chắc chắn không liên quan trước khi gọi LLM).
export function chunkLikelyHasIndicators(text: string): boolean {
  if (!/\d/.test(text)) return false;
  return TRIGGER_REGEX.test(text) || /chỉ tiêu|kế hoạch|mục tiêu|phấn đấu/i.test(text);
}
