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
import { Prisma, Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { audit, getActor } from './access';

const normalizeOptionalText = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

class CreateUserDto {
  @IsString({ message: 'Tên đăng nhập không hợp lệ' })
  @MinLength(3, { message: 'Tên đăng nhập phải có ít nhất 3 ký tự' })
  @MaxLength(50, { message: 'Tên đăng nhập không được vượt quá 50 ký tự' })
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'Tên đăng nhập chỉ được chứa chữ, số, dấu chấm, gạch ngang và gạch dưới' })
  username!: string;

  @IsString({ message: 'Mật khẩu không hợp lệ' })
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @MaxLength(128, { message: 'Mật khẩu không được vượt quá 128 ký tự' })
  password!: string;

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

class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'Họ và tên không hợp lệ' })
  @MinLength(2, { message: 'Họ và tên phải có ít nhất 2 ký tự' })
  @MaxLength(160, { message: 'Họ và tên không được vượt quá 160 ký tự' })
  fullName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(180, { message: 'Email không được vượt quá 180 ký tự' })
  email?: string | null;

  @IsOptional()
  @IsEnum(Role, { message: 'Vai trò người dùng không hợp lệ' })
  role?: Role;

  @IsOptional()
  @IsString({ message: 'Phòng ban không hợp lệ' })
  departmentId?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'Trạng thái tài khoản không hợp lệ' })
  isActive?: boolean;

  @IsOptional()
  @IsString({ message: 'Mật khẩu không hợp lệ' })
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @MaxLength(128, { message: 'Mật khẩu không được vượt quá 128 ký tự' })
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
    await this.ensureDepartment(dto.role, dto.departmentId);
    try {
      const user = await this.prisma.user.create({
        data: {
          username: dto.username.trim().toLowerCase(),
          passwordHash: await bcrypt.hash(dto.password, 10),
          fullName: dto.fullName.trim(),
          email: dto.email?.trim().toLowerCase(),
          role: dto.role,
          departmentId: dto.departmentId,
        },
        select: safeUserSelect,
      });
      await audit(this.prisma, actor, {
        action: 'USER_CREATED',
        entityType: 'User',
        entityId: user.id,
        departmentId: user.departmentId,
        metadata: { username: user.username, role: user.role },
      });
      return user;
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: any) {
    const actor = getActor(req);
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Không tìm thấy tài khoản');

    const nextRole = dto.role ?? existing.role;
    const nextDepartmentId = dto.departmentId === undefined ? existing.departmentId : dto.departmentId;
    await this.ensureDepartment(nextRole, nextDepartmentId);
    if (id === actor.id && (dto.isActive === false || nextRole !== Role.ADMIN)) {
      throw new ForbiddenException('Bạn không thể tự khóa hoặc hạ quyền tài khoản đang đăng nhập');
    }
    if (existing.role === Role.ADMIN && (dto.isActive === false || nextRole !== Role.ADMIN)) {
      const activeAdmins = await this.prisma.user.count({ where: { role: Role.ADMIN, isActive: true } });
      if (activeAdmins <= 1) throw new ConflictException('Hệ thống phải còn ít nhất một quản trị viên đang hoạt động');
    }

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          ...(dto.fullName === undefined ? {} : { fullName: dto.fullName.trim() }),
          ...(dto.email === undefined ? {} : { email: dto.email?.trim().toLowerCase() || null }),
          ...(dto.role === undefined ? {} : { role: dto.role }),
          ...(dto.departmentId === undefined ? {} : { departmentId: dto.departmentId }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          ...(dto.password === undefined ? {} : { passwordHash: await bcrypt.hash(dto.password, 10) }),
        },
        select: safeUserSelect,
      });
      await audit(this.prisma, actor, {
        action: 'USER_UPDATED',
        entityType: 'User',
        entityId: user.id,
        departmentId: user.departmentId,
        metadata: {
          changedFields: Object.keys(dto).filter(field => field !== 'password'),
          passwordReset: dto.password !== undefined,
          previousRole: existing.role,
          currentRole: user.role,
        },
      });
      return user;
    } catch (error) {
      this.rethrowConflict(error);
    }
  }
}
