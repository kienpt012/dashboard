import { Controller, Get, Query } from '@nestjs/common';
import { TargetStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { calculateProgress } from './metrics';
import { PrismaService } from './prisma.service';

class PublicOverviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Năm công bố phải là số nguyên' })
  @Min(2000, { message: 'Năm công bố không hợp lệ' })
  @Max(2100, { message: 'Năm công bố không hợp lệ' })
  year?: number;
}

@Controller('public')
export class PublicController {
  constructor(private prisma: PrismaService) {}

  @Get('overview')
  async overview(@Query() query: PublicOverviewQueryDto) {
    const setting = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    const year = query.year ?? setting?.defaultYear ?? new Date().getFullYear();
    const rows = await this.prisma.target.findMany({
      where: {
        year,
        isPublic: true,
        publishedValue: { not: null },
        publishedTargetValue: { not: null },
        publishedDirection: { not: null },
        publishedStatus: { not: null },
        department: { isActive: true },
      },
      select: {
        code: true,
        title: true,
        unit: true,
        publishedTargetValue: true,
        publishedValue: true,
        publishedDirection: true,
        publishedStatus: true,
        publishedAt: true,
        weight: true,
        isHighlighted: true,
        publicOrder: true,
        departmentId: true,
        department: { select: { name: true, color: true } },
      },
      orderBy: [
        { isHighlighted: 'desc' },
        { publicOrder: 'asc' },
        { publishedAt: 'desc' },
      ],
    });
    const targets = rows.map(target => ({
      ...target,
      targetValue: target.publishedTargetValue!,
      currentValue: target.publishedValue!,
      direction: target.publishedDirection!,
      status: target.publishedStatus!,
      progress: calculateProgress(target.publishedTargetValue!, target.publishedValue!, target.publishedDirection!),
    }));
    const weightedTotal = targets.reduce((sum, target) => sum + target.weight, 0);
    const weightedProgress = targets.reduce(
      (sum, target) => sum + (target.progress / 100) * target.weight,
      0,
    );
    const completed = targets.filter(target => target.status === TargetStatus.COMPLETED).length;
    const onTrack = targets.filter(target => target.status === TargetStatus.ON_TRACK).length;
    const departments = new Map<string, {
      name: string;
      color: string;
      total: number;
      completed: number;
      progress: number;
    }>();
    for (const target of targets) {
      const item = departments.get(target.departmentId) || {
        name: target.department.name,
        color: target.department.color,
        total: 0,
        completed: 0,
        progress: 0,
      };
      item.total += 1;
      item.completed += target.status === TargetStatus.COMPLETED ? 1 : 0;
      item.progress += target.progress;
      departments.set(target.departmentId, item);
    }
    const highlights = targets
      .filter(target => target.isHighlighted)
      .map(target => ({
        code: target.code,
        title: target.title,
        unit: target.unit,
        targetValue: target.targetValue,
        currentValue: target.currentValue,
        progress: target.progress,
        department: target.department.name,
        status: target.status,
      }));
    const latestUpdate = targets.reduce<Date | null>((latest, target) => {
      const candidate = target.publishedAt;
      return candidate && (!latest || candidate > latest) ? candidate : latest;
    }, null);
    return {
      year,
      total: targets.length,
      completed,
      onTrack,
      overallProgress: weightedTotal ? Math.round((weightedProgress / weightedTotal) * 100) : 0,
      departments: [...departments.values()]
        .map(item => ({ ...item, progress: item.total ? Math.round(item.progress / item.total) : 0 }))
        .sort((left, right) => right.progress - left.progress),
      highlights,
      updatedAt: latestUpdate ?? new Date(),
    };
  }
}
