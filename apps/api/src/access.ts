import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';

export interface ActorDepartment {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface Actor {
  id: string;
  username: string;
  fullName: string;
  email?: string | null;
  role: Role;
  isActive: boolean;
  departmentId: string | null;
  department?: ActorDepartment | null;
  lastLoginAt?: Date | null;
}

interface RequestWithActor {
  user?: Actor;
}

interface AuditClient {
  auditLog: {
    create(args: {
      data: {
        actorId: string;
        actorUsername: string;
        actorRole: Role;
        action: string;
        entityType: string;
        entityId?: string | null;
        departmentId?: string | null;
        metadata?: Prisma.InputJsonValue;
      };
    }): Promise<unknown>;
  };
}

export interface AuditEvent {
  action: string;
  entityType: string;
  entityId?: string | null;
  departmentId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export function getActor(request: RequestWithActor): Actor {
  if (!request.user) {
    throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
  }
  return request.user;
}

export function resolveDepartmentScope(
  actor: Actor,
  requestedDepartmentId?: string | null,
): string | undefined {
  const requested = requestedDepartmentId?.trim() || undefined;
  if (actor.role === Role.ADMIN) {
    return requested;
  }
  if (!actor.departmentId || !actor.department?.isActive) {
    throw new ForbiddenException('Tài khoản chưa được gắn với phòng ban đang hoạt động');
  }
  if (requested && requested !== actor.departmentId) {
    throw new ForbiddenException('Bạn chỉ được truy cập dữ liệu của phòng ban mình');
  }
  return actor.departmentId;
}

export function assertDepartmentAccess(actor: Actor, departmentId: string): void {
  const scopedDepartmentId = resolveDepartmentScope(actor, departmentId);
  if (actor.role !== Role.ADMIN && scopedDepartmentId !== departmentId) {
    throw new ForbiddenException('Bạn không có quyền thao tác dữ liệu của phòng ban này');
  }
}

export async function audit(
  prisma: AuditClient,
  actor: Actor,
  event: AuditEvent,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      departmentId: event.departmentId === undefined ? actor.departmentId : event.departmentId,
      ...(event.metadata === undefined ? {} : { metadata: event.metadata }),
    },
  });
}
