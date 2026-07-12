import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from './prisma.service';
import { Actor, getActor } from './access';
import { JwtAuthGuard } from './common';
import { requireJwtSecret } from './environment';

class LoginDto {
  @IsString({ message: 'Tên đăng nhập không hợp lệ' })
  @MaxLength(80, { message: 'Tên đăng nhập không được vượt quá 80 ký tự' })
  username!: string;

  @IsString({ message: 'Mật khẩu không hợp lệ' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  @MaxLength(128, { message: 'Mật khẩu không được vượt quá 128 ký tự' })
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const username = dto.username.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { department: true },
    });
    if (!user || !user.isActive || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    }
    if (user.role !== Role.ADMIN && (!user.department || !user.department.isActive)) {
      throw new ForbiddenException('Tài khoản chưa được gắn với phòng ban đang hoạt động');
    }

    const loggedInAt = new Date();
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: loggedInAt },
      include: { department: true },
    });
    const payload = { sub: updatedUser.id };
    const { passwordHash, ...safeUser } = updatedUser;
    return { accessToken: await this.jwt.signAsync(payload), user: safeUser };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: any): Actor {
    return getActor(req);
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService, config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireJwtSecret(config.get<string>('JWT_SECRET')),
    });
  }

  async validate(payload: { sub?: string }): Promise<Actor> {
    if (!payload.sub) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { department: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị khóa');
    }
    if (user.role !== Role.ADMIN && (!user.department || !user.department.isActive)) {
      throw new ForbiddenException('Tài khoản chưa được gắn với phòng ban đang hoạt động');
    }
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      departmentId: user.departmentId,
      department: user.department,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
