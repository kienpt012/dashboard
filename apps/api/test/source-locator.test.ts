import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSpans, tsvSpans } from '../src/source-layout';
import { candidatePages, foldKey, locateText, scopePages, textLayoutPage, type LayoutPage, type LayoutSpan } from '../src/source-locator';

// Trang bảng giao chỉ tiêu dựng giả theo bố cục phụ lục thật: cột TT | Chỉ tiêu | Đơn vị | Kế hoạch | Kỳ báo cáo,
// tên chỉ tiêu xuống dòng trong ô, số TT nằm giữa hai dòng, chú thích cuối trang vắt qua nhiều cột.
function row(y: number, stt: string, title: string[], unit: string, plan: string[]): LayoutSpan[] {
  const h = 0.011;
  const spans: LayoutSpan[] = title.map((line, index) => [0.093, y + index * 0.013, 0.093 + line.length * 0.006, y + index * 0.013 + h, line]);
  const middle = y + ((title.length - 1) * 0.013) / 2;
  spans.push([0.066, middle, 0.081, middle + h, stt], [0.358, middle, 0.37, middle + h, unit]);
  plan.forEach((line, index) => spans.push([0.41, y + index * 0.013, 0.41 + line.length * 0.006, y + index * 0.013 + h, line]));
  spans.push([0.551, middle, 0.701, middle + h, 'Tháng, quý, 6 tháng, năm']);
  return spans;
}

function wardPage(pageNumber: number, ward: string, planValue: string): LayoutPage {
  return {
    pageNumber,
    spans: [
      [0.3, 0.02, 0.7, 0.03, `ĐƠN VỊ: ỦY BAN NHÂN DÂN PHƯỜNG ${ward.toUpperCase()}`],
      [0.063, 0.052, 0.083, 0.063, 'TT'],
      [0.139, 0.052, 0.278, 0.063, 'CHỈ TIÊU CHỦ YẾU'],
      [0.424, 0.052, 0.516, 0.063, 'Kế hoạch 2026'],
      ...row(0.1, '1', ['Tốc độtăng tổng giá trị sản phẩm trên', 'địa bàn'], '%', ['11']),
      ...row(0.14, '2', ['Tỷ lệ giải quyết hồ sơ hành chính', 'đúng hạn trên các lĩnh vực đạt'], '%', [planValue]),
      ...row(0.18, '3', ['Kéo giảm tổng số vụ tội phạm về trật', 'tự xã hội so với năm trước'], '%', ['Giảm 10% số vụ so', 'với năm 2025']),
      ...row(0.22, '4', ['Tỷ lệ dân số tham gia bảo hiểm y tế'], '%', ['≥ 95']),
      // Chú thích hẹp hơn nửa trang nhưng vắt qua cột tên chỉ tiêu, đơn vị và kế hoạch.
      [0.093, 0.7, 0.518, 0.711, '(***) Đối với địa phương năm 2025 không để xảy ra thì tiếp tục duy trì.'],
    ],
  };
}

const pages: LayoutPage[] = [wardPage(1, 'An Phú', '95'), wardPage(2, 'Lái Thiêu', '96,88'), wardPage(3, 'Thuận Giao', '97')];

test('foldKey bỏ dấu, khoảng trắng, ký tự lạ', () => {
  assert.equal(foldKey('Tốc độ tăng – GRDP (%)'), 'tocdotanggrdp');
  assert.equal(foldKey('Đường'), 'duong');
});

test('chỉ tìm trong phần văn bản của đơn vị mình', () => {
  assert.deepEqual(scopePages(pages, 'Lái Thiêu'), [2]);
  const found = locateText(pages, 'Tỷ lệ giải quyết hồ sơ hành chính đúng hạn trên các lĩnh vực', { scope: 'Lái Thiêu' });
  assert.ok(found);
  assert.equal(found.pageNumber, 2);
});

test('tên chỉ tiêu xuống dòng, có chữ dính: khớp đủ cả ô, không lẫn chữ cột khác', () => {
  const found = locateText(pages, 'Tốc độ tăng tổng giá trị sản phẩm trên địa bàn', { hintPages: [2] });
  assert.ok(found);
  assert.ok(found.score > 0.9);
  assert.equal(found.quote, 'Tốc độtăng tổng giá trị sản phẩm trên địa bàn');
  // Khung tô sáng phủ cả hàng: từ cột TT tới cột kỳ báo cáo, đủ hai dòng của ô.
  assert.ok(found.box[0] <= 0.067 && found.box[2] >= 0.7);
  assert.ok(found.box[1] <= 0.1 && found.box[3] >= 0.124);
});

test('chú thích vắt ngang không nối cột tên chỉ tiêu với cột kế hoạch', () => {
  const found = locateText(pages, 'Kéo giảm tổng số vụ tội phạm về trật tự xã hội so với năm trước', { hintPages: [2] });
  assert.ok(found);
  assert.equal(found.quote, 'Kéo giảm tổng số vụ tội phạm về trật tự xã hội so với năm trước');
  const plan = locateText(pages, 'Tỷ lệ giải quyết hồ sơ hành chính đúng hạn trên các lĩnh vực đạt', { hintPages: [2] });
  assert.equal(plan?.quote, 'Tỷ lệ giải quyết hồ sơ hành chính đúng hạn trên các lĩnh vực đạt');
});

test('không thấy thì trả về null', () => {
  assert.equal(locateText(pages, 'Tỷ lệ hộ kinh doanh thanh toán không dùng tiền mặt'), null);
});

test('văn xuôi: câu vắt qua hai dòng vẫn khớp', () => {
  const prose: LayoutPage = {
    pageNumber: 7,
    spans: [
      [0.1, 0.1, 0.9, 0.112, 'Phấn đấu đến cuối năm 2026, tỷ lệ hồ sơ thủ tục hành chính được tiếp nhận'],
      [0.1, 0.115, 0.9, 0.127, 'và giải quyết trực tuyến toàn trình đạt từ 80% trở lên; tỷ lệ người dân hài'],
      [0.1, 0.13, 0.5, 0.142, 'lòng với dịch vụ công đạt trên 90%.'],
    ],
  };
  const found = locateText([prose], 'tỷ lệ hồ sơ thủ tục hành chính được tiếp nhận và giải quyết trực tuyến toàn trình');
  assert.ok(found);
  assert.equal(found.pageNumber, 7);
  assert.ok(found.matchBox[1] <= 0.1 && found.matchBox[3] >= 0.127);
});

test('lọc trang theo chữ của trang và phạm vi đơn vị; tìm lại toàn văn bản khi phần đơn vị không có', () => {
  const texts = pages.map(page => ({ pageNumber: page.pageNumber, text: page.spans.map(span => span[4]).join('\n') }));
  const picked = candidatePages(texts, 'Tỷ lệ dân số tham gia bảo hiểm y tế', { scope: 'Lái Thiêu' });
  assert.deepEqual(picked, { pages: [2], scoped: true });
  const unscoped = candidatePages(texts, 'Tỷ lệ dân số tham gia bảo hiểm y tế');
  assert.equal(unscoped.pages.length, 3);
  assert.deepEqual(candidatePages(texts, 'abc'), { pages: [], scoped: false });
});

test('trang chỉ có chữ (DOCX): tìm được trang và câu', () => {
  const page = textLayoutPage(3, 'KẾ HOẠCH\nTỷ lệ trường Mầm non đạt\nchuẩn Quốc gia: 9%\nGhi chú');
  const found = locateText([page], 'Tỷ lệ trường Mầm non đạt chuẩn Quốc gia');
  assert.equal(found?.pageNumber, 3);
  assert.match(found?.quote ?? '', /Mầm non đạt chuẩn Quốc gia/);
});

test('gộp mảnh chữ cùng dòng của pdf.js thành một đoạn', () => {
  const merged = mergeSpans([
    [0.1, 0.1, 0.2, 0.11, 'Tốc độ'],
    [0.2005, 0.1, 0.3, 0.11, 'tăng'],
    [0.305, 0.1, 0.4, 0.11, 'tổng'],
    [0.6, 0.1, 0.62, 0.11, '%'],
  ]);
  assert.deepEqual(merged.map(span => span[4]), ['Tốc độtăng tổng', '%']);
});

test('đọc khung dòng từ TSV của Tesseract (chuẩn hoá theo kích thước ảnh)', () => {
  const tsv = [
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
    '1\t1\t0\t0\t0\t0\t0\t0\t1000\t2000\t-1\t',
    '5\t1\t1\t1\t1\t1\t100\t200\t80\t20\t95\tTỷ',
    '5\t1\t1\t1\t1\t2\t190\t200\t60\t20\t93\tlệ',
    '5\t1\t1\t1\t2\t1\t100\t240\t120\t20\t90\thộ nghèo',
  ].join('\n');
  assert.deepEqual(tsvSpans(tsv), [
    [0.1, 0.1, 0.25, 0.11, 'Tỷ lệ'],
    [0.1, 0.12, 0.22, 0.13, 'hộ nghèo'],
  ]);
});
