import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { CandidateOrigin, CandidateStatus, FeedbackStatus, Prisma, Role, ValueSource } from '@prisma/client';
import { Actor, getActor, isLeadership } from './access';
import { JwtAuthGuard } from './common';
import { evaluateTarget } from './metrics';
import { dueReportPeriods, periodLabel } from './periods';
import { currentVietnamYear } from './planning-date';
import { PrismaService } from './prisma.service';
import { vietnamDayKey } from './work';
import { deskTargetScope, deskWorkScope } from './workspace-desk-policy';
import { holidaysOn } from './workspace-desk-calendar';

const DAY = 86_400_000;
export interface BriefingItem {
  id: string; kind: string; title: string; status: string; href: string;
  dueAt?: string; targetId?: string; periodKey?: string; autoApproveAt?: string;
  assignee?: { fullName: string; username: string } | null;
}

export function briefingShowsCards(actor: Pick<Actor, 'role'>): boolean {
  return actor.role !== Role.LEADER && actor.role !== Role.ADMIN && actor.role !== Role.VIEWER;
}

export function proposalWorkWhere(actor: Actor): Prisma.IndicatorCandidateWhereInput {
  return { OR: [
    { status: CandidateStatus.SUBMITTED, ...(isLeadership(actor) ? {} : { responsibleDepartmentId: actor.role === Role.MANAGER ? actor.departmentId ?? '__none__' : '__none__' }) },
    ...(actor.role === Role.CLERK || isLeadership(actor) ? [{ status: CandidateStatus.PROPOSED, origin: CandidateOrigin.AI }] : []),
  ] };
}

export async function buildDeskBriefing(prisma: PrismaService, actor: Actor, now = new Date()) {
  const scope = deskWorkScope(actor);
  const year = currentVietnamYear(now);
  const todayKey = vietnamDayKey(now);
  const tomorrowKey = vietnamDayKey(new Date(now.getTime() + DAY));
  const localDay = new Date(`${todayKey}T00:00:00+07:00`);
  const weekday = new Date(`${todayKey}T12:00:00Z`).getUTCDay();
  const weekStart = new Date(localDay.getTime() - ((weekday + 6) % 7) * DAY);
  const weekStartKey = vietnamDayKey(weekStart);
  const weekEnd = vietnamDayKey(new Date(weekStart.getTime() + 6 * DAY));
  const [targets, setting, proposals, notes, workspace, notifications, feedback] = await Promise.all([
    prisma.target.findMany({ where: { isArchived: false, year, ...scope }, include: {
      assignee: { select: { fullName: true, username: true } },
      framework: { select: { kind: true } },
      updates: { where: { reviewStatus: { not: 'REJECTED' } }, select: { id: true, periodKey: true, reviewStatus: true, createdAt: true, userId: true } },
      explanationRequests: { where: { status: 'OPEN' }, select: { id: true, dueAt: true } },
      _count: { select: { children: true } },
    } }),
    prisma.systemSetting.findUnique({ where: { id: 'default' } }),
    prisma.indicatorCandidate.findMany({ where: proposalWorkWhere(actor), select: { id: true, name: true, autoApproveAt: true } }),
    prisma.deskNoteRecipient.findMany({ where: { userId: actor.id, hiddenAt: null, note: { recalledAt: null } }, include: { note: { select: { id: true, content: true, dueAt: true } } } }),
    prisma.userWorkspace.findUnique({ where: { userId: actor.id }, select: { config: true } }),
    prisma.notification.count({ where: { userId: actor.id, readAt: null } }),
    actor.role === Role.VIEWER ? Promise.resolve(0) : prisma.feedback.count({ where: { status: { notIn: [FeedbackStatus.RESOLVED, FeedbackStatus.CLOSED, FeedbackStatus.REJECTED] }, ...(isLeadership(actor) || actor.role === Role.CLERK ? {} : { departmentId: actor.departmentId ?? '__none__' }) } }),
  ]);
  const system: BriefingItem[] = [];
  const calendar: BriefingItem[] = [];
  for (const target of targets) {
    const metric = evaluateTarget({ ...target, now, hasReport: !!target.lastReportedAt, riskThreshold: setting?.riskThreshold ?? 70 });
    const base = { title: target.title, targetId: target.id, href: `/admin/targets/${target.id}`, assignee: target.assignee };
    if (target._count.children === 0 && target.valueSource === ValueSource.MANUAL) {
      const reported = new Set(target.updates.map(update => update.periodKey));
      for (const period of dueReportPeriods(target.frequency, target.year, target.reportDueDay, new Date(now.getTime() + 6 * DAY), target.createdAt)) {
        if (reported.has(period.key) || period.deadline < target.createdAt) continue;
        const overdue = period.deadline < now;
        const item = { ...base, id: `report:${target.id}:${period.key}`, kind: 'report', status: `${overdue ? 'Quá hạn báo cáo' : 'Đến hạn báo cáo'} ${periodLabel(period.key)}`, dueAt: period.deadline.toISOString(), periodKey: period.key, href: `${base.href}?bao-cao=${period.key}` };
        calendar.push(item);
        if (overdue || period.deadline.getTime() - now.getTime() <= 3 * DAY) system.push(item);
      }
    }
    if (metric.status === 'AT_RISK' || metric.status === 'OVERDUE') system.push({ ...base, id: `risk:${target.id}`, kind: 'risk', status: metric.status === 'AT_RISK' ? 'Có nguy cơ' : 'Quá hạn', dueAt: target.dueDate.toISOString() });
    if (target.kind === 'TASK' || target.framework?.kind === 'TASK') {
      if (!metric.completed) {
        const item = { ...base, id: `task:${target.id}`, kind: 'task', status: target.dueDate < now ? 'Nhiệm vụ quá hạn' : 'Nhiệm vụ đến hạn', dueAt: target.dueDate.toISOString() };
        calendar.push(item);
        if (target.dueDate.getTime() - now.getTime() <= 3 * DAY) system.push(item);
      }
    }
    if (!target.assigneeId && target._count.children === 0 && target.valueSource === ValueSource.MANUAL && (isLeadership(actor) || actor.role === Role.MANAGER)) system.push({ ...base, id: `unassigned:${target.id}`, kind: 'unassigned', status: 'Chưa giao người phụ trách' });
    for (const request of target.explanationRequests) {
      if (target.assigneeId === actor.id || actor.role === Role.MANAGER || isLeadership(actor)) {
        const item = { ...base, id: `explanation:${request.id}`, kind: 'explanation', status: request.dueAt < now ? 'Quá hạn giải trình' : 'Chờ giải trình', dueAt: request.dueAt.toISOString() };
        system.push(item); calendar.push(item);
      }
    }
    if (isLeadership(actor) || actor.role === Role.MANAGER) {
      for (const report of target.updates.filter(update => update.reviewStatus === 'PENDING' && update.userId !== actor.id)) {
        const autoDays = setting?.reportAutoApproveDays ?? 7;
        const autoApproveAt = autoDays > 0 ? new Date(report.createdAt.getTime() + autoDays * DAY).toISOString() : undefined;
        system.push({ ...base, id: `approval:${report.id}`, kind: 'approval', status: 'Báo cáo chờ duyệt', href: '/admin/approvals', autoApproveAt, dueAt: autoApproveAt });
      }
    }
  }
  for (const proposal of proposals) system.push({ id: `proposal:${proposal.id}`, kind: 'proposal', title: proposal.name, status: 'Đề xuất chờ xử lý', href: `/admin/proposals?id=${proposal.id}`, ...(proposal.autoApproveAt ? { dueAt: proposal.autoApproveAt.toISOString(), autoApproveAt: proposal.autoApproveAt.toISOString() } : {}) });
  // Personal deadlines are visible to their owner only, including on leaders' desks.
  const personal: BriefingItem[] = notes.filter(row => row.note.dueAt && !row.doneAt).map(row => ({ id: `note:${row.note.id}`, kind: 'note', title: row.note.content, status: 'Note đến hạn', dueAt: row.note.dueAt!.toISOString(), href: `/admin?note=${row.note.id}` }));
  const config = workspace?.config as { spaces?: { widgets?: { id: string; type: string; settings?: { items?: { id: string; text: string; done?: boolean; dueAt?: string; date?: string }[] } }[] }[] } | null;
  const taskIds = new Set<string>();
  for (const space of config?.spaces ?? []) for (const widget of space.widgets ?? []) {
    if (widget.type !== 'tasks' || !Array.isArray(widget.settings?.items)) continue;
    for (const task of widget.settings.items) {
      const raw = task.dueAt || task.date;
      if (task.done || !raw || !task.text || taskIds.has(task.id)) continue;
      const due = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00+07:00` : raw);
      if (!Number.isFinite(due.getTime())) continue;
      taskIds.add(task.id);
      personal.push({ id: `private:${task.id}`, kind: 'private-task', title: task.text, status: 'Việc riêng', dueAt: due.toISOString(), href: '/admin' });
    }
  }
  // Monday–Sunday in Vietnam, plus next Monday when it is tomorrow.
  for (let offset = 0; offset < (weekday === 0 ? 8 : 7); offset++) {
    const day = new Date(weekStart.getTime() + offset * DAY);
    for (const [index, holiday] of holidaysOn(day).entries()) personal.push({ id: `holiday:${vietnamDayKey(day)}:${index}`, kind: 'holiday', title: holiday.name, status: holiday.official ? 'Ngày lễ' : 'Ngày kỷ niệm', dueAt: `${vietnamDayKey(day)}T12:00:00+07:00`, href: '/admin' });
  }
  const showCards = briefingShowsCards(actor);
  const events = [...(showCards ? calendar : []), ...personal].sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
  const onDay = (item: BriefingItem, key: string) => !!item.dueAt && vietnamDayKey(new Date(item.dueAt)) === key;
  return {
    generatedAt: now.toISOString(),
    counts: { reports: system.filter(item => item.kind === 'report').length, notes: notes.filter(row => !row.seenAt).length, approvals: system.filter(item => item.kind === 'approval').length, work: system.length, proposals: proposals.length, feedback, notifications },
    systemNotes: showCards ? system.sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999')) : [],
    today: events.filter(item => onDay(item, todayKey)), tomorrow: events.filter(item => onDay(item, tomorrowKey)),
    week: events.filter(item => item.dueAt && vietnamDayKey(new Date(item.dueAt)) >= weekStartKey && vietnamDayKey(new Date(item.dueAt)) <= weekEnd),
  };
}

@Controller('workspace')
@UseGuards(JwtAuthGuard)
export class DeskBriefingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('briefing')
  briefing(@Req() req: any) { return buildDeskBriefing(this.prisma, getActor(req)); }

  @Get('pins')
  async pins(@Req() req: any, @Query('targetIds') targetIds?: string, @Query('documentIds') documentIds?: string) {
    const actor = getActor(req);
    const ids = (raw?: string) => {
      const values = [...new Set((raw ?? '').split(',').filter(Boolean))];
      if (values.length > 80 || values.some(value => value.length > 100)) throw new BadRequestException('Tối đa 80 mục ghim mỗi loại');
      return values;
    };
    const [targets, documents, setting] = await Promise.all([
      this.prisma.target.findMany({ where: { id: { in: ids(targetIds) }, isArchived: false, ...deskTargetScope(actor) }, select: { id: true, title: true, currentValue: true, targetValue: true, unit: true, direction: true, dueDate: true, lastReportedAt: true, kind: true } }),
      // SourceDocument is shared with every authenticated role, matching DocumentsController.
      this.prisma.sourceDocument.findMany({ where: { id: { in: ids(documentIds) } }, select: { id: true, title: true, docNumber: true, mimeType: true } }),
      this.prisma.systemSetting.findUnique({ where: { id: 'default' }, select: { riskThreshold: true } }),
    ]);
    return { targets: targets.map(target => ({ ...target, ...evaluateTarget({ ...target, hasReport: !!target.lastReportedAt, riskThreshold: setting?.riskThreshold ?? 70 }) })), documents };
  }
}
