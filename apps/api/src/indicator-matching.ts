import { Logger } from '@nestjs/common';
import { Prisma, type TargetFrequency } from '@prisma/client';
import { createHash } from 'node:crypto';
import { normalizeUnit } from './extraction-validation';
import { diceSimilarity } from './matching';
import type { OllamaService } from './ollama';
import type { PrismaService } from './prisma.service';
import { FRAMEWORK_TEMPLATES } from './templates';

// B11–B14. Phát hiện chỉ tiêu trùng bằng ý nghĩa của tên, không dựa trên giá trị.
// B11: chuỗi "tên | đơn vị | phạm vi" (NFC, bỏ khoảng trắng thừa, giữ dấu, bỏ số thứ tự đầu tên, không chứa con số).
// B12: bge-m3 qua Ollama, vector 1.024 chiều chuẩn hóa độ dài 1, lưu kèm tên model.
// B13: bảng IndicatorEmbedding; có pgvector thì tìm bằng <=> trên chỉ mục HNSW, không có thì cosine trong bộ nhớ.
// B14: 10 chỉ tiêu gần nhất, xếp TRUNG (≥ 0,95, cùng đơn vị và kỳ) / GAN_TRUNG (0,85–0,95) / MOI.
// Cùng bộ vector dùng để gợi ý mã trong danh mục chỉ tiêu chuẩn (thư viện bộ chỉ tiêu mẫu).
// Ollama không chạy: quay về so tên bằng Dice như bản cũ và ghi rõ phương pháp.

export type MatchClass = 'TRUNG' | 'GAN_TRUNG' | 'MOI';
export type MatchMethod = 'pgvector' | 'memory' | 'dice';

export interface MatchingConfig {
  duplicateThreshold: number;
  nearThreshold: number;
  topK: number;
  codeThreshold: number;
  diceThreshold: number;
}

export function resolveMatchingConfig(env: Record<string, string | undefined> = process.env): MatchingConfig {
  const read = (key: string, fallback: number) => {
    const value = Number.parseFloat(env[key] ?? '');
    return Number.isFinite(value) && value > 0 && value <= 1 ? value : fallback;
  };
  const duplicate = read('MATCH_DUPLICATE_THRESHOLD', 0.95);
  const near = Math.min(duplicate, read('MATCH_NEAR_THRESHOLD', 0.85));
  return {
    duplicateThreshold: duplicate,
    nearThreshold: near,
    topK: 10,
    codeThreshold: read('MATCH_CODE_THRESHOLD', 0.8),
    diceThreshold: 0.72,
  };
}

/** B11: bỏ số thứ tự đầu tên ("(9)", "9.", "1.2.", "a)"), NFC, gộp khoảng trắng; giữ nguyên dấu. */
export function cleanIndicatorName(name: string): string {
  return name
    .normalize('NFC')
    .replace(/^\s*(\(\d{1,3}\)|\d{1,2}(\.\d{1,2}){0,2}[.)]|[a-zđ]\)|[-–+•])\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function embeddingText(name: string, unit: string | null | undefined, scope?: string | null): string {
  return [cleanIndicatorName(name), (unit ?? '').normalize('NFC').replace(/\s+/g, ' ').trim(), (scope ?? '').trim()]
    .filter(Boolean)
    .join(' | ');
}

export function normalizeVector(vector: number[]): number[] {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return length > 0 ? vector.map(value => value / length) : vector;
}

export function dot(a: number[], b: number[]): number {
  let sum = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) sum += a[index] * b[index];
  return sum;
}

export function classifyMatch(
  score: number,
  sameUnit: boolean,
  samePeriod: boolean,
  config: Pick<MatchingConfig, 'duplicateThreshold' | 'nearThreshold'>,
): MatchClass {
  if (score >= config.duplicateThreshold && sameUnit && samePeriod) return 'TRUNG';
  if (score >= config.nearThreshold) return 'GAN_TRUNG';
  return 'MOI';
}

export interface MatchQuery {
  name: string;
  unit: string | null;
  targetYear: number | null;
  frequency: TargetFrequency | null;
}

export interface SimilarTarget {
  id: string;
  code: string;
  title: string;
  unit: string;
  year: number;
  score: number;
}

export interface CodeSuggestion {
  code: string;
  title: string;
  unit: string;
  template: string;
  /** Nhóm của mục danh mục gần nhất (gợi ý lĩnh vực). */
  group?: string | null;
  score: number;
}

export interface MatchResult {
  matchClass: MatchClass;
  score: number | null;
  best: SimilarTarget | null;
  similar: SimilarTarget[];
  suggestion: CodeSuggestion | null;
  method: MatchMethod;
}

interface TargetRow {
  id: string;
  code: string;
  title: string;
  unit: string;
  year: number;
  frequency: TargetFrequency;
  standardCode: string | null;
}

interface CatalogEntry {
  refKey: string;
  code: string;
  title: string;
  unit: string;
  template: string;
  /** Nhóm của chỉ tiêu trong bộ chỉ tiêu mẫu ("Kinh tế", "Y tế"…), dùng để gợi ý lĩnh vực. */
  group: string | null;
}

interface StoredVector {
  refKey: string;
  vector: number[];
}

const EMBED_BATCH = 32;

function hashText(text: string) {
  return createHash('sha1').update(text).digest('hex');
}

/** Danh mục chỉ tiêu chuẩn: chỉ tiêu trong thư viện bộ chỉ tiêu mẫu, khóa "<mẫu>:<khóa>". */
export function catalogEntries(): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const template of FRAMEWORK_TEMPLATES) {
    for (const target of template.targets) {
      entries.push({
        refKey: `${template.key}:${target.key}`,
        code: target.standardCode ?? target.key,
        title: target.title,
        unit: target.unit,
        template: template.key,
        group: target.groupName ?? null,
      });
    }
  }
  return entries;
}

export class IndicatorMatcher {
  private readonly logger = new Logger(IndicatorMatcher.name);
  private pgvector: boolean | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ollama: Pick<OllamaService, 'embed' | 'embedModel'>,
    private readonly config: MatchingConfig = resolveMatchingConfig(),
  ) {}

  /** Nhúng các chuỗi còn thiếu hoặc đã đổi (khác textHash/model) cho một loại, theo lô. */
  private async sync(kind: 'TARGET' | 'CATALOG', items: { refKey: string; text: string; meta?: Prisma.InputJsonValue }[]) {
    const model = this.ollama.embedModel;
    const existing = await this.prisma.indicatorEmbedding.findMany({
      where: { kind, model },
      select: { refKey: true, textHash: true },
    });
    const known = new Map(existing.map(row => [row.refKey, row.textHash]));
    const stale = items.filter(item => known.get(item.refKey) !== hashText(item.text));
    for (let start = 0; start < stale.length; start += EMBED_BATCH) {
      const batch = stale.slice(start, start + EMBED_BATCH);
      const vectors = await this.ollama.embed(batch.map(item => item.text));
      for (const [index, item] of batch.entries()) {
        const vector = normalizeVector(vectors[index]);
        await this.prisma.indicatorEmbedding.upsert({
          where: { kind_refKey_model: { kind, refKey: item.refKey, model } },
          create: { kind, refKey: item.refKey, model, text: item.text, textHash: hashText(item.text), dims: vector.length, vector, meta: item.meta },
          update: { text: item.text, textHash: hashText(item.text), dims: vector.length, vector, meta: item.meta },
        });
      }
    }
    // Chỉ tiêu đã lưu trữ hoặc bị xóa: bỏ vector để không còn được gợi ý trùng.
    const wanted = new Set(items.map(item => item.refKey));
    const gone = existing.filter(row => !wanted.has(row.refKey)).map(row => row.refKey);
    if (gone.length) await this.prisma.indicatorEmbedding.deleteMany({ where: { kind, model, refKey: { in: gone } } });
    return stale.length;
  }

  private async hasPgvector(): Promise<boolean> {
    if (this.pgvector !== null) return this.pgvector;
    try {
      const rows = await this.prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok FROM pg_extension WHERE extname = 'vector'`;
      this.pgvector = rows.length > 0;
    } catch {
      this.pgvector = false;
    }
    return this.pgvector;
  }

  private async nearestPg(kind: 'TARGET' | 'CATALOG', vector: number[], limit: number): Promise<{ refKey: string; score: number }[]> {
    const literal = `[${vector.map(value => (Number.isFinite(value) ? value : 0)).join(',')}]`;
    // "kind" viết thẳng (không qua tham số) để Postgres chọn đúng chỉ mục HNSW riêng của loại đó.
    const kindLiteral = Prisma.raw(kind === 'TARGET' ? `'TARGET'` : `'CATALOG'`);
    return this.prisma.$queryRaw<{ refKey: string; score: number }[]>(Prisma.sql`
      SELECT "refKey", 1 - ((("vector")::vector(1024)) <=> ${literal}::vector(1024)) AS score
      FROM "IndicatorEmbedding"
      WHERE "kind" = ${kindLiteral} AND "model" = ${this.ollama.embedModel} AND "dims" = 1024
      ORDER BY (("vector")::vector(1024)) <=> ${literal}::vector(1024)
      LIMIT ${limit}
    `);
  }

  private static nearestMemory(stored: StoredVector[], vector: number[], limit: number) {
    return stored
      .map(row => ({ refKey: row.refKey, score: dot(row.vector, vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * So một loạt bản ghi mới với chỉ tiêu đang có (cùng năm hoặc không rõ năm) và danh mục chuẩn.
   * Không bao giờ ném lỗi vì Ollama: khi nhúng thất bại thì dùng Dice.
   */
  async matchMany(queries: MatchQuery[], options: { scope?: string | null; year?: number | null } = {}): Promise<{ results: MatchResult[]; method: MatchMethod; embedded: number }> {
    if (!queries.length) return { results: [], method: 'dice', embedded: 0 };
    // Vector giữ cho mọi chỉ tiêu đang dùng (không lọc năm) để đổi năm không phải nhúng lại; so trùng thì chỉ xét
    // chỉ tiêu cùng năm hoặc năm liền kề.
    const all: TargetRow[] = await this.prisma.target.findMany({
      where: { isArchived: false },
      select: { id: true, code: true, title: true, unit: true, year: true, frequency: true, standardCode: true },
    });
    const year = options.year ?? null;
    const candidates = year ? all.filter(target => Math.abs(target.year - year) <= 1) : all;
    try {
      return await this.matchWithEmbeddings(queries, all, candidates, options.scope ?? null);
    } catch (error) {
      this.logger.warn(`Không nhúng được bằng ${this.ollama.embedModel}, so trùng theo chữ (Dice): ${error instanceof Error ? error.message : 'lỗi'}`);
      return { results: queries.map(query => this.matchWithDice(query, candidates)), method: 'dice', embedded: 0 };
    }
  }

  private async matchWithEmbeddings(queries: MatchQuery[], all: TargetRow[], targets: TargetRow[], scope: string | null) {
    const catalog = catalogEntries();
    let embedded = await this.sync('TARGET', all.map(target => ({
      refKey: target.id,
      text: embeddingText(target.title, target.unit, scope),
    })));
    embedded += await this.sync('CATALOG', catalog.map(entry => ({
      refKey: entry.refKey,
      text: embeddingText(entry.title, entry.unit, scope),
      meta: { code: entry.code, title: entry.title, unit: entry.unit, template: entry.template },
    })));
    const queryVectors: number[][] = [];
    for (let start = 0; start < queries.length; start += EMBED_BATCH) {
      const batch = queries.slice(start, start + EMBED_BATCH);
      const vectors = await this.ollama.embed(batch.map(query => embeddingText(query.name, query.unit, scope)));
      queryVectors.push(...vectors.map(normalizeVector));
    }
    const usePg = queryVectors[0]?.length === 1024 && await this.hasPgvector();
    let memoryTargets: StoredVector[] = [];
    let memoryCatalog: StoredVector[] = [];
    if (!usePg) {
      const rows = await this.prisma.indicatorEmbedding.findMany({
        where: { model: this.ollama.embedModel, kind: { in: ['TARGET', 'CATALOG'] } },
        select: { kind: true, refKey: true, vector: true },
      });
      memoryTargets = rows.filter(row => row.kind === 'TARGET');
      memoryCatalog = rows.filter(row => row.kind === 'CATALOG');
    }
    const targetById = new Map(targets.map(target => [target.id, target]));
    const catalogByKey = new Map(catalog.map(entry => [entry.refKey, entry]));
    const results: MatchResult[] = [];
    for (const [index, query] of queries.entries()) {
      const vector = queryVectors[index];
      const nearTargets = usePg
        ? await this.nearestPg('TARGET', vector, this.config.topK * 3)
        : IndicatorMatcher.nearestMemory(memoryTargets, vector, this.config.topK * 3);
      const nearCatalog = usePg
        ? await this.nearestPg('CATALOG', vector, 1)
        : IndicatorMatcher.nearestMemory(memoryCatalog, vector, 1);
      const similar = nearTargets
        .filter(row => targetById.has(row.refKey))
        .slice(0, this.config.topK)
        .map(row => {
          const target = targetById.get(row.refKey)!;
          return { id: target.id, code: target.code, title: target.title, unit: target.unit, year: target.year, score: round(row.score) };
        });
      const best = similar[0] ?? null;
      const bestTarget = best ? targetById.get(best.id)! : null;
      const matchClass = best && bestTarget
        ? classifyMatch(best.score, sameUnit(query.unit, bestTarget.unit), samePeriod(query, bestTarget), this.config)
        : 'MOI';
      const catalogHit = nearCatalog[0];
      const entry = catalogHit ? catalogByKey.get(catalogHit.refKey) : undefined;
      const suggestion = entry && catalogHit.score >= this.config.codeThreshold
        ? { code: entry.code, title: entry.title, unit: entry.unit, template: entry.template, group: entry.group, score: round(catalogHit.score) }
        : null;
      results.push({
        matchClass,
        score: best?.score ?? null,
        best: matchClass === 'MOI' ? null : best,
        similar: similar.filter(item => item.score >= this.config.nearThreshold - 0.1).slice(0, 5),
        suggestion,
        method: usePg ? 'pgvector' : 'memory',
      });
    }
    return { results, method: (usePg ? 'pgvector' : 'memory') as MatchMethod, embedded };
  }

  private matchWithDice(query: MatchQuery, targets: TargetRow[]): MatchResult {
    const scored = targets
      .filter(target => !query.targetYear || target.year === query.targetYear)
      .map(target => ({ target, score: diceSimilarity(query.name, target.title) }))
      .filter(item => item.score >= this.config.diceThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const similar = scored.map(({ target, score }) => ({
      id: target.id, code: target.code, title: target.title, unit: target.unit, year: target.year, score: round(score),
    }));
    return {
      matchClass: similar.length ? 'GAN_TRUNG' : 'MOI',
      score: similar[0]?.score ?? null,
      best: similar[0] ?? null,
      similar,
      suggestion: null,
      method: 'dice',
    };
  }
}

function sameUnit(a: string | null, b: string | null) {
  return normalizeUnit(a) === normalizeUnit(b);
}

function samePeriod(query: MatchQuery, target: TargetRow) {
  if (query.targetYear && query.targetYear !== target.year) return false;
  if (query.frequency && query.frequency !== target.frequency) return false;
  return true;
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
