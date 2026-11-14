import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { IssuingLevel, ProgressReviewStatus, Role, TargetDirection, TargetFrequency, ValueSource } from '@prisma/client';
import type { Actor } from '../src/access';
import {
  assertLinkableTargets, assertLinkedTargetDefinition, attachLinkedReportEvidence, canManageTargetLinks, ISSUING_LEVEL_ORDER,
  linkedEvidenceWhere, linkNameSimilarity, linkPairKey, linkSuggestion, mirrorApprovedReport,
  normalizeLinkText, TargetLinksController,
} from '../src/target-links';

function actor(role: Role, departmentId = 'd1'): Actor {
  return { id: `user-${role}`, username: role, fullName: role, role, isActive: true, departmentId, department: { id: departmentId, code: departmentId, name: departmentId, isActive: true } };
}
const candidate = { id: 'a', title: 'Tỷ lệ dân số tham gia bảo hiểm y tế', year: 2026, unit: '%', frameworkId: 'f1', standardCode: 'CT4', linkGroupId: null };

test('gợi ý chuẩn hoá dấu/khoảng trắng; ngưỡng 0,85 và mã chuẩn', () => {
  assert.equal(normalizeLinkText('  ĐẢNG   uỷ  '), 'dang uy');
  assert.equal(linkNameSimilarity(candidate.title, ' Ty le dan so tham gia bao hiem y te '), 1);
  assert.equal(linkNameSimilarity('', ''), 0);
  assert.ok(linkSuggestion(candidate, { ...candidate, id: 'b', frameworkId: 'f2', title: 'Tên khác vẫn cùng mã chuẩn' }));
  assert.ok(linkSuggestion({ ...candidate, standardCode: null }, { ...candidate, id: 'b', standardCode: null, frameworkId: 'f2', title: 'Tỷ lệ dân số tham gia bảo hiểm y tế.' }));
  assert.equal(linkSuggestion({ ...candidate, standardCode: null }, { ...candidate, id: 'b', standardCode: null, frameworkId: 'f2', title: 'Số cây xanh mới trồng' }), null);
});

test('không gợi ý sai năm/đơn vị, cùng văn bản hoặc đã cùng nhóm', () => {
  const b = { ...candidate, id: 'b', frameworkId: 'f2' };
  for (const changed of [{ year: 2025 }, { unit: 'người' }, { frameworkId: 'f1' }, { frameworkId: null }]) assert.equal(linkSuggestion(candidate, { ...b, ...changed }), null);
  assert.equal(linkSuggestion({ ...candidate, linkGroupId: 'g' }, { ...b, linkGroupId: 'g' }), null);
  assert.equal(linkPairKey('a', 'b'), linkPairKey('b', 'a'));
});

test('ma trận quyền ghi liên kết không mở rộng theo quyền đọc liên phòng', () => {
  for (const role of [Role.STAFF, Role.VIEWER, Role.CLERK]) {
    assert.equal(canManageTargetLinks(actor(role), ['d1']), false);
    assert.equal(canManageTargetLinks(actor(role), ['d2']), false);
  }
  assert.equal(canManageTargetLinks(actor(Role.MANAGER), ['d1']), true);
  assert.equal(canManageTargetLinks(actor(Role.MANAGER), ['d1', 'd2']), false);
  assert.equal(canManageTargetLinks(actor(Role.MANAGER), ['d1', 'd2'], true), true);
  assert.equal(canManageTargetLinks(actor(Role.LEADER), ['d1', 'd2']), true);
  assert.equal(canManageTargetLinks(actor(Role.ADMIN), ['d1', 'd2']), true);
  assert.equal(canManageTargetLinks({ ...actor(Role.ADMIN), isActive: false }, ['d1']), false);
  assert.equal(canManageTargetLinks(actor(Role.VIEWER), []), false);
  for (const method of ['link', 'ignore', 'unlink']) {
    const roles = Reflect.getMetadata('roles', TargetLinksController.prototype[method as 'link']);
    assert.deepEqual(roles, [Role.ADMIN, Role.LEADER, Role.MANAGER]);
  }
});

test('định nghĩa chỉ tiêu liên kết không được thay đổi làm mất khả năng đồng bộ', () => {
  const target = { linkGroupId: 'g', unit: '%', year: 2026, frequency: 'MONTHLY', direction: 'HIGHER_IS_BETTER', valueSource: 'MANUAL', frameworkId: 'f1' };
  assert.doesNotThrow(() => assertLinkedTargetDefinition(target, { year: 2026 }));
  for (const change of [{ unit: 'hộ' }, { year: 2027 }, { frequency: 'YEARLY' }, { direction: 'LOWER_IS_BETTER' }, { valueSource: 'COMPUTED' }, { frameworkId: 'f2' }]) assert.throws(() => assertLinkedTargetDefinition(target, change));
});

test('chỉ liên kết chỉ tiêu nhập tay không có con, cùng lịch và chiều', () => {
  const value = { isArchived: false, valueSource: ValueSource.MANUAL, children: [], year: 2026, unit: '%', frequency: TargetFrequency.MONTHLY, direction: TargetDirection.HIGHER_IS_BETTER };
  assert.doesNotThrow(() => assertLinkableTargets([value, { ...value }]));
  for (const changed of [{ valueSource: ValueSource.COMPUTED }, { isArchived: true }, { children: [{ id: 'child' }] }, { year: 2025 }, { unit: 'hộ' }, { frequency: TargetFrequency.YEARLY }, { direction: TargetDirection.LOWER_IS_BETTER }]) {
    assert.throws(() => assertLinkableTargets([value, { ...value, ...changed }]));
  }
  assert.deepEqual([IssuingLevel.LOCAL, IssuingLevel.CENTRAL, IssuingLevel.PROVINCE].sort((a, b) => ISSUING_LEVEL_ORDER[a] - ISSUING_LEVEL_ORDER[b]), ['CENTRAL', 'PROVINCE', 'LOCAL']);
});

function mirrorFixture() {
  const sourceTarget: any = {
    id: 'a', title: 'Tỷ lệ dân số tham gia bảo hiểm y tế', frameworkId: 'f1', unit: '%', year: 2026, frequency: TargetFrequency.MONTHLY,
    direction: TargetDirection.HIGHER_IS_BETTER, isArchived: false, valueSource: ValueSource.MANUAL, children: [], linkGroupId: 'group',
    sourceDocument: { docNumber: '333/QĐ-UBND' }, framework: null, targetValue: 95, departmentId: 'd1', version: 2, dueDate: new Date('2026-12-31'),
  };
  const source: any = { id: 'report-a', reviewStatus: ProgressReviewStatus.APPROVED, mirroredFromId: null, periodKey: '2026-M09', targetId: 'a', target: sourceTarget, userId: 'staff', value: 96, valueText: '96%', reviewedBy: 'manager', reviewedAt: new Date('2026-10-01'), autoApproved: false };
  const peer = { ...sourceTarget, id: 'b', targetValue: 97, currentValue: 90, departmentId: 'd1', version: 4 };
  const created: any[] = [], events: any[] = [], audits: any[] = [], targets: any[] = [], revisions: any[] = [];
  const tx: any = {
    progressUpdate: {
      findUnique: async (args: any) => args.where.id ? source : created.find(row => row.targetId === args.where.targetId_mirroredFromId.targetId && row.mirroredFromId === args.where.targetId_mirroredFromId.mirroredFromId) ?? null,
      create: async ({ data }: any) => { const row = { id: `mirror-${created.length}`, ...data }; created.push(row); return row; },
      updateMany: async (args: any) => { revisions.push(args); return { count: 0 }; },
    },
    target: { findMany: async () => [peer], updateMany: async ({ data }: any) => { targets.push(data); return { count: 1 }; } },
    systemSetting: { findUnique: async () => ({ riskThreshold: 70 }) },
    workEvent: { create: async ({ data }: any) => { events.push(data); return data; } },
    auditLog: { create: async ({ data }: any) => { audits.push(data); return data; } },
  };
  return { tx, source, peer, created, events, audits, targets, revisions };
}

test('duyệt đồng bộ cùng kỳ/giá trị, mức giao riêng, đủ báo cáo kỳ và chạy lại không nhân đôi', async () => {
  const f = mirrorFixture();
  assert.deepEqual(await mirrorApprovedReport(f.tx, f.source.id, actor(Role.LEADER)), ['b']);
  assert.equal(f.created.length, 1);
  assert.equal(f.created[0].value, 96);
  assert.equal(f.created[0].periodKey, '2026-M09');
  assert.equal(f.created[0].reviewStatus, ProgressReviewStatus.APPROVED);
  assert.equal(f.created[0].mirroredFromId, 'report-a');
  assert.equal(f.created[0].note, 'Đồng bộ từ báo cáo của 333/QĐ-UBND');
  assert.notEqual(f.targets[0].status, 'COMPLETED', '96 đạt mức 95 của nguồn nhưng chưa đạt mức 97 của bản đồng bộ');
  assert.equal(f.events[0].action, 'REPORT_MIRRORED');
  assert.equal(f.audits[0].action, 'REPORT_MIRRORED');
  assert.ok(new Set(f.created.filter(row => row.reviewStatus !== 'REJECTED').map(row => row.periodKey)).has('2026-M09'), 'cơ chế thiếu kỳ đọc bản đồng bộ như báo cáo thường');
  assert.deepEqual(await mirrorApprovedReport(f.tx, f.source.id, actor(Role.LEADER)), []);
  assert.equal(f.created.length, 1);
});

test('tự thông qua cũng đồng bộ; báo cáo mới giữ lịch sử bản cũ', async () => {
  const f = mirrorFixture();
  f.source.autoApproved = true;
  await mirrorApprovedReport(f.tx, f.source.id, actor(Role.ADMIN));
  assert.equal(f.created[0].autoApproved, true);
  f.source.id = 'report-a-revised'; f.source.value = 98;
  await mirrorApprovedReport(f.tx, f.source.id, actor(Role.LEADER));
  assert.equal(f.created.length, 2);
  assert.equal(f.created[0].value, 96);
  assert.equal(f.created[1].value, 98);
  assert.equal(f.targets[1].status, 'COMPLETED');
});

test('không đồng bộ báo cáo chưa duyệt, bản đồng bộ, thiếu kỳ hoặc nguồn có con', async () => {
  for (const mutate of [
    (f: ReturnType<typeof mirrorFixture>) => { f.source.reviewStatus = 'PENDING'; },
    (f: ReturnType<typeof mirrorFixture>) => { f.source.mirroredFromId = 'original'; },
    (f: ReturnType<typeof mirrorFixture>) => { f.source.periodKey = null; },
    (f: ReturnType<typeof mirrorFixture>) => { f.source.target.children = [{ id: 'child' }]; },
  ]) {
    const f = mirrorFixture(); mutate(f);
    assert.deepEqual(await mirrorApprovedReport(f.tx, f.source.id, actor(Role.LEADER)), []);
    assert.equal(f.created.length, 0);
  }
});

test('minh chứng dùng tham chiếu gốc; không sao chép nội dung tệp, tải theo hồ sơ có mirror', async () => {
  const evidence = { id: 'ev1', title: 'Biên bản', targetId: 'a', kind: 'FILE' };
  const prisma: any = { progressUpdate: { findMany: async () => [{ id: 'report-a', evidences: [evidence] }] } };
  const reports = await attachLinkedReportEvidence(prisma, [{ id: 'mirror-b', mirroredFromId: 'report-a', evidences: [] }]);
  assert.equal((reports[0].evidences[0] as any).id, 'ev1');
  assert.equal((reports[0].evidences[0] as any).targetId, 'a');
  assert.deepEqual(linkedEvidenceWhere('b', 'ev1'), { id: 'ev1', OR: [{ targetId: 'b' }, { progressUpdate: { mirrors: { some: { targetId: 'b', reviewStatus: 'APPROVED' } } } }] });
});
