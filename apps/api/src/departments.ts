import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FeedbackStatus, Prisma, Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsHexColor, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { audit, getActor, resolveDepartmentScope } from './access';

const Trim = () => Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);
const ValidateIfDefined = () => ValidateIf((_object, value) => value !== undefined);

class CreateDepartmentDto {
  @Trim()
  @IsString({ message: 'Mã phòng ban không hợp lệ' })
  @MinLength(2, { message: 'Mã phòng ban phải có ít nhất 2 ký tự' })
  @MaxLength(30, { message: 'Mã phòng ban không được vượt quá 30 ký tự' })
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Mã phòng ban chỉ được chứa chữ, số, dấu gạch ngang và gạch dưới' })
  code!: string;

  @Trim()
  @IsString({ message: 'Tên phòng ban không hợp lệ' })
  @MinLength(2, { message: 'Tên phòng ban phải có ít nhất 2 ký tự' })
  @MaxLength(160, { message: 'Tên phòng ban không được vượt quá 160 ký tự' })
  name!: string;

  @IsOptional()
  @IsString({ message: 'Mô tả phòng ban không hợp lệ' })
  @MaxLength(1000, { message: 'Mô tả phòng ban không được vượt quá 1000 ký tự' })
  description?: string;

  @IsOptional()
  @IsHexColor({ message: 'Màu nhận diện phải là mã màu HEX hợp lệ' })
  color?: string;
}

export class UpdateDepartmentDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ValidateIfDefined()
  @Trim()
  @IsString({ message: 'Mã phòng ban không hợp lệ' })
  @MinLength(2, { message: 'Mã phòng ban phải có ít nhất 2 ký tự' })
  @MaxLength(30, { message: 'Mã phòng ban không được vượt quá 30 ký tự' })
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Mã phòng ban chỉ được chứa chữ, số, dấu gạch ngang và gạch dưới' })
  code?: string;

  @ValidateIfDefined()
  @Trim()
  @IsString({ message: 'Tên phòng ban không hợp lệ' })
  @MinLength(2, { message: 'Tên phòng ban phải có ít nhất 2 ký tự' })
  @MaxLength(160, { message: 'Tên phòng ban không được vượt quá 160 ký tự' })
  name?: string;

  @ValidateIfDefined()
  @IsString({ message: 'Mô tả phòng ban không hợp lệ' })
  @MaxLength(1000, { message: 'Mô tả phòng ban không được vượt quá 1000 ký tự' })
  description?: string;

  @ValidateIfDefined()
  @IsHexColor({ message: 'Màu nhận diện phải là mã màu HEX hợp lệ' })
  color?: string;

  @ValidateIfDefined()
  @IsBoolean({ message: 'Trạng thái phòng ban không hợp lệ' })
  isActive?: boolean;
}

@Controller('departments')
@UseGuards(JwtAuthGuard)
export class DepartmentsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Req() req: any) {
    const actor = getActor(req);
    const departmentId = resolveDepartmentScope(actor);
    return this.prisma.department.findMany({
      where: departmentId ? { id: departmentId } : undefined,
      include: { _count: { select: { users: true, targets: { where: { isArchived: false } }, feedbacks: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Get('me')
  async me(@Req() req: any) {
    const actor = getActor(req);
    const departmentId = resolveDepartmentScope(actor);
    if (!departmentId) {
      throw new NotFoundException('Quản trị viên không thuộc một phòng ban cố định');
    }
    return this.prisma.department.findUniqueOrThrow({
      where: { id: departmentId },
      include: { _count: { select: { users: true, targets: { where: { isArchived: false } }, feedbacks: true } } },
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async create(@Body() dto: CreateDepartmentDto, @Req() req: any) {
    const actor = getActor(req);
    try {
      return await this.prisma.$transaction(async tx => {
        const department = await tx.department.create({
          data: {
            code: dto.code.trim().toUpperCase(),
            name: dto.name.trim(),
            description: dto.description?.trim() || undefined,
            color: dto.color,
          },
        });
        await audit(tx, actor, {
          action: 'DEPARTMENT_CREATED',
          entityType: 'Department',
          entityId: department.id,
          departmentId: department.id,
          metadata: { code: department.code, name: department.name },
        });
        return department;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã phòng ban đã tồn tại');
      }
      throw error;
    }
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto, @Req() req: any) {
    const actor = getActor(req);
    const existing = await this.prisma.department.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Không tìm thấy phòng ban');
    try {
      return await this.prisma.$transaction(async tx => {
        const current = await tx.department.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Không tìm thấy phòng ban');
        if (current.version !== dto.expectedVersion) throw new ConflictException('Phòng ban vừa được người khác cập nhật. Vui lòng tải lại.');
        if (current.isActive && dto.isActive === false) {
          const openStatuses: FeedbackStatus[] = [
            FeedbackStatus.RECEIVED,
            FeedbackStatus.ASSIGNED,
            FeedbackStatus.IN_PROGRESS,
            FeedbackStatus.WAITING_CITIZEN,
            FeedbackStatus.PENDING_REVIEW,
            FeedbackStatus.REOPENED,
          ];
          const [activeUsers, targets, openFeedbacks] = await Promise.all([
            tx.user.count({ where: { departmentId: id, isActive: true } }),
            tx.target.count({ where: { departmentId: id, isArchived: false } }),
            tx.feedback.count({
              where: {
                departmentId: id,
                OR: [
                  { status: { in: openStatuses } },
                  { reopenRequestedAt: { not: null } },
                ],
              },
            }),
          ]);
          if (activeUsers || targets || openFeedbacks) {
            throw new ConflictException({
              message: 'Không thể ngừng phòng ban khi còn dữ liệu đang vận hành. Hãy chuyển hoặc khóa tài khoản, chuyển chỉ tiêu và xử lý xong phản ánh trước.',
              impact: { activeUsers, targets, openFeedbacks },
            });
          }
        }
        const changed = await tx.department.updateMany({
          where: { id, version: dto.expectedVersion },
          data: {
            ...(dto.code === undefined ? {} : { code: dto.code.trim().toUpperCase() }),
            ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
            ...(dto.description === undefined ? {} : { description: dto.description.trim() || null }),
            ...(dto.color === undefined ? {} : { color: dto.color }),
            ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new ConflictException('Phòng ban vừa được người khác cập nhật. Vui lòng tải lại.');
        const department = await tx.department.findUniqueOrThrow({ where: { id } });
        await audit(tx, actor, {
          action: 'DEPARTMENT_UPDATED',
          entityType: 'Department',
          entityId: department.id,
          departmentId: department.id,
          metadata: {
            changedFields: Object.keys(dto).filter(field => field !== 'expectedVersion'),
            previousActive: current.isActive,
            currentActive: department.isActive,
          },
        });
        return department;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã phòng ban đã tồn tại');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('Phòng ban vừa được cập nhật bởi thao tác khác. Vui lòng tải lại và thử lại');
      }
      throw error;
    }
  }
}
