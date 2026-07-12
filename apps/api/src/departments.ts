import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsHexColor, IsOptional, IsString } from 'class-validator';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard, Roles, RolesGuard } from './common';

class DepartmentDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsHexColor() color?: string;
}

@Controller('departments') @UseGuards(JwtAuthGuard)
export class DepartmentsController {
  constructor(private prisma: PrismaService) {}
  @Get() list() { return this.prisma.department.findMany({ include: { _count: { select: { users: true, targets: true } } }, orderBy: { name: 'asc' } }); }
  @Post() @UseGuards(RolesGuard) @Roles('ADMIN') create(@Body() dto: DepartmentDto) { return this.prisma.department.create({ data: dto }); }
  @Patch(':id') @UseGuards(RolesGuard) @Roles('ADMIN') update(@Param('id') id: string, @Body() dto: Partial<DepartmentDto>) { return this.prisma.department.update({ where: { id }, data: dto }); }
}
