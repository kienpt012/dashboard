import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Prisma, Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomInt, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from './prisma.service';
import { Actor, audit, getActor } from './access';
import { JwtAuthGuard } from './common';
import { requireJwtSecret } from './environment';
import { getClientIp, RateLimitService } from './rate-limit';
import { MailService } from './mail';
import { PasswordResetDeliveryRegistry } from './password-reset-delivery';

const LOGIN_WINDOW_MS = 15 * 60 * 1_000;
const DUMMY_PASSWORD_HASH = '$2b$10$owu9dLW.Qm52mUy1dUf7.eRdu347pnT0jA3bDygsnfdaJwvupkoFi';
const PASSWORD_RESET_REQUEST_WINDOW_MS = 15 * 60 * 1_000;
const PASSWORD_RESET_OTP_TTL_MS = 10 * 60 * 1_000;
const PASSWORD_RESET_TOKEN_TTL_MS = 10 * 60 * 1_000;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;
const PASSWORD_RESET_OTP_LENGTH = 6;
const PASSWORD_RESET_DATABASE_COOLDOWN_MS = 60 * 1_000;
const PASSWORD_RESET_TRANSACTION_RETRIES = 3;
const PASSWORD_RESET_MIN_RESPONSE_MS = 750;
const PASSWORD_RESET_RESPONSE_JITTER_MS = 150;
export const PASSWORD_RESET_REQUEST_MESSAGE =
  'Nếu thông tin khớp với tài khoản đang hoạt động, mã xác thực sẽ được gửi đến email đã đăng ký.';
const PASSWORD_RESET_INVALID_MESSAGE =
  'Mã xác thực không hợp lệ, đã hết hạn hoặc đã được sử dụng.';
const PASSWORD_RESET_TOKEN_INVALID_MESSAGE =
  'Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu mã mới.';

const Trim = () => Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

export function hashPasswordResetValue(secret: string, scope: string, value: string): string {
  return createHmac('sha256', secret).update(`${scope}:${value}`).digest('hex');
}

function opaqueRateLimitKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeHashEquals(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(actual, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function isSerializationConflict(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === 'P2034',
  );
}

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
  @MinLength(10, { message: 'Mật khẩu mới phải có ít nhất 10 ký tự' })
  @MaxLength(128, { message: 'Mật khẩu mới không được vượt quá 128 ký tự' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'Mật khẩu mới cần có chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  newPassword!: string;
}

export class PasswordResetRequestDto {
  @Trim()
  @IsString({ message: 'Tên đăng nhập hoặc email không hợp lệ' })
  @MinLength(3, { message: 'Tên đăng nhập hoặc email phải có ít nhất 3 ký tự' })
  @MaxLength(180, { message: 'Tên đăng nhập hoặc email không được vượt quá 180 ký tự' })
  identifier!: string;
}

export class PasswordResetVerifyDto extends PasswordResetRequestDto {
  @Trim()
  @IsString({ message: 'Mã xác thực không hợp lệ' })
  @Matches(/^\d{6}$/, { message: 'Mã xác thực phải gồm đúng 6 chữ số' })
  otp!: string;
}

export class PasswordResetCompleteDto {
  @Trim()
  @IsString({ message: 'Phiên đặt lại mật khẩu không hợp lệ' })
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: 'Phiên đặt lại mật khẩu không hợp lệ' })
  resetToken!: string;

  @IsString({ message: 'Mật khẩu mới không hợp lệ' })
  @MinLength(10, { message: 'Mật khẩu mới phải có ít nhất 10 ký tự' })
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
    private config: ConfigService,
    private mail: MailService,
    private passwordResetDeliveries: PasswordResetDeliveryRegistry,
  ) {}

  private passwordResetSecret(): string {
    const dedicatedSecret = this.config.get<string>('PASSWORD_RESET_PEPPER')?.trim();
    if (
      dedicatedSecret
      && (dedicatedSecret.length < 32 || dedicatedSecret.startsWith('replace-'))
    ) {
      throw new ServiceUnavailableException(
        'PASSWORD_RESET_PEPPER phải là chuỗi bí mật ngẫu nhiên có ít nhất 32 ký tự.',
      );
    }
    return dedicatedSecret || requireJwtSecret(this.config.get<string>('JWT_SECRET'));
  }

  private isProduction(): boolean {
    return this.config.get<string>('NODE_ENV')?.trim().toLowerCase() === 'production';
  }

  private async maskPasswordResetRequestTiming(startedAt: number): Promise<void> {
    if (!this.isProduction()) return;
    const targetDuration = PASSWORD_RESET_MIN_RESPONSE_MS
      + randomInt(0, PASSWORD_RESET_RESPONSE_JITTER_MS + 1);
    const remaining = targetDuration - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining));
    }
  }

  private async findPasswordResetUser(identifier: string) {
    return this.prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [
          { username: { equals: identifier, mode: 'insensitive' } },
          { email: { equals: identifier, mode: 'insensitive' } },
        ],
      },
    });
  }

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

  @Post('password-reset/request')
  @HttpCode(200)
  async requestPasswordReset(@Body() dto: PasswordResetRequestDto, @Req() req: any) {
    const requestStartedAt = Date.now();
    const clientIp = getClientIp(req);
    const identifier = normalizeIdentifier(dto.identifier);
    const identifierKey = opaqueRateLimitKey(identifier);
    this.rateLimit.consume('auth-password-reset-request-ip', clientIp, {
      limit: 10,
      windowMs: PASSWORD_RESET_REQUEST_WINDOW_MS,
      message: 'Có quá nhiều yêu cầu khôi phục mật khẩu từ thiết bị này. Vui lòng thử lại sau.',
    });
    this.rateLimit.consume('auth-password-reset-request-account', identifierKey, {
      limit: 3,
      windowMs: PASSWORD_RESET_REQUEST_WINDOW_MS,
      message: 'Đã gửi yêu cầu khôi phục gần đây. Vui lòng kiểm tra email hoặc thử lại sau.',
    });

    // Trạng thái cấu hình SMTP là trạng thái toàn hệ thống, do đó trả cùng một lỗi
    // cho mọi định danh và không làm lộ tài khoản có tồn tại hay không.
    if (!this.mail.isConfigured()) {
      throw new ServiceUnavailableException(
        'Dịch vụ email khôi phục mật khẩu chưa được cấu hình. Vui lòng liên hệ quản trị hệ thống.',
      );
    }

    // Kiểm tra khóa HMAC trước mọi truy vấn định danh để cấu hình sai không tạo ra
    // hai nhánh phản hồi khác nhau giữa tài khoản tồn tại và không tồn tại.
    const resetSecret = this.passwordResetSecret();
    const user = await this.findPasswordResetUser(identifier);
    const genericResponse = {
      message: PASSWORD_RESET_REQUEST_MESSAGE,
      expiresInMinutes: PASSWORD_RESET_OTP_TTL_MS / 60_000,
    };
    if (!user?.email) {
      // Cân bằng một phần chi phí xử lý giữa tài khoản tồn tại và không tồn tại.
      await bcrypt.compare('invalid-password-reset-request', DUMMY_PASSWORD_HASH);
      await this.maskPasswordResetRequestTiming(requestStartedAt);
      return genericResponse;
    }

    const now = new Date();
    const challengeId = randomUUID();
    const otp = randomInt(0, 10 ** PASSWORD_RESET_OTP_LENGTH)
      .toString()
      .padStart(PASSWORD_RESET_OTP_LENGTH, '0');
    const otpHash = hashPasswordResetValue(resetSecret, challengeId, otp);
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_OTP_TTL_MS);
    const cooldownStartedAt = new Date(now.getTime() - PASSWORD_RESET_DATABASE_COOLDOWN_MS);

    let challengeCreated = false;
    for (let attempt = 0; attempt < PASSWORD_RESET_TRANSACTION_RETRIES; attempt += 1) {
      try {
        challengeCreated = await this.prisma.$transaction(async tx => {
          const recentActiveChallenge = await tx.passwordResetChallenge.findFirst({
            where: {
              userId: user.id,
              consumedAt: null,
              createdAt: { gte: cooldownStartedAt },
            },
            select: { id: true },
          });
          if (recentActiveChallenge) return false;

          await tx.passwordResetChallenge.updateMany({
            where: { userId: user.id, consumedAt: null },
            data: { consumedAt: now, resetTokenHash: null },
          });
          await tx.passwordResetChallenge.create({
            data: {
              id: challengeId,
              userId: user.id,
              otpHash,
              expiresAt,
              maxAttempts: PASSWORD_RESET_MAX_ATTEMPTS,
              createdAt: now,
            },
          });
          return true;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        break;
      } catch (error) {
        if (isSerializationConflict(error) && attempt + 1 < PASSWORD_RESET_TRANSACTION_RETRIES) {
          continue;
        }
        // Xung đột kéo dài không được biến thành tín hiệu cho biết tài khoản có tồn tại.
        if (isSerializationConflict(error)) {
          await this.maskPasswordResetRequestTiming(requestStartedAt);
          return genericResponse;
        }
        throw error;
      }
    }

    // Một yêu cầu khác vừa tạo mã trong khoảng chống gửi lặp: không phát hành email thứ hai.
    if (!challengeCreated) {
      await this.maskPasswordResetRequestTiming(requestStartedAt);
      return genericResponse;
    }

    const delivery = this.passwordResetDeliveries.track(
      this.mail.sendPasswordResetOtp({
        to: user.email,
        otp,
        expiresInMinutes: PASSWORD_RESET_OTP_TTL_MS / 60_000,
      }),
      async () => {
        // OTP chưa được chuyển giao (hoặc còn treo khi ứng dụng tắt) không bao giờ
        // được phép tiếp tục dùng. Registry giữ lỗi nội bộ khỏi phản hồi công khai.
        await this.prisma.passwordResetChallenge.updateMany({
          where: { id: challengeId, consumedAt: null },
          data: { consumedAt: new Date(), resetTokenHash: null },
        });
      },
    );

    if (this.isProduction()) {
      // Không để độ trễ của máy chủ SMTP trở thành tín hiệu dò tài khoản. Tác vụ gửi vẫn
      // được registry giữ đến khi hoàn tất và được drain an toàn khi ứng dụng tắt.
      await this.maskPasswordResetRequestTiming(requestStartedAt);
    } else {
      await delivery;
    }

    return genericResponse;
  }

  @Post('password-reset/verify')
  @HttpCode(200)
  async verifyPasswordResetOtp(@Body() dto: PasswordResetVerifyDto, @Req() req: any) {
    const clientIp = getClientIp(req);
    const identifier = normalizeIdentifier(dto.identifier);
    const identifierKey = opaqueRateLimitKey(identifier);
    this.rateLimit.consume('auth-password-reset-verify-ip', clientIp, {
      limit: 25,
      windowMs: PASSWORD_RESET_REQUEST_WINDOW_MS,
      message: 'Có quá nhiều lần nhập mã từ thiết bị này. Vui lòng thử lại sau.',
    });
    this.rateLimit.consume('auth-password-reset-verify-account', identifierKey, {
      limit: 8,
      windowMs: PASSWORD_RESET_REQUEST_WINDOW_MS,
      message: 'Có quá nhiều lần nhập mã cho yêu cầu này. Vui lòng yêu cầu mã mới.',
    });

    const resetSecret = this.passwordResetSecret();
    const now = new Date();
    const user = await this.findPasswordResetUser(identifier);
    const challenge = user
      ? await this.prisma.passwordResetChallenge.findFirst({
          where: {
            userId: user.id,
            consumedAt: null,
            verifiedAt: null,
            expiresAt: { gt: now },
            attempts: { lt: PASSWORD_RESET_MAX_ATTEMPTS },
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    const providedHash = hashPasswordResetValue(
      resetSecret,
      challenge?.id || 'unknown-challenge',
      dto.otp,
    );
    const otpMatches = challenge
      ? safeHashEquals(challenge.otpHash, providedHash)
      : false;

    if (!challenge || !otpMatches) {
      if (challenge) {
        const nextAttempts = challenge.attempts + 1;
        await this.prisma.passwordResetChallenge.updateMany({
          where: {
            id: challenge.id,
            attempts: challenge.attempts,
            consumedAt: null,
            verifiedAt: null,
          },
          data: {
            attempts: { increment: 1 },
            ...(nextAttempts >= challenge.maxAttempts ? { consumedAt: now } : {}),
          },
        });
      }
      throw new BadRequestException(PASSWORD_RESET_INVALID_MESSAGE);
    }

    const resetToken = randomBytes(32).toString('base64url');
    const resetTokenHash = hashPasswordResetValue(
      this.passwordResetSecret(),
      'reset-token',
      resetToken,
    );
    const resetTokenExpiresAt = new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS);
    const claimed = await this.prisma.passwordResetChallenge.updateMany({
      where: {
        id: challenge.id,
        attempts: challenge.attempts,
        consumedAt: null,
        verifiedAt: null,
        expiresAt: { gt: now },
      },
      data: { verifiedAt: now, resetTokenHash, resetTokenExpiresAt },
    });
    if (claimed.count !== 1) throw new BadRequestException(PASSWORD_RESET_INVALID_MESSAGE);

    this.rateLimit.reset('auth-password-reset-verify-account', identifierKey);
    return {
      resetToken,
      expiresInMinutes: PASSWORD_RESET_TOKEN_TTL_MS / 60_000,
    };
  }

  @Post('password-reset/complete')
  @HttpCode(200)
  async completePasswordReset(@Body() dto: PasswordResetCompleteDto, @Req() req: any) {
    const clientIp = getClientIp(req);
    const resetTokenHash = hashPasswordResetValue(
      this.passwordResetSecret(),
      'reset-token',
      dto.resetToken,
    );
    this.rateLimit.consume('auth-password-reset-complete-ip', clientIp, {
      limit: 15,
      windowMs: PASSWORD_RESET_REQUEST_WINDOW_MS,
      message: 'Có quá nhiều lần đặt lại mật khẩu từ thiết bị này. Vui lòng thử lại sau.',
    });
    this.rateLimit.consume('auth-password-reset-complete-token', resetTokenHash, {
      limit: 5,
      windowMs: PASSWORD_RESET_REQUEST_WINDOW_MS,
      message: 'Phiên đặt lại mật khẩu đã được thử quá nhiều lần. Vui lòng yêu cầu mã mới.',
    });

    const now = new Date();
    const challenge = await this.prisma.passwordResetChallenge.findUnique({
      where: { resetTokenHash },
      include: { user: true },
    });
    if (
      !challenge
      || !challenge.user.isActive
      || challenge.consumedAt
      || !challenge.verifiedAt
      || !challenge.resetTokenExpiresAt
      || challenge.resetTokenExpiresAt <= now
    ) {
      throw new BadRequestException(PASSWORD_RESET_TOKEN_INVALID_MESSAGE);
    }
    if (dto.newPassword.toLowerCase().includes(challenge.user.username.toLowerCase())) {
      throw new BadRequestException('Mật khẩu mới không được chứa tên đăng nhập');
    }
    if (await bcrypt.compare(dto.newPassword, challenge.user.passwordHash)) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu đang sử dụng');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.$transaction(async tx => {
      const consumed = await tx.passwordResetChallenge.updateMany({
        where: {
          id: challenge.id,
          resetTokenHash,
          consumedAt: null,
          verifiedAt: { not: null },
          resetTokenExpiresAt: { gt: now },
        },
        data: { consumedAt: now, resetTokenHash: null },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException(PASSWORD_RESET_TOKEN_INVALID_MESSAGE);
      }

      const changed = await tx.user.updateMany({
        where: {
          id: challenge.user.id,
          isActive: true,
          passwordHash: challenge.user.passwordHash,
          tokenVersion: challenge.user.tokenVersion,
        },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'Tài khoản vừa được thay đổi. Vui lòng yêu cầu mã khôi phục mới.',
        );
      }

      await tx.passwordResetChallenge.updateMany({
        where: { userId: challenge.user.id, consumedAt: null },
        data: { consumedAt: now, resetTokenHash: null },
      });
      await audit(tx, {
        id: challenge.user.id,
        username: challenge.user.username,
        fullName: challenge.user.fullName,
        email: challenge.user.email,
        role: challenge.user.role,
        isActive: challenge.user.isActive,
        departmentId: challenge.user.departmentId,
        lastLoginAt: challenge.user.lastLoginAt,
      }, {
        action: 'PASSWORD_RESET_COMPLETED',
        entityType: 'User',
        entityId: challenge.user.id,
        departmentId: challenge.user.departmentId,
      });
    });

    this.rateLimit.reset('auth-password-reset-complete-token', resetTokenHash);
    return {
      message: 'Mật khẩu đã được đặt lại. Tất cả phiên đăng nhập cũ đã được thu hồi.',
    };
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
      await tx.passwordResetChallenge.updateMany({
        where: { userId: actor.id, consumedAt: null },
        data: { consumedAt: new Date(), resetTokenHash: null },
      });
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
