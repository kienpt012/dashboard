import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectDocumentMeta, documentProfile } from '../src/document-type';
import { extractTasks, organizationOfHeading, taskDeadline } from '../src/task-extraction';

const head = (lines: string[]) => lines.join('\n');

test('loại văn bản theo số ký hiệu và tên loại in hoa', () => {
  const decision = detectDocumentMeta(head([
    'ỦY BAN NHÂN DÂN', 'PHƯỜNG LÁI THIÊU', 'Số: 333/QĐ-UBND', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
    'Lái Thiêu, ngày 15 tháng 01 năm 2026', 'QUYẾT ĐỊNH', 'Về việc giao chỉ tiêu phát triển kinh tế - xã hội năm 2026',
  ]));
  assert.deepEqual([decision.docType, decision.docNumber, decision.issuedDate], ['QUYET_DINH', '333/QĐ-UBND', '2026-01-15']);
  assert.equal(detectDocumentMeta('Số: 15/KH-UBND\nKẾ HOẠCH\nCải cách hành chính năm 2026').docType, 'KE_HOACH');
  assert.equal(detectDocumentMeta('ĐẢNG ỦY PHƯỜNG\nSố 05-NQ/ĐU\nNGHỊ QUYẾT').docNumber, '05-NQ/ĐU');
  assert.equal(detectDocumentMeta('ĐẢNG ỦY PHƯỜNG\nSố 05-NQ/ĐU\nNGHỊ QUYẾT').docType, 'NGHI_QUYET');
  assert.equal(detectDocumentMeta('Số: 12-CTr/ĐU\nCHƯƠNG TRÌNH HÀNH ĐỘNG').docType, 'CHUONG_TRINH');
  assert.equal(detectDocumentMeta('CHÍNH PHỦ\nSố: 30/2020/NĐ-CP\nNGHỊ ĐỊNH\nVề công tác văn thư').docType, 'NGHI_DINH');
  assert.equal(detectDocumentMeta('CHÍNH PHỦ\nSố: 30/2020/NĐ-CP\nNGHỊ ĐỊNH').docNumber, '30/2020/NĐ-CP');
  assert.equal(detectDocumentMeta('Số: 45/BC-UBND\nBÁO CÁO\nTình hình kinh tế - xã hội quý III').docType, 'BAO_CAO');
  assert.equal(detectDocumentMeta('Số: 08/CT-UBND\nCHỈ THỊ').docType, 'CHI_THI');
  // Công văn không ghi tên loại: ký hiệu là tên cơ quan và đơn vị soạn thảo, có trích yếu "V/v".
  const letter = detectDocumentMeta(head(['Số: 1234/UBND-VP', 'V/v báo cáo kết quả thực hiện chỉ tiêu quý III', 'Kính gửi: Các phòng chuyên môn']));
  assert.deepEqual([letter.docType, letter.docNumber], ['CONG_VAN', '1234/UBND-VP']);
  // Dự thảo chưa có số vẫn nhận loại; tờ trình không bị coi là công văn.
  assert.deepEqual([detectDocumentMeta('Số:      /KH-UBND\nKẾ HOẠCH').docType, detectDocumentMeta('Số:      /KH-UBND\nKẾ HOẠCH').docNumber], ['KE_HOACH', null]);
  assert.equal(detectDocumentMeta('Số: 21/TTr-UBND\nTỜ TRÌNH\nKính gửi: Hội đồng nhân dân').docType, null);
  assert.equal(detectDocumentMeta('Bảng số liệu không có phần đầu văn bản').docType, null);
  assert.equal(documentProfile('KE_HOACH').tasks, 'sections');
  assert.equal(documentProfile('CONG_VAN').tasks, 'all');
  assert.equal(documentProfile('QUYET_DINH').tasks, 'none');
  assert.equal(documentProfile(null).tasks, 'none');
});

test('hạn trong câu giao việc', () => {
  assert.equal(taskDeadline('hoàn thành trước ngày 30/6/2026', 2026), '2026-06-30');
  assert.equal(taskDeadline('báo cáo chậm nhất ngày 15 tháng 3', 2026), '2026-03-15');
  assert.equal(taskDeadline('Hoàn thành trong quý II/2026.', 2026), '2026-06-30');
  assert.equal(taskDeadline('thời gian hoàn thành: tháng 9 năm 2026', 2025), '2026-09-30');
  assert.equal(taskDeadline('hoàn thành trong năm 2026', null), '2026-12-31');
  assert.equal(taskDeadline('Tổ chức tuyên truyền thường xuyên', 2026), null);
});

test('đề mục là tên đơn vị', () => {
  assert.equal(organizationOfHeading('2. Phòng Văn hóa - Xã hội'), 'Phòng Văn hóa - Xã hội');
  assert.equal(organizationOfHeading('c) Công an phường, Ban Chỉ huy Quân sự phường:'), 'Công an phường, Ban Chỉ huy Quân sự phường');
  assert.equal(organizationOfHeading('III. TỔ CHỨC THỰC HIỆN'), null);
  assert.equal(organizationOfHeading('1. Tổ chức tuyên truyền'), null);
  assert.equal(organizationOfHeading('Ban hành kèm theo Quyết định'), null);
  assert.equal(organizationOfHeading('Phòng Kinh tế tham mưu kế hoạch'), null);
});

test('nhiệm vụ trong văn xuôi của kế hoạch: đơn vị theo câu hoặc theo đề mục, hạn, phối hợp', () => {
  const chunk = head([
    '[Mục: III. TỔ CHỨC THỰC HIỆN > 2. Phòng Kinh tế]',
    '- Chủ trì, phối hợp với Công an phường và các khu phố rà soát, lập danh sách hộ kinh doanh chưa đăng ký; hoàn thành trước ngày 30/6/2026.',
    '- Tham mưu Ủy ban nhân dân phường kế hoạch chỉnh trang đô thị năm 2026.',
    '- Bảo đảm tỷ lệ giải ngân vốn đầu tư công đạt trên 95%.',
    'Tổ chức thực hiện nghiêm túc.',
  ]);
  const tasks = extractTasks(chunk, { headingPath: ['III. TỔ CHỨC THỰC HIỆN', '2. Phòng Kinh tế'], defaultYear: 2026, inTaskSection: true });
  assert.deepEqual(tasks.map(task => [task.name, task.responsibleDepartmentName, task.coordinatingDepartments, task.deadline]), [
    ['Rà soát, lập danh sách hộ kinh doanh chưa đăng ký', 'Phòng Kinh tế', 'Công an phường và các khu phố', '2026-06-30'],
    ['Tham mưu Ủy ban nhân dân phường kế hoạch chỉnh trang đô thị năm 2026', 'Phòng Kinh tế', null, null],
  ]);
  assert.match(tasks[0].sourceQuote, /^- Chủ trì, phối hợp/);
});

test('nhiệm vụ trong công văn: chỉ câu giao việc rõ đơn vị hoặc có hạn', () => {
  const chunk = head([
    'Thực hiện chỉ đạo của Ủy ban nhân dân Thành phố về công tác cải cách hành chính năm 2026.',
    'Giao Văn phòng HĐND và UBND phường chủ trì, phối hợp với các phòng chuyên môn tổng hợp kết quả, báo cáo Ủy ban nhân dân Thành phố trước ngày 15/12/2026.',
    'Đề nghị các khu phố tuyên truyền đến người dân về dịch vụ công trực tuyến.',
    'Công an phường tăng cường tuần tra, kiểm soát địa bàn trong dịp Tết.',
    'Báo cáo kết quả gửi về Văn phòng trước ngày 20/11/2026.',
    'Trường hợp cần thiết, liên hệ số điện thoại 0274 3755 123.',
  ]);
  const tasks = extractTasks(chunk, { defaultYear: 2026 });
  assert.deepEqual(tasks.map(task => [task.responsibleDepartmentName, task.coordinatingDepartments, task.deadline]), [
    ['Văn phòng HĐND và UBND phường', 'các phòng chuyên môn', '2026-12-15'],
    ['các khu phố', null, null],
    ['Công an phường', null, null],
    [null, null, '2026-11-20'],
  ]);
  assert.equal(tasks[0].name, 'Tổng hợp kết quả, báo cáo Ủy ban nhân dân Thành phố trước ngày 15/12/2026');
  assert.equal(tasks[1].name, 'Tuyên truyền đến người dân về dịch vụ công trực tuyến');
  assert.equal(tasks[2].name, 'Tăng cường tuần tra, kiểm soát địa bàn trong dịp Tết');
});
