import { FrameworkKind, IssuingLevel, PrismaClient, ProgressReviewStatus, Role, TargetDirection, ValueSource } from '@prisma/client';
import { evaluateTarget } from '../../src/metrics';
import { seedForecastHistory } from './forecast-history';

/** Chỉ chạy trên CSDL dev của gói C. Mọi chỉ tiêu/lịch sử bổ sung đều là dữ liệu mô phỏng. */
async function main() {
  const prisma = new PrismaClient();
  try {
    const database = new URL(process.env.DATABASE_URL || '').pathname.slice(1);
    if (database !== 'ioc_wp_c') throw new Error('Script dữ liệu mô phỏng này chỉ chạy trên CSDL ioc_wp_c');
    const admin = await prisma.user.findFirstOrThrow({ where: { role: Role.ADMIN, isActive: true }, include: { department: true } });
    const city = await prisma.framework.findFirstOrThrow({ where: { code: 'HCM-KTXH-2026' } });
    const framework = await prisma.framework.upsert({
      where: { code: 'DEMO-DANG-UY-2026' },
      create: { id: 'demo-dang-uy-2026', code: 'DEMO-DANG-UY-2026', name: 'Chỉ tiêu Nghị quyết Đảng uỷ phường năm 2026', kind: FrameworkKind.PLAN, issuingLevel: IssuingLevel.LOCAL, year: 2026, legalBasis: '01-NQ/ĐU', description: 'DỮ LIỆU MÔ PHỎNG để minh hoạ nhiều mức giao; không phải nghị quyết hoặc số liệu chính thức.', sortOrder: 25 },
      update: {},
    });
    const codes = ['CT3', 'CT4', 'CT14', 'CT41', 'CT2', 'CT13', 'CT23'];
    const created: Array<{ sourceId: string; targetId: string; linked: boolean }> = [];
    for (const [index, standardCode] of codes.entries()) {
      const source = await prisma.target.findFirstOrThrow({ where: { frameworkId: city.id, standardCode, isArchived: false, valueSource: ValueSource.MANUAL, children: { none: { isArchived: false } } } });
      const tighterValue = source.direction === TargetDirection.LOWER_IS_BETTER
        ? Math.max(0, Math.round(source.targetValue * 0.9 * 100) / 100)
        : source.unit === '%' && source.targetValue < 100
          ? Math.min(100, Math.round((source.targetValue + 2) * 100) / 100)
          : Math.round(source.targetValue * 1.05 * 100) / 100;
      const linked = index < 4;
      const groupId = `demo-link-2026-${standardCode}`;
      const target = await prisma.target.upsert({
        where: { code: `DEMO-DU-2026-${standardCode}` },
        create: {
          id: `demo-du-2026-${standardCode.toLowerCase()}`, code: `DEMO-DU-2026-${standardCode}`, title: source.title,
          description: 'DỮ LIỆU MÔ PHỎNG: mức giao của Đảng uỷ cao hơn mức Thành phố giao.',
          frameworkId: framework.id, kind: source.kind, issuingLevel: IssuingLevel.LOCAL,
          standardCode: source.standardCode, ordinal: String(index + 1), sortOrder: index,
          unit: source.unit, targetValue: tighterValue, targetText: `${tighterValue} ${source.unit}`, year: source.year,
          frequency: source.frequency, direction: source.direction, dueDate: source.dueDate,
          departmentId: source.departmentId, assigneeId: source.assigneeId, assignedAt: source.assignedAt,
          assignedById: source.assignedById, valueSource: ValueSource.MANUAL,
          linkGroupId: linked ? groupId : null, reportDueDay: source.reportDueDay,
          legalBasis: '01-NQ/ĐU', createdAt: new Date('2026-01-20T00:00:00+07:00'),
        },
        update: {},
      });
      if (linked) {
        await prisma.target.updateMany({ where: { id: { in: [source.id, target.id] }, linkGroupId: null }, data: { linkGroupId: groupId } });
        const reports = await prisma.progressUpdate.findMany({ where: { targetId: source.id, reviewStatus: ProgressReviewStatus.APPROVED, mirroredFromId: null, periodKey: { not: null } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
        for (const report of reports) await prisma.$transaction(async tx => {
          const existing = await tx.progressUpdate.findUnique({ where: { targetId_mirroredFromId: { targetId: target.id, mirroredFromId: report.id } } });
          if (existing) return;
          const mirrored = await tx.progressUpdate.create({ data: {
            targetId: target.id, userId: report.userId, mirroredFromId: report.id,
            value: report.value, periodKey: report.periodKey, valueText: report.valueText,
            dataSource: report.dataSource, explanation: report.explanation,
            note: 'Đồng bộ từ báo cáo của 333/QĐ-UBND (dữ liệu mô phỏng)',
            reviewStatus: ProgressReviewStatus.APPROVED, baseVersion: target.version,
            reviewedBy: report.reviewedBy, reviewedAt: report.reviewedAt, autoApproved: report.autoApproved,
            createdAt: report.createdAt,
          } });
          const metric = evaluateTarget({ ...target, currentValue: report.value, hasReport: true });
          await tx.target.update({ where: { id: target.id }, data: { currentValue: report.value, lastReportedAt: report.reviewedAt ?? report.createdAt, status: metric.status } });
          await tx.workEvent.create({ data: { targetId: target.id, departmentId: target.departmentId, action: 'REPORT_MIRRORED', actorId: admin.id, actorName: admin.fullName, note: 'Đồng bộ từ báo cáo của 333/QĐ-UBND (dữ liệu mô phỏng)', metadata: { progressUpdateId: mirrored.id, mirroredFromId: report.id, simulated: true }, createdAt: report.reviewedAt ?? report.createdAt } });
          await tx.auditLog.create({ data: { actorId: admin.id, actorUsername: admin.username, actorRole: admin.role, action: 'DEMO_REPORT_MIRRORED', entityType: 'ProgressUpdate', entityId: mirrored.id, departmentId: target.departmentId, metadata: { simulated: true, mirroredFromId: report.id } } });
        });
      }
      created.push({ sourceId: source.id, targetId: target.id, linked });
    }
    await seedForecastHistory(prisma);
    console.log(JSON.stringify({ simulated: true, frameworkId: framework.id, targets: created }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
