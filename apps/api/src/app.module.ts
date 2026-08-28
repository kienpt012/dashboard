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
import { FeedbackMailOutboxWorker, MailService } from './mail';
import { PasswordResetDeliveryRegistry } from './password-reset-delivery';
import { DocumentsController } from './documents';
import { CandidatesController } from './candidates';
import { CopilotController } from './copilot';
import { ExtractionWorker } from './extraction-worker';
import { OllamaService } from './ollama';
import {
  PublicDashboardAdminController,
  PublicDashboardPublicController,
  PublicDashboardService,
} from './public-dashboard';

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
    PublicDashboardPublicController,
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
    DocumentsController,
    CandidatesController,
    CopilotController,
    PublicDashboardAdminController,
  ],
  providers: [
    PasswordResetDeliveryRegistry,
    PrismaService,
    JwtStrategy,
    RolesGuard,
    RateLimitService,
    MailService,
    FeedbackMailOutboxWorker,
    OllamaService,
    ExtractionWorker,
    PublicDashboardService,
  ],
})
export class AppModule {}
