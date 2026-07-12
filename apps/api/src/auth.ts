import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from './prisma.service';

class LoginDto {
  @IsString() username!: string;
  @IsString() @MinLength(6) password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username }, include: { department: true } });
    if (!user || !user.isActive || !(await bcrypt.compare(dto.password, user.passwordHash))) throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    const payload = { sub: user.id, username: user.username, role: user.role };
    const { passwordHash, ...safeUser } = user;
    return { accessToken: await this.jwt.signAsync(payload), user: safeUser };
  }
}

export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: process.env.JWT_SECRET || 'change-this-secret-in-production' });
  }
  validate(payload: any) { return { id: payload.sub, username: payload.username, role: payload.role }; }
}
