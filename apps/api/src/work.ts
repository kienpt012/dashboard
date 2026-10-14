import { Prisma, Role } from '@prisma/client';
import type { Actor } from './access';

// Dòng thời gian trách nhiệm và thông báo trong ứng dụng.
// Mọi thao tác giao, chuyển, trả, duyệt, tự thông qua… đều ghi một WorkEvent trong CÙNG transaction với
// dữ liệu nghiệp vụ để lãnh đạo truy được "ai chậm, chậm ở đâu, lúc nào". Thông báo có dedupeKey duy nhất
// theo từng người nhận nên bộ giám sát thời hạn chạy lại nhiều lần cũng không nhắc trùng.

export const WORK_ACTIONS = {
  TARGET_CREATED: 'Tạo chỉ tiêu',
  TARGET_UPDATED: 'Cập nhật định nghĩa chỉ tiêu',
  ASSIGNED: 'Giao chuyên viên phụ trách',
  TRANSFERRED: 'Chuyển cho đồng nghiệp',
  RETURNED: 'Trả lại trưởng phòng',
  REPORT_SUBMITTED: 'Gửi báo cáo số liệu',
  REPORT_APPROVED: 'Duyệt báo cáo số liệu',
  REPORT_REJECTED: 'Trả lại báo cáo số liệu',
  REPORT_AUTO_APPROVED: 'Tự thông qua báo cáo do quá hạn duyệt',
  REPORT_AUTO_BLOCKED: 'Không thể tự thông qua báo cáo',
  COMPUTED_UPDATE: 'Tự tính lại từ kho dữ liệu',
  DIRECTIVE_ADDED: 'Bổ sung văn bản chỉ đạo',
  DIRECTIVE_REMOVED: 'Gỡ văn bản chỉ đạo',
  EVIDENCE_ADDED: 'Bổ sung minh chứng',
  EVALUATED: 'Đánh giá kết quả',
  EXPLANATION_REQUESTED: 'Yêu cầu giải trình',
  EXPLANATION_ANSWERED: 'Trả lời giải trình',
  PROPOSAL_CREATED: 'Tạo đề xuất chỉ tiêu',
  PROPOSAL_SUBMITTED: 'Trình đề xuất',
  PROPOSAL_APPROVED: 'Duyệt đề xuất thành chỉ tiêu',
  PROPOSAL_REJECTED: 'Từ chối đề xuất',
  PROPOSAL_AUTO_APPROVED: 'Tự thông qua đề xuất do quá hạn xử lý',
  PROPOSAL_AUTO_BLOCKED: 'Đề xuất quá hạn nhưng thiếu thông tin',
  REMINDER: 'Nhắc việc',
  ESCALATED: 'Báo cáo lên lãnh đạo',
} as const;

export type WorkAction = keyof typeof WORK_ACTIONS;

type WorkClient = Pick<Prisma.TransactionClient, 'workEvent' | 'notification' | 'user'>;

export interface WorkEventInput {
  action: WorkAction;
  actor: Actor | null;
  targetId?: string | null;
  candidateId?: string | null;
  departmentId?: string | null;
  responsibleUserId?: string | null;
  note?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export async function recordWorkEvent(tx: WorkClient, input: WorkEventInput) {
  return tx.workEvent.create({
    data: {
      action: input.action,
      actorId: input.actor && input.actor.id !== 'system' ? input.actor.id : null,
      actorName: input.actor && input.actor.id !== 'system' ? input.actor.fullName : 'Hệ thống IOC',
      targetId: input.targetId ?? null,
      candidateId: input.candidateId ?? null,
      departmentId: input.departmentId ?? null,
      responsibleUserId: input.responsibleUserId ?? null,
      note: input.note?.slice(0, 2000) ?? null,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    },
  });
}

export interface NotificationInput {
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Khóa chống trùng chung; mỗi người nhận dùng khóa `${dedupeKey}:${userId}`. */
  dedupeKey: string;
}

/** Gửi thông báo cho danh sách người nhận (bỏ trùng, bỏ chính người gây ra sự kiện). Trả về số thông báo mới. */
export async function notifyUsers(
  tx: WorkClient,
  userIds: Iterable<string | null | undefined>,
  input: NotificationInput,
  exceptUserId?: string | null,
): Promise<number> {
  const recipients = [...new Set([...userIds].filter((id): id is string => Boolean(id) && id !== exceptUserId && id !== 'system'))];
  if (!recipients.length) return 0;
  const result = await tx.notification.createMany({
    data: recipients.map(userId => ({
      userId,
      kind: input.kind,
      title: input.title.slice(0, 200),
      body: input.body?.slice(0, 1000) ?? null,
      link: input.link ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      dedupeKey: `${input.dedupeKey}:${userId}`.slice(0, 300),
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/** Trưởng phòng (MANAGER đang hoạt động) của một phòng ban. */
export async function departmentManagerIds(tx: WorkClient, departmentId: string | null | undefined): Promise<string[]> {
  if (!departmentId) return [];
  const users = await tx.user.findMany({
    where: { departmentId, role: Role.MANAGER, isActive: true },
    select: { id: true },
  });
  return users.map(user => user.id);
}

/** Lãnh đạo UBND đang hoạt động; địa phương chưa tạo tài khoản lãnh đạo thì gửi cho quản trị hệ thống. */
export async function leaderIds(tx: WorkClient): Promise<string[]> {
  const leaders = await tx.user.findMany({ where: { role: Role.LEADER, isActive: true }, select: { id: true } });
  if (leaders.length) return leaders.map(user => user.id);
  const admins = await tx.user.findMany({ where: { role: Role.ADMIN, isActive: true }, select: { id: true } });
  return admins.map(user => user.id);
}

export async function clerkIds(tx: WorkClient): Promise<string[]> {
  const clerks = await tx.user.findMany({ where: { role: Role.CLERK, isActive: true }, select: { id: true } });
  return clerks.map(user => user.id);
}

/** Ngày theo giờ Việt Nam dạng YYYY-MM-DD — dùng làm hậu tố khóa chống nhắc trùng trong ngày. */
export function vietnamDayKey(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function targetLink(targetId: string): string {
  return `/admin/targets/${targetId}`;
}
