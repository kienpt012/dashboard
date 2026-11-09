// Thứ tự, số thứ tự, nhóm và lĩnh vực của chỉ tiêu lấy từ cấu trúc của chính văn bản.
//
// Mô hình chỉ đọc từng đoạn nên không biết chỉ tiêu đứng thứ mấy trong cả văn bản, và đoán danh mục từ một câu
// thì dễ sai. Đề mục của văn bản cho nhóm đúng như người soạn đã chia, vị trí câu trích dẫn cho thứ tự đọc, dấu
// đánh số "(9)", "9.", "a)" hay cột STT cho số thứ tự. Không có luật riêng cho một mẫu văn bản nào.

/** Bỏ các dòng "[Mục: …]" và "[Đầu mục: …]" mà bộ chia đoạn (B7) gắn ở đầu đoạn: chúng không phải nội dung. */
export function chunkBody(text: string): string {
  const lines = text.split('\n');
  let start = 0;
  while (start < lines.length && start < 3 && /^\[(Mục|Đầu mục):.*\]\s*$/u.test(lines[start].trim())) start += 1;
  return lines.slice(start).join('\n');
}

/** Chữ thường, gộp khoảng trắng, kèm vị trí ký tự gốc của từng ký tự để quy ngược kết quả tìm về văn bản gốc. */
function searchable(text: string): { flat: string; map: number[] } {
  let flat = '';
  const map: number[] = [];
  let space = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/\s/u.test(char)) {
      if (!space && flat.length) {
        flat += ' ';
        map.push(index);
      }
      space = true;
      continue;
    }
    space = false;
    flat += char.toLowerCase();
    map.push(index);
  }
  return { flat, map };
}

function valueSpellings(value: number): string[] {
  const plain = String(value);
  const [integer, decimal] = plain.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return [...new Set([decimal ? `${grouped},${decimal}` : grouped, decimal ? `${integer},${decimal}` : integer, plain])]
    .filter(spelling => spelling.length >= 2);
}

/**
 * Vị trí (ký tự trong `body`) của câu trích dẫn. Mô hình hay cắt hoặc sửa nhẹ câu trích, nên thử cả câu, rồi phần
 * đầu, rồi từng cụm 6 từ, cuối cùng là giá trị số. Không thấy thì null.
 */
export function locateQuote(body: string, quote: string | null | undefined, value?: number | null): number | null {
  const haystack = searchable(body.normalize('NFC'));
  const needle = searchable((quote ?? '').normalize('NFC').replace(/(…|\.\.\.)\s*$/u, '')).flat.trim();
  const at = (index: number) => (index >= 0 ? haystack.map[index] : null);
  if (needle.length >= 6) {
    const whole = haystack.flat.indexOf(needle);
    if (whole >= 0) return at(whole);
    for (const length of [60, 30]) {
      if (needle.length <= length) continue;
      const head = haystack.flat.indexOf(needle.slice(0, length));
      if (head >= 0) return at(head);
    }
    const words = needle.split(' ');
    for (let start = 0; start + 6 <= words.length && start < 30; start += 3) {
      const window = words.slice(start, start + 6).join(' ');
      const found = haystack.flat.indexOf(window);
      if (found >= 0) return at(found);
    }
  }
  if (value !== null && value !== undefined && Number.isFinite(value)) {
    for (const spelling of valueSpellings(value)) {
      // Không lấy số nằm trong dấu đánh số "(10)": đó là số thứ tự, không phải giá trị.
      const pattern = new RegExp(`(^|[^\\d.,(])${spelling.replace(/[.]/g, '\\.')}(?![\\d)]|[.,]\\d)`, 'u');
      const match = pattern.exec(haystack.flat);
      if (match) return at(match.index + match[1].length);
    }
  }
  return null;
}

/** Thứ tự đọc trong cả văn bản: số đoạn trước, vị trí trong đoạn sau. Không định vị được thì xếp cuối đoạn. */
export function documentOrderKey(chunkIndex: number, position: number | null): number {
  const within = position === null ? 9_999 : Math.min(9_998, Math.max(0, position));
  return chunkIndex * 10_000 + within;
}

const PROSE_MARKERS: RegExp[] = [
  // (9), (12a)
  /\((\d{1,3}[a-zđ]?)\)\s*/gu,
  // 9. Tỷ lệ…, 2.1. Thu ngân sách… ở đầu dòng hoặc sau dấu kết câu
  /(?:^|(?<=[.;:!?]\s))(\d{1,2}(?:\.\d{1,2}){0,2})[.)]\s+(?=\p{Lu})/gu,
  // a) Tỷ lệ…
  /(?:^|(?<=[.;:!?]\s))([a-zđ])\)\s+/gu,
];

/**
 * Số thứ tự của chỉ tiêu như văn bản ghi, dò ngay trong văn bản gốc:
 * - bảng: ô STT ở đầu hàng chứa câu trích ("9", "II", "a"); hàng "-" là chỉ tiêu thành phần, không có số;
 * - văn xuôi: dấu đánh số gần nhất phía trước câu trích trong cùng đoạn văn. Hai chỉ tiêu cùng một mục
 *   ("(9) Tỷ lệ… đạt 95%. Tỷ lệ… đạt 90%.") dùng chung số như văn bản.
 */
export function detectOrdinal(body: string, position: number | null, kind: 'section' | 'table' | 'form' | string = 'section'): string | null {
  if (position === null || position < 0 || position > body.length) return null;
  const lineStart = body.lastIndexOf('\n', position - 1) + 1;
  const nextBreak = body.indexOf('\n', position);
  const line = body.slice(lineStart, nextBreak < 0 ? body.length : nextBreak);
  const offset = position - lineStart;
  if (/^\s*[-–+•]\s/u.test(line)) return null;
  if (kind === 'table') {
    const cell = /^\s*\|?\s*(\d{1,3}(?:\.\d{1,2}){0,2}|[IVXLC]{1,6}|[a-zđ])[.)]?\s*(?:\||\s)\s*\S/u.exec(line);
    return cell ? cell[1] : null;
  }
  let best: { index: number; value: string } | null = null;
  for (const pattern of PROSE_MARKERS) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
      if (match.index > offset) break;
      if (!best || match.index > best.index) best = { index: match.index, value: match[1] };
    }
  }
  return best?.value ?? null;
}

/** Bỏ ký tự rác OCR ở đầu đề mục ("? Công tác Nội vụ"), gộp khoảng trắng. Giữ nguyên chữ và cách đánh số. */
export function cleanHeading(label: string): string {
  return label.normalize('NFC').replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}(]+/u, '').trim();
}

/**
 * Đề mục "khung" của văn bản, không phải nhóm chỉ tiêu: Phần/Chương/Mục/Điều, hoặc dòng viết hoa toàn bộ (tên cơ quan
 * "ỦY BAN NHÂN DÂN…", "QUYẾT ĐỊNH", "PHỤ LỤC…"). Nhóm chỉ tiêu nằm bên dưới các đề mục này.
 */
export function isContainerHeading(label: string): boolean {
  if (/^(PHẦN|Phần|CHƯƠNG|Chương|MỤC|Mục|Điều)\s+([IVXLC]+|\d+)/u.test(label)) return true;
  const letters = label.replace(/[^\p{L}]/gu, '');
  return letters.length >= 6 && letters === letters.toUpperCase();
}

/**
 * Nhóm theo văn bản cho từng chỉ tiêu: cấp đề mục đầu tiên mà các chỉ tiêu bắt đầu khác nhau. Phần đầu chung
 * (tên văn bản, "Điều 3. Chỉ tiêu…") bỏ đi; một vài chỉ tiêu lạc ở mục khác (dưới 10%) không làm hỏng phần chung.
 * Khi chỗ khác nhau là đề mục khung (Điều 3 với Điều 4, thân văn bản với phụ lục) thì xét tiếp bên trong từng khung,
 * để nhóm là "a) Chỉ tiêu về kinh tế" chứ không phải "ỦY BAN NHÂN DÂN THÀNH PHỐ…". Tất cả cùng một mục thì nhóm là
 * đề mục cuối.
 */
export function documentGroups(paths: (string[] | null | undefined)[]): (string | null)[] {
  const clean = paths.map(path => (Array.isArray(path) ? path.map(part => cleanHeading(String(part))).filter(Boolean) : []));
  const result: (string | null)[] = clean.map(path => (path.length ? path[path.length - 1] : null));

  const assign = (members: number[], depth: number, guard: number) => {
    if (!members.length || guard > 12) return;
    let level = depth;
    // Bỏ phần đầu chung (cho phép dưới 10% chỉ tiêu lạc mục).
    for (;;) {
      const counts = new Map<string, number>();
      for (const index of members) {
        const heading = clean[index][level];
        if (heading !== undefined) counts.set(heading, (counts.get(heading) ?? 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const deeper = members.some(index => clean[index].length > level + 1);
      if (!top || top[1] < members.length * 0.9 || !deeper) break;
      level += 1;
    }
    const partitions = new Map<string, number[]>();
    for (const index of members) {
      const heading = clean[index][level] ?? clean[index][clean[index].length - 1];
      if (heading === undefined) continue;
      partitions.set(heading, [...(partitions.get(heading) ?? []), index]);
    }
    for (const [heading, group] of partitions) {
      const nested = group.filter(index => clean[index].length > level + 1 && clean[index][level] === heading);
      if (isContainerHeading(heading) && nested.length) {
        for (const index of group) if (!nested.includes(index)) result[index] = heading;
        assign(nested, level + 1, guard + 1);
      } else {
        for (const index of group) result[index] = heading;
      }
    }
  };

  assign(clean.map((path, index) => (path.length ? index : -1)).filter(index => index >= 0), 0, 0);
  return result;
}

export interface StandardCategory {
  name: string;
  keywords: string[];
  /** Mô tả để so nghĩa bằng mô hình nhúng khi đề mục không có từ khoá. */
  prototype: string;
}

// Danh sách lĩnh vực chuẩn cho dashboard. Thêm hoặc đổi lĩnh vực chỉ cần sửa ở đây.
export const STANDARD_CATEGORIES: StandardCategory[] = [
  {
    name: 'Kinh tế',
    keywords: ['kinh tế', 'ngân sách', 'tài chính', 'thương mại', 'doanh thu', 'doanh nghiệp', 'hộ kinh doanh', 'đầu tư', 'giải ngân', 'sản xuất', 'nông nghiệp', 'công nghiệp', 'du lịch', 'tăng trưởng', 'thu nhập bình quân', 'bán lẻ', 'thanh toán không dùng tiền mặt'],
    prototype: 'Chỉ tiêu kinh tế: thu ngân sách, thương mại dịch vụ, doanh nghiệp, đầu tư công, sản xuất kinh doanh, thu nhập',
  },
  {
    name: 'Y tế',
    keywords: ['y tế', 'sức khỏe', 'sức khoẻ', 'bảo hiểm y tế', 'tiêm chủng', 'vắc xin', 'khám bệnh', 'khám thai', 'suy dinh dưỡng', 'sốt xuất huyết', 'dịch bệnh', 'an toàn thực phẩm', 'ngộ độc thực phẩm', 'dân số'],
    prototype: 'Chỉ tiêu y tế: bảo hiểm y tế, khám chữa bệnh, tiêm chủng, dịch bệnh, dinh dưỡng trẻ em, an toàn thực phẩm',
  },
  {
    name: 'Giáo dục',
    keywords: ['giáo dục', 'đào tạo', 'trường học', 'học sinh', 'phổ cập', 'khuyến học', 'mầm non', 'tiểu học', 'trung học'],
    prototype: 'Chỉ tiêu giáo dục: trường học, học sinh, phổ cập giáo dục, đào tạo',
  },
  {
    name: 'Văn hoá - xã hội',
    keywords: ['văn hóa', 'văn hoá', 'xã hội', 'lao động', 'việc làm', 'giảm nghèo', 'hộ nghèo', 'cận nghèo', 'an sinh', 'bảo hiểm xã hội', 'thể dục', 'thể thao', 'gia đình', 'trẻ em', 'người có công', 'bảo trợ'],
    prototype: 'Chỉ tiêu văn hoá - xã hội: lao động việc làm, giảm nghèo, an sinh xã hội, gia đình văn hoá, thể dục thể thao',
  },
  {
    name: 'Đô thị - môi trường',
    keywords: ['đô thị', 'môi trường', 'xây dựng', 'quy hoạch', 'giao thông', 'chất thải', 'rác', 'nước thải', 'cây xanh', 'đất đai', 'tài nguyên', 'chỉnh trang', 'trật tự đô thị', 'nước sạch'],
    prototype: 'Chỉ tiêu đô thị - môi trường: quy hoạch xây dựng, trật tự đô thị, giao thông, rác thải, nước thải, cây xanh',
  },
  {
    name: 'Hành chính công - chuyển đổi số',
    keywords: ['hành chính', 'thủ tục', 'hồ sơ', 'dịch vụ công', 'chuyển đổi số', 'số hóa', 'số hoá', 'công nghệ thông tin', 'chính quyền số', 'cải cách', 'nội vụ', 'một cửa'],
    prototype: 'Chỉ tiêu hành chính công và chuyển đổi số: thủ tục hành chính, hồ sơ trực tuyến, dịch vụ công, số hoá, cải cách hành chính',
  },
  {
    name: 'An ninh - quốc phòng',
    keywords: ['an ninh', 'quốc phòng', 'quân sự', 'tuyển quân', 'nghĩa vụ quân sự', 'phòng cháy', 'tội phạm', 'ma túy', 'ma tuý', 'an toàn giao thông', 'trật tự xã hội', 'trật tự an toàn'],
    prototype: 'Chỉ tiêu an ninh - quốc phòng: an ninh trật tự, phòng chống tội phạm, ma tuý, quân sự, phòng cháy chữa cháy',
  },
  {
    name: 'Xây dựng Đảng - chính quyền',
    keywords: ['đảng viên', 'tổ chức đảng', 'chi bộ', 'xây dựng đảng', 'mặt trận', 'đoàn thể', 'dân vận', 'kiểm tra, giám sát', 'cán bộ, công chức'],
    prototype: 'Chỉ tiêu xây dựng Đảng và chính quyền: kết nạp đảng viên, chi bộ, mặt trận và đoàn thể, cán bộ công chức',
  },
];

const KEYWORD_PATTERNS = STANDARD_CATEGORIES.map(category => ({
  name: category.name,
  keywords: category.keywords.map(keyword => ({
    length: keyword.length,
    re: new RegExp(`(^|[^\\p{L}])${keyword.normalize('NFC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u'),
  })),
}));

// "kinh tế - xã hội" là cụm chung cho cả văn bản, không nói lên lĩnh vực nào.
const UMBRELLA = /(phát triển\s+)?kinh tế\s*[-–,]?\s*(văn hóa\s*[-–,]?\s*)?xã hội(\s+(và\s+)?quốc phòng\s*[-–,]?\s*an ninh)?/gu;

/** Lĩnh vực chuẩn theo từ khoá. Hai lĩnh vực ngang điểm thì coi là không rõ (null). */
export function categoryByKeywords(text: string | null | undefined): string | null {
  const value = (text ?? '').normalize('NFC').toLowerCase().replace(UMBRELLA, ' ');
  if (!value.trim()) return null;
  const scores = KEYWORD_PATTERNS
    .map(category => ({ name: category.name, score: category.keywords.reduce((sum, keyword) => sum + (keyword.re.test(value) ? keyword.length : 0), 0) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scores.length || (scores[1] && scores[1].score === scores[0].score)) return null;
  return scores[0].name;
}

/** Lĩnh vực theo đề mục: đề mục sâu nhất có từ khoá thắng (sâu hơn thì cụ thể hơn). */
export function categoryFromHeadings(path: (string[] | null | undefined)): string | null {
  if (!Array.isArray(path)) return null;
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const found = categoryByKeywords(String(path[index]));
    if (found) return found;
  }
  return null;
}

/** Chọn lĩnh vực có độ tương đồng cao nhất, chỉ khi đủ cao và bỏ xa lĩnh vực kế tiếp. */
export function pickCategoryByScore(scores: number[], minScore = 0.45, minMargin = 0.02): string | null {
  const ranked = scores.map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score);
  const [best, second] = ranked;
  if (!best || best.score < minScore) return null;
  if (second && best.score - second.score < minMargin) return null;
  return STANDARD_CATEGORIES[best.index]?.name ?? null;
}
