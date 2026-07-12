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
} from 'class-validator';
import { type Actor, audit, getActor, resolveDepartmentScope } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { evaluateTarget } from './metrics';
import { PrismaService } from './prisma.service';

class CreateTargetDto {
  @IsString() @MinLength(3) @MaxLength(50) @Matches(/^[A-Za-z0-9._-]+$/) code!: string;
  @IsString() @MinLength(3) @MaxLength(300) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsString() @MinLength(1) @MaxLength(50) unit!: string;
  @IsNumber() @Min(0) targetValue!: number;
  @IsOptional() @IsNumber() @Min(0.1) @Max(10) weight?: number;
  @IsInt() @Min(2000) @Max(2100) year!: number;
  @IsEnum(TargetFrequency) frequency!: TargetFrequency;
  @IsOptional() @IsEnum(TargetDirection) direction?: TargetDirection;
  @IsDateString() dueDate!: string;
  @IsString() departmentId!: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsBoolean() isHighlighted?: boolean;
  @IsOptional() @IsInt() @Min(0) publicOrder?: number;
}

class UpdateTargetDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() targetValue?: number;
  @IsOptional() @IsNumber() @Min(0.1) @Max(10) weight?: number;
  @IsOptional() @IsInt() @Min(2000) @Max(2100) year?: number;
  @IsOptional() @IsEnum(TargetFrequency) frequency?: TargetFrequency;
  @IsOptional() @IsEnum(TargetDirection) direction?: TargetDirection;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsBoolean() isHighlighted?: boolean;
  @IsOptional() @IsInt() @Min(0) publicOrder?: number;
  @IsInt() @Min(1) expectedVersion!: number;
}

class ProgressDto {
  @IsNumber() @Min(0) value!: number;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsInt() @Min(1) baseVersion!: number;
}

class ReviewDto {
  @IsIn(['APPROVE', 'REJECT']) decision!: 'APPROVE' | 'REJECT';
  @IsOptional() @IsString() reviewNote?: string;
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

    const [targets, riskThreshold] = await Promise.all([
      this.prisma.target.findMany({
        where: {
          year,
          departmentId,
          OR: search
            ? [
                { title: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
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
      where: { reviewStatus: ProgressReviewStatus.PENDING, target: { departmentId } },
      include: {
        target: { include: { department: true } },
        user: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return updates.map(update => ({ ...update, canReview: update.userId !== actor.id }));
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async create(@Req() req: any, @Body() dto: CreateTargetDto) {
    const actor = getActor(req);
    const departmentId = resolveDepartmentScope(actor, dto.departmentId);
    if (!departmentId) throw new BadRequestException('Vui lòng chọn phòng ban phụ trách');
    if (new Date(dto.dueDate).getUTCFullYear() !== dto.year) {
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
      dueDate: new Date(dto.dueDate),
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
        throw new ConflictException('Mã chỉ tiêu đã tồn tại');
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
    if (dto.expectedVersion !== target.version) {
      throw new ConflictException('Chỉ tiêu đã được cập nhật. Vui lòng tải lại dữ liệu trước khi sửa.');
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
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : target.dueDate;
    const year = dto.year ?? target.year;
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
    const { expectedVersion: _expectedVersion, ...changes } = dto;
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.target.updateMany({
        where: { id, version: target.version },
        data: {
          ...changes,
          title: dto.title?.trim(),
          description: dto.description?.trim(),
          unit: dto.unit?.trim(),
          dueDate,
          departmentId,
          status: evaluation.status,
          version: { increment: 1 },
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
        metadata: { code: current.code, previousVersion: target.version, version: current.version },
      });
      return current;
    });
    return updated;
  }

  @Post(':id/publish')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async publish(@Req() req: any, @Param('id') id: string) {
    const actor = getActor(req);
    const target = await this.prisma.target.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Không tìm thấy chỉ tiêu');
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
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.target.updateMany({
        where: { id, version: target.version },
        data: {
          isPublic: true,
          publishedValue: target.currentValue,
          publishedTargetValue: target.targetValue,
          publishedDirection: target.direction,
          publishedStatus: evaluation.status,
          publishedAt: new Date(),
          publishedBy: actor.id,
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
        metadata: { code: target.code, version: target.version, publishedValue: target.currentValue },
      });
      return published;
    });
  }

  @Post(':id/progress')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  async progress(@Param('id') id: string, @Body() dto: ProgressDto, @Req() req: any) {
    const actor = getActor(req);
    const target = await this.targetInScope(actor, id);
    if (!target) throw new NotFoundException('Không tìm thấy chỉ tiêu');
    const baseVersion = dto.baseVersion;
    if (baseVersion !== target.version) {
      throw new ConflictException('Số liệu đã thay đổi. Vui lòng tải lại chỉ tiêu trước khi báo cáo.');
    }

    if (actor.role !== Role.ADMIN) {
      if (!dto.note?.trim()) {
        throw new BadRequestException('Vui lòng ghi rõ kỳ báo cáo hoặc nguồn số liệu');
      }
      try {
        const update = await this.prisma.$transaction(async (tx) => {
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
            departmentId: target.departmentId,
            metadata: { targetId: id, value: dto.value, baseVersion },
          });
          return created;
        }, { isolationLevel: 'Serializable' });
        return { reviewStatus: update.reviewStatus, message: 'Báo cáo đã được gửi và đang chờ duyệt', update };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034')) {
          throw new ConflictException('Bạn đã có một báo cáo đang chờ duyệt cho chỉ tiêu này');
        }
        throw error;
      }
    }

    const evaluation = evaluateTarget({
      targetValue: target.targetValue,
      currentValue: dto.value,
      direction: target.direction,
      dueDate: target.dueDate,
      riskThreshold: await this.riskThreshold(),
      hasReport: true,
    });
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.target.updateMany({
        where: { id, version: baseVersion },
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
        departmentId: target.departmentId,
        metadata: { value: dto.value, baseVersion, version: current.version },
      });
      return current;
    });
    return { reviewStatus: ProgressReviewStatus.APPROVED, target: updated };
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
      return this.prisma.$transaction(async (tx) => {
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
        return tx.progressUpdate.findUniqueOrThrow({ where: { id: updateId } });
      });
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
    const approved = await this.prisma.$transaction(async (tx) => {
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
      return { target, progressUpdate };
    }, { isolationLevel: 'Serializable' });
    return approved;
  }
}
