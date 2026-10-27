import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { CandidateStatus, FeedbackStatus, FrameworkKind, ProgressReviewStatus, Role, TargetStatus, ValueSource } from '@prisma/client';
import { type Actor, getActor, isGlobalRole, resolveDepartmentScope } from '../access';
import { JwtAuthGuard } from '../common';
import { buildOverview, iocSnapshot, parseYear, type IocSnapshot } from '../ioc';
import { evaluateTarget } from '../metrics';
import { dueReportPeriods, periodLabel } from '../periods';
import { PrismaService } from '../prisma.service';

// Dữ liệu cho widget của bàn làm việc: một gói theo phòng (mọi widget cùng phòng dùng chung một lần tải), chuỗi số
// liệu theo kỳ cho biểu đồ, và danh sách chỉ tiêu để chọn trong ô cài đặt. Quyền xem đi qua resolveDepartmentScope như
// mọi màn hình khác; bộ đệm chỉ tra sau khi đã được phép.

const DAY = 86_400_000;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const SERIES_MAX = 6;

export type DeadlineKind = 'TARGET_DUE' | 'PERIOD_REPORT' | 'EXPLANATION_DUE' | 'PROPOSAL_AUTO_APPROVE';

export interface Deadline {
  kind: DeadlineKind;
  at: Date;
  title: string;
  detail: string;
  link: string;
  overdue: boolean;
}

export interface TeamMember {
  userId: string;
  fullName: string;
  position: string | null;
  role: Role;
  targets: number;
  missingReports: number;
  overdue: number;
  lastLoginAt: Date | null;
}

/** Bộ đệm nhỏ trong bộ nhớ: mục hết hạn sau ttlMs, đầy thì bỏ mục cũ nhất. */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; at: number }>();

  constructor(private readonly ttlMs: number, private readonly max: number) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.at >= this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { value, at: Date.now() });
    while (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value!);
  }
}

/** Hạn trong khung `days` ngày tới (kể cả hạn đã qua mà chưa xong), sắp theo thời điểm. */
export function buildDeadlines(snap: IocSnapshot, proposals: { id: string; name: string; autoApproveAt: Date | null }[], now: Date, days: number): Deadline[] {
  const horizon = now.getTime() + days * DAY;
  const list: Deadline[] = [];
  for (const item of snap.evaluated) {
    if (!item.isLeaf) continue;
    const { target } = item;
    const link = `/admin/targets/${target.id}`;
    if (target.kind !== FrameworkKind.STAT && item.metric.status !== TargetStatus.COMPLETED && target.dueDate.getTime() <= horizon) {
      list.push({ kind: 'TARGET_DUE', at: target.dueDate, title: `${target.code} · ${target.title}`, detail: 'Hạn hoàn thành chỉ tiêu', link, overdue: target.dueDate < now });
    }
    if (target.valueSource === ValueSource.MANUAL) {
      const reported = snap.reportedByTarget.get(target.id) ?? new Set<string>();
      const next = dueReportPeriods(target.frequency, target.year, target.reportDueDay, now, target.createdAt)
        .filter(period => !reported.has(period.key) && (period.overdue || period.deadline >= now))
        .find(period => period.deadline.getTime() <= horizon);
      if (next) {
        list.push({ kind: 'PERIOD_REPORT', at: next.deadline, title: `${target.code} · Báo cáo ${periodLabel(next.key)}`, detail: target.title, link, overdue: next.deadline < now });
      }
    }
    if (item.explanation && item.explanation.dueAt.getTime() <= horizon) {
      list.push({ kind: 'EXPLANATION_DUE', at: item.explanation.dueAt, title: `${target.code} · Giải trình`, detail: item.explanation.message, link, overdue: item.explanation.dueAt < now });
    }
  }
  for (const proposal of proposals) {
    if (!proposal.autoApproveAt || proposal.autoApproveAt.getTime() > horizon) continue;
    list.push({
      kind: 'PROPOSAL_AUTO_APPROVE', at: proposal.autoApproveAt, title: `Đề xuất: ${proposal.name}`,
      detail: 'Tự thông qua nếu chưa được duyệt', link: `/admin/proposals?id=${encodeURIComponent(proposal.id)}`, overdue: proposal.autoApproveAt < now,
    });
  }
  return list.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 60);
}

const ROLE_ORDER: Record<Role, number> = { MANAGER: 0, LEADER: 1, ADMIN: 2, CLERK: 3, STAFF: 4, VIEWER: 5 };

export function buildTeam(snap: IocSnapshot, members: { id: string; fullName: string; position: string | null; role: Role; lastLoginAt: Date | null }[]): TeamMember[] {
  return members
    .map(member => {
      const own = snap.evaluated.filter(item => item.isLeaf && item.target.assigneeId === member.id);
      return {
        userId: member.id,
        fullName: member.fullName,
        position: member.position,
        role: member.role,
        targets: own.length,
        missingReports: own.filter(item => item.missingPeriods.length).length,
        overdue: own.filter(item => item.metric.status === TargetStatus.OVERDUE).length,
        lastLoginAt: member.lastLoginAt,
      };
    })
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.fullName.localeCompare(b.fullName, 'vi'));
}

const OPEN_FEEDBACK: FeedbackStatus[] = [
  FeedbackStatus.RECEIVED, FeedbackStatus.ASSIGNED, FeedbackStatus.IN_PROGRESS, FeedbackStatus.PENDING_REVIEW,
  FeedbackStatus.REOPENED, FeedbackStatus.WAITING_CITIZEN,
];

function parseIds(raw: string | undefined, max: number) {
  const ids = [...new Set((raw ?? '').split(',').map(value => value.trim()).filter(Boolean))];
  if (ids.length > max || ids.some(id => !ID.test(id))) throw new BadRequestException('Danh sách chỉ tiêu không hợp lệ');
  return ids;
}

@Controller('desk/data')
@UseGuards(JwtAuthGuard)
export class DeskDataController {
  private readonly cache = new TtlCache<unknown>(30_000, 200);

  constructor(private readonly prisma: PrismaService) {}

  @Get('department')
  async department(@Req() req: any, @Query('departmentId') departmentIdRaw?: string, @Query('year') yearRaw?: string) {
    const actor = getActor(req);
    const year = parseYear(yearRaw);
    const requested = departmentIdRaw?.trim() || undefined;
    if (isGlobalRole(actor.role) && !requested) throw new BadRequestException('Chọn phòng cần xem');
    const departmentId = resolveDepartmentScope(actor, requested);
    if (!departmentId) throw new BadRequestException('Chọn phòng cần xem');
    const key = `${departmentId}:${year}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const snapshot = await this.departmentSnapshot(actor, year, departmentId);
    this.cache.set(key, snapshot);
    return snapshot;
  }

  private async departmentSnapshot(actor: Actor, year: number, departmentId: string) {
    const department = await this.prisma.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true, name: true, color: true } });
    if (!department) throw new BadRequestException('Phòng không tồn tại hoặc đã ngừng hoạt động');
    const snap = await iocSnapshot(this.prisma, actor, year, departmentId);
    const [overview, proposals, members, feedbackGroups, latestFeedback, documents] = await Promise.all([
      buildOverview(this.prisma, actor, year, snap),
      this.prisma.indicatorCandidate.findMany({
        where: { status: CandidateStatus.SUBMITTED, responsibleDepartmentId: departmentId },
        select: { id: true, name: true, autoApproveAt: true },
        take: 50,
      }),
      this.prisma.user.findMany({
        where: { departmentId, isActive: true },
        select: { id: true, fullName: true, position: true, role: true, lastLoginAt: true },
      }),
      this.prisma.feedback.groupBy({ by: ['status'], where: { departmentId }, _count: true }),
      this.prisma.feedback.findMany({
        where: { departmentId, status: { in: OPEN_FEEDBACK } },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, code: true, title: true, status: true, createdAt: true, dueAt: true },
      }),
      this.prisma.sourceDocument.findMany({
        where: { OR: [{ departmentId }, { departmentId: null }] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 8,
        select: { id: true, code: true, title: true, status: true, createdAt: true },
      }),
    ]);
    const row = overview.departments.find(item => item.id === departmentId);
    return {
      department,
      year,
      generatedAt: overview.generatedAt,
      dataAsOf: overview.dataAsOf,
      totals: { ...overview.totals, oldestPendingDays: row?.oldestPendingDays ?? 0 },
      frameworks: overview.frameworks,
      alerts: overview.alerts,
      stalled: overview.stalled,
      recent: overview.recent,
      deadlines: buildDeadlines(snap, proposals, snap.now, 90),
      team: buildTeam(snap, members),
      feedback: {
        counts: Object.fromEntries(feedbackGroups.map(group => [group.status, group._count])),
        latest: latestFeedback,
      },
      documents,
    };
  }

  @Get('series')
  async series(@Req() req: any, @Query('ids') idsRaw?: string, @Query('year') yearRaw?: string) {
    const actor = getActor(req);
    const ids = parseIds(idsRaw, SERIES_MAX);
    parseYear(yearRaw);
    if (!ids.length) return { targets: [] };
    const scope = isGlobalRole(actor.role) ? {} : { departmentId: actor.departmentId ?? '__none__' };
    const [setting, targets, updates] = await Promise.all([
      this.prisma.systemSetting.findUnique({ where: { id: 'default' } }),
      this.prisma.target.findMany({ where: { id: { in: ids }, ...scope } }),
      this.prisma.progressUpdate.findMany({
        where: { targetId: { in: ids }, reviewStatus: ProgressReviewStatus.APPROVED, periodKey: { not: null }, target: scope },
        orderBy: { createdAt: 'asc' },
        select: { targetId: true, periodKey: true, value: true },
      }),
    ]);
    const now = new Date();
    const byId = new Map(targets.map(target => [target.id, target]));
    return {
      targets: ids.flatMap(id => {
        const target = byId.get(id);
        if (!target) return [];
        const metric = evaluateTarget({
          targetValue: target.targetValue, currentValue: target.currentValue, direction: target.direction, dueDate: target.dueDate,
          riskThreshold: setting?.riskThreshold ?? 70, hasReport: Boolean(target.lastReportedAt), kind: target.kind, now,
        });
        const latest = new Map<string, number>();
        for (const update of updates) if (update.targetId === id) latest.set(update.periodKey!, update.value);
        const points = [...latest.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([periodKey, value]) => ({ periodKey, label: periodLabel(periodKey), value }));
        return [{
          id: target.id, code: target.code, title: target.title, unit: target.unit, kind: target.kind, targetValue: target.targetValue,
          targetText: target.targetText, currentValue: target.currentValue, status: metric.status, progress: metric.progress, points,
        }];
      }),
    };
  }

  /** Chọn chỉ tiêu trong ô cài đặt: tìm theo phòng/từ khoá, hoặc tra tên các chỉ tiêu đã chọn (`ids`). */
  @Get('targets')
  async targets(@Req() req: any, @Query('departmentId') departmentIdRaw?: string, @Query('search') searchRaw?: string, @Query('year') yearRaw?: string, @Query('ids') idsRaw?: string) {
    const actor = getActor(req);
    const year = parseYear(yearRaw);
    const ids = idsRaw ? parseIds(idsRaw, 50) : null;
    const departmentId = ids ? (isGlobalRole(actor.role) ? undefined : actor.departmentId ?? '__none__') : resolveDepartmentScope(actor, departmentIdRaw);
    const search = searchRaw?.trim().slice(0, 100);
    const [setting, targets] = await Promise.all([
      this.prisma.systemSetting.findUnique({ where: { id: 'default' } }),
      this.prisma.target.findMany({
        where: ids
          ? { id: { in: ids }, ...(departmentId ? { departmentId } : {}) }
          : {
              year, isArchived: false,
              ...(departmentId ? { departmentId } : {}),
              ...(search ? { OR: [{ title: { contains: search, mode: 'insensitive' as const } }, { code: { contains: search, mode: 'insensitive' as const } }] } : {}),
            },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        take: 50,
        include: { department: { select: { name: true } } },
      }),
    ]);
    const now = new Date();
    return targets.map(target => {
      const metric = evaluateTarget({
        targetValue: target.targetValue, currentValue: target.currentValue, direction: target.direction, dueDate: target.dueDate,
        riskThreshold: setting?.riskThreshold ?? 70, hasReport: Boolean(target.lastReportedAt), kind: target.kind, now,
      });
      return { id: target.id, code: target.code, title: target.title, departmentName: target.department.name, status: metric.status, progress: metric.progress };
    });
  }
}
