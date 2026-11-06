import assert from 'node:assert/strict';
import test from 'node:test';
import {
  categoryByKeywords,
  categoryFromHeadings,
  chunkBody,
  cleanHeading,
  detectOrdinal,
  documentGroups,
  documentOrderKey,
  locateQuote,
  pickCategoryByScore,
} from '../src/extraction-structure';

// Đoạn văn xuôi kiểu Quyết định giao chỉ tiêu: cả mục là một đoạn văn dài, nhiều chỉ tiêu dùng chung một số.
const PROSE = [
  '[Mục: QUYẾT ĐỊNH > Điều 3. Chỉ tiêu phát triển kinh tế - xã hội năm 2026 > 2. Chỉ tiêu về y tế và chăm sóc sức khỏe]',
  '[Đầu mục: Trạm Y tế phường chủ trì theo dõi nhóm chỉ tiêu y tế. (9) Tỷ lệ người dân tham gia bảo hiểm y tế đạt ≥ 95,5%. Tỷ lệ dân số được tạo lập hồ sơ sức…]',
  'Trạm Y tế phường chủ trì theo dõi nhóm chỉ tiêu y tế. (9) Tỷ lệ người dân tham gia bảo hiểm y tế đạt ≥ 95,5%. Tỷ lệ dân số được tạo lập hồ sơ sức khỏe điện tử đạt ít nhất 90%. (10) Tỷ lệ trẻ em dưới một tuổi được tiêm chủng đầy đủ đạt tối thiểu 98%. (12) Giảm ít nhất 10% số ca mắc sốt xuất huyết so với năm 2025. Số ca mắc năm 2025 là 120 ca.',
].join('\n');

test('chunkBody bỏ dòng [Mục] và [Đầu mục] để không tìm nhầm câu trích trong phần tóm tắt đầu mục', () => {
  const body = chunkBody(PROSE);
  assert.ok(body.startsWith('Trạm Y tế phường'));
  assert.ok(!body.includes('[Mục:'));
  assert.equal(chunkBody('Không có đầu mục'), 'Không có đầu mục');
});

test('locateQuote: thứ tự theo vị trí câu trích, chịu được câu trích bị cắt, khác khoảng trắng hoặc chỉ có giá trị', () => {
  const body = chunkBody(PROSE);
  const nine = locateQuote(body, 'Tỷ lệ người dân tham gia bảo hiểm y tế đạt ≥ 95,5%', 95.5)!;
  const ehr = locateQuote(body, 'Tỷ lệ  dân số được tạo lập\nhồ sơ sức khỏe điện tử đạt ít nhất 90%', 90)!;
  const ten = locateQuote(body, 'Tỷ lệ trẻ em dưới một tuổi được tiêm chủng đầy đủ đạt tối thiểu 98% theo chương trình mở rộng', 98)!;
  const dengue = locateQuote(body, 'giảm số ca sốt xuất huyết', 10)!;
  assert.ok(nine < ehr && ehr < ten && ten < dengue, `${nine} < ${ehr} < ${ten} < ${dengue}`);
  assert.equal(body.slice(nine, nine + 6), 'Tỷ lệ ');
  assert.equal(locateQuote(body, 'Không có câu này trong văn bản', null), null);
});

test('detectOrdinal: văn xuôi lấy số gần nhất phía trước, hai chỉ tiêu cùng mục dùng chung số', () => {
  const body = chunkBody(PROSE);
  const at = (quote: string) => detectOrdinal(body, locateQuote(body, quote, null));
  assert.equal(at('Tỷ lệ người dân tham gia bảo hiểm y tế'), '9');
  assert.equal(at('Tỷ lệ dân số được tạo lập hồ sơ sức khỏe điện tử'), '9');
  assert.equal(at('Tỷ lệ trẻ em dưới một tuổi được tiêm chủng'), '10');
  assert.equal(at('Giảm ít nhất 10% số ca mắc sốt xuất huyết'), '12');
  assert.equal(at('Trạm Y tế phường chủ trì theo dõi'), null, 'câu trước mục đầu tiên không có số');
  // Câu trích bắt đầu bằng chính dấu đánh số.
  assert.equal(detectOrdinal(body, locateQuote(body, '(10) Tỷ lệ trẻ em', null)), '10');
});

test('detectOrdinal: dạng 1. và a) ở đầu dòng, dòng gạch đầu dòng là chỉ tiêu thành phần', () => {
  const body = '1. Tỷ lệ hồ sơ trực tuyến đạt 95%.\na) Tỷ lệ số hóa kết quả đạt 100%.\n- Trong đó cấp phường đạt 90%.\nĐạt 12 buổi tập huấn.';
  assert.equal(detectOrdinal(body, body.indexOf('Tỷ lệ hồ sơ')), '1');
  assert.equal(detectOrdinal(body, body.indexOf('Tỷ lệ số hóa')), 'a');
  assert.equal(detectOrdinal(body, body.indexOf('Trong đó')), null);
  assert.equal(detectOrdinal(body, body.indexOf('Đạt 12')), null, 'số lượng ở đầu câu không phải số thứ tự');
  assert.equal(detectOrdinal(body, null), null);
});

test('detectOrdinal: bảng lấy ô STT ở đầu hàng (dạng chữ thường và markdown)', () => {
  const plain = 'STT Chỉ tiêu Đơn vị Kế hoạch\n9 Tỷ lệ hộ nghèo % 1,5\n- Hộ cận nghèo hộ 80\nII Chỉ tiêu văn hóa';
  assert.equal(detectOrdinal(plain, plain.indexOf('Tỷ lệ hộ nghèo'), 'table'), '9');
  assert.equal(detectOrdinal(plain, plain.indexOf('Hộ cận nghèo'), 'table'), null);
  assert.equal(detectOrdinal(plain, plain.indexOf('Chỉ tiêu văn hóa'), 'table'), 'II');
  const markdown = '| STT | Chỉ tiêu | Kế hoạch |\n| 2.1 | Thu ngân sách | 125 |\n|  | Trong đó thu thuế | 80 |';
  assert.equal(detectOrdinal(markdown, markdown.indexOf('Thu ngân sách'), 'table'), '2.1');
  assert.equal(detectOrdinal(markdown, markdown.indexOf('Trong đó'), 'table'), null);
});

test('documentOrderKey: theo số đoạn rồi vị trí; không định vị được thì cuối đoạn', () => {
  assert.ok(documentOrderKey(1, 50) < documentOrderKey(1, 900));
  assert.ok(documentOrderKey(1, null) < documentOrderKey(2, 0));
  assert.ok(documentOrderKey(1, 9_000) < documentOrderKey(1, null));
  assert.equal(documentOrderKey(3, 250_000), 3 * 10_000 + 9_998);
});

test('documentGroups: nhóm là cấp đề mục bắt đầu khác nhau, không bị một chỉ tiêu lạc mục làm hỏng', () => {
  const base = ['QUYẾT ĐỊNH', 'Điều 3. Chỉ tiêu phát triển kinh tế - xã hội năm 2026'];
  const paths = [
    ...Array.from({ length: 10 }, () => [...base, '1. Chỉ tiêu về kinh tế']),
    ...Array.from({ length: 8 }, () => [...base, '2. Chỉ tiêu về y tế và chăm sóc sức khỏe']),
    [...base, '2. Chỉ tiêu về y tế và chăm sóc sức khỏe', 'a) Phòng chống dịch'],
    ['ỦY BAN NHÂN DÂN PHƯỜNG MINH AN'],
    null,
  ];
  const groups = documentGroups(paths);
  assert.equal(groups[0], '1. Chỉ tiêu về kinh tế');
  assert.equal(groups[10], '2. Chỉ tiêu về y tế và chăm sóc sức khỏe');
  assert.equal(groups[18], '2. Chỉ tiêu về y tế và chăm sóc sức khỏe', 'mục con vẫn thuộc nhóm của mục cha');
  assert.equal(groups[19], 'ỦY BAN NHÂN DÂN PHƯỜNG MINH AN');
  assert.equal(groups[20], null);
  // Cả văn bản một mục: nhóm là đề mục cuối.
  assert.deepEqual(documentGroups([['Phụ lục 1', 'I. Chỉ tiêu kinh tế'], ['Phụ lục 1', 'I. Chỉ tiêu kinh tế']]), ['I. Chỉ tiêu kinh tế', 'I. Chỉ tiêu kinh tế']);
  assert.deepEqual(documentGroups([]), []);
});

test('cleanHeading bỏ ký tự rác OCR ở đầu, giữ cách đánh số của văn bản', () => {
  assert.equal(cleanHeading('? Công tác  Nội vụ'), 'Công tác Nội vụ');
  assert.equal(cleanHeading('a) Chỉ tiêu về kinh tế'), 'a) Chỉ tiêu về kinh tế');
  assert.equal(cleanHeading('(1) Thu ngân sách'), '(1) Thu ngân sách');
});

test('categoryByKeywords: lĩnh vực chuẩn theo đề mục; cụm "kinh tế - xã hội" chung chung thì không đoán', () => {
  assert.equal(categoryByKeywords('1. Chỉ tiêu về kinh tế'), 'Kinh tế');
  assert.equal(categoryByKeywords('2. Chỉ tiêu về y tế và chăm sóc sức khỏe'), 'Y tế');
  assert.equal(categoryByKeywords('3. Chỉ tiêu về hành chính công và chuyển đổi số'), 'Hành chính công - chuyển đổi số');
  assert.equal(categoryByKeywords('II. CHỈ TIÊU VĂN HÓA - XÃ HỘI'), 'Văn hoá - xã hội');
  assert.equal(categoryByKeywords('Công tác Nội vụ'), 'Hành chính công - chuyển đổi số');
  assert.equal(categoryByKeywords('V. Chỉ tiêu bảo đảm quốc phòng, an ninh'), 'An ninh - quốc phòng');
  assert.equal(categoryByKeywords('Tỷ lệ chất thải rắn sinh hoạt được thu gom'), 'Đô thị - môi trường');
  assert.equal(categoryByKeywords('Điều 3. Chỉ tiêu phát triển kinh tế - xã hội năm 2026'), null);
  assert.equal(categoryByKeywords('Chỉ tiêu kinh tế - xã hội chủ yếu năm 2026'), null);
  assert.equal(categoryByKeywords('Bảo vệ môi trường đô thị'), 'Đô thị - môi trường', '"môi trường" không bị bắt nhầm thành "trường học"');
  assert.equal(categoryByKeywords('Giảm tai nạn, an toàn giao thông'), 'An ninh - quốc phòng');
  assert.equal(categoryByKeywords(null), null);
});

test('categoryFromHeadings: đề mục sâu nhất có từ khoá thắng, an toàn thực phẩm dưới mục y tế vẫn là y tế', () => {
  assert.equal(categoryFromHeadings(['QUYẾT ĐỊNH', 'Điều 3. Chỉ tiêu phát triển kinh tế - xã hội năm 2026', '2. Chỉ tiêu về y tế và chăm sóc sức khỏe']), 'Y tế');
  assert.equal(categoryFromHeadings(['II. Văn hóa - xã hội', 'a) Giáo dục và đào tạo']), 'Giáo dục');
  assert.equal(categoryFromHeadings(['Điều 3. Chỉ tiêu phát triển kinh tế - xã hội năm 2026']), null);
  assert.equal(categoryFromHeadings(null), null);
});

test('pickCategoryByScore: chỉ chọn khi đủ cao và bỏ xa lĩnh vực kế tiếp', () => {
  assert.equal(pickCategoryByScore([0.7, 0.4, 0.3, 0.2, 0.2, 0.2, 0.2, 0.2]), 'Kinh tế');
  assert.equal(pickCategoryByScore([0.3, 0.6, 0.59, 0.2, 0.2, 0.2, 0.2, 0.2]), null, 'hai lĩnh vực sát nhau');
  assert.equal(pickCategoryByScore([0.3, 0.4, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2]), null, 'không đủ giống');
});
