import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chunkParsedPages,
  detectDocumentKind,
  groupTableRows,
  isTableLikePage,
  normalizeExtractedText,
  parseTesseractTsv,
} from '../src/document-processing';
import { nextDocumentCode, sanitizeDocumentFileName } from '../src/documents';

function zipWithEntry(name: string): Buffer {
  const nameBytes = Buffer.from(name, 'utf8');
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6); // không dùng data descriptor
  header.writeUInt32LE(0, 18); // compressedSize 0
  header.writeUInt16LE(nameBytes.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBytes]);
}

test('nhận diện tài liệu theo chữ ký nội dung, không tin MIME khai báo', () => {
  assert.equal(detectDocumentKind(Buffer.from('%PDF-1.7 abc'))?.kind, 'pdf');
  assert.equal(detectDocumentKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.kind, 'image');
  assert.equal(
    detectDocumentKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))?.kind,
    'image',
  );
  assert.equal(detectDocumentKind(Buffer.from('vd hop le khong phai tai lieu')), null);
});

test('phân biệt DOCX và XLSX bằng entry bên trong container ZIP', () => {
  assert.equal(detectDocumentKind(zipWithEntry('word/document.xml'))?.kind, 'docx');
  assert.equal(detectDocumentKind(zipWithEntry('xl/workbook.xml'))?.kind, 'xlsx');
  // ZIP thường (không phải OOXML) bị từ chối.
  assert.equal(detectDocumentKind(zipWithEntry('anything/else.txt')), null);
});

test('mã tài liệu tăng dần theo năm và không nhảy khi có mã năm khác', () => {
  assert.equal(nextDocumentCode(2026, []), 'VB-2026-0001');
  assert.equal(nextDocumentCode(2026, ['VB-2026-0001', 'VB-2026-0007', 'VB-2025-0099']), 'VB-2026-0008');
});

test('tên tệp được làm sạch chống path traversal và ký tự điều khiển', () => {
  assert.equal(sanitizeDocumentFileName('..\\..\\danger\\ke hoach.pdf'), 'ke hoach.pdf');
  assert.equal(sanitizeDocumentFileName('bao<cao>:2026?.docx'), 'bao_cao__2026_.docx');
  assert.equal(sanitizeDocumentFileName(''), 'tai-lieu');
});

test('chuẩn hóa văn bản gộp dòng trống và loại ký tự vô hình', () => {
  const input = 'A B\r\n\r\n\r\n\r\nC​';
  assert.equal(normalizeExtractedText(input), 'A B\n\nC');
});

test('chunk giữ đúng dấu vết trang nguồn và không vượt quá kích thước mục tiêu', () => {
  const longParagraph = 'Nội dung dài. '.repeat(50).trim(); // ~700 ký tự
  const pages = [
    { pageNumber: 1, text: `${longParagraph}\n\n${longParagraph}`, ocrUsed: false },
    { pageNumber: 2, text: `${longParagraph}\n\n${longParagraph}`, ocrUsed: false },
  ];
  const chunks = chunkParsedPages(pages);
  assert.ok(chunks.length >= 2);
  assert.equal(chunks[0].pageFrom, 1);
  assert.equal(chunks[chunks.length - 1].pageTo, 2);
  for (const [index, chunk] of chunks.entries()) {
    assert.equal(chunk.chunkIndex, index);
    assert.ok(chunk.charCount <= 2200, `chunk ${index} quá dài: ${chunk.charCount}`);
    assert.ok(chunk.pageFrom <= chunk.pageTo);
  }
});

test('đoạn đơn quá dài (bảng lớn) được cắt cứng theo dòng, không mất nội dung', () => {
  const row = 'Cột A\tCột B\tCột C';
  const bigTable = Array.from({ length: 200 }, (_, i) => `${i + 1}\t${row}`).join('\n');
  const chunks = chunkParsedPages([{ pageNumber: 3, text: bigTable, ocrUsed: false }]);
  assert.ok(chunks.length > 1);
  const joined = chunks.map(chunk => chunk.text).join('\n');
  assert.ok(joined.includes('200\t'));
  for (const chunk of chunks) {
    assert.equal(chunk.pageFrom, 3);
    assert.equal(chunk.pageTo, 3);
  }
});

test('trang bảng chỉ tiêu: chunk theo cụm hàng, giữ tiêu đề mục và không tách hàng nối dòng', () => {
  const tableText = [
    'II Chỉ tiêu văn hóa - xã hội',
    '9 Tỷ lệ người dân tham gia bảo hiểm y tế % ≥ 95 Bảo hiểm xã hội',
    'Thành phố',
    '- Tỷ lệ người dân tham gia bảo hiểm xã hội đạt ít',
    'nhất 58% lực lượng lao động trong độ tuổi % ≥ 58',
    '10 Tỷ lệ trường đạt chuẩn quốc gia',
    '- Mầm non đạt tỷ lệ % 38 Sở Giáo dục',
    '- Tiểu học đạt tỷ lệ % 35,3 Sở Giáo dục',
  ].join('\n');
  assert.equal(isTableLikePage(tableText), true);
  const rows = groupTableRows(tableText, 2);
  // Dòng nối ("Thành phố", "nhất 58%...") phải dính vào hàng phía trên.
  const bhytRow = rows.find(row => row.text.includes('bảo hiểm y tế'));
  assert.ok(bhytRow && bhytRow.text.includes('Thành phố'));
  const bhxhRow = rows.find(row => row.text.startsWith('- Tỷ lệ người dân tham gia bảo hiểm xã hội'));
  assert.ok(bhxhRow && bhxhRow.text.includes('nhất 58%'));

  const chunks = chunkParsedPages([{ pageNumber: 2, text: tableText, ocrUsed: false }]);
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].text.startsWith('[Mục: II Chỉ tiêu văn hóa - xã hội]'));
  assert.equal(chunks[0].pageFrom, 2);
});

test('bảng dài được cắt theo số hàng dữ liệu, mỗi chunk mang lại tiêu đề mục', () => {
  const lines = ['I Chỉ tiêu về kinh tế'];
  for (let i = 1; i <= 20; i += 1) lines.push(`${i} Chỉ tiêu số ${i} đạt mức kế hoạch % ${i * 2} Sở Ngành ${i}`);
  const chunks = chunkParsedPages([{ pageNumber: 1, text: lines.join('\n'), ocrUsed: false }]);
  assert.ok(chunks.length >= 2, `cần >=2 chunk, được ${chunks.length}`);
  for (const chunk of chunks) {
    assert.ok(chunk.text.includes('[Mục: I Chỉ tiêu về kinh tế]'));
    const dataRows = chunk.text.split('\n').filter(line => /^\d{1,2}\s/.test(line)).length;
    assert.ok(dataRows <= 8, `chunk có ${dataRows} hàng dữ liệu (>8)`);
  }
});

test('đọc TSV của tesseract: ghép từ theo dòng và tính độ tin cậy trung bình', () => {
  const header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
  const tsv = [
    header,
    '5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t95\tTỷ',
    '5\t1\t1\t1\t1\t2\t12\t0\t10\t10\t85\tlệ',
    '5\t1\t1\t1\t2\t1\t0\t20\t10\t10\t90\tđạt',
    '4\t1\t1\t1\t2\t0\t0\t20\t10\t10\t-1\t', // dòng không phải word bị bỏ qua
  ].join('\n');
  const result = parseTesseractTsv(tsv);
  assert.equal(result.text, 'Tỷ lệ\nđạt');
  assert.equal(result.confidence, 0.9);
});
