import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  CandidateOrigin,
  CandidateStatus,
  ExplanationStatus,
  FeedbackStatus,
  FrameworkKind,
  ProgressReviewStatus,
  Role,
  TargetStatus,
  ValueSource,
} from '@prisma/client';
import { type Actor, canSuperviseDepartment, getActor, isGlobalRole, isLeadership, resolveDepartmentScope } from './access';
import { JwtAuthGuard } from './common';
import { FRAMEWORK_KIND_LABELS, ISSUING_LEVEL_LABELS, summarizeFramework } from './frameworks';
import { loadLocality, publicLocality } from './locality';
import { evaluateTarget } from './metrics';
import { dueReportPeriods, periodKeyFor, periodLabel } from './periods';
import { currentVietnamYear } from './planning-date';
import { PrismaService } from './prisma.service';
import { WORK_ACTIONS } from './work';

// Trung tâm điều hành: một lượt truy vấn tổng hợp đủ để lãnh đạo nắm tình hình, thấy ai đang chậm và vì sao.
// Mọi con số ở đây đều bấm vào được tới chỉ tiêu, hồ sơ và dòng thời gian trách nhiệm.

const DAY = 86_400_000;
const STALL_BOUNCES = 3;

type Severity = 'critical' | 'warning' | 'info';

interface AlertItem {
  severity: Severity;
  kind: string;
  title: string;
  detail: string;
  targetId?: string;
  candidateId?: string;
  departmentName?: string | null;
  at?: Date | null;
}

function parseYear(raw?: string) {
  if (!raw) return currentVietnamYear();
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new BadRequestException('Năm không hợp lệ');
  return year;
}

function daysSince(date: Date | null | undefined, now: Date) {
  return date ? Math.floor((now.getTime() - date.getTime()) / DAY) : 0;
}

/**
 * Ảnh chụp số liệu điều hành dùng chung cho Trung tâm điều hành, trình chiếu và Jarvis: chỉ tiêu trong phạm vi quyền,
 * tình trạng, kỳ thiếu báo cáo, báo cáo chờ duyệt, giải trình đang mở. Mọi nơi hiển thị số liệu tổng hợp đều đi qua đây
 * để con số khớp nhau.
 */
export async function iocSnapshot(prisma: PrismaService, actor: Actor, year: number, requestedDepartmentId?: string) {
  const departmentId = resolveDepartmentScope(actor, requestedDepartmentId);
  const now = new Date();
  const setting = await prisma.systemSetting.findUnique({ where: { id: 'default' } });
  const threshold = setting?.riskThreshold ?? 70;
  const stallDays = setting?.assignmentStallDays ?? 3;
  const targets = await prisma.target.findMany({
    where: { year, isArchived: false, ...(departmentId ? { departmentId } : {}) },
    include: {
      department: { select: { id: true, name: true, color: true, sortOrder: true } },
      assignee: { select: { id: true, fullName: true } },
      framework: { select: { id: true, name: true, kind: true } },
      _count: { select: { directives: true, evaluations: true, children: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
  const targetIds = targets.map(target => target.id);
  const [reports, pendingReports, openExplanations] = await Promise.all([
    prisma.progressUpdate.findMany({
      where: { targetId: { in: targetIds }, reviewStatus: { not: ProgressReviewStatus.REJECTED }, periodKey: { not: null } },
      select: { targetId: true, periodKey: true },
    }),
    prisma.progressUpdate.findMany({
      where: { targetId: { in: targetIds }, reviewStatus: ProgressReviewStatus.PENDING },
      select: { id: true, targetId: true, createdAt: true, userId: true },
    }),
    prisma.explanationRequest.findMany({
      where: { targetId: { in: targetIds }, status: ExplanationStatus.OPEN },
      select: { id: true, targetId: true, dueAt: true, createdAt: true, message: true },
    }),
  ]);
  const reportedByTarget = new Map<string, Set<string>>();
  for (const report of reports) {
    const set = reportedByTarget.get(report.targetId) ?? new Set<string>();
    set.add(report.periodKey!);
    reportedByTarget.set(report.targetId, set);
  }
  const leafIds = new Set(targets.filter(target => target._count.children === 0).map(target => target.id));
  const evaluated = targets.map(target => {
    const metric = evaluateTarget({
      targetValue: target.targetValue, currentValue: target.currentValue, direction: target.direction, dueDate: target.dueDate,
      riskThreshold: threshold, hasReport: Boolean(target.lastReportedAt), kind: target.kind, now,
    });
    const periods = target.valueSource === ValueSource.MANUAL ? dueReportPeriods(target.frequency, target.year, target.reportDueDay, now, target.createdAt) : [];
    const reported = reportedByTarget.get(target.id) ?? new Set<string>();
    const missingPeriods = periods.filter(period => period.overdue && !reported.has(period.key)).map(period => period.key);
    const pending = pendingReports.filter(report => report.targetId === target.id);
    const unassignedDays = !target.assigneeId && target.valueSource === ValueSource.MANUAL ? daysSince(target.createdAt, now) : 0;
    return {
      target,
      metric,
      isLeaf: leafIds.has(target.id),
      missingPeriods,
      pending,
      unassigned: !target.assigneeId && target.valueSource === ValueSource.MANUAL && leafIds.has(target.id),
      overdueAssignment: stallDays > 0 && unassignedDays >= stallDays && leafIds.has(target.id),
      stalledUnassigned: stallDays > 0 && unassignedDays >= stallDays * 2 && leafIds.has(target.id) && target.kind !== FrameworkKind.STAT,
      explanation: openExplanations.find(item => item.targetId === target.id) ?? null,
    };
  });
  return { now, setting, threshold, departmentId, evaluated, pendingReports, openExplanations };
}

@Controller()
@UseGuards(JwtAuthGuard)
export class IocController {
  constructor(private readonly prisma: PrismaService) {}

  /** Tập dữ liệu chung cho tổng quan, trình chiếu và trách nhiệm. */
  private snapshot(actor: Actor, year: number, requestedDepartmentId?: string) {
    return iocSnapshot(this.prisma, actor, year, requestedDepartmentId);
  }

  private targetBrief(item: { target: any; metric: { status: TargetStatus; progress: number } }) {
    const { target, metric } = item;
    return {
      id: target.id, code: target.code, title: target.title, unit: target.unit, kind: target.kind, ordinal: target.ordinal,
      standardCode: target.standardCode, groupName: target.groupName, targetValue: target.targetValue, targetText: target.targetText,
      currentValue: target.currentValue, maxScore: target.maxScore, status: metric.status, progress: metric.progress,
      hasReport: Boolean(target.lastReportedAt), lastReportedAt: target.lastReportedAt, dueDate: target.dueDate,
      departmentId: target.departmentId, departmentName: target.department.name, departmentColor: target.department.color,
      assigneeName: target.assignee?.fullName ?? null, frameworkId: target.frameworkId, parentId: target.parentId,
      valueSource: target.valueSource, issuingLevel: target.issuingLevel,
    };
  }

  @Get('ioc/overview')
  async overview(@Req() req: any, @Query('year') yearRaw?: string, @Query('departmentId') departmentIdRaw?: string) {
    const actor = getActor(req);
    const year = parseYear(yearRaw);
    const snap = await this.snapshot(actor, year, departmentIdRaw);
    const { now, evaluated } = snap;
    const leaves = evaluated.filter(item => item.isLeaf && item.target.kind !== FrameworkKind.STAT);
    const statLeaves = evaluated.filter(item => item.isLeaf && item.target.kind === FrameworkKind.STAT);
    const frameworks = await this.prisma.framework.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    const frameworkSummaries = frameworks
      .map(framework => {
        const own = evaluated.filter(item => item.target.frameworkId === framework.id);
        if (!own.length) return null;
        return {
          id: framework.id, code: framework.code, name: framework.name, kind: framework.kind, kindLabel: FRAMEWORK_KIND_LABELS[framework.kind],
          issuingLevel: framework.issuingLevel, issuingLevelLabel: ISSUING_LEVEL_LABELS[framework.issuingLevel], legalBasis: framework.legalBasis,
          showOnWallboard: framework.showOnWallboard,
          summary: summarizeFramework(framework, own.map(item => ({
            id: item.target.id, parentId: item.target.parentId, kind: item.target.kind, status: item.metric.status, progress: item.metric.progress,
            weight: item.target.weight, currentValue: item.target.currentValue, maxScore: item.target.maxScore, hasReport: Boolean(item.target.lastReportedAt),
            directiveCount: item.target._count.directives, evaluationCount: item.target._count.evaluations,
          }))),
          missingReports: own.filter(item => item.missingPeriods.length).length,
        };
      })
      .filter(Boolean);

    const departmentMap = new Map<string, ReturnType<typeof emptyDepartment>>();
    function emptyDepartment(department: { id: string; name: string; color: string; sortOrder: number }) {
      return {
        id: department.id, name: department.name, color: department.color, sortOrder: department.sortOrder,
        total: 0, completed: 0, onTrack: 0, atRisk: 0, overdue: 0, notStarted: 0, missingReports: 0, unassigned: 0,
        pendingReports: 0, oldestPendingDays: 0, openExplanations: 0, weighted: 0, weight: 0,
        withDirective: 0, withEvaluation: 0, reported: 0, statTotal: 0, statReported: 0,
      };
    }
    for (const item of evaluated.filter(entry => entry.isLeaf)) {
      const department = departmentMap.get(item.target.departmentId) ?? emptyDepartment(item.target.department);
      if (item.target.kind === FrameworkKind.STAT) {
        department.statTotal += 1;
        if (item.target.lastReportedAt) department.statReported += 1;
      } else {
        department.total += 1;
        department.completed += item.metric.status === TargetStatus.COMPLETED ? 1 : 0;
        department.onTrack += item.metric.status === TargetStatus.ON_TRACK ? 1 : 0;
        department.atRisk += item.metric.status === TargetStatus.AT_RISK ? 1 : 0;
        department.overdue += item.metric.status === TargetStatus.OVERDUE ? 1 : 0;
        department.notStarted += item.metric.status === TargetStatus.NOT_STARTED ? 1 : 0;
        department.weighted += item.metric.progress * item.target.weight;
        department.weight += item.target.weight;
        department.withDirective += item.target._count.directives > 0 ? 1 : 0;
        department.withEvaluation += item.target._count.evaluations > 0 ? 1 : 0;
        department.reported += item.target.lastReportedAt ? 1 : 0;
      }
      department.missingReports += item.missingPeriods.length ? 1 : 0;
      department.unassigned += item.unassigned ? 1 : 0;
      department.pendingReports += item.pending.length;
      department.oldestPendingDays = Math.max(department.oldestPendingDays, ...item.pending.map(report => daysSince(report.createdAt, now)), 0);
      department.openExplanations += item.explanation ? 1 : 0;
      departmentMap.set(item.target.departmentId, department);
    }
    const managers = await this.prisma.user.findMany({
      where: { role: Role.MANAGER, isActive: true, departmentId: { in: [...departmentMap.keys()] } },
      select: { id: true, fullName: true, departmentId: true, lastLoginAt: true },
    });
    const departments = [...departmentMap.values()]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'vi'))
      .map(({ weighted, weight, sortOrder: _sort, ...department }) => ({
        ...department,
        progress: weight ? Math.round(weighted / weight) : 0,
        managers: managers.filter(manager => manager.departmentId === department.id).map(manager => ({ id: manager.id, fullName: manager.fullName, lastLoginAt: manager.lastLoginAt })),
      }));

    const alerts: AlertItem[] = [];
    for (const item of evaluated.filter(entry => entry.isLeaf)) {
      const base = { targetId: item.target.id, departmentName: item.target.department.name };
      if (item.metric.status === TargetStatus.OVERDUE) {
        alerts.push({ ...base, severity: 'critical', kind: 'OVERDUE', title: `${item.target.code} quá hạn`, detail: item.target.title, at: item.target.dueDate });
      }
      if (item.explanation && item.explanation.dueAt < now) {
        alerts.push({ ...base, severity: 'critical', kind: 'EXPLANATION_OVERDUE', title: `${item.target.code} chưa giải trình đúng hạn`, detail: item.explanation.message, at: item.explanation.dueAt });
      }
      if (item.missingPeriods.length) {
        alerts.push({ ...base, severity: 'warning', kind: 'MISSING_REPORT', title: `${item.target.code} thiếu báo cáo ${item.missingPeriods.map(periodLabel).slice(-2).join(', ')}`, detail: item.target.title, at: null });
      }
      if (item.metric.status === TargetStatus.AT_RISK) {
        alerts.push({ ...base, severity: 'warning', kind: 'AT_RISK', title: `${item.target.code} có nguy cơ không đạt (${item.metric.progress}%)`, detail: item.target.title, at: item.target.lastReportedAt });
      }
    }
    const stalled = evaluated
      .filter(item => item.isLeaf && (item.target.bounceCount >= STALL_BOUNCES || item.stalledUnassigned))
      .map(item => ({
        ...this.targetBrief(item),
        bounceCount: item.target.bounceCount,
        reason: item.target.bounceCount >= STALL_BOUNCES
          ? `Bị chuyển, trả qua lại ${item.target.bounceCount} lần`
          : `Chưa giao người phụ trách sau ${daysSince(item.target.createdAt, now)} ngày`,
      }));
    for (const item of stalled.filter(entry => entry.bounceCount >= STALL_BOUNCES)) {
      alerts.push({ severity: 'critical', kind: 'STALLED', title: `${item.code}: ${item.reason}`, detail: item.title, targetId: item.id, departmentName: item.departmentName });
    }
    const unassignedByDepartment = new Map<string, number>();
    for (const item of evaluated.filter(entry => entry.overdueAssignment)) {
      unassignedByDepartment.set(item.target.department.name, (unassignedByDepartment.get(item.target.department.name) ?? 0) + 1);
    }
    for (const [departmentName, count] of unassignedByDepartment) {
      alerts.push({
        severity: 'warning', kind: 'UNASSIGNED', title: `${departmentName}: ${count} chỉ tiêu chưa giao người phụ trách`,
        detail: 'Trưởng phòng cần giao từng chỉ tiêu cho chuyên viên để rõ người chịu trách nhiệm cập nhật số liệu.', departmentName,
      });
    }
    const pendingProposals = await this.prisma.indicatorCandidate.findMany({
      where: { status: CandidateStatus.SUBMITTED, ...(snap.departmentId ? { responsibleDepartmentId: snap.departmentId } : {}) },
      select: { id: true, name: true, autoApproveAt: true, submittedAt: true, responsibleDepartment: { select: { name: true } } },
      orderBy: { submittedAt: 'asc' },
      take: 50,
    });
    for (const proposal of pendingProposals) {
      alerts.push({
        severity: 'info', kind: 'PROPOSAL_PENDING', title: `Đề xuất chờ duyệt: ${proposal.name}`,
        detail: proposal.autoApproveAt ? `Tự thông qua lúc ${proposal.autoApproveAt.toISOString()}` : 'Chưa có hạn tự thông qua',
        candidateId: proposal.id, departmentName: proposal.responsibleDepartment?.name ?? null, at: proposal.submittedAt,
      });
    }
    const severityRank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

    const recentEvents = await this.prisma.workEvent.findMany({
      where: snap.departmentId ? { departmentId: snap.departmentId } : {},
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { target: { select: { id: true, code: true, title: true } }, candidate: { select: { id: true, name: true } } },
    });
    const lastReport = evaluated.reduce<Date | null>((latest, item) => {
      const value = item.target.lastReportedAt;
      return value && (!latest || value > latest) ? value : latest;
    }, null);
    const feedbackWhere = snap.departmentId ? { departmentId: snap.departmentId } : {};
    const openStatuses = [FeedbackStatus.RECEIVED, FeedbackStatus.ASSIGNED, FeedbackStatus.IN_PROGRESS, FeedbackStatus.PENDING_REVIEW, FeedbackStatus.REOPENED, FeedbackStatus.WAITING_CITIZEN];
    const [feedbackOpen, feedbackOverdue] = await Promise.all([
      this.prisma.feedback.count({ where: { ...feedbackWhere, status: { in: openStatuses } } }),
      this.prisma.feedback.count({ where: { ...feedbackWhere, status: { in: openStatuses.filter(status => status !== FeedbackStatus.WAITING_CITIZEN) }, dueAt: { lt: now } } }),
    ]);

    const statusCount = (status: TargetStatus) => leaves.filter(item => item.metric.status === status).length;
    const totalWeight = leaves.reduce((sum, item) => sum + item.target.weight, 0);
    return {
      year,
      generatedAt: now,
      dataAsOf: lastReport,
      scope: snap.departmentId ? 'department' : 'locality',
      locality: publicLocality(await loadLocality(this.prisma)),
      totals: {
        targets: leaves.length,
        completed: statusCount(TargetStatus.COMPLETED),
        onTrack: statusCount(TargetStatus.ON_TRACK),
        atRisk: statusCount(TargetStatus.AT_RISK),
        overdue: statusCount(TargetStatus.OVERDUE),
        notStarted: statusCount(TargetStatus.NOT_STARTED),
        progress: totalWeight ? Math.round(leaves.reduce((sum, item) => sum + item.metric.progress * item.target.weight, 0) / totalWeight) : 0,
        statTotal: statLeaves.length,
        statReported: statLeaves.filter(item => item.target.lastReportedAt).length,
        missingReports: evaluated.filter(item => item.isLeaf && item.missingPeriods.length).length,
        unassigned: evaluated.filter(item => item.unassigned).length,
        pendingReports: snap.pendingReports.length,
        pendingProposals: pendingProposals.length,
        openExplanations: snap.openExplanations.length,
        stalled: stalled.length,
        withDirective: leaves.filter(item => item.target._count.directives > 0).length,
        withEvaluation: leaves.filter(item => item.target._count.evaluations > 0).length,
        feedbackOpen,
        feedbackOverdue,
      },
      frameworks: frameworkSummaries,
      departments,
      alerts: alerts.slice(0, 40),
      stalled,
      recent: recentEvents.map(event => ({
        id: event.id, action: event.action, label: WORK_ACTIONS[event.action as keyof typeof WORK_ACTIONS] ?? event.action,
        actorName: event.actorName, note: event.note, createdAt: event.createdAt,
        target: event.target, candidate: event.candidate,
      })),
    };
  }

  /** Dữ liệu màn hình trình chiếu: các trang tự xoay vòng qua từng bộ chỉ tiêu và từng phòng. */
  @Get('ioc/wallboard')
  async wallboard(@Req() req: any, @Query('year') yearRaw?: string) {
    const actor = getActor(req);
    const year = parseYear(yearRaw);
    const snap = await this.snapshot(actor, year);
    const frameworks = await this.prisma.framework.findMany({ where: { isActive: true, showOnWallboard: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    const departments = await this.prisma.department.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    const brief = (item: (typeof snap.evaluated)[number]) => ({
      ...this.targetBrief(item),
      missingPeriods: item.missingPeriods.map(periodLabel),
      explanationRequested: Boolean(item.explanation),
    });
    const slides = [
      ...frameworks.map(framework => {
        const own = snap.evaluated.filter(item => item.target.frameworkId === framework.id);
        return {
          type: 'framework' as const,
          id: framework.id,
          title: framework.name,
          kind: framework.kind,
          kindLabel: FRAMEWORK_KIND_LABELS[framework.kind],
          legalBasis: framework.legalBasis,
          summary: summarizeFramework(framework, own.map(item => ({
            id: item.target.id, parentId: item.target.parentId, kind: item.target.kind, status: item.metric.status, progress: item.metric.progress,
            weight: item.target.weight, currentValue: item.target.currentValue, maxScore: item.target.maxScore, hasReport: Boolean(item.target.lastReportedAt),
            directiveCount: item.target._count.directives, evaluationCount: item.target._count.evaluations,
          }))),
          targets: own.filter(item => framework.kind === FrameworkKind.SCORE ? !item.target.parentId : item.isLeaf).map(brief),
        };
      }).filter(slide => slide.targets.length),
      ...departments.map(department => {
        const own = snap.evaluated.filter(item => item.target.departmentId === department.id && item.isLeaf && item.target.kind !== FrameworkKind.STAT);
        return {
          type: 'department' as const,
          id: department.id,
          title: department.name,
          color: department.color,
          targets: own
            .map(brief)
            .sort((a, b) => {
              const rank: Record<string, number> = { OVERDUE: 0, AT_RISK: 1, NOT_STARTED: 2, ON_TRACK: 3, COMPLETED: 4 };
              return rank[a.status] - rank[b.status];
            }),
        };
      }).filter(slide => slide.targets.length),
    ];
    return {
      year,
      generatedAt: snap.now,
      rotateSeconds: snap.setting?.wallboardRotateSeconds ?? 20,
      locality: publicLocality(await loadLocality(this.prisma)),
      slides,
      stalled: snap.evaluated
        .filter(item => item.isLeaf && (item.target.bounceCount >= STALL_BOUNCES || item.stalledUnassigned || (item.explanation && item.explanation.dueAt < snap.now)))
        .map(item => ({
          ...brief(item),
          bounceCount: item.target.bounceCount,
          reason: item.target.bounceCount >= STALL_BOUNCES
            ? `Bị chuyển, trả qua lại ${item.target.bounceCount} lần`
            : item.stalledUnassigned
              ? `Chưa giao người phụ trách sau ${daysSince(item.target.createdAt, snap.now)} ngày`
              : 'Quá hạn trả lời giải trình',
        })),
    };
  }

  /** Trách nhiệm người đứng đầu: chậm duyệt, bị tự thông qua, từ chối đề xuất, việc bị đá, giải trình — theo từng phòng. */
  @Get('ioc/accountability')
  async accountability(@Req() req: any, @Query('year') yearRaw?: string) {
    const actor = getActor(req);
    const year = parseYear(yearRaw);
    if (!isGlobalRole(actor.role) && actor.role !== Role.MANAGER) {
      return { year, departments: [], leaders: [] };
    }
    const snap = await this.snapshot(actor, year);
    const start = new Date(Date.UTC(year, 0, 1, -7));
    const end = new Date(Date.UTC(year + 1, 0, 1, -7));
    const departments = await this.prisma.department.findMany({
      where: { isActive: true, ...(snap.departmentId ? { id: snap.departmentId } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { users: { where: { isActive: true, role: Role.MANAGER }, select: { id: true, fullName: true, position: true, lastLoginAt: true } } },
    });
    const events = await this.prisma.workEvent.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        action: { in: ['REPORT_AUTO_APPROVED', 'PROPOSAL_REJECTED', 'PROPOSAL_AUTO_APPROVED', 'RETURNED', 'TRANSFERRED', 'ESCALATED', 'EXPLANATION_ANSWERED', 'REMINDER'] },
        ...(snap.departmentId ? { departmentId: snap.departmentId } : {}),
      },
      select: { action: true, departmentId: true, responsibleUserId: true, note: true, createdAt: true, actorName: true, candidateId: true, targetId: true },
      orderBy: { createdAt: 'desc' },
    });
    const rows = departments.map(department => {
      const own = snap.evaluated.filter(item => item.target.departmentId === department.id && item.isLeaf);
      const pending = own.flatMap(item => item.pending);
      const deptEvents = events.filter(event => event.departmentId === department.id);
      const rejections = deptEvents.filter(event => event.action === 'PROPOSAL_REJECTED');
      return {
        id: department.id,
        name: department.name,
        color: department.color,
        managers: department.users,
        targets: own.length,
        pendingReports: pending.length,
        oldestPendingDays: pending.reduce((max, report) => Math.max(max, daysSince(report.createdAt, snap.now)), 0),
        autoApprovedReports: deptEvents.filter(event => event.action === 'REPORT_AUTO_APPROVED').length,
        rejectedProposals: rejections.length,
        rejectionReasons: rejections.slice(0, 5).map(event => ({ actorName: event.actorName, reason: event.note, at: event.createdAt, candidateId: event.candidateId })),
        autoApprovedProposals: deptEvents.filter(event => event.action === 'PROPOSAL_AUTO_APPROVED').length,
        bounces: deptEvents.filter(event => event.action === 'RETURNED' || event.action === 'TRANSFERRED').length,
        escalations: deptEvents.filter(event => event.action === 'ESCALATED').length,
        unassigned: own.filter(item => item.unassigned).length,
        missingReports: own.filter(item => item.missingPeriods.length).length,
        openExplanations: own.filter(item => item.explanation).length,
        overdueExplanations: own.filter(item => item.explanation && item.explanation.dueAt < snap.now).length,
        withoutDirective: own.filter(item => item.target.kind !== FrameworkKind.STAT && item.target._count.directives === 0).length,
        withoutEvaluation: own.filter(item => item.target.kind !== FrameworkKind.STAT && item.target._count.evaluations === 0).length,
      };
    });
    const leaderUsers = isGlobalRole(actor.role)
      ? await this.prisma.user.findMany({ where: { role: Role.LEADER, isActive: true }, select: { id: true, fullName: true, position: true, lastLoginAt: true } })
      : [];
    return {
      year,
      generatedAt: snap.now,
      departments: rows,
      leaders: leaderUsers.map(leader => ({ ...leader })),
      autoApprovedProposalsTotal: events.filter(event => event.action === 'PROPOSAL_AUTO_APPROVED').length,
      autoApprovedReportsTotal: events.filter(event => event.action === 'REPORT_AUTO_APPROVED').length,
    };
  }

  /** Việc của tôi: mọi thứ người đăng nhập cần làm ngay, gom về một chỗ (dùng được trên điện thoại). */
  @Get('my-work')
  async myWork(@Req() req: any, @Query('year') yearRaw?: string) {
    const actor = getActor(req);
    const year = parseYear(yearRaw);
    const snap = await this.snapshot(actor, year);
    const mine = snap.evaluated.filter(item => item.target.assigneeId === actor.id && item.isLeaf);
    const needReport = mine
      .filter(item => item.target.valueSource === ValueSource.MANUAL)
      .map(item => {
        const currentKey = periodKeyFor(item.target.frequency, snap.now);
        const reported = item.pending.length > 0;
        return {
          ...this.targetBrief(item),
          currentPeriod: periodLabel(currentKey),
          currentPeriodKey: currentKey,
          missingPeriods: item.missingPeriods.map(periodLabel),
          missingPeriodKeys: item.missingPeriods,
          pendingReport: reported,
        };
      })
      .filter(item => item.missingPeriods.length || !item.hasReport);
    const rejectedReports = await this.prisma.progressUpdate.findMany({
      where: { userId: actor.id, reviewStatus: ProgressReviewStatus.REJECTED, target: { year, isArchived: false } },
      orderBy: { reviewedAt: 'desc' },
      take: 10,
      include: { target: { select: { id: true, code: true, title: true } } },
    });
    const toReview = canReview(actor)
      ? snap.pendingReports.filter(report => report.userId !== actor.id).map(report => {
          const item = snap.evaluated.find(entry => entry.target.id === report.targetId)!;
          return { id: report.id, createdAt: report.createdAt, days: daysSince(report.createdAt, snap.now), target: this.targetBrief(item) };
        })
      : [];
    const proposals = await this.prisma.indicatorCandidate.findMany({
      where: {
        OR: [
          { status: CandidateStatus.SUBMITTED, ...(isLeadership(actor) ? {} : { responsibleDepartmentId: actor.role === Role.MANAGER ? actor.departmentId ?? '__none__' : '__none__' }) },
          ...(actor.role === Role.CLERK || isLeadership(actor) ? [{ status: CandidateStatus.PROPOSED, origin: CandidateOrigin.AI }] : []),
        ],
      },
      select: { id: true, name: true, status: true, origin: true, autoApproveAt: true, submittedAt: true, createdAt: true, responsibleDepartment: { select: { name: true } }, document: { select: { code: true, title: true } } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    const explanations = snap.evaluated
      .filter(item => item.explanation && (item.target.assigneeId === actor.id || canSuperviseDepartment(actor, item.target.departmentId)) && !isLeadership(actor))
      .map(item => ({ ...this.targetBrief(item), request: item.explanation }));
    const unassigned = actor.role === Role.MANAGER || isLeadership(actor)
      ? snap.evaluated.filter(item => item.unassigned && canSuperviseDepartment(actor, item.target.departmentId)).map(item => this.targetBrief(item))
      : [];
    const myProposals = await this.prisma.indicatorCandidate.findMany({
      where: { proposedById: actor.id },
      select: { id: true, name: true, status: true, autoApproveAt: true, reviewNote: true, createdTarget: { select: { id: true, code: true } }, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const unread = await this.prisma.notification.count({ where: { userId: actor.id, readAt: null } });
    return {
      year,
      generatedAt: snap.now,
      counts: {
        needReport: needReport.length, rejectedReports: rejectedReports.length, toReview: toReview.length,
        proposals: proposals.length, explanations: explanations.length, unassigned: unassigned.length, unread,
      },
      needReport,
      rejectedReports: rejectedReports.map(report => ({ id: report.id, value: report.value, reviewNote: report.reviewNote, reviewedAt: report.reviewedAt, target: report.target })),
      toReview,
      proposals,
      explanations,
      unassigned,
      myTargets: mine.map(item => this.targetBrief(item)),
      myProposals,
    };
  }
}

function canReview(actor: Actor) {
  return isLeadership(actor) || actor.role === Role.MANAGER;
}
