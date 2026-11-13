import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { cleanupQaActors, createQaActors } from './qa-actors.mjs';

const baseUrl = process.env.QA_API_URL || 'http://localhost:3103/api';
if (!/\/ioc_(wp|qa|dev)_[a-z0-9_]+(?:\?|$)/.test(process.env.DATABASE_URL || '')) throw new Error('Kịch bản QA chỉ chạy trên CSDL thử (tên dạng ioc_wp_*, ioc_qa_*, ioc_dev_*), không chạy trên dữ liệu đang dùng');
const prisma = new PrismaClient();
const checks = [], targetIds = [], frameworkIds = [];
let actors;
const request = async (path, token, method = 'GET', body, statuses = [200]) => {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.arrayBuffer();
  assert.ok(statuses.includes(response.status), `${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
};

try {
  actors = await createQaActors(prisma, 'target-links');
  const tokens = {};
  for (const key of ['admin', 'manager', 'staff', 'viewer', 'otherManager']) tokens[key] = (await request('/auth/login', '', 'POST', { username: actors[key].username, password: actors.password }, [201])).accessToken;
  for (let index = 0; index < 3; index += 1) {
    const framework = await prisma.framework.create({ data: { code: `QA-LINK-${actors.runId}-${index}`, name: `Bộ kiểm tra liên kết ${index + 1}`, year: 2026, kind: 'PLAN', issuingLevel: index ? 'LOCAL' : 'PROVINCE', legalBasis: index ? `0${index}-NQ/ĐU` : '333/QĐ-UBND' } });
    frameworkIds.push(framework.id);
    const target = await prisma.target.create({ data: { code: `QA-LINK-${actors.runId}-${index}`, title: `Tỷ lệ kiểm tra liên kết ${actors.runId}`, standardCode: `QA-${actors.runId}`, frameworkId: framework.id, departmentId: actors.departments.primary.id, assigneeId: actors.staff.id, unit: '%', targetValue: 95 + index * 2, year: 2026, frequency: 'MONTHLY', issuingLevel: framework.issuingLevel, dueDate: new Date('2026-12-31T16:59:59Z'), createdAt: new Date('2026-01-01T00:00:00Z') } });
    targetIds.push(target.id);
  }
  const [a, b, c] = targetIds;
  let suggestions = await request('/target-links/suggestions?year=2026', tokens.manager);
  assert.ok(suggestions.items.some(item => [item.target.id, item.candidate.id].includes(a) && [item.target.id, item.candidate.id].includes(b)));
  checks.push('Gợi ý hai văn bản cùng mã chuẩn, năm và đơn vị');
  for (const key of ['staff', 'viewer', 'otherManager']) {
    await request('/target-links/link', tokens[key], 'POST', { targetId: a, otherTargetId: b }, [403]);
    await request('/target-links/ignore', tokens[key], 'POST', { targetId: a, otherTargetId: b }, [403]);
    await request(`/target-links/targets/${a}`, tokens[key], 'DELETE', undefined, [403]);
  }
  checks.push('STAFF/VIEWER/MANAGER phòng khác không liên kết, bỏ qua hoặc bỏ liên kết');
  await request('/target-links/ignore', tokens.manager, 'POST', { targetId: a, otherTargetId: c }, [201]);
  suggestions = await request('/target-links/suggestions?year=2026', tokens.manager);
  assert.ok(!suggestions.items.some(item => [item.target.id, item.candidate.id].includes(a) && [item.target.id, item.candidate.id].includes(c)));
  checks.push('Bỏ qua gợi ý được lưu');
  await request('/target-links/link', tokens.manager, 'POST', { targetId: a, otherTargetId: b }, [201]);
  const group = await request(`/target-links/targets/${a}`, tokens.viewer);
  assert.equal(group.items.length, 2);
  assert.equal(group.canManage, false);
  assert.deepEqual(group.items.map(item => item.issuingLevel), ['PROVINCE', 'LOCAL']);
  checks.push('Trưởng phòng liên kết; người xem chỉ đọc; cấp Thành phố đứng trước Địa phương');
  const source = await prisma.target.findUniqueOrThrow({ where: { id: a } });
  await request(`/targets/${a}`, tokens.admin, 'PATCH', { frequency: 'QUARTERLY', expectedVersion: source.version, expectedPublicationVersion: source.publicationVersion }, [409]);
  await request('/targets', tokens.admin, 'POST', { title: 'Không thêm con vào chỉ tiêu liên kết', unit: '%', targetValue: 100, year: 2026, frequency: 'MONTHLY', dueDate: '2026-12-31', departmentId: source.departmentId, parentId: a }, [409]);
  checks.push('Không đổi tần suất hoặc thêm con làm hỏng cấu trúc nhóm liên kết');
  await request(`/targets/${a}/progress`, tokens.admin, 'POST', { value: 96, periodKey: '2026-M09', baseVersion: source.version, note: 'Số liệu kiểm tra liên kết' }, [201]);
  let peer = await request(`/targets/${b}/dossier`, tokens.viewer);
  const firstMirror = peer.reports.find(item => item.periodKey === '2026-M09');
  assert.equal(firstMirror?.value, 96);
  assert.ok(firstMirror?.mirroredFromId);
  assert.equal(firstMirror?.reviewStatus, 'APPROVED');
  assert.notEqual(peer.status, 'COMPLETED');
  assert.equal(peer.periods.find(item => item.key === '2026-M09')?.reported, true);
  checks.push('Quản trị ghi nhận được đồng bộ; mức giao 97 chưa đạt; kỳ đồng bộ không thiếu');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/sukAAAAASUVORK5CYII=', 'base64');
  const evidence = await prisma.evidence.create({ data: { targetId: a, progressUpdateId: firstMirror.mirroredFromId, kind: 'FILE', title: 'Minh chứng dùng chung', mimeType: 'image/png', originalName: 'minh-chung.png', size: png.length, data: png, createdById: actors.staff.id, createdByName: actors.staff.fullName } });
  peer = await request(`/targets/${b}/dossier`, tokens.viewer);
  assert.ok(peer.reports.find(item => item.id === firstMirror.id).evidences.some(item => item.id === evidence.id));
  const downloaded = await request(`/targets/${b}/evidence/${evidence.id}/download`, tokens.viewer);
  assert.deepEqual(Buffer.from(downloaded), png);
  assert.equal(await prisma.evidence.count({ where: { targetId: b } }), 0);
  checks.push('Minh chứng thêm sau duyệt được dùng chung, tải qua hồ sơ đích; không sao chép tệp');
  const current = await prisma.target.findUniqueOrThrow({ where: { id: a } });
  const submitted = await request(`/targets/${a}/progress`, tokens.staff, 'POST', { value: 98, periodKey: '2026-M09', baseVersion: current.version, note: 'Cập nhật số liệu kiểm tra liên kết' }, [201]);
  await request(`/targets/updates/${submitted.update.id}/review`, tokens.manager, 'PATCH', { decision: 'APPROVE' });
  peer = await request(`/targets/${b}/dossier`, tokens.viewer);
  assert.equal(peer.currentValue, 98);
  assert.equal(peer.reports.filter(item => item.periodKey === '2026-M09').length, 2);
  assert.equal(peer.status, 'COMPLETED');
  checks.push('Duyệt báo cáo mới đồng bộ 98, giữ bản 96 làm lịch sử');
  await request(`/target-links/targets/${a}`, tokens.manager, 'DELETE');
  assert.equal((await prisma.target.findUniqueOrThrow({ where: { id: b } })).linkGroupId, null);
  assert.equal(await prisma.progressUpdate.count({ where: { targetId: b } }), 2);
  checks.push('Bỏ liên kết nhóm hai chỉ tiêu; giữ lịch sử đồng bộ');
  console.log(JSON.stringify({ result: 'PASS', checks }, null, 2));
} finally {
  const reports = targetIds.length ? await prisma.progressUpdate.findMany({ where: { targetId: { in: targetIds } }, select: { id: true } }) : [];
  const entityIds = [...targetIds, ...reports.map(row => row.id)];
  await prisma.notification.deleteMany({ where: { entityId: { in: entityIds } } });
  await prisma.targetLinkDismissal.deleteMany({ where: { OR: [{ targetId: { in: targetIds } }, { otherTargetId: { in: targetIds } }] } });
  await prisma.target.deleteMany({ where: { id: { in: targetIds } } });
  await prisma.framework.deleteMany({ where: { id: { in: frameworkIds } } });
  await cleanupQaActors(prisma, actors, { entityIds });
  await prisma.$disconnect();
}
