import { ForbiddenException } from '@nestjs/common';
import { DepartmentKind, FrameworkKind, Prisma, Role } from '@prisma/client';
import { type Actor, isLeadership, resolveDepartmentScope } from './access';
import { leaderIds } from './work';

export type DispatchSetting = { dispatchMode?: 'LEADER' | 'OFFICE' } | null | undefined;
type DispatchClient = Pick<Prisma.TransactionClient, 'systemSetting' | 'user'>;

/** Quyền phân việc liên phòng; không cấp quyền ghi số liệu hoặc giao chuyên viên thay trưởng phòng. */
export function isDispatcher(actor: Actor, setting?: DispatchSetting): boolean {
  if (!actor.isActive) return false;
  if (isLeadership(actor)) return true;
  return setting?.dispatchMode === 'OFFICE'
    && actor.role === Role.MANAGER
    && Boolean(actor.departmentId && actor.department?.id === actor.departmentId && actor.department.isActive)
    && actor.department?.kind === DepartmentKind.OFFICE;
}

export async function dispatchSetting(prisma: Pick<DispatchClient, 'systemSetting'>) {
  return prisma.systemSetting.findUnique({ where: { id: 'default' }, select: { dispatchMode: true } });
}

export function dispatchScope(actor: Actor, setting: DispatchSetting, requestedDepartmentId?: string | null) {
  return isDispatcher(actor, setting) ? requestedDepartmentId?.trim() || undefined : resolveDepartmentScope(actor, requestedDepartmentId);
}

/** Lãnh đạo luôn nhận báo cáo; chế độ Văn phòng bổ sung các Chánh Văn phòng đang hoạt động. */
export async function dispatcherIds(prisma: DispatchClient, setting?: DispatchSetting): Promise<string[]> {
  const leaders = await leaderIds(prisma);
  const current = setting === undefined ? await dispatchSetting(prisma) : setting;
  if (current?.dispatchMode !== 'OFFICE') return leaders;
  const office = await prisma.user.findMany({
    where: { role: Role.MANAGER, isActive: true, department: { kind: DepartmentKind.OFFICE, isActive: true } },
    select: { id: true },
  });
  return [...new Set([...leaders, ...office.map(user => user.id)])];
}

export async function assertTargetDefinitionAccess(
  prisma: Pick<Prisma.TransactionClient, 'systemSetting' | 'framework'>,
  actor: Actor,
  target: { kind?: FrameworkKind; frameworkId?: string | null },
): Promise<void> {
  if (isLeadership(actor)) return;
  const setting = await dispatchSetting(prisma);
  const framework = target.frameworkId
    ? await prisma.framework.findUnique({ where: { id: target.frameworkId }, select: { kind: true } })
    : null;
  if (!isDispatcher(actor, setting) || target.kind !== FrameworkKind.TASK || framework?.kind !== FrameworkKind.TASK) {
    throw new ForbiddenException('Chỉ người phân việc được chỉnh sửa nhiệm vụ thuộc văn bản chỉ đạo');
  }
}
