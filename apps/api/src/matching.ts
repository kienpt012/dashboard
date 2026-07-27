// Tiện ích đối sánh tên tiếng Việt (không dấu, không phân biệt hoa thường)
// dùng cho: phát hiện chỉ tiêu trùng lặp và gán phòng ban từ tên trong văn bản.

export function normalizeVietnamese(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Hệ số Dice trên bigram ký tự: bền với khác biệt nhỏ về hình thái từ.
export function diceSimilarity(a: string, b: string): number {
  const first = normalizeVietnamese(a);
  const second = normalizeVietnamese(b);
  if (!first || !second) return 0;
  if (first === second) return 1;
  const bigrams = (text: string) => {
    const counts = new Map<string, number>();
    for (let i = 0; i < text.length - 1; i += 1) {
      const gram = text.slice(i, i + 2);
      counts.set(gram, (counts.get(gram) ?? 0) + 1);
    }
    return counts;
  };
  const firstGrams = bigrams(first);
  const secondGrams = bigrams(second);
  let overlap = 0;
  let firstTotal = 0;
  let secondTotal = 0;
  for (const count of firstGrams.values()) firstTotal += count;
  for (const count of secondGrams.values()) secondTotal += count;
  if (!firstTotal || !secondTotal) return 0;
  for (const [gram, count] of firstGrams) {
    const other = secondGrams.get(gram);
    if (other) overlap += Math.min(count, other);
  }
  return (2 * overlap) / (firstTotal + secondTotal);
}

const DEPARTMENT_STOPWORDS = new Set(['phong', 'trung', 'tam', 'uy', 'ban', 'phuong', 'va']);

export interface DepartmentMatchInput {
  id: string;
  name: string;
  code: string;
}

// Gán tên đơn vị trong văn bản về phòng ban trong hệ thống. Trả về null khi không
// đủ chắc chắn — thà để người chọn tay còn hơn gán sai.
export function matchDepartmentByName(
  rawName: string,
  departments: DepartmentMatchInput[],
): { id: string; score: number } | null {
  const normalized = normalizeVietnamese(rawName);
  if (!normalized) return null;
  let best: { id: string; score: number } | null = null;
  for (const department of departments) {
    const departmentNormalized = normalizeVietnamese(department.name);
    let score = diceSimilarity(rawName, department.name);
    if (departmentNormalized && (normalized.includes(departmentNormalized) || departmentNormalized.includes(normalized))) {
      score = Math.max(score, 0.9);
    }
    // Trùng các từ khóa đặc trưng (bỏ từ phổ dụng như "phòng", "ủy ban").
    const nameTokens = new Set(normalized.split(' ').filter(token => token.length > 1 && !DEPARTMENT_STOPWORDS.has(token)));
    const departmentTokens = departmentNormalized.split(' ').filter(token => token.length > 1 && !DEPARTMENT_STOPWORDS.has(token));
    if (departmentTokens.length) {
      const hit = departmentTokens.filter(token => nameTokens.has(token)).length / departmentTokens.length;
      score = Math.max(score, hit * 0.85);
    }
    if (!best || score > best.score) best = { id: department.id, score };
  }
  if (!best || best.score < 0.62) return null;
  return { id: best.id, score: Math.round(best.score * 100) / 100 };
}
