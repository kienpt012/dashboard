import { docRef, docRefText, DOC_REF_INCLUDE } from './doc-ref';
import type { Actor } from './access';
import { resolveReadDepartmentScope } from './access';
import type { PrismaService } from './prisma.service';

const INTERNAL_CODE = /\b(?:CT|VBCD|NQDU)-20\d{2}-[\p{L}\d-]+/gu;
const STATUS: Record<string, string> = {
  ASSIGNED: 'được giao phụ trách', TRANSFERRED: 'đã chuyển người phụ trách', RETURNED: 'cần phân công lại',
  EXPLANATION_REQUESTED: 'cần giải trình', EXPLANATION_ANSWERED: 'đã có giải trình', REMINDER: 'cần cập nhật số liệu',
};
export function notificationTitle(title: string, kind: string, targetTitle?: string) {
  const replaced = title.replace(INTERNAL_CODE, targetTitle || 'chỉ tiêu');
  if (!targetTitle || replaced.startsWith(targetTitle)) return replaced;
  if (STATUS[kind]) return `${targetTitle} — ${STATUS[kind]}`;
  const rest = replaced.replace(targetTitle, '').replace(/^Chỉ tiêu\s*/u, '').replace(/^\s*[:·—-]|[:·—-]\s*$/g, '').trim();
  return `${targetTitle}${rest ? ` — ${rest.charAt(0).toLocaleLowerCase('vi')}${rest.slice(1)}` : ''}`;
}

/** Đọc lại thông báo cũ theo quyền hiện tại, không sửa lịch sử hoặc đánh dấu đã xem. */
export async function presentNotifications<T extends { title: string; body: string | null; kind: string; entityType: string | null; entityId: string | null }>(prisma: PrismaService, actor: Actor, items: T[]) {
  const ids = items.filter(item => item.entityType === 'Target' && item.entityId).map(item => item.entityId!);
  if (!ids.length) return items.map(item => ({ ...item, title: notificationTitle(item.title, item.kind), body: item.body?.replace(INTERNAL_CODE, 'chỉ tiêu') ?? null }));
  const departmentId = await resolveReadDepartmentScope(prisma, actor, undefined, 'all');
  const rows = await prisma.target.findMany({ where: { id: { in: ids }, ...(departmentId ? { OR: [{ departmentId }, { coordinators: { some: { departmentId } } }] } : {}) }, include: { department: { select: { name: true } }, ...DOC_REF_INCLUDE } });
  const targets = new Map(rows.map(row => [row.id, row]));
  return items.map(item => {
    const target = item.entityType === 'Target' && item.entityId ? targets.get(item.entityId) : undefined;
    const body = item.body?.replace(INTERNAL_CODE, target?.title || 'chỉ tiêu') ?? '';
    const context = target ? [target.department.name, docRefText(target)].filter(part => part && !body.includes(part)) : [];
    return { ...item, ...(target ? docRef(target) : {}), title: notificationTitle(item.title, item.kind, target?.title), body: [...context, body].filter(Boolean).join(' · ') || null };
  });
}
