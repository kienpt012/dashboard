import { Controller, Get, Query } from '@nestjs/common';
import { TargetStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { calculateProgress } from './metrics';
import { PrismaService } from './prisma.service';
import { currentVietnamYear } from './planning-date';

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
    const year = query.year ?? setting?.defaultYear ?? currentVietnamYear();
    const rows = await this.prisma.target.findMany({
      where: {
        isPublic: true,
        isArchived: false,
        publishedValue: { not: null },
        publishedTargetValue: { not: null },
        publishedDirection: { not: null },
        publishedStatus: { not: null },
        // Dùng năm đã được đóng băng khi công bố. Nhánh thứ hai chỉ hỗ trợ
        // bản ghi legacy được tạo trước khi có snapshot đầy đủ.
        OR: [
          { publishedYear: year },
          { publishedYear: null, year },
        ],
      },
      select: {
        code: true,
        title: true,
        description: true,
        unit: true,
        weight: true,
        year: true,
        frequency: true,
        dueDate: true,
        isHighlighted: true,
        publicOrder: true,
        department: { select: { name: true, color: true } },
        publishedTargetValue: true,
        publishedValue: true,
        publishedDirection: true,
        publishedStatus: true,
        publishedCode: true,
        publishedTitle: true,
        publishedDescription: true,
        publishedUnit: true,
        publishedWeight: true,
        publishedYear: true,
        publishedFrequency: true,
        publishedDueDate: true,
        publishedDepartmentName: true,
        publishedDepartmentColor: true,
        publishedHighlighted: true,
        publishedOrder: true,
        publishedAt: true,
      },
      orderBy: [
        { publishedHighlighted: 'desc' },
        { publishedOrder: 'asc' },
        { publishedAt: 'desc' },
      ],
    });
    const targets = rows.map(target => {
      // publishedCode đánh dấu bản ghi có snapshot đầy đủ. Không dùng toán tử
      // ?? cho từng trường vì description/order có thể được công bố hợp lệ là null.
      const hasSnapshot = target.publishedCode !== null;
      return {
        code: hasSnapshot ? target.publishedCode! : target.code,
        title: hasSnapshot ? target.publishedTitle! : target.title,
        description: hasSnapshot ? target.publishedDescription : target.description,
        unit: hasSnapshot ? target.publishedUnit! : target.unit,
        weight: hasSnapshot ? target.publishedWeight! : target.weight,
        year: hasSnapshot ? target.publishedYear! : target.year,
        frequency: hasSnapshot ? target.publishedFrequency! : target.frequency,
        dueDate: hasSnapshot ? target.publishedDueDate! : target.dueDate,
        departmentName: hasSnapshot ? target.publishedDepartmentName! : target.department.name,
        departmentColor: hasSnapshot ? target.publishedDepartmentColor! : target.department.color,
        isHighlighted: hasSnapshot ? target.publishedHighlighted! : target.isHighlighted,
        publicOrder: hasSnapshot ? target.publishedOrder : target.publicOrder,
        publishedAt: target.publishedAt,
        targetValue: target.publishedTargetValue!,
        currentValue: target.publishedValue!,
        direction: target.publishedDirection!,
        status: target.publishedStatus!,
        progress: calculateProgress(target.publishedTargetValue!, target.publishedValue!, target.publishedDirection!),
      };
    });
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
      weight: number;
    }>();
    for (const target of targets) {
      const departmentKey = `${target.departmentName}\u0000${target.departmentColor}`;
      const item = departments.get(departmentKey) || {
        name: target.departmentName,
        color: target.departmentColor,
        total: 0,
        completed: 0,
        progress: 0,
        weight: 0,
      };
      item.total += 1;
      item.completed += target.status === TargetStatus.COMPLETED ? 1 : 0;
      item.progress += target.progress * target.weight;
      item.weight += target.weight;
      departments.set(departmentKey, item);
    }
    const highlights = targets
      .filter(target => target.isHighlighted)
      .map(target => ({
        code: target.code,
        title: target.title,
        description: target.description,
        unit: target.unit,
        year: target.year,
        frequency: target.frequency,
        dueDate: target.dueDate,
        targetValue: target.targetValue,
        currentValue: target.currentValue,
        progress: target.progress,
        department: target.departmentName,
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
        .map(({ weight, ...item }) => ({ ...item, progress: weight ? Math.round(item.progress / weight) : 0 }))
        .sort((left, right) => right.progress - left.progress),
      highlights,
      updatedAt: latestUpdate,
    };
  }
}
