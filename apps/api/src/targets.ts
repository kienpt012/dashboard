import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { TargetFrequency, TargetStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard, Roles, RolesGuard } from './common';

class TargetDto {
  @IsString() code!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() unit!: string;
  @IsNumber() targetValue!: number;
  @IsOptional() @IsNumber() currentValue?: number;
  @IsOptional() @IsNumber() @Min(0.1) @Max(10) weight?: number;
  @IsInt() year!: number;
  @IsEnum(TargetFrequency) frequency!: TargetFrequency;
  @IsOptional() @IsEnum(TargetStatus) status?: TargetStatus;
  @IsDateString() dueDate!: string;
  @IsString() departmentId!: string;
}
class ProgressDto { @IsNumber() value!: number; @IsOptional() @IsString() note?: string; }

@Controller('targets') @UseGuards(JwtAuthGuard)
export class TargetsController {
  constructor(private prisma: PrismaService) {}
  @Get()
  async list(@Query('year') yearRaw?: string, @Query('status') status?: TargetStatus, @Query('departmentId') departmentId?: string, @Query('search') search?: string) {
    const year = yearRaw ? Number(yearRaw) : undefined;
    return this.prisma.target.findMany({
      where: { year: year || undefined, status: status || undefined, departmentId: departmentId || undefined, OR: search ? [{ title: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] : undefined },
      include: { department: true, updates: { take: 3, orderBy: { createdAt: 'desc' }, include: { user: { select: { fullName: true } } } } },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    });
  }
  @Post() @UseGuards(RolesGuard) @Roles('ADMIN', 'MANAGER') create(@Body() dto: TargetDto) { return this.prisma.target.create({ data: { ...dto, dueDate: new Date(dto.dueDate) }, include: { department: true } }); }
  @Patch(':id') @UseGuards(RolesGuard) @Roles('ADMIN', 'MANAGER') update(@Param('id') id: string, @Body() dto: Partial<TargetDto>) {
    return this.prisma.target.update({ where: { id }, data: { ...dto, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined }, include: { department: true } });
  }
  @Post(':id/progress') @UseGuards(RolesGuard) @Roles('ADMIN', 'MANAGER', 'STAFF')
  async progress(@Param('id') id: string, @Body() dto: ProgressDto, @Req() req: any) {
    const target = await this.prisma.target.findUniqueOrThrow({ where: { id } });
    const percent = target.targetValue ? dto.value / target.targetValue * 100 : 0;
    const status = percent >= 100 ? TargetStatus.COMPLETED : new Date(target.dueDate) < new Date() ? TargetStatus.OVERDUE : percent >= 70 ? TargetStatus.ON_TRACK : TargetStatus.AT_RISK;
    return this.prisma.$transaction(async tx => {
      await tx.progressUpdate.create({ data: { targetId: id, userId: req.user.id, value: dto.value, note: dto.note } });
      return tx.target.update({ where: { id }, data: { currentValue: dto.value, status }, include: { department: true } });
    });
  }
}
