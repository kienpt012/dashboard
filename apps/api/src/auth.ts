import {
  BadRequestException,
  Body,
  ConflictException,
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
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from './prisma.service';
import { Actor, audit, getActor } from './access';
import { JwtAuthGuard } from './common';
import { requireJwtSecret } from './environment';
import { getClientIp, RateLimitService } from './rate-limit';

const LOGIN_WINDOW_MS = 15 * 60 * 1_000;
const DUMMY_PASSWORD_HASH = '$2b$10$owu9dLW.Qm52mUy1dUf7.eRdu347pnT0jA3bDygsnfdaJwvupkoFi';

class LoginDto {
  @IsString({ message: 'Tên đăng nhập không hợp lệ' })
  @MaxLength(80, { message: 'Tên đăng nhập không được vượt quá 80 ký tự' })
  username!: string;

  @IsString({ message: 'Mật khẩu không hợp lệ' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  @MaxLength(128, { message: 'Mật khẩu không được vượt quá 128 ký tự' })
  password!: string;
}

class ChangePasswordDto {
  @IsString({ message: 'Mật khẩu hiện tại không hợp lệ' })
  @MinLength(6)
  @MaxLength(128)
  currentPassword!: string;

  @IsString({ message: 'Mật khẩu mới không hợp lệ' })
  @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự' })
  @MaxLength(128, { message: 'Mật khẩu mới không được vượt quá 128 ký tự' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'Mật khẩu mới cần có chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  newPassword!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private rateLimit: RateLimitService,
  ) {}

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: any) {
    const username = dto.username.trim().toLowerCase();
    const clientIp = getClientIp(req);
    const accountKey = username;
    this.rateLimit.consume('auth-login-ip-burst', clientIp, {
      limit: 300,
      windowMs: LOGIN_WINDOW_MS,
      message: 'Có quá nhiều yêu cầu đăng nhập từ thiết bị này. Vui lòng thử lại sau.',
    });
    this.rateLimit.consume('auth-login-account', accountKey, {
      limit: 8,
      windowMs: LOGIN_WINDOW_MS,
      message: 'Quá nhiều lần đăng nhập không thành công. Vui lòng thử lại sau.',
    });
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { department: true },
    });
    const passwordMatches = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !user.isActive || !passwordMatches) {
      this.rateLimit.consume('auth-login-ip-failed', clientIp, {
        limit: 30,
        windowMs: LOGIN_WINDOW_MS,
        message: 'Quá nhiều lần đăng nhập không thành công từ thiết bị này. Vui lòng thử lại sau.',
      });
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    }
    if (user.role !== Role.ADMIN && (!user.department || !user.department.isActive)) {
      throw new ForbiddenException('Tài khoản chưa được gắn với phòng ban đang hoạt động');
    }

    const loggedInAt = new Date();
    const claimed = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        isActive: true,
        passwordHash: user.passwordHash,
        tokenVersion: user.tokenVersion,
      },
      data: { lastLoginAt: loggedInAt },
    });
    if (claimed.count !== 1) {
      throw new UnauthorizedException('Tài khoản vừa được thay đổi. Vui lòng đăng nhập lại bằng thông tin mới nhất');
    }
    const updatedUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { department: true },
    });
    if (
      !updatedUser
      || !updatedUser.isActive
      || updatedUser.passwordHash !== user.passwordHash
      || updatedUser.tokenVersion !== user.tokenVersion
    ) {
      throw new UnauthorizedException('Tài khoản vừa được thay đổi. Vui lòng đăng nhập lại bằng thông tin mới nhất');
    }
    const payload = { sub: updatedUser.id, ver: updatedUser.tokenVersion };
    const { passwordHash, ...safeUser } = updatedUser;
    this.rateLimit.reset('auth-login-account', accountKey);
    return { accessToken: await this.jwt.signAsync(payload), user: safeUser };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: any): Actor {
    return getActor(req);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const actor = getActor(req);
    const clientIp = getClientIp(req);
    this.rateLimit.consume('auth-change-password-ip', clientIp, {
      limit: 15,
      windowMs: LOGIN_WINDOW_MS,
      message: 'Quá nhiều lần thử đổi mật khẩu từ thiết bị này. Vui lòng thử lại sau.',
    });
    this.rateLimit.consume('auth-change-password-account', actor.id, {
      limit: 5,
      windowMs: LOGIN_WINDOW_MS,
      message: 'Bạn đã thử mật khẩu hiện tại quá nhiều lần. Vui lòng thử lại sau.',
    });
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại');
    }
    const existing = await this.prisma.user.findUnique({ where: { id: actor.id } });
    if (!existing || !(await bcrypt.compare(dto.currentPassword, existing.passwordHash))) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    const updated = await this.prisma.$transaction(async tx => {
      const changed = await tx.user.updateMany({
        where: {
          id: actor.id,
          isActive: true,
          passwordHash: existing.passwordHash,
          tokenVersion: existing.tokenVersion,
        },
        data: { passwordHash, tokenVersion: { increment: 1 }, version: { increment: 1 } },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Tài khoản vừa được thay đổi. Vui lòng tải lại và thử lại');
      }
      const user = await tx.user.findUniqueOrThrow({
        where: { id: actor.id },
        include: { department: true },
      });
      await audit(tx, actor, {
        action: 'PASSWORD_CHANGED',
        entityType: 'User',
        entityId: actor.id,
        departmentId: actor.departmentId,
      });
      return user;
    });
    const { passwordHash: _passwordHash, tokenVersion, ...safeUser } = updated;
    this.rateLimit.reset('auth-change-password-account', actor.id);
    return {
      accessToken: await this.jwt.signAsync({ sub: updated.id, ver: tokenVersion }),
      user: safeUser,
    };
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

  async validate(payload: { sub?: string; ver?: number }): Promise<Actor> {
    if (!payload.sub) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { department: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị khóa');
    }
    if (payload.ver !== user.tokenVersion) {
      throw new UnauthorizedException('Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại');
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
