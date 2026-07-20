import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ImportBatchStatus,
  ProgressReviewStatus,
  Prisma,
  Role,
  TargetDirection,
  TargetFrequency,
  TargetStatus,
} from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { type Actor, audit, getActor, resolveDepartmentScope } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { evaluateTarget } from './metrics';
import { currentVietnamYear, parsePlanningDueDate } from './planning-date';
import { PrismaService } from './prisma.service';
import { archiveTargetData, restoreTargetData } from './target-lifecycle';

const Trim = () => Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);
const ValidateIfDefined = () => ValidateIf((_object, value) => value !== undefined);

function isTargetConcurrencyError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === 'P2025' || error.code === 'P2034');
}

class CreateTargetDto {
  @Trim() @IsString() @MinLength(3) @MaxLength(50) @Matches(/^[A-Za-z0-9._-]+$/) code!: string;
  @Trim() @IsString() @MinLength(3) @MaxLength(300) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @Trim() @IsString() @MinLength(1) @MaxLength(50) unit!: string;
  @IsNumber() @Min(0) targetValue!: number;
  @IsOptional() @IsNumber() @Min(0.1) @Max(10) weight?: number;
  @IsInt() @Min(2000) @Max(2100) year!: number;
  @IsEnum(TargetFrequency) frequency!: TargetFrequency;
  @IsOptional() @IsEnum(TargetDirection) direction?: TargetDirection;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Hạn hoàn thành phải có định dạng YYYY-MM-DD' }) @IsDateString() dueDate!: string;
  @IsString() departmentId!: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsBoolean() isHighlighted?: boolean;
  @IsOptional() @IsInt() @Min(0) publicOrder?: number;
}

export class UpdateTargetDto {
  @ValidateIfDefined() @Trim() @IsString() @MinLength(3) @MaxLength(300) title?: string;
  @ValidateIfDefined() @IsString() @MaxLength(2000) description?: string;
  @ValidateIfDefined() @Trim() @IsString() @MinLength(1) @MaxLength(50) unit?: string;
  @ValidateIfDefined() @IsNumber() @Min(0) targetValue?: number;
  @ValidateIfDefined() @IsNumber() @Min(0.1) @Max(10) weight?: number;
  @ValidateIfDefined() @IsInt() @Min(2000) @Max(2100) year?: number;
  @ValidateIfDefined() @IsEnum(TargetFrequency) frequency?: TargetFrequency;
  @ValidateIfDefined() @IsEnum(TargetDirection) direction?: TargetDirection;
  @ValidateIfDefined() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Hạn hoàn thành phải có định dạng YYYY-MM-DD' }) @IsDateString() dueDate?: string;
  @ValidateIfDefined() @IsString() departmentId?: string;
  @ValidateIfDefined() @IsBoolean() isPublic?: boolean;
  @ValidateIfDefined() @IsBoolean() isHighlighted?: boolean;
  @ValidateIfDefined() @IsInt() @Min(0) publicOrder?: number;
  @IsInt() @Min(1) expectedVersion!: number;
  @IsInt() @Min(1) expectedPublicationVersion!: number;
}

class ProgressDto {
  @IsNumber() @Min(0) value!: number;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsInt() @Min(1) baseVersion!: number;
}

class ReviewDto {
  @IsIn(['APPROVE', 'REJECT']) decision!: 'APPROVE' | 'REJECT';
  @IsOptional() @IsString() @MaxLength(2000) reviewNote?: string;
}

class TargetLifecycleDto {
  @Trim() @IsString() @MinLength(5) @MaxLength(500) reason!: string;
  @IsInt() @Min(1) expectedVersion!: number;
  @IsInt() @Min(1) expectedPublicationVersion!: number;
}

async function refreshImportBatchStatus(tx: Prisma.TransactionClient, importBatchId?: string | null) {
  if (!importBatchId) return;
  const updates = await tx.progressUpdate.findMany({
    where: { importBatchId },
    select: { reviewStatus: true },
  });
  if (!updates.length) return;
  const pending = updates.filter(item => item.reviewStatus === ProgressReviewStatus.PENDING).length;
  const approved = updates.filter(item => item.reviewStatus === ProgressReviewStatus.APPROVED).length;
  const rejected = updates.filter(item => item.reviewStatus === ProgressReviewStatus.REJECTED).length;
  const status = pending === updates.length
    ? ImportBatchStatus.SUBMITTED
    : pending > 0
      ? ImportBatchStatus.PARTIALLY_REVIEWED
      : approved === updates.length
        ? ImportBatchStatus.APPROVED
        : rejected === updates.length
          ? ImportBatchStatus.REJECTED
          : ImportBatchStatus.PARTIALLY_APPROVED;
  const changed = await tx.importBatch.updateMany({
    where: {
      id: importBatchId,
      status: { in: [ImportBatchStatus.SUBMITTED, ImportBatchStatus.PARTIALLY_REVIEWED] },
    },
    data: {
      status,
      // appliedAt chỉ mang nghĩa có ít nhất một dòng thực sự được ghi nhận.
      // Lô bị từ chối toàn bộ đã kết thúc nhưng không có dữ liệu nào được áp dụng.
      ...(pending === 0 && approved > 0 ? { appliedAt: new Date() } : {}),
    },
  });
  if (changed.count !== 1) {
    throw new ConflictException('Trạng thái lô Excel vừa thay đổi. Vui lòng tải lại trước khi tiếp tục duyệt.');
  }
}

@Controller('targets')
@UseGuards(JwtAuthGuard)
export class TargetsController {
  constructor(private readonly prisma: PrismaService) {}

  private async riskThreshold() {
    return (await this.prisma.systemSetting.findUnique({ where: { id: 'default' } }))?.riskThreshold ?? 70;
  }

  private async targetInScope(actor: Actor, id: string) {
    const departmentId = resolveDepartmentScope(actor);
    return this.prisma.target.findFirst({
      where: { id, ...(departmentId ? { departmentId } : {}) },
    });
  }

  @Get()
  async list(
    @Req() req: any,
    @Query('year') yearRaw?: string,
    @Query('status') status?: TargetStatus,
    @Query('departmentId') requestedDepartmentId?: string,
    @Query('search') search?: string,
    @Query('archived') archivedRaw?: string,
  ) {
    const actor = getActor(req);
    const departmentId = resolveDepartmentScope(actor, requestedDepartmentId);
    const year = yearRaw ? Number(yearRaw) : undefined;
    if (yearRaw && (!Number.isInteger(year) || year! < 2000 || year! > 2100)) {
      throw new BadRequestException('Năm kế hoạch không hợp lệ');
    }
    if (status && !Object.values(TargetStatus).includes(status)) {
      throw new BadRequestException('Trạng thái chỉ tiêu không hợp lệ');
    }
    if (archivedRaw !== undefined && !['true', 'false'].includes(archivedRaw)) {
      throw new BadRequestException('Bộ lọc lưu trữ không hợp lệ');
    }
    const normalizedSearch = search?.trim().slice(0, 100) || undefined;

    const [targets, riskThreshold] = await Promise.all([
      this.prisma.target.findMany({
        where: {
          year,
          departmentId,
          isArchived: archivedRaw === 'true',
          OR: normalizedSearch
            ? [
                { title: { contains: normalizedSearch, mode: 'insensitive' } },
                { code: { contains: normalizedSearch, mode: 'insensitive' } },
              ]
            : undefined,
        },
        include: {
          department: true,
          updates: {
            where: { reviewStatus: ProgressReviewStatus.APPROVED },
            take: 3,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { fullName: true } } },
          },
          _count: { select: { updates: { where: { reviewStatus: ProgressReviewStatus.PENDING } } } },
        },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      }),
      this.riskThreshold(),
    ]);

    const evaluated = targets.map(({ _count, ...target }) => ({
      ...target,
      ...evaluateTarget({
        targetValue: target.targetValue,
        currentValue: target.currentValue,
        direction: target.direction,
        dueDate: target.dueDate,
        riskThreshold,
        hasReport: Boolean(target.lastReportedAt),
      }),
      pendingUpdates: _count.updates,
    }));
    return status ? evaluated.filter(target => target.status === status) : evaluated;
  }

  @Get('pending-updates')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async pendingUpdates(@Req() req: any, @Query('departmentId') requestedDepartmentId?: string) {
    const actor = getActor(req);
    const departmentId = resolveDepartmentScope(actor, requestedDepartmentId);
    const updates = await this.prisma.progressUpdate.findMany({
      where: { reviewStatus: ProgressReviewStatus.PENDING, target: { departmentId, isArchived: false } },
      include: {
        target: { include: { department: true } },
        user: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return updates.map(update => ({ ...update, canReview: update.userId !== actor.id }));
  }

  @Get('my-submissions')
  @UseGuards(RolesGuard)
  @Roles(Role.MANAGER, Role.STAFF)
  async mySubmissions(@Req() req: any, @Query('year') yearRaw?: string) {
    const actor = getActor(req);
    const departmentId = resolveDepartmentScope(actor);
    const setting = yearRaw
      ? null
      : await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    const year = yearRaw ? Number(yearRaw) : setting?.defaultYear ?? currentVietnamYear();
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('Năm báo cáo không hợp lệ');
    }
    const rows = await this.prisma.progressUpdate.findMany({
      where: {
        userId: actor.id,
        target: { departmentId, year },
      },
      include: {
        target: { include: { department: true } },
        importBatch: { select: { id: true, fileName: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const reviewerIds = [...new Set(rows.map(row => row.reviewedBy).filter((id): id is string => Boolean(id)))];
    const reviewers = reviewerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: reviewerIds } },
          select: { id: true, fullName: true, username: true },
        })
      : [];
    const reviewerMap = new Map(reviewers.map(reviewer => [reviewer.id, reviewer]));
    return rows.map(row => ({
      ...row,
      reviewer: row.reviewedBy ? reviewerMap.get(row.reviewedBy) ?? null : null,
    }));
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async create(@Req() req: any, @Body() dto: CreateTargetDto) {
    const actor = getActor(req);
    if (dto.isPublic === true) {
      throw new BadRequestException('Chỉ tiêu mới phải ở trạng thái nội bộ; hãy nhập và duyệt số liệu trước khi công bố');
    }
    const departmentId = resolveDepartmentScope(actor, dto.departmentId);
    if (!departmentId) throw new BadRequestException('Vui lòng chọn phòng ban phụ trách');
    const dueDate = parsePlanningDueDate(dto.dueDate);
    if (dueDate.getUTCFullYear() !== dto.year) {
      throw new BadRequestException('Hạn hoàn thành phải thuộc cùng năm kế hoạch');
    }
    const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!department || !department.isActive) {
      throw new BadRequestException('Phòng ban phụ trách không tồn tại hoặc đã ngừng hoạt động');
    }

    const data = {
      code: dto.code.trim().toUpperCase(),
      title: dto.title.trim(),
      description: dto.description?.trim(),
      unit: dto.unit.trim(),
      targetValue: dto.targetValue,
      weight: dto.weight ?? 1,
      year: dto.year,
      frequency: dto.frequency,
      direction: dto.direction ?? TargetDirection.HIGHER_IS_BETTER,
      dueDate,
      departmentId,
      isPublic: actor.role === Role.ADMIN ? dto.isPublic ?? false : false,
      isHighlighted: actor.role === Role.ADMIN ? dto.isHighlighted ?? false : false,
      publicOrder: actor.role === Role.ADMIN ? dto.publicOrder : undefined,
    };
    let target;
    try {
      target = await this.prisma.$transaction(async (tx) => {
        const created = await tx.target.create({ data, include: { department: true } });
        await audit(tx, actor, {
          action: 'TARGET_CREATED',
          entityType: 'Target',
          entityId: created.id,
          departmentId,
          metadata: { code: created.code, year: created.year },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã chỉ tiêu đã tồn tại trong phòng ban và năm kế hoạch này');
      }
      throw error;
    }
    return target;
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateTargetDto) {
    const actor = getActor(req);
    const target = await this.targetInScope(actor, id);
    if (!target) throw new NotFoundException('Không tìm thấy chỉ tiêu');
    if (target.isArchived) {
      throw new ConflictException('Chỉ tiêu đã được lưu trữ. Hãy khôi phục chỉ tiêu trước khi chỉnh sửa.');
    }
    if (dto.expectedVersion !== target.version) {
      throw new ConflictException('Chỉ tiêu đã được cập nhật. Vui lòng tải lại dữ liệu trước khi sửa.');
    }
    if (dto.expectedPublicationVersion !== target.publicationVersion) {
      throw new ConflictException('Cấu hình công bố đã được cập nhật. Vui lòng tải lại dữ liệu trước khi sửa.');
    }
    if (dto.isPublic === true) {
      throw new BadRequestException('Không thể bật công khai bằng thao tác chỉnh sửa; hãy dùng chức năng Công bố để tạo bản chụp số liệu chính thức');
    }
    if (
      actor.role !== Role.ADMIN &&
      (dto.departmentId !== undefined || dto.isPublic !== undefined || dto.isHighlighted !== undefined || dto.publicOrder !== undefined)
    ) {
      throw new ForbiddenException('Chỉ quản trị viên được đổi phòng ban hoặc cấu hình công khai');
    }
    const departmentId = dto.departmentId
      ? resolveDepartmentScope(actor, dto.departmentId)
      : target.departmentId;
    if (!departmentId) throw new BadRequestException('Phòng ban không hợp lệ');
    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
      if (!department || !department.isActive) {
        throw new BadRequestException('Phòng ban phụ trách không tồn tại hoặc đã ngừng hoạt động');
      }
    }

    const targetValue = dto.targetValue ?? target.targetValue;
    const direction = dto.direction ?? target.direction;
    const dueDate = dto.dueDate ? parsePlanningDueDate(dto.dueDate) : target.dueDate;
    const year = dto.year ?? target.year;
    const changesDefinition = (dto.title !== undefined && dto.title.trim() !== target.title)
      || (dto.unit !== undefined && dto.unit.trim() !== target.unit)
      || (dto.targetValue !== undefined && dto.targetValue !== target.targetValue)
      || (dto.weight !== undefined && dto.weight !== target.weight)
      || (dto.year !== undefined && dto.year !== target.year)
      || (dto.frequency !== undefined && dto.frequency !== target.frequency)
      || (dto.direction !== undefined && dto.direction !== target.direction)
      || departmentId !== target.departmentId
      || dueDate.getTime() !== target.dueDate.getTime();
    if (dueDate.getUTCFullYear() !== year) {
      throw new BadRequestException('Hạn hoàn thành phải thuộc cùng năm kế hoạch');
    }
    const evaluation = evaluateTarget({
      targetValue,
      currentValue: target.currentValue,
      direction,
      dueDate,
      riskThreshold: await this.riskThreshold(),
      hasReport: Boolean(target.lastReportedAt),
    });
    const {
      expectedVersion: _expectedVersion,
      expectedPublicationVersion: _expectedPublicationVersion,
      ...changes
    } = dto;
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (changesDefinition) {
          const historyCount = await tx.progressUpdate.count({ where: { targetId: id } });
          if (historyCount > 0) {
            throw new ConflictException(
              'Không thể đổi định nghĩa, hạn hoàn thành hoặc phòng ban của chỉ tiêu đã phát sinh báo cáo. Hãy tạo chỉ tiêu mới để giữ nguyên lịch sử đối soát.',
            );
          }
        }
        const changed = await tx.target.updateMany({
          where: {
            id,
            version: target.version,
            publicationVersion: target.publicationVersion,
            isArchived: false,
          },
          data: {
            ...changes,
            title: dto.title?.trim(),
            description: dto.description?.trim(),
            unit: dto.unit?.trim(),
            dueDate,
            departmentId,
            status: evaluation.status,
            version: changesDefinition ? { increment: 1 } : undefined,
            publicationVersion: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          throw new ConflictException('Chỉ tiêu vừa được người khác cập nhật. Vui lòng tải lại dữ liệu.');
        }
        const current = await tx.target.findUniqueOrThrow({ where: { id }, include: { department: true } });
        await audit(tx, actor, {
          action: 'TARGET_UPDATED',
          entityType: 'Target',
          entityId: id,
          departmentId,
          metadata: {
            code: current.code,
            previousVersion: target.version,
            version: current.version,
            previousPublicationVersion: target.publicationVersion,
            publicationVersion: current.publicationVersion,
          },
        });
        return current;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã chỉ tiêu đã tồn tại trong phòng ban và năm kế hoạch này');
      }
      if (isTargetConcurrencyError(error)) {
        throw new ConflictException('Dữ liệu chỉ tiêu vừa thay đổi. Vui lòng tải lại và thử lại.');
      }
      throw error;
    }
  }

  @Post(':id/archive')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async archive(@Req() req: any, @Param('id') id: string, @Body() dto: TargetLifecycleDto) {
    const actor = getActor(req);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const target = await tx.target.findUnique({ where: { id }, include: { department: true } });
        if (!target) throw new NotFoundException('Không tìm thấy chỉ tiêu');
        if (target.isArchived) throw new ConflictException('Chỉ tiêu này đã được lưu trữ');
        if (target.version !== dto.expectedVersion || target.publicationVersion !== dto.expectedPublicationVersion) {
          throw new ConflictException('Chỉ tiêu vừa được cập nhật. Vui lòng tải lại dữ liệu trước khi lưu trữ.');
        }
        const pendingUpdates = await tx.progressUpdate.count({
          where: { targetId: id, reviewStatus: ProgressReviewStatus.PENDING },
        });
        if (pendingUpdates > 0) {
          throw new ConflictException(`Chỉ tiêu còn ${pendingUpdates} báo cáo chờ duyệt. Hãy xử lý hết trước khi lưu trữ.`);
        }

        const archivedAt = new Date();
        const changed = await tx.target.updateMany({
          where: {
            id,
            version: target.version,
            publicationVersion: target.publicationVersion,
            isArchived: false,
          },
          data: {
            ...archiveTargetData(actor.id, dto.reason, archivedAt),
            version: { increment: 1 },
            publicationVersion: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          throw new ConflictException('Chỉ tiêu vừa được cập nhật. Vui lòng tải lại dữ liệu trước khi lưu trữ.');
        }
        const current = await tx.target.findUniqueOrThrow({ where: { id }, include: { department: true } });
        await audit(tx, actor, {
          action: 'TARGET_ARCHIVED',
          entityType: 'Target',
          entityId: id,
          departmentId: target.departmentId,
          metadata: {
            code: target.code,
            reason: dto.reason,
            previousVersion: target.version,
            version: current.version,
            previousPublicationVersion: target.publicationVersion,
            publicationVersion: current.publicationVersion,
            wasPublic: target.isPublic,
          },
        });
        return current;
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (isTargetConcurrencyError(error)) {
        throw new ConflictException('Dữ liệu chỉ tiêu vừa thay đổi. Vui lòng tải lại và thử lại.');
      }
      throw error;
    }
  }

  @Post(':id/unarchive')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async unarchive(@Req() req: any, @Param('id') id: string, @Body() dto: TargetLifecycleDto) {
    const actor = getActor(req);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const target = await tx.target.findUnique({ where: { id }, include: { department: true } });
        if (!target) throw new NotFoundException('Không tìm thấy chỉ tiêu');
        if (!target.isArchived) throw new ConflictException('Chỉ tiêu này đang hoạt động, không cần khôi phục');
        if (!target.department.isActive) {
          throw new ConflictException('Phòng ban phụ trách đã ngừng hoạt động. Hãy kích hoạt phòng ban trước khi khôi phục chỉ tiêu.');
        }
        if (target.version !== dto.expectedVersion || target.publicationVersion !== dto.expectedPublicationVersion) {
          throw new ConflictException('Chỉ tiêu vừa được cập nhật. Vui lòng tải lại dữ liệu trước khi khôi phục.');
        }

        const changed = await tx.target.updateMany({
          where: {
            id,
            version: target.version,
            publicationVersion: target.publicationVersion,
            isArchived: true,
          },
          data: {
            ...restoreTargetData(),
            version: { increment: 1 },
            publicationVersion: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          throw new ConflictException('Chỉ tiêu vừa được cập nhật. Vui lòng tải lại dữ liệu trước khi khôi phục.');
        }
        const current = await tx.target.findUniqueOrThrow({ where: { id }, include: { department: true } });
        await audit(tx, actor, {
          action: 'TARGET_UNARCHIVED',
          entityType: 'Target',
          entityId: id,
          departmentId: target.departmentId,
          metadata: {
            code: target.code,
            reason: dto.reason,
            previousArchiveReason: target.archiveReason,
            previousArchivedAt: target.archivedAt,
            previousVersion: target.version,
            version: current.version,
            previousPublicationVersion: target.publicationVersion,
            publicationVersion: current.publicationVersion,
          },
        });
        return current;
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (isTargetConcurrencyError(error)) {
        throw new ConflictException('Dữ liệu chỉ tiêu vừa thay đổi. Vui lòng tải lại và thử lại.');
      }
      throw error;
    }
  }

  @Post(':id/publish')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async publish(@Req() req: any, @Param('id') id: string) {
    const actor = getActor(req);
    const target = await this.prisma.target.findUnique({
      where: { id },
      include: { department: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy chỉ tiêu');
    if (target.isArchived) {
      throw new ConflictException('Chỉ tiêu đã được lưu trữ. Hãy khôi phục và kiểm tra lại trước khi công bố.');
    }
    if (!target.department.isActive) {
      throw new ConflictException('Phòng ban phụ trách đã ngừng hoạt động nên chỉ tiêu không thể được công bố');
    }
    if (!target.lastReportedAt) {
      throw new BadRequestException('Chỉ có thể công bố chỉ tiêu sau khi có số liệu chính thức');
    }
    const evaluation = evaluateTarget({
      targetValue: target.targetValue,
      currentValue: target.currentValue,
      direction: target.direction,
      dueDate: target.dueDate,
      riskThreshold: await this.riskThreshold(),
      hasReport: true,
    });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const changed = await tx.target.updateMany({
          where: {
            id,
            version: target.version,
            publicationVersion: target.publicationVersion,
            isArchived: false,
          },
          data: {
            isPublic: true,
            publishedValue: target.currentValue,
            publishedTargetValue: target.targetValue,
            publishedDirection: target.direction,
            publishedStatus: evaluation.status,
            publishedCode: target.code,
            publishedTitle: target.title,
            publishedDescription: target.description,
            publishedUnit: target.unit,
            publishedWeight: target.weight,
            publishedYear: target.year,
            publishedFrequency: target.frequency,
            publishedDueDate: target.dueDate,
            publishedDepartmentName: target.department.name,
            publishedDepartmentColor: target.department.color,
            publishedHighlighted: target.isHighlighted,
            publishedOrder: target.publicOrder,
            publishedAt: new Date(),
            publishedBy: actor.id,
            publicationVersion: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          throw new ConflictException('Số liệu vừa thay đổi. Vui lòng kiểm tra lại trước khi công bố.');
        }
        const published = await tx.target.findUniqueOrThrow({ where: { id }, include: { department: true } });
        await audit(tx, actor, {
          action: 'TARGET_PUBLISHED',
          entityType: 'Target',
          entityId: id,
          departmentId: target.departmentId,
          metadata: {
            code: target.code,
            previousVersion: target.version,
            version: published.version,
            previousPublicationVersion: target.publicationVersion,
            publicationVersion: published.publicationVersion,
            publishedValue: target.currentValue,
          },
        });
        return published;
      });
    } catch (error) {
      if (isTargetConcurrencyError(error)) {
        throw new ConflictException('Dữ liệu chỉ tiêu vừa thay đổi. Vui lòng tải lại và thử lại.');
      }
      throw error;
    }
  }

  @Post(':id/progress')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  async progress(@Param('id') id: string, @Body() dto: ProgressDto, @Req() req: any) {
    const actor = getActor(req);
    const target = await this.targetInScope(actor, id);
    if (!target) throw new NotFoundException('Không tìm thấy chỉ tiêu');
    if (target.isArchived) throw new ConflictException('Chỉ tiêu đã được lưu trữ và không còn nhận báo cáo mới');
    const baseVersion = dto.baseVersion;
    if (baseVersion !== target.version) {
      throw new ConflictException('Số liệu đã thay đổi. Vui lòng tải lại chỉ tiêu trước khi báo cáo.');
    }
    const departmentId = resolveDepartmentScope(actor);

    if (actor.role !== Role.ADMIN) {
      if (!dto.note?.trim()) {
        throw new BadRequestException('Vui lòng ghi rõ kỳ báo cáo hoặc nguồn số liệu');
      }
      try {
        const update = await this.prisma.$transaction(async (tx) => {
          const currentTarget = await tx.target.findFirst({
            where: {
              id,
              version: baseVersion,
              isArchived: false,
              ...(departmentId ? { departmentId } : {}),
            },
          });
          if (!currentTarget) {
            throw new ConflictException('Dữ liệu chỉ tiêu vừa thay đổi. Vui lòng tải lại trước khi gửi báo cáo.');
          }
          const existing = await tx.progressUpdate.findFirst({
            where: { targetId: id, userId: actor.id, reviewStatus: ProgressReviewStatus.PENDING },
          });
          if (existing) {
            throw new ConflictException('Bạn đã có một báo cáo đang chờ duyệt cho chỉ tiêu này');
          }
          const created = await tx.progressUpdate.create({
            data: {
              targetId: id,
              userId: actor.id,
              value: dto.value,
              note: dto.note!.trim(),
              baseVersion,
              reviewStatus: ProgressReviewStatus.PENDING,
            },
          });
          await audit(tx, actor, {
            action: 'PROGRESS_SUBMITTED',
            entityType: 'ProgressUpdate',
            entityId: created.id,
            departmentId: currentTarget.departmentId,
            metadata: { targetId: id, value: dto.value, baseVersion },
          });
          return created;
        }, { isolationLevel: 'Serializable' });
        return { reviewStatus: update.reviewStatus, message: 'Báo cáo đã được gửi và đang chờ duyệt', update };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Bạn đã có một báo cáo đang chờ duyệt cho chỉ tiêu này');
        }
        if (isTargetConcurrencyError(error)) {
          throw new ConflictException('Dữ liệu chỉ tiêu vừa thay đổi. Vui lòng tải lại trước khi gửi báo cáo.');
        }
        throw error;
      }
    }

    const riskThreshold = await this.riskThreshold();
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const currentTarget = await tx.target.findFirst({
          where: {
            id,
            version: baseVersion,
            isArchived: false,
            ...(departmentId ? { departmentId } : {}),
          },
        });
        if (!currentTarget) {
          throw new ConflictException('Dữ liệu chỉ tiêu vừa thay đổi. Vui lòng tải lại trước khi báo cáo.');
        }
        const evaluation = evaluateTarget({
          targetValue: currentTarget.targetValue,
          currentValue: dto.value,
          direction: currentTarget.direction,
          dueDate: currentTarget.dueDate,
          riskThreshold,
          hasReport: true,
        });
        const changed = await tx.target.updateMany({
          where: {
            id,
            version: baseVersion,
            isArchived: false,
            ...(departmentId ? { departmentId } : {}),
          },
          data: {
            currentValue: dto.value,
            status: evaluation.status,
            version: { increment: 1 },
            lastReportedAt: new Date(),
          },
        });
        if (changed.count !== 1) {
          throw new ConflictException('Số liệu vừa được người khác cập nhật. Vui lòng tải lại chỉ tiêu.');
        }
        await tx.progressUpdate.create({
          data: {
            targetId: id,
            userId: actor.id,
            value: dto.value,
            note: dto.note?.trim(),
            baseVersion,
            reviewStatus: ProgressReviewStatus.APPROVED,
            reviewedBy: actor.id,
            reviewedAt: new Date(),
          },
        });
        const current = await tx.target.findUniqueOrThrow({ where: { id }, include: { department: true } });
        await audit(tx, actor, {
          action: 'PROGRESS_APPROVED_DIRECTLY',
          entityType: 'Target',
          entityId: id,
          departmentId: currentTarget.departmentId,
          metadata: { value: dto.value, baseVersion, version: current.version },
        });
        return current;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return { reviewStatus: ProgressReviewStatus.APPROVED, target: updated };
    } catch (error) {
      if (isTargetConcurrencyError(error)) {
        throw new ConflictException('Dữ liệu chỉ tiêu vừa thay đổi. Vui lòng tải lại trước khi báo cáo.');
      }
      throw error;
    }
  }

  @Patch('updates/:updateId/review')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async review(@Req() req: any, @Param('updateId') updateId: string, @Body() dto: ReviewDto) {
    const actor = getActor(req);
    const departmentId = resolveDepartmentScope(actor);
    const update = await this.prisma.progressUpdate.findFirst({
      where: { id: updateId, ...(departmentId ? { target: { departmentId } } : {}) },
      include: { target: true },
    });
    if (!update) throw new NotFoundException('Không tìm thấy báo cáo chờ duyệt');
    if (update.reviewStatus !== ProgressReviewStatus.PENDING) {
      throw new ConflictException('Báo cáo này đã được xử lý');
    }
    if (update.userId === actor.id) {
      throw new ForbiddenException('Không được tự duyệt hoặc từ chối báo cáo do chính mình gửi');
    }

    if (dto.decision === 'REJECT') {
      if (!dto.reviewNote?.trim()) {
        throw new BadRequestException('Vui lòng ghi rõ lý do từ chối');
      }
      try {
        return await this.prisma.$transaction(async (tx) => {
          const changed = await tx.progressUpdate.updateMany({
            where: { id: updateId, reviewStatus: ProgressReviewStatus.PENDING },
            data: {
              reviewStatus: ProgressReviewStatus.REJECTED,
              reviewedBy: actor.id,
              reviewedAt: new Date(),
              reviewNote: dto.reviewNote!.trim(),
            },
          });
          if (changed.count !== 1) throw new ConflictException('Báo cáo này vừa được người khác xử lý');
          await audit(tx, actor, {
            action: 'PROGRESS_REJECTED',
            entityType: 'ProgressUpdate',
            entityId: updateId,
            departmentId: update.target.departmentId,
            metadata: { targetId: update.targetId, reviewNote: dto.reviewNote },
          });
          await refreshImportBatchStatus(tx, update.importBatchId);
          return tx.progressUpdate.findUniqueOrThrow({ where: { id: updateId } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (isTargetConcurrencyError(error)) {
          throw new ConflictException('Báo cáo vừa được xử lý đồng thời. Vui lòng tải lại dữ liệu và thử lại');
        }
        throw error;
      }
    }

    if (update.baseVersion !== update.target.version) {
      throw new ConflictException('Chỉ tiêu đã có số liệu mới. Hãy đối chiếu và yêu cầu người gửi báo cáo lại.');
    }
    const evaluation = evaluateTarget({
      targetValue: update.target.targetValue,
      currentValue: update.value,
      direction: update.target.direction,
      dueDate: update.target.dueDate,
      riskThreshold: await this.riskThreshold(),
      hasReport: true,
    });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const targetChanged = await tx.target.updateMany({
          where: { id: update.targetId, version: update.baseVersion },
          data: {
            currentValue: update.value,
            status: evaluation.status,
            version: { increment: 1 },
            lastReportedAt: new Date(),
          },
        });
        if (targetChanged.count !== 1) {
          throw new ConflictException('Chỉ tiêu vừa có số liệu mới. Hãy yêu cầu người gửi báo cáo lại.');
        }
        const reviewChanged = await tx.progressUpdate.updateMany({
          where: { id: updateId, reviewStatus: ProgressReviewStatus.PENDING },
          data: {
            reviewStatus: ProgressReviewStatus.APPROVED,
            reviewedBy: actor.id,
            reviewedAt: new Date(),
            reviewNote: dto.reviewNote?.trim(),
          },
        });
        if (reviewChanged.count !== 1) throw new ConflictException('Báo cáo này vừa được người khác xử lý');
        const target = await tx.target.findUniqueOrThrow({ where: { id: update.targetId } });
        const progressUpdate = await tx.progressUpdate.findUniqueOrThrow({ where: { id: updateId } });
        await audit(tx, actor, {
          action: 'PROGRESS_APPROVED',
          entityType: 'ProgressUpdate',
          entityId: updateId,
          departmentId: update.target.departmentId,
          metadata: { targetId: update.targetId, value: update.value, version: target.version },
        });
        await refreshImportBatchStatus(tx, update.importBatchId);
        return { target, progressUpdate };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isTargetConcurrencyError(error)) {
        throw new ConflictException('Báo cáo vừa được xử lý đồng thời. Vui lòng tải lại dữ liệu và thử lại');
      }
      throw error;
    }
  }
}
