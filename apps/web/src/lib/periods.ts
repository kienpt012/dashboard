import type { Frequency } from '@/types/domain';

// Kỳ báo cáo: "2026" (năm), "2026-H1" (6 tháng), "2026-Q3" (quý), "2026-M09" (tháng) — cùng quy ước với máy chủ.

const ROMAN = ['I', 'II', 'III', 'IV'];
const KEY = /^(\d{4})(?:-(H[12]|Q[1-4]|M(0[1-9]|1[0-2])))?$/;

export function periodLabel(key?: string | null) {
  const match = key ? KEY.exec(key) : null;
  if (!match) return key ?? '';
  const [, year, suffix] = match;
  if (!suffix) return `Năm ${year}`;
  const index = Number(suffix.slice(1));
  if (suffix[0] === 'H') return index === 1 ? `6 tháng đầu năm ${year}` : `6 tháng cuối năm ${year}`;
  if (suffix[0] === 'Q') return `Quý ${ROMAN[index - 1]}/${year}`;
  return `Tháng ${index}/${year}`;
}

export function periodsOfYear(frequency: Frequency, year: number) {
  const count = frequency === 'MONTHLY' ? 12 : frequency === 'QUARTERLY' ? 4 : frequency === 'SEMIANNUAL' ? 2 : 1;
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    if (frequency === 'MONTHLY') return `${year}-M${String(index).padStart(2, '0')}`;
    if (frequency === 'QUARTERLY') return `${year}-Q${index}`;
    if (frequency === 'SEMIANNUAL') return `${year}-H${index}`;
    return String(year);
  });
}

export const frequencyLabel: Record<Frequency, string> = {
  MONTHLY: 'Hằng tháng',
  QUARTERLY: 'Hằng quý',
  SEMIANNUAL: '6 tháng',
  YEARLY: 'Hằng năm',
};
