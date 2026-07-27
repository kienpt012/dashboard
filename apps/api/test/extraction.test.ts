import assert from 'node:assert/strict';
import test from 'node:test';
import { TargetDirection, TargetFrequency } from '@prisma/client';
import {
  categoryFromSectionHeader,
  cleanIndicatorDisplayName,
  isTableHeaderArtifact,
  parseSectionHeader,
  sanitizeLlmIndicators,
} from '../src/extraction-llm';
import {
  chunkLikelyHasIndicators,
  detectDeadline,
  detectFrequency,
  detectResponsibleDepartment,
  extractIndicatorsFromText,
  findValueWithUnit,
  parseVietnameseNumber,
} from '../src/extraction-rules';
import { diceSimilarity, matchDepartmentByName, normalizeVietnamese } from '../src/matching';

test('parse số kiểu Việt Nam: chấm nghìn, phẩy thập phân', () => {
  assert.equal(parseVietnameseNumber('3.450'), 3450);
  assert.equal(parseVietnameseNumber('95,5'), 95.5);
  assert.equal(parseVietnameseNumber('1.234.567'), 1234567);
  assert.equal(parseVietnameseNumber('0,8'), 0.8);
  assert.equal(parseVietnameseNumber('abc'), null);
});

test('tìm giá trị kèm đơn vị đo trong câu', () => {
  const matches = findValueWithUnit('Tổng thu ngân sách đạt 3.450 tỷ đồng và trồng mới 1.200 cây xanh');
  assert.equal(matches.length, 2);
  assert.equal(matches[0].value, 3450);
  assert.equal(matches[0].unit, 'tỷ đồng');
  assert.equal(matches[1].value, 1200);
  assert.equal(matches[1].unit, 'cây');
});

test('nhận diện tần suất báo cáo tiếng Việt, chu kỳ 6 tháng trả cảnh báo', () => {
  assert.equal(detectFrequency('Báo cáo hàng tháng').frequency, TargetFrequency.MONTHLY);
  assert.equal(detectFrequency('định kỳ quý').frequency, TargetFrequency.QUARTERLY);
  assert.equal(detectFrequency('tổng hợp cả năm').frequency, TargetFrequency.YEARLY);
  const semiannual = detectFrequency('báo cáo 6 tháng một lần');
  assert.equal(semiannual.frequency, null);
  assert.ok(semiannual.warning);
});

test('nhận diện hạn hoàn thành từ nhiều cách diễn đạt', () => {
  assert.equal(detectDeadline('hoàn thành trước ngày 30/09/2026', null), '2026-09-30');
  assert.equal(detectDeadline('thực hiện trong năm 2026', null), '2026-12-31');
  assert.equal(detectDeadline('không có mốc nào', 2026), '2026-12-31');
  assert.equal(detectDeadline('không có mốc nào', null), null);
});

test('nhận diện đơn vị chủ trì sau dấu hai chấm', () => {
  assert.equal(
    detectResponsibleDepartment('Đơn vị chủ trì: Phòng Văn hóa - Xã hội, phối hợp: Trạm Y tế.'),
    'Phòng Văn hóa - Xã hội',
  );
  assert.equal(detectResponsibleDepartment('Không nêu đơn vị nào'), null);
});

test('trích xuất luật: câu chỉ tiêu điển hình ra đủ trường chính', () => {
  const text = [
    'II. CHỈ TIÊU CHỦ YẾU NĂM 2026',
    '1. Tỷ lệ hồ sơ thủ tục hành chính giải quyết đúng hạn đạt 98% trở lên.',
    'Đơn vị chủ trì: Trung tâm Phục vụ hành chính công. Báo cáo hàng quý.',
    '2. Số vụ phạm pháp hình sự trên địa bàn không quá 45 vụ.',
  ].join('\n');
  const results = extractIndicatorsFromText(text);
  assert.ok(results.length >= 2);
  const first = results.find(item => item.name.includes('thủ tục hành chính'));
  assert.ok(first);
  assert.equal(first.targetValue, 98);
  assert.equal(first.unit, '%');
  assert.equal(first.direction, TargetDirection.HIGHER_IS_BETTER);
  const crime = results.find(item => item.name.includes('phạm pháp'));
  assert.ok(crime);
  assert.equal(crime.targetValue, 45);
  assert.equal(crime.direction, TargetDirection.LOWER_IS_BETTER);
  for (const item of results) {
    assert.ok(item.sourceQuote.length > 0);
    assert.ok(item.confidence > 0 && item.confidence <= 1);
  }
});

test('đoạn không có tín hiệu chỉ tiêu bị bỏ qua để tiết kiệm GPU', () => {
  assert.equal(chunkLikelyHasIndicators('Điều 2. Quyết định này có hiệu lực kể từ ngày ký.'), false);
  assert.equal(chunkLikelyHasIndicators('Phấn đấu đạt 98% hồ sơ đúng hạn'), true);
});

test('đầu ra LLM được kiểm chứng: quote không khớp bị hạ trần độ tin cậy', () => {
  const chunk = 'Tỷ lệ hộ nghèo giảm còn 0,8% vào cuối năm 2026.';
  const raw = JSON.stringify({
    indicators: [
      {
        indicatorName: 'Tỷ lệ hộ nghèo',
        targetValue: 0.8,
        unit: '%',
        valueDirection: 'LOWER_IS_BETTER',
        reportingFrequency: 'QUARTERLY',
        targetYear: 2026,
        responsibleDepartment: null,
        sourceQuote: 'Tỷ lệ hộ nghèo giảm còn 0,8% vào cuối năm 2026.',
        confidence: 0.95,
        fieldConfidence: { name: 0.9, targetValue: 0.9, unit: 0.9, frequency: 0.5, deadline: 0.3, responsibleDepartment: 0.1 },
      },
      {
        indicatorName: 'Chỉ tiêu bịa đặt hoàn toàn',
        targetValue: 123,
        unit: 'người',
        valueDirection: 'HIGHER_IS_BETTER',
        reportingFrequency: null,
        targetYear: 2026,
        responsibleDepartment: null,
        sourceQuote: 'Câu này không hề có trong tài liệu.',
        confidence: 0.99,
        fieldConfidence: { name: 0.9, targetValue: 0.9, unit: 0.9, frequency: 0.5, deadline: 0.3, responsibleDepartment: 0.1 },
      },
    ],
  });
  const { indicators, parseError } = sanitizeLlmIndicators(raw, chunk);
  assert.equal(parseError, false);
  assert.equal(indicators.length, 2);
  assert.equal(indicators[0].direction, TargetDirection.LOWER_IS_BETTER);
  assert.equal(indicators[0].frequency, TargetFrequency.QUARTERLY);
  assert.equal(indicators[0].confidence, 0.95);
  // Ứng viên có quote bịa: cảnh báo + độ tin cậy bị chặn tối đa 0.4.
  assert.ok(indicators[1].warnings.some(warning => warning.includes('không khớp')));
  assert.ok(indicators[1].confidence <= 0.4);
});

test('đầu ra LLM hỏng định dạng không làm sập pipeline', () => {
  assert.deepEqual(sanitizeLlmIndicators('không phải json', 'x'), { indicators: [], parseError: true });
  assert.deepEqual(sanitizeLlmIndicators('{"khac":1}', 'x'), { indicators: [], parseError: true });
});

test('JSON bị cắt giữa chừng được vá: giữ các chỉ tiêu đã sinh trọn vẹn', () => {
  const fullItem = JSON.stringify({
    indicatorName: 'Tỷ lệ trường đạt chuẩn quốc gia — Mầm non',
    ordinalNumber: null,
    parentIndicator: 'Tỷ lệ trường đạt chuẩn quốc gia',
    targetValue: 38,
    unit: '%',
    valueDirection: 'HIGHER_IS_BETTER',
    reportingFrequency: null,
    targetYear: 2026,
    responsibleDepartment: 'Sở Giáo dục và Đào tạo',
    sourceQuote: 'Mầm non đạt tỷ lệ % 38 Sở Giáo dục',
    confidence: 0.9,
    fieldConfidence: { name: 0.9, targetValue: 0.9, unit: 0.9, frequency: 0.3, deadline: 0.3, responsibleDepartment: 0.8 },
  });
  const truncated = `{"indicators":[${fullItem},{"indicatorName":"Bị cắt giữa chừ`;
  const result = sanitizeLlmIndicators(truncated, 'Mầm non đạt tỷ lệ % 38 Sở Giáo dục');
  assert.equal(result.parseError, false);
  assert.equal(result.indicators.length, 1);
  const rescued = result.indicators[0];
  // Tên thành phần đã mang tên cha; cảnh báo về việc khôi phục được ghi lại.
  assert.ok(rescued.name.includes('Mầm non'));
  assert.equal(rescued.parentName, 'Tỷ lệ trường đạt chuẩn quốc gia');
  assert.ok(rescued.warnings.some(warning => warning.includes('khôi phục')));
});

test('tên chỉ tiêu được gọt đuôi đơn vị/giá trị dính từ cột bảng', () => {
  assert.equal(cleanIndicatorDisplayName('Số căn hộ nhà ở xã hội đạt Căn'), 'Số căn hộ nhà ở xã hội');
  assert.equal(cleanIndicatorDisplayName('Tỷ trọng kinh tế số chiếm từ %'), 'Tỷ trọng kinh tế số');
  assert.equal(cleanIndicatorDisplayName('Mầm non đạt tỷ lệ % 38'), 'Mầm non đạt tỷ lệ');
  assert.equal(cleanIndicatorDisplayName('Tỷ lệ che phủ rừng duy trì ổn định %'), 'Tỷ lệ che phủ rừng');
  // Tên đã sạch giữ nguyên.
  assert.equal(cleanIndicatorDisplayName('GRDP bình quân đầu người'), 'GRDP bình quân đầu người');
});

test('ô tiêu đề bảng bị lọc tất định, chỉ tiêu định tính hợp lệ được giữ', () => {
  assert.equal(isTableHeaderArtifact('Chỉ tiêu', null, null), true);
  assert.equal(isTableHeaderArtifact('Đơn vị tính', null, null), true);
  assert.equal(isTableHeaderArtifact('Kế hoạch năm 2026', null, null), true);
  assert.equal(isTableHeaderArtifact('Tỷ lệ hồ sơ giải quyết đúng hạn', 98, '%'), false);
  // Chỉ tiêu định tính dài không giá trị vẫn được giữ cho người xác minh.
  assert.equal(
    isTableHeaderArtifact('Hoàn thành số hóa toàn bộ hồ sơ đất đai trên địa bàn phường', null, null),
    false,
  );
});

test('tiêu đề mục của chunk cho ra lĩnh vực tất định', () => {
  const chunk = '[Mục: III Chỉ tiêu phát triển đô thị, bảo vệ môi trường]\n16 Tỷ lệ đất công viên...';
  assert.equal(parseSectionHeader(chunk), 'III Chỉ tiêu phát triển đô thị, bảo vệ môi trường');
  assert.equal(
    categoryFromSectionHeader(parseSectionHeader(chunk)),
    'phát triển đô thị, bảo vệ môi trường',
  );
  assert.equal(parseSectionHeader('không có mục'), null);
  assert.equal(categoryFromSectionHeader(null), null);
});

test('tiêu đề mục không bao giờ trở thành chỉ tiêu cha', () => {
  const chunkText = '[Mục: V Chỉ tiêu đảm bảo an ninh]\n23 Đảm bảo tuyển quân đạt 100% chỉ tiêu % 100 Bộ Tư lệnh';
  const raw = JSON.stringify({
    indicators: [{
      indicatorName: 'Đảm bảo tuyển quân đạt chỉ tiêu',
      ordinalNumber: '23',
      parentIndicator: 'V Chỉ tiêu đảm bảo an ninh',
      targetValue: 100,
      unit: '%',
      valueDirection: 'HIGHER_IS_BETTER',
      reportingFrequency: null,
      targetYear: 2026,
      responsibleDepartment: 'Bộ Tư lệnh',
      sourceQuote: '23 Đảm bảo tuyển quân đạt 100% chỉ tiêu % 100 Bộ Tư lệnh',
      confidence: 0.95,
      fieldConfidence: { name: 0.9, targetValue: 0.9, unit: 0.9, frequency: 0.3, deadline: 0.3, responsibleDepartment: 0.8 },
    }],
  });
  const { indicators } = sanitizeLlmIndicators(raw, chunkText);
  assert.equal(indicators.length, 1);
  assert.equal(indicators[0].parentName, null);
  assert.ok(!indicators[0].name.includes('Mục'));
  assert.ok(!indicators[0].name.startsWith('V '));
});

test('bảng thật: đơn vị đứng trước giá trị vẫn bắt được ("% ≥ 95", "Căn 28.500")', () => {
  const bhyt = findValueWithUnit('9 Tỷ lệ người dân tham gia bảo hiểm y tế % ≥ 95 Bảo hiểm xã hội');
  assert.ok(bhyt.some(match => match.value === 95 && match.unit === '%'));
  const nhaOXaHoi = findValueWithUnit('18 Số căn hộ nhà ở xã hội đạt Căn 28.500 Sở Xây dựng');
  assert.ok(nhaOXaHoi.some(match => match.value === 28500 && match.unit.toLowerCase() === 'căn'));
});

test('chuẩn hóa tiếng Việt và độ tương đồng Dice phục vụ phát hiện trùng', () => {
  assert.equal(normalizeVietnamese('Phòng Văn hóa – Xã hội'), 'phong van hoa xa hoi');
  assert.ok(diceSimilarity('Tỷ lệ hồ sơ đúng hạn', 'Tỷ lệ giải quyết hồ sơ đúng hạn') > 0.7);
  assert.ok(diceSimilarity('Tổng thu ngân sách', 'Số cây xanh trồng mới') < 0.3);
});

test('gán phòng ban theo tên: đúng khi đủ chắc chắn, trả null khi mơ hồ', () => {
  const departments = [
    { id: 'a', name: 'Phòng Văn hóa - Xã hội', code: 'VHXH' },
    { id: 'b', name: 'Phòng Kinh tế, Hạ tầng & Đô thị', code: 'KTHTDT' },
    { id: 'c', name: 'Trung tâm Phục vụ hành chính công', code: 'TTCC' },
  ];
  assert.equal(matchDepartmentByName('Phòng Văn hóa – Xã hội', departments)?.id, 'a');
  assert.equal(matchDepartmentByName('Phòng Kinh tế, Hạ tầng và Đô thị', departments)?.id, 'b');
  assert.equal(matchDepartmentByName('Trung tâm Phục vụ hành chính công', departments)?.id, 'c');
  assert.equal(matchDepartmentByName('Đơn vị hoàn toàn khác lạ', departments), null);
});
