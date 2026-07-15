import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
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
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Min,
  ValidateIf,
} from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { audit, getActor } from './access';

const normalizeOptionalText = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;
const Trim = () => Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);
const ValidateIfDefined = () => ValidateIf((_object, value) => value !== undefined);
const ValidateIfDefinedAndNotNull = () => ValidateIf(
  (_object, value) => value !== undefined && value !== null,
);

class CreateUserDto {
  @Trim()
  @IsString({ message: 'Tên đăng nhập không hợp lệ' })
  @MinLength(3, { message: 'Tên đăng nhập phải có ít nhất 3 ký tự' })
  @MaxLength(50, { message: 'Tên đăng nhập không được vượt quá 50 ký tự' })
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'Tên đăng nhập chỉ được chứa chữ, số, dấu chấm, gạch ngang và gạch dưới' })
  username!: string;

  @IsString({ message: 'Mật khẩu không hợp lệ' })
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @MaxLength(128, { message: 'Mật khẩu không được vượt quá 128 ký tự' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'Mật khẩu cần có chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  password!: string;

  @Trim()
  @IsString({ message: 'Họ và tên không hợp lệ' })
  @MinLength(2, { message: 'Họ và tên phải có ít nhất 2 ký tự' })
  @MaxLength(160, { message: 'Họ và tên không được vượt quá 160 ký tự' })
  fullName!: string;

  @IsOptional()
  @Transform(normalizeOptionalText)
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(180, { message: 'Email không được vượt quá 180 ký tự' })
  email?: string;

  @IsEnum(Role, { message: 'Vai trò người dùng không hợp lệ' })
  role!: Role;

  @IsOptional()
  @Transform(normalizeOptionalText)
  @IsString({ message: 'Phòng ban không hợp lệ' })
  departmentId?: string;
}

export class UpdateUserDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ValidateIfDefined()
  @Trim()
  @IsString({ message: 'Họ và tên không hợp lệ' })
  @MinLength(2, { message: 'Họ và tên phải có ít nhất 2 ký tự' })
  @MaxLength(160, { message: 'Họ và tên không được vượt quá 160 ký tự' })
  fullName?: string;

  @ValidateIfDefinedAndNotNull()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(180, { message: 'Email không được vượt quá 180 ký tự' })
  email?: string | null;

  @ValidateIfDefined()
  @IsEnum(Role, { message: 'Vai trò người dùng không hợp lệ' })
  role?: Role;

  @ValidateIfDefinedAndNotNull()
  @IsString({ message: 'Phòng ban không hợp lệ' })
  departmentId?: string | null;

  @ValidateIfDefined()
  @IsBoolean({ message: 'Trạng thái tài khoản không hợp lệ' })
  isActive?: boolean;

  @ValidateIfDefined()
  @IsString({ message: 'Mật khẩu không hợp lệ' })
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @MaxLength(128, { message: 'Mật khẩu không được vượt quá 128 ký tự' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'Mật khẩu cần có chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  password?: string;
}

const safeUserSelect = {
  id: true,
  username: true,
  fullName: true,
  email: true,
  role: true,
  isActive: true,
  departmentId: true,
  department: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
  version: true,
} satisfies Prisma.UserSelect;

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private prisma: PrismaService) {}

  private async ensureDepartment(role: Role, departmentId?: string | null) {
    if (role !== Role.ADMIN && !departmentId) {
      throw new ConflictException('Vai trò này bắt buộc phải được gắn với một phòng ban');
    }
    if (!departmentId) return;
    const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) throw new NotFoundException('Không tìm thấy phòng ban được chọn');
    if (!department.isActive) throw new ConflictException('Không thể gắn tài khoản vào phòng ban đã ngừng hoạt động');
  }

  private rethrowConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const fields = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target || '');
      if (fields.includes('email')) throw new ConflictException('Email đã được sử dụng');
      throw new ConflictException('Tên đăng nhập đã tồn tại');
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      throw new ConflictException('Dữ liệu tài khoản vừa được thay đổi. Vui lòng tải lại và thử lại');
    }
    throw error;
  }

  @Get()
  list() {
    return this.prisma.user.findMany({
      select: safeUserSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(@Body() dto: CreateUserDto, @Req() req: any) {
    const actor = getActor(req);
    const departmentId = dto.role === Role.ADMIN ? null : dto.departmentId;
    await this.ensureDepartment(dto.role, departmentId);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    try {
      return await this.prisma.$transaction(async tx => {
        const user = await tx.user.create({
          data: {
            username: dto.username.trim().toLowerCase(),
            passwordHash,
            fullName: dto.fullName.trim(),
            email: dto.email?.trim().toLowerCase(),
            role: dto.role,
            departmentId,
          },
          select: safeUserSelect,
        });
        await audit(tx, actor, {
          action: 'USER_CREATED',
          entityType: 'User',
          entityId: user.id,
          departmentId: user.departmentId,
          metadata: { username: user.username, role: user.role },
        });
        return user;
      });
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: any) {
    const actor = getActor(req);
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Không tìm thấy tài khoản');
    if (existing.version !== dto.expectedVersion) throw new ConflictException('Tài khoản vừa được người khác cập nhật. Vui lòng tải lại.');

    const nextRole = dto.role ?? existing.role;
    const nextDepartmentId = nextRole === Role.ADMIN
      ? null
      : (dto.departmentId === undefined ? existing.departmentId : dto.departmentId);
    await this.ensureDepartment(nextRole, nextDepartmentId);
    if (id === actor.id && (dto.isActive === false || nextRole !== Role.ADMIN)) {
      throw new ForbiddenException('Bạn không thể tự khóa hoặc hạ quyền tài khoản đang đăng nhập');
    }
    if (id === actor.id && dto.password !== undefined) {
      throw new ForbiddenException('Hãy đổi mật khẩu của bạn tại Hồ sơ & bảo mật bằng mật khẩu hiện tại');
    }
    const passwordHash = dto.password === undefined ? undefined : await bcrypt.hash(dto.password, 10);
    const scopeChanged = dto.role !== undefined || dto.departmentId !== undefined;
    const accessChanged =
      (dto.isActive !== undefined && dto.isActive !== existing.isActive)
      || (dto.role !== undefined && dto.role !== existing.role)
      || (scopeChanged && nextDepartmentId !== existing.departmentId);
    const remainsEligibleAssignee =
      (dto.isActive ?? existing.isActive)
      && ([Role.MANAGER, Role.STAFF] as Role[]).includes(nextRole)
      && nextDepartmentId === existing.departmentId;

    try {
      return await this.prisma.$transaction(async tx => {
        const removesActiveAdmin = existing.role === Role.ADMIN
          && existing.isActive
          && ((dto.isActive ?? existing.isActive) === false || nextRole !== Role.ADMIN);
        if (removesActiveAdmin) {
          const activeAdmins = await tx.user.count({ where: { role: Role.ADMIN, isActive: true } });
          if (activeAdmins <= 1) throw new ConflictException('Hệ thống phải còn ít nhất một quản trị viên đang hoạt động');
        }
        if (!remainsEligibleAssignee) {
          const assignedOpenFeedbacks = await tx.feedback.count({
            where: {
              assignedToId: id,
              status: {
                in: [
                  FeedbackStatus.RECEIVED,
                  FeedbackStatus.ASSIGNED,
                  FeedbackStatus.IN_PROGRESS,
                  FeedbackStatus.WAITING_CITIZEN,
                  FeedbackStatus.PENDING_REVIEW,
                  FeedbackStatus.REOPENED,
                ],
              },
            },
          });
          if (assignedOpenFeedbacks > 0) {
            throw new ConflictException(
              `Tài khoản còn ${assignedOpenFeedbacks} phản ánh đang xử lý. Hãy phân công lại trước khi khóa, đổi vai trò hoặc chuyển phòng ban.`,
            );
          }
        }
        const changed = await tx.user.updateMany({
          where: { id, version: dto.expectedVersion },
          data: {
            ...(dto.fullName === undefined ? {} : { fullName: dto.fullName.trim() }),
            ...(dto.email === undefined ? {} : { email: dto.email?.trim().toLowerCase() || null }),
            ...(dto.role === undefined ? {} : { role: dto.role }),
            ...(dto.role === undefined && dto.departmentId === undefined ? {} : { departmentId: nextDepartmentId }),
            ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
            ...(passwordHash === undefined ? {} : { passwordHash }),
            ...(!accessChanged && passwordHash === undefined ? {} : { tokenVersion: { increment: 1 } }),
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new ConflictException('Tài khoản vừa được người khác cập nhật. Vui lòng tải lại.');
        const user = await tx.user.findUniqueOrThrow({ where: { id }, select: safeUserSelect });
        await audit(tx, actor, {
          action: 'USER_UPDATED',
          entityType: 'User',
          entityId: user.id,
          departmentId: user.departmentId,
          metadata: {
            changedFields: Object.keys(dto).filter(field => field !== 'password' && field !== 'expectedVersion'),
            passwordReset: dto.password !== undefined,
            previousRole: existing.role,
            currentRole: user.role,
          },
        });
        return user;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowConflict(error);
    }
  }
}
