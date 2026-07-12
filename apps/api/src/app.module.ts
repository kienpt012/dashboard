import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PassportModule,
    JwtModule.register({ global: true, secret: process.env.JWT_SECRET || 'change-this-secret-in-production', signOptions: { expiresIn: '8h' } }),
  ],
  controllers: [PublicController, AuthController, DepartmentsController, UsersController, TargetsController, DashboardController, ImportController],
  providers: [PrismaService, JwtStrategy, RolesGuard],
})
export class AppModule {}
