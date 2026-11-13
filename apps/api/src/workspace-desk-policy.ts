import { BadRequestException } from '@nestjs/common';
import { DepartmentKind, Prisma, Role } from '@prisma/client';
import { Actor, isGlobalRole, resolveDepartmentScope } from './access';

export type DeskPerson = Pick<Actor, 'id' | 'role' | 'departmentId'> & { department?: { kind?: DepartmentKind; isActive: boolean } | null };

export function canBroadcastNotes(actor: DeskPerson): boolean {
  return actor.role === Role.ADMIN || actor.role === Role.LEADER
    || actor.role === Role.MANAGER && actor.department?.kind === DepartmentKind.OFFICE && actor.department.isActive;
}

export function canSendDeskNote(actor: DeskPerson, recipient: DeskPerson): boolean {
  if (actor.id === recipient.id) return true;
  if (actor.role === Role.VIEWER) return false;
  if (canBroadcastNotes(actor)) return true;
  if (actor.departmentId && actor.departmentId === recipient.departmentId && actor.department?.isActive) return true;
  if (recipient.role === Role.LEADER) return true;
  if (recipient.role === Role.MANAGER && recipient.department?.kind === DepartmentKind.OFFICE && recipient.department.isActive) return true;
  return actor.role === Role.MANAGER && recipient.role === Role.MANAGER;
}

export function canReadDeskNote(userId: string, note: { authorId: string; recipients: { userId: string }[] }): boolean {
  return note.authorId === userId || note.recipients.some(recipient => recipient.userId === userId);
}

export function workAppVisible(app: { isActive: boolean; roles: Role[]; departmentIds: string[] }, actor: Pick<Actor, 'role' | 'departmentId'>): boolean {
  return app.isActive && (!app.roles.length && !app.departmentIds.length
    || app.roles.includes(actor.role) || !!actor.departmentId && app.departmentIds.includes(actor.departmentId));
}

/** Same read scope as DossierController, including coordinating departments. */
export function deskTargetScope(actor: Actor): Prisma.TargetWhereInput {
  const departmentId = resolveDepartmentScope(actor);
  return departmentId ? { OR: [{ departmentId }, { coordinators: { some: { departmentId } } }] } : {};
}

/** A briefing is an action list, narrower than read access to targets. */
export function deskWorkScope(actor: Actor): Prisma.TargetWhereInput {
  if (actor.role === Role.VIEWER || actor.role === Role.CLERK) return { id: '__none__' };
  if (actor.role === Role.STAFF) return { assigneeId: actor.id, departmentId: resolveDepartmentScope(actor) };
  if (actor.role === Role.MANAGER) return { departmentId: resolveDepartmentScope(actor) };
  return isGlobalRole(actor.role) ? {} : { id: '__none__' };
}

export function plainNote(value: string, max: number): string {
  const content = value.trim();
  if (!content || content.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(content)) {
    throw new BadRequestException(`Nội dung phải từ 1 đến ${max} ký tự văn bản thuần`);
  }
  return content;
}

export function safeAppUrl(raw: string): string {
  if (/\s|[\u0000-\u001f\\]/.test(raw)) throw new BadRequestException('Địa chỉ ứng dụng không hợp lệ');
  let url: URL;
  try { url = new URL(raw); } catch { throw new BadRequestException('Địa chỉ ứng dụng không hợp lệ'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new BadRequestException('Ứng dụng phải có địa chỉ HTTP hoặc HTTPS, không chứa tài khoản');
  return url.href;
}

export function badgeNumber(data: unknown, path: string): number | undefined {
  if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(path) || path.split('.').some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) return undefined;
  let value: unknown = data;
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
