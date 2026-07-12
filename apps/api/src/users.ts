import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard, Roles, RolesGuard } from './common';

class CreateUserDto {
  @IsString() username!: string;
  @IsString() @MinLength(8) password!: string;
  @IsString() fullName!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsEnum(Role) role!: Role;
  @IsOptional() @IsString() departmentId?: string;
}

@Controller('users') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN')
export class UsersController {
  constructor(private prisma: PrismaService) {}
  @Get() async list() {
    const users = await this.prisma.user.findMany({ include: { department: true }, orderBy: { createdAt: 'desc' } });
    return users.map(({ passwordHash, ...user }) => user);
  }
  @Post() async create(@Body() dto: CreateUserDto) {
    const { password, ...data } = dto;
    const user = await this.prisma.user.create({ data: { ...data, passwordHash: await bcrypt.hash(password, 10) }, include: { department: true } });
    const { passwordHash, ...safe } = user;
    return safe;
  }
}
