import { TargetDirection, TargetFrequency } from '@prisma/client';
import type { StructuredElement } from './ocr-service';

// Đọc bảng bằng code (D-022). Bảng đã có cấu trúc hàng/cột từ bộ đọc (Docling, Word, Excel) thì không cần mô hình
// ngôn ngữ đoán lại: code nhận vai trò từng cột qua hàng tiêu đề (STT, tên, mã số, đơn vị tính, kế hoạch, thực hiện,
// đơn vị chủ trì, thời hạn…), rồi đọc từng hàng. Nhanh (không gọi Qwen), ổn định (cùng bảng luôn ra cùng kết quả) và
// không bỏ sót hàng. Bảng không nhận ra bố cục thì vẫn đi đường Qwen như trước.
//
// Không có luật riêng cho một mẫu văn bản nào: mọi thứ dựa trên chữ của hàng tiêu đề và hình dạng của hàng.

export interface TableRowLine {
  row: number;
  text: string;
  header: boolean;
}

export type TableTextFormat = 'plain' | 'markdown';

export type TableColumnRole =
  | 'ordinal' | 'name' | 'code' | 'unit' | 'plan' | 'actual' | 'compare' | 'responsible' | 'coordinating'
  | 'deadline' | 'frequency' | 'note' | 'product' | 'basis' | 'ignore' | 'other';

export interface TableColumn {
  index: number;
  role: TableColumnRole;
  /** Tiêu đề cột đúng như văn bản; tiêu đề nhiều tầng nối bằng " › ". */
  label: string;
  year: number | null;
  /** Đơn vị ghi trong tiêu đề cột, vd "Kế hoạch (tỷ đồng)". */
  unitHint: string | null;
  /** Cột của chính địa phương trong bảng giao cho nhiều đơn vị. */
  locality: boolean;
}

export interface TableLayout {
  headerRows: number[];
  /** Hàng đánh số cột "(1) (2) (3)" hoặc tiêu đề lặp lại: không phải dữ liệu. */
  skipRows: number[];
  columns: TableColumn[];
  kind: 'indicator' | 'task';
  /** Cột kế hoạch chính (bảng chỉ tiêu). */
  planColumn: number | null;
  numCols: number;
  inherited: boolean;
}

export interface TableRecord {
  kind: 'indicator' | 'task';
  row: number;
  /** Dòng của hàng đúng như bộ chia đoạn ghi vào đoạn: câu trích bám nguồn và định vị được. */
  line: string;
  ordinal: string | null;
  name: string;
  parentName: string | null;
  code: string | null;
  unit: string | null;
  targetValue: number | null;
  targetText: string | null;
  targetYear: number | null;
  direction: TargetDirection;
  actualValue: number | null;
  actualText: string | null;
  responsibleDepartmentName: string | null;
  coordinatingDepartments: string | null;
  deadline: string | null;
  frequency: TargetFrequency | null;
  description: string | null;
  /** Đề mục nhóm nằm trong bảng ("I. CHỈ TIÊU KINH TẾ"), từ ngoài vào trong. */
  groups: string[];
  confidence: number;
  fieldConfidence: Record<string, number>;
  warnings: string[];
}

export interface TableCarry {
  layout: TableLayout;
  groups: { rank: number; text: string }[];
}

export interface TableReading {
  layout: TableLayout | null;
  /** Có bố cục và đọc được phần lớn hàng dữ liệu: dùng kết quả của code, không gửi Qwen. */
  recognized: boolean;
  records: TableRecord[];
  /** Hàng có tên nhưng không đọc được giá trị: ghi chú cho người duyệt. */
  unread: { row: number; line: string; reason: string }[];
  rows: TableRowLine[];
  carry: TableCarry | null;
}

export interface TableReadOptions {
  format?: TableTextFormat;
  defaultYear?: number | null;
  /** Tên địa phương ("Lái Thiêu"): bảng giao cho nhiều đơn vị theo cột thì lấy cột của địa phương mình. */
  localityTerms?: string[];
  /** Bố cục và nhóm đang mở của bảng ngay trước (bảng nối sang trang sau không lặp hàng tiêu đề). */
  previous?: TableCarry | null;
}

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
const lower = (text: string) => text.normalize('NFC').toLowerCase();

function buildGrid(element: StructuredElement): string[][] | null {
  const table = element.table;
  if (!table || !table.numRows || !table.numCols) return null;
  const grid: string[][] = Array.from({ length: table.numRows }, () => Array.from({ length: table.numCols }, () => ''));
  for (const cell of table.cells) {
    if (cell.row >= 0 && cell.row < table.numRows && cell.col >= 0 && cell.col < table.numCols) grid[cell.row][cell.col] = squash(cell.text);
  }
  return grid;
}

function renderRow(cells: string[], format: TableTextFormat): string {
  return format === 'markdown'
    ? `| ${cells.map(cell => cell.replace(/\|/g, '/')).join(' | ')} |`
    : cells.filter(Boolean).join(' ');
}

/** Mỗi hàng của bảng thành một dòng chữ (ô cách nhau một khoảng trắng). Bộ chia đoạn và bộ đọc bảng dùng chung. */
export function renderTableRows(element: StructuredElement, format: TableTextFormat = 'plain'): TableRowLine[] {
  const grid = buildGrid(element);
  if (!grid) {
    return element.text.split('\n').map((text, row) => ({ row, text, header: false })).filter(line => line.text);
  }
  const headerRows = new Set<number>();
  for (const cell of element.table!.cells) if (cell.header) headerRows.add(cell.row);
  return grid
    .map((cells, row) => ({ row, text: renderRow(cells, format), header: headerRows.has(row) }))
    .filter(line => line.text.replace(/[|\s]/g, ''));
}

// ---------------------------------------------------------------------------
// Vai trò của cột theo chữ tiêu đề

const L = '(?<![\\p{L}\\d])';
const R = '(?![\\p{L}\\d])';
const re = (source: string) => new RegExp(source.replace(/«/g, L).replace(/»/g, R), 'u');

// Thứ tự là thứ tự ưu tiên: "Đơn vị tính" là đơn vị đo chứ không phải đơn vị chủ trì; "Thời gian thực hiện" là thời
// hạn chứ không phải kết quả thực hiện; "Chỉ tiêu Đảng ủy", "Chỉ tiêu năm 2026" là cột kế hoạch, "Chỉ tiêu" là cột tên.
const ROLE_PATTERNS: [TableColumnRole, RegExp][] = [
  ['ordinal', re('^(stt|tt|số tt|số thứ tự|thứ tự|số|no|#)$')],
  ['code', re('^mã»|mã (số|chỉ tiêu|ct)»')],
  ['unit', re('^(đơn vị tính|đvt|đv tính|đ\\.v\\.t|đơn vị đo|đơn vị)$|đơn vị tính|«đvt»')],
  ['coordinating', re('phối hợp')],
  ['frequency', re('tần suất|kỳ báo cáo|chu kỳ|chế độ báo cáo')],
  ['responsible', re('chủ trì|phụ trách|đầu mối|chịu trách nhiệm|phân công|(đơn vị|cơ quan|bộ phận|phòng|người|cán bộ|công chức)[^›]{0,25}(thực hiện|theo dõi|tham mưu|báo cáo|triển khai)')],
  ['deadline', re('thời (gian|hạn)|hạn (hoàn thành|chót|cuối)|tiến độ|hoàn thành trước|thời điểm|ngày hoàn thành|^hạn$')],
  ['note', re('ghi chú|diễn giải|giải trình|thuyết minh|chú thích')],
  ['basis', re('căn cứ|cơ sở pháp lý|văn bản (giao|chỉ đạo|quy định)')],
  ['product', re('sản phẩm|kết quả (đầu ra|cần đạt|dự kiến|mong đợi|yêu cầu)|^yêu cầu( cần đạt| kết quả| sản phẩm)?$|đầu ra')],
  ['ignore', re('kinh phí|dự toán|nguồn (vốn|kinh phí|số liệu|dữ liệu)|cách tính|phương pháp|công thức')],
  ['compare', re('so sánh|so với|t[ỷỉ] lệ (đạt|hoàn thành|thực hiện)|% *(đạt|so|hoàn thành|thực hiện)|(đạt|th ?/ ?kh) *\\(?%|tăng *[/,] *giảm|chênh lệch|mức độ hoàn thành|đánh giá|xếp loại|«th ?/ ?kh»')],
  ['actual', re('thực hiện|kết quả|l[ũu]y kế|luỹ kế|ước (đạt|tính|th)|đã đạt|đạt được|hiện trạng|hiện tại|hiện có|năm trước|cùng kỳ|số liệu (năm|hiện|nền|gốc)|«th *\\d{4}»|^th$')],
  ['plan', re('kế hoạch|«kh»|chỉ tiêu[^›]{0,40}(năm|giao|đảng ủy|đảng uỷ|đảng bộ|ubnd|hđnd|thành phố|«tp»|tỉnh|phấn đấu|nghị quyết|«nq»|\\d{4})|mục tiêu|phấn đấu|(thành phố|«tp»|tỉnh|trung ương|cấp trên|quận|huyện|thị xã)[^›]{0,10}giao|giao (năm|chỉ tiêu)|định mức|đến năm \\d{4}|^năm \\d{4}$|^\\d{4}$|nghị quyết|^số lượng$|khối lượng|^giá trị|^mức( phấn đấu)?$')],
  ['name', re('chỉ tiêu|nội dung|nhiệm vụ|tiêu chí|chỉ số|công việc|danh mục|hạng mục|^tên»|hoạt động|giải pháp|đề mục|việc cần làm|lĩnh vực')],
];

const HEADER_LABEL_MAX = 60;

function normalizeLabel(text: string): string {
  return lower(squash(text)).replace(/[*:.]+$/g, '').replace(/\s*›\s*/g, ' › ').trim();
}

/** Vai trò của một tiêu đề cột; null khi chữ không phải tiêu đề cột quen thuộc. */
export function headerRole(label: string): TableColumnRole | null {
  const normalized = normalizeLabel(label);
  if (!normalized || normalized.length > HEADER_LABEL_MAX * 2) return null;
  // "Thời gian › Bắt đầu" không phải thời hạn hoàn thành.
  if (/(^|› )(bắt đầu|khởi công|từ ngày)$/u.test(normalized)) return 'ignore';
  for (const [role, pattern] of ROLE_PATTERNS) if (pattern.test(normalized)) return role;
  return null;
}

const COLUMN_NUMBER = /^\(?(\d{1,2}|[a-zđA-ZĐ])\)?$|^\(?\d{1,2}\)?\s*=\s*[\d()+\-*/:x\s]+$/u;

function isColumnNumberRow(cells: string[]): boolean {
  const filled = cells.filter(Boolean);
  return filled.length >= 3 && filled.every(cell => COLUMN_NUMBER.test(cell));
}

function unitFromLabel(label: string): string | null {
  const match = /\(([^()]{1,24})\)\s*$/u.exec(label.trim());
  if (!match) return null;
  const inner = match[1].trim();
  if (!inner || /\d/.test(inner) || /nếu có|dự kiến|ước|tạm tính/iu.test(inner) || inner.split(/\s+/).length > 4) return null;
  // "Đơn vị tính: tỷ đồng", "ĐVT: %"
  return inner.replace(/^(đơn vị tính|đvt)\s*[:：]?\s*/iu, '').trim() || null;
}

function yearFromLabel(label: string): number | null {
  const match = /(?<!\d)((?:19|20)\d{2})(?!\d)/u.exec(label);
  return match ? Number(match[1]) : null;
}

interface HeaderFind {
  headerRows: number[];
  skipRows: number[];
  labels: string[];
}

function rowRoles(cells: string[]): (TableColumnRole | null)[] {
  return cells.map(cell => (cell && cell.length <= HEADER_LABEL_MAX ? headerRole(cell) : null));
}

function isHeaderRow(cells: string[]): boolean {
  const roles = rowRoles(cells).filter((role): role is TableColumnRole => role !== null && role !== 'ignore');
  const distinct = new Set(roles);
  if (distinct.size < 2) return false;
  if (distinct.has('name')) return true;
  return distinct.size >= 3 && (distinct.has('ordinal') || distinct.has('unit'));
}

const BARE_NUMBER = /^[<>≤≥=~]?\s*\d+(?:[.,]\d+)*\s*%?$/u;

function findHeader(grid: string[][], element: StructuredElement): HeaderFind | null {
  const limit = Math.min(grid.length, 20);
  let start = -1;
  for (let row = 0; row < limit; row += 1) {
    if (isHeaderRow(grid[row])) {
      start = row;
      break;
    }
  }
  if (start < 0) return null;
  const numCols = grid[start].length;
  const top = [...grid[start]];
  const rows = [start];
  const skipRows: number[] = [];
  // Tiêu đề gộp ngang ("Chỉ tiêu năm 2026" phủ hai cột con): chữ của ô gộp áp cho mọi cột nó phủ.
  const spanned = new Set<number>();
  for (const cell of element.table?.cells ?? []) {
    if (cell.row !== start) continue;
    const text = squash(cell.text);
    for (let col = cell.col; col < Math.min(numCols, cell.col + Math.max(1, cell.colSpan)); col += 1) {
      if (!top[col]) top[col] = text;
      if (cell.colSpan > 1) spanned.add(col);
    }
  }
  const labels = [...top];
  const anchorRoles = rowRoles(grid[start]);
  const fixedCols = new Set<number>();
  anchorRoles.forEach((role, col) => {
    if ((role === 'ordinal' || role === 'name') && !spanned.has(col)) fixedCols.add(col);
  });
  for (let row = start + 1; row < Math.min(grid.length, start + 4); row += 1) {
    const cells = grid[row];
    const filled = cells.map((cell, col) => (cell ? col : -1)).filter(col => col >= 0);
    if (!filled.length) continue;
    if (isColumnNumberRow(cells)) {
      skipRows.push(row);
      break;
    }
    // Hàng tiêu đề con: cột STT và cột tên để trống (đã gộp dọc), các ô còn lại là nhãn ngắn, không phải số liệu.
    const sub = filled.every(col => !fixedCols.has(col))
      && filled.every(col => cells[col].length <= 40 && (!BARE_NUMBER.test(cells[col]) || /^(19|20)\d{2}$/.test(cells[col])))
      && filled.some(col => /\p{L}/u.test(cells[col]) || /^(19|20)\d{2}$/.test(cells[col]));
    if (!sub) break;
    rows.push(row);
    // Bảng không có thông tin ô gộp (bảng OCR): nhãn tầng trên lan sang phải tới ô có chữ kế tiếp.
    let carried = '';
    for (let col = 0; col < numCols; col += 1) {
      if (grid[start][col]) carried = grid[start][col];
      const parent = top[col] || (cells[col] && !fixedCols.has(col) ? carried : '');
      if (cells[col]) labels[col] = parent && parent !== cells[col] ? `${parent} › ${cells[col]}` : cells[col];
      else if (!labels[col]) labels[col] = parent;
      if (cells[col] && !top[col]) top[col] = parent;
    }
  }
  return { headerRows: rows, skipRows, labels };
}

const DEPARTMENT_LIKE = /^(phòng|ban|văn phòng|công an|trạm|trung tâm|ubnd|ủy ban|uỷ ban|đảng ủy|đảng uỷ|mttq|mặt trận|hội|đoàn|tổ|khu phố|bộ phận|chi|đội|trường|bqh|quân sự|ban chỉ huy)/iu;

function bodyCells(grid: string[][], from: number, col: number): string[] {
  const values: string[] = [];
  for (let row = from; row < grid.length; row += 1) if (grid[row][col]) values.push(grid[row][col]);
  return values;
}

/** Cột mang giá trị: phần lớn ô có chữ số và ngắn. */
function looksLikeValueColumn(values: string[]): boolean {
  if (values.length < 2) return false;
  const valueLike = values.filter(value => /\d/.test(value) && value.length <= 40).length;
  return valueLike >= values.length * 0.6;
}

function looksLikeOrdinalColumn(values: string[]): boolean {
  if (values.length < 2) return false;
  const ordinalLike = values.filter(value => /^(\d{1,3}(\.\d{1,2}){0,2}[.)]?|[IVXLC]{1,6}[.)]?|[a-zđA-ZĐ][.)]?|[-–+•*])$/u.test(value)).length;
  return ordinalLike >= values.length * 0.7;
}

function planScore(column: TableColumn, docYear: number | null, maxYear: number | null): number {
  const label = lower(column.label);
  const leaf = label.split(' › ').pop() ?? label;
  const year = docYear ?? maxYear;
  let score = 0;
  if (column.locality) score += 6;
  if (column.year && year) score += column.year === year ? 3 : column.year > year ? -2 : -4;
  if (/cả năm|^năm$|^tổng( số| cộng)?$/u.test(leaf)) score += 2;
  if (/quý|tháng|giai đoạn|nhiệm kỳ|đợt/u.test(leaf) && !/cả năm/u.test(leaf)) score -= 3;
  if (/điều chỉnh/u.test(label)) score += 1;
  if (/kế hoạch/u.test(label)) score += 1;
  return score;
}

function classifyColumns(grid: string[][], header: HeaderFind, firstBody: number, options: TableReadOptions): TableLayout | null {
  const numCols = grid[0]?.length ?? 0;
  const localityTerms = (options.localityTerms ?? []).map(term => lower(squash(term))).filter(term => term.length >= 3);
  const columns: TableColumn[] = header.labels.map((label, index) => {
    const normalized = normalizeLabel(label);
    const locality = Boolean(normalized) && localityTerms.some(term => normalized.includes(term));
    let role: TableColumnRole = locality ? 'plan' : headerRole(label) ?? 'other';
    const values = bodyCells(grid, firstBody, index);
    // "Đơn vị" đứng một mình: đơn vị tính hay đơn vị chủ trì tuỳ nội dung cột.
    if (role === 'unit' && /^đơn vị$/u.test(normalized) && values.length
      && values.filter(value => DEPARTMENT_LIKE.test(value)).length >= values.length * 0.5) role = 'responsible';
    return { index, role, label: squash(label), year: yearFromLabel(label), unitHint: unitFromLabel(label), locality };
  });
  const byRole = (role: TableColumnRole) => columns.filter(column => column.role === role);

  // Hai cột cùng được nhận là "tên" ("Nội dung" và "Chỉ tiêu"): cột mang giá trị là cột kế hoạch.
  for (const column of byRole('name').slice(1)) {
    if (looksLikeValueColumn(bodyCells(grid, firstBody, column.index))) column.role = 'plan';
  }
  // Cột kế hoạch toàn chữ, bảng chưa có cột tên ("Mục tiêu, nhiệm vụ"): đó là cột tên.
  if (!byRole('name').length) {
    const texty = byRole('plan').find(column => !looksLikeValueColumn(bodyCells(grid, firstBody, column.index)));
    if (texty) texty.role = 'name';
  }
  if (!byRole('name').length) {
    // Tiêu đề cột tên bị bỏ trống hoặc đọc sai: lấy cột chưa rõ vai trò có chữ dài nhất.
    const candidates = byRole('other')
      .map(column => ({ column, values: bodyCells(grid, firstBody, column.index) }))
      .filter(entry => entry.values.length >= 2 && !looksLikeValueColumn(entry.values))
      .map(entry => ({ column: entry.column, average: entry.values.reduce((sum, value) => sum + value.length, 0) / entry.values.length }))
      .sort((a, b) => b.average - a.average);
    if (candidates[0] && candidates[0].average >= 12) candidates[0].column.role = 'name';
  }
  const names = byRole('name');
  if (!names.length) return null;
  // Nhiều cột tên: cột chính là cột có nhiều ô có chữ nhất, các cột còn lại coi là thông tin thêm.
  if (names.length > 1) {
    const primary = [...names].sort((a, b) => bodyCells(grid, firstBody, b.index).length - bodyCells(grid, firstBody, a.index).length || a.index - b.index)[0];
    for (const column of names) if (column !== primary) column.role = 'other';
  }
  if (!byRole('ordinal').length && columns[0] && columns[0].role === 'other' && looksLikeOrdinalColumn(bodyCells(grid, firstBody, 0))) {
    columns[0].role = 'ordinal';
  }
  const docYear = options.defaultYear ?? null;
  const years = byRole('plan').map(column => column.year).filter((year): year is number => year !== null);
  const maxYear = years.length ? Math.max(...years) : null;
  // Cột "Năm 2025" đứng cạnh "Năm 2026": số của năm trước là số đã thực hiện, không phải kế hoạch.
  for (const column of byRole('plan')) {
    const reference = docYear ?? maxYear;
    if (column.year && reference && column.year < reference && !column.locality
      && byRole('plan').some(other => other !== column && (other.year ?? reference) >= reference)) column.role = 'actual';
  }
  let plans = byRole('plan');
  if (!plans.length) {
    // Không nhận ra cột kế hoạch (tiêu đề lạ hoặc OCR sai): cột giá trị duy nhất chưa rõ vai trò là cột kế hoạch.
    const numeric = byRole('other').filter(column => looksLikeValueColumn(bodyCells(grid, firstBody, column.index)));
    if (numeric.length === 1 && (byRole('unit').length || !byRole('actual').length)) numeric[0].role = 'plan';
    plans = byRole('plan');
  }
  const hasTaskColumns = byRole('responsible').length > 0 || byRole('deadline').length > 0;
  let kind: TableLayout['kind'];
  let planColumn: number | null = null;
  if (plans.length) {
    kind = 'indicator';
    const ranked = plans
      .map(column => ({ column, score: planScore(column, docYear, maxYear) }))
      .sort((a, b) => b.score - a.score || a.column.index - b.column.index);
    planColumn = ranked[0].column.index;
  } else if (hasTaskColumns) {
    kind = 'task';
  } else {
    return null;
  }
  return { headerRows: header.headerRows, skipRows: header.skipRows, columns, kind, planColumn, numCols, inherited: false };
}

/** Bố cục của bảng (hàng tiêu đề và vai trò từng cột); null khi không nhận ra. */
export function detectTableLayout(element: StructuredElement, options: TableReadOptions = {}): TableLayout | null {
  const grid = buildGrid(element);
  if (!grid || grid.length < 2) return null;
  const header = findHeader(grid, element);
  if (!header) return null;
  const firstBody = Math.max(...header.headerRows, ...header.skipRows) + 1;
  return classifyColumns(grid, header, firstBody, options);
}

// ---------------------------------------------------------------------------
// Đọc số, đơn vị, thời hạn, kỳ báo cáo trong ô

const NUMBER = String.raw`\d{1,3}(?:[.  ]\d{3})+(?:,\d+)?(?![\d])|\d{1,3}(?:,\d{3}){2,}(?:\.\d+)?|\d+(?:[.,]\d+)?`;

/** "1.133" → 1133; "12,1" → 12.1; "0.95" → 0.95; "1.408,701" → 1408.701; "1,408,701" → 1408701. */
export function parseNumberToken(token: string): number | null {
  const compact = token.replace(/[  ]/g, '');
  if (!/^\d/.test(compact)) return null;
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(compact)) normalized = compact.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3}){2,}(\.\d+)?$/.test(compact)) normalized = compact.replace(/,/g, '');
  else if (/^\d+,\d+$/.test(compact)) normalized = compact.replace(',', '.');
  else normalized = compact;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

const KNOWN_UNITS = [
  '%', '‰', 'tỷ đồng', 'triệu đồng', 'nghìn đồng', 'ngàn đồng', 'tỷ usd', 'triệu usd', 'usd/người', 'triệu đồng/người',
  'tỷ', 'triệu', 'đồng', 'usd', 'người', 'hộ dân', 'hộ', 'vụ việc', 'vụ', 'cây xanh', 'cây', 'công trình', 'dự án',
  'tuyến đường', 'tuyến', 'điểm', 'trường', 'lớp', 'cơ sở', 'doanh nghiệp', 'sản phẩm', 'mô hình', 'chương trình', 'đợt',
  'cuộc', 'buổi', 'lượt người', 'lượt', 'hồ sơ', 'văn bản', 'héc ta', 'ha', 'km', 'm2/người', 'm²/người', 'm2', 'm²', 'm3',
  'căn', 'tấn', 'khu phố', 'phòng học', 'phòng', 'giường bệnh', 'giường', 'bác sĩ', 'thanh niên', 'đảng viên', 'chi bộ',
  'tổ chức', 'lần', 'ca', 'trạm', 'nhà', 'xã', 'phường', 'lao động', 'việc làm', 'học sinh', 'giáo viên', 'trẻ', 'em',
  'tin bài', 'tin', 'bài', 'kwh', 'mw', 'lít', 'kg', 'thủ tục', 'dịch vụ', 'tài khoản', 'camera', 'thiết bị', 'ngày', 'giờ',
].sort((a, b) => b.length - a.length);

const UNIT_STOPWORDS = new Set(['hoặc', 'và', 'so', 'trở', 'của', 'trên', 'theo', 'trong', 'là', 'không', 'các', 'đến', 'tới', 'với', 'cho', 'để', 'được', 'đạt', 'vào', 'từ', 'năm', 'quý', 'tháng', 'hoàn', 'thì', 'mỗi']);

/** Đơn vị đứng ngay sau con số trong ô: "%", "tỷ", "khu phố"… */
export function leadingUnit(text: string): string | null {
  const rest = text.replace(/^[\s)]+/u, '');
  if (!rest) return null;
  const head = lower(rest);
  for (const unit of KNOWN_UNITS) {
    if (head.startsWith(unit) && !/[\p{L}\d]/u.test(head.charAt(unit.length) || ' ')) return rest.slice(0, unit.length).trim();
  }
  const word = /^(\p{L}[\p{L}\d/²³]{0,11})(?![\p{L}\d])/u.exec(rest)?.[1];
  if (word && !UNIT_STOPWORDS.has(lower(word))) return word;
  return null;
}

export interface PlanValue {
  value: number | null;
  upper: number | null;
  unit: string | null;
  operator: 'gte' | 'lte' | 'range' | 'eq' | null;
  direction: TargetDirection | null;
}

const EMPTY_CELL = /^(?:[-–—.…x/\s]*|không(?: có)?|chưa có|n\/a)$/iu;

function maskNonValues(text: string): string {
  const blank = (match: string) => ' '.repeat(match.length);
  return text
    .replace(/\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*(?:19|20)\d{2}/gu, blank)
    .replace(/(?:ngày|trước|đến|hết)\s+\d{1,2}\s*[/-]\s*\d{1,2}(?![\d,.%])/giu, blank)
    .replace(/(?<![\d.,])(?:3|6|9|12)\s*tháng(?![\p{L}])/giu, blank)
    .replace(/(?:tháng|quý)\s*(?:\d{1,2}|[IVX]{1,4})(?:\s*[/-]\s*(?:19|20)\d{2})?(?![\d,.%])/giu, blank)
    .replace(/(?<![\d.,])(?:19|20)\d{2}\s*[:：]/gu, blank)
    .replace(/(?:năm|đến năm|hết năm|cuối năm|đầu năm|so với năm|so với|so|giai đoạn|nhiệm kỳ|kỳ)\s+(?:19|20)\d{2}(?:\s*[-–]\s*(?:19|20)\d{2})?(?![\d,.])/giu, blank);
}

/** Đọc ô kế hoạch/thực hiện: "≥ 95", "Tăng 4-5%", "1.133 tỷ", "dưới 1,5%", "(Trên 95%)", "03 khu phố không ma túy". */
export function parsePlanCell(raw: string): PlanValue {
  const text = squash(raw).normalize('NFC');
  const empty: PlanValue = { value: null, upper: null, unit: null, operator: null, direction: null };
  if (!text || EMPTY_CELL.test(text)) return empty;
  const masked = maskNonValues(text);
  const tokens = [...masked.matchAll(new RegExp(NUMBER, 'gu'))];
  // "2026 đạt 95%": số năm đứng trước một con số khác và không kèm đơn vị thì không phải giá trị.
  const first = tokens.find((token, index) => !(/^(19|20)\d{2}$/.test(token[0]) && index < tokens.length - 1
    && !leadingUnit(text.slice((token.index ?? 0) + token[0].length)))) ?? null;
  const words = lower(text);
  const wordDirection = /(?<![\p{L}])(giảm|kéo giảm|hạn chế|không để|không vượt|không quá|tối đa|dưới|thấp hơn)(?![\p{L}])/u.test(words)
    ? TargetDirection.LOWER_IS_BETTER
    : /(?<![\p{L}])(tăng|đạt|duy trì|trên|ít nhất|tối thiểu|trở lên|hoàn thành)(?![\p{L}])/u.test(words) ? TargetDirection.HIGHER_IS_BETTER : null;
  if (!first) return { ...empty, direction: wordDirection };
  const value = parseNumberToken(first[0]);
  if (value === null) return { ...empty, direction: wordDirection };
  const start = first.index ?? 0;
  let end = start + first[0].length;
  let upper: number | null = null;
  let operator: PlanValue['operator'] = null;
  const range = new RegExp(`^\\s*%?\\s*(?:[-–—]|đến|tới)\\s*(${NUMBER})`, 'u').exec(masked.slice(end));
  if (range) {
    const second = parseNumberToken(range[1]);
    if (second !== null && second > value) {
      upper = second;
      operator = 'range';
      end += range[0].length;
    }
  }
  const before = lower(masked.slice(Math.max(0, start - 28), start)).replace(/[(\s]+$/u, '');
  const after = lower(masked.slice(end, end + 24));
  if (!operator) {
    if (/(≥|>=|=>|>|trên|từ|ít nhất|tối thiểu|không dưới|không thấp hơn|vượt|hơn)$/u.test(before) && !/(không (vượt|quá|cao hơn|lớn hơn)|thấp hơn|ít hơn)$/u.test(before)) operator = 'gte';
    else if (/(≤|<=|=<|<|dưới|không quá|tối đa|không vượt|không vượt quá|không cao hơn|không lớn hơn|thấp hơn|ít hơn|giảm còn|còn)$/u.test(before)) operator = 'lte';
    else if (/^\s*%?\s*trở lên/u.test(after)) operator = 'gte';
    else if (/^\s*%?\s*trở xuống/u.test(after)) operator = 'lte';
    else if (/=$/u.test(before)) operator = 'eq';
  }
  const unit = leadingUnit(text.slice(end));
  const direction = operator === 'gte' ? TargetDirection.HIGHER_IS_BETTER
    : operator === 'lte' ? TargetDirection.LOWER_IS_BETTER
      : wordDirection;
  return { value, upper, unit, operator, direction };
}

const LOWER_NAME = /(?<![\p{L}])(giảm(?!\s*nghèo)|kéo giảm|hạn chế|không quá|tối đa)(?![\p{L}])|hộ nghèo|cận nghèo|tai nạn|tội phạm|phạm pháp|tử vong|suy dinh dưỡng|thất nghiệp|ô nhiễm|bỏ học|nợ đọng|tồn đọng|trễ hạn|quá hạn|vi phạm|cháy nổ|ngộ độc|sinh con thứ|tệ nạn|tái nghiện|thất thoát/iu;

const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const iso = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const ROMAN_QUARTER: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 };

/** Thời hạn trong ô bảng: "30/6/2026", "trước 30/6", "Tháng 6/2026", "Quý II/2026", "6 tháng đầu năm". */
export function parseDeadlineCell(raw: string, defaultYear: number | null): string | null {
  const text = lower(squash(raw));
  if (!text) return null;
  const isoDate = /(?<!\d)((?:19|20)\d{2})-(\d{1,2})-(\d{1,2})(?!\d)/u.exec(text);
  if (isoDate) {
    const [year, month, day] = [Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3])];
    if (month >= 1 && month <= 12 && day >= 1 && day <= lastDay(year, month)) return iso(year, month, day);
  }
  const full = /(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*((?:19|20)\d{2})/u.exec(text);
  if (full) {
    const [day, month, year] = [Number(full[1]), Number(full[2]), Number(full[3])];
    if (month >= 1 && month <= 12 && day >= 1 && day <= lastDay(year, month)) return iso(year, month, day);
  }
  const yearInText = /(?<!\d)((?:19|20)\d{2})(?!\d)/u.exec(text);
  const year = yearInText ? Number(yearInText[1]) : defaultYear;
  if (!year) return null;
  const quarter = /quý\s*(iv|iii|ii|i|[1-4])(?![\p{L}\d])/u.exec(text);
  if (quarter) {
    const number = ROMAN_QUARTER[quarter[1]] ?? Number(quarter[1]);
    return iso(year, number * 3, lastDay(year, number * 3));
  }
  if (/6 tháng đầu năm|sáu tháng đầu năm/u.test(text)) return iso(year, 6, 30);
  const month = /tháng\s*(\d{1,2})(?!\d)/u.exec(text);
  if (month && Number(month[1]) >= 1 && Number(month[1]) <= 12) return iso(year, Number(month[1]), lastDay(year, Number(month[1])));
  const short = /(?<![\d/])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/])/u.exec(text);
  if (short) {
    const [day, monthNumber] = [Number(short[1]), Number(short[2])];
    if (monthNumber >= 1 && monthNumber <= 12 && day >= 1 && day <= lastDay(year, monthNumber)) return iso(year, monthNumber, day);
  }
  return null;
}

/** Kỳ báo cáo trong ô bảng: "Tháng, quý, 6 tháng, năm" lấy kỳ dày nhất. */
export function parseFrequencyCell(raw: string): TargetFrequency | null {
  const text = lower(squash(raw));
  if (!text) return null;
  const withoutHalf = text.replace(/(6|9|sáu|chín)\s*tháng/gu, ' ');
  if (/tháng/u.test(withoutHalf)) return TargetFrequency.MONTHLY;
  if (/quý/u.test(withoutHalf)) return TargetFrequency.QUARTERLY;
  if (/(6|sáu)\s*tháng|nửa năm/u.test(text)) return TargetFrequency.SEMIANNUAL;
  if (/năm/u.test(withoutHalf)) return TargetFrequency.YEARLY;
  return null;
}

// ---------------------------------------------------------------------------
// Đọc từng hàng

type MarkerKind = 'roman' | 'upper' | 'arabic' | 'dotted' | 'lower' | 'dash' | 'plus';

interface Marker {
  kind: MarkerKind | null;
  value: string | null;
}

const NO_MARKER: Marker = { kind: null, value: null };
const VALID_ROMAN = /^(?=[IVX])(X{0,3})(IX|IV|V?I{0,3})$/u;

function markerOfCell(cell: string): Marker | null {
  const trimmed = cell.trim();
  const text = trimmed.replace(/[.)]+$/u, '').replace(/^\(/u, '').trim();
  if (!text) return null;
  if (/^[-–—]$/u.test(trimmed)) return { kind: 'dash', value: null };
  if (/^[+•*·]$/u.test(trimmed)) return { kind: 'plus', value: null };
  if (VALID_ROMAN.test(text)) return { kind: 'roman', value: text };
  if (/^\d{1,3}$/u.test(text)) return { kind: 'arabic', value: text };
  if (/^\d{1,3}(\.\d{1,2}){1,2}$/u.test(text)) return { kind: 'dotted', value: text };
  if (/^[a-zđ]$/u.test(text)) return { kind: 'lower', value: text };
  if (/^[A-ZĐ]$/u.test(text)) return { kind: 'upper', value: text };
  return null;
}

function markerOfName(name: string): { marker: Marker; rest: string } {
  const patterns: [MarkerKind, RegExp, boolean][] = [
    ['dash', /^[-–—]\s*(?=\S)/u, false],
    ['plus', /^[+•*·]\s*(?=\S)/u, false],
    ['dotted', /^(\d{1,3}(?:\.\d{1,2}){1,2})\.?\s+(?=\S)/u, true],
    ['arabic', /^(\d{1,3})[.)]\s+(?=\S)/u, true],
    ['arabic', /^\((\d{1,3})\)\s*(?=\S)/u, true],
    ['roman', /^([IVX]{1,5})[.)]\s+(?=\S)/u, true],
    ['lower', /^([a-zđ])[.)]\s+(?=\S)/u, true],
    ['upper', /^([A-ZĐ])[.)]\s+(?=\p{Lu})/u, true],
  ];
  for (const [kind, pattern, hasValue] of patterns) {
    const match = pattern.exec(name);
    if (!match) continue;
    if (kind === 'roman' && !VALID_ROMAN.test(match[1])) continue;
    return { marker: { kind, value: hasValue ? match[1] : null }, rest: name.slice(match[0].length).trim() };
  }
  return { marker: NO_MARKER, rest: name };
}

function mostlyUppercase(text: string): boolean {
  const letters = [...text.replace(/[^\p{L}]/gu, '')];
  if (letters.length < 6) return false;
  const upperCount = letters.filter(char => char === char.toUpperCase() && char !== char.toLowerCase()).length;
  return upperCount >= letters.length * 0.7;
}

function limit(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function sameText(a: string, b: string): boolean {
  return lower(a).replace(/[^\p{L}\d]/gu, '') === lower(b).replace(/[^\p{L}\d]/gu, '');
}

// Cấp đề mục nhóm trong bảng: "A." ngoài cùng, rồi "I.", rồi dòng viết hoa không đánh số, rồi "1." viết hoa.
const GROUP_RANK: Record<string, number> = { upper: 1, roman: 2, none: 3, arabic: 4, dotted: 5 };
// Cấp lồng nhau của hàng dữ liệu: "9" → "9.1" → "a)" → "-" → "+". Hàng cấp sâu hơn là thành phần của hàng phía trên.
const ROW_RANK: Record<MarkerKind, number> = { arabic: 0, roman: 0, upper: 0, dotted: 1, lower: 3, dash: 4, plus: 5 };

interface OpenRow {
  rank: number;
  name: string;
  hasValue: boolean;
  children: number;
  row: number;
  line: string;
  /** Hàng đáng báo cho người duyệt nếu không đọc được giá trị (hàng đánh số hoặc hàng cấp cao nhất). */
  report: boolean;
}

/**
 * Đọc một bảng thành các bản ghi chỉ tiêu (hoặc nhiệm vụ). `recognized` = false thì kết quả không đủ tin: bảng đi
 * đường Qwen như trước.
 */
export function readTable(element: StructuredElement, options: TableReadOptions = {}): TableReading {
  const format = options.format ?? 'plain';
  const rows = renderTableRows(element, format);
  const none: TableReading = { layout: null, recognized: false, records: [], unread: [], rows, carry: null };
  const grid = buildGrid(element);
  if (!grid || !grid.length) return none;
  const numCols = grid[0].length;

  let detected = detectTableLayout(element, options);
  let groups: { rank: number; text: string }[] = [];
  if (!detected && options.previous && options.previous.layout.numCols === numCols) {
    // Bảng nối trang không lặp hàng tiêu đề: dùng bố cục và nhóm đang mở của bảng ngay trước.
    detected = { ...options.previous.layout, headerRows: [], skipRows: [], inherited: true };
    groups = options.previous.groups.map(group => ({ ...group }));
  }
  if (!detected) return none;
  const layout = detected;

  const columnOf = (role: TableColumnRole) => layout.columns.find(item => item.role === role)?.index ?? null;
  const columnsOf = (role: TableColumnRole) => layout.columns.filter(item => item.role === role);
  const ordinalCol = columnOf('ordinal');
  const nameCol = columnOf('name');
  if (nameCol === null) return none;
  const codeCol = columnOf('code');
  const unitCol = columnOf('unit');
  const plans = columnsOf('plan');
  const primaryPlan = layout.planColumn !== null ? layout.columns[layout.planColumn] : null;
  const cumulative = (label: string) => Number(/l[ũu]y kế|luỹ kế|hiện tại/iu.test(label));
  const actualCol = [...columnsOf('actual')].sort((a, b) => cumulative(b.label) - cumulative(a.label) || (b.year ?? 0) - (a.year ?? 0) || b.index - a.index)[0] ?? null;
  const attributeRoles: TableColumnRole[] = ['responsible', 'coordinating', 'deadline', 'frequency', 'unit'];

  // Ô gộp dọc ("Phòng Kinh tế" phủ ba hàng): mọi hàng trong vùng gộp dùng chung giá trị, chỉ với cột thuộc tính.
  const filled = grid.map(cells => [...cells]);
  for (const cell of element.table?.cells ?? []) {
    if (cell.rowSpan <= 1 || !squash(cell.text)) continue;
    const role = layout.columns[cell.col]?.role;
    if (!role || !attributeRoles.includes(role)) continue;
    for (let row = cell.row + 1; row < Math.min(grid.length, cell.row + cell.rowSpan); row += 1) {
      if (!filled[row][cell.col]) filled[row][cell.col] = squash(cell.text);
    }
  }

  const lineOf = new Map(rows.map(line => [line.row, line.text]));
  const headerTexts = layout.headerRows.map(row => grid[row].filter(Boolean).join(' '));
  const skip = new Set([...layout.headerRows, ...layout.skipRows]);
  const firstBody = skip.size ? Math.max(...skip) + 1 : 0;
  const records: TableRecord[] = [];
  const unread: TableReading['unread'] = [];
  const open: OpenRow[] = [];
  const valueColumns = layout.columns.filter(item => ['plan', 'actual', 'compare'].includes(item.role)).map(item => item.index);
  const missingReason = layout.kind === 'task' ? 'không có đơn vị thực hiện và thời hạn' : 'không có giá trị kế hoạch';

  const closeFrom = (rank: number) => {
    while (open.length && open[open.length - 1].rank >= rank) {
      const closed = open.pop()!;
      if (!closed.hasValue && !closed.children && closed.report) unread.push({ row: closed.row, line: closed.line, reason: missingReason });
    }
  };
  let lastRecord: TableRecord | null = null;
  const pushGroup = (rank: number, text: string) => {
    closeFrom(0);
    lastRecord = null;
    while (groups.length && groups[groups.length - 1].rank >= rank) groups.pop();
    groups.push({ rank, text: limit(text, 200) });
  };
  const markerOfRow = (row: number): Marker => {
    const fromCell = ordinalCol !== null ? markerOfCell(grid[row][ordinalCol]) : null;
    if (fromCell) return fromCell;
    return grid[row][nameCol] ? markerOfName(grid[row][nameCol]).marker : NO_MARKER;
  };
  /** Hàng có chữ kế tiếp là hàng thành phần ("-", "+", "a)"): hàng hiện tại là hàng cha chứ không phải đề mục nhóm. */
  const nextIsComponent = (row: number): boolean => {
    for (let next = row + 1; next < grid.length; next += 1) {
      if (skip.has(next) || !grid[next].some(Boolean)) continue;
      const kind = markerOfRow(next).kind;
      return kind === 'dash' || kind === 'plus' || kind === 'lower';
    }
    return false;
  };

  for (let row = firstBody; row < grid.length; row += 1) {
    if (skip.has(row)) continue;
    const raw = grid[row];
    const cells = filled[row];
    const filledCols = raw.map((cell, col) => (cell ? col : -1)).filter(col => col >= 0);
    if (!filledCols.length) continue;
    const line = lineOf.get(row) ?? renderRow(raw, format);
    // Hàng tiêu đề lặp lại ở đầu trang sau, hàng đánh số cột.
    if (headerTexts.some(text => text && sameText(text, raw.filter(Boolean).join(' '))) || isColumnNumberRow(raw)) continue;
    if (isHeaderRow(raw) && raw.filter(Boolean).every(cell => cell.length <= HEADER_LABEL_MAX && !BARE_NUMBER.test(cell))) continue;

    const ordinalCell = ordinalCol !== null ? raw[ordinalCol] : '';
    let nameText = raw[nameCol];
    let marker: Marker = markerOfCell(ordinalCell) ?? NO_MARKER;
    if (!marker.kind && nameText) {
      const fromName = markerOfName(nameText);
      if (fromName.marker.kind) {
        marker = fromName.marker;
        nameText = fromName.rest;
      }
    }

    // Hàng chỉ có một ô chữ (ô gộp ngang cả bảng): đề mục nhóm, ghi chú cuối bảng, hoặc phần tên bị tách dòng.
    if (filledCols.length === 1) {
      const only = raw[filledCols[0]];
      const inName = filledCols[0] === nameCol;
      if (/^(ghi chú|chú thích|\(\*\)|\*|nguồn)\s*[:：]?/iu.test(only)) continue;
      if (inName && !marker.kind && /^\p{Ll}/u.test(only)) {
        // Tên bị bộ đọc tách thành hai hàng: phần sau bắt đầu bằng chữ thường, nối vào hàng ngay trên.
        const target: { name: string } | null = lastRecord ?? open[open.length - 1] ?? null;
        if (target) target.name = limit(`${target.name} ${only}`, 250);
        continue;
      }
      if (!inName && filledCols[0] !== 0 && filledCols[0] !== ordinalCol) continue;
      if (!(inName && (marker.kind === 'arabic' || marker.kind === 'dotted' || marker.kind === 'dash' || marker.kind === 'plus' || marker.kind === 'lower' || (!marker.kind && nextIsComponent(row))))) {
        if (/\p{L}{3,}/u.test(only) && only.length <= 300) {
          const parsed = markerOfName(only).marker;
          // Dòng gộp ngang cả bảng không đánh số ("Chỉ tiêu … không có trong Quyết định giao") mở một phần mới ở cấp
          // cao nhất; dòng không đánh số nằm trong cột tên là nhóm con của nhóm La Mã đang mở.
          pushGroup(parsed.kind && GROUP_RANK[parsed.kind] ? GROUP_RANK[parsed.kind] : inName ? GROUP_RANK.none : 0, only);
        }
        continue;
      }
    } else if (!nameText && ordinalCell && /\p{L}{3,}/u.test(ordinalCell) && !markerOfCell(ordinalCell)) {
      // Đề mục nhóm nằm ở cột STT (ô gộp bị bộ đọc tách), các cột giá trị để trống.
      if (!valueColumns.some(col => raw[col] && !EMPTY_CELL.test(raw[col]))) {
        const parsed = markerOfName(ordinalCell).marker;
        pushGroup(parsed.kind && GROUP_RANK[parsed.kind] ? GROUP_RANK[parsed.kind] : GROUP_RANK.none, ordinalCell);
      }
      continue;
    }
    if (!nameText || !/\p{L}{2,}/u.test(nameText)) continue;

    const attribute = (role: TableColumnRole, own = false) => {
      const index = columnOf(role);
      return index === null ? '' : (own ? raw : cells)[index];
    };
    const hasNumericValue = valueColumns.some(col => /\d/.test(raw[col] ?? ''));
    const hasAnyValue = valueColumns.some(col => raw[col] && !EMPTY_CELL.test(raw[col]));
    const ownUnit = unitCol !== null ? raw[unitCol] : '';
    const assigned = Boolean(attribute('responsible') || attribute('deadline') || attribute('coordinating'));
    const valued = layout.kind === 'indicator' ? hasAnyValue : assigned || Boolean(attribute('product', true));

    // Đề mục nhóm: không có giá trị, đánh số La Mã/chữ hoa, hoặc viết hoa toàn bộ.
    if (!hasAnyValue && !ownUnit && !attribute('responsible', true) && !attribute('deadline', true)) {
      const caps = mostlyUppercase(nameText);
      if (marker.kind === 'roman' || marker.kind === 'upper' || (caps && (marker.kind === null || marker.kind === 'arabic' || marker.kind === 'dotted'))) {
        pushGroup(GROUP_RANK[marker.kind ?? 'none'] ?? GROUP_RANK.none, marker.value ? `${marker.value}. ${nameText}` : nameText);
        continue;
      }
    }

    // Cấp của hàng. Hàng không đánh số nằm ngay dưới một hàng đánh số chưa có giá trị là thành phần của hàng đó.
    const top = open[open.length - 1];
    let rank: number;
    if (marker.kind === 'dotted') rank = (marker.value ?? '').split('.').length - 1;
    else if (marker.kind) rank = ROW_RANK[marker.kind];
    else rank = ordinalCol !== null && top && !top.hasValue && top.report && top.rank < ROW_RANK.dash ? ROW_RANK.dash : 0;
    closeFrom(rank);
    const parent = rank > 0 ? open[open.length - 1] ?? null : null;
    if (parent) parent.children += 1;
    const displayName = parent && !lower(nameText).includes(lower(parent.name))
      ? limit(`${parent.name} — ${nameText}`, 250)
      : limit(nameText, 250);
    const ordinal = marker.kind && marker.kind !== 'dash' && marker.kind !== 'plus' ? marker.value : null;
    const entry: OpenRow = { rank, name: displayName, hasValue: valued, children: 0, row, line, report: Boolean(ordinal) || rank === 0 };
    open.push(entry);
    if (!valued) {
      lastRecord = null;
      continue;
    }

    const warnings: string[] = [];
    const fieldConfidence: Record<string, number> = { name: 0.9, targetValue: 0.9, unit: 0.9, frequency: 0.3, deadline: 0.3, responsibleDepartment: 0.3 };
    let confidence = element.table?.gridFallback ? 0.75 : layout.inherited ? 0.85 : 0.9;
    const responsible = attribute('responsible') || null;
    const coordinating = attribute('coordinating') || null;
    if (responsible) fieldConfidence.responsibleDepartment = 0.9;
    const year = primaryPlan?.year ?? options.defaultYear ?? null;
    const deadlineText = attribute('deadline');
    const deadline = deadlineText ? parseDeadlineCell(deadlineText, year) : null;
    if (deadline) fieldConfidence.deadline = 0.85;
    const frequency = parseFrequencyCell(attribute('frequency'));
    if (frequency) fieldConfidence.frequency = 0.85;
    const note = attribute('note', true);
    const product = attribute('product', true);
    const code = codeCol !== null && raw[codeCol] && raw[codeCol].length <= 20 ? raw[codeCol] : null;
    const groupTexts = groups.map(group => group.text);
    const details: string[] = [];
    const actualText = actualCol ? raw[actualCol.index] : '';

    if (layout.kind === 'task') {
      if (nameText.length > 250) details.push(nameText);
      if (product) details.push(`Sản phẩm: ${product}`);
      if (deadlineText && !deadline) details.push(`Thời hạn: ${deadlineText}`);
      if (actualText) details.push(`Kết quả: ${actualText}`);
      if (note) details.push(`Ghi chú: ${note}`);
      warnings.push('Nhiệm vụ không có chỉ tiêu số: mục tiêu đặt là hoàn thành 100%, người duyệt chỉnh khi cần.');
      const task: TableRecord = {
        kind: 'task', row, line, ordinal, name: displayName, parentName: parent?.name ?? null, code, unit: '%', targetValue: 100,
        targetText: 'Hoàn thành', targetYear: year, direction: TargetDirection.HIGHER_IS_BETTER, actualValue: null, actualText: actualText || null,
        responsibleDepartmentName: responsible, coordinatingDepartments: coordinating, deadline, frequency,
        description: details.length ? limit(details.join('. '), 1000) : null, groups: groupTexts,
        confidence: responsible ? confidence : Math.min(confidence, 0.7),
        fieldConfidence: { ...fieldConfidence, targetValue: 0.5, unit: 0.5 }, warnings,
      };
      records.push(task);
      lastRecord = task;
      continue;
    }

    // Giá trị kế hoạch: cột chính; ô đó trống hoặc không có số thì lấy cột kế hoạch khác có số.
    const planCells = plans.map(item => ({ column: item, text: raw[item.index], parsed: parsePlanCell(raw[item.index]) }));
    let chosen = planCells.find(item => item.column.index === layout.planColumn) ?? null;
    if ((!chosen || chosen.parsed.value === null) && planCells.some(item => item.parsed.value !== null)) {
      const other = planCells.find(item => item.parsed.value !== null)!;
      if (chosen) {
        warnings.push(`Giá trị lấy ở cột "${other.column.label}" vì cột "${chosen.column.label}" ${chosen.text ? `ghi "${limit(chosen.text, 60)}"` : 'để trống'}.`);
        fieldConfidence.targetValue = 0.7;
      }
      chosen = other;
    }
    const usable = Boolean(chosen?.text && !EMPTY_CELL.test(chosen.text));
    if (!usable) {
      if (!hasNumericValue) {
        // Hàng chỉ có chữ ở cột thực hiện/ghi chú ("Đánh giá cuối năm"): không có gì để lập đề xuất.
        entry.hasValue = false;
        lastRecord = null;
        continue;
      }
      warnings.push('Hàng không có giá trị kế hoạch, chỉ có số thực hiện.');
      fieldConfidence.targetValue = 0.2;
      confidence = Math.min(confidence, 0.5);
    }
    const others = planCells.filter(item => item !== chosen && item.text && !EMPTY_CELL.test(item.text));
    if (usable && others.length) {
      details.push(...others.map(item => `${item.column.label}: ${item.text}`));
      fieldConfidence.targetValue = Math.min(fieldConfidence.targetValue, 0.75);
    }
    const plan: PlanValue = usable && chosen ? chosen.parsed : { value: null, upper: null, unit: null, operator: null, direction: null };
    if (usable && chosen && plan.value === null) {
      warnings.push(`Ô kế hoạch không có con số: "${limit(chosen.text, 80)}".`);
      fieldConfidence.targetValue = 0.3;
      confidence = Math.min(confidence, 0.6);
    }
    let unit: string | null = (unitCol !== null ? cells[unitCol] : '') || null;
    if (plan.unit) {
      const cellUnit = lower(plan.unit);
      if (!unit) unit = plan.unit;
      else if (KNOWN_UNITS.includes(cellUnit) && !lower(unit).includes(cellUnit) && !cellUnit.includes(lower(unit))) {
        warnings.push(`Cột đơn vị tính ghi "${unit}" nhưng ô kế hoạch ghi "${plan.unit}": lấy theo ô kế hoạch.`);
        unit = plan.unit;
        fieldConfidence.unit = 0.6;
      }
    }
    if (!unit && chosen?.column.unitHint) unit = chosen.column.unitHint;
    if (!unit) fieldConfidence.unit = 0.2;
    if (plan.operator === 'range' && chosen) details.unshift(`Khoảng kế hoạch: ${chosen.text}`);
    if (note) details.push(`Ghi chú: ${note}`);
    if (deadlineText && !deadline) details.push(`Thời hạn: ${deadlineText}`);
    const direction = plan.direction ?? (LOWER_NAME.test(nameText) ? TargetDirection.LOWER_IS_BETTER : TargetDirection.HIGHER_IS_BETTER);
    fieldConfidence.direction = plan.operator === 'gte' || plan.operator === 'lte' ? 0.9 : plan.direction ? 0.8 : 0.6;
    const actual = actualText ? parsePlanCell(actualText) : null;
    const record: TableRecord = {
      kind: 'indicator', row, line, ordinal, name: displayName, parentName: parent?.name ?? null, code, unit,
      targetValue: plan.value, targetText: usable && chosen ? limit(chosen.text, 200) : null,
      targetYear: (usable ? chosen?.column.year : null) ?? options.defaultYear ?? null, direction,
      actualValue: actual?.value ?? null, actualText: actualText || null,
      responsibleDepartmentName: responsible, coordinatingDepartments: coordinating, deadline, frequency,
      description: details.length ? limit(details.join('. '), 1000) : null, groups: groupTexts, confidence, fieldConfidence, warnings,
    };
    records.push(record);
    lastRecord = record;
  }
  closeFrom(0);

  // Phần lớn hàng không đọc được giá trị thì bố cục nhiều khả năng nhận sai: để Qwen đọc bảng này.
  const readable = records.filter(record => record.kind === 'task' || record.targetValue !== null).length;
  const recognized = readable > 0 && readable >= (records.length + unread.length) * 0.5;
  return { layout, recognized, records, unread, rows, carry: { layout, groups } };
}

// ---------------------------------------------------------------------------
// Cả văn bản: đọc mọi bảng theo thứ tự, rồi gắn bản ghi vào đoạn chứa hàng của nó

export interface PageElements {
  pageNumber: number;
  elements: StructuredElement[];
}

/** Đọc mọi bảng của văn bản theo thứ tự đọc; bảng nối trang kế thừa bố cục và nhóm của bảng ngay trước. */
export function readDocumentTables(pages: PageElements[], options: Omit<TableReadOptions, 'previous'> = {}): Map<string, TableReading> {
  const readings = new Map<string, TableReading>();
  let previous: TableCarry | null = null;
  for (const page of [...pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    for (const element of page.elements) {
      if (!element?.id) continue;
      if (element.type !== 'table') {
        // Có chữ chen giữa hai bảng (đề mục, đoạn văn): bảng sau là bảng mới, không kế thừa bố cục.
        if (element.type !== 'stamp' && /\p{L}{3,}/u.test(element.text ?? '')) previous = null;
        continue;
      }
      const reading = readTable(element, { ...options, previous });
      readings.set(element.id, reading);
      previous = reading.carry && (reading.recognized || reading.layout?.inherited) ? reading.carry : null;
    }
  }
  return readings;
}

export interface TableChunkRows {
  records: { record: TableRecord; position: number; line: string }[];
  unread: TableReading['unread'];
}

/**
 * Hàng của bảng nằm trong một đoạn: so từng dòng của phần thân đoạn với dòng của hàng, theo thứ tự hàng. `assigned`
 * giữ các hàng đã gắn cho đoạn trước (hàng tiêu đề lặp lại ở mọi đoạn chỉ gắn một lần).
 */
export function tableRowsInChunk(reading: TableReading, body: string, assigned: Set<number>): TableChunkRows {
  const recordByRow = new Map(reading.records.map(record => [record.row, record]));
  const unreadByRow = new Map(reading.unread.map(item => [item.row, item]));
  const result: TableChunkRows = { records: [], unread: [] };
  let offset = 0;
  for (const line of body.split('\n')) {
    const flat = squash(line);
    const match = flat ? reading.rows.find(row => !assigned.has(row.row) && squash(row.text) === flat) : undefined;
    if (match) {
      assigned.add(match.row);
      const record = recordByRow.get(match.row);
      if (record) result.records.push({ record, position: offset, line });
      const missing = unreadByRow.get(match.row);
      if (missing) result.unread.push(missing);
    }
    offset += line.length + 1;
  }
  return result;
}
