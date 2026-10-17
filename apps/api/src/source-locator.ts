// Định vị một đoạn chữ (tên chỉ tiêu) trong văn bản đã đọc bố cục: trả về trang và khung toạ độ để giao diện mở đúng
// trang và tô sáng đúng hàng. Chạy cho MỌI văn bản (PDF có lớp chữ, PDF scan qua OCR), không phụ thuộc mẫu văn bản cụ thể.
//
// Khó khăn của văn bản hành chính và cách xử lý:
//  - Bảng nhiều cột: đọc theo hàng sẽ xen chữ các cột vào nhau ("Tốc độ tăng… | % | 11 | Năm …") → nhóm đoạn chữ theo
//    cột (cùng mép trái), so khớp trong từng cột, rồi mở rộng khung ra cả hàng của bảng.
//  - PDF ký số hay dính chữ ("Tốc độtăng", "trịsản") và tách từ lung tung → so khớp trên chuỗi đã bỏ dấu, bỏ khoảng trắng,
//    bằng căn chỉnh xâu cục bộ (chịu được thiếu, thừa, sai vài ký tự).
//  - Văn bản trăm trang → lọc trước các trang có nhiều bộ ba ký tự chung với câu cần tìm.

/** Một đoạn chữ trên trang và khung của nó, toạ độ chuẩn hoá 0..1 (gốc trên-trái). */
export type LayoutSpan = [x0: number, y0: number, x1: number, y1: number, text: string];

export type LayoutPage = { pageNumber: number; spans: LayoutSpan[] };

export type SourceBox = [x0: number, y0: number, x1: number, y1: number];

export type SourceLocation = {
  pageNumber: number;
  /** Khung cả hàng chứa chỉ tiêu (để tô sáng). */
  box: SourceBox;
  /** Khung riêng phần chữ khớp (tên chỉ tiêu). */
  matchBox: SourceBox;
  /** Chữ khớp, dùng hiển thị và làm phương án dự phòng khi không có bố cục. */
  quote: string;
  /** Độ khớp 0..1. */
  score: number;
};

/** Bỏ dấu, chữ thường, chỉ giữ chữ và số (bỏ khoảng trắng: PDF hay dính hoặc tách từ sai). */
export function foldKey(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function trigrams(text: string) {
  const set = new Set<string>();
  for (let index = 0; index + 3 <= text.length; index += 1) set.add(text.slice(index, index + 3));
  return set;
}

/** Tỉ lệ bộ ba ký tự của câu cần tìm có mặt trong một trang. */
function coverage(wanted: Set<string>, pageText: string) {
  if (!wanted.size) return 0;
  const found = trigrams(foldKey(pageText));
  let shared = 0;
  for (const gram of wanted) if (found.has(gram)) shared += 1;
  return shared / wanted.size;
}

/**
 * Trang chỉ có chữ (DOCX, XLSX, văn bản chưa có bố cục): mỗi dòng một đoạn với toạ độ giả — một cột, dòng thứ i ở
 * hàng i — đủ để chọn phạm vi, lọc trang và tìm trang + câu khớp; khung trả về khi đó không mang nghĩa toạ độ.
 */
export function textLayoutPage(pageNumber: number, text: string): LayoutPage {
  const lines = text.split(/\n+/).filter(line => line.trim());
  return { pageNumber, spans: lines.map((line, index) => [0, index, 0.4, index + 1, line] as LayoutSpan) };
}

/**
 * Chọn trước các trang đáng tìm, chỉ dựa trên chữ của trang (rẻ, không cần bố cục), xếp theo độ phủ bộ ba ký tự.
 * Văn bản chia phần theo đơn vị (phụ lục giao cho mọi xã, phường) chỉ tìm trong phần của đơn vị mình — không bao giờ
 * lấy dòng cùng tên chỉ tiêu ở phần của đơn vị khác; không có phần của mình thì không tìm (scope = 'absent').
 */
export function candidatePages(
  pages: { pageNumber: number; text: string }[],
  query: string,
  options: { scope?: string; hintPages?: number[]; maxPages?: number } = {},
) {
  const key = foldKey(query);
  const section = options.scope ? unitSection(pages.map(page => textLayoutPage(page.pageNumber, page.text)), options.scope) : null;
  const scope: 'none' | 'own' | 'absent' = section?.multiUnit ? (section.pages.length ? 'own' : 'absent') : 'none';
  if (key.length < 6 || scope === 'absent') return { pages: [] as number[], scope };
  const own = scope === 'own' ? section!.pages : null;
  const hinted = options.hintPages?.length ? options.hintPages.filter(page => !own || own.includes(page)) : [];
  const allowed = hinted.length ? hinted : own;
  const wanted = trigrams(key);
  const ranked = pages
    .filter(page => !allowed || allowed.includes(page.pageNumber))
    .map(page => ({ pageNumber: page.pageNumber, cover: coverage(wanted, page.text) }))
    .filter(entry => entry.cover >= 0.5)
    .sort((a, b) => b.cover - a.cover)
    .slice(0, options.maxPages ?? 4);
  return { pages: ranked.map(entry => entry.pageNumber), scope };
}

type Item = { span: LayoutSpan; index: number };

/** Gom các đoạn có khoảng ngang chồng lên nhau (dòng căn đều bị pdf.js tách thành nhiều mảnh vẫn chung một dải). */
function overlapGroups(items: Item[]) {
  const sorted = [...items].sort((a, b) => a.span[0] - b.span[0]);
  const groups: { x1: number; items: Item[] }[] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last && item.span[0] < last.x1 - 0.002) {
      last.items.push(item);
      last.x1 = Math.max(last.x1, item.span[2]);
    } else groups.push({ x1: item.span[2], items: [item] });
  }
  return groups.map(group => group.items);
}

/**
 * Nhóm đoạn chữ theo cột của bảng để đọc đúng thứ tự (đọc theo hàng sẽ xen chữ các cột vào nhau).
 * Cột = dải ngang được nhiều ô chữ phủ; khe giữa hai cột chỉ có rất ít đoạn đi qua (chú thích, tiêu đề mục trải
 * ngang) — vài đoạn như vậy không được nối hai cột thành một. Đoạn vào cột chứa mép trái của nó: ô bảng vào đúng cột;
 * dòng văn xuôi vắt nhiều cột cùng nhóm với dòng ngắn cuối đoạn (cùng lề trái), câu vắt dòng vẫn liền mạch; trang
 * không có bảng thì gom theo chồng lấn như thường. Mỗi nhóm xếp từ trên xuống, trái sang phải.
 */
function columns(spans: LayoutSpan[]) {
  const BIN = 0.004;
  const size = Math.ceil(1 / BIN) + 1;
  const bin = (x: number) => Math.min(size - 1, Math.max(0, Math.floor(x / BIN)));
  const items: Item[] = spans.map((span, index) => ({ span, index }));
  // Dòng rộng gần hết trang không phải ô bảng: không tính vào độ phủ để không lấp khe giữa các cột.
  const cells = items.filter(item => item.span[2] - item.span[0] <= 0.45);
  const cover = new Int32Array(size);
  for (const { span } of cells) for (let b = bin(span[0] + 0.002); b <= bin(span[2] - 0.002); b += 1) cover[b] += 1;
  // Khe giữa cột: độ phủ thấp hẳn so với cột dày nhất (vài tiêu đề mục, chú thích đi qua không đủ thành cột).
  const limit = Math.max(2, Math.ceil(Math.max(...cover) * 0.2));
  const runs: [number, number][] = [];
  let start = -1;
  for (let b = 0; b <= size; b += 1) {
    const on = b < size && cover[b] > limit;
    if (on && start < 0) start = b;
    if (!on && start >= 0) {
      runs.push([start, b - 1]);
      start = -1;
    }
  }
  const byRun: Item[][] = runs.map(() => []);
  const loose: Item[] = [];
  for (const item of items) {
    const from = bin(item.span[0] + 0.002);
    const to = bin(item.span[2] - 0.002);
    const hits = runs.flatMap((run, index) => (from <= run[1] && to >= run[0] ? [index] : []));
    if (!hits.length) loose.push(item);
    else byRun[hits[0]].push(item);
  }
  const groups = [...byRun, ...overlapGroups(loose)].filter(group => group.length);
  for (const group of groups) group.sort((a, b) => a.span[1] - b.span[1] || a.span[0] - b.span[0]);
  return groups.map(group => ({ items: group }));
}

/** Chữ thường giữ dấu, bỏ dấu câu, gộp khoảng trắng — so tên đơn vị (Thanh An và Thạnh An là hai xã khác nhau). */
function plain(text: string) {
  return text.normalize('NFC').toLocaleLowerCase('vi').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const UNIT_TYPES = ['đặc khu', 'thị trấn', 'thị xã', 'thành phố', 'phường', 'xã', 'quận', 'huyện'];

function dropLeadingUnitType(text: string) {
  for (const type of UNIT_TYPES) if (text.startsWith(`${type} `)) return text.slice(type.length + 1).trim();
  return text;
}

export type UnitSection = {
  /** Trang thuộc phần của đơn vị mình (rỗng nếu văn bản không chia phần hoặc không có phần của mình). */
  pages: number[];
  /** Số đơn vị khác có phần riêng trong văn bản. */
  otherUnits: number;
  /** Văn bản chia phần theo đơn vị: đầu phần của đơn vị khác xuất hiện ở ít nhất 2 trang. */
  multiUnit: boolean;
};

/**
 * Văn bản giao cho nhiều đơn vị (phụ lục giao chỉ tiêu cho mọi xã, phường; mỗi đơn vị một phần mở đầu bằng dòng
 * "ĐƠN VỊ: ỦY BAN NHÂN DÂN PHƯỜNG …"): tìm phần của đơn vị mình.
 *
 * Chỉ dòng có dạng đầu phần mới được tính: [phần chung ≥ 2 từ] [loại đơn vị] [tên đơn vị 1–6 từ], toàn bộ dòng chỉ có
 * vậy. Dòng văn xuôi bắt đầu bằng "Phường …", bảng tổng hợp nhắc tên phường, đầu văn bản "ỦY BAN NHÂN DÂN / PHƯỜNG …"
 * đều không phải đầu phần. Tên so có dấu (Thanh An ≠ Thạnh An); chỉ khi không thấy mới so không dấu. Một phần kéo dài
 * từ trang có đầu phần của mình tới trước trang có đầu phần kế tiếp (đơn vị bất kỳ, kể cả xã, đặc khu), không giới hạn
 * số trang.
 */
export function unitSection(pages: LayoutPage[], term: string): UnitSection {
  const empty: UnitSection = { pages: [], otherUnits: 0, multiUnit: false };
  const name = dropLeadingUnitType(plain(term));
  if (foldKey(name).length < 4) return empty;
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const lines = ordered.map(page => ({ pageNumber: page.pageNumber, lines: page.spans.map(span => plain(span[4])).filter(Boolean) }));

  // Mẫu đầu phần: [phần chung ≥ 2 từ] [loại đơn vị] [tên 1–6 từ] — gom theo phần chung, đếm số trang có mẫu đó.
  const stems = new Map<string, Set<number>>();
  for (const page of lines) {
    for (const line of page.lines) {
      const words = line.split(' ');
      for (let index = 2; index < words.length - 1; index += 1) {
        const rest = words.slice(index).join(' ');
        const type = UNIT_TYPES.find(item => rest.startsWith(`${item} `));
        if (!type) continue;
        const nameWords = words.length - index - type.split(' ').length;
        if (nameWords < 1 || nameWords > 6) continue;
        const stem = words.slice(0, index).join(' ');
        if (foldKey(stem).length < 8) continue;
        if (!stems.has(stem)) stems.set(stem, new Set());
        stems.get(stem)!.add(page.pageNumber);
        break;
      }
    }
  }

  let best: UnitSection = empty;
  let bestPages = 0;
  for (const [stem, stemPages] of stems) {
    if (stemPages.size < 3) continue;
    // Mỗi trang một đầu phần (dòng đầu tiên khớp): tên đơn vị sau phần chung (loại đơn vị có thể vắng).
    const headers: { pageNumber: number; unit: string }[] = [];
    for (const page of lines) {
      const line = page.lines.find(text => text.startsWith(`${stem} `) && dropLeadingUnitType(text.slice(stem.length + 1)).split(' ').length <= 6);
      if (line) headers.push({ pageNumber: page.pageNumber, unit: dropLeadingUnitType(line.slice(stem.length + 1)) });
    }
    const units = new Set(headers.map(header => header.unit));
    if (units.size < 3 || headers.length < 3) continue;
    const exact = headers.some(header => header.unit === name);
    const isOwn = (unit: string) => (exact ? unit === name : foldKey(unit) === foldKey(name));
    const own: number[] = [];
    headers.forEach((header, index) => {
      if (!isOwn(header.unit)) return;
      const until = headers[index + 1]?.pageNumber ?? Infinity;
      for (const page of ordered) if (page.pageNumber >= header.pageNumber && page.pageNumber < until) own.push(page.pageNumber);
    });
    if (headers.length <= bestPages) continue;
    bestPages = headers.length;
    best = { pages: own, otherUnits: [...units].filter(unit => !isOwn(unit)).length, multiUnit: true };
  }
  return best;
}

/** Trang thuộc phần của đơn vị (rỗng nếu văn bản không chia phần theo đơn vị). */
export function scopePages(pages: LayoutPage[], term: string) {
  return unitSection(pages, term).pages;
}

/**
 * Căn chỉnh cục bộ (Smith–Waterman) câu cần tìm trong một chuỗi dài: trả về điểm cao nhất và đoạn [start, end) của
 * chuỗi khớp. Khớp +2, sai/thiếu/thừa −1; điểm chuẩn hoá theo 2 × độ dài câu cần tìm.
 */
function localAlign(query: string, text: string) {
  const m = query.length;
  const n = text.length;
  if (!m || !n) return { score: 0, start: 0, end: 0 };
  let previous = new Int32Array(m + 1);
  let current = new Int32Array(m + 1);
  // Vị trí bắt đầu (trong text) của đường căn tốt nhất kết thúc tại mỗi ô.
  let previousStart = new Int32Array(m + 1);
  let currentStart = new Int32Array(m + 1);
  let best = 0;
  let bestEnd = 0;
  let bestStart = 0;
  for (let j = 1; j <= n; j += 1) {
    current[0] = 0;
    currentStart[0] = j;
    const c = text.charCodeAt(j - 1);
    for (let i = 1; i <= m; i += 1) {
      const diagonal = previous[i - 1] + (query.charCodeAt(i - 1) === c ? 2 : -1);
      const up = current[i - 1] - 1;
      const left = previous[i] - 1;
      let value = 0;
      let start = j;
      if (diagonal > value) {
        value = diagonal;
        start = previous[i - 1] === 0 ? j - 1 : previousStart[i - 1];
      }
      if (up > value) {
        value = up;
        start = currentStart[i - 1];
      }
      if (left > value) {
        value = left;
        start = previousStart[i];
      }
      current[i] = value;
      currentStart[i] = start;
      if (value > best) {
        best = value;
        bestEnd = j;
        bestStart = start;
      }
    }
    [previous, current] = [current, previous];
    [previousStart, currentStart] = [currentStart, previousStart];
  }
  return { score: best / (2 * m), start: bestStart, end: bestEnd };
}

function union(boxes: SourceBox[]): SourceBox {
  return [
    Math.min(...boxes.map(box => box[0])),
    Math.min(...boxes.map(box => box[1])),
    Math.max(...boxes.map(box => box[2])),
    Math.max(...boxes.map(box => box[3])),
  ];
}

/**
 * Mở rộng khung khớp ra cả hàng: mọi đoạn chữ có tâm dọc nằm trong dải dọc của phần khớp (thêm chút đệm).
 * Không nối thêm dòng của ô cột khác cao hơn tên chỉ tiêu: ở nhiều cột, dòng của hai hàng kề nhau sát nhau như dòng
 * trong cùng ô — không có đường kẻ bảng thì không phân biệt chắc chắn được, nối vào sẽ tô lấn sang hàng khác.
 */
function rowBox(spans: LayoutSpan[], match: SourceBox): SourceBox {
  const pad = Math.max(0.002, (match[3] - match[1]) * 0.08);
  const inRow = spans.filter(span => {
    const center = (span[1] + span[3]) / 2;
    return center >= match[1] - pad && center <= match[3] + pad;
  });
  return union([match, ...inRow.map(span => [span[0], span[1], span[2], span[3]] as SourceBox)]);
}

/**
 * Tìm `query` trong văn bản. Trả về vị trí tốt nhất có độ khớp ≥ minScore, hoặc null.
 * hint.pages: chỉ tìm trong các trang này (ví dụ trang đề xuất trích xuất đã ghi nhận).
 */
export function locateText(
  pages: LayoutPage[],
  query: string,
  options: { minScore?: number; maxPages?: number; hintPages?: number[]; scope?: string; rowHint?: string } = {},
): SourceLocation | null {
  const key = foldKey(query);
  if (key.length < 6) return null;
  const minScore = options.minScore ?? 0.72;
  // Văn bản chia phần theo đơn vị: chỉ tìm trong phần của đơn vị mình; không có phần đó thì không tìm sang phần khác.
  const section = options.scope ? unitSection(pages, options.scope) : null;
  if (section?.multiUnit && !section.pages.length) return null;
  const own = section?.multiUnit ? section.pages : null;
  const hinted = options.hintPages?.length ? options.hintPages.filter(page => !own || own.includes(page)) : [];
  const allowed = hinted.length ? hinted : own;
  const hint = options.rowHint ? foldKey(options.rowHint) : '';
  const wanted = trigrams(key);
  // Lọc trang: tỉ lệ bộ ba ký tự của câu cần tìm xuất hiện trên trang.
  const ranked = pages
    .filter(page => page.spans.length && (!allowed || allowed.includes(page.pageNumber)))
    .map(page => ({ page, cover: coverage(wanted, page.spans.map(span => span[4]).join('')) }))
    .filter(entry => entry.cover >= 0.5)
    .sort((a, b) => b.cover - a.cover)
    .slice(0, options.maxPages ?? 4);

  let best: SourceLocation | null = null;
  for (const { page } of ranked) {
    for (const column of columns(page.spans)) {
      // Chuỗi của cột + bảng tra từ vị trí ký tự về đoạn chữ.
      let text = '';
      const owner: number[] = [];
      for (const item of column.items) {
        const part = foldKey(item.span[4]);
        for (let index = 0; index < part.length; index += 1) owner.push(item.index);
        text += part;
      }
      const aligned = localAlign(key, text);
      if (aligned.score < minScore) continue;
      const used = [...new Set(owner.slice(aligned.start, Math.max(aligned.start + 1, aligned.end)))];
      const matched = used.map(index => page.spans[index]);
      const matchBox = union(matched.map(span => [span[0], span[1], span[2], span[3]] as SourceBox));
      const box = rowBox(page.spans, matchBox);
      // Hàng có chứa giá trị kế hoạch được ưu tiên khi nhiều hàng cùng khớp tên (cộng điểm nhỏ).
      const rowText = hint
        ? foldKey(page.spans.filter(span => (span[1] + span[3]) / 2 >= box[1] && (span[1] + span[3]) / 2 <= box[3]).map(span => span[4]).join(''))
        : '';
      const score = aligned.score + (hint && rowText.includes(hint) ? 0.01 : 0);
      if (best && score <= best.score) continue;
      best = {
        pageNumber: page.pageNumber,
        matchBox,
        box,
        quote: matched.map(span => span[4]).join(' ').replace(/\s+/g, ' ').trim(),
        score: Math.round(score * 1000) / 1000,
      };
    }
  }
  return best;
}
