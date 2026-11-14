/** Ma trận C1/C2 trên HTTP thật; chỉ dùng dữ liệu QA riêng và khôi phục cấu hình. */
export async function qaCrossDepartment({ prisma, actors, login, request, check }) {
  const settings = await prisma.systemSetting.findUnique({ where: { id: 'default' } });
  const tokens = {};
  for (const key of ['admin', 'manager', 'staff', 'viewer']) tokens[key] = (await login(actors[key].username, actors.password)).accessToken;
  const adminRow = await prisma.user.findUniqueOrThrow({ where: { id: actors.admin.id } });
  const leader = await prisma.user.create({ data: { username: `qa.c2.leader.${actors.runId}`, fullName: 'Lãnh đạo kiểm thử C2', passwordHash: adminRow.passwordHash, role: 'LEADER' } });
  tokens.leader = (await login(leader.username, actors.password)).accessToken;
  const ids = [];
  let batch;
  try {
    const own = await prisma.target.create({ data: { code: `QA-C2-${actors.runId}`, title: 'Chỉ tiêu kiểm thử cập nhật lại', departmentId: actors.departments.primary.id, assigneeId: actors.staff.id, unit: '%', targetValue: 100, year: 2026, frequency: 'MONTHLY', dueDate: new Date('2026-12-31') } });
    ids.push(own.id);
    const foreign = await prisma.target.create({ data: { code: `QA-C1-${actors.runId}`, title: 'Chỉ tiêu kiểm thử xem liên phòng', departmentId: actors.departments.secondary.id, unit: '%', targetValue: 100, year: 2026, frequency: 'MONTHLY', dueDate: new Date('2026-12-31') } });
    ids.push(foreign.id);
    const writeCases = [
      ['POST', `/targets/${foreign.id}/progress`, { value: 50, baseVersion: 1, note: 'Kiểm tra phạm vi', periodKey: '2026-M10' }],
      ['POST', `/targets/${foreign.id}/directives`, { kind: 'KHAC', title: 'Chỉ đạo thử quyền' }],
      ['DELETE', `/targets/${foreign.id}/directives/qa-missing`],
      ['POST', `/targets/${foreign.id}/evidence`, { kind: 'LINK', title: 'Minh chứng thử quyền', url: 'https://example.org/evidence' }],
      ['POST', `/targets/${foreign.id}/assign`, { assigneeId: actors.staff.id }],
      ['POST', `/targets/${foreign.id}/transfer`, { toUserId: actors.staff.id, reason: 'Kiểm tra phạm vi ghi' }],
      ['POST', `/targets/${foreign.id}/return`, { reason: 'Kiểm tra phạm vi ghi' }],
      ['POST', `/targets/${foreign.id}/evaluations`, { periodKey: '2026-M10', result: 'PARTIAL' }],
      ['POST', `/targets/${foreign.id}/explanations`, { message: 'Kiểm tra phạm vi ghi' }],
      ['POST', `/targets/${foreign.id}/explanations/qa-missing/respond`, { response: 'Kiểm tra quyền liên phòng', expectedVersion: 1 }],
      ['PATCH', `/targets/${foreign.id}/source-card`, { expectedVersion: 1, collectionGuide: 'Kiểm tra phạm vi ghi' }],
      ['POST', `/targets/${foreign.id}/remind`],
      ['POST', `/targets/${foreign.id}/updates/qa-missing/request-revision`, { reason: 'Kiểm tra phạm vi ghi' }],
      ['PATCH', `/targets/${foreign.id}`, { title: 'Không được đổi', expectedVersion: 1, expectedPublicationVersion: 1 }],
      ['POST', `/targets/${foreign.id}/archive`, { reason: 'Kiểm tra phạm vi ghi', expectedVersion: 1, expectedPublicationVersion: 1 }],
      ['PATCH', `/targets/updates/qa-missing/review`, { decision: 'APPROVE' }],
    ];
    for (const enabled of [true, false]) {
      await prisma.systemSetting.update({ where: { id: 'default' }, data: { crossDepartmentView: enabled } });
      for (const key of ['manager', 'staff', 'viewer']) {
        const token = tokens[key];
        const all = (await request('/targets?year=2026&scope=all', { token })).data;
        check(`${key} đọc liên phòng khi setting=${enabled}`, all.some(item => item.id === foreign.id) === enabled);
        const mine = (await request('/targets?year=2026', { token })).data;
        check(`${key} mặc định phòng mình`, mine.every(item => item.departmentId === actors.departments.primary.id || item.coordinators?.some(coordinator => coordinator.department.id === actors.departments.primary.id)));
        const dossier = await request(`/targets/${foreign.id}/dossier`, { token, expected: [enabled ? 200 : 404] });
        if (enabled) check(`${key} hồ sơ phòng khác chỉ xem`, dossier.data.permissions.readOnly && !dossier.data.permissions.canReport && !dossier.data.permissions.canContribute && !dossier.data.permissions.canAssign);
        for (const path of ['/dashboard/report', '/ioc/overview', '/exports/targets.xlsx']) await request(`${path}?year=2026&scope=all&departmentId=${foreign.departmentId}`, { token, expected: [enabled ? 200 : 403] });
        const personalBefore = (await request('/my-work?year=2026', { token })).data.counts;
        await request('/ioc/wallboard?year=2026&scope=all', { token });
        const personalAfter = (await request('/my-work?year=2026', { token })).data.counts;
        check(`${key} số việc không đổi khi xem toàn địa phương`, JSON.stringify(personalBefore) === JSON.stringify(personalAfter));
        for (const [method, path, body] of writeCases) await request(path, { method, token, body, expected: [403, 404] });
        check(`${key} chặn ${writeCases.length} đường ghi liên phòng, setting=${enabled}`, true);
      }
    }
    for (const key of ['staff', 'manager']) {
      batch = await prisma.importBatch.create({ data: { fileName: 'qa-cross.xlsx', totalRows: 1, successRows: 1, errorRows: 0, errors: [], changes: [], createdBy: actors[key].username, departmentId: foreign.departmentId, status: 'PREVIEWED' } });
      await request(`/imports/${batch.id}/apply`, { method: 'POST', token: tokens[key], expected: [403] });
      await prisma.importBatch.delete({ where: { id: batch.id } }); batch = null;
    }
    await request(`/targets/${own.id}/progress`, { method: 'POST', token: tokens.leader, body: { value: 50, baseVersion: 1 }, expected: [403] });
    await request('/imports/targets/preview', { method: 'POST', token: tokens.leader, expected: [403] });
    await request('/imports/qa-missing/apply', { method: 'POST', token: tokens.leader, expected: [403] });
    check('LEADER bị chặn ghi nhận số liệu và cả hai đường nhập Excel', true);
    await request(`/targets/${own.id}/progress`, { method: 'POST', token: tokens.admin, body: { value: 45, baseVersion: 1, periodKey: '2026-M10', note: 'Số liệu gốc kiểm thử' }, expected: [201] });
    const original = await prisma.progressUpdate.findFirstOrThrow({ where: { targetId: own.id, reviewStatus: 'APPROVED' } });
    await request(`/targets/${own.id}/updates/${original.id}/request-revision`, { method: 'POST', token: tokens.leader, body: { reason: 'Đối chiếu lại số liệu kỳ tháng 10' }, expected: [201] });
    const work = (await request('/my-work?year=2026', { token: tokens.staff })).data;
    check('Yêu cầu cập nhật lại tạo mục việc đúng người phụ trách', work.revisionRequests.some(item => item.id === original.id));
    await request(`/targets/${own.id}/progress`, { method: 'POST', token: tokens.staff, body: { value: 48, baseVersion: 2, periodKey: '2026-M10', note: 'Số đã đối chiếu lại' }, expected: [201] });
    check('Số chính thức giữ nguyên khi báo cáo thay thế chờ duyệt', (await prisma.target.findUniqueOrThrow({ where: { id: own.id } })).currentValue === 45);
    const pending = await prisma.progressUpdate.findFirstOrThrow({ where: { targetId: own.id, reviewStatus: 'PENDING' } });
    await request(`/targets/updates/${pending.id}/review`, { method: 'PATCH', token: tokens.manager, body: { decision: 'APPROVE' } });
    const oldReport = await prisma.progressUpdate.findUniqueOrThrow({ where: { id: original.id } });
    check('Duyệt báo cáo thay thế đóng việc, giữ lịch sử và đổi số chính thức', oldReport.value === 45 && oldReport.reviewStatus === 'APPROVED' && !!oldReport.revisionResolvedAt && (await prisma.target.findUniqueOrThrow({ where: { id: own.id } })).currentValue === 48);
  } finally {
    if (batch) await prisma.importBatch.deleteMany({ where: { id: batch.id } });
    await prisma.target.deleteMany({ where: { id: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { actorId: leader.id } });
    await prisma.user.delete({ where: { id: leader.id } });
    await prisma.systemSetting.update({ where: { id: 'default' }, data: { crossDepartmentView: settings?.crossDepartmentView ?? true } });
  }
}
