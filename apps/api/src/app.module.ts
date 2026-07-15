import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaService } from './prisma.service';
import { AuthController, JwtStrategy } from './auth';
import { DepartmentsController } from './departments';
import { UsersController } from './users';
import { TargetsController } from './targets';
import { DashboardController } from './dashboard';
import { ImportController } from './import';
import { RolesGuard } from './common';
import { PublicController } from './public';
import { SettingsController } from './settings';
import { ExportsController } from './exports';
import { requireJwtSecret } from './environment';
import { FeedbackController, PublicFeedbackController } from './feedback';
import { AuditLogsController } from './audit-logs';
import { RateLimitService } from './rate-limit';
import { HealthController } from './health';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PassportModule,
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: requireJwtSecret(config.get<string>('JWT_SECRET')),
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [
    HealthController,
    PublicController,
    PublicFeedbackController,
    AuthController,
    DepartmentsController,
    UsersController,
    TargetsController,
    DashboardController,
    ImportController,
    ExportsController,
    SettingsController,
    FeedbackController,
    AuditLogsController,
  ],
  providers: [PrismaService, JwtStrategy, RolesGuard, RateLimitService],
})
export class AppModule {}
