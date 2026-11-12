import { TargetFrequency } from '@prisma/client';
import { detectFrequency } from './extraction-rules';
import { chunkBody } from './extraction-structure';
import { parseDeadlineCell } from './table-extraction';
import { hasTargetFigure } from './target-signal';

// Bóc "nhiệm vụ" từ văn xuôi của kế hoạch, công văn, chỉ thị bằng luật (không gọi model): câu giao việc có đơn vị
// thực hiện ("Giao Phòng Kinh tế chủ trì…", đề mục "2. Công an phường") hoặc có thời hạn ("trước ngày 30/6/2026").
// Câu ghi mức cần đạt bằng số là chỉ tiêu, để Qwen đọc. Không có luật riêng cho một mẫu văn bản nào.

export const TASK_RULE_VERSION = 'task-v1';

export interface ProseTask {
  name: string;
  ordinal: string | null;
  responsibleDepartmentName: string | null;
  coordinatingDepartments: string | null;
  /** YYYY-MM-DD. */
  deadline: string | null;
  frequency: TargetFrequency | null;
  sourceQuote: string;
  /** Vị trí câu trong phần thân đoạn. */
  position: number;
  confidence: number;
  warnings: string[];
}

const ORG_HEAD = String.raw`(?:Phòng|Ban(?!\s+hành|\s+đầu)|Văn\s+phòng|Công\s+an|Trạm|Trung\s+tâm|Ủy\s+ban|Uỷ\s+ban|UBND|HĐND|UBMTTQ|MTTQ|Mặt\s+trận|Hội(?!\s+nghị|\s+thảo|\s+thi|\s+nhập|\s+ý)|Đoàn(?!\s+kết)|Đảng\s+ủy|Đảng\s+uỷ|Chi\s+bộ|Bộ\s+phận|Tổ(?!\s+chức)|Đội(?!\s+ngũ)|Chi\s+cục|Sở(?!\s+hữu)|Trường(?!\s+hợp)|Kho\s+bạc|Thanh\s+tra|Bảo\s+hiểm\s+xã\s+hội|Chi\s+nhánh|Điện\s+lực|Bệnh\s+viện|Thủ\s+trưởng|Chủ\s+tịch|Công\s+chức|Lực\s+lượng|Trưởng\s+(?:các\s+)?(?:khu\s+phố|ấp|phòng|ban)|Ban\s+điều\s+hành|[Cc]ác\s+(?:phòng|ban|ngành|đơn\s+vị|cơ\s+quan|khu\s+phố|ấp|tổ\s+chức|hội|đoàn\s+thể|trường|doanh\s+nghiệp|cơ\s+sở))(?![\p{L}])`;
// Từ mở đầu phần việc phải làm: tên đơn vị kết thúc ngay trước từ này.
const ACTION = String.raw`(?:chủ\s+trì|phối\s+hợp|có\s+trách\s+nhiệm|chịu\s+trách\s+nhiệm|tham\s+mưu|tổ\s+chức|thực\s+hiện|triển\s+khai|rà\s+soát|xây\s+dựng|hướng\s+dẫn|theo\s+dõi|tổng\s+hợp|báo\s+cáo|kiểm\s+tra|giám\s+sát|đôn\s+đốc|tiếp\s+tục|tăng\s+cường|đẩy\s+mạnh|khẩn\s+trương|nghiêm\s+túc|chủ\s+động|kịp\s+thời|tuyên\s+truyền|vận\s+động|phổ\s+biến|quản\s+lý|cập\s+nhật|thống\s+kê|bố\s+trí|bảo\s+đảm|đảm\s+bảo|chuẩn\s+bị|phát\s+động|duy\s+trì|nâng\s+cao|chỉ\s+đạo|giải\s+quyết|xử\s+lý|cung\s+cấp|công\s+khai|niêm\s+yết|nghiên\s+cứu|đề\s+xuất|ban\s+hành|hoàn\s+thành|hoàn\s+thiện|lập|trình|gửi|căn\s+cứ|quán\s+triệt|thành\s+lập|kiện\s+toàn|huy\s+động|cân\s+đối|thẩm\s+định|tiếp\s+nhận|sắp\s+xếp|đánh\s+giá|sơ\s+kết|tổng\s+kết)`;
const WORK = ACTION.replace(String.raw`chủ\s+trì|phối\s+hợp|có\s+trách\s+nhiệm|chịu\s+trách\s+nhiệm|`, '').replace(String.raw`|căn\s+cứ`, '');

const ASSIGN = new RegExp(String.raw`^(?:Kính\s+đề\s+nghị|Đề\s+nghị|Yêu\s+cầu|Giao|Phân\s+công)\s+(${ORG_HEAD}[^:;.]{0,160}?)\s*(?::|,?\s+(?=${ACTION}(?![\p{L}])))`, 'u');
const ORG_FIRST = new RegExp(String.raw`^(${ORG_HEAD}[^:;.]{0,160}?)\s*(?::|,?\s+(?=${ACTION}(?![\p{L}])))`, 'u');
const ORG_ONLY = new RegExp(String.raw`^${ORG_HEAD}[^:;.!?]{0,140}:?$`, 'u');
const LEAD_ROLE = new RegExp(String.raw`^(?:có\s+trách\s+nhiệm|chịu\s+trách\s+nhiệm)\s*:?\s*`, 'iu');
const COORDINATE = new RegExp(String.raw`^(?:chủ\s+trì\s*,?\s*(?:và\s+)?)?phối\s+hợp\s+(?:với\s+)?(.{3,160}?)\s+(?=${WORK}(?![\p{L}]))`, 'iu');
const STARTS_WITH_WORK = new RegExp(String.raw`^(?:${ACTION})(?![\p{L}])`, 'iu');
const MARKER = /^\s*(?:[-+•–*]|\(?(\d{1,2}(?:\.\d{1,2}){0,2}|[a-zđ])[.)]|\((\d{1,3}[a-zđ]?)\))\s*/u;

const DATE_PART = String.raw`(?:(?:ngày\s+)?\d{1,2}\s*[/.-]\s*\d{1,2}(?:\s*[/.-]\s*(?:19|20)\d{2})?|ngày\s+\d{1,2}\s+tháng\s+\d{1,2}(?:\s+năm\s+(?:19|20)\d{2})?|tháng\s+\d{1,2}(?:\s*[/-]\s*(?:19|20)\d{2}|\s+năm\s+(?:19|20)\d{2})?|quý\s+(?:IV|III|II|I|[1-4])(?![\p{L}\d])(?:\s*[/-]\s*(?:19|20)\d{2}|\s+năm\s+(?:19|20)\d{2})?|(?:6|sáu)\s+tháng\s+đầu\s+năm(?:\s+(?:19|20)\d{2})?|năm\s+(?:19|20)\d{2})`;
const DEADLINE = new RegExp(String.raw`(?<![\p{L}])(?:trước|chậm\s+nhất(?:\s+(?:là|vào|đến))?|hoàn\s+thành(?:\s+(?:trong|trước|vào|chậm\s+nhất))*|xong\s+trước|hạn(?:\s+chót)?|thời\s+(?:hạn|gian)(?:\s+(?:hoàn\s+thành|thực\s+hiện))?|đến\s+hết|trong)\s*:?\s*(${DATE_PART})`, 'iu');

/** Hạn trong câu giao việc: "trước ngày 30/6/2026", "hoàn thành trong quý II/2026", "chậm nhất ngày 15 tháng 3". */
export function taskDeadline(text: string, defaultYear: number | null): string | null {
  const match = DEADLINE.exec(text);
  if (!match) return null;
  const fragment = match[1]
    .replace(/ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/iu, '$1/$2/$3')
    .replace(/ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})/iu, '$1/$2')
    .replace(/\s+năm\s+(\d{4})/iu, '/$1');
  const yearOnly = /^năm\s+((?:19|20)\d{2})$/iu.exec(match[1].trim());
  if (yearOnly) return `${yearOnly[1]}-12-31`;
  return parseDeadlineCell(fragment, defaultYear);
}

function stripMarker(text: string): { text: string; ordinal: string | null } {
  const match = MARKER.exec(text);
  if (!match) return { text: text.trim(), ordinal: null };
  return { text: text.slice(match[0].length).trim(), ordinal: match[1] ?? match[2] ?? null };
}

/** Tên đơn vị trong đề mục ("2. Phòng Văn hóa - Xã hội", "c) Công an phường:"); không phải đề mục đơn vị thì null. */
export function organizationOfHeading(heading: string | null | undefined): string | null {
  const text = stripMarker((heading ?? '').replace(/\s+/g, ' ')).text.replace(/[:.]\s*$/u, '').trim();
  if (!text || text.length > 140 || !ORG_ONLY.test(text)) return null;
  // Đề mục là câu giao việc ("Phòng Kinh tế tham mưu…") không phải tên đơn vị trơn.
  if (new RegExp(String.raw`\s(?:${ACTION})(?![\p{L}])`, 'iu').test(text)) return null;
  return text;
}

function capitalize(text: string) {
  return text ? text[0].toLocaleUpperCase('vi') + text.slice(1) : text;
}

function words(text: string) {
  return text.split(/\s+/).filter(word => /\p{L}/u.test(word)).length;
}

interface Unit {
  text: string;
  start: number;
}

/** Tách phần thân đoạn thành câu, giữ vị trí: xuống dòng, hoặc sau "." ";" khi câu sau bắt đầu bằng chữ hoa, gạch đầu dòng. */
function units(body: string): Unit[] {
  const result: Unit[] = [];
  let offset = 0;
  for (const line of body.split('\n')) {
    let cursor = 0;
    for (const part of line.split(/(?<=[.;])\s+(?=[\p{Lu}\-+•(])/u)) {
      const start = line.indexOf(part, cursor);
      cursor = start + part.length;
      if (part.trim()) result.push({ text: part.trim(), start: offset + start + (part.length - part.trimStart().length) });
    }
    offset += line.length + 1;
  }
  return result;
}

export interface TaskOptions {
  headingPath?: readonly string[];
  defaultYear?: number | null;
  /** "sections": đoạn đã nằm trong phần nhiệm vụ nên câu dưới đề mục đơn vị cũng là nhiệm vụ; "all": chỉ câu giao việc rõ. */
  inTaskSection?: boolean;
}

/** Các nhiệm vụ trong một đoạn văn xuôi (đã bỏ dòng "[Mục: …]"). */
export function extractTasks(chunkText: string, options: TaskOptions = {}): ProseTask[] {
  const body = chunkBody(chunkText);
  const defaultYear = options.defaultYear ?? null;
  // Đơn vị theo đề mục gần nhất; dòng "Phòng Kinh tế:" trong đoạn đổi đơn vị cho các câu sau nó.
  let context: string | null = null;
  for (const heading of [...(options.headingPath ?? [])].reverse()) {
    context = organizationOfHeading(heading);
    if (context) break;
  }
  const tasks: ProseTask[] = [];
  const seen = new Set<string>();
  for (const unit of units(body)) {
    const { text: stripped, ordinal } = stripMarker(unit.text);
    const lineOrg = organizationOfHeading(stripped);
    if (lineOrg && words(stripped) <= 14) {
      context = lineOrg;
      continue;
    }
    if (stripped.length < 25 || words(stripped) < 5) continue;
    // Câu ghi mức cần đạt bằng số là chỉ tiêu (Qwen đọc), không lập thành nhiệm vụ.
    if (hasTargetFigure(stripped, true)) continue;

    let rest = stripped;
    let responsible: string | null = null;
    let explicit = false;
    const assigned = ASSIGN.exec(rest) ?? ORG_FIRST.exec(rest);
    if (assigned) {
      responsible = assigned[1].replace(/[,\s]+$/u, '').trim();
      rest = rest.slice(assigned[0].length).trim();
      explicit = true;
    }
    rest = rest.replace(LEAD_ROLE, '');
    let coordinating: string | null = null;
    const coordinate = COORDINATE.exec(rest);
    if (coordinate) {
      coordinating = coordinate[1].replace(/[,\s]+$/u, '').trim();
      rest = rest.slice(coordinate[0].length).trim();
    } else {
      rest = rest.replace(/^chủ\s+trì\s*,?\s*/iu, '');
    }
    const deadline = taskDeadline(stripped, defaultYear);
    const underOrganization = !explicit && !!context && !!options.inTaskSection && STARTS_WITH_WORK.test(rest);
    if (!explicit && !deadline && !underOrganization) continue;
    if (!explicit && !STARTS_WITH_WORK.test(rest) && !underOrganization) continue;
    if (!responsible) responsible = context;

    // Mệnh đề hạn đứng riêng ở cuối câu ("…; hoàn thành trước ngày 30/6/2026") đã vào trường hạn, bỏ khỏi tên.
    const name = capitalize(rest
      .replace(/[;,]\s*(?:hoàn\s+thành|xong|thời\s+(?:hạn|gian)|hạn)(?![\p{L}])[^;]{0,60}$/iu, '')
      .replace(/[.;,:\s]+$/u, ''));
    // Câu chỉ được nhận nhờ nằm dưới đề mục đơn vị phải đủ dài để là một việc cụ thể ("Tổ chức thực hiện nghiêm túc" thì không).
    if (words(name) < (explicit || deadline ? 4 : 8)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const warnings: string[] = [];
    if (!explicit && responsible) warnings.push(`Đơn vị thực hiện lấy theo đề mục "${responsible}", không ghi trong câu.`);
    if (!responsible) warnings.push('Câu không ghi đơn vị thực hiện.');
    if (!deadline) warnings.push('Câu không ghi thời hạn: hạn mặc định là cuối năm kế hoạch.');
    tasks.push({
      name: name.length > 300 ? `${name.slice(0, 299)}…` : name,
      ordinal,
      responsibleDepartmentName: responsible,
      coordinatingDepartments: coordinating,
      deadline,
      frequency: detectFrequency(stripped).frequency,
      sourceQuote: unit.text.length > 600 ? `${unit.text.slice(0, 597)}...` : unit.text,
      position: unit.start,
      confidence: explicit && deadline ? 0.8 : explicit || deadline ? 0.7 : 0.6,
      warnings,
    });
  }
  return tasks;
}
