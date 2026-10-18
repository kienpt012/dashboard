import { BadRequestException, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CandidateStatus,
  ExplanationStatus,
  FrameworkKind,
  Prisma,
  ProgressReviewStatus,
  Role,
  ValueSource,
} from '@prisma/client';
import { audit, SYSTEM_ACTOR } from './access';
import { approveCandidateById } from './candidates';
import { recomputeTargets, rollupParents } from './datasets';
import { evaluateTarget } from './metrics';
import { dueReportPeriods, periodLabel } from './periods';
import { currentVietnamYear } from './planning-date';
import { PrismaService } from './prisma.service';
import { refreshImportBatchStatus } from './targets';
import { departmentManagerIds, leaderIds, notifyUsers, recordWorkEvent, targetLink, vietnamDayKey } from './work';

// Bộ giám sát thời hạn — hiện thực yêu cầu "không để việc bị treo" của khách hàng:
//  • báo cáo chờ duyệt quá N ngày → tự thông qua, ghi trách nhiệm người duyệt (GV-03);
//  • đề xuất đã trình quá N ngày không ai xử lý → tự thành chỉ tiêu (GV-06);
//  • thiếu báo cáo kỳ, chưa giao người, giải trình quá hạn → nhắc, rồi báo lãnh đạo (GV-08, GV-09, GV-10).
// Mỗi thao tác là một transaction có điều kiện chống ghi đè; thông báo có khóa chống trùng nên chạy lại an toàn.

const DAY = 86_400_000;
const BATCH = 50;

function parseBoundedInteger(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

export interface AccountabilityRunResult {
  autoApprovedReports: number;
  blockedReports: number;
  autoApprovedProposals: number;
  blockedProposals: number;
  reminders: number;
  escalations: number;
}

@Injectable()
export class AccountabilityWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AccountabilityWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private activeRun: Promise<AccountabilityRunResult | null> | null = null;
  private readonly intervalMs: number;
  private lastRecomputeAt = 0;

  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    this.intervalMs = parseBoundedInteger(config.get<string>('ACCOUNTABILITY_INTERVAL_MS'), 60_000, 5_000, 3_600_000);
  }

  onApplicationBootstrap(): void {
    if (process.env.DISABLE_ACCOUNTABILITY_WORKER === 'true') return;
    this.timer = setInterval(() => void this.runSafely(), this.intervalMs);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.activeRun) await this.activeRun;
  }

  runSafely(now = new Date()): Promise<AccountabilityRunResult | null> {
    if (this.activeRun) return this.activeRun;
    this.activeRun = this.runOnce(now)
      .catch(error => {
        this.logger.error(`Bộ giám sát thời hạn gặp lỗi: ${error instanceof Error ? error.message : 'không xác định'}`);
        return null;
      })
      .finally(() => {
        this.activeRun = null;
      });
    return this.activeRun;
  }

  async runOnce(now = new Date()): Promise<AccountabilityRunResult> {
    const setting = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    const result: AccountabilityRunResult = { autoApprovedReports: 0, blockedReports: 0, autoApprovedProposals: 0, blockedProposals: 0, reminders: 0, escalations: 0 };
    const reportDays = setting?.reportAutoApproveDays ?? 7;
    if (reportDays > 0) await this.autoApproveReports(now, reportDays, setting?.riskThreshold ?? 70, result);
    // Tắt tự thông qua đề xuất (0 ngày) thì cũng không nhắc "sắp tự thành chỉ tiêu" cho đề xuất đã có hạn cũ.
    if ((setting?.proposalAutoApproveDays ?? 3) > 0) {
      await this.autoApproveProposals(now, result);
      await this.remindProposalsDueSoon(now, result);
    }
    await this.remindMissingReports(now, result);
    const stallDays = setting?.assignmentStallDays ?? 3;
    if (stallDays > 0) await this.remindUnassigned(now, stallDays, result);
    await this.escalateExplanations(now, result);
    // Dữ liệu phản ánh thay đổi liên tục ở phân hệ khác: tính lại chỉ tiêu dùng bảng dựng sẵn mỗi 10 phút.
    if (now.getTime() - this.lastRecomputeAt > 10 * 60_000) {
      this.lastRecomputeAt = now.getTime();
      await recomputeTargets(this.prisma, SYSTEM_ACTOR, { datasetCode: 'feedback' });
    }
    return result;
  }

  private async autoApproveReports(now: Date, days: number, threshold: number, result: AccountabilityRunResult) {
    const due = await this.prisma.progressUpdate.findMany({
      where: { reviewStatus: ProgressReviewStatus.PENDING, createdAt: { lt: new Date(now.getTime() - days * DAY) } },
      include: { target: { include: { department: true } }, user: { select: { id: true, fullName: true, role: true } } },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });
    for (const update of due) {
      const target = update.target;
      const submittedByManager = update.user.role === Role.MANAGER;
      const reviewers = submittedByManager ? await leaderIds(this.prisma) : (await departmentManagerIds(this.prisma, target.departmentId)).filter(id => id !== update.userId);
      const reviewerNames = await this.prisma.user.findMany({ where: { id: { in: reviewers } }, select: { fullName: true } });
      const who = reviewerNames.map(user => user.fullName).join(', ') || 'người duyệt';
      if (target.isArchived || update.baseVersion !== target.version) {
        // Số liệu chỉ tiêu đã đổi sau lúc gửi: không được tự ghi đè, báo người duyệt và lãnh đạo xử lý.
        const sent = await this.prisma.$transaction(async tx => {
          const count = await notifyUsers(tx, [...reviewers, ...await leaderIds(tx)], {
            kind: 'REPORT_AUTO_BLOCKED', title: `Báo cáo ${target.code} quá hạn duyệt nhưng không tự thông qua được`,
            body: 'Chỉ tiêu đã có số liệu mới sau lúc gửi. Hãy xem và trả lại để người gửi báo cáo lại.',
            link: '/admin/approvals', entityType: 'ProgressUpdate', entityId: update.id, dedupeKey: `report-blocked:${update.id}`,
          });
          if (count) {
            await recordWorkEvent(tx, {
              action: 'REPORT_AUTO_BLOCKED', actor: null, targetId: target.id, departmentId: target.departmentId,
              responsibleUserId: reviewers[0] ?? null, note: `Báo cáo của ${update.user.fullName} quá ${days} ngày chưa được duyệt nhưng chỉ tiêu đã có số liệu mới`,
            });
          }
          return count;
        });
        if (sent) result.blockedReports += 1;
        continue;
      }
      const evaluation = evaluateTarget({
        targetValue: target.targetValue, currentValue: update.value, direction: target.direction, dueDate: target.dueDate,
        riskThreshold: threshold, hasReport: true, kind: target.kind, now,
      });
      try {
        const approved = await this.prisma.$transaction(async tx => {
          const targetChanged = await tx.target.updateMany({
            where: { id: target.id, version: update.baseVersion, isArchived: false },
            data: { currentValue: update.value, status: evaluation.status, version: { increment: 1 }, lastReportedAt: now },
          });
          if (targetChanged.count !== 1) return false;
          const reviewChanged = await tx.progressUpdate.updateMany({
            where: { id: update.id, reviewStatus: ProgressReviewStatus.PENDING },
            data: {
              reviewStatus: ProgressReviewStatus.APPROVED,
              reviewedBy: SYSTEM_ACTOR.id,
              reviewedAt: now,
              autoApproved: true,
              reviewNote: `Hệ thống tự thông qua vì quá ${days} ngày không được duyệt`,
            },
          });
          if (reviewChanged.count !== 1) throw new Prisma.PrismaClientKnownRequestError('Báo cáo vừa được xử lý', { code: 'P2034', clientVersion: Prisma.prismaVersion.client });
          await refreshImportBatchStatus(tx, update.importBatchId);
          await recordWorkEvent(tx, {
            action: 'REPORT_AUTO_APPROVED', actor: null, targetId: target.id, departmentId: target.departmentId,
            responsibleUserId: reviewers[0] ?? null,
            note: `${who} không duyệt báo cáo của ${update.user.fullName} trong ${days} ngày — hệ thống tự thông qua${update.periodKey ? ` (${periodLabel(update.periodKey)})` : ''}`,
            metadata: { progressUpdateId: update.id, value: update.value, reviewers },
          });
          await audit(tx, SYSTEM_ACTOR, {
            action: 'PROGRESS_AUTO_APPROVED', entityType: 'ProgressUpdate', entityId: update.id, departmentId: target.departmentId,
            metadata: { targetId: target.id, value: update.value, code: target.code },
          });
          await notifyUsers(tx, [update.userId, ...reviewers, ...await leaderIds(tx)], {
            kind: 'REPORT_AUTO_APPROVED', title: `Báo cáo ${target.code} tự thông qua do quá ${days} ngày không duyệt`,
            body: `Người duyệt chịu trách nhiệm: ${who}.`, link: targetLink(target.id), entityType: 'Target', entityId: target.id,
            dedupeKey: `report-auto:${update.id}`,
          });
          return true;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        if (approved) {
          result.autoApprovedReports += 1;
          if (target.parentId) await rollupParents(this.prisma, [target.parentId], SYSTEM_ACTOR);
        }
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2025'].includes(error.code)) continue;
        throw error;
      }
    }
  }

  private async autoApproveProposals(now: Date, result: AccountabilityRunResult) {
    const due = await this.prisma.indicatorCandidate.findMany({
      where: { status: CandidateStatus.SUBMITTED, autoApproveAt: { lte: now } },
      select: { id: true, name: true, responsibleDepartmentId: true },
      take: BATCH,
    });
    for (const candidate of due) {
      try {
        await approveCandidateById(this.prisma, SYSTEM_ACTOR, candidate.id, { auto: true });
        result.autoApprovedProposals += 1;
      } catch (error) {
        if (!(error instanceof BadRequestException)) {
          this.logger.warn(`Không tự thông qua được đề xuất ${candidate.id}`);
          continue;
        }
        // Thiếu thông tin bắt buộc: không thể tự tạo chỉ tiêu — dừng đếm hạn và báo lãnh đạo xử lý.
        await this.prisma.$transaction(async tx => {
          const changed = await tx.indicatorCandidate.updateMany({ where: { id: candidate.id, status: CandidateStatus.SUBMITTED }, data: { autoApproveAt: null } });
          if (changed.count !== 1) return;
          await recordWorkEvent(tx, {
            action: 'PROPOSAL_AUTO_BLOCKED', actor: null, candidateId: candidate.id, departmentId: candidate.responsibleDepartmentId,
            note: error instanceof Error ? error.message : 'Thiếu thông tin bắt buộc',
          });
          await notifyUsers(tx, [...await leaderIds(tx), ...await departmentManagerIds(tx, candidate.responsibleDepartmentId)], {
            kind: 'PROPOSAL_AUTO_BLOCKED', title: `Đề xuất "${candidate.name}" quá hạn nhưng thiếu thông tin để tự thành chỉ tiêu`,
            body: error instanceof Error ? error.message : null, link: `/admin/proposals?id=${candidate.id}`,
            entityType: 'IndicatorCandidate', entityId: candidate.id, dedupeKey: `proposal-blocked:${candidate.id}`,
          });
        });
        result.blockedProposals += 1;
      }
    }
  }

  private async remindProposalsDueSoon(now: Date, result: AccountabilityRunResult) {
    const soon = await this.prisma.indicatorCandidate.findMany({
      where: { status: CandidateStatus.SUBMITTED, autoApproveAt: { gt: now, lte: new Date(now.getTime() + DAY) } },
      select: { id: true, name: true, responsibleDepartmentId: true, autoApproveAt: true },
      take: BATCH,
    });
    for (const candidate of soon) {
      result.reminders += await notifyUsers(this.prisma, [...await leaderIds(this.prisma), ...await departmentManagerIds(this.prisma, candidate.responsibleDepartmentId)], {
        kind: 'PROPOSAL_DUE_SOON', title: `Còn dưới 24 giờ: đề xuất "${candidate.name}" sẽ tự thành chỉ tiêu`,
        body: 'Hãy duyệt hoặc từ chối (kèm lý do) nếu đề xuất chưa phù hợp.', link: `/admin/proposals?id=${candidate.id}`,
        entityType: 'IndicatorCandidate', entityId: candidate.id, dedupeKey: `proposal-due:${candidate.id}`,
      });
    }
  }

  private async remindMissingReports(now: Date, result: AccountabilityRunResult) {
    const year = currentVietnamYear(now);
    const targets = await this.prisma.target.findMany({
      where: { year, isArchived: false, valueSource: ValueSource.MANUAL, children: { none: {} } },
      select: {
        id: true, code: true, title: true, frequency: true, year: true, reportDueDay: true, assigneeId: true, departmentId: true, kind: true, createdAt: true,
        updates: { where: { reviewStatus: { not: ProgressReviewStatus.REJECTED }, periodKey: { not: null } }, select: { periodKey: true } },
      },
    });
    for (const target of targets) {
      const reported = new Set(target.updates.map(update => update.periodKey!));
      const periods = dueReportPeriods(target.frequency, target.year, target.reportDueDay, now, target.createdAt);
      const missing = periods.filter(period => period.overdue && !reported.has(period.key));
      const latest = missing[missing.length - 1];
      if (latest) {
        const recipients = target.assigneeId ? [target.assigneeId, ...await departmentManagerIds(this.prisma, target.departmentId)] : await departmentManagerIds(this.prisma, target.departmentId);
        result.reminders += await notifyUsers(this.prisma, recipients, {
          kind: 'MISSING_REPORT', title: `Chỉ tiêu ${target.code} chưa có báo cáo ${periodLabel(latest.key)}`,
          body: target.title, link: targetLink(target.id), entityType: 'Target', entityId: target.id, dedupeKey: `missing:${target.id}:${latest.key}`,
        });
        if (now.getTime() - latest.deadline.getTime() > 7 * DAY) {
          const sent = await this.prisma.$transaction(async tx => {
            const count = await notifyUsers(tx, await leaderIds(tx), {
              kind: 'ESCALATED', title: `${target.code} trễ báo cáo ${periodLabel(latest.key)} quá 7 ngày`,
              body: target.title, link: targetLink(target.id), entityType: 'Target', entityId: target.id, dedupeKey: `missing-escalate:${target.id}:${latest.key}`,
            });
            if (count) {
              await recordWorkEvent(tx, {
                action: 'ESCALATED', actor: null, targetId: target.id, departmentId: target.departmentId, responsibleUserId: target.assigneeId,
                note: `Trễ báo cáo ${periodLabel(latest.key)} quá 7 ngày — đã báo lãnh đạo`,
              });
            }
            return count;
          });
          if (sent) result.escalations += 1;
        }
        continue;
      }
      // Sắp đến hạn kỳ hiện tại (3 ngày): nhắc trước.
      const current = periods.find(period => !period.overdue);
      if (current && !reported.has(current.key) && current.deadline.getTime() - now.getTime() < 3 * DAY && target.kind !== FrameworkKind.SCORE) {
        result.reminders += await notifyUsers(this.prisma, target.assigneeId ? [target.assigneeId] : await departmentManagerIds(this.prisma, target.departmentId), {
          kind: 'DUE_SOON', title: `Sắp đến hạn báo cáo ${periodLabel(current.key)}: ${target.code}`,
          body: target.title, link: targetLink(target.id), entityType: 'Target', entityId: target.id, dedupeKey: `due-soon:${target.id}:${current.key}`,
        });
      }
    }
  }

  private async remindUnassigned(now: Date, stallDays: number, result: AccountabilityRunResult) {
    const targets = await this.prisma.target.findMany({
      where: {
        isArchived: false, assigneeId: null, valueSource: ValueSource.MANUAL, children: { none: {} },
        createdAt: { lt: new Date(now.getTime() - stallDays * DAY) },
        year: { gte: currentVietnamYear(now) },
      },
      select: { id: true, code: true, title: true, departmentId: true, createdAt: true },
      take: 500,
    });
    for (const target of targets) {
      result.reminders += await notifyUsers(this.prisma, await departmentManagerIds(this.prisma, target.departmentId), {
        kind: 'UNASSIGNED', title: `Chỉ tiêu ${target.code} chưa giao chuyên viên phụ trách`,
        body: target.title, link: targetLink(target.id), entityType: 'Target', entityId: target.id,
        dedupeKey: `unassigned:${target.id}:${vietnamDayKey(now).slice(0, 7)}`,
      });
      if (now.getTime() - target.createdAt.getTime() > stallDays * 2 * DAY) {
        const sent = await this.prisma.$transaction(async tx => {
          const managers = await departmentManagerIds(tx, target.departmentId);
          const count = await notifyUsers(tx, await leaderIds(tx), {
            kind: 'ESCALATED', title: `Chỉ tiêu ${target.code} bị treo: chưa giao người phụ trách`,
            body: target.title, link: targetLink(target.id), entityType: 'Target', entityId: target.id, dedupeKey: `unassigned-escalate:${target.id}`,
          });
          if (count) {
            await recordWorkEvent(tx, {
              action: 'ESCALATED', actor: null, targetId: target.id, departmentId: target.departmentId, responsibleUserId: managers[0] ?? null,
              note: `Quá ${stallDays * 2} ngày chưa giao chuyên viên phụ trách — đã báo lãnh đạo`,
            });
          }
          return count;
        });
        if (sent) result.escalations += 1;
      }
    }
  }

  private async escalateExplanations(now: Date, result: AccountabilityRunResult) {
    const overdue = await this.prisma.explanationRequest.findMany({
      where: { status: ExplanationStatus.OPEN, dueAt: { lt: now } },
      include: { target: { select: { id: true, code: true, title: true, departmentId: true, assigneeId: true } } },
      take: BATCH,
    });
    for (const request of overdue) {
      const sent = await this.prisma.$transaction(async tx => {
        const managers = await departmentManagerIds(tx, request.target.departmentId);
        const count = await notifyUsers(tx, [request.requestedById, ...managers, request.target.assigneeId], {
          kind: 'EXPLANATION_OVERDUE', title: `Quá hạn giải trình chỉ tiêu ${request.target.code}`,
          body: request.message, link: targetLink(request.target.id), entityType: 'Target', entityId: request.target.id,
          dedupeKey: `explain-overdue:${request.id}`,
        });
        if (count) {
          await recordWorkEvent(tx, {
            action: 'ESCALATED', actor: null, targetId: request.target.id, departmentId: request.target.departmentId,
            responsibleUserId: managers[0] ?? null, note: 'Quá hạn trả lời yêu cầu giải trình',
          });
        }
        return count;
      });
      if (sent) result.escalations += 1;
    }
  }
}
