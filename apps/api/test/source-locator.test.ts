import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSpans, tsvSpans } from '../src/source-layout';
import { candidatePages, foldKey, locateText, scopePages, textLayoutPage, unitSection, type LayoutPage, type LayoutSpan } from '../src/source-locator';

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

test('nhận ra văn bản giao cho nhiều đơn vị và phần của đơn vị mình (để AI chỉ trích xuất phần đó)', () => {
  assert.deepEqual(unitSection(pages, 'Lái Thiêu'), { pages: [2], otherUnits: 2, multiUnit: true });
  // Văn bản chia phần nhưng không có phần của mình: vẫn biết là văn bản chia phần, không lấy phần nào.
  assert.deepEqual(unitSection(pages, 'Bình Nhâm'), { pages: [], otherUnits: 3, multiUnit: true });
  // Tên địa phương nhập kèm loại đơn vị vẫn nhận đúng.
  assert.deepEqual(unitSection(pages, 'Phường Lái Thiêu').pages, [2]);
});

// Văn bản của chính phường: đầu văn bản hai dòng, nhiều dòng văn xuôi bắt đầu bằng "Phường …" — không phải văn bản chia phần.
const ownPlan = [
  textLayoutPage(1, 'ỦY BAN NHÂN DÂN\nPHƯỜNG LÁI THIÊU\nKẾ HOẠCH\nPhát triển kinh tế – xã hội năm 2026\n1. Tỷ lệ hồ sơ đúng hạn đạt 98%'),
  textLayoutPage(2, 'Phường phấn đấu tăng thu ngân sách\n2. Tỷ lệ dân số tham gia bảo hiểm y tế trên địa bàn\nphường đạt 95%'),
  textLayoutPage(3, 'phường giảm tỷ lệ hộ nghèo còn 0,8%\nPhường Bình Hòa, phường An Phú phối hợp\n3. Trồng mới 1.200 cây xanh'),
];

test('văn bản của chính phường (đầu văn bản hai dòng, văn xuôi bắt đầu "Phường …") không bị coi là văn bản chia phần', () => {
  assert.deepEqual(unitSection(ownPlan, 'Lái Thiêu'), { pages: [], otherUnits: 0, multiUnit: false });
  // Đầu văn bản một dòng cũng vậy: đơn vị khác chỉ được nhắc trong văn xuôi, không có đầu phần riêng.
  const oneLine = [textLayoutPage(1, 'ỦY BAN NHÂN DÂN PHƯỜNG LÁI THIÊU\nKẾ HOẠCH'), ...ownPlan.slice(1)];
  assert.equal(unitSection(oneLine, 'Lái Thiêu').multiUnit, false);
  const found = locateText(ownPlan, 'Tỷ lệ dân số tham gia bảo hiểm y tế', { scope: 'Lái Thiêu' });
  assert.equal(found?.pageNumber, 2);
});

function appendix(sections: [string, number][], extra: Record<number, string> = {}): LayoutPage[] {
  const result: LayoutPage[] = [];
  let pageNumber = 1;
  for (const [unit, length] of sections) {
    for (let index = 0; index < length; index += 1, pageNumber += 1) {
      const header = index === 0 ? `ĐƠN VỊ: ỦY BAN NHÂN DÂN ${unit}\n` : '';
      result.push(textLayoutPage(pageNumber, `${header}TT CHỈ TIÊU CHỦ YẾU Đơn vị tính\nTỷ lệ dân số tham gia bảo hiểm y tế\n${extra[pageNumber] ?? ''}`));
    }
  }
  return result;
}

test('phần của đơn vị kéo tới trước đầu phần kế tiếp (không giới hạn số trang), bỏ trang tổng hợp chỉ nhắc tên', () => {
  const long = appendix([['PHƯỜNG AN PHÚ', 2], ['PHƯỜNG LÁI THIÊU', 10], ['XÃ THANH AN', 2], ['ĐẶC KHU CÔN ĐẢO', 1]]);
  assert.deepEqual(unitSection(long, 'Lái Thiêu').pages, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  // Trang tổng hợp cuối có dòng "Phường Lái Thiêu 96%": không thuộc phần của phường, các phần ở giữa cũng không.
  const summary = appendix([['PHƯỜNG LÁI THIÊU', 2], ['PHƯỜNG THUẬN GIAO', 2], ['PHƯỜNG HƯNG ĐỊNH', 2], ['TỔNG HỢP CHUNG', 1]], { 7: 'Phường Lái Thiêu 96%' });
  assert.deepEqual(unitSection(summary, 'Lái Thiêu').pages, [1, 2]);
});

test('tên đơn vị so có dấu: Thanh An và Thạnh An là hai phần khác nhau; đầu phần thiếu chữ "phường" vẫn nhận', () => {
  const doc = appendix([['XÃ THANH AN', 2], ['XÃ THẠNH AN', 2], ['AN LẠC', 1], ['PHƯỜNG AN PHÚ', 1]]);
  assert.deepEqual(unitSection(doc, 'Thạnh An').pages, [3, 4]);
  assert.deepEqual(unitSection(doc, 'Thanh An').pages, [1, 2]);
  assert.deepEqual(unitSection(doc, 'An Lạc').pages, [5]);
});

test('văn bản chia phần: không lấy dòng cùng tên chỉ tiêu ở phần của đơn vị khác', () => {
  // Chỉ tiêu không có trong phần của phường mình (chỉ có ở phường khác) → không định vị, không lấy nhầm.
  assert.equal(locateText(pages, 'Tỷ lệ dân số tham gia bảo hiểm y tế', { scope: 'Lái Thiêu', hintPages: [1] })?.pageNumber, 2);
  const texts = pages.map(page => ({ pageNumber: page.pageNumber, text: page.spans.map(span => span[4]).join('\n') }));
  assert.deepEqual(candidatePages(texts, 'Tỷ lệ dân số tham gia bảo hiểm y tế', { scope: 'Bình Nhâm' }), { pages: [], scope: 'absent' });
  assert.equal(locateText(pages, 'Tỷ lệ dân số tham gia bảo hiểm y tế', { scope: 'Bình Nhâm' }), null);
  const absent = appendix([['PHƯỜNG AN PHÚ', 1], ['PHƯỜNG THUẬN GIAO', 1], ['PHƯỜNG HƯNG ĐỊNH', 1], ['PHƯỜNG LÁI THIÊU', 1]]).slice(0, 3);
  assert.deepEqual(candidatePages(absent.map(page => ({ pageNumber: page.pageNumber, text: page.spans.map(span => span[4]).join('\n') })), 'Tỷ lệ dân số tham gia bảo hiểm y tế', { scope: 'Lái Thiêu' }), { pages: [], scope: 'absent' });
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

test('lọc trang theo chữ của trang và phạm vi đơn vị', () => {
  const texts = pages.map(page => ({ pageNumber: page.pageNumber, text: page.spans.map(span => span[4]).join('\n') }));
  assert.deepEqual(candidatePages(texts, 'Tỷ lệ dân số tham gia bảo hiểm y tế', { scope: 'Lái Thiêu' }), { pages: [2], scope: 'own' });
  assert.equal(candidatePages(texts, 'Tỷ lệ dân số tham gia bảo hiểm y tế').pages.length, 3);
  assert.deepEqual(candidatePages(texts, 'abc'), { pages: [], scope: 'none' });
  // Trang gợi ý nằm ở phần đơn vị khác bị bỏ, tìm trong phần của mình.
  assert.deepEqual(candidatePages(texts, 'Tỷ lệ dân số tham gia bảo hiểm y tế', { scope: 'Lái Thiêu', hintPages: [3] }).pages, [2]);
});

test('văn xuôi có khối đầu văn bản hai bên: câu kết thúc ở dòng ngắn vẫn khớp', () => {
  const page: LayoutPage = {
    pageNumber: 1,
    spans: [
      [0.15, 0.05, 0.37, 0.062, 'ỦY BAN NHÂN DÂN'], [0.15, 0.065, 0.37, 0.077, 'PHƯỜNG LÁI THIÊU'], [0.15, 0.08, 0.33, 0.092, 'Số: 21/KH-UBND'],
      [0.48, 0.05, 0.92, 0.062, 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'], [0.55, 0.065, 0.85, 0.077, 'Độc lập - Tự do - Hạnh phúc'], [0.52, 0.08, 0.9, 0.092, 'Lái Thiêu, ngày 15 tháng 01 năm 2026'],
      [0.1, 0.2, 0.9, 0.212, 'Giải quyết việc làm mới cho 2.500 người trong năm 2026, ưu tiên lao động trên'],
      [0.1, 0.215, 0.36, 0.227, 'địa bàn phường bị mất việc.'],
    ],
  };
  const found = locateText([page], 'ưu tiên lao động trên địa bàn phường bị mất việc');
  assert.ok(found);
  assert.ok(found.matchBox[3] >= 0.227);
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

test('OCR bảng: dòng Tesseract chạy ngang nhiều cột được tách thành ô theo khoảng trống lớn', () => {
  const tsv = [
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
    '1\t1\t0\t0\t0\t0\t0\t0\t1000\t2000\t-1\t',
    '5\t1\t1\t1\t1\t1\t100\t200\t60\t20\t95\tTỷ',
    '5\t1\t1\t1\t1\t2\t170\t200\t30\t20\t95\tlệ',
    '5\t1\t1\t1\t1\t3\t420\t200\t20\t20\t95\t%',
    '5\t1\t1\t1\t1\t4\t600\t200\t40\t20\t95\tNăm',
  ].join('\n');
  assert.deepEqual(tsvSpans(tsv).map(span => span[4]), ['Tỷ lệ', '%', 'Năm']);
});

test('số thứ tự đứng giữa ô nhiều dòng không bị gộp vào dòng tên chỉ tiêu', () => {
  const merged = mergeSpans([[0.066, 0.2, 0.081, 0.211, '4'], [0.093, 0.2, 0.309, 0.211, 'quản lý đăng ký và sử dụng chữ ký số']]);
  assert.deepEqual(merged.map(span => span[4]), ['4', 'quản lý đăng ký và sử dụng chữ ký số']);
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
