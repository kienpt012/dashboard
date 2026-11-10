// Chấm một lượt trích xuất của quy trình v2 so với đáp án trong eval/gold-v2.
//
//   npm run build -w @ioc/api
//   node scripts/score-extraction.mjs --gold eval/gold-v2/qd015.json --candidates de-xuat.json [--json ket-qua.json]
//
// de-xuat.json là mảng đề xuất của một văn bản, lấy thẳng từ CSDL (xem eval/gold-v2/README.md). Thoát mã 1 khi recall
// hoặc precision thấp hơn --min-recall / --min-precision (mặc định không đặt ngưỡng), để dùng được trong kiểm tra tự động.

import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.env.IOC_API_DIST || path.join(root, 'apps', 'api', 'dist');
const { scoreExtraction, formatScore } = require(path.join(dist, 'extraction-scoring.js'));

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const goldPath = option('--gold');
const candidatesPath = option('--candidates');
if (!goldPath || !candidatesPath) {
  console.error('Cách dùng: node scripts/score-extraction.mjs --gold <đáp án.json> --candidates <đề xuất.json> [--json <kết quả.json>] [--min-recall 0.95] [--min-precision 0.9]');
  process.exit(2);
}

const gold = JSON.parse(await readFile(goldPath, 'utf8'));
const rawCandidates = JSON.parse((await readFile(candidatesPath, 'utf8')).replace(/^﻿/, ''));
// Chỉ chấm đề xuất chỉ tiêu mới còn hiệu lực; đề xuất đã bị người duyệt bỏ không tính là "thừa" của máy.
const candidates = (Array.isArray(rawCandidates) ? rawCandidates : rawCandidates.candidates ?? [])
  .filter(candidate => !candidate.kind || candidate.kind === 'NEW_INDICATOR');

const score = scoreExtraction(gold.indicators, candidates);
console.log(formatScore(gold.document ?? path.basename(goldPath), score));
const jsonPath = option('--json');
if (jsonPath) await writeFile(jsonPath, `${JSON.stringify({ document: gold.document, scoredAt: new Date().toISOString(), ...score }, null, 2)}\n`);

const minRecall = Number(option('--min-recall') ?? 0);
const minPrecision = Number(option('--min-precision') ?? 0);
if (score.recall < minRecall || score.precision < minPrecision) process.exit(1);
