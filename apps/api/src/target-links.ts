import { docRef } from './doc-ref';
import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get,
  NotFoundException, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { FrameworkKind, IssuingLevel, Prisma, ProgressReviewStatus, Role, ValueSource } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { Actor, audit, canSuperviseDepartment, getActor, isLeadership, resolveReadDepartmentScope } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { rollupParents } from './datasets';
import { dispatchSetting, isDispatcher } from './dispatch';
import { evaluateTarget } from './metrics';
import { PrismaService } from './prisma.service';
import { resolveReportRevisions } from './report-revisions';
import { recordWorkEvent } from './work';

type LinkClient = Pick<Prisma.TransactionClient, 'target' | 'progressUpdate' | 'systemSetting' | 'evidence' | 'auditLog' | 'workEvent' | 'notification' | 'user'>;

export function normalizeLinkText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Độ giống Levenshtein chuẩn hoá: 1 là tên giống nhau sau bỏ dấu và khoảng trắng thừa. */
export function linkNameSimilarity(left: string, right: string): number {
  const a = normalizeLinkText(left), b = normalizeLinkText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1]));
    previous = next;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

interface LinkCandidate {
  id: string; title: string; year: number; unit: string; frameworkId: string | null;
  standardCode: string | null; linkGroupId: string | null;
}

export function linkSuggestion(a: LinkCandidate, b: LinkCandidate): { similarity: number; reason: string } | null {
  if (a.id === b.id || !a.frameworkId || !b.frameworkId || a.frameworkId === b.frameworkId || a.year !== b.year
    || normalizeLinkText(a.unit) !== normalizeLinkText(b.unit) || (a.linkGroupId && a.linkGroupId === b.linkGroupId)) return null;
  if (a.standardCode && b.standardCode && normalizeLinkText(a.standardCode) === normalizeLinkText(b.standardCode)) {
    return { similarity: 1, reason: 'Cùng mã chuẩn, năm và đơn vị tính' };
  }
  const similarity = linkNameSimilarity(a.title, b.title);
  return similarity >= 0.85 ? { similarity, reason: 'Tên tương đồng, cùng năm và đơn vị tính' } : null;
}

export function linkPairKey(a: string, b: string): string { return [a, b].sort().join(':'); }

export function canManageTargetLinks(actor: Actor, departmentIds: string[], dispatcher = false): boolean {
  return actor.isActive && departmentIds.length > 0 && (isLeadership(actor)
    || (dispatcher && actor.role === Role.MANAGER && Boolean(actor.department?.isActive))
    || departmentIds.every(id => canSuperviseDepartment(actor, id)));
}

export const ISSUING_LEVEL_ORDER: Record<IssuingLevel, number> = { CENTRAL: 0, PROVINCE: 1, LOCAL: 2 };

const relationInclude = {
  framework: { include: { sourceDocument: { select: { docNumber: true } } } },
  sourceDocument: { select: { docNumber: true } },
  children: { where: { isArchived: false }, select: { id: true } },
} satisfies Prisma.TargetInclude;
type LinkTarget = Prisma.TargetGetPayload<{ include: typeof relationInclude }>;

function documentNumber(target: LinkTarget): string {
  return docRef(target).docRef || 'Chưa gắn văn bản';
}

function linkRow(target: LinkTarget) {
  const metric = evaluateTarget({ ...target, hasReport: Boolean(target.lastReportedAt) });
  return {
    id: target.id, title: target.title, frameworkId: target.frameworkId, departmentId: target.departmentId,
    documentNumber: documentNumber(target), issuingLevel: target.issuingLevel,
    targetValue: target.targetValue, targetText: target.targetText, currentValue: target.currentValue,
    unit: target.unit, achieved: metric.completed, progress: metric.progress, hasReport: Boolean(target.lastReportedAt),
  };
}

export function assertLinkableTargets(targets: Array<Pick<LinkTarget, 'isArchived' | 'valueSource' | 'children' | 'year' | 'unit' | 'frequency' | 'direction'> & { kind?: FrameworkKind }>): void {
  if (targets.some(target => target.kind === FrameworkKind.TASK)) {
    throw new BadRequestException('Nhiệm vụ của văn bản chỉ đạo không liên kết theo nhóm chỉ tiêu');
  }
  if (targets.some(target => target.isArchived || target.valueSource !== ValueSource.MANUAL || target.children.length)) {
    throw new BadRequestException('Chỉ liên kết chỉ tiêu nhập tay đang hoạt động và không có chỉ tiêu con');
  }
  const first = targets[0];
  if (!first || targets.some(target => target.year !== first.year || normalizeLinkText(target.unit) !== normalizeLinkText(first.unit))) {
    throw new BadRequestException('Các chỉ tiêu liên kết phải cùng năm và đơn vị tính');
  }
  // Một kỳ báo cáo dùng chung chỉ có nghĩa khi các chỉ tiêu dùng cùng lịch và chiều đánh giá.
  if (targets.some(target => target.frequency !== first.frequency || target.direction !== first.direction)) {
    throw new BadRequestException('Cần thống nhất tần suất và chiều đánh giá trước khi liên kết');
  }
}

/** Đổi cấu trúc của một chỉ tiêu liên kết phải bỏ liên kết trước để tránh dừng đồng bộ âm thầm. */
export function assertLinkedTargetDefinition(
  target: { linkGroupId?: string | null; unit: string; year: number; frequency: string; direction: string; valueSource: string; frameworkId: string | null },
  changes: { unit?: string; year?: number; frequency?: string; direction?: string; valueSource?: string; frameworkId?: string | null },
): void {
  if (!target.linkGroupId) return;
  for (const key of ['unit', 'year', 'frequency', 'direction', 'valueSource', 'frameworkId'] as const) {
    if (changes[key] !== undefined && changes[key] !== target[key]) throw new ConflictException('Cần bỏ liên kết trước khi đổi đơn vị, năm, tần suất, chiều đánh giá, nguồn số liệu hoặc bộ chỉ tiêu');
  }
}

/** Chạy cùng transaction với việc duyệt nguồn; không sao chép tệp, không thay bản ghi nguồn. */
export async function mirrorApprovedReport(tx: LinkClient, reportId: string, actor: Actor): Promise<string[]> {
  const report = await tx.progressUpdate.findUnique({ where: { id: reportId }, include: { target: { include: relationInclude } } });
  if (!report || report.reviewStatus !== ProgressReviewStatus.APPROVED || report.mirroredFromId || !report.target.linkGroupId || !report.periodKey) return [];
  if (report.target.valueSource !== ValueSource.MANUAL || report.target.children.length || report.target.isArchived) return [];
  const peers = await tx.target.findMany({
    where: { linkGroupId: report.target.linkGroupId, id: { not: report.targetId }, isArchived: false, valueSource: ValueSource.MANUAL, children: { none: { isArchived: false } } },
    include: relationInclude,
  });
  const threshold = (await tx.systemSetting.findUnique({ where: { id: 'default' } }))?.riskThreshold ?? 70;
  const changedIds: string[] = [];
  for (const target of peers) {
    if (target.year !== report.target.year || normalizeLinkText(target.unit) !== normalizeLinkText(report.target.unit)
      || target.frequency !== report.target.frequency || target.direction !== report.target.direction) continue;
    const existing = await tx.progressUpdate.findUnique({ where: { targetId_mirroredFromId: { targetId: target.id, mirroredFromId: report.id } } });
    if (existing) continue;
    const note = `Đồng bộ từ báo cáo của ${documentNumber(report.target)}`;
    const mirrored = await tx.progressUpdate.create({ data: {
      targetId: target.id, userId: report.userId, mirroredFromId: report.id,
      value: report.value, periodKey: report.periodKey, valueText: report.valueText,
      dataSource: report.dataSource, explanation: report.explanation, note,
      reviewStatus: ProgressReviewStatus.APPROVED, baseVersion: target.version,
      reviewedBy: report.reviewedBy, reviewedAt: report.reviewedAt ?? new Date(), autoApproved: report.autoApproved,
    } });
    const metric = evaluateTarget({ ...target, currentValue: report.value, hasReport: true, riskThreshold: threshold });
    const updated = await tx.target.updateMany({
      where: { id: target.id, version: target.version },
      data: { currentValue: report.value, lastReportedAt: report.reviewedAt ?? new Date(), status: metric.status, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ConflictException('Chỉ tiêu liên kết vừa thay đổi. Vui lòng duyệt lại báo cáo.');
    await resolveReportRevisions(tx as Prisma.TransactionClient, target.id, report.periodKey, report.reviewedAt ?? new Date());
    await recordWorkEvent(tx, {
      action: 'REPORT_MIRRORED', actor, targetId: target.id, departmentId: target.departmentId, note,
      metadata: { progressUpdateId: mirrored.id, mirroredFromId: report.id, periodKey: report.periodKey },
    });
    await audit(tx, actor, { action: 'REPORT_MIRRORED', entityType: 'ProgressUpdate', entityId: mirrored.id, departmentId: target.departmentId, metadata: { mirroredFromId: report.id, targetId: target.id } });
    changedIds.push(target.id);
  }
  return changedIds;
}

/** Sau khi commit báo cáo, tổng hợp lại cả các chỉ tiêu cha của bản đồng bộ. */
export async function rollupLinkedParents(prisma: PrismaService, targetId: string, actor: Actor): Promise<void> {
  const target = await prisma.target.findUnique({ where: { id: targetId }, select: { linkGroupId: true } });
  if (!target?.linkGroupId) return;
  const peers = await prisma.target.findMany({ where: { linkGroupId: target.linkGroupId, isArchived: false, parentId: { not: null } }, select: { parentId: true } });
  await rollupParents(prisma, [...new Set(peers.map(peer => peer.parentId!))], actor);
}

const sharedEvidenceSelect = {
  id: true, targetId: true, title: true, kind: true, mimeType: true, size: true, url: true, note: true,
  capturedAt: true, createdAt: true, createdByName: true, sourceDocumentId: true,
} satisfies Prisma.EvidenceSelect;

/** Bổ sung minh chứng từ báo cáo gốc bằng tham chiếu; cả tệp thêm sau khi duyệt cũng được nhìn thấy. */
export async function attachLinkedReportEvidence<T extends { mirroredFromId?: string | null; evidences: unknown[] }>(
  prisma: Pick<Prisma.TransactionClient, 'progressUpdate'>, reports: T[],
): Promise<T[]> {
  const sourceIds = [...new Set(reports.map(report => report.mirroredFromId).filter((id): id is string => Boolean(id)))];
  if (!sourceIds.length) return reports;
  const sources = await prisma.progressUpdate.findMany({ where: { id: { in: sourceIds } }, select: { id: true, targetId: true, evidences: { select: sharedEvidenceSelect } } });
  const byId = new Map(sources.map(source => [source.id, source.evidences]));
  return reports.map(report => ({ ...report, mirroredFromTargetId: report.mirroredFromId ? sources.find(source => source.id === report.mirroredFromId)?.targetId ?? null : null, evidences: [...report.evidences, ...(report.mirroredFromId ? byId.get(report.mirroredFromId) ?? [] : [])] }));
}

/** Chỉ cho tải minh chứng thuộc hồ sơ hoặc báo cáo gốc được bản đồng bộ của hồ sơ tham chiếu. */
export function linkedEvidenceWhere(targetId: string, evidenceId: string): Prisma.EvidenceWhereInput {
  return { id: evidenceId, OR: [{ targetId }, { progressUpdate: { mirrors: { some: { targetId, reviewStatus: ProgressReviewStatus.APPROVED } } } }] };
}

class LinkPairDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(100) targetId!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(100) otherTargetId!: string;
}
class LinkSuggestionsQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
}

@Controller('target-links')
@UseGuards(JwtAuthGuard)
export class TargetLinksController {
  constructor(private readonly prisma: PrismaService) {}

  private async dispatcher(actor: Actor): Promise<boolean> {
    // Chánh Văn phòng chỉ có quyền này khi hệ thống đặt Người phân việc là Văn phòng (xem dispatch.ts).
    return actor.role === Role.MANAGER && isDispatcher(actor, await dispatchSetting(this.prisma));
  }

  private async requireRead(actor: Actor, target: { departmentId: string }) {
    await resolveReadDepartmentScope(this.prisma, actor, target.departmentId, 'all');
  }

  @Get('suggestions')
  async suggestions(@Req() req: any, @Query() query: LinkSuggestionsQuery) {
    const actor = getActor(req);
    const departmentId = await resolveReadDepartmentScope(this.prisma, actor, undefined, 'all');
    const [targets, dismissed, dispatcher] = await Promise.all([
      this.prisma.target.findMany({ where: { isArchived: false, kind: { not: FrameworkKind.TASK }, valueSource: ValueSource.MANUAL, frameworkId: { not: null }, children: { none: { isArchived: false } }, ...(departmentId ? { departmentId } : {}), ...(query.year ? { year: query.year } : {}) }, include: relationInclude, orderBy: [{ year: 'desc' }, { title: 'asc' }] }),
      this.prisma.targetLinkDismissal.findMany({ select: { pairKey: true } }), this.dispatcher(actor),
    ]);
    const ignored = new Set(dismissed.map(item => item.pairKey));
    const items = [];
    for (let i = 0; i < targets.length; i += 1) for (let j = i + 1; j < targets.length; j += 1) {
      const target = targets[i], candidate = targets[j];
      if (ignored.has(linkPairKey(target.id, candidate.id))) continue;
      const suggestion = linkSuggestion(target, candidate);
      if (!suggestion) continue;
      items.push({ target: linkRow(target), candidate: linkRow(candidate), ...suggestion, canManage: canManageTargetLinks(actor, [target.departmentId, candidate.departmentId], dispatcher) });
    }
    return { items: items.sort((a, b) => b.similarity - a.similarity) };
  }

  @Get('targets/:id')
  async group(@Req() req: any, @Param('id') id: string) {
    const actor = getActor(req);
    const target = await this.prisma.target.findUnique({ where: { id }, include: relationInclude });
    if (!target) throw new NotFoundException('Không tìm thấy chỉ tiêu');
    await this.requireRead(actor, target);
    const departmentId = await resolveReadDepartmentScope(this.prisma, actor, undefined, 'all');
    const targets = target.linkGroupId ? await this.prisma.target.findMany({ where: { linkGroupId: target.linkGroupId, isArchived: false }, include: relationInclude }) : [target];
    return { linkGroupId: target.linkGroupId, canManage: canManageTargetLinks(actor, targets.map(row => row.departmentId), await this.dispatcher(actor)), items: targets.filter(row => !departmentId || row.departmentId === departmentId).map(linkRow).sort((a, b) => ISSUING_LEVEL_ORDER[a.issuingLevel] - ISSUING_LEVEL_ORDER[b.issuingLevel]) };
  }

  @Post('link')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.LEADER, Role.MANAGER)
  async link(@Req() req: any, @Body() dto: LinkPairDto) {
    const actor = getActor(req), dispatcher = await this.dispatcher(actor);
    return this.prisma.$transaction(async tx => {
      const pair = await tx.target.findMany({ where: { id: { in: [dto.targetId, dto.otherTargetId] } }, include: relationInclude });
      if (pair.length !== 2) throw new NotFoundException('Cần chọn hai chỉ tiêu khác nhau đang tồn tại');
      const groups = pair.map(target => target.linkGroupId).filter((id): id is string => Boolean(id));
      const targets = await tx.target.findMany({ where: { OR: [{ id: { in: pair.map(target => target.id) } }, { linkGroupId: { in: groups } }] }, include: relationInclude });
      if (!canManageTargetLinks(actor, targets.map(target => target.departmentId), dispatcher)) throw new ForbiddenException('Chỉ trưởng phòng chủ trì, người phân việc hoặc lãnh đạo được liên kết chỉ tiêu');
      assertLinkableTargets(targets);
      if (new Set(targets.map(target => target.frameworkId)).size !== targets.length) throw new BadRequestException('Mỗi văn bản giao chỉ có một chỉ tiêu trong cùng nhóm liên kết');
      if (pair[0].frameworkId === pair[1].frameworkId || !pair[0].frameworkId || !pair[1].frameworkId) throw new BadRequestException('Chỉ liên kết các chỉ tiêu thuộc những văn bản giao khác nhau');
      if (pair[0].linkGroupId && pair[0].linkGroupId === pair[1].linkGroupId) return { linkGroupId: pair[0].linkGroupId, targetIds: targets.map(target => target.id) };
      const linkGroupId = groups.sort()[0] || randomUUID();
      await tx.target.updateMany({ where: { id: { in: targets.map(target => target.id) } }, data: { linkGroupId } });
      for (const target of targets) {
        await recordWorkEvent(tx, { action: 'TARGET_LINKED', actor, targetId: target.id, departmentId: target.departmentId, note: 'Liên kết số liệu giữa các văn bản giao', metadata: { linkGroupId, targetIds: targets.map(row => row.id) } });
        await audit(tx, actor, { action: 'TARGET_LINKED', entityType: 'Target', entityId: target.id, departmentId: target.departmentId, metadata: { linkGroupId } });
      }
      // Liên kết không tự lựa chọn một báo cáo cũ làm số liệu chuẩn. Kỳ duyệt tiếp theo sẽ đồng bộ.
      return { linkGroupId, targetIds: targets.map(target => target.id) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  @Post('ignore')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.LEADER, Role.MANAGER)
  async ignore(@Req() req: any, @Body() dto: LinkPairDto) {
    const actor = getActor(req), dispatcher = await this.dispatcher(actor);
    return this.prisma.$transaction(async tx => {
      const targets = await tx.target.findMany({ where: { id: { in: [dto.targetId, dto.otherTargetId] } }, include: relationInclude });
      if (targets.length !== 2) throw new NotFoundException('Không tìm thấy cặp chỉ tiêu');
      if (!canManageTargetLinks(actor, targets.map(target => target.departmentId), dispatcher)) throw new ForbiddenException('Bạn không có quyền xử lý gợi ý liên kết này');
      if (!linkSuggestion(targets[0], targets[1])) throw new BadRequestException('Cặp chỉ tiêu không có gợi ý liên kết');
      const pairKey = linkPairKey(dto.targetId, dto.otherTargetId);
      const existing = await tx.targetLinkDismissal.findUnique({ where: { pairKey } });
      if (existing) return { ignored: true };
      await tx.targetLinkDismissal.create({ data: { pairKey, targetId: dto.targetId, otherTargetId: dto.otherTargetId, actorId: actor.id } });
      for (const target of targets) {
        await recordWorkEvent(tx, { action: 'TARGET_LINK_IGNORED', actor, targetId: target.id, departmentId: target.departmentId, note: 'Bỏ qua gợi ý liên kết', metadata: { pairKey } });
        await audit(tx, actor, { action: 'TARGET_LINK_IGNORED', entityType: 'Target', entityId: target.id, departmentId: target.departmentId, metadata: { pairKey } });
      }
      return { ignored: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  @Delete('targets/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.LEADER, Role.MANAGER)
  async unlink(@Req() req: any, @Param('id') id: string) {
    const actor = getActor(req), dispatcher = await this.dispatcher(actor);
    return this.prisma.$transaction(async tx => {
      const target = await tx.target.findUnique({ where: { id } });
      if (!target) throw new NotFoundException('Không tìm thấy chỉ tiêu');
      if (!canManageTargetLinks(actor, [target.departmentId], dispatcher)) throw new ForbiddenException('Bạn không có quyền bỏ liên kết chỉ tiêu này');
      if (!target.linkGroupId) return { unlinked: true };
      const peers = await tx.target.findMany({ where: { linkGroupId: target.linkGroupId } });
      if (!canManageTargetLinks(actor, peers.map(peer => peer.departmentId), dispatcher)) throw new ForbiddenException('Cần quyền quản lý mọi chỉ tiêu trong nhóm để bỏ liên kết');
      const removed = peers.length <= 2 ? peers : [target];
      await tx.target.updateMany({ where: { id: { in: removed.map(row => row.id) } }, data: { linkGroupId: null } });
      for (const row of removed) {
        await recordWorkEvent(tx, { action: 'TARGET_UNLINKED', actor, targetId: row.id, departmentId: row.departmentId, note: 'Bỏ liên kết số liệu; giữ lịch sử báo cáo đã đồng bộ', metadata: { previousGroupId: target.linkGroupId } });
        await audit(tx, actor, { action: 'TARGET_UNLINKED', entityType: 'Target', entityId: row.id, departmentId: row.departmentId, metadata: { previousGroupId: target.linkGroupId } });
      }
      return { unlinked: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
