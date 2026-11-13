import { FrameworkKind, Prisma, ValueSource } from '@prisma/client';
import { type DispatchSetting, dispatcherIds } from './dispatch';
import { evaluateTarget } from './metrics';
import { departmentManagerIds, notifyUsers, recordWorkEvent, targetLink } from './work';

const DAY = 86_400_000;
const TASK_REMINDER_DAYS = 3;

export function taskDeadlineStage(dueDate: Date, now: Date): 'DUE_SOON' | 'OVERDUE' | 'ESCALATED' | null {
  const remaining = dueDate.getTime() - now.getTime();
  if (remaining <= -TASK_REMINDER_DAYS * DAY) return 'ESCALATED';
  if (remaining < 0) return 'OVERDUE';
  if (remaining <= TASK_REMINDER_DAYS * DAY) return 'DUE_SOON';
  return null;
}

type ReminderClient = Pick<Prisma.TransactionClient, 'target' | 'user' | 'notification' | 'workEvent' | 'systemSetting'>;

/** Hạn nhiệm vụ là một lần, độc lập kỳ báo cáo. Khóa chứa hạn để một lần gia hạn được nhắc đúng mốc mới. */
export async function remindTaskDeadlines(prisma: ReminderClient, setting: DispatchSetting, now: Date) {
  const result = { reminders: 0, escalations: 0 };
  const targets = await prisma.target.findMany({
    where: {
      kind: FrameworkKind.TASK, isArchived: false, valueSource: ValueSource.MANUAL,
      dueDate: { lte: new Date(now.getTime() + TASK_REMINDER_DAYS * DAY) },
      department: { isActive: true }, OR: [{ frameworkId: null }, { framework: { isActive: true } }],
    },
    select: {
      id: true, title: true, dueDate: true, departmentId: true, assigneeId: true,
      currentValue: true, targetValue: true, direction: true, lastReportedAt: true,
    },
  });
  for (const target of targets) {
    if (evaluateTarget({ ...target, kind: FrameworkKind.TASK, hasReport: Boolean(target.lastReportedAt), now }).completed) continue;
    const stage = taskDeadlineStage(target.dueDate, now);
    if (!stage) continue;
    const managers = await departmentManagerIds(prisma, target.departmentId);
    const deadlineKey = target.dueDate.toISOString();
    if (stage === 'DUE_SOON') {
      result.reminders += await notifyUsers(prisma, target.assigneeId ? [target.assigneeId] : managers, {
        kind: 'TASK_DUE_SOON', title: `${target.title} · Sắp đến hạn hoàn thành`,
        body: 'Còn không quá 3 ngày. Cập nhật kết quả và minh chứng trong hồ sơ nhiệm vụ.',
        link: targetLink(target.id), entityType: 'Target', entityId: target.id,
        dedupeKey: `task-due:${target.id}:${deadlineKey}`,
      });
      continue;
    }
    result.reminders += await notifyUsers(prisma, managers, {
      kind: 'TASK_OVERDUE', title: `${target.title} · Quá hạn hoàn thành`,
      body: 'Kiểm tra việc thực hiện và yêu cầu người phụ trách báo cáo kết quả.',
      link: targetLink(target.id), entityType: 'Target', entityId: target.id,
      dedupeKey: `task-overdue:${target.id}:${deadlineKey}`,
    });
    if (stage === 'ESCALATED') {
      const count = await notifyUsers(prisma, await dispatcherIds(prisma, setting), {
        kind: 'ESCALATED', title: `${target.title} · Quá hạn từ 3 ngày`,
        body: 'Đã báo trưởng phòng chủ trì; cần người phân việc và lãnh đạo kiểm tra.',
        link: targetLink(target.id), entityType: 'Target', entityId: target.id,
        dedupeKey: `task-escalated:${target.id}:${deadlineKey}`,
      });
      if (count) {
        await recordWorkEvent(prisma, {
          action: 'ESCALATED', actor: null, targetId: target.id, departmentId: target.departmentId,
          responsibleUserId: managers[0] ?? null, note: 'Nhiệm vụ quá hạn từ 3 ngày — đã báo người phân việc và lãnh đạo',
        });
        result.escalations += 1;
      }
    }
  }
  return result;
}
