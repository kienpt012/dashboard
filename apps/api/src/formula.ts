// Tính chỉ tiêu từ công thức khai báo, có kiểm tra cấu trúc và giới hạn xử lý.
// Công thức chỉ là dữ liệu; không bao giờ thực thi mã do người dùng cung cấp.

export type ColumnType = 'text' | 'number' | 'date' | 'boolean' | 'enum';
export interface DatasetColumn {
  key: string;
  label: string;
  type: ColumnType;
  required?: boolean;
  options?: string[];
}
export type Row = Record<string, unknown>;
export type ConditionOp = 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'notEmpty' | 'isTrue' | 'isFalse';
export type Condition = [column: string, op: ConditionOp, value?: unknown];
export interface AggregateSpec {
  agg: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'countDistinct';
  dataset: string;
  column?: string;
  where?: Condition[];
  yearColumn?: string;
}
export type Expr = number | AggregateSpec
  | { op: 'ratio' | 'percent'; num: Expr; den: Expr }
  | { op: 'add' | 'sub' | 'mul' | 'min' | 'max'; args: Expr[] };
export type ScoreRule =
  | { type: 'linear'; max: number }
  | { type: 'capped'; max: number }
  | { type: 'threshold'; max: number; min: number; below?: 'linear' | 'zero' }
  | { type: 'steps'; steps: { gte: number; score: number }[]; otherwise?: number }
  | { type: 'binary'; max: number }
  | { type: 'band'; bands: { gte: number; score: number | 'r' | 'rmax' }[]; max: number; otherwise?: number };
export interface FormulaSpec { value: Expr; score?: ScoreRule; unit?: string; note?: string }
export interface AggregateTrace {
  dataset: string;
  agg: string;
  column?: string;
  matched: number;
  total: number;
  value: number | null;
}
export interface FormulaResult {
  value: number | null;
  score: number | null;
  traces: AggregateTrace[];
  warnings: string[];
}

type Validation<T> = { ok: true } & T | { ok: false; errors: string[] };
const columnTypes: readonly string[] = ['text', 'number', 'date', 'boolean', 'enum'];
const aggregates: readonly string[] = ['count', 'sum', 'avg', 'min', 'max', 'countDistinct'];
const conditionOps: readonly string[] = ['eq', 'ne', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'contains', 'notEmpty', 'isTrue', 'isFalse'];
const own = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const empty = (value: unknown): boolean => value == null || (typeof value === 'string' && value.trim() === '');
const fold = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim().replace(/\s+/g, ' ');

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Reflect.ownKeys(value).every(key => own(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value'));
}

function keysValid(value: Record<string, unknown>, allowed: readonly string[], errors: string[], context: string): boolean {
  const valid = Reflect.ownKeys(value).every(key => typeof key === 'string' && allowed.includes(key));
  if (!valid) errors.push(`${context} có thuộc tính không được phép.`);
  return valid;
}

function dateParts(year: number, month: number, day: number): string | undefined {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeDate(value: unknown): string | undefined {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? dateParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()) : undefined;
  }
  if (finite(value)) {
    if (value < 1 || value > 2958465) return undefined;
    const day = Math.floor(value);
    // Excel có ngày 29/02/1900 giả tại serial 60; không nhận ngày này.
    if (day === 60) return undefined;
    const date = new Date(Date.UTC(1899, 11, 31) + (day > 60 ? day - 1 : day) * 86400000);
    return dateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  if (typeof value !== 'string') return undefined;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (iso) return dateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const vn = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  return vn ? dateParts(Number(vn[3]), Number(vn[2]), Number(vn[1])) : undefined;
}

export function validateColumns(input: unknown): Validation<{ columns: DatasetColumn[] }> {
  const errors: string[] = [];
  if (!Array.isArray(input) || input.length < 1 || input.length > 40) {
    return { ok: false, errors: ['Danh sách phải có từ 1 đến 40 cột.'] };
  }
  const columns: DatasetColumn[] = [];
  const used = new Set<string>();
  for (const item of input) {
    if (!record(item)) { errors.push('Thông tin cột không hợp lệ.'); continue; }
    keysValid(item, ['key', 'label', 'type', 'required', 'options'], errors, 'Cột');
    if (typeof item.key !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(item.key)) {
      errors.push('Mã cột không đúng định dạng.'); continue;
    }
    if (used.has(item.key)) errors.push(`Mã cột «${item.key}» bị trùng.`);
    used.add(item.key);
    if (typeof item.label !== 'string' || item.label.trim().length < 1 || item.label.trim().length > 120) {
      errors.push(`Nhãn cột «${item.key}» phải có từ 1 đến 120 ký tự.`); continue;
    }
    if (typeof item.type !== 'string' || !columnTypes.includes(item.type)) {
      errors.push(`Kiểu cột «${item.label}» không hợp lệ.`); continue;
    }
    const column: DatasetColumn = { key: item.key, label: item.label.trim(), type: item.type as ColumnType };
    if (own(item, 'required')) {
      if (typeof item.required !== 'boolean') errors.push('Thuộc tính bắt buộc phải là giá trị đúng hoặc sai.');
      else column.required = item.required;
    }
    if (column.type === 'enum') {
      if (!Array.isArray(item.options) || item.options.length < 1 || item.options.length > 50) {
        errors.push(`Cột «${column.label}» phải có từ 1 đến 50 lựa chọn.`);
      } else {
        const options: string[] = [];
        const seen = new Set<string>();
        for (const option of item.options) {
          if (typeof option !== 'string' || !option.trim()) { errors.push('Lựa chọn phải là chuỗi không rỗng.'); continue; }
          const normalized = fold(option);
          if (seen.has(normalized)) errors.push(`Lựa chọn của cột «${column.label}» bị trùng.`);
          seen.add(normalized);
          options.push(option);
        }
        column.options = options;
      }
    } else if (own(item, 'options')) errors.push('Chỉ cột danh mục được khai báo lựa chọn.');
    columns.push(column);
  }
  return errors.length ? { ok: false, errors } : { ok: true, columns };
}

export function normalizeRow(columns: readonly DatasetColumn[], input: unknown): Validation<{ row: Row }> {
  if (!record(input)) return { ok: false, errors: ['Dữ liệu dòng phải là một đối tượng hợp lệ.'] };
  const errors: string[] = [];
  keysValid(input, columns.map(column => column.key), errors, 'Dữ liệu dòng');
  const entries: [string, unknown][] = [];
  for (const column of columns) {
    const value = own(input, column.key) ? input[column.key] : undefined;
    if (empty(value)) {
      if (column.required) errors.push(`Cột «${column.label}» là bắt buộc`);
      entries.push([column.key, null]);
      continue;
    }
    let normalized: unknown;
    switch (column.type) {
      case 'text':
        if (typeof value === 'string' && value.trim().length <= 2000) normalized = value.trim();
        break;
      case 'number': {
        if (finite(value)) normalized = value;
        else if (typeof value === 'string') {
          const text = value.trim().replace(/\s*%$/, '');
          if (/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(text)) {
            const number = Number(text.replace(/\./g, '').replace(',', '.'));
            if (finite(number)) normalized = number;
          }
        }
        break;
      }
      case 'date': normalized = normalizeDate(value); break;
      case 'boolean':
        if (typeof value === 'boolean') normalized = value;
        else if (value === 1 || value === 0) normalized = value === 1;
        else if (typeof value === 'string') {
          const text = fold(value);
          if (['co', 'x', 'da', 'yes', 'true', '1'].includes(text)) normalized = true;
          else if (['khong', 'chua', 'no', 'false', '0'].includes(text)) normalized = false;
        }
        break;
      case 'enum':
        if (typeof value === 'string') normalized = column.options?.find(option => fold(option) === fold(value));
        break;
    }
    if (normalized === undefined) errors.push(`Giá trị cột «${column.label}» không hợp lệ.`);
    else entries.push([column.key, normalized]);
  }
  return errors.length ? { ok: false, errors } : { ok: true, row: Object.fromEntries(entries) };
}

function validateScore(input: unknown, errors: string[]): ScoreRule | undefined {
  if (!record(input)) { errors.push('Quy tắc chấm điểm không hợp lệ.'); return undefined; }
  const type = input.type;
  if (type !== 'linear' && type !== 'capped' && type !== 'threshold' && type !== 'steps' && type !== 'binary' && type !== 'band') {
    errors.push('Loại chấm điểm không hợp lệ.'); return undefined;
  }
  const allowed = type === 'steps' ? ['type', 'steps', 'otherwise']
    : type === 'band' ? ['type', 'bands', 'max', 'otherwise']
      : type === 'threshold' ? ['type', 'max', 'min', 'below'] : ['type', 'max'];
  keysValid(input, allowed, errors, 'Quy tắc chấm điểm');
  if (type !== 'steps' && (!finite(input.max) || input.max <= 0 || input.max > 1000)) {
    errors.push('Điểm tối đa phải lớn hơn 0 và không vượt quá 1000.'); return undefined;
  }
  const max = input.max as number;
  if (type === 'threshold') {
    if (!finite(input.min)) { errors.push('Ngưỡng chấm điểm phải là số hữu hạn.'); return undefined; }
    if (own(input, 'below') && input.below !== 'linear' && input.below !== 'zero') {
      errors.push('Cách chấm dưới ngưỡng không hợp lệ.'); return undefined;
    }
    return { type, max, min: input.min, ...(own(input, 'below') ? { below: input.below as 'linear' | 'zero' } : {}) };
  }
  if (type === 'steps' || type === 'band') {
    const list = type === 'steps' ? input.steps : input.bands;
    if (!Array.isArray(list) || list.length < 1 || list.length > 20) {
      errors.push('Quy tắc chấm điểm phải có từ 1 đến 20 bậc.'); return undefined;
    }
    const bands: { gte: number; score: number | 'r' | 'rmax' }[] = [];
    for (const item of list) {
      if (!record(item)) { errors.push('Bậc chấm điểm không hợp lệ.'); continue; }
      keysValid(item, ['gte', 'score'], errors, 'Bậc chấm điểm');
      const validScore = finite(item.score) && item.score >= 0 && item.score <= 1000;
      if (!finite(item.gte) || (!validScore && !(type === 'band' && (item.score === 'r' || item.score === 'rmax')))) {
        errors.push('Ngưỡng hoặc điểm của bậc không hợp lệ.'); continue;
      }
      bands.push({ gte: item.gte, score: item.score as number | 'r' | 'rmax' });
    }
    if (own(input, 'otherwise') && (!finite(input.otherwise) || input.otherwise < 0 || input.otherwise > 1000)) {
      errors.push('Điểm mặc định phải từ 0 đến 1000.'); return undefined;
    }
    const otherwise = own(input, 'otherwise') ? { otherwise: input.otherwise as number } : {};
    return type === 'band' ? { type, max, bands, ...otherwise }
      : { type, steps: bands.map(item => ({ gte: item.gte, score: item.score as number })), ...otherwise };
  }
  return { type, max };
}

export function validateFormula(input: unknown, datasets: ReadonlyMap<string, readonly DatasetColumn[]>): Validation<{ formula: FormulaSpec }> {
  const errors: string[] = [];
  if (!record(input)) return { ok: false, errors: ['Công thức phải là một đối tượng hợp lệ.'] };
  keysValid(input, ['value', 'score', 'unit', 'note'], errors, 'Công thức');
  let nodes = 0;
  const parseCondition = (inputCondition: unknown, columns: readonly DatasetColumn[]): Condition | undefined => {
    if (!Array.isArray(inputCondition) || inputCondition.length < 2 || inputCondition.length > 3) {
      errors.push('Điều kiện lọc không hợp lệ.'); return undefined;
    }
    const [key, op, value] = inputCondition as unknown[];
    const column = columns.find(item => item.key === key);
    if (!column) { errors.push('Cột trong điều kiện lọc không tồn tại.'); return undefined; }
    if (typeof op !== 'string' || !conditionOps.includes(op)) { errors.push('Phép so sánh không hợp lệ.'); return undefined; }
    if (op === 'notEmpty' || op === 'isTrue' || op === 'isFalse') {
      if (inputCondition.length !== 2) errors.push('Điều kiện này không được có giá trị so sánh.');
      if (op !== 'notEmpty' && column.type !== 'boolean') errors.push('Điều kiện đúng hoặc sai chỉ áp dụng cho cột luận lý.');
      return [column.key, op];
    }
    const relational = ['gt', 'gte', 'lt', 'lte'].includes(op);
    if (relational && column.type !== 'number' && column.type !== 'date') errors.push('So sánh lớn nhỏ chỉ áp dụng cho cột số hoặc ngày.');
    if (op === 'contains' && column.type !== 'text') errors.push('Điều kiện chứa chỉ áp dụng cho cột văn bản.');
    const validValue = (value: unknown): boolean => {
      if (value === null) return !relational && op !== 'contains';
      if (column.type === 'number') return finite(value);
      if (column.type === 'boolean') return typeof value === 'boolean';
      if (column.type === 'date') return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && normalizeDate(value) === value;
      return typeof value === 'string';
    };
    if (op === 'in' || op === 'nin') {
      if (!Array.isArray(value) || value.length > 200) { errors.push('Danh sách so sánh phải là mảng không quá 200 phần tử.'); return undefined; }
      if (!Array.from(value).every(validValue)) errors.push('Giá trị so sánh không phù hợp với kiểu cột.');
      return [column.key, op, [...value]];
    }
    if (inputCondition.length !== 3 || !validValue(value)) errors.push('Giá trị so sánh không phù hợp với kiểu cột.');
    return [column.key, op as ConditionOp, value];
  };
  const parseExpr = (value: unknown, depth: number): Expr | undefined => {
    nodes++;
    if (depth > 8 || nodes > 64) { errors.push('Công thức vượt giới hạn 8 cấp hoặc 64 nút.'); return undefined; }
    if (finite(value)) return value;
    if (!record(value)) { errors.push('Biểu thức phải là số hữu hạn hoặc đối tượng hợp lệ.'); return undefined; }
    if (own(value, 'agg')) {
      keysValid(value, ['agg', 'dataset', 'column', 'where', 'yearColumn'], errors, 'Phép tổng hợp');
      if (typeof value.agg !== 'string' || !aggregates.includes(value.agg)) { errors.push('Phép tổng hợp không hợp lệ.'); return undefined; }
      if (typeof value.dataset !== 'string' || !datasets.has(value.dataset)) { errors.push('Bảng dữ liệu không tồn tại.'); return undefined; }
      const columns = datasets.get(value.dataset)!;
      const result: AggregateSpec = { agg: value.agg as AggregateSpec['agg'], dataset: value.dataset };
      if (own(value, 'column') || value.agg !== 'count') {
        const column = columns.find(column => column.key === value.column);
        if (!column) errors.push('Cột tổng hợp bị thiếu hoặc không tồn tại.');
        else {
          result.column = column.key;
          if (['sum', 'avg', 'min', 'max'].includes(value.agg) && column.type !== 'number') errors.push('Phép tổng hợp này yêu cầu cột kiểu số.');
        }
      }
      if (own(value, 'yearColumn')) {
        const column = columns.find(column => column.key === value.yearColumn);
        if (!column || column.type !== 'date') errors.push('Cột lọc năm phải tồn tại và có kiểu ngày.');
        else result.yearColumn = column.key;
      }
      if (own(value, 'where')) {
        if (!Array.isArray(value.where) || value.where.length > 12) errors.push('Bộ lọc phải là mảng không quá 12 điều kiện.');
        else {
          result.where = [];
          for (const condition of value.where) {
            const parsed = parseCondition(condition, columns);
            if (parsed) result.where.push(parsed);
          }
        }
      }
      return result;
    }
    if (value.op === 'ratio' || value.op === 'percent') {
      keysValid(value, ['op', 'num', 'den'], errors, 'Biểu thức tỷ lệ');
      const num = parseExpr(value.num, depth + 1);
      const den = parseExpr(value.den, depth + 1);
      return num !== undefined && den !== undefined ? { op: value.op, num, den } : undefined;
    }
    if (value.op === 'add' || value.op === 'sub' || value.op === 'mul' || value.op === 'min' || value.op === 'max') {
      keysValid(value, ['op', 'args'], errors, 'Biểu thức số học');
      if (!Array.isArray(value.args) || value.args.length < 2 || value.args.length > 63 || (value.op === 'sub' && value.args.length !== 2)) {
        errors.push('Số lượng đối số không hợp lệ; phép trừ cần đúng 2 đối số.'); return undefined;
      }
      const args: Expr[] = [];
      for (const arg of value.args) {
        if (nodes >= 64) { errors.push('Công thức vượt giới hạn 64 nút.'); break; }
        const parsed = parseExpr(arg, depth + 1);
        if (parsed !== undefined) args.push(parsed);
      }
      return { op: value.op, args };
    }
    errors.push('Phép tính không hợp lệ.'); return undefined;
  };
  const value = parseExpr(input.value, 1);
  const score = own(input, 'score') ? validateScore(input.score, errors) : undefined;
  for (const key of ['unit', 'note']) {
    if (own(input, key) && typeof input[key] !== 'string') errors.push('Đơn vị và ghi chú phải là chuỗi.');
  }
  if (errors.length || value === undefined) return { ok: false, errors };
  return { ok: true, formula: {
    value, ...(score ? { score } : {}),
    ...(own(input, 'unit') ? { unit: input.unit as string } : {}),
    ...(own(input, 'note') ? { note: input.note as string } : {}),
  } };
}

export function datasetsReferenced(formula: FormulaSpec): string[] {
  const datasets = new Set<string>();
  const visit = (expr: Expr): void => {
    if (typeof expr === 'number') return;
    if ('agg' in expr) datasets.add(expr.dataset);
    else if ('args' in expr) expr.args.forEach(visit);
    else { visit(expr.num); visit(expr.den); }
  };
  visit(formula.value);
  return [...datasets].sort();
}

export function applyScore(rule: ScoreRule, r: number): number {
  switch (rule.type) {
    case 'linear': return Math.min(rule.max, Math.max(0, r * rule.max));
    case 'capped': return Math.min(1, Math.max(0, r)) * rule.max;
    case 'binary': return r > 0 ? rule.max : 0;
    case 'threshold': return r >= rule.min ? rule.max : rule.below === 'zero' ? 0 : r * rule.max;
    case 'steps': return [...rule.steps].sort((a, b) => b.gte - a.gte).find(step => r >= step.gte)?.score ?? rule.otherwise ?? 0;
    case 'band': {
      const band = [...rule.bands].sort((a, b) => b.gte - a.gte).find(band => r >= band.gte);
      return !band ? rule.otherwise ?? 0 : band.score === 'r' ? r : band.score === 'rmax' ? r * rule.max : band.score;
    }
  }
}

function matches(row: Row, [key, op, value]: Condition): boolean {
  const actual = own(row, key) ? row[key] : undefined;
  const equal = (a: unknown, b: unknown): boolean => typeof a === 'string' && typeof b === 'string' ? fold(a) === fold(b) : a === b;
  switch (op) {
    case 'eq': return equal(actual, value);
    case 'ne': return !equal(actual, value);
    case 'in': return Array.isArray(value) && value.some(item => equal(actual, item));
    case 'nin': return Array.isArray(value) && !value.some(item => equal(actual, item));
    case 'contains': return typeof actual === 'string' && typeof value === 'string' && fold(actual).includes(fold(value));
    case 'notEmpty': return !empty(actual);
    case 'isTrue': return actual === true;
    case 'isFalse': return actual === false;
    default: {
      if (!((finite(actual) && finite(value)) || (typeof actual === 'string' && typeof value === 'string'))) return false;
      if (op === 'gt') return actual > value;
      if (op === 'gte') return actual >= value;
      if (op === 'lt') return actual < value;
      return actual <= value;
    }
  }
}

export function evaluateFormula(formula: FormulaSpec, getRows: (dataset: string) => readonly Row[], options?: { year?: number }): FormulaResult {
  const traces: AggregateTrace[] = [];
  const warnings: string[] = [];
  const checked = (value: number | null): number | null => {
    if (value === null || finite(value)) return value;
    warnings.push('Kết quả vượt phạm vi số hữu hạn.');
    return null;
  };
  const evaluate = (expr: Expr): number | null => {
    if (typeof expr === 'number') return checked(expr);
    if ('agg' in expr) {
      const rows = getRows(expr.dataset);
      const matched = rows.filter(row => {
        if (expr.yearColumn && options?.year !== undefined) {
          const date = own(row, expr.yearColumn) ? row[expr.yearColumn] : undefined;
          if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || normalizeDate(date) !== date || Number(date.slice(0, 4)) !== options.year) return false;
        }
        return expr.where?.every(condition => matches(row, condition)) ?? true;
      });
      const values = matched.map(row => expr.column !== undefined && own(row, expr.column) ? row[expr.column] : undefined);
      const numbers = values.filter(finite);
      let value: number | null;
      switch (expr.agg) {
        case 'count': value = matched.length; break;
        case 'countDistinct': value = new Set(values.filter(value => !empty(value)).map(value => typeof value === 'string' ? value.trim().toLowerCase() : value)).size; break;
        case 'sum': value = numbers.reduce((sum, number) => sum + number, 0); break;
        case 'avg': value = numbers.length ? numbers.reduce((sum, number) => sum + number / numbers.length, 0) : null; break;
        case 'min': value = numbers.length ? numbers.reduce((min, number) => Math.min(min, number)) : null; break;
        case 'max': value = numbers.length ? numbers.reduce((max, number) => Math.max(max, number)) : null; break;
      }
      value = checked(value);
      traces.push({ dataset: expr.dataset, agg: expr.agg, ...(expr.column !== undefined ? { column: expr.column } : {}), matched: matched.length, total: rows.length, value });
      return value;
    }
    if ('args' in expr) {
      const values = expr.args.map(evaluate);
      const numbers = values.filter((value): value is number => value !== null);
      if (expr.op === 'min' || expr.op === 'max') {
        if (!numbers.length) return null;
        return expr.op === 'min' ? Math.min(...numbers) : Math.max(...numbers);
      }
      if (numbers.length !== values.length) return null;
      if (expr.op === 'sub') return checked(numbers[0] - numbers[1]);
      return checked(expr.op === 'add' ? numbers.reduce((a, b) => a + b, 0) : numbers.reduce((a, b) => a * b, 1));
    }
    const num = evaluate(expr.num);
    const den = evaluate(expr.den);
    if (den === 0) { warnings.push('Mẫu số bằng 0 nên không thể tính tỷ lệ.'); return null; }
    if (num === null || den === null) return null;
    return checked((num / den) * (expr.op === 'percent' ? 100 : 1));
  };
  const value = evaluate(formula.value);
  const score = value === null || !formula.score ? null : checked(applyScore(formula.score, value));
  const round = (value: number | null, digits: number): number | null => value === null ? null : Number(value.toFixed(digits)) || 0;
  return { value: round(value, 6), score: round(score, 2), traces, warnings };
}

type FormulaLabels = { dataset?: (code: string) => string; column?: (dataset: string, key: string) => string };

const formulaNumber = (value: number): string => String(value).replace('.', ',');

/** Mô tả một biểu thức bằng lời. `oneSource`: mọi phép tổng hợp cùng một bảng nên không nhắc lại tên bảng; `withYear`: kèm điều kiện lọc năm. */
function describeExpr(expr: Expr, labels: FormulaLabels | undefined, options: { oneSource?: boolean; withYear?: boolean } = { withYear: true }): string {
  const displayValue = (value: unknown): string => value === null ? 'rỗng' : typeof value === 'boolean' ? value ? 'có' : 'không' : String(value);
  const describe = (expr: Expr): string => {
    if (typeof expr === 'number') return formulaNumber(expr);
    if ('agg' in expr) {
      const dataset = `«${labels?.dataset?.(expr.dataset) ?? expr.dataset}»`;
      const column = (key: string): string => `«${labels?.column?.(expr.dataset, key) ?? key}»`;
      const names = { count: 'Đếm', sum: 'Tổng', avg: 'Trung bình', min: 'Giá trị nhỏ nhất', max: 'Giá trị lớn nhất', countDistinct: 'Đếm giá trị phân biệt' };
      let text = expr.agg === 'count'
        ? options.oneSource ? 'Đếm bản ghi' : `Đếm ${dataset}`
        : `${names[expr.agg]} ${column(expr.column ?? '')}${options.oneSource ? '' : ` trong ${dataset}`}`;
      if (expr.where?.length) {
        const operations: Record<ConditionOp, string> = { eq: 'bằng', ne: 'khác', in: 'thuộc', nin: 'không thuộc', gt: 'lớn hơn', gte: 'lớn hơn hoặc bằng', lt: 'nhỏ hơn', lte: 'nhỏ hơn hoặc bằng', contains: 'chứa', notEmpty: 'không rỗng', isTrue: 'là có', isFalse: 'là không' };
        text += ' có ' + expr.where.map(([key, op, value]) => `${column(key)} ${operations[op]}${['notEmpty', 'isTrue', 'isFalse'].includes(op) ? '' : ' ' + (Array.isArray(value) ? `[${value.map(displayValue).join(', ')}]` : displayValue(value))}`).join(' và ');
      }
      if (expr.yearColumn && options.withYear) text += `, lọc theo năm của ${column(expr.yearColumn)}`;
      return text;
    }
    if ('args' in expr) {
      const args = expr.args.map(describe);
      if (expr.op === 'min' || expr.op === 'max') return `${expr.op === 'min' ? 'Nhỏ nhất' : 'Lớn nhất'} trong (${args.join('; ')})`;
      return `(${args.join(expr.op === 'add' ? ' + ' : expr.op === 'sub' ? ' − ' : ' × ')})`;
    }
    return `${expr.op === 'ratio' ? 'Tỷ lệ' : 'Phần trăm'}: (${describe(expr.num)}) ÷ (${describe(expr.den)})${expr.op === 'percent' ? ' × 100' : ''}`;
  };
  return describe(expr);
}

/** Mô tả cách chấm điểm từ giá trị công thức. */
export function describeScore(rule: ScoreRule): string {
  const number = formulaNumber;
  switch (rule.type) {
    case 'linear': return `chấm điểm tuyến tính tối đa ${number(rule.max)} điểm`;
    case 'capped': return `chấm điểm theo tỷ lệ giới hạn từ 0 đến 1, tối đa ${number(rule.max)} điểm`;
    case 'binary': return `giá trị lớn hơn 0 được ${number(rule.max)} điểm, còn lại 0 điểm`;
    case 'threshold': return `đạt ngưỡng ${number(rule.min)} được ${number(rule.max)} điểm, dưới ngưỡng ${rule.below === 'zero' ? 'được 0 điểm' : `lấy giá trị nhân ${number(rule.max)}`}`;
    case 'steps':
    case 'band': {
      const bands = rule.type === 'steps' ? rule.steps : rule.bands;
      return 'chấm theo bậc đầu tiên đạt: ' + [...bands].sort((a, b) => b.gte - a.gte).map(band => {
        const score = band.score === 'r' ? 'giá trị công thức' : band.score === 'rmax' && rule.type === 'band' ? `giá trị công thức nhân ${number(rule.max)}` : number(band.score as number);
        return `từ ${number(band.gte)} được ${score} điểm`;
      }).join(', ') + `; còn lại ${number(rule.otherwise ?? 0)} điểm`;
    }
  }
}

export function formatFormula(formula: FormulaSpec, labels?: FormulaLabels): string {
  let text = describeExpr(formula.value, labels);
  if (formula.score) text += `; ${describeScore(formula.score)}`;
  if (formula.unit) text += `; đơn vị: ${formula.unit}`;
  if (formula.note) text += `; ghi chú: ${formula.note}`;
  return text;
}

/** Một vế của công thức để hiển thị riêng: lời mô tả và biểu thức con để tính giá trị của vế đó. */
export interface FormulaPart { text: string; expr: Expr }
export interface FormulaOutline {
  /** ratio/percent: tử số ÷ mẫu số; expr: biểu thức khác. */
  kind: 'ratio' | 'percent' | 'expr';
  parts: FormulaPart[];
  /** Cột ngày dùng để lọc theo năm (nhãn), nếu có. */
  yearColumns: string[];
  score: string | null;
  unit: string | null;
  note: string | null;
}

/** Tách công thức thành các vế dễ đọc: tử số và mẫu số (nếu là tỷ lệ), điều kiện lọc năm, cách chấm điểm và ghi chú. */
export function outlineFormula(formula: FormulaSpec, labels?: FormulaLabels): FormulaOutline {
  const oneSource = datasetsReferenced(formula).length === 1;
  const years = new Set<string>();
  const visit = (expr: Expr): void => {
    if (typeof expr === 'number') return;
    if ('agg' in expr) {
      if (expr.yearColumn) years.add(labels?.column?.(expr.dataset, expr.yearColumn) ?? expr.yearColumn);
    } else if ('args' in expr) expr.args.forEach(visit);
    else { visit(expr.num); visit(expr.den); }
  };
  visit(formula.value);
  const part = (expr: Expr): FormulaPart => ({ text: describeExpr(expr, labels, { oneSource, withYear: false }), expr });
  const value = formula.value;
  const fraction = typeof value === 'object' && 'op' in value && (value.op === 'ratio' || value.op === 'percent') ? value : null;
  return {
    kind: fraction ? fraction.op as 'ratio' | 'percent' : 'expr',
    parts: fraction ? [part(fraction.num), part(fraction.den)] : [part(value)],
    yearColumns: [...years],
    score: formula.score ? describeScore(formula.score) : null,
    unit: formula.unit ?? null,
    note: formula.note?.trim() || null,
  };
}
