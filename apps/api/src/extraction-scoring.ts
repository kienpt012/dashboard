// Chấm điểm một lượt trích xuất của quy trình v2 so với đáp án (eval/gold-v2/*.json). Dùng chung cho script
// scripts/score-extraction.mjs và test: cùng một cách ghép cặp, cùng một cách tính, để hai lần chấm so được với nhau.
//
// Ghép cặp: mỗi dòng đáp án lấy đề xuất chưa dùng có cùng giá trị và tên giống nhất (Dice ≥ 0,55); đáp án không có giá
// trị thì chỉ xét tên (Dice ≥ 0,8). Trường nào đáp án không ghi thì không chấm trường đó.

import { TargetDirection } from '@prisma/client';
import { derivedPlanText } from './candidate-sheet';
import { diceSimilarity } from './matching';

export interface GoldIndicator {
  name: string;
  value: number | null;
  unit?: string | null;
  ordinal?: string | null;
  /** Chữ ở cột Kế hoạch: ">= 125,5", "70 - 75", "khoảng 30". */
  plan?: string | null;
  /** Đề mục nhóm như văn bản ghi. */
  group?: string | null;
  /** Lĩnh vực chuẩn. */
  category?: string | null;
}

export interface GoldDocument {
  document: string;
  note?: string;
  indicators: GoldIndicator[];
}

export interface ScoredCandidate {
  name: string;
  targetValue: number | null;
  unit?: string | null;
  ordinal?: string | null;
  groupName?: string | null;
  category?: string | null;
  targetText?: string | null;
  sourceQuote?: string | null;
  direction?: TargetDirection | null;
  extractionMethod?: string | null;
}

export type ScoredField = 'unit' | 'ordinal' | 'plan' | 'group' | 'category';

export interface ExtractionScore {
  gold: number;
  candidates: number;
  matched: number;
  recall: number;
  precision: number;
  f1: number;
  fields: Record<ScoredField, { checked: number; correct: number; accuracy: number | null }>;
  missing: GoldIndicator[];
  extra: ScoredCandidate[];
  mismatches: { name: string; field: ScoredField; expected: string; actual: string | null }[];
}

const normalize = (value: string | null | undefined) => (value ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
const normalizeOrdinal = (value: string | null | undefined) => normalize(value).replace(/[().\s]/g, '');
// Nhóm: bỏ dấu đánh số đầu đề mục ("a) Chỉ tiêu về kinh tế" và "1. Chỉ tiêu về kinh tế" là cùng nhóm).
const normalizeGroup = (value: string | null | undefined) => normalize(value).replace(/^([ivxlc]+|\d{1,2}|[a-zđ])[.)]\s*/u, '');
const sameValue = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
const ratio = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 1000 : 0);

function actualField(candidate: ScoredCandidate, field: ScoredField): string | null {
  if (field === 'unit') return candidate.unit ?? null;
  if (field === 'ordinal') return candidate.ordinal ?? null;
  if (field === 'group') return candidate.groupName ?? null;
  if (field === 'category') return candidate.category ?? null;
  return derivedPlanText({
    targetText: candidate.targetText ?? null,
    targetValue: candidate.targetValue,
    sourceQuote: candidate.sourceQuote ?? null,
    direction: candidate.direction ?? null,
  });
}

function fieldEqual(field: ScoredField, expected: string, actual: string | null): boolean {
  if (field === 'ordinal') return normalizeOrdinal(expected) === normalizeOrdinal(actual);
  if (field === 'group') return normalizeGroup(expected) === normalizeGroup(actual);
  return normalize(expected) === normalize(actual);
}

export function scoreExtraction(gold: GoldIndicator[], candidates: ScoredCandidate[]): ExtractionScore {
  // Mọi cặp có thể ghép, xếp theo độ giống tên giảm dần; ghép tham lam để một đề xuất chỉ dùng cho một dòng đáp án.
  const pairs: { gold: number; candidate: number; score: number }[] = [];
  gold.forEach((expected, goldIndex) => {
    candidates.forEach((candidate, candidateIndex) => {
      const similarity = diceSimilarity(expected.name, candidate.name);
      if (expected.value === null) {
        if (similarity >= 0.8) pairs.push({ gold: goldIndex, candidate: candidateIndex, score: similarity });
        return;
      }
      if (candidate.targetValue === null || !sameValue(candidate.targetValue, expected.value)) return;
      const sameOrdinal = Boolean(expected.ordinal) && normalizeOrdinal(expected.ordinal) === normalizeOrdinal(candidate.ordinal);
      if (similarity >= 0.55 || (sameOrdinal && similarity >= 0.35)) pairs.push({ gold: goldIndex, candidate: candidateIndex, score: similarity + (sameOrdinal ? 0.05 : 0) });
    });
  });
  pairs.sort((a, b) => b.score - a.score);
  const goldToCandidate = new Map<number, number>();
  const usedCandidates = new Set<number>();
  for (const pair of pairs) {
    if (goldToCandidate.has(pair.gold) || usedCandidates.has(pair.candidate)) continue;
    goldToCandidate.set(pair.gold, pair.candidate);
    usedCandidates.add(pair.candidate);
  }

  const fields: ExtractionScore['fields'] = {
    unit: { checked: 0, correct: 0, accuracy: null },
    ordinal: { checked: 0, correct: 0, accuracy: null },
    plan: { checked: 0, correct: 0, accuracy: null },
    group: { checked: 0, correct: 0, accuracy: null },
    category: { checked: 0, correct: 0, accuracy: null },
  };
  const mismatches: ExtractionScore['mismatches'] = [];
  for (const [goldIndex, candidateIndex] of goldToCandidate) {
    const expected = gold[goldIndex];
    const candidate = candidates[candidateIndex];
    for (const field of Object.keys(fields) as ScoredField[]) {
      const want = expected[field];
      if (want === undefined || want === null || want === '') continue;
      const actual = actualField(candidate, field);
      fields[field].checked += 1;
      if (fieldEqual(field, want, actual)) fields[field].correct += 1;
      else mismatches.push({ name: expected.name, field, expected: want, actual });
    }
  }
  for (const field of Object.values(fields)) field.accuracy = field.checked ? ratio(field.correct, field.checked) : null;

  const matched = goldToCandidate.size;
  const recall = ratio(matched, gold.length);
  const precision = ratio(matched, candidates.length);
  return {
    gold: gold.length,
    candidates: candidates.length,
    matched,
    recall,
    precision,
    f1: recall + precision ? Math.round(((2 * recall * precision) / (recall + precision)) * 1000) / 1000 : 0,
    fields,
    missing: gold.filter((_, index) => !goldToCandidate.has(index)),
    extra: candidates.filter((_, index) => !usedCandidates.has(index)),
    mismatches,
  };
}

const FIELD_LABELS: Record<ScoredField, string> = { unit: 'Đơn vị tính', ordinal: 'Số thứ tự', plan: 'Ký hiệu kế hoạch', group: 'Nhóm', category: 'Lĩnh vực' };

/** Báo cáo chữ cho người đọc: tỷ lệ, rồi danh sách thiếu, thừa, sai trường. */
export function formatScore(title: string, score: ExtractionScore): string {
  const percent = (value: number | null) => (value === null ? 'không chấm' : `${Math.round(value * 1000) / 10}%`);
  const lines = [
    `== ${title} ==`,
    `Bắt được ${score.matched}/${score.gold} chỉ tiêu (recall ${percent(score.recall)}); ${score.candidates} đề xuất, đúng ${percent(score.precision)} (precision); F1 ${percent(score.f1)}.`,
    ...(Object.keys(score.fields) as ScoredField[])
      .filter(field => score.fields[field].checked)
      .map(field => `${FIELD_LABELS[field]}: ${score.fields[field].correct}/${score.fields[field].checked} (${percent(score.fields[field].accuracy)})`),
  ];
  if (score.missing.length) {
    lines.push(`Thiếu ${score.missing.length}:`, ...score.missing.map(item => `  - ${item.ordinal ? `(${item.ordinal}) ` : ''}${item.name} = ${item.value ?? 'không có số'}${item.unit ? ` ${item.unit}` : ''}`));
  }
  if (score.extra.length) {
    lines.push(`Thừa ${score.extra.length}:`, ...score.extra.map(item => `  - ${item.name} = ${item.targetValue ?? 'không có số'}${item.unit ? ` ${item.unit}` : ''}${item.extractionMethod ? ` [${item.extractionMethod}]` : ''}`));
  }
  if (score.mismatches.length) {
    lines.push(`Sai trường ${score.mismatches.length}:`, ...score.mismatches.map(item => `  - ${item.name}: ${FIELD_LABELS[item.field]} cần "${item.expected}", ra "${item.actual ?? ''}"`));
  }
  return lines.join('\n');
}
