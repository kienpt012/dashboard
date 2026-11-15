import assert from 'node:assert/strict';
import test from 'node:test';
import { TargetDirection, TargetFrequency } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { excelNumberText, parseXlsxTables } from '../src/document-processing';
import { chunkBody } from '../src/extraction-structure';
import { xlsxOutcome } from '../src/extraction-worker';
import type { StructuredElement, StructuredTableCell } from '../src/ocr-service';
import { resolveChunkingOptions } from '../src/structured-chunking';
import {
  detectTableLayout,
  headerRole,
  leadingUnit,
  parseDeadlineCell,
  parseFrequencyCell,
  parseNumberToken,
  parsePlanCell,
  readDocumentTables,
  readTable,
  renderTableRows,
  tableRowsInChunk,
} from '../src/table-extraction';

type CellSpec = string | { text: string; colSpan?: number; rowSpan?: number; header?: boolean };

/** Bảng thử từ mảng hai chiều; ô null là ô bị ô gộp phía trước/phía trên phủ. */
function table(rows: (CellSpec | null)[][], extra: Partial<StructuredElement> = {}): StructuredElement {
  const numCols = Math.max(...rows.map(row => row.length));
  const cells: StructuredTableCell[] = [];
  rows.forEach((row, rowIndex) => row.forEach((spec, colIndex) => {
    if (spec === null || spec === '') return;
    const cell = typeof spec === 'string' ? { text: spec } : spec;
    cells.push({
      row: rowIndex, col: colIndex, rowSpan: cell.rowSpan ?? 1, colSpan: cell.colSpan ?? 1, text: cell.text,
      header: cell.header ?? false, bbox: null, confidence: null, source: 'pdf_text', flags: [],
    });
  }));
  return {
    id: 'p1-e0', type: 'table', text: '', page: 1, bbox: null, confidence: null, source: 'pdf_text', flags: [],
    table: { numRows: rows.length, numCols, cells },
    ...extra,
  };
}

test('Tiêu đề cột: vai trò theo chữ, đúng thứ tự ưu tiên', () => {
  assert.equal(headerRole('STT'), 'ordinal');
  assert.equal(headerRole('TT'), 'ordinal');
  assert.equal(headerRole('CHỈ TIÊU CHỦ YẾU'), 'name');
  assert.equal(headerRole('Nội dung công việc'), 'name');
  assert.equal(headerRole('Mã số'), 'code');
  assert.equal(headerRole('Đơn vị tính'), 'unit');
  assert.equal(headerRole('ĐVT'), 'unit');
  assert.equal(headerRole('Đơn vị thực hiện'), 'responsible');
  assert.equal(headerRole('Cơ quan chủ trì'), 'responsible');
  assert.equal(headerRole('Đơn vị phối hợp'), 'coordinating');
  assert.equal(headerRole('Thời gian thực hiện'), 'deadline');
  assert.equal(headerRole('Thời hạn hoàn thành'), 'deadline');
  assert.equal(headerRole('Kế hoạch năm 2026'), 'plan');
  assert.equal(headerRole('Chỉ tiêu Đảng ủy'), 'plan');
  assert.equal(headerRole('Chỉ tiêu UBND TP'), 'plan');
  assert.equal(headerRole('Năm 2026'), 'plan');
  assert.equal(headerRole('Thực hiện năm 2025'), 'actual');
  assert.equal(headerRole('Luỹ kế đến hiện tại'), 'actual');
  assert.equal(headerRole('Lũy kế đến hiện tại'), 'actual');
  assert.equal(headerRole('So sánh (%)'), 'compare');
  assert.equal(headerRole('Tỷ lệ đạt so với kế hoạch'), 'compare');
  assert.equal(headerRole('Ghi chú'), 'note');
  assert.equal(headerRole('Sản phẩm'), 'product');
  assert.equal(headerRole('Kỳ báo cáo'), 'frequency');
  assert.equal(headerRole('Kinh phí (triệu đồng)'), 'ignore');
  assert.equal(headerRole('Phòng Kinh tế'), null);
});

test('Đọc số kiểu Việt và kiểu Excel', () => {
  assert.equal(parseNumberToken('1.133'), 1133);
  assert.equal(parseNumberToken('12,1'), 12.1);
  assert.equal(parseNumberToken('1.408,701'), 1408.701);
  assert.equal(parseNumberToken('0.95'), 0.95);
  assert.equal(parseNumberToken('12.5'), 12.5);
  assert.equal(parseNumberToken('1,408,701'), 1408701);
  assert.equal(parseNumberToken('02'), 2);
});

test('Ô kế hoạch: khoảng, dấu so sánh, đơn vị, bỏ qua số năm và ngày', () => {
  assert.deepEqual(parsePlanCell('10 - 10,5'), { value: 10, upper: 10.5, unit: null, operator: 'range', direction: null });
  assert.deepEqual(parsePlanCell('Tăng 4-5%'), { value: 4, upper: 5, unit: '%', operator: 'range', direction: TargetDirection.HIGHER_IS_BETTER });
  assert.deepEqual(parsePlanCell('≥ 95'), { value: 95, upper: null, unit: null, operator: 'gte', direction: TargetDirection.HIGHER_IS_BETTER });
  assert.deepEqual(parsePlanCell('(Trên 95%)'), { value: 95, upper: null, unit: '%', operator: 'gte', direction: TargetDirection.HIGHER_IS_BETTER });
  assert.deepEqual(parsePlanCell('dưới 1,5%'), { value: 1.5, upper: null, unit: '%', operator: 'lte', direction: TargetDirection.LOWER_IS_BETTER });
  assert.deepEqual(parsePlanCell('< 6,5'), { value: 6.5, upper: null, unit: null, operator: 'lte', direction: TargetDirection.LOWER_IS_BETTER });
  assert.equal(parsePlanCell('1.133 tỷ').value, 1133);
  assert.equal(parsePlanCell('1.133 tỷ').unit, 'tỷ');
  assert.equal(parsePlanCell('1.408,701 tỷ').value, 1408.701);
  assert.equal(parsePlanCell('03 khu phố không ma túy').value, 3);
  assert.equal(parsePlanCell('03 khu phố không ma túy').unit, 'khu phố');
  assert.equal(parsePlanCell('Ít nhất 30% khu phố không ma túy').operator, 'gte');
  assert.equal(parsePlanCell('01 mô hình hoặc 01 chương trình du lịch').unit, 'mô hình');
  const reduce = parsePlanCell('giảm 10% số vụ so với 2025 (năm 2026 không để vượt quá 40 vụ)');
  assert.equal(reduce.value, 10);
  assert.equal(reduce.unit, '%');
  assert.equal(reduce.direction, TargetDirection.LOWER_IS_BETTER);
  assert.equal(parsePlanCell('đến năm 2030 phát triển 02 Ha').value, 2);
  assert.equal(parsePlanCell('đến năm 2030 phát triển 02 Ha').unit, 'Ha');
  assert.equal(parsePlanCell('Đánh giá cuối năm 2026').value, null);
  assert.equal(parsePlanCell('Không').value, null);
  assert.equal(parsePlanCell('-').value, null);
  assert.equal(parsePlanCell('từ 80% trở lên').operator, 'gte');
  assert.equal(parsePlanCell('không quá 5 vụ').operator, 'lte');
  assert.equal(parsePlanCell('Hoàn thành trước 30/6/2026').value, null);
  assert.equal(parsePlanCell('6 tháng đạt 50%').value, 50);
  assert.equal(parsePlanCell('2026').value, 2026, 'ô chỉ có một số thì đó là giá trị');
  assert.equal(leadingUnit(' tỷ đồng (ước)'), 'tỷ đồng');
});

test('Ô thời hạn và kỳ báo cáo', () => {
  assert.equal(parseDeadlineCell('Trước 30/6/2026', 2026), '2026-06-30');
  assert.equal(parseDeadlineCell('30/9', 2026), '2026-09-30');
  assert.equal(parseDeadlineCell('Tháng 2/2026', 2025), '2026-02-28');
  assert.equal(parseDeadlineCell('Quý II/2026', 2026), '2026-06-30');
  assert.equal(parseDeadlineCell('Quý 4', 2026), '2026-12-31');
  assert.equal(parseDeadlineCell('6 tháng đầu năm', 2026), '2026-06-30');
  assert.equal(parseDeadlineCell('Thường xuyên', 2026), null);
  assert.equal(parseDeadlineCell('Cả năm', 2026), null);
  assert.equal(parseFrequencyCell('Tháng, quý, 6 tháng, năm'), TargetFrequency.MONTHLY);
  assert.equal(parseFrequencyCell('Quý, 6 tháng, năm'), TargetFrequency.QUARTERLY);
  assert.equal(parseFrequencyCell('6 tháng, năm'), TargetFrequency.SEMIANNUAL);
  assert.equal(parseFrequencyCell('Năm'), TargetFrequency.YEARLY);
  assert.equal(parseFrequencyCell(''), null);
});

const PL1 = table([
  ['STT', 'Chỉ tiêu', 'Đơn vị tính', 'Kế hoạch năm 2026', 'Đơn vị chủ trì', 'Kỳ báo cáo'],
  ['I', 'CHỈ TIÊU KINH TẾ'],
  ['1', 'Tốc độ tăng tổng giá trị sản phẩm trên địa bàn', '%', '10 - 10,5', 'Phòng Kinh tế', 'Quý, 6 tháng, năm'],
  ['2', 'Thu ngân sách nhà nước trên địa bàn', 'Tỷ đồng', '1.133', 'Phòng Kinh tế', 'Tháng, quý, 6 tháng, năm'],
  ['II', 'CHỈ TIÊU VĂN HÓA - XÃ HỘI'],
  ['9', 'Tỷ lệ trường đạt chuẩn quốc gia'],
  ['-', 'Mầm non', '%', '70', 'Phòng Văn hóa - Xã hội'],
  ['-', 'Tiểu học', '%', '≥ 95', 'Phòng Văn hóa - Xã hội'],
  ['11', 'Tỷ lệ hộ nghèo theo chuẩn Thành phố', '%', '< 1,5', 'Phòng Văn hóa - Xã hội'],
  ['III', 'CHỈ TIÊU MÔI TRƯỜNG, ĐÔ THỊ'],
  ['21', 'Phát triển công viên, cây xanh công cộng'],
  ['21.1', 'Diện tích công viên tăng thêm', 'ha', '02', 'Phòng Kinh tế, Hạ tầng và Đô thị'],
  ['21.2', 'Số cây xanh trồng mới', 'cây', '1.200', 'Phòng Kinh tế, Hạ tầng và Đô thị'],
  ['22', 'Tỷ lệ chất thải rắn sinh hoạt được thu gom', '%', '100'],
  ['23', 'Chỉ số hài lòng về môi trường'],
]);

test('Bảng phụ lục giao chỉ tiêu: nhóm La Mã, hàng cha không có số, hàng "-", hàng 21.1, khoảng và dấu so sánh', () => {
  const reading = readTable(PL1, { defaultYear: 2026 });
  assert.equal(reading.recognized, true);
  assert.equal(reading.layout?.kind, 'indicator');
  assert.deepEqual(reading.layout?.headerRows, [0]);
  assert.deepEqual(reading.records.map(record => [record.ordinal, record.name, record.targetValue, record.unit]), [
    ['1', 'Tốc độ tăng tổng giá trị sản phẩm trên địa bàn', 10, '%'],
    ['2', 'Thu ngân sách nhà nước trên địa bàn', 1133, 'Tỷ đồng'],
    [null, 'Tỷ lệ trường đạt chuẩn quốc gia — Mầm non', 70, '%'],
    [null, 'Tỷ lệ trường đạt chuẩn quốc gia — Tiểu học', 95, '%'],
    ['11', 'Tỷ lệ hộ nghèo theo chuẩn Thành phố', 1.5, '%'],
    ['21.1', 'Phát triển công viên, cây xanh công cộng — Diện tích công viên tăng thêm', 2, 'ha'],
    ['21.2', 'Phát triển công viên, cây xanh công cộng — Số cây xanh trồng mới', 1200, 'cây'],
    ['22', 'Tỷ lệ chất thải rắn sinh hoạt được thu gom', 100, '%'],
  ]);
  const [growth, budget, , primary, poverty] = reading.records;
  assert.deepEqual(growth.groups, ['I. CHỈ TIÊU KINH TẾ']);
  assert.match(growth.description ?? '', /Khoảng kế hoạch: 10 - 10,5/);
  assert.equal(growth.frequency, TargetFrequency.QUARTERLY);
  assert.equal(budget.frequency, TargetFrequency.MONTHLY);
  assert.equal(budget.responsibleDepartmentName, 'Phòng Kinh tế');
  assert.equal(growth.targetYear, 2026);
  assert.equal(primary.parentName, 'Tỷ lệ trường đạt chuẩn quốc gia');
  assert.deepEqual(primary.groups, ['II. CHỈ TIÊU VĂN HÓA - XÃ HỘI']);
  assert.equal(primary.direction, TargetDirection.HIGHER_IS_BETTER);
  assert.equal(poverty.direction, TargetDirection.LOWER_IS_BETTER);
  // Câu trích là đúng dòng của hàng trong đoạn, nên định vị và luật Bám nguồn đều khớp.
  assert.equal(budget.line, '2 Thu ngân sách nhà nước trên địa bàn Tỷ đồng 1.133 Phòng Kinh tế Tháng, quý, 6 tháng, năm');
  assert.equal(renderTableRows(PL1).find(line => line.row === budget.row)?.text, budget.line);
  // Hàng đánh số không có giá trị và không có thành phần: báo cho người duyệt, không tự bịa.
  assert.deepEqual(reading.unread.map(item => item.line), ['23 Chỉ số hài lòng về môi trường']);
});

test('Bảng báo cáo hai cột chỉ tiêu + luỹ kế (mẫu Phụ lục 1): mã số, cột chính, cột còn lại ghi vào mô tả', () => {
  const report = table([
    ['STT', 'CHỈ TIÊU CHỦ YẾU', 'Mã số', 'Đơn vị tính', 'Chỉ tiêu Đảng ủy', 'Chỉ tiêu UBND TP', 'Luỹ kế đến hiện tại', 'Ghi chú'],
    ['I', 'CHỈ TIÊU KINH TẾ', 'CT1'],
    ['1', 'Tốc độ tăng tổng giá trị sản phẩm trên địa bàn', 'CT2', '%', '12,1%', '11%', 'Đánh giá cuối năm 2026', 'Đánh giá cuối năm'],
    ['2', 'Tổng thu ngân sách nhà nước trên địa bàn', 'CT3', '%', 'Tăng 4-5%', '1.133 tỷ', '1.408 tỷ', 'Tổng thu lũy kế: 1.408,701 tỷ /1.133 tỷ (đạt 124%)'],
    ['4', 'Tỷ lệ giải ngân vốn đầu tư công', 'CT4', '%', '95%', '95%', '73%', 'Chưa đạt'],
    ['9', 'Số phòng học xây mới', 'CT12', 'Phòng học', 'Không', '189', '', ''],
    ['11', 'Tỷ lệ hộ nghèo', 'CT15', '%', 'dưới 1,5%', '', '0,17', ''],
    [{ text: 'Chỉ tiêu Nghị quyết Đảng ủy không có trong Quyết định giao chỉ tiêu UBND Thành phố', colSpan: 8 }],
    ['1', 'Tỷ lệ khu phố văn hóa', '', '%', '98%', 'Không', '97%', ''],
  ]);
  const reading = readTable(report, { defaultYear: 2026 });
  assert.equal(reading.recognized, true);
  const byName = (name: string) => reading.records.find(record => record.name.startsWith(name))!;
  const growth = byName('Tốc độ tăng');
  assert.equal(growth.code, 'CT2');
  assert.equal(growth.targetValue, 12.1);
  assert.equal(growth.targetText, '12,1%');
  assert.match(growth.description ?? '', /Chỉ tiêu UBND TP: 11%/);
  assert.equal(growth.actualValue, null);
  const budget = byName('Tổng thu ngân sách');
  assert.equal(budget.targetValue, 4);
  assert.equal(budget.unit, '%');
  assert.equal(budget.actualValue, 1408);
  const disbursement = byName('Tỷ lệ giải ngân');
  assert.equal(disbursement.actualValue, 73);
  // Cột chính ghi "Không": lấy cột chỉ tiêu còn lại và nói rõ.
  const classrooms = byName('Số phòng học');
  assert.equal(classrooms.targetValue, 189);
  assert.equal(classrooms.unit, 'Phòng học');
  assert.match(classrooms.warnings.join(' '), /Giá trị lấy ở cột "Chỉ tiêu UBND TP" vì cột "Chỉ tiêu Đảng ủy" ghi "Không"/);
  assert.equal(byName('Tỷ lệ hộ nghèo').direction, TargetDirection.LOWER_IS_BETTER);
  assert.equal(byName('Tỷ lệ hộ nghèo').actualValue, 0.17);
  // Hàng gộp ngang cả bảng mở nhóm mới; số thứ tự chạy lại từ 1 không lẫn với nhóm trước.
  const culture = byName('Tỷ lệ khu phố văn hóa');
  assert.deepEqual(culture.groups, ['Chỉ tiêu Nghị quyết Đảng ủy không có trong Quyết định giao chỉ tiêu UBND Thành phố']);
  assert.equal(culture.code, null);
  assert.equal(culture.targetValue, 98);
});

test('Tiêu đề hai tầng: cột năm trước là số thực hiện, cột kế hoạch của năm văn bản là cột chính', () => {
  const twoLevel = table([
    [{ text: 'TT', rowSpan: 2 }, { text: 'Chỉ tiêu', rowSpan: 2 }, { text: 'ĐVT', rowSpan: 2 }, { text: 'Thực hiện năm 2025', rowSpan: 2 }, { text: 'Kế hoạch năm 2026', colSpan: 2 }, null, { text: 'Ghi chú', rowSpan: 2 }],
    [null, null, null, null, 'Thành phố giao', 'Phường phấn đấu', null],
    ['(1)', '(2)', '(3)', '(4)', '(5)', '(6)', '(7)'],
    ['1', 'Tỷ lệ hồ sơ trực tuyến', '%', '82', '90', '95', ''],
    ['2', 'Số doanh nghiệp thành lập mới', 'doanh nghiệp', '310', '350', '', ''],
  ]);
  const layout = detectTableLayout(twoLevel, { defaultYear: 2026 })!;
  assert.deepEqual(layout.headerRows, [0, 1]);
  assert.deepEqual(layout.skipRows, [2]);
  assert.deepEqual(layout.columns.map(column => column.role), ['ordinal', 'name', 'unit', 'actual', 'plan', 'plan', 'note']);
  assert.equal(layout.columns[4].label, 'Kế hoạch năm 2026 › Thành phố giao');
  assert.equal(layout.planColumn, 4);
  const reading = readTable(twoLevel, { defaultYear: 2026 });
  assert.deepEqual(reading.records.map(record => [record.name, record.targetValue, record.actualValue]), [
    ['Tỷ lệ hồ sơ trực tuyến', 90, 82],
    ['Số doanh nghiệp thành lập mới', 350, 310],
  ]);
  assert.match(reading.records[0].description ?? '', /Kế hoạch năm 2026 › Phường phấn đấu: 95/);
});

test('Bảng kế hoạch theo quý: lấy cột "Cả năm" làm kế hoạch', () => {
  const quarters = table([
    ['STT', 'Nội dung', 'Đơn vị tính', { text: 'Kế hoạch', colSpan: 5 }, null, null, null, null],
    [null, null, null, 'Quý I', 'Quý II', 'Quý III', 'Quý IV', 'Cả năm'],
    ['1', 'Số lớp tập huấn chuyển đổi số', 'lớp', '1', '2', '2', '1', '6'],
  ]);
  const reading = readTable(quarters, { defaultYear: 2026 });
  assert.equal(reading.layout?.planColumn, 7);
  assert.equal(reading.records[0].targetValue, 6);
});

test('Bảng giao theo cột đơn vị: lấy cột của địa phương mình', () => {
  const units = table([
    ['STT', 'Chỉ tiêu', 'ĐVT', 'Phường An Phú', 'Phường Lái Thiêu', 'Phường Bình Hòa'],
    ['1', 'Thu ngân sách nhà nước', 'tỷ đồng', '900', '1.133', '750'],
    ['2', 'Số lao động được giải quyết việc làm', 'người', '2.000', '2.500', '1.800'],
  ]);
  const reading = readTable(units, { defaultYear: 2026, localityTerms: ['Lái Thiêu'] });
  assert.equal(reading.recognized, true);
  assert.deepEqual(reading.records.map(record => record.targetValue), [1133, 2500]);
  // Không biết tên địa phương thì không đoán: bảng đi đường Qwen.
  assert.equal(readTable(units, { defaultYear: 2026 }).recognized, false);
});

test('Bảng nhiệm vụ của kế hoạch: nhiệm vụ, đơn vị chủ trì, phối hợp, thời hạn, sản phẩm', () => {
  const tasks = table([
    ['STT', 'Nội dung công việc', 'Đơn vị chủ trì', 'Đơn vị phối hợp', 'Thời gian hoàn thành', 'Sản phẩm'],
    ['I', 'CÔNG TÁC TUYÊN TRUYỀN'],
    ['1', 'Xây dựng kế hoạch tuyên truyền cải cách hành chính năm 2026', 'Văn phòng HĐND và UBND', 'Phòng Văn hóa - Xã hội', 'Trước 31/01/2026', 'Kế hoạch'],
    ['2', 'Tổ chức 02 lớp tập huấn dịch vụ công trực tuyến cho khu phố', { text: 'Phòng Văn hóa - Xã hội', rowSpan: 2 }, 'Các khu phố', 'Quý II/2026', 'Báo cáo kết quả'],
    ['3', 'Rà soát thủ tục hành chính thuộc thẩm quyền', null, '', 'Thường xuyên', ''],
    ['II', 'KIỂM TRA, GIÁM SÁT'],
    ['4', 'Kiểm tra công vụ'],
    ['-', 'Kiểm tra định kỳ tại bộ phận một cửa', 'Văn phòng HĐND và UBND', '', 'Tháng 6/2026', 'Biên bản kiểm tra'],
  ]);
  const reading = readTable(tasks, { defaultYear: 2026 });
  assert.equal(reading.layout?.kind, 'task');
  assert.equal(reading.recognized, true);
  assert.deepEqual(reading.records.map(record => [record.ordinal, record.name, record.responsibleDepartmentName, record.deadline]), [
    ['1', 'Xây dựng kế hoạch tuyên truyền cải cách hành chính năm 2026', 'Văn phòng HĐND và UBND', '2026-01-31'],
    ['2', 'Tổ chức 02 lớp tập huấn dịch vụ công trực tuyến cho khu phố', 'Phòng Văn hóa - Xã hội', '2026-06-30'],
    ['3', 'Rà soát thủ tục hành chính thuộc thẩm quyền', 'Phòng Văn hóa - Xã hội', null],
    [null, 'Kiểm tra công vụ — Kiểm tra định kỳ tại bộ phận một cửa', 'Văn phòng HĐND và UBND', '2026-06-30'],
  ]);
  const [first, , third] = reading.records;
  assert.equal(first.kind, 'task');
  assert.equal(first.targetValue, 100);
  assert.equal(first.unit, '%');
  assert.equal(first.coordinatingDepartments, 'Phòng Văn hóa - Xã hội');
  assert.match(first.description ?? '', /Sản phẩm: Kế hoạch/);
  assert.deepEqual(first.groups, ['I. CÔNG TÁC TUYÊN TRUYỀN']);
  assert.match(third.description ?? '', /Thời hạn: Thường xuyên/);
});

test('Bảng nối sang trang sau không lặp tiêu đề: dùng bố cục và nhóm của bảng trước', () => {
  const first = readTable(PL1, { defaultYear: 2026 });
  const continued = table([
    ['24', 'Tỷ lệ hộ dân được cấp nước sạch', '%', '100', 'Phòng Kinh tế, Hạ tầng và Đô thị', ''],
    ['IV', 'CHỈ TIÊU CẢI CÁCH HÀNH CHÍNH'],
    ['25', 'Tỷ lệ hồ sơ giải quyết đúng hạn', '%', '≥ 98', 'Văn phòng', ''],
  ], { id: 'p2-e0', page: 2 });
  assert.equal(readTable(continued, { defaultYear: 2026 }).recognized, false, 'không có tiêu đề và không có bảng trước thì không đoán');
  const reading = readTable(continued, { defaultYear: 2026, previous: first.carry });
  assert.equal(reading.recognized, true);
  assert.equal(reading.layout?.inherited, true);
  assert.deepEqual(reading.records.map(record => [record.ordinal, record.targetValue, record.groups]), [
    ['24', 100, ['III. CHỈ TIÊU MÔI TRƯỜNG, ĐÔ THỊ']],
    ['25', 98, ['IV. CHỈ TIÊU CẢI CÁCH HÀNH CHÍNH']],
  ]);
});

test('Bảng Excel: các dòng tên bảng phía trên không phải tiêu đề cột; tên bị tách dòng được nối lại', () => {
  const sheet = table([
    [{ text: 'ỦY BAN NHÂN DÂN PHƯỜNG', header: true }],
    ['BẢNG TỔNG HỢP CHỈ TIÊU KẾ HOẠCH NĂM 2026'],
    ['(Kèm theo Kế hoạch số 15/KH-UBND ngày 10/01/2026)'],
    ['TT', 'Tên chỉ tiêu', 'Đơn vị tính', 'Kế hoạch 2026', 'Ghi chú'],
    ['1', 'Tỷ lệ người dân có hồ sơ sức khỏe', '%', '95%', ''],
    ['', 'điện tử', '', '', ''],
    ['2', 'Số mô hình chuyển đổi số', 'mô hình', '03', ''],
    ['Ghi chú: số liệu tạm tính'],
  ]);
  const layout = detectTableLayout(sheet, { defaultYear: 2026 })!;
  assert.deepEqual(layout.headerRows, [3]);
  const reading = readTable(sheet, { defaultYear: 2026 });
  assert.deepEqual(reading.records.map(record => [record.name, record.targetValue, record.unit]), [
    ['Tỷ lệ người dân có hồ sơ sức khỏe điện tử', 95, '%'],
    ['Số mô hình chuyển đổi số', 3, 'mô hình'],
  ]);
});

test('Bảng không có hàng tiêu đề nhận ra được, hoặc cột kế hoạch toàn chữ: không đọc bằng code', () => {
  const unknown = table([
    ['Họ tên', 'Chức vụ', 'Điện thoại'],
    ['Nguyễn Văn A', 'Chủ tịch', '0900 000 000'],
  ]);
  assert.equal(readTable(unknown).recognized, false);
  const texty = table([
    ['STT', 'Nội dung', 'Mục tiêu', 'Ghi chú'],
    ['1', 'Cải cách hành chính', 'Nâng cao chất lượng phục vụ', ''],
    ['2', 'Chuyển đổi số', 'Hoàn thiện hạ tầng số', ''],
  ]);
  assert.equal(readTable(texty).recognized, false);
});

test('Không có cột STT: số thứ tự nằm trong ô tên, hàng cha không số có thành phần "-"', () => {
  const inline = table([
    ['Chỉ tiêu', 'Đơn vị tính', 'Kế hoạch'],
    ['1. Tỷ lệ trường đạt chuẩn quốc gia'],
    ['- Mầm non', '%', '70'],
    ['- Tiểu học', '%', '80'],
    ['2. Tỷ lệ trẻ em dưới 5 tuổi suy dinh dưỡng', '%', '≤ 4'],
  ]);
  const reading = readTable(inline, { defaultYear: 2026 });
  assert.deepEqual(reading.records.map(record => [record.ordinal, record.name, record.targetValue, record.direction]), [
    [null, 'Tỷ lệ trường đạt chuẩn quốc gia — Mầm non', 70, TargetDirection.HIGHER_IS_BETTER],
    [null, 'Tỷ lệ trường đạt chuẩn quốc gia — Tiểu học', 80, TargetDirection.HIGHER_IS_BETTER],
    ['2', 'Tỷ lệ trẻ em dưới 5 tuổi suy dinh dưỡng', 4, TargetDirection.LOWER_IS_BETTER],
  ]);
});

// ---------------------------------------------------------------------------
// Excel thật (ExcelJS) → bảng có cấu trúc → đoạn → bản ghi, không cần ocr-service

test('Excel: số theo kiểu Việt, ô phần trăm, ô gộp, công thức; đọc thành chỉ tiêu bằng code', async () => {
  assert.equal(excelNumberText(0.95, '0%'), '95%');
  assert.equal(excelNumberText(0.125, '0.0%'), '12,5%');
  assert.equal(excelNumberText(12.1), '12,1');
  assert.equal(excelNumberText(1133, '#,##0'), '1133');
  assert.equal(excelNumberText(1408.701), '1408,701');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Chỉ tiêu 2026');
  sheet.addRow(['BẢNG GIAO CHỈ TIÊU KINH TẾ - XÃ HỘI NĂM 2026']);
  sheet.mergeCells('A1:E1');
  sheet.addRow([]);
  sheet.addRow(['STT', 'Tên chỉ tiêu', 'Đơn vị tính', 'Kế hoạch năm 2026', 'Đơn vị chủ trì']);
  sheet.addRow(['I', 'KINH TẾ']);
  sheet.addRow([1, 'Tốc độ tăng doanh thu thương mại, dịch vụ', '%', 12.1, 'Phòng Kinh tế']);
  sheet.addRow([2, 'Tổng thu ngân sách nhà nước trên địa bàn', 'tỷ đồng', 1133, null]);
  sheet.mergeCells('E5:E6');
  sheet.addRow([3, 'Tỷ lệ giải ngân vốn đầu tư công', '%', 0.95, 'Phòng Kinh tế']);
  sheet.getCell('D7').numFmt = '0%';
  sheet.addRow([4, 'Số hộ kinh doanh chuyển lên doanh nghiệp', 'hộ', { formula: '10+15', result: 25 }, 'Phòng Kinh tế']);
  workbook.addWorksheet('Ẩn', { state: 'hidden' }).addRow(['STT', 'Tên chỉ tiêu', 'Kế hoạch']);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  const sheets = await parseXlsxTables(buffer);
  assert.equal(sheets.length, 1, 'sheet ẩn không đọc');
  assert.equal(sheets[0].sheet, 'Chỉ tiêu 2026');
  assert.equal(sheets[0].cells.find(cell => cell.ref === 'Chỉ tiêu 2026!D7')?.text, '95%');
  assert.equal(sheets[0].cells.find(cell => cell.ref === 'Chỉ tiêu 2026!D5')?.text, '12,1');
  assert.equal(sheets[0].cells.find(cell => cell.ref === 'Chỉ tiêu 2026!A1')?.colSpan, 5);
  assert.equal(sheets[0].cells.find(cell => cell.ref === 'Chỉ tiêu 2026!E5')?.rowSpan, 2);

  const outcome = xlsxOutcome(sheets, { ...resolveChunkingOptions({}), tableRowsPerChunk: 3 });
  assert.equal(outcome.pages[0].kind, 'xlsx');
  const tableChunks = outcome.chunks.filter(chunk => chunk.kind === 'table');
  assert.ok(tableChunks.length >= 2);
  // Hàng tiêu đề thật (không phải dòng tên bảng) lặp lại ở đầu mỗi đoạn.
  for (const chunk of tableChunks) assert.match(chunk.text, /STT Tên chỉ tiêu Đơn vị tính Kế hoạch năm 2026 Đơn vị chủ trì/);

  const readings = readDocumentTables(outcome.pages.map(page => ({ pageNumber: page.pageNumber, elements: page.elements ?? [] })), { defaultYear: 2026 });
  const reading = readings.get('p1-e1')!;
  assert.equal(reading.recognized, true);
  assert.deepEqual(reading.records.map(record => [record.ordinal, record.targetValue, record.unit, record.responsibleDepartmentName]), [
    ['1', 12.1, '%', 'Phòng Kinh tế'],
    ['2', 1133, 'tỷ đồng', 'Phòng Kinh tế'],
    ['3', 95, '%', 'Phòng Kinh tế'],
    ['4', 25, 'hộ', 'Phòng Kinh tế'],
  ]);
  assert.deepEqual(reading.records[0].groups, ['I. KINH TẾ']);
  // Mỗi bản ghi nằm đúng một đoạn, câu trích là dòng của hàng trong đoạn đó.
  const assigned = new Set<number>();
  const placed = tableChunks.flatMap(chunk => tableRowsInChunk(reading, chunkBody(chunk.text), assigned).records.map(item => ({ chunk, ...item })));
  assert.equal(placed.length, 4);
  for (const item of placed) assert.ok(chunkBody(item.chunk.text).slice(item.position).startsWith(item.line));
});
