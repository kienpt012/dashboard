import { Controller, Get, Query } from '@nestjs/common';
import { TargetStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';

@Controller('public')
export class PublicController {
  constructor(private prisma: PrismaService) {}

  @Get('overview')
  async overview(@Query('year') yearRaw?: string) {
    const year = Number(yearRaw) || new Date().getFullYear();
    const targets = await this.prisma.target.findMany({
      where: { year },
      include: { department: true },
      orderBy: { updatedAt: 'desc' },
    });
    const weightedTotal = targets.reduce((sum, target) => sum + target.weight, 0);
    const weightedProgress = targets.reduce((sum, target) => {
      const progress = Math.min(target.currentValue / Math.max(target.targetValue, 0.0001), 1);
      return sum + progress * target.weight;
    }, 0);
    const completed = targets.filter(target => target.status === TargetStatus.COMPLETED).length;
    const onTrack = targets.filter(target => target.status === TargetStatus.ON_TRACK).length;
    const departments = new Map<string, { name: string; color: string; total: number; completed: number; progress: number }>();
    for (const target of targets) {
      const item = departments.get(target.departmentId) || { name: target.department.name, color: target.department.color, total: 0, completed: 0, progress: 0 };
      item.total += 1;
      item.completed += target.status === TargetStatus.COMPLETED ? 1 : 0;
      item.progress += Math.min(target.currentValue / Math.max(target.targetValue, 0.0001), 1) * 100;
      departments.set(target.departmentId, item);
    }
    const keyCodes = ['CT-2026-001', 'CT-2026-002', 'CT-2026-003', 'CT-2026-004', 'CT-2026-006', 'CT-2026-009'];
    const highlights = targets.filter(target => keyCodes.includes(target.code)).map(target => ({
      code: target.code,
      title: target.title,
      unit: target.unit,
      targetValue: target.targetValue,
      currentValue: target.currentValue,
      progress: Math.round(Math.min(target.currentValue / Math.max(target.targetValue, 0.0001), 1) * 100),
      department: target.department.name,
      status: target.status,
    }));
    return {
      year,
      total: targets.length,
      completed,
      onTrack,
      overallProgress: weightedTotal ? Math.round(weightedProgress / weightedTotal * 100) : 0,
      departments: [...departments.values()].map(item => ({ ...item, progress: Math.round(item.progress / item.total) })).sort((a, b) => b.progress - a.progress),
      highlights,
      updatedAt: targets[0]?.updatedAt || new Date(),
    };
  }
}
