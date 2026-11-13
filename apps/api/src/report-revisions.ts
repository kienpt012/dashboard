import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma, ProgressReviewStatus, Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { audit, canSuperviseDepartment, getActor } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { periodLabel } from './periods';
import { PrismaService } from './prisma.service';
import { RateLimitService } from './rate-limit';
import { departmentManagerIds, notifyUsers, recordWorkEvent, targetLink } from './work';

export class RequestReportRevisionDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(5) @MaxLength(1000)
  reason!: string;
}

/** Chỉ đóng việc sau khi số thay thế đã được duyệt. Báo cáo gốc luôn giữ nguyên. */
export async function resolveReportRevisions(tx: Prisma.TransactionClient, targetId: string, periodKey: string | null, approvedAt = new Date()) {
  if (!periodKey) return;
  await tx.progressUpdate.updateMany({
    where: { targetId, periodKey, revisionRequestedAt: { not: null, lte: approvedAt }, revisionResolvedAt: null },
    data: { revisionResolvedAt: approvedAt },
  });
}

@Controller('targets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportRevisionsController {
  constructor(private readonly prisma: PrismaService, private readonly rateLimit: RateLimitService) {}

  @Post(':id/updates/:updateId/request-revision')
  @Roles(Role.ADMIN, Role.LEADER, Role.MANAGER)
  async request(@Req() req: any, @Param('id') id: string, @Param('updateId') updateId: string, @Body() dto: RequestReportRevisionDto) {
    const actor = getActor(req);
    this.rateLimit.consume('report-revision', actor.id, { limit: 20, windowMs: 60_000 });
    if (!dto.reason?.trim() || dto.reason.trim().length < 5) throw new BadRequestException('Vui lòng nêu lý do cập nhật lại');
    return this.prisma.$transaction(async tx => {
      const report = await tx.progressUpdate.findFirst({ where: { id: updateId, targetId: id }, include: { target: true } });
      if (!report) throw new NotFoundException('Không tìm thấy báo cáo');
      if (!canSuperviseDepartment(actor, report.target.departmentId)) throw new ForbiddenException('Bạn không quản lý chỉ tiêu này');
      if (report.reviewStatus !== ProgressReviewStatus.APPROVED || report.target.isArchived) throw new ConflictException('Chỉ yêu cầu cập nhật lại báo cáo đã duyệt của chỉ tiêu đang theo dõi');
      if (!report.periodKey) throw new ConflictException('Báo cáo cũ chưa xác định kỳ; cần xác định kỳ báo cáo trước');
      if (report.revisionRequestedAt && !report.revisionResolvedAt) throw new ConflictException('Báo cáo đang có yêu cầu cập nhật lại');
      const newer = await tx.progressUpdate.findFirst({ where: { targetId: id, periodKey: report.periodKey, reviewStatus: ProgressReviewStatus.APPROVED, createdAt: { gt: report.createdAt } } });
      if (newer) throw new ConflictException('Kỳ này đã có báo cáo mới hơn; hãy yêu cầu trên báo cáo mới nhất');
      const now = new Date();
      await tx.progressUpdate.update({ where: { id: report.id }, data: { revisionRequestedAt: now, revisionRequestedBy: actor.id, revisionReason: dto.reason.trim(), revisionResolvedAt: null } });
      const recipients = report.target.assigneeId ? [report.target.assigneeId] : await departmentManagerIds(tx, report.target.departmentId);
      const label = periodLabel(report.periodKey);
      await recordWorkEvent(tx, { action: 'REPORT_REVISION_REQUESTED', actor, targetId: id, departmentId: report.target.departmentId, responsibleUserId: recipients[0], note: `${label}: ${dto.reason.trim()}`, metadata: { progressUpdateId: report.id, periodKey: report.periodKey } });
      await notifyUsers(tx, recipients, { kind: 'REPORT_REVISION_REQUESTED', title: `${report.target.title} — cập nhật lại số liệu kỳ ${label}`, body: dto.reason.trim(), link: targetLink(id), entityType: 'ProgressUpdate', entityId: report.id, dedupeKey: `revision:${report.id}:${now.getTime()}` });
      await audit(tx, actor, { action: 'REPORT_REVISION_REQUESTED', entityType: 'ProgressUpdate', entityId: report.id, departmentId: report.target.departmentId, metadata: { targetId: id, periodKey: report.periodKey } });
      return { ok: true, requestedAt: now };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
