// Benchmark trích xuất chỉ tiêu: rule-based vs LLM vs hybrid trên eval/dataset-v1.
// Chạy độc lập với API (dùng thẳng module đã build trong apps/api/dist) để tái lập được.
//
//   node apps/api/node_modules/.bin/tsc ... KHÔNG cần — yêu cầu đã chạy: npm run build -w @ioc/api
//   node scripts/benchmark-extraction.mjs [--methods rule,llm,hybrid] [--out docs/experiments/results]
//
// Kết quả: JSON + CSV theo từng phương án, precision/recall/F1 mức chỉ tiêu,
// độ chính xác từng trường trên các cặp khớp, thời gian xử lý.

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = (name) => require(path.join(root, 'apps', 'api', 'dist', name + '.js'));

const { parsePdf, parseDocx, parseXlsx, parseImage, chunkParsedPages, resolveOcrConfig } = dist('document-processing');
const { extractIndicatorsFromText, chunkLikelyHasIndicators } = dist('extraction-rules');
const { LlmIndicatorExtractor } = dist('extraction-llm');
const { OllamaService } = dist('ollama');
const { diceSimilarity } = dist('matching');

const args = process.argv.slice(2);
const methodsArg = args.includes('--methods') ? args[args.indexOf('--methods') + 1] : 'rule,llm,hybrid';
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'docs/experiments/results';
const METHODS = methodsArg.split(',').map(m => m.trim()).filter(Boolean);

const groundTruthRaw = JSON.parse(await readFile(path.join(root, 'eval', 'dataset-v1', 'ground-truth.json'), 'utf8'));
// Giải tham chiếu "same-as:" để mỗi tài liệu có danh sách chỉ tiêu đầy đủ.
const byFile = new Map(groundTruthRaw.documents.map(doc => [doc.file, doc]));
for (const doc of groundTruthRaw.documents) {
  if (typeof doc.indicators === 'string' && doc.indicators.startsWith('same-as:')) {
    doc.indicators = byFile.get(doc.indicators.slice('same-as:'.length)).indicators;
  }
}

const ollama = new OllamaService({ get: (key) => process.env[key] });
const llmExtractor = new LlmIndicatorExtractor(ollama);
const llmAvailable = await ollama.isAvailable();
if (!llmAvailable && METHODS.some(m => m !== 'rule')) {
  console.error('CẢNH BÁO: Ollama không chạy — chỉ benchmark được phương án rule.');
}

async function parseDocument(file) {
  const buffer = await readFile(path.join(root, file));
  const ocr = resolveOcrConfig();
  if (file.endsWith('.pdf')) return parsePdf(buffer, { ocr, maxOcrPages: 20 });
  if (file.endsWith('.docx')) return parseDocx(buffer);
  if (file.endsWith('.xlsx')) return parseXlsx(buffer);
  return parseImage(buffer, ocr);
}

async function extractWith(method, chunks, context) {
  const predictions = [];
  for (const chunk of chunks) {
    const likely = chunkLikelyHasIndicators(chunk.text);
    if (!likely) continue;
    const ruleResults = extractIndicatorsFromText(chunk.text);
    if (method === 'rule') {
      predictions.push(...ruleResults);
      continue;
    }
    let llmResults = [];
    try {
      const result = await llmExtractor.extractFromChunk(chunk.text, context);
      llmResults = result.indicators;
    } catch (error) {
      console.error(`  LLM lỗi ở chunk ${chunk.chunkIndex}: ${error.message?.slice(0, 80)}`);
    }
    predictions.push(...llmResults);
    if (method === 'hybrid') {
      for (const item of ruleResults) {
        const covered = llmResults.some(llmItem =>
          llmItem.targetValue !== null && item.targetValue !== null
          && Math.abs(llmItem.targetValue - item.targetValue) < 1e-9);
        if (!covered) predictions.push(item);
      }
    }
  }
  // Khử trùng lặp trong nội bộ dự đoán (giống worker).
  const seen = new Set();
  return predictions.filter(item => {
    const key = `${item.name.toLowerCase().trim()}|${item.targetValue ?? ''}|${item.unit ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeUnit(unit) {
  return (unit ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function matchPredictions(predictions, truths) {
  // Ghép cặp tham lam theo (độ giống tên + trùng giá trị).
  const available = new Set(truths.map((_, index) => index));
  const pairs = [];
  for (const [predictionIndex, prediction] of predictions.entries()) {
    let best = null;
    for (const truthIndex of available) {
      const truth = truths[truthIndex];
      const nameScore = diceSimilarity(prediction.name, truth.name);
      const valueMatches = prediction.targetValue !== null
        && Math.abs(prediction.targetValue - truth.targetValue) < 1e-6;
      const score = nameScore + (valueMatches ? 0.5 : 0);
      if ((nameScore >= 0.45 || (valueMatches && nameScore >= 0.25)) && (!best || score > best.score)) {
        best = { truthIndex, score };
      }
    }
    if (best) {
      available.delete(best.truthIndex);
      pairs.push({ predictionIndex, truthIndex: best.truthIndex });
    }
  }
  return pairs;
}

function evaluateFields(prediction, truth) {
  return {
    value: prediction.targetValue !== null && Math.abs(prediction.targetValue - truth.targetValue) < 1e-6,
    unit: normalizeUnit(prediction.unit) === normalizeUnit(truth.unit),
    direction: prediction.direction === truth.direction,
    frequency: (prediction.frequency ?? null) === (truth.frequency ?? null),
    deadline: truth.deadline === null
      ? true // văn bản không nêu hạn cụ thể: không chấm điểm trường này (mặc định cuối năm chấp nhận được)
      : prediction.deadline === truth.deadline
        || (prediction.deadline instanceof Date && prediction.deadline.toISOString().slice(0, 10) === truth.deadline),
    department: truth.responsibleDepartment
      ? Boolean(prediction.responsibleDepartmentName)
        && diceSimilarity(prediction.responsibleDepartmentName, truth.responsibleDepartment) >= 0.62
      : true,
  };
}

const results = [];
for (const method of METHODS) {
  if (method !== 'rule' && !llmAvailable) continue;
  console.error(`\n=== Phương án: ${method} ===`);
  for (const doc of groundTruthRaw.documents) {
    console.error(`- ${doc.file}`);
    const parseStart = Date.now();
    const parsed = await parseDocument(doc.file);
    const parseMs = Date.now() - parseStart;
    const chunks = chunkParsedPages(parsed.pages);
    const extractStart = Date.now();
    const predictions = await extractWith(method, chunks, { defaultYear: 2026 });
    const extractMs = Date.now() - extractStart;

    const pairs = matchPredictions(predictions, doc.indicators);
    const truePositives = pairs.length;
    const precision = predictions.length ? truePositives / predictions.length : 0;
    const recall = doc.indicators.length ? truePositives / doc.indicators.length : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

    const fieldTotals = { value: 0, unit: 0, direction: 0, frequency: 0, deadline: 0, department: 0 };
    for (const pair of pairs) {
      const outcome = evaluateFields(predictions[pair.predictionIndex], doc.indicators[pair.truthIndex]);
      for (const key of Object.keys(fieldTotals)) if (outcome[key]) fieldTotals[key] += 1;
    }
    const fieldAccuracy = Object.fromEntries(
      Object.entries(fieldTotals).map(([key, hits]) => [key, truePositives ? round(hits / truePositives) : null]),
    );

    results.push({
      method,
      file: doc.file,
      kind: doc.kind,
      truthCount: doc.indicators.length,
      predictedCount: predictions.length,
      truePositives,
      precision: round(precision),
      recall: round(recall),
      f1: round(f1),
      fieldAccuracy,
      parseMs,
      extractMs,
      ocrUsed: parsed.ocrUsed,
    });
    console.error(`  P=${round(precision)} R=${round(recall)} F1=${round(f1)} (${predictions.length} dự đoán / ${doc.indicators.length} thật) — parse ${parseMs}ms, extract ${extractMs}ms`);
  }
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

// Tổng hợp theo phương án (micro-average trên toàn bộ chỉ tiêu).
const summary = [];
for (const method of METHODS) {
  const rows = results.filter(row => row.method === method);
  if (!rows.length) continue;
  const tp = rows.reduce((sum, row) => sum + row.truePositives, 0);
  const predicted = rows.reduce((sum, row) => sum + row.predictedCount, 0);
  const truth = rows.reduce((sum, row) => sum + row.truthCount, 0);
  const precision = predicted ? tp / predicted : 0;
  const recall = truth ? tp / truth : 0;
  const fieldKeys = ['value', 'unit', 'direction', 'frequency', 'deadline', 'department'];
  const fieldAccuracy = {};
  for (const key of fieldKeys) {
    const scored = rows.filter(row => row.fieldAccuracy[key] !== null);
    fieldAccuracy[key] = scored.length
      ? round(scored.reduce((sum, row) => sum + row.fieldAccuracy[key] * row.truePositives, 0) / Math.max(1, tp))
      : null;
  }
  summary.push({
    method,
    documents: rows.length,
    truthCount: truth,
    predictedCount: predicted,
    truePositives: tp,
    precision: round(precision),
    recall: round(recall),
    f1: round(precision + recall ? (2 * precision * recall) / (precision + recall) : 0),
    fieldAccuracy,
    totalExtractMs: rows.reduce((sum, row) => sum + row.extractMs, 0),
  });
}

const payload = {
  runAt: new Date().toISOString(),
  datasetVersion: groundTruthRaw.version,
  model: llmAvailable ? ollama.extractModel : null,
  methods: METHODS,
  summary,
  perDocument: results,
};

await mkdir(path.join(root, outDir), { recursive: true });
const stamp = payload.runAt.replace(/[:.]/g, '-').slice(0, 19);
const jsonPath = path.join(root, outDir, `benchmark-${stamp}.json`);
await writeFile(jsonPath, JSON.stringify(payload, null, 2));
const csvLines = ['method,file,kind,truth,predicted,tp,precision,recall,f1,value_acc,unit_acc,direction_acc,frequency_acc,deadline_acc,department_acc,parse_ms,extract_ms'];
for (const row of results) {
  csvLines.push([
    row.method, row.file, row.kind, row.truthCount, row.predictedCount, row.truePositives,
    row.precision, row.recall, row.f1,
    row.fieldAccuracy.value, row.fieldAccuracy.unit, row.fieldAccuracy.direction,
    row.fieldAccuracy.frequency, row.fieldAccuracy.deadline, row.fieldAccuracy.department,
    row.parseMs, row.extractMs,
  ].join(','));
}
await writeFile(path.join(root, outDir, `benchmark-${stamp}.csv`), csvLines.join('\n'));

console.log(JSON.stringify({ summary, jsonPath }, null, 2));
