import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { TargetStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './common';

@Controller('dashboard') @UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private prisma: PrismaService) {}
  @Get()
  async overview(@Query('year') yearRaw?: string) {
    const year = Number(yearRaw) || new Date().getFullYear();
    const targets = await this.prisma.target.findMany({ where: { year }, include: { department: true } });
    const counts = Object.values(TargetStatus).reduce((acc, status) => ({ ...acc, [status]: targets.filter(t => t.status === status).length }), {} as Record<string, number>);
    const weightedTotal = targets.reduce((s, t) => s + t.weight, 0);
    const weightedProgress = targets.reduce((s, t) => s + Math.min(t.currentValue / Math.max(t.targetValue, .0001), 1) * t.weight, 0);
    const departmentMap = new Map<string, { id: string; name: string; color: string; total: number; completed: number; atRisk: number; progress: number }>();
    for (const t of targets) {
      const d = departmentMap.get(t.departmentId) || { id: t.departmentId, name: t.department.name, color: t.department.color, total: 0, completed: 0, atRisk: 0, progress: 0 };
      d.total++; d.completed += t.status === TargetStatus.COMPLETED ? 1 : 0; d.atRisk += t.status === TargetStatus.AT_RISK || t.status === TargetStatus.OVERDUE ? 1 : 0;
      d.progress += Math.min(t.currentValue / Math.max(t.targetValue, .0001), 1) * 100;
      departmentMap.set(t.departmentId, d);
    }
    const departments = [...departmentMap.values()].map(d => ({ ...d, progress: Math.round(d.progress / d.total) })).sort((a,b) => b.progress-a.progress);
    const alerts = targets.filter(t => t.status === TargetStatus.AT_RISK || t.status === TargetStatus.OVERDUE).sort((a,b) => +a.dueDate - +b.dueDate).slice(0,5);
    const recent = await this.prisma.progressUpdate.findMany({ where: { target: { year } }, take: 5, orderBy: { createdAt: 'desc' }, include: { target: { select: { code: true, title: true, unit: true } }, user: { select: { fullName: true } } } });
    return { year, total: targets.length, counts, overallProgress: weightedTotal ? Math.round(weightedProgress / weightedTotal * 100) : 0, departments, alerts, recent, updatedAt: new Date() };
  }
  @Get('report')
  async report(@Query('year') yearRaw?: string) {
    const year = Number(yearRaw) || new Date().getFullYear();
    const rows = await this.prisma.target.findMany({ where: { year }, include: { department: true }, orderBy: [{ department: { name: 'asc' } }, { code: 'asc' }] });
    return rows.map(t => ({ code: t.code, title: t.title, department: t.department.name, target: t.targetValue, current: t.currentValue, unit: t.unit, progress: Math.round(Math.min(t.currentValue / Math.max(t.targetValue, .0001), 1) * 100), status: t.status, dueDate: t.dueDate }));
  }
}
