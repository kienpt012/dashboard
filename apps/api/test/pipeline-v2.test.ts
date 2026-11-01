import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { ExtractionJobKind, ExtractionMethod } from '@prisma/client';
import { detectDocumentKind } from '../src/document-processing';
import {
  adjustedConfidence,
  dateAppearsIn,
  numbersInText,
  validateConsistency,
  validateRecord,
  yearOnlyFromComparison,
  type ValidationRecord,
} from '../src/extraction-validation';
import { ExtractionWorker, formIndicators, resolveSourceElements } from '../src/extraction-worker';
import { parseSectionHeader } from '../src/extraction-llm';
import {
  classifyMatch,
  cleanIndicatorName,
  embeddingText,
  IndicatorMatcher,
  normalizeVector,
  resolveMatchingConfig,
} from '../src/indicator-matching';
import {
  OcrServiceClient,
  OcrServiceUnavailableError,
  pageBatches,
  resolveOcrServiceConfig,
  type StructuredElement,
  type StructuredPage,
} from '../src/ocr-service';
import {
  chunkFallbackPages,
  chunkStructuredPages,
  classifyLine,
  joinLinesIntoParagraphs,
  resolveChunkingOptions,
} from '../src/structured-chunking';

const options = resolveChunkingOptions({});

function el(id: string, type: StructuredElement['type'], text: string, extra: Partial<StructuredElement> = {}): StructuredElement {
  return { id, type, text, page: 1, bbox: null, confidence: null, source: 'pdf_text', flags: [], ...extra };
}

// ---------------------------------------------------------------------------
// B7. Chia đoạn theo mục

test('B7: đề mục đánh số ngắn là đề mục, mục mang số liệu là đơn vị chia đoạn', () => {
  assert.deepEqual(classifyLine('Điều 2. Chỉ tiêu chủ yếu', 'paragraph'), { rank: 4, heading: true });
  assert.deepEqual(classifyLine('1. Chỉ tiêu về kinh tế', 'paragraph'), { rank: 6, heading: true });
  assert.deepEqual(classifyLine('1. Tỷ lệ hồ sơ trực tuyến đạt 95%.', 'paragraph'), { rank: 6, heading: false });
  assert.equal(classifyLine('Căn cứ Luật Tổ chức chính quyền địa phương', 'paragraph'), null);
});

test('B7: đoạn mang heading_path, câu đầu mục và id phần tử nguồn', () => {
  const chunks = chunkStructuredPages([{
    page: 1,
    elements: [
      el('p1-e0', 'heading', 'Điều 2. Chỉ tiêu chủ yếu năm 2026'),
      el('p1-e1', 'paragraph', '1. Chỉ tiêu về kinh tế'),
      el('p1-e2', 'paragraph', 'Phòng Kinh tế chủ trì theo dõi các chỉ tiêu sau:'),
      el('p1-e3', 'list_item', '(1) Tổng thu ngân sách trên địa bàn đạt 1.200 tỷ đồng.'),
      el('p1-e4', 'list_item', '(2) Tỷ lệ hộ nghèo giảm còn dưới 0,5%.'),
    ],
  }], options);
  const withItems = chunks.find(chunk => chunk.elementIds.includes('p1-e3'))!;
  assert.deepEqual(withItems.headingPath, ['Điều 2. Chỉ tiêu chủ yếu năm 2026', '1. Chỉ tiêu về kinh tế']);
  assert.equal(withItems.leadSentence, 'Phòng Kinh tế chủ trì theo dõi các chỉ tiêu sau:');
  assert.ok(withItems.text.startsWith('[Mục: Điều 2. Chỉ tiêu chủ yếu năm 2026 > 1. Chỉ tiêu về kinh tế]'));
  assert.ok(withItems.elementIds.includes('p1-e4'));
  assert.equal(withItems.hasDigits, true);
  // Bộ trích xuất LLM lấy đề mục gần nhất làm lĩnh vực.
  assert.equal(parseSectionHeader(withItems.text), '1. Chỉ tiêu về kinh tế');
});

test('B7: đoạn không có chữ số được đánh dấu để không gửi Qwen', () => {
  const chunks = chunkStructuredPages([{
    page: 1,
    elements: [el('p1-e0', 'paragraph', 'Căn cứ Luật Tổ chức chính quyền địa phương; Xét đề nghị của Trưởng phòng Văn hóa.')],
  }], options);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].hasDigits, false);
});

test('B7: bảng lớn tách theo hàng, lặp hàng tiêu đề, không cắt trước dòng thành phần "-"', () => {
  const cells = [
    { row: 0, col: 0, text: 'STT', header: true }, { row: 0, col: 1, text: 'Chỉ tiêu', header: true }, { row: 0, col: 2, text: 'Kế hoạch', header: true },
  ];
  for (let row = 1; row <= 9; row += 1) {
    cells.push({ row, col: 0, text: row === 9 ? '-' : String(row), header: false });
    cells.push({ row, col: 1, text: row === 9 ? 'Mầm non' : `Chỉ tiêu số ${row}`, header: false });
    cells.push({ row, col: 2, text: `${row * 10}%`, header: false });
  }
  const table = el('p1-e0', 'table', '', {
    table: {
      numRows: 10,
      numCols: 3,
      cells: cells.map(cell => ({ ...cell, rowSpan: 1, colSpan: 1, bbox: null, confidence: null, source: 'pdf_text', flags: [] })),
    },
  });
  const chunks = chunkStructuredPages([{ page: 1, elements: [table] }], { ...options, tableRowsPerChunk: 8 });
  assert.equal(chunks.length, 1, 'dòng "-" thứ 9 phải đi cùng 8 dòng trước');
  assert.ok(chunks[0].text.startsWith('STT Chỉ tiêu Kế hoạch'));
  assert.equal(chunks[0].kind, 'table');
});

test('B7: ô biểu mẫu thành đoạn form riêng', () => {
  const field = el('p1-e5', 'form_field', 'Số hộ nghèo: 12', {
    field: { template: 'bieu-01', name: 'ho_ngheo', label: 'Số hộ nghèo', value: '12', indicator: { name: 'Số hộ nghèo trên địa bàn', unit: 'hộ' } },
  });
  const chunks = chunkStructuredPages([{ page: 1, elements: [el('p1-e0', 'paragraph', 'Biểu báo cáo'), field] }], options);
  const form = chunks.find(chunk => chunk.kind === 'form')!;
  assert.deepEqual(form.elementIds, ['p1-e5']);
});

test('Bộ đọc dự phòng: ghép dòng PDF bị cắt đôi thành một đoạn', () => {
  const paragraphs = joinLinesIntoParagraphs('1. Tỷ lệ người dân tham gia bảo hiểm\ny tế đạt 95%.\n2. Thu ngân sách đạt 100 tỷ đồng.');
  assert.deepEqual(paragraphs, [
    '1. Tỷ lệ người dân tham gia bảo hiểm y tế đạt 95%.',
    '2. Thu ngân sách đạt 100 tỷ đồng.',
  ]);
  const chunks = chunkFallbackPages([{ pageNumber: 1, text: 'Điều 1. Giao chỉ tiêu\n1. Tỷ lệ người dân tham gia bảo hiểm\ny tế đạt 95%.', ocrUsed: false }], options);
  assert.ok(chunks[0].text.includes('bảo hiểm y tế đạt 95%'));
  assert.deepEqual(chunks[0].headingPath, ['Điều 1. Giao chỉ tiêu']);
});

// ---------------------------------------------------------------------------
// B10. Luật kiểm tra

const base: ValidationRecord = {
  name: 'Tỷ lệ người dân tham gia bảo hiểm y tế',
  unit: '%',
  targetValue: 95.5,
  targetYear: 2026,
  deadline: null,
  sourceQuote: 'Tỷ lệ người dân tham gia bảo hiểm y tế đạt 95,5% trong năm 2026.',
};

test('B10: bản ghi đúng không có cờ', () => {
  assert.deepEqual(validateRecord(base, `Đoạn: ${base.sourceQuote}`), []);
});

test('B10: số kiểu Việt và kiểu Anh đều được nhận', () => {
  assert.ok(numbersInText('đạt 3.450 người').includes(3450));
  assert.ok(numbersInText('đạt 95,5%').includes(95.5));
  assert.ok(numbersInText('1,200 households').includes(1200));
});

test('B10 Bám nguồn: giá trị không có nguyên văn trong câu trích bị gắn cờ', () => {
  const flags = validateRecord({ ...base, targetValue: 96 });
  assert.deepEqual(flags.map(flag => flag.rule), ['bam_nguon']);
  assert.equal(adjustedConfidence(0.9, flags), 0.4);
  const quoteMissing = validateRecord(base, 'Một đoạn khác hẳn.');
  assert.ok(quoteMissing.some(flag => flag.rule === 'bam_nguon'));
});

test('B10 Bám nguồn: hạn phải có trong câu trích', () => {
  assert.ok(dateAppearsIn('2026-09-30', 'hoàn thành trước ngày 30/9/2026'));
  assert.ok(dateAppearsIn('2026-09-30', 'trước ngày 30 tháng 9 năm 2026'));
  const flags = validateRecord({ ...base, deadline: '2026-06-30' });
  assert.ok(flags.some(flag => flag.rule === 'bam_nguon' && flag.message.includes('2026-06-30')));
});

test('B10 Cấu trúc, Đơn vị, Miền giá trị', () => {
  assert.ok(validateRecord({ ...base, unit: null }).some(flag => flag.rule === 'cau_truc'));
  assert.ok(validateRecord({ ...base, structureRepaired: true }).some(flag => flag.rule === 'cau_truc'));
  assert.ok(validateRecord({ ...base, expectedUnits: ['người'] }).some(flag => flag.rule === 'don_vi'));
  assert.equal(validateRecord({ ...base, expectedUnits: ['%'] }).length, 0);
  const over = validateRecord({ ...base, targetValue: 120, sourceQuote: 'Tỷ lệ người dân tham gia bảo hiểm y tế đạt 120%.' });
  assert.ok(over.some(flag => flag.rule === 'mien_gia_tri'));
});

test('B10 Năm và hạn: không lấy năm từ cụm "so với năm"', () => {
  assert.equal(yearOnlyFromComparison(2025, 'tăng 10% so với năm 2025'), true);
  assert.equal(yearOnlyFromComparison(2026, 'năm 2026 tăng 10% so với năm 2025'), false);
  const flags = validateRecord({ ...base, targetYear: 2025, sourceQuote: 'Tỷ lệ người dân tham gia bảo hiểm y tế đạt 95,5%, tăng so với năm 2025.' });
  assert.ok(flags.some(flag => flag.rule === 'nam_va_han'));
});

test('B10 Tên chỉ tiêu: dưới 4 từ hoặc bắt đầu bằng chữ thường thì hạ độ tin cậy', () => {
  const short = validateRecord({ ...base, name: 'Bảo hiểm y' });
  assert.ok(short.some(flag => flag.rule === 'ten_chi_tieu'));
  assert.equal(adjustedConfidence(0.9, short), 0.5);
  assert.ok(validateRecord({ ...base, name: 'tham gia bảo hiểm y tế toàn dân' }).some(flag => flag.rule === 'ten_chi_tieu'));
});

test('B10 Chất lượng OCR và người duyệt đã sửa', () => {
  assert.ok(validateRecord({ ...base, ocr: { flags: ['can_ra_soat'], minConfidence: 0.9 } }).some(flag => flag.rule === 'chat_luong_ocr'));
  assert.ok(validateRecord({ ...base, ocr: { flags: [], minConfidence: 0.62 } }).some(flag => flag.rule === 'chat_luong_ocr'));
  // Người duyệt đã sửa giá trị: không bắt bẻ bằng câu trích OCR có thể đọc sai, không gắn lại cờ OCR.
  const edited = validateRecord({ ...base, targetValue: 96, ocr: { flags: ['can_ra_soat'], minConfidence: 0.5 }, humanEditedFields: ['targetValue'] });
  assert.deepEqual(edited, []);
});

test('B10 Nhất quán: tổng thành phần phải bằng chỉ tiêu cha', () => {
  const records: ValidationRecord[] = [
    { ...base, name: 'Số phòng học xây mới', unit: 'phòng', targetValue: 30, parentName: null },
    { ...base, name: 'Mầm non', unit: 'phòng', targetValue: 10, parentName: 'Số phòng học xây mới' },
    { ...base, name: 'Tiểu học', unit: 'phòng', targetValue: 15, parentName: 'Số phòng học xây mới' },
  ];
  const flags = validateConsistency(records);
  assert.equal(flags.get(0)?.[0].rule, 'nhat_quan');
  assert.equal(flags.size, 3);
  records[2].targetValue = 20;
  assert.equal(validateConsistency(records).size, 0);
});

// ---------------------------------------------------------------------------
// B11–B14. So trùng

test('B11: chuỗi nhúng bỏ số thứ tự, giữ dấu, không chứa giá trị', () => {
  assert.equal(cleanIndicatorName('(9) Tỷ lệ  người dân'), 'Tỷ lệ người dân');
  assert.equal(cleanIndicatorName('1.2. Thu ngân sách'), 'Thu ngân sách');
  assert.equal(embeddingText('(9) Tỷ lệ người dân tham gia BHYT', '%', 'Phường Lái Thiêu'), 'Tỷ lệ người dân tham gia BHYT | % | Phường Lái Thiêu');
});

test('B14: xếp loại theo ngưỡng, đơn vị và kỳ', () => {
  const config = resolveMatchingConfig({});
  assert.equal(classifyMatch(0.97, true, true, config), 'TRUNG');
  assert.equal(classifyMatch(0.97, false, true, config), 'GAN_TRUNG');
  assert.equal(classifyMatch(0.9, true, true, config), 'GAN_TRUNG');
  assert.equal(classifyMatch(0.6, true, true, config), 'MOI');
  assert.equal(resolveMatchingConfig({ MATCH_DUPLICATE_THRESHOLD: '0.9', MATCH_NEAR_THRESHOLD: '0.8' }).nearThreshold, 0.8);
});

function fakeEmbeddingPrisma(targets: { id: string; code: string; title: string; unit: string; year: number; frequency: string }[]) {
  const store = new Map<string, { kind: string; refKey: string; model: string; textHash: string; vector: number[] }>();
  return {
    store,
    target: { findMany: async () => targets.map(target => ({ ...target, standardCode: null })) },
    indicatorEmbedding: {
      findMany: async ({ where, select }: any) => [...store.values()]
        .filter(row => row.model === where.model && (where.kind?.in ? where.kind.in.includes(row.kind) : row.kind === where.kind))
        .map(row => (select.vector ? { kind: row.kind, refKey: row.refKey, vector: row.vector } : { refKey: row.refKey, textHash: row.textHash })),
      upsert: async ({ create }: any) => { store.set(`${create.kind}:${create.refKey}`, create); },
      deleteMany: async ({ where }: any) => { for (const key of where.refKey.in) store.delete(`${where.kind}:${key}`); },
    },
    $queryRaw: async () => [],
  };
}

/** Nhúng giả: vector theo các từ khóa, đủ để kiểm cosine và xếp loại. */
function fakeOllama(fail = false) {
  const words = ['bảo hiểm', 'hộ nghèo', 'ngân sách', 'trường', 'rác'];
  return {
    embedModel: 'bge-m3',
    calls: 0,
    async embed(texts: string[]) {
      this.calls += 1;
      if (fail) throw new Error('Ollama tắt');
      return texts.map(text => normalizeVector(words.map(word => (text.toLowerCase().includes(word) ? 1 : 0.01))));
    },
  };
}

test('B12–B14: so trùng bằng vector trong bộ nhớ khi chưa có pgvector, gợi ý mã từ danh mục', async () => {
  const prisma = fakeEmbeddingPrisma([
    { id: 't1', code: 'CT-01', title: 'Tỷ lệ người dân tham gia bảo hiểm y tế', unit: '%', year: 2026, frequency: 'YEARLY' },
    { id: 't2', code: 'CT-02', title: 'Thu ngân sách nhà nước', unit: 'tỷ đồng', year: 2026, frequency: 'YEARLY' },
  ]);
  const ollama = fakeOllama();
  const matcher = new IndicatorMatcher(prisma as any, ollama as any);
  const { results, method } = await matcher.matchMany([
    { name: 'Tỷ lệ dân số tham gia bảo hiểm y tế', unit: '%', targetYear: 2026, frequency: null },
    { name: 'Số trường đạt chuẩn quốc gia', unit: 'trường', targetYear: 2026, frequency: null },
  ], { year: 2026 });
  assert.equal(method, 'memory');
  assert.equal(results[0].matchClass, 'TRUNG');
  assert.equal(results[0].best?.id, 't1');
  assert.equal(results[1].matchClass, 'MOI');
  assert.ok([...prisma.store.keys()].some(key => key.startsWith('CATALOG:')), 'danh mục chuẩn được nhúng sẵn');
  // Lần sau không nhúng lại chỉ tiêu, danh mục chưa đổi.
  const calls = ollama.calls;
  await matcher.matchMany([{ name: 'Thu ngân sách', unit: 'tỷ đồng', targetYear: 2026, frequency: null }], { year: 2026 });
  assert.equal(ollama.calls, calls + 1);
});

test('B14: Ollama tắt thì so theo chữ (Dice), không làm hỏng job', async () => {
  const prisma = fakeEmbeddingPrisma([
    { id: 't1', code: 'CT-01', title: 'Tỷ lệ người dân tham gia bảo hiểm y tế', unit: '%', year: 2026, frequency: 'YEARLY' },
  ]);
  const matcher = new IndicatorMatcher(prisma as any, fakeOllama(true) as any);
  const { results, method } = await matcher.matchMany([
    { name: 'Tỷ lệ người dân tham gia bảo hiểm y tế', unit: '%', targetYear: 2026, frequency: null },
  ], { year: 2026 });
  assert.equal(method, 'dice');
  assert.equal(results[0].matchClass, 'GAN_TRUNG');
  assert.equal(results[0].best?.id, 't1');
});

// ---------------------------------------------------------------------------
// ocr-service client, nhận diện tệp

test('ocr-service: cấu hình, chia lô trang, lỗi 503 là chưa sẵn sàng', async () => {
  assert.equal(resolveOcrServiceConfig({}).baseUrl, null);
  assert.equal(resolveOcrServiceConfig({ OCR_SERVICE_URL: 'http://ocr:8000/' }).baseUrl, 'http://ocr:8000');
  assert.deepEqual(pageBatches(17, 8), [{ from: 1, to: 8 }, { from: 9, to: 16 }, { from: 17, to: 17 }]);
  const requests: string[] = [];
  const client = new OcrServiceClient({ baseUrl: 'http://ocr:8000', pageBatch: 8, timeoutMs: 60_000 }, (async (url: string, init: RequestInit) => {
    requests.push(url);
    assert.ok(init.body instanceof FormData);
    return new Response('{}', { status: 503 });
  }) as typeof fetch);
  await assert.rejects(client.parse(Buffer.from('%PDF-1.7'), 'a.pdf', { from: 9, to: 16 }), OcrServiceUnavailableError);
  assert.equal(requests[0], 'http://ocr:8000/parse?pages=9-16');
});

test('Nhận diện TIFF, .doc, .xls bằng chữ ký nội dung', () => {
  assert.equal(detectDocumentKind(Buffer.from([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0]))?.mimeType, 'image/tiff');
  const ole = (name: string) => {
    const buffer = Buffer.alloc(1024);
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(buffer);
    Buffer.from(name, 'utf16le').copy(buffer, 600);
    return buffer;
  };
  assert.equal(detectDocumentKind(ole('WordDocument'))?.kind, 'doc');
  assert.equal(detectDocumentKind(ole('Workbook'))?.kind, 'xls');
  assert.equal(detectDocumentKind(ole('PowerPoint Document')), null);
});

// ---------------------------------------------------------------------------
// B9: nguồn tới phần tử, biểu mẫu

test('B9: bản ghi trỏ về đúng phần tử, mang cờ và hai bản đọc OCR', () => {
  const flagged = el('p2-e1', 'paragraph', 'Số hộ nghèo giảm còn 12 hộ.', {
    page: 2,
    source: 'merged',
    confidence: 0.55,
    flags: ['can_ra_soat'],
    readings: [{ text: 'Số hộ nghèo giảm còn 12 hộ.', vietocr: 'Số hộ nghèo giảm còn 12 hộ.', second: 'So ho ngheo giam con 12 ho.' }],
  });
  const other = el('p2-e0', 'paragraph', 'Tình hình chung của phường.', { page: 2, source: 'vietocr', confidence: 0.95 });
  const byId = new Map([[other.id, other], [flagged.id, flagged]]);
  const source = resolveSourceElements(
    { pageFrom: 2, pageTo: 2, elementIds: ['p2-e0', 'p2-e1'] },
    { sourceQuote: 'Số hộ nghèo giảm còn 12 hộ', targetValue: 12 },
    byId,
    new Map([[2, [other, flagged]]]),
  );
  assert.deepEqual(source.ids, ['p2-e1']);
  assert.equal(source.page, 2);
  assert.deepEqual(source.ocr, { flags: ['can_ra_soat'], minConfidence: 0.55 });
  assert.equal(source.readings[0].second, 'So ho ngheo giam con 12 ho.');
});

test('B8 không cần Qwen: ô biểu mẫu có chỉ tiêu tạo bản ghi bằng luật', () => {
  const field = el('p1-e3', 'form_field', 'Số hộ nghèo: 1.250', {
    field: { template: 'bieu-01', name: 'ho_ngheo', label: 'Số hộ nghèo', value: '1.250', indicator: { name: 'Số hộ nghèo trên địa bàn', unit: 'hộ' } },
  });
  const [record] = formIndicators({ pageFrom: 1, pageTo: 1, elementIds: ['p1-e3'] }, new Map([[field.id, field]]), 2026);
  assert.equal(record.payload.targetValue, 1250);
  assert.equal(record.payload.unit, 'hộ');
  assert.equal(record.payload.targetYear, 2026);
  assert.equal(record.template, 'bieu-01');
});

// ---------------------------------------------------------------------------
// Worker: đọc theo lô trang qua ocr-service; Qwen lỗi thì ghi rõ luật dự phòng

function workerWith(prisma: any, ollama: any) {
  const config = new ConfigService({ EXTRACTION_MAX_LLM_CHUNKS: '10' });
  const worker = new ExtractionWorker(prisma, ollama, config);
  return worker as any;
}

test('Worker B2–B7: ocr-service đọc theo lô trang, gia hạn lease sau mỗi lô, lưu phần tử và đoạn theo mục', async () => {
  const touches: { pagesDone?: number; pagesTotal?: number }[] = [];
  const saved: { pages?: any[]; chunks?: any[]; document?: any; completed?: any } = {};
  const tx = {
    documentPage: { deleteMany: async () => ({}), createMany: async ({ data }: any) => { saved.pages = data; } },
    documentChunk: { deleteMany: async () => ({}), createMany: async ({ data }: any) => { saved.chunks = data; } },
    sourceDocument: { updateMany: async ({ data }: any) => { saved.document = data; } },
    extractionJob: { create: async ({ data }: any) => { assert.equal(data.kind, ExtractionJobKind.INDICATOR_EXTRACT); } },
  };
  const prisma = {
    sourceDocument: {
      findUnique: async () => ({ id: 'doc-1', mimeType: 'application/pdf', originalName: 'qd.pdf', data: Buffer.from('%PDF-1.7'), status: 'UPLOADED', autoExtract: true }),
      updateMany: async () => ({ count: 1 }),
    },
    extractionJob: {
      updateMany: async ({ data }: any) => {
        if (data.status === 'COMPLETED') saved.completed = data;
        else if ('pagesDone' in data) touches.push(data);
        return { count: 1 };
      },
    },
    $transaction: async (fn: any) => fn(tx),
  };
  const worker = workerWith(prisma, {});
  const parsedPages: number[][] = [];
  const page = (n: number): StructuredPage => ({
    page: n, width: 595, height: 842, kind: n === 2 ? 'scan' : 'text', ocrUsed: n === 2, ocrConfidence: n === 2 ? 0.9 : null,
    text: `Trang ${n}`, spans: n === 2 ? [[0.1, 0.1, 0.5, 0.12, 'Trang 2']] : [[0.1, 0.1, 0.5, 0.12, `Trang ${n}`]],
    elements: n === 1
      ? [el('p1-e0', 'heading', 'Điều 1. Chỉ tiêu'), el('p1-e1', 'list_item', '1. Tỷ lệ hồ sơ trực tuyến đạt 95%.')]
      : [el(`p${n}-e0`, 'paragraph', `Nội dung trang ${n} có 3 mục.`, { page: n, source: n === 2 ? 'merged' : 'pdf_text', flags: n === 2 ? ['can_ra_soat'] : [] })],
  });
  worker.ocrClient = {
    enabled: true,
    config: { pageBatch: 2 },
    isReady: async () => true,
    inspect: async () => ({ kind: 'pdf', pageCount: 3, pages: [] }),
    parse: async (_buffer: Buffer, _name: string, range?: { from: number; to: number }) => {
      const pages = Array.from({ length: range!.to - range!.from + 1 }, (_, index) => range!.from + index);
      parsedPages.push(pages);
      return { parser: { name: 'ioc-ocr', version: '2.0.0', docling: '2.139.0' }, kind: 'pdf', pageCount: 3, pages: pages.map(page), warnings: [], elapsedMs: 5 };
    },
  };
  await worker.processParseJob({ id: 'job-1', documentId: 'doc-1', kind: ExtractionJobKind.DOCUMENT_PARSE, attempts: 1, createdById: 'u1' });
  assert.deepEqual(parsedPages, [[1, 2], [3]]);
  assert.deepEqual(touches.map(touch => touch.pagesDone), [0, 2, 3]);
  assert.equal(saved.pages?.length, 3);
  assert.equal(saved.pages?.[1].kind, 'scan');
  assert.equal(saved.pages?.[0].elements.length, 2);
  assert.ok(saved.chunks?.some(chunk => chunk.headingPath?.[0] === 'Điều 1. Chỉ tiêu'));
  assert.equal(saved.document.parserVersion, 'ioc-ocr 2.0.0 · docling 2.139.0');
  assert.equal(saved.completed.pagesTotal, 3);
  assert.equal(saved.completed.stats.ocrFlaggedElements, 1);
});

test('Worker B8: Qwen hết giờ thì dùng luật, ghi rõ trên job và bản ghi, không ghi tên model', async () => {
  const workerRef: { id?: string } = {};
  let completed: any;
  let created: any[] = [];
  const chunkText = '[Mục: Điều 2 > 1. Chỉ tiêu kinh tế]\n(1) Phấn đấu thu ngân sách nhà nước đạt 1.200 tỷ đồng.';
  const tx = {
    extractionJob: { updateMany: async ({ data }: any) => { completed = data; return { count: 1 }; }, findUnique: async () => null },
    indicatorCandidate: { deleteMany: async () => ({}), createMany: async ({ data }: any) => { created = data; } },
  };
  const prisma = {
    extractionJob: {
      findUnique: async () => ({ status: 'PROCESSING', lockedBy: workerRef.id, cancelRequestedAt: null }),
      updateMany: async () => ({ count: 1 }),
    },
    sourceDocument: { findUnique: async () => ({ id: 'doc-1', title: 'KH 15', docNumber: '15/KH-UBND', year: 2026, status: 'PROCESSED' }) },
    documentChunk: {
      findMany: async () => [
        { id: 'c0', chunkIndex: 0, pageFrom: 1, pageTo: 1, text: 'Căn cứ Luật Tổ chức chính quyền địa phương', kind: 'section', hasDigits: false, headingPath: null, elementIds: ['p1-e0'], leadSentence: null },
        { id: 'c1', chunkIndex: 1, pageFrom: 1, pageTo: 1, text: chunkText, kind: 'section', hasDigits: true, headingPath: ['Điều 2', '1. Chỉ tiêu kinh tế'], elementIds: ['p1-e2'], leadSentence: null },
      ],
    },
    documentPage: {
      findMany: async () => [{
        pageNumber: 1,
        elements: [
          el('p1-e0', 'paragraph', 'Căn cứ Luật Tổ chức chính quyền địa phương'),
          el('p1-e2', 'list_item', '(1) Phấn đấu thu ngân sách nhà nước đạt 1.200 tỷ đồng.'),
        ],
      }],
    },
    localityProfile: { findUnique: async () => null },
    department: { findMany: async () => [] },
    ...fakeEmbeddingPrisma([]),
    $transaction: async (fn: any) => fn(tx),
  };
  const ollama = {
    ...fakeOllama(),
    extractModel: 'qwen3:4b-instruct-2507-q4_K_M',
    numCtx: 8192,
    isAvailable: async () => true,
    chatStructured: async () => {
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'TimeoutError';
      throw error;
    },
  };
  const worker = workerWith(prisma, ollama);
  workerRef.id = worker.workerId;
  await worker.processExtractJob(
    { id: 'job-2', documentId: 'doc-1', kind: ExtractionJobKind.INDICATOR_EXTRACT, attempts: 1, createdById: 'u1' },
    new AbortController().signal,
  );
  assert.equal(completed.model, null, 'không ghi tên model khi Qwen không đọc được đoạn nào');
  assert.equal(completed.promptVersion, 'rule-v1');
  assert.match(completed.note, /Qwen lỗi ở 1\/1 đoạn \(1 đoạn hết giờ\)/);
  assert.equal(completed.stats.skippedNoDigits, 1);
  assert.equal(completed.stats.ruleFallbackChunks, 1);
  assert.ok(created.length >= 1);
  const record = created[0];
  assert.equal(record.extractionMethod, ExtractionMethod.RULE_BASED);
  assert.match(record.warnings[0], /Qwen hết giờ ở đoạn này/);
  assert.deepEqual(record.headingPath, ['Điều 2', '1. Chỉ tiêu kinh tế']);
  assert.deepEqual(record.sourceElementIds, ['p1-e2']);
  assert.equal(record.matchClass, 'MOI');
});
