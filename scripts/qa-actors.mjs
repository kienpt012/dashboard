import { randomBytes, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';

function suiteSlug(value) {
  return String(value || 'suite')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20) || 'suite';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function qaActorIds(actors) {
  if (!actors) return [];
  return unique([
    actors.admin?.id,
    actors.manager?.id,
    actors.staff?.id,
    actors.viewer?.id,
    actors.otherManager?.id,
  ]);
}

export async function createQaActors(prisma, suiteName) {
  const activeDepartments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
  });
  if (activeDepartments.length < 2) {
    throw new Error('QA cần ít nhất hai phòng ban đang hoạt động để kiểm tra phạm vi dữ liệu');
  }

  const primaryDepartment = activeDepartments.find(item => item.code === 'KTHTDT') ?? activeDepartments[0];
  const secondaryDepartment = activeDepartments.find(
    item => item.id !== primaryDepartment.id && item.code === 'VHXH',
  ) ?? activeDepartments.find(item => item.id !== primaryDepartment.id);
  if (!secondaryDepartment) {
    throw new Error('Không tìm thấy phòng ban thứ hai cho ma trận phân quyền QA');
  }

  const runId = `${Date.now().toString(36)}-${randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const prefix = `qa.${suiteSlug(suiteName)}`;
  const password = `Qa1!${randomBytes(18).toString('base64url')}`;
  const passwordHash = await bcrypt.hash(password, 10);

  const actors = await prisma.$transaction(async tx => {
    const createActor = (label, role, departmentId = null) => tx.user.create({
      data: {
        username: `${prefix}.${label}.${runId}`,
        passwordHash,
        fullName: `QA ${suiteName} - ${label}`,
        role,
        departmentId,
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        departmentId: true,
      },
    });

    const admin = await createActor('admin', 'ADMIN');
    const manager = await createActor('manager', 'MANAGER', primaryDepartment.id);
    const staff = await createActor('staff', 'STAFF', primaryDepartment.id);
    const viewer = await createActor('viewer', 'VIEWER', primaryDepartment.id);
    const otherManager = await createActor('other-manager', 'MANAGER', secondaryDepartment.id);
    return { admin, manager, staff, viewer, otherManager };
  });

  return {
    ...actors,
    password,
    runId,
    departments: {
      primary: primaryDepartment,
      secondary: secondaryDepartment,
    },
  };
}

export async function cleanupQaActors(
  prisma,
  actors,
  { additionalUserIds = [], entityIds = [] } = {},
) {
  if (!actors) return { userIds: [], auditIds: [] };

  const userIds = unique([...qaActorIds(actors), ...additionalUserIds]);
  const exactEntityIds = unique([...entityIds, ...userIds]);
  const auditFilters = [];
  if (userIds.length) auditFilters.push({ actorId: { in: userIds } });
  if (exactEntityIds.length) auditFilters.push({ entityId: { in: exactEntityIds } });
  const auditRows = auditFilters.length
    ? await prisma.auditLog.findMany({
        where: { OR: auditFilters },
        select: { id: true },
      })
    : [];
  const auditIds = auditRows.map(item => item.id);

  await prisma.$transaction(async tx => {
    if (auditIds.length) {
      await tx.auditLog.deleteMany({ where: { id: { in: auditIds } } });
    }
    if (userIds.length) {
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  const [remainingUsers, remainingAudits] = await Promise.all([
    userIds.length ? prisma.user.count({ where: { id: { in: userIds } } }) : 0,
    auditFilters.length ? prisma.auditLog.count({ where: { OR: auditFilters } }) : 0,
  ]);
  if (remainingUsers || remainingAudits) {
    throw new Error(`Dọn actor QA chưa hoàn tất: users=${remainingUsers}, audits=${remainingAudits}`);
  }

  return { userIds, auditIds };
}
