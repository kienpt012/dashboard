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
  position?: string | null;
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

// Vai trò có phạm vi toàn địa phương: quản trị hệ thống, lãnh đạo UBND và văn thư (đầu mối tiếp nhận).
// Các vai trò còn lại chỉ thấy dữ liệu phòng ban của mình.
export const GLOBAL_ROLES: readonly Role[] = [Role.ADMIN, Role.LEADER, Role.CLERK];
// Thẩm quyền nghiệp vụ "giao và đánh giá": lãnh đạo UBND (ADMIN giữ toàn quyền để tương thích bản 1).
export const LEADERSHIP_ROLES: readonly Role[] = [Role.ADMIN, Role.LEADER];
// Mọi vai trò được làm việc (khác chỉ xem) — dùng cho đề xuất chỉ tiêu, báo lỗi, minh chứng.
export const WORKING_ROLES: readonly Role[] = [Role.ADMIN, Role.LEADER, Role.CLERK, Role.MANAGER, Role.STAFF];

export function isGlobalRole(role: Role): boolean {
  return GLOBAL_ROLES.includes(role);
}

export function isLeadership(actor: Pick<Actor, 'role'>): boolean {
  return LEADERSHIP_ROLES.includes(actor.role);
}

/** Người có quyền duyệt/đánh giá trong phạm vi một phòng: lãnh đạo UBND, hoặc trưởng phòng của chính phòng đó. */
export function canSuperviseDepartment(actor: Actor, departmentId: string): boolean {
  if (isLeadership(actor)) return true;
  return actor.role === Role.MANAGER && actor.departmentId === departmentId && Boolean(actor.department?.isActive);
}

/** Tác nhân hệ thống cho các thao tác tự động theo quy tắc thời hạn (tự thông qua, nhắc việc). */
export const SYSTEM_ACTOR: Actor = {
  id: 'system',
  username: 'he-thong',
  fullName: 'Hệ thống IOC',
  role: Role.ADMIN,
  isActive: true,
  departmentId: null,
  department: null,
};

export function resolveDepartmentScope(
  actor: Actor,
  requestedDepartmentId?: string | null,
): string | undefined {
  const requested = requestedDepartmentId?.trim() || undefined;
  if (isGlobalRole(actor.role)) {
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
  if (!isGlobalRole(actor.role) && scopedDepartmentId !== departmentId) {
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
