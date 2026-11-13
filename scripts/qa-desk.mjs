import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createQaActors, cleanupQaActors, qaActorIds } from './qa-actors.mjs';

// Run against the isolated development database only. Temporary actors/data are removed in finally.
try { process.loadEnvFile?.(); } catch { /* CI supplies its environment. */ }
const base = process.env.QA_API_URL || 'http://localhost:3101/api';
if (!process.env.DATABASE_URL || !/\/ioc_wp_a(?:\?|$)/.test(process.env.DATABASE_URL)) throw new Error('QA desk chỉ được chạy trên CSDL ioc_wp_a');
const prisma = new PrismaClient();
let actors, failure;
const additionalUserIds = [], targetIds = [], appIds = [], noteIds = [], checks = [];
async function api(path, token, method = 'GET', body, expected = 200) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000) });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}
const tokens = {};
const send = async (who, recipientIds, extra = {}, expected = 201) => {
  const note = await api('/workspace/notes', tokens[who], 'POST', { content: 'Nội dung kiểm tra quyền, không phải công việc thực tế', color: 'yellow', recipientIds, ...extra }, expected);
  if (note.id) noteIds.push(note.id);
  return note;
};
try {
  actors = await createQaActors(prisma, 'desk');
  const passwordHash = (await prisma.user.findUniqueOrThrow({ where: { id: actors.admin.id }, select: { passwordHash: true } })).passwordHash;
  const office = await prisma.department.findFirstOrThrow({ where: { kind: 'OFFICE', isActive: true } });
  for (const [name, role, departmentId] of [['leader', 'LEADER', null], ['clerk', 'CLERK', null], ['office', 'MANAGER', office.id], ['otherStaff', 'STAFF', actors.departments.secondary.id]]) {
    actors[name] = await prisma.user.create({ data: { username: `qa.desk.${name}.${actors.runId}`, fullName: `QA bàn làm việc ${name}`, passwordHash, role, departmentId } });
    additionalUserIds.push(actors[name].id);
  }
  for (const name of ['admin', 'manager', 'staff', 'viewer', 'otherManager', 'leader', 'clerk', 'office', 'otherStaff']) {
    const login = await api('/auth/login', null, 'POST', { username: actors[name].username, password: actors.password }, 201);
    tokens[name] = login.accessToken;
  }
  await api('/workspace/notes', null, 'GET', undefined, 401);
  await api('/workspace/briefing', null, 'GET', undefined, 401);
  checks.push('Bắt buộc đăng nhập');

  const note = await send('staff', [actors.manager.id]);
  await send('staff', [actors.otherStaff.id], {}, 403);
  await send('staff', [actors.otherManager.id], {}, 403);
  await send('staff', [actors.leader.id]);
  await send('staff', [actors.office.id]);
  await send('manager', [actors.otherManager.id]);
  await send('manager', [actors.otherStaff.id], {}, 403);
  await send('clerk', [actors.leader.id]);
  await send('office', [actors.otherStaff.id]);
  await send('leader', [actors.otherStaff.id]);
  await send('admin', [actors.otherStaff.id]);
  await send('viewer', [actors.staff.id], {}, 403);
  const privateNote = await send('viewer', [actors.viewer.id]);
  await send('staff', [], { roles: ['STAFF'] }, 403);
  await send('manager', [], { departmentIds: [actors.departments.secondary.id] }, 403);
  await send('manager', [], { departmentIds: [actors.departments.primary.id] });
  checks.push('Ma trận gửi: chuyên viên, trưởng phòng, lãnh đạo, quản trị, văn thư, Chánh Văn phòng, người xem');

  await api(`/workspace/notes/${note.id}`, tokens.admin, 'GET', undefined, 404);
  await api(`/workspace/notes/${note.id}/replies`, tokens.otherStaff, 'POST', { content: 'Không được đọc' }, 404);
  await api(`/workspace/notes/${note.id}/recipient`, tokens.staff, 'PATCH', { done: true }, 404);
  await api(`/workspace/notes/${note.id}/recipient`, tokens.manager, 'PATCH', { x: null }, 400);
  await api(`/workspace/notes/${note.id}/recipient`, tokens.manager, 'PATCH', { seen: true, x: 101, y: 32, done: true });
  let detail = await api(`/workspace/notes/${note.id}`, tokens.staff);
  const recipient = detail.recipients.find(row => row.userId === actors.manager.id);
  assert.ok(recipient.seenAt && recipient.doneAt);
  assert.equal(recipient.x, 101);
  await api(`/workspace/notes/${note.id}/replies`, tokens.manager, 'POST', { content: 'Đã hoàn tất phần kiểm tra' }, 201);
  detail = await api(`/workspace/notes/${note.id}`, tokens.staff);
  assert.equal(detail.replies.length, 1);
  assert.ok(await prisma.notification.count({ where: { userId: actors.staff.id, kind: 'DESK_NOTE_REPLY', entityId: note.id } }));
  await api(`/workspace/notes/${note.id}/recipient`, tokens.manager, 'PATCH', { hidden: true });
  assert.ok(!(await api('/workspace/notes', tokens.manager)).received.some(row => row.id === note.id));
  await api(`/workspace/notes/${note.id}/recall`, tokens.manager, 'POST', undefined, 404);
  await api(`/workspace/notes/${note.id}/recall`, tokens.staff, 'POST', undefined, 201);
  await api(`/workspace/notes/${note.id}`, tokens.manager, 'GET', undefined, 404);
  checks.push('Note riêng tư, trạng thái người nhận, vị trí, trả lời, thông báo và thu hồi');

  const now = new Date(), today = new Date(now.getTime() + 7 * 3600_000), year = today.getUTCFullYear();
  for (const [name, user, departmentId] of [['Chỉ tiêu kiểm tra bàn làm việc', actors.staff, actors.departments.primary.id], ['Chỉ tiêu phòng khác', actors.otherStaff, actors.departments.secondary.id]]) {
    const target = await prisma.target.create({ data: { code: `QA-DESK-${actors.runId}-${targetIds.length}`, title: name, unit: '%', targetValue: 100, currentValue: 30, lastReportedAt: now, year, dueDate: new Date(now.getTime() + 86_400_000), departmentId, assigneeId: user.id, kind: 'TASK', frequency: 'MONTHLY', reportDueDay: today.getUTCDate(), createdAt: new Date(now.getTime() - 86_400_000) } });
    targetIds.push(target.id);
  }
  const defaults = await api(`/workspace/note-recipients?targetId=${targetIds[0]}`, tokens.manager);
  assert.ok(defaults.defaultRecipientIds.includes(actors.staff.id));
  assert.ok(defaults.defaultRecipientIds.includes(actors.manager.id));
  await send('staff', [], { targetId: targetIds[1] }, 404);
  const targetNote = await send('manager', [], { targetId: targetIds[0] });
  assert.ok(targetNote.recipients.some(row => row.userId === actors.staff.id));
  const pins = await api(`/workspace/pins?targetIds=${targetIds.join(',')}`, tokens.staff);
  assert.deepEqual(pins.targets.map(row => row.id), [targetIds[0]]);
  assert.equal(pins.targets[0].progress, 30);
  for (const who of ['staff', 'manager', 'leader', 'viewer']) {
    const briefing = await api('/workspace/briefing', tokens[who]);
    if (who === 'staff' || who === 'manager') {
      assert.ok(briefing.systemNotes.some(row => row.targetId === targetIds[0]));
      assert.ok(!briefing.systemNotes.some(row => row.targetId === targetIds[1]));
    } else assert.deepEqual(briefing.systemNotes, []);
    if (who === 'leader') assert.ok(briefing.counts.work > 0);
    if (who === 'viewer') assert.equal(briefing.counts.work, 0);
  }
  checks.push('Người nhận theo chỉ tiêu, scope ghim và briefing theo bốn vai trò');

  const appBody = { name: 'Ứng dụng kiểm tra', url: 'https://mail.tphcm.gov.vn', icon: 'MailOutlined', color: '#1677ff', group: 'QA', description: 'Chỉ dùng trong kiểm thử', roles: ['MANAGER'], departmentIds: [], sortOrder: 9000, isActive: true };
  await api('/workspace/apps/admin', tokens.staff, 'GET', undefined, 403);
  await api('/workspace/apps/admin', tokens.staff, 'POST', appBody, 403);
  const app = await api('/workspace/apps/admin', tokens.admin, 'POST', appBody, 201); appIds.push(app.id);
  assert.ok((await api('/workspace/apps', tokens.manager)).apps.some(row => row.id === app.id));
  assert.ok(!(await api('/workspace/apps', tokens.staff)).apps.some(row => row.id === app.id));
  await api(`/workspace/apps/admin/${app.id}`, tokens.admin, 'PUT', { ...appBody, roles: [], departmentIds: [actors.departments.primary.id] });
  assert.ok((await api('/workspace/apps', tokens.staff)).apps.some(row => row.id === app.id));
  assert.ok(!(await api('/workspace/apps', tokens.otherStaff)).apps.some(row => row.id === app.id));
  await api(`/workspace/apps/admin/${app.id}`, tokens.admin, 'PUT', { ...appBody, badgeUrl: 'https://127.0.0.1/', badgePath: 'count' }, 400);
  await api(`/workspace/apps/admin/${app.id}`, tokens.admin, 'PUT', { ...appBody, roles: [], isActive: false });
  assert.ok(!(await api('/workspace/apps', tokens.admin)).apps.some(row => row.id === app.id));
  checks.push('Quản trị ứng dụng, đối tượng vai trò/phòng, ẩn và chặn nguồn huy hiệu nội bộ');

  for (let index = 1; index < 30; index++) await send('viewer', [actors.viewer.id]);
  await send('viewer', [actors.viewer.id], {}, 429);
  for (let index = 0; index < 60; index++) await api(`/workspace/notes/${privateNote.id}/replies`, tokens.viewer, 'POST', { content: `Kiểm tra giới hạn ${index}` }, 201);
  await api(`/workspace/notes/${privateNote.id}/replies`, tokens.viewer, 'POST', { content: 'Vượt giới hạn' }, 429);
  checks.push('Giới hạn thật: note thứ 31 và trả lời thứ 61 trả 429');

  const auditRows = await prisma.auditLog.findMany({ where: { actorId: { in: [...qaActorIds(actors), ...additionalUserIds] }, action: { startsWith: 'DESK_NOTE' } } });
  assert.ok(auditRows.length);
  assert.ok(!auditRows.some(row => JSON.stringify(row.metadata).includes('Nội dung kiểm tra')));
  checks.push('Audit không ghi nội dung riêng tư');
} catch (error) { failure = error; }
finally {
  try {
    await prisma.notification.deleteMany({ where: { entityType: 'DeskNote', entityId: { in: noteIds } } });
    await prisma.workApp.deleteMany({ where: { id: { in: appIds } } });
    await prisma.target.deleteMany({ where: { id: { in: targetIds } } });
    await cleanupQaActors(prisma, actors, { additionalUserIds, entityIds: [...noteIds, ...appIds] });
    checks.push('Đã dọn dữ liệu và tài khoản QA');
  } catch (error) { failure = new Error(`${failure ? `${failure.message}; ` : ''}Dọn QA: ${error.message}`); }
  await prisma.$disconnect();
}
for (const check of checks) console.log(`PASS ${check}`);
if (failure) { console.error(failure.stack || failure.message); process.exitCode = 1; }
else console.log(`Hoàn tất ${checks.length} nhóm kiểm tra bàn làm việc số 2.0.`);
