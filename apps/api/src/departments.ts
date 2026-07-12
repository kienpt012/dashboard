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
import { Prisma, Role } from '@prisma/client';
import { IsBoolean, IsHexColor, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { audit, getActor, resolveDepartmentScope } from './access';

class CreateDepartmentDto {
  @IsString({ message: 'Mã phòng ban không hợp lệ' })
  @MinLength(2, { message: 'Mã phòng ban phải có ít nhất 2 ký tự' })
  @MaxLength(30, { message: 'Mã phòng ban không được vượt quá 30 ký tự' })
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Mã phòng ban chỉ được chứa chữ, số, dấu gạch ngang và gạch dưới' })
  code!: string;

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

class UpdateDepartmentDto {
  @IsOptional()
  @IsString({ message: 'Mã phòng ban không hợp lệ' })
  @MinLength(2, { message: 'Mã phòng ban phải có ít nhất 2 ký tự' })
  @MaxLength(30, { message: 'Mã phòng ban không được vượt quá 30 ký tự' })
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Mã phòng ban chỉ được chứa chữ, số, dấu gạch ngang và gạch dưới' })
  code?: string;

  @IsOptional()
  @IsString({ message: 'Tên phòng ban không hợp lệ' })
  @MinLength(2, { message: 'Tên phòng ban phải có ít nhất 2 ký tự' })
  @MaxLength(160, { message: 'Tên phòng ban không được vượt quá 160 ký tự' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Mô tả phòng ban không hợp lệ' })
  @MaxLength(1000, { message: 'Mô tả phòng ban không được vượt quá 1000 ký tự' })
  description?: string;

  @IsOptional()
  @IsHexColor({ message: 'Màu nhận diện phải là mã màu HEX hợp lệ' })
  color?: string;

  @IsOptional()
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
      include: { _count: { select: { users: true, targets: true } } },
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
      include: { _count: { select: { users: true, targets: true } } },
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async create(@Body() dto: CreateDepartmentDto, @Req() req: any) {
    const actor = getActor(req);
    try {
      const department = await this.prisma.department.create({
        data: {
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description?.trim() || undefined,
          color: dto.color,
        },
      });
      await audit(this.prisma, actor, {
        action: 'DEPARTMENT_CREATED',
        entityType: 'Department',
        entityId: department.id,
        departmentId: department.id,
        metadata: { code: department.code, name: department.name },
      });
      return department;
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
      const department = await this.prisma.department.update({
        where: { id },
        data: {
          ...(dto.code === undefined ? {} : { code: dto.code.trim().toUpperCase() }),
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.description === undefined ? {} : { description: dto.description.trim() || null }),
          ...(dto.color === undefined ? {} : { color: dto.color }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        },
      });
      await audit(this.prisma, actor, {
        action: 'DEPARTMENT_UPDATED',
        entityType: 'Department',
        entityId: department.id,
        departmentId: department.id,
        metadata: {
          changedFields: Object.keys(dto),
          previousActive: existing.isActive,
          currentActive: department.isActive,
        },
      });
      return department;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã phòng ban đã tồn tại');
      }
      throw error;
    }
  }
}
