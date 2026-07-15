import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ProgressReviewStatus, TargetStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './common';
import { getActor, resolveDepartmentScope } from './access';
import { evaluateTarget } from './metrics';
import { currentVietnamYear } from './planning-date';

class DashboardQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Năm báo cáo phải là số nguyên' })
  @Min(2000, { message: 'Năm báo cáo không hợp lệ' })
  @Max(2100, { message: 'Năm báo cáo không hợp lệ' })
  year?: number;

  @IsOptional()
  @IsString({ message: 'Phòng ban không hợp lệ' })
  departmentId?: string;
}

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private prisma: PrismaService) {}

  private async context(query: DashboardQueryDto, req: any) {
    const actor = getActor(req);
    const departmentId = resolveDepartmentScope(actor, query.departmentId);
    const setting = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    return {
      actor,
      departmentId,
      year: query.year ?? setting?.defaultYear ?? currentVietnamYear(),
      riskThreshold: setting?.riskThreshold ?? 70,
      warningDays: setting?.warningDays ?? 14,
    };
  }

  @Get()
  async overview(@Query() query: DashboardQueryDto, @Req() req: any) {
    const { departmentId, year, riskThreshold, warningDays } = await this.context(query, req);
    const where = { year, isArchived: false, ...(departmentId ? { departmentId } : {}) };
    const rawTargets = await this.prisma.target.findMany({
      where,
      include: { department: true },
    });
    const targets = rawTargets.map(target => ({
      ...target,
      ...evaluateTarget({
        targetValue: target.targetValue,
        currentValue: target.currentValue,
        direction: target.direction,
        dueDate: target.dueDate,
        riskThreshold,
        hasReport: Boolean(target.lastReportedAt),
      }),
    }));

    const counts = Object.values(TargetStatus).reduce(
      (acc, status) => ({ ...acc, [status]: targets.filter(target => target.status === status).length }),
      {} as Record<TargetStatus, number>,
    );
    const weightedTotal = targets.reduce((sum, target) => sum + target.weight, 0);
    const weightedProgress = targets.reduce(
      (sum, target) => sum + (target.progress / 100) * target.weight,
      0,
    );
    const departmentMap = new Map<string, {
      id: string;
      name: string;
      color: string;
      total: number;
      completed: number;
      atRisk: number;
      progress: number;
      weight: number;
    }>();
    for (const target of targets) {
      const department = departmentMap.get(target.departmentId) || {
        id: target.departmentId,
        name: target.department.name,
        color: target.department.color,
        total: 0,
        completed: 0,
        atRisk: 0,
        progress: 0,
        weight: 0,
      };
      department.total += 1;
      department.completed += target.status === TargetStatus.COMPLETED ? 1 : 0;
      department.atRisk += target.status === TargetStatus.AT_RISK || target.status === TargetStatus.OVERDUE ? 1 : 0;
      department.progress += target.progress * target.weight;
      department.weight += target.weight;
      departmentMap.set(target.departmentId, department);
    }
    const departments = [...departmentMap.values()]
      .map(({ weight, ...department }) => ({
        ...department,
        progress: weight ? Math.round(department.progress / weight) : 0,
      }))
      .sort((left, right) => right.progress - left.progress);
    const warningCutoff = new Date();
    warningCutoff.setDate(warningCutoff.getDate() + warningDays);
    const alerts = targets
      .filter(target =>
        target.status === TargetStatus.AT_RISK ||
        target.status === TargetStatus.OVERDUE ||
        (target.status !== TargetStatus.COMPLETED && target.dueDate <= warningCutoff),
      )
      .sort((left, right) => +left.dueDate - +right.dueDate)
      .slice(0, 5);
    const recent = await this.prisma.progressUpdate.findMany({
      where: { target: where, reviewStatus: ProgressReviewStatus.APPROVED },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        target: { select: { code: true, title: true, unit: true } },
        user: { select: { fullName: true } },
      },
    });
    return {
      year,
      total: targets.length,
      counts,
      overallProgress: weightedTotal ? Math.round((weightedProgress / weightedTotal) * 100) : 0,
      departments,
      alerts,
      recent,
      updatedAt: new Date(),
      warningDays,
      riskThreshold,
    };
  }

  @Get('report')
  async report(@Query() query: DashboardQueryDto, @Req() req: any) {
    const { departmentId, year, riskThreshold } = await this.context(query, req);
    const rows = await this.prisma.target.findMany({
      where: { year, isArchived: false, ...(departmentId ? { departmentId } : {}) },
      include: { department: true },
      orderBy: [{ department: { name: 'asc' } }, { code: 'asc' }],
    });
    return rows.map(target => {
      const metric = evaluateTarget({
        targetValue: target.targetValue,
        currentValue: target.currentValue,
        direction: target.direction,
        dueDate: target.dueDate,
        riskThreshold,
        hasReport: Boolean(target.lastReportedAt),
      });
      return {
        code: target.code,
        title: target.title,
        department: target.department.name,
        target: target.targetValue,
        current: target.currentValue,
        unit: target.unit,
        progress: metric.progress,
        status: metric.status,
        dueDate: target.dueDate,
        lastReportedAt: target.lastReportedAt,
      };
    });
  }
}
