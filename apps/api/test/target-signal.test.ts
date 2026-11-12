import assert from 'node:assert/strict';
import { test } from 'node:test';
import { missingItems, numberedItems, uncoveredFigures } from '../src/extraction-completeness';
import { baselineReason, hasTargetFigure, maskNonTargetNumbers, sectionKind, targetFigures, unitWithDenominator } from '../src/target-signal';

test('số hiệu văn bản, ngày tháng, năm và số thứ tự không phải mức cần đạt', () => {
  for (const text of [
    'Căn cứ Luật Tổ chức chính quyền địa phương ngày 19 tháng 6 năm 2015;',
    'Căn cứ Nghị quyết số 05-NQ/TW ngày 22/12/2024 và Nghị định 30/2020/NĐ-CP;',
    'Triển khai Kế hoạch số 1234/KH-UBND, hoàn thành trước ngày 30/6/2026.',
    'Báo cáo kết quả trong quý II/2026 và 6 tháng đầu năm, giai đoạn 2026-2030.',
    'Nơi nhận: - Như Điều 3; - Lưu: VT.',
    'Tổ chức hội nghị lần thứ 3 tại khu phố 5, đợt 2 năm 2026.',
    'Vận động người từ 15 tuổi trở lên tham gia.',
  ]) {
    assert.equal(hasTargetFigure(text), false, text);
    assert.equal(/\d/.test(maskNonTargetNumbers(text)), false, maskNonTargetNumbers(text));
  }
});

test('con số có %, đơn vị hoặc từ đo lường là mức cần đạt; phần nhiệm vụ đòi chặt hơn', () => {
  assert.equal(hasTargetFigure('Tỷ lệ hộ nghèo giảm còn dưới 1,5%.'), true);
  assert.equal(hasTargetFigure('Thu ngân sách đạt 1.133 tỷ đồng.'), true);
  assert.equal(hasTargetFigure('Chỉ số PAPI: 45 điểm.'), true);
  assert.equal(hasTargetFigure('Hoàn thành kế hoạch 100% chỉ tiêu được giao.'), true);
  assert.equal(hasTargetFigure('Tổng số 12 khu phố đạt chuẩn văn hóa.'), true);
  // Câu giao việc: có số nhưng không có mức cần đạt.
  assert.equal(hasTargetFigure('Tổ chức 02 đợt tập huấn cho 150 cán bộ, hoàn thành trước ngày 30/6/2026.', true), false);
  assert.equal(hasTargetFigure('Rà soát 12 khu phố, lập danh sách gửi Phòng Kinh tế.', true), false);
  assert.equal(hasTargetFigure('Bảo đảm 100% hồ sơ được số hóa.', true), true);
  assert.equal(hasTargetFigure('Phấn đấu thu ngân sách đạt ít nhất 125,5 tỷ đồng.', true), true);
  const [first] = targetFigures('Tăng trưởng đạt 4 - 5%.');
  assert.equal(first.percent, true);
});

test('phần của văn bản theo đề mục gần nhất', () => {
  assert.equal(sectionKind(['Điều 3. Mục tiêu, chỉ tiêu chủ yếu', 'a) Chỉ tiêu về kinh tế']), 'target');
  assert.equal(sectionKind(['Điều 4. Nhiệm vụ, giải pháp chủ yếu', 'a) Về kinh tế']), 'task');
  assert.equal(sectionKind(['II. NHIỆM VỤ, GIẢI PHÁP', '1. Mục tiêu cụ thể']), 'target');
  assert.equal(sectionKind(['III. TỔ CHỨC THỰC HIỆN']), 'task');
  assert.equal(sectionKind(['Phần mở đầu']), 'other');
});

test('kiểm tra đủ mục không báo mục giao việc trong phần nhiệm vụ', () => {
  const chunk = [
    '[Mục: Điều 4. Nhiệm vụ, giải pháp chủ yếu]',
    '(1) Tổ chức quán triệt Nghị quyết số 05-NQ/TW ngày 22/12/2024, hoàn thành trước ngày 30/6/2026.',
    '(2) Tổ chức 02 đợt tập huấn cho 150 cán bộ khu phố.',
    '(3) Phấn đấu tỷ lệ giải ngân vốn đầu tư công đạt trên 95%.',
  ].join('\n');
  assert.deepEqual(numberedItems(chunk, 'section', true).map(item => item.ordinal), ['3']);
  // Mục (1) chỉ có số hiệu và ngày tháng: không tính ở cả hai chế độ.
  assert.deepEqual(numberedItems(chunk, 'section').map(item => item.ordinal), ['2', '3']);
  assert.deepEqual(missingItems(chunk, 'section', [], true).map(item => item.ordinal), ['3']);
  assert.deepEqual(missingItems(chunk, 'section', [{ sourceQuote: 'tỷ lệ giải ngân vốn đầu tư công đạt trên 95%', targetValue: 95 }], true), []);
});

test('số chưa được trích: liệt kê mức cần đạt không thuộc đề xuất nào, bỏ số liệu nền', () => {
  const chunk = [
    '[Mục: I. Mục tiêu]',
    'Phấn đấu tỷ lệ hộ dân sử dụng nước sạch đạt 99,5%. Tỷ lệ thu gom rác thải sinh hoạt đạt trên 98%.',
    'Năm 2025 tỷ lệ hộ nghèo là 1,2%. Tổ chức 02 đợt ra quân.',
  ].join('\n');
  const found = uncoveredFigures(chunk, [{ sourceQuote: 'Phấn đấu tỷ lệ hộ dân sử dụng nước sạch đạt 99,5%', targetValue: 99.5 }], { planYear: 2026 });
  assert.equal(found.length, 1);
  assert.match(found[0].snippet, /thu gom rác thải sinh hoạt đạt trên 98/);
  assert.deepEqual(uncoveredFigures(chunk, [
    { sourceQuote: 'Phấn đấu tỷ lệ hộ dân sử dụng nước sạch đạt 99,5%', targetValue: 99.5 },
    { sourceQuote: 'không khớp nguyên văn', targetValue: 98 },
  ], { planYear: 2026 }), []);
});

test('số liệu nền: con số của năm trước hoặc sau cụm kể kết quả', () => {
  assert.match(baselineReason('Số hộ nghèo năm 2025 là 80 hộ, phấn đấu năm 2026 còn 60 hộ', 80, 2026) ?? '', /năm 2025/);
  assert.equal(baselineReason('Số hộ nghèo năm 2025 là 80 hộ, phấn đấu năm 2026 còn 60 hộ', 60, 2026), null);
  assert.match(baselineReason('Toàn phường hiện có 12 trường đạt chuẩn quốc gia', 12, 2026) ?? '', /kể kết quả/);
  assert.equal(baselineReason('Tổng thu ngân sách tăng 8% so với năm 2025', 8, 2026), null);
  assert.equal(baselineReason('So với năm 2025 tăng 8%', 8, 2026), null);
  assert.equal(baselineReason('Đến năm 2030 tỷ lệ đô thị hóa đạt 95%', 95, 2026), null);
});

test('đơn vị bình quân theo dân số giữ mẫu số', () => {
  assert.equal(unitWithDenominator('giường', 'Số giường bệnh trên 10.000 dân đạt 30 giường'), 'giường/10.000 dân');
  assert.equal(unitWithDenominator('bác sĩ', 'Đạt 12 bác sĩ/vạn dân'), 'bác sĩ/10.000 dân');
  assert.equal(unitWithDenominator('%', 'Tỷ lệ trên 10.000 dân đạt 30%'), '%');
  assert.equal(unitWithDenominator('giường/10.000 dân', 'Số giường bệnh trên 10.000 dân đạt 30'), 'giường/10.000 dân');
  assert.equal(unitWithDenominator('người', 'Thu hút trên 1.000 người tham gia'), 'người');
  assert.equal(unitWithDenominator('điểm', 'Chỉ số PAPI đạt 45 điểm'), 'điểm');
});
