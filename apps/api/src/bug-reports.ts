import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BugReportStatus, Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { Response } from 'express';
import { audit, getActor } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { detectAllowedAttachmentMime } from './feedback';
import { PrismaService } from './prisma.service';
import { RateLimitService } from './rate-limit';

// Nút "Báo lỗi" có ngữ cảnh: tự ghi địa chỉ trang, tiêu đề, mã màn hình, kích thước khung nhìn và thời điểm —
// đúng nhu cầu khách hàng "giữ lại URL để biết trang nào lỗi mà sửa" (UX-01).

const Trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
const MAX_SCREENSHOT = 5 * 1024 * 1024;

class UpdateBugReportDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsEnum(BugReportStatus) status!: BugReportStatus;
  @IsOptional() @Trim() @IsString() @MaxLength(2000) adminNote?: string;
}

function clip(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

@Controller('bug-reports')
@UseGuards(JwtAuthGuard)
export class BugReportsController {
  constructor(private readonly prisma: PrismaService, private readonly rateLimit: RateLimitService) {}

  @Post()
  @UseInterceptors(FileInterceptor('screenshot', { limits: { fileSize: MAX_SCREENSHOT, files: 1 } }))
  async create(@Req() req: any, @Body() body: Record<string, unknown>, @UploadedFile() file?: Express.Multer.File) {
    const actor = getActor(req);
    this.rateLimit.consume('bug-report-user', actor.id, { limit: 20, windowMs: 60 * 60 * 1000, message: 'Bạn đã gửi quá nhiều báo lỗi trong một giờ. Vui lòng thử lại sau.' });
    const description = clip(body.description, 4000);
    if (!description || description.length < 5) throw new BadRequestException('Vui lòng mô tả lỗi (ít nhất 5 ký tự)');
    const url = clip(body.url, 1000);
    if (!url) throw new BadRequestException('Thiếu địa chỉ trang');
    let screenshot: Uint8Array<ArrayBuffer> | undefined;
    let screenshotMime: string | undefined;
    if (file?.buffer?.length) {
      const mime = detectAllowedAttachmentMime(file.buffer);
      if (!mime || mime === 'application/pdf') throw new BadRequestException('Ảnh chụp màn hình phải là JPEG, PNG hoặc WEBP');
      screenshot = Uint8Array.from(file.buffer);
      screenshotMime = mime;
    }
    const report = await this.prisma.bugReport.create({
      data: {
        userId: actor.id,
        reporterName: actor.fullName,
        url,
        pageTitle: clip(body.pageTitle, 300),
        screenCode: clip(body.screenCode, 60),
        viewport: clip(body.viewport, 40),
        userAgent: clip(req.headers?.['user-agent'], 300),
        description,
        screenshot,
        screenshotMime,
      },
      select: { id: true, createdAt: true },
    });
    return { ...report, message: 'Đã ghi nhận báo lỗi kèm địa chỉ trang và thời điểm. Cảm ơn bạn!' };
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async list(@Query('status') status?: string) {
    const where = status && status in BugReportStatus ? { status: status as BugReportStatus } : {};
    const rows = await this.prisma.bugReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, reporterName: true, url: true, pageTitle: true, screenCode: true, viewport: true, userAgent: true,
        description: true, screenshotMime: true, status: true, adminNote: true, resolvedAt: true, version: true, createdAt: true,
      },
    });
    return rows.map(row => ({ ...row, hasScreenshot: Boolean(row.screenshotMime) }));
  }

  @Get(':id/screenshot')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async screenshot(@Param('id') id: string, @Res() res: Response) {
    const report = await this.prisma.bugReport.findUnique({ where: { id }, select: { screenshot: true, screenshotMime: true } });
    if (!report?.screenshot || !report.screenshotMime) throw new NotFoundException('Báo lỗi không có ảnh chụp');
    res.setHeader('Content-Type', report.screenshotMime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(Buffer.from(report.screenshot));
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateBugReportDto) {
    const actor = getActor(req);
    return this.prisma.$transaction(async tx => {
      const done = dto.status === BugReportStatus.RESOLVED || dto.status === BugReportStatus.WONT_FIX;
      const changed = await tx.bugReport.updateMany({
        where: { id, version: dto.expectedVersion },
        data: {
          status: dto.status,
          adminNote: dto.adminNote ?? undefined,
          resolvedAt: done ? new Date() : null,
          resolvedById: done ? actor.id : null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Báo lỗi vừa được cập nhật. Vui lòng tải lại.');
      await audit(tx, actor, { action: 'BUG_REPORT_UPDATED', entityType: 'BugReport', entityId: id, departmentId: null, metadata: { toStatus: dto.status } });
      return tx.bugReport.findUniqueOrThrow({ where: { id }, select: { id: true, status: true, adminNote: true, version: true, resolvedAt: true } });
    });
  }
}
