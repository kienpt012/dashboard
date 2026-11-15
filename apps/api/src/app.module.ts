import { TargetLinksController } from './target-links';
import { ForecastController } from './forecast/controller';
import { ForecastService } from './forecast/service';
import { ReportRevisionsController } from './report-revisions';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DocRefInterceptor } from './doc-ref.interceptor';
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
import { SmsService } from './sms';
import { PasswordResetDeliveryRegistry } from './password-reset-delivery';
import { DocumentsController } from './documents';
import { CandidatesController } from './candidates';
import { CopilotController } from './copilot';
import { ExtractionWorker } from './extraction-worker';
import { OllamaService } from './ollama';
import { LocalityController } from './locality';
import { SetupController } from './setup';
import { FrameworksController } from './frameworks';
import { DatasetsController } from './datasets';
import { DossierController } from './dossier';
import { SourceAnchorController, SourceLocatorService } from './source-anchor';
import { NotificationsController } from './notifications';
import { IocController } from './ioc';
import { BugReportsController } from './bug-reports';
import { AccountabilityWorker } from './accountability-worker';
import { PublicScheduleController, ScheduleController } from './schedule';
import { WorkspaceController } from './workspace';
import { DeskNotesController } from './workspace-desk-notes';
import { DeskBriefingController } from './workspace-desk-briefing';
import { WorkAppsController } from './workspace-desk-apps';
import { DirectivesController } from './directives';
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
    LocalityController,
    SetupController,
    FrameworksController,
    DatasetsController,
    DossierController,
    SourceAnchorController,
    NotificationsController,
    IocController,
    BugReportsController,
    WorkspaceController,
    ScheduleController,
    PublicScheduleController,
    DeskNotesController, DeskBriefingController, WorkAppsController,
    DirectivesController,
    TargetLinksController,
    ReportRevisionsController,
    ForecastController,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: DocRefInterceptor },
    PasswordResetDeliveryRegistry,
    PrismaService,
    ForecastService,
    JwtStrategy,
    RolesGuard,
    RateLimitService,
    MailService,
    SmsService,
    FeedbackMailOutboxWorker,
    OllamaService,
    ExtractionWorker,
    PublicDashboardService,
    AccountabilityWorker,
    SourceLocatorService,
  ],
})
export class AppModule {}
