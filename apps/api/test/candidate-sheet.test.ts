import assert from 'node:assert/strict';
import test from 'node:test';
import { CandidateOrigin, CandidateStatus, TargetDirection, TargetFrequency } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import {
  buildCandidateWorkbook,
  parsePlan,
  planSheet,
  readCandidateWorkbook,
  roman,
  type SheetCandidate,
} from '../src/candidate-sheet';

const departments = [
  { id: 'd-kt', name: 'Phòng Kinh tế', code: 'KT' },
  { id: 'd-yt', name: 'Trạm Y tế', code: 'YT' },
];

function candidate(id: string, overrides: Partial<SheetCandidate> = {}): SheetCandidate {
  return {
    id, version: 1, name: `Chỉ tiêu ${id}`, ordinal: null, parentName: null, description: null, category: 'Kinh tế',
    groupName: '1. Chỉ tiêu về kinh tế', unit: '%', targetValue: 10, targetText: null,
    direction: TargetDirection.HIGHER_IS_BETTER, frequency: TargetFrequency.YEARLY,
    deadline: new Date('2026-12-31T16:59:59.999Z'), departmentName: 'Phòng Kinh tế', pageNumber: 1,
    sourceQuote: 'trích dẫn', confidence: 0.9, flagged: false, ...overrides,
  };
}

const sheetCandidates: SheetCandidate[] = [
  candidate('c1', { ordinal: '1', name: 'Tổng thu ngân sách nhà nước', unit: 'tỷ đồng', targetValue: 125.5, sourceQuote: 'Tổng thu ngân sách nhà nước đạt ít nhất 125,5 tỷ đồng.' }),
  candidate('c2', { ordinal: '2', name: 'Thành lập mới doanh nghiệp', unit: 'doanh nghiệp', targetValue: 45, flagged: true }),
  candidate('c3', { name: 'Số giường bệnh/10.000 dân', parentName: 'Đến cuối năm 2026,', unit: 'giường', targetValue: 30, sourceQuote: 'Số giường bệnh/10.000 dân đạt 30 giường.', groupName: '2. Chỉ tiêu về y tế', category: 'Y tế', departmentName: 'Trạm Y tế' }),
  candidate('c4', { ordinal: '9', name: 'Tỷ lệ người dân tham gia bảo hiểm y tế', targetText: '≥ 95,5', targetValue: 95.5, groupName: '2. Chỉ tiêu về y tế', category: 'Y tế', departmentName: 'Trạm Y tế' }),
];

async function roundTrip(edit?: (sheet: ExcelJS.Worksheet) => void) {
  const workbook = buildCandidateWorkbook({
    document: { id: 'doc-1', title: 'QĐ giao chỉ tiêu năm 2026', docNumber: '015/QĐ-UBND', year: 2026 },
    candidates: sheetCandidates,
    departments: departments.map(item => item.name),
  });
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(await workbook.xlsx.writeBuffer() as any);
  if (edit) {
    edit(loaded.getWorksheet('Chỉ tiêu')!);
    const again = new ExcelJS.Workbook();
    await again.xlsx.load(await loaded.xlsx.writeBuffer() as any);
    return again;
  }
  return loaded;
}

function rowsByName(sheet: ExcelJS.Worksheet) {
  const map = new Map<string, number>();
  sheet.eachRow((row, number) => map.set(String(row.getCell(2).value ?? ''), number));
  return map;
}

test('Bảng PL1: tiêu đề, hàng nhóm La Mã, hàng dẫn cho dòng "-", giữ chữ gốc của kế hoạch', async () => {
  const workbook = await roundTrip();
  const sheet = workbook.getWorksheet('Chỉ tiêu')!;
  assert.equal(sheet.getCell(1, 1).value, 'PHỤ LỤC');
  assert.equal(sheet.getCell(5, 1).value, 'STT');
  assert.equal(sheet.getCell(5, 4).value, 'Kế hoạch năm 2026');
  const cells = (row: number) => [1, 2, 3, 4].map(column => sheet.getCell(row, column).value);
  assert.deepEqual(cells(6), ['I', '1. Chỉ tiêu về kinh tế', null, null]);
  assert.deepEqual(cells(7), ['1', 'Tổng thu ngân sách nhà nước', 'tỷ đồng', '>= 125,5'], 'ký hiệu ngưỡng đọc từ câu trích dẫn');
  assert.deepEqual(cells(8).slice(3), [45], 'không thấy con số trong câu trích thì để nguyên số');
  assert.deepEqual(cells(9), ['II', '2. Chỉ tiêu về y tế', null, null]);
  assert.deepEqual(cells(10), [null, 'Đến cuối năm 2026,', null, null], 'hàng dẫn không phải đề xuất');
  assert.deepEqual(cells(11), ['-', 'Số giường bệnh/10.000 dân', 'giường', '= 30']);
  assert.deepEqual(cells(12), ['9', 'Tỷ lệ người dân tham gia bảo hiểm y tế', '%', '≥ 95,5']);
  assert.equal((sheet.getCell(8, 2).fill as any)?.fgColor?.argb, 'FFFEF3C7', 'hàng có cờ được tô vàng');
  assert.ok(sheet.getColumn(14).hidden, 'cột mã đề xuất ẩn');
});

test('Đọc lại bảng không sửa: không có thay đổi', async () => {
  const parsed = readCandidateWorkbook(await roundTrip());
  assert.equal(parsed.documentId, 'doc-1');
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.rows.length, 4);
  assert.deepEqual(parsed.rows.map(row => row.groupName), ['1. Chỉ tiêu về kinh tế', '1. Chỉ tiêu về kinh tế', '2. Chỉ tiêu về y tế', '2. Chỉ tiêu về y tế']);
  assert.equal(parsed.rows[2].parentName, 'Đến cuối năm 2026,');
  assert.equal(parsed.rows[3].targetText, '≥ 95,5');
  assert.equal(parsed.rows[3].targetValue, 95.5);
  assert.deepEqual([parsed.rows[0].targetValue, parsed.rows[0].targetText], [125.5, '>= 125,5']);
  assert.equal(parsed.rows[0].deadline, '2026-12-31');
  const plan = planSheet(parsed.rows, parsed.issues, existing(), departments, admin);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.unchanged, 4);
  assert.equal(plan.errors.length, 0);
});

const admin = { id: 'u-admin', username: 'admin', fullName: 'Văn thư', role: 'CLERK', departmentId: null } as any;

function existing() {
  return sheetCandidates.map((item, index) => ({
    id: item.id, version: item.version, status: CandidateStatus.PROPOSED, documentId: 'doc-1', name: item.name,
    ordinal: item.parentName ? null : item.ordinal, parentName: item.parentName, description: item.description, category: item.category,
    groupName: item.groupName, documentOrder: 10_000 * index + 37, unit: item.unit, targetValue: item.targetValue, targetText: item.targetText,
    targetYear: 2026, direction: item.direction, frequency: item.frequency, deadline: item.deadline,
    responsibleDepartmentId: item.departmentName === 'Trạm Y tế' ? 'd-yt' : 'd-kt', proposedById: null,
    origin: CandidateOrigin.AI, pageNumber: item.pageNumber, sourceQuote: item.sourceQuote, confidence: item.confidence,
    validationFlags: null, responsibleDepartment: { name: item.departmentName! },
  }));
}

test('Chuyên viên sửa giá trị, đổi phòng, thêm hàng mới, bỏ một hàng: xem trước đúng từng thay đổi', async () => {
  const workbook = await roundTrip(sheet => {
    const rows = rowsByName(sheet);
    sheet.getCell(rows.get('Tổng thu ngân sách nhà nước')!, 4).value = '>= 130';
    sheet.getCell(rows.get('Thành lập mới doanh nghiệp')!, 11).value = 'Bỏ';
    sheet.getCell(rows.get('Tỷ lệ người dân tham gia bảo hiểm y tế')!, 8).value = 'Quý';
    // Chuyên viên gõ "= 30" vào ô số: Excel lưu thành công thức.
    sheet.getCell(rows.get('Số giường bệnh/10.000 dân')!, 4).value = { formula: '30', result: 30 } as any;
    const added = sheet.addRow([]);
    added.getCell(1).value = '10';
    added.getCell(2).value = 'Tỷ lệ trẻ em được tiêm chủng đầy đủ';
    added.getCell(3).value = '%';
    added.getCell(4).value = 98;
    added.getCell(5).value = 'Trạm Y tế';
    added.getCell(8).value = 'Năm';
  });
  const parsed = readCandidateWorkbook(workbook);
  assert.equal(parsed.rows.find(row => row.id === 'c3')?.targetText, '= 30', 'gõ "= 30" vẫn giữ ký hiệu');
  const plan = planSheet(parsed.rows, parsed.issues, existing(), departments, admin);
  assert.deepEqual(plan.errors, []);
  const edited = plan.updates.filter(item => item.fields.length);
  assert.deepEqual(edited.map(item => [item.id, item.fields]), [['c1', ['targetValue', 'targetText']], ['c4', ['frequency']]]);
  assert.equal(edited[0].data.targetValue, 130);
  assert.equal(edited[0].data.targetText, '>= 130');
  assert.equal(edited[1].data.frequency, TargetFrequency.QUARTERLY);
  assert.deepEqual(plan.drops.map(item => item.id), ['c2']);
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].responsibleDepartmentId, 'd-yt');
  assert.equal(plan.creates[0].groupName, '2. Chỉ tiêu về y tế', 'hàng thêm cuối bảng thuộc nhóm cuối');
  assert.equal(plan.creates[0].order, 4, 'có hàng mới thì đánh lại thứ tự theo bảng');
  assert.deepEqual(plan.updates.filter(item => !item.fields.length).map(item => item.id), ['c3'], 'hàng chỉ đổi thứ tự');
  assert.equal(plan.unchanged, 0);
});

test('Đổi chỗ hai hàng: lưu thứ tự theo bảng; không đổi chỗ thì giữ thứ tự đọc của văn bản', async () => {
  const workbook = await roundTrip(sheet => {
    const rows = rowsByName(sheet);
    const first = rows.get('Tổng thu ngân sách nhà nước')!;
    const second = rows.get('Thành lập mới doanh nghiệp')!;
    const a = sheet.getRow(first).values as ExcelJS.CellValue[];
    const b = sheet.getRow(second).values as ExcelJS.CellValue[];
    sheet.getRow(first).values = b;
    sheet.getRow(second).values = a;
  });
  const parsed = readCandidateWorkbook(workbook);
  const plan = planSheet(parsed.rows, parsed.issues, existing(), departments, admin);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.updates.map(item => [item.id, item.data.documentOrder]), [['c2', 0], ['c1', 1], ['c3', 2], ['c4', 3]]);
  assert.ok(plan.updates.every(item => !item.fields.length));
});

test('Lỗi: phòng không có trong danh mục, kỳ báo cáo sai, bảng cũ hơn bản trên hệ thống, mã của văn bản khác', async () => {
  const workbook = await roundTrip(sheet => {
    const rows = rowsByName(sheet);
    sheet.getCell(rows.get('Tổng thu ngân sách nhà nước')!, 5).value = 'Phòng Không Tồn Tại';
    sheet.getCell(rows.get('Thành lập mới doanh nghiệp')!, 8).value = 'Hằng tuần';
    sheet.getCell(rows.get('Số giường bệnh/10.000 dân')!, 14).value = 'khac-van-ban';
  });
  const parsed = readCandidateWorkbook(workbook);
  const stale = existing().map(item => (item.id === 'c4' ? { ...item, version: 2 } : item));
  const plan = planSheet(parsed.rows, parsed.issues, stale, departments, admin);
  const messages = plan.errors.map(error => error.message).join(' | ');
  assert.match(messages, /không tìm thấy phòng ban "Phòng Không Tồn Tại"/);
  assert.match(messages, /kỳ báo cáo "Hằng tuần" không hợp lệ/);
  assert.match(messages, /không thuộc văn bản này/);
  assert.match(messages, /đã được sửa trên hệ thống sau khi tải bảng/);
  assert.equal(plan.updates.length, 0);
});

test('Đọc file không phải bảng của hệ thống thì báo rõ', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Sheet1').addRow(['STT', 'Chỉ tiêu']);
  assert.throws(() => readCandidateWorkbook(workbook), /không phải bảng chỉ tiêu tải từ hệ thống/);
});

test('parsePlan giữ chữ gốc khi kế hoạch không chỉ là một con số', () => {
  assert.deepEqual(parsePlan(125.5), { targetValue: 125.5, targetText: null });
  assert.deepEqual(parsePlan('125,5'), { targetValue: 125.5, targetText: null });
  assert.deepEqual(parsePlan('12.000'), { targetValue: 12000, targetText: null });
  assert.deepEqual(parsePlan('9.800 USD/người'), { targetValue: 9800, targetText: '9.800 USD/người' });
  assert.deepEqual(parsePlan('> 10'), { targetValue: 10, targetText: '> 10' });
  assert.deepEqual(parsePlan('2 - 3%/GRDP'), { targetValue: 2, targetText: '2 - 3%/GRDP' });
  assert.deepEqual(parsePlan(''), { targetValue: null, targetText: null });
  assert.equal(roman(4), 'IV');
  assert.equal(roman(12), 'XII');
});
