import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Role } from '@prisma/client';
import { assertCanEnterProgress, resolveDepartmentScope, resolveReadDepartmentScope, type Actor } from '../src/access';
import { DossierController } from '../src/dossier';
import { TargetsController } from '../src/targets';
import { ImportController } from '../src/import';
import { ReportRevisionsController, resolveReportRevisions } from '../src/report-revisions';
import { RateLimitService } from '../src/rate-limit';

const actor = (role: Role): Actor => ({ id: `u-${role}`, username: role, fullName: role, role, departmentId: 'own', isActive: true, department: { id: 'own', code: 'OWN', name: 'Phòng tôi', isActive: true } });
for (const role of [Role.MANAGER, Role.STAFF, Role.VIEWER]) {
  for (const enabled of [false, true]) {
    test(`${role}: crossDepartmentView=${enabled}, đọc độc lập với ghi`, async () => {
      const user = actor(role);
      const db = { systemSetting: { findUnique: async () => ({ crossDepartmentView: enabled }) } };
      assert.equal(await resolveReadDepartmentScope(db, user), 'own');
      assert.equal(await resolveReadDepartmentScope(db, user, undefined, 'all'), enabled ? undefined : 'own');
      if (enabled) assert.equal(await resolveReadDepartmentScope(db, user, 'other'), 'other');
      else await assert.rejects(resolveReadDepartmentScope(db, user, 'other'));
      assert.throws(() => resolveDepartmentScope(user, 'other'));
      const queried: any[] = [];
      const prisma = { ...db, target: { findFirst: async (query: any) => { queried.push(query); return null; } } };
      const dossier = new DossierController(prisma as any);
      // Tất cả đường ghi hồ sơ phải tìm target qua phạm vi ghi trước khi ghi dữ liệu.
      const calls = [
        () => dossier.addDirective({ user }, 'foreign', { kind: 'KHAC', title: 'Văn bản thử' } as any),
        () => dossier.removeDirective({ user }, 'foreign', 'directive'),
        () => dossier.uploadEvidence({ user }, 'foreign', {} as any, {}),
        () => dossier.addEvidenceLink({ user }, 'foreign', { kind: 'LINK', title: 'Minh chứng' } as any),
        () => dossier.assign({ user }, 'foreign', { assigneeId: user.id }),
        () => dossier.transfer({ user }, 'foreign', { toUserId: user.id, reason: 'Thử quyền' }),
        () => dossier.returnToManager({ user }, 'foreign', { reason: 'Thử quyền' }),
        () => dossier.evaluate({ user }, 'foreign', {} as any),
        () => dossier.requestExplanation({ user }, 'foreign', {} as any),
        () => dossier.respondExplanation({ user }, 'foreign', 'request', {} as any),
        () => dossier.updateSourceCard({ user }, 'foreign', {} as any),
        () => dossier.remind({ user }, 'foreign'),
      ];
      for (const invoke of calls) await assert.rejects(invoke());
      assert.equal(queried.length, calls.length);
      for (const query of queried) assert.deepEqual(query.where.OR, [{ departmentId: 'own' }, { coordinators: { some: { departmentId: 'own' } } }]);
      const targets = new TargetsController(prisma as any);
      await assert.rejects(targets.progress('foreign', { value: 1, baseVersion: 1 } as any, { user }));
      if (role !== Role.VIEWER) assert.equal(queried.at(-1).where.departmentId, 'own');
    });
  }
}

test('LEADER không đi được đường nhập trực tiếp kể cả gọi controller, ADMIN vẫn được', async () => {
  const user = actor(Role.LEADER);
  assert.throws(() => assertCanEnterProgress(user));
  assert.doesNotThrow(() => assertCanEnterProgress(actor(Role.ADMIN)));
  const prisma = new Proxy({}, { get: () => { throw new Error('Không được truy vấn DB trước khi chặn quyền'); } });
  await assert.rejects(new TargetsController(prisma as any).progress('target', {} as any, { user }), (e: any) => e.getStatus?.() === 403);
  const imports = new ImportController(prisma as any);
  await assert.rejects(imports.apply('batch', { user }), (e: any) => e.getStatus?.() === 403);
  await assert.rejects(imports.preview({} as any, { user }), (e: any) => e.getStatus?.() === 403);
});

test('cập nhật lại chỉ đóng việc cùng kỳ sau khi duyệt, không đổi giá trị báo cáo cũ', async () => {
  const calls: any[] = [];
  await resolveReportRevisions({ progressUpdate: { updateMany: async (args: any) => calls.push(args) } } as any, 'target', '2026-M10', new Date('2026-11-01'));
  assert.equal(calls[0].where.periodKey, '2026-M10');
  assert.deepEqual(Object.keys(calls[0].data), ['revisionResolvedAt']);
});

test('yêu cầu cập nhật lại từ chối trưởng phòng khác và báo cáo chưa duyệt', async () => {
  const limit = new RateLimitService();
  try {
    const report = { id: 'r', targetId: 't', reviewStatus: 'PENDING', target: { departmentId: 'other' } };
    const tx = { progressUpdate: { findFirst: async () => report } };
    const controller = new ReportRevisionsController({ $transaction: async (fn: any) => fn(tx) } as any, limit);
    await assert.rejects(controller.request({ user: actor(Role.MANAGER) }, 't', 'r', { reason: 'Đối chiếu lại số liệu' }), (e: any) => e.getStatus?.() === 403);
    await assert.rejects(controller.request({ user: actor(Role.LEADER) }, 't', 'r', { reason: 'Đối chiếu lại số liệu' }), (e: any) => e.getStatus?.() === 409);
  } finally { limit.onModuleDestroy(); }
});
