import type { Actor } from './access';
import { DirectivesController } from './directives';
import { PrismaService } from './prisma.service';
import { RateLimitService } from './rate-limit';
import { ScheduleController, vietnamToday } from './schedule';

export const READ_INTENTS = ['LEADER_SCHEDULE', 'OVERDUE_DIRECTIVES', 'SLOW_DEPARTMENTS', 'UNREAD_NOTES'] as const;
export type ReadIntent = typeof READ_INTENTS[number];

/** Dùng đúng các đường đọc và kiểm tra phạm vi của màn hình nghiệp vụ. */
export async function copilotRead(prisma: PrismaService, actor: Actor, intent: ReadIntent, options: { year: number; scope?: string; departmentId?: string; scheduleRange?: 'today' | 'week' }, now = new Date()) {
  if (intent === 'LEADER_SCHEDULE') {
    const today = vietnamToday(now);
    const data = await new ScheduleController(prisma).week({ user: actor }, { week: today });
    const rows = (data.schedule?.entries ?? []).filter(row => options.scheduleRange === 'week' || row.date === today);
    return { reply: rows.length ? `${options.scheduleRange === 'week' ? 'Lịch tuần này' : 'Lịch hôm nay'}:\n${rows.map(row => `- ${row.date} ${row.startTime || ''}: ${row.leader} — ${row.content}${row.location ? ` (${row.location})` : ''}`).join('\n')}` : 'Chưa có lịch làm việc trong khoảng thời gian được hỏi.', source: { tool: 'schedules.week', parameters: { range: options.scheduleRange ?? 'today', weekStart: data.weekStart } } };
  }
  if (intent === 'UNREAD_NOTES') {
    const notes = await prisma.deskNote.findMany({ where: { recalledAt: null, recipients: { some: { userId: actor.id, hiddenAt: null, seenAt: null } } }, select: { id: true, content: true, createdAt: true, author: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' }, take: 20 });
    return { reply: notes.length ? `${notes.length === 20 ? '20 note chưa xem gần nhất' : `${notes.length} note chưa xem`}:\n${notes.map(note => `- ${note.author.fullName}: ${note.content.slice(0, 300)}`).join('\n')}` : 'Bạn không có note chưa xem.', source: { tool: 'deskNotes.unread', parameters: { owner: 'self', limit: 20 } } };
  }
  const limiter = new RateLimitService();
  const controller = new DirectivesController(prisma, limiter);
  const stats = await controller.statistics({ user: actor }, { year: options.year, departmentId: options.departmentId, scope: options.scope, ...(intent === 'OVERDUE_DIRECTIVES' ? { status: 'OVERDUE' } : {}) }).finally(() => limiter.onModuleDestroy());
  if (intent === 'OVERDUE_DIRECTIVES') {
    const rows = stats.byDocument.filter(row => row.overdue > 0).sort((a, b) => b.overdue - a.overdue);
    return { reply: rows.length ? `${rows.length} văn bản còn nhiệm vụ quá hạn:\n${rows.slice(0, 20).map(row => `- ${row.name}: ${row.overdue} nhiệm vụ quá hạn.`).join('\n')}` : 'Không có văn bản chỉ đạo còn nhiệm vụ quá hạn trong phạm vi được xem.', source: { tool: 'directives.statistics.overdue', parameters: { year: options.year, scope: options.scope, departmentId: options.departmentId } } };
  }
  const rows = stats.byDepartment.filter(row => row.total > 0).sort((a, b) => b.overdue / b.total - a.overdue / a.total || b.overdue - a.overdue || a.completionRate - b.completionRate);
  return { reply: rows.length ? `Theo tỷ lệ nhiệm vụ quá hạn, sau đó số quá hạn và tỷ lệ hoàn thành:\n${rows.slice(0, 10).map(row => `- ${row.name}: ${row.overdue}/${row.total} nhiệm vụ quá hạn; hoàn thành ${row.completionRate}%.`).join('\n')}` : 'Chưa có nhiệm vụ để so sánh các phòng trong phạm vi được xem.', source: { tool: 'directives.statistics.departments', parameters: { year: options.year, scope: options.scope, departmentId: options.departmentId } } };
}
