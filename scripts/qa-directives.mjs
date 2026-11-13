import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';

// Chỉ chạy trên CSDL riêng của gói B; không tự nạp .env chung hoặc đoán CSDL.
const database = process.env.DATABASE_URL;
if (!database || new URL(database).pathname !== '/ioc_wp_b') throw new Error('QA yêu cầu DATABASE_URL trỏ đúng ioc_wp_b');
const base = process.env.QA_API_URL || 'http://localhost:3102/api';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('QA chỉ dùng API cục bộ');
const prisma = new PrismaClient();
const checks = [];
const frameworkIds = [];
const candidateIds = [];
const targetIds = [];
const stamp = Date.now();
let originalMode;
let admin;

async function request(user, path, method = 'GET', body, allowed = [200, 201]) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(user ? { authorization: `Bearer ${user.accessToken}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
  assert.ok(allowed.includes(response.status), `${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
function check(label, condition = true) { assert.ok(condition, label); checks.push(label); }
async function mode(value) {
  const setting = await request(admin, '/settings');
  return request(admin, '/settings', 'PATCH', { dispatchMode: value, expectedVersion: setting.version });
}
async function framework(user, suffix) {
  const item = await request(user, '/directives', 'POST', {
    name: `Kế hoạch kiểm thử giao nhiệm vụ ${stamp} ${suffix}`, directiveKind: 'KE_HOACH',
    docNumber: `${stamp}/KH-UBND`, issuedDate: '2026-10-01', issuer: 'UBND phường Lái Thiêu', signer: 'Chủ tịch UBND',
  });
  frameworkIds.push(item.id);
  return item;
}
async function proposal(user, departmentId, fw, suffix) {
  const item = await request(user, '/candidates', 'POST', {
    name: `Nhiệm vụ từ đề xuất ${stamp} ${suffix}`, unit: '%', targetValue: 100, targetYear: 2026,
    frequency: 'YEARLY', deadline: '2026-11-30', responsibleDepartmentId: departmentId,
    frameworkId: fw.id, targetKind: 'TASK', submit: true,
  });
  candidateIds.push(item.id);
  return item;
}
async function workbook(user, path, expectedSheets) {
  const response = await fetch(base + path, { headers: { authorization: `Bearer ${user.accessToken}` } });
  assert.equal(response.status, 200, response.status === 200 ? undefined : await response.text());
  assert.match(response.headers.get('content-type') || '', /spreadsheetml/);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
  assert.ok(book.worksheets.length >= expectedSheets);
  assert.ok(book.worksheets.every(sheet => sheet.rowCount > 1));
  return book;
}

try {
  const users = {};
  for (const name of ['admin', 'chanh.vp', 'lan.anh', 'van.thu', 'chu.tich', 'thao.ktht', 'viewer.ktht']) {
    users[name] = await request(null, '/auth/login', 'POST', { username: name, password: name === 'admin' ? process.env.DEMO_ADMIN_PASSWORD : process.env.DEMO_USER_PASSWORD });
  }
  admin = users.admin;
  originalMode = (await request(admin, '/settings')).dispatchMode;
  const leader = users['chu.tich'];
  const office = users['chanh.vp'];
  const staff = users['thao.ktht'];
  const options = await request(admin, '/directives/options');
  const ownDepartment = staff.user.departmentId;
  const otherDepartment = options.departments.find(item => item.id !== ownDepartment && item.id !== office.user.departmentId).id;
  const fw = await framework(leader, 'luồng chính');

  for (const dispatchMode of ['LEADER', 'OFFICE']) {
    await mode(dispatchMode);
    for (const name of ['chanh.vp', 'lan.anh', 'van.thu', 'chu.tich', 'thao.ktht', 'viewer.ktht']) {
      const user = users[name];
      const canDispatch = name === 'chu.tich' || (name === 'chanh.vp' && dispatchMode === 'OFFICE');
      const canCreate = canDispatch || name === 'van.thu';
      const permission = await request(user, '/directives/options');
      assert.equal(permission.permissions.canDispatch, canDispatch, `${dispatchMode}/${name}: canDispatch`);
      assert.equal(permission.permissions.canCreate, canCreate, `${dispatchMode}/${name}: canCreate`);
      const client = await request(user, '/settings/client');
      assert.equal(client.permissions.canDispatch, canDispatch);
      if (canCreate) await framework(user, `${dispatchMode}-${name}`);
      else await request(user, '/directives', 'POST', { name: 'Không được tạo', directiveKind: 'KE_HOACH', docNumber: '1/KH-UBND', issuedDate: '2026-11-01', issuer: 'UBND phường' }, [403]);
      if (!canDispatch) await request(user, `/directives/${fw.id}/paste`, 'POST', { text: 'Việc không được giao trước 30/11/2026', departmentId: ownDepartment }, [403]);
      check(`Ma trận ${dispatchMode}: ${name} — tạo và phân việc`);
    }
    const candidate = await proposal(staff, otherDepartment, fw, dispatchMode);
    if (dispatchMode === 'LEADER') await request(office, `/candidates/${candidate.id}/approve`, 'POST', { expectedVersion: candidate.version }, [403, 404]);
    else {
      await request(office, `/candidates/${candidate.id}`, 'PATCH', { expectedVersion: candidate.version, responsibleDepartmentId: ownDepartment });
      const fresh = await request(office, `/candidates/${candidate.id}`);
      await request(office, `/candidates/${candidate.id}/approve`, 'POST', { expectedVersion: fresh.version });
      const approved = await prisma.indicatorCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      targetIds.push(approved.createdTargetId);
      check('Chánh Văn phòng đổi phòng và duyệt đề xuất liên phòng', Boolean(approved.reviewedAt));
      const target = await prisma.target.findUniqueOrThrow({ where: { id: approved.createdTargetId } });
      check('Nhiệm vụ từ đề xuất tham gia văn bản và lưu người phân việc', target.kind === 'TASK' && target.frameworkId === fw.id && target.dispatchedById === office.user.id);
    }
  }

  const self = await proposal(office, ownDepartment, fw, 'tự duyệt');
  await request(office, `/candidates/${self.id}/approve`, 'POST', { expectedVersion: self.version }, [403]);
  check('Chánh Văn phòng không được tự duyệt');
  const ownManager = await proposal(users['lan.anh'], ownDepartment, fw, 'trưởng phòng tự duyệt');
  await request(users['lan.anh'], `/candidates/${ownManager.id}/approve`, 'POST', { expectedVersion: ownManager.version }, [403]);
  check('Trưởng phòng không được tự duyệt đề xuất cá nhân');

  await request(office, `/directives/${fw.id}/paste`, 'POST', {
    text: 'Rà soát hồ sơ đầu tư trước 05/11/2026\nHoàn thiện phương án tổ chức trước 15/11/2026\nTổng hợp báo cáo cuối tháng trước 30/11/2026', departmentId: ownDepartment,
  });
  let detail = await request(office, `/directives/${fw.id}`);
  const pasted = detail.tasks.filter(task => !targetIds.includes(task.id));
  targetIds.push(...pasted.map(task => task.id));
  check('Dán tạo đúng ba nhiệm vụ và tách hạn khỏi nội dung', pasted.length === 3 && pasted.every(task => !task.title.includes('trước')));
  await request(office, `/directives/${fw.id}/paste`, 'POST', { text: 'Ngày không tồn tại trước 31/02/2026', departmentId: ownDepartment }, [400]);
  await request(office, `/directives/${fw.id}/bulk`, 'POST', { tasks: pasted.map(task => ({ id: task.id, expectedVersion: task.version })), departmentId: otherDepartment, dueDate: '2026-11-25' });
  detail = await request(office, `/directives/${fw.id}`);
  const changed = detail.tasks.filter(task => pasted.some(old => old.id === task.id));
  check('Giao phòng và đặt hạn hàng loạt', changed.every(task => task.department.id === otherDepartment && task.dueDate.startsWith('2026-11-25')));
  await request(office, `/directives/${fw.id}/bulk`, 'POST', { tasks: pasted.map(task => ({ id: task.id, expectedVersion: task.version })), dueDate: '2026-11-26' }, [409]);
  check('Phiên bản cũ không ghi đè giao việc');

  // Dữ liệu thời gian xác định để đối soát thống kê và nhắc hạn độc lập ngày chạy máy.
  const fixedNow = new Date('2026-11-13T03:00:00.000Z');
  for (const [index, task] of changed.entries()) {
    const completed = index < 2;
    const dueDate = new Date(index === 0 ? '2026-11-15T16:59:59.999Z' : index === 1 ? '2026-11-10T16:59:59.999Z' : '2026-11-08T16:59:59.999Z');
    await prisma.target.update({ where: { id: task.id }, data: { departmentId: ownDepartment, assigneeId: staff.user.id, dueDate, currentValue: completed ? 100 : 30, lastReportedAt: fixedNow } });
    await prisma.progressUpdate.create({ data: { targetId: task.id, userId: staff.user.id, value: completed ? 100 : 30, note: 'Kết quả kiểm thử có mốc thời gian xác định', baseVersion: task.version, reviewStatus: 'APPROVED', reviewedAt: fixedNow, reviewedBy: leader.user.id, createdAt: fixedNow } });
  }
  const stats = await request(leader, `/directives/statistics?year=2026`);
  const group = stats.byDocument.find(item => item.id === fw.id);
  check('Thống kê phân biệt hoàn thành đúng hạn và trễ', group.completedOnTime === 1 && group.completedLate === 1 && group.overdue >= 1);
  const month = await request(leader, '/directives/monthly?month=2026-11');
  const monthlyRows = month.groups.flatMap(item => item.items);
  check('Việc theo tháng có nhiệm vụ và kỳ chỉ tiêu', monthlyRows.some(item => item.kind === 'TASK') && monthlyRows.some(item => item.kind !== 'TASK'));
  check('Việc theo tháng nhận nhiệm vụ vừa giao', changed.every(task => monthlyRows.some(item => item.id === task.id)));
  await workbook(leader, '/directives/statistics.xlsx?year=2026', 4);
  await workbook(leader, '/directives/monthly.xlsx?month=2026-11', 1);
  check('Xuất Excel thống kê nhiều trang và việc theo tháng mở được');

  const taskDossier = await request(staff, `/targets/${changed[2].id}/dossier`);
  check('Hồ sơ nhiệm vụ không sinh kỳ báo cáo định kỳ', taskDossier.periods.length === 0);
  await request(staff, `/targets/${changed[2].id}/progress`, 'POST', { value: 101, note: 'Vượt giới hạn tỷ lệ', baseVersion: taskDossier.version }, [400]);
  await request(staff, `/targets/${changed[2].id}/progress`, 'POST', { value: 50, baseVersion: taskDossier.version }, [400]);
  await request(staff, `/targets/${changed[2].id}/progress`, 'POST', { value: 50, note: 'Đã hoàn thiện hồ sơ và chuyển cơ quan thẩm định', explanation: 'Chờ kết quả đối chiếu hồ sơ', baseVersion: taskDossier.version });
  check('Báo cáo TASK không chọn kỳ, có nội dung và tỷ lệ 0–100');

  const { AccountabilityWorker } = await import('../apps/api/dist/accountability-worker.js');
  const worker = new AccountabilityWorker(prisma, { get: () => undefined });
  await worker.runOnce(fixedNow);
  const noticeWhere = { entityId: { in: changed.map(item => item.id) }, dedupeKey: { startsWith: 'task-' }, kind: { in: ['TASK_DUE_SOON', 'TASK_OVERDUE', 'ESCALATED'] } };
  const firstNotices = await prisma.notification.findMany({ where: noticeWhere });
  await worker.runOnce(fixedNow);
  const secondCount = await prisma.notification.count({ where: noticeWhere });
  check('Worker nhắc hạn TASK và không gửi trùng khi chạy lại', firstNotices.length > 0 && firstNotices.length === secondCount);
  check('Nhắc hạn dùng tên nhiệm vụ, không dùng mã hệ thống', firstNotices.every(item => !/CT-2026/.test(item.title)));
  const overdueRecipients = firstNotices.filter(item => item.entityId === changed[2].id).map(item => item.userId);
  check('Quá hạn ba ngày báo Chánh Văn phòng và lãnh đạo', overdueRecipients.includes(office.user.id) && overdueRecipients.includes(leader.user.id));
  await worker.onModuleDestroy();

  console.log(JSON.stringify({ ok: true, checks: checks.length, details: checks }, null, 2));
} finally {
  if (admin && originalMode) await mode(originalMode);
  const allTargets = await prisma.target.findMany({ where: { frameworkId: { in: frameworkIds } }, select: { id: true } });
  const ids = [...new Set([...targetIds.filter(Boolean), ...allTargets.map(item => item.id)])];
  await prisma.notification.deleteMany({ where: { entityId: { in: [...ids, ...candidateIds] } } });
  await prisma.indicatorCandidate.deleteMany({ where: { id: { in: candidateIds } } });
  await prisma.target.deleteMany({ where: { id: { in: ids } } });
  await prisma.framework.deleteMany({ where: { id: { in: frameworkIds } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...ids, ...candidateIds, ...frameworkIds] } } });
  await prisma.$disconnect();
}
