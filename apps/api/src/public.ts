import { createHash } from 'node:crypto';
import { Controller, Get, Query } from '@nestjs/common';
import { Prisma, TargetStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { calculateProgress } from './metrics';
import { PrismaService } from './prisma.service';
import { currentVietnamYear } from './planning-date';

const publicTargetSelect = Prisma.validator<Prisma.TargetSelect>()({
  id: true,
  departmentId: true,
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
});

type PublicTargetRow = Prisma.TargetGetPayload<{ select: typeof publicTargetSelect }>;

const publicTargetOrderBy: Prisma.TargetOrderByWithRelationInput[] = [
  { publishedHighlighted: 'desc' },
  { publishedOrder: 'asc' },
  // publishedAt changes every time an indicator is republished. Using it for
  // offset pagination could move an already-seen row onto a later page (and
  // push an unseen row backwards), which makes citizens lose or repeat rows
  // while loading more. The immutable target code plus id form a stable
  // tie-breaker (including legacy rows that gain a snapshot on first republish);
  // publishedOrder remains the administrator-controlled primary order.
  { code: 'asc' },
  { id: 'asc' },
];

function publicTargetWhere(year: number): Prisma.TargetWhereInput {
  return {
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
  };
}

function stablePublicKey(namespace: string, value: string) {
  return `${namespace}_${createHash('sha256').update(value).digest('base64url').slice(0, 22)}`;
}

export function publicDepartmentKey(departmentId: string) {
  return stablePublicKey('dep', departmentId);
}

function publicTargetKey(id: string) {
  return stablePublicKey('target', id);
}

function toPublishedTarget(target: PublicTargetRow) {
  // publishedCode đánh dấu bản ghi có snapshot đầy đủ. Không dùng toán tử
  // ?? cho từng trường vì description/order có thể được công bố hợp lệ là null.
  const hasSnapshot = target.publishedCode !== null;
  const departmentName = hasSnapshot ? target.publishedDepartmentName! : target.department.name;
  const departmentColor = hasSnapshot ? target.publishedDepartmentColor! : target.department.color;
  const targetValue = target.publishedTargetValue!;
  const currentValue = target.publishedValue!;
  const direction = target.publishedDirection!;
  return {
    key: publicTargetKey(target.id),
    code: hasSnapshot ? target.publishedCode! : target.code,
    title: hasSnapshot ? target.publishedTitle! : target.title,
    description: hasSnapshot ? target.publishedDescription : target.description,
    unit: hasSnapshot ? target.publishedUnit! : target.unit,
    weight: hasSnapshot ? target.publishedWeight! : target.weight,
    year: hasSnapshot ? target.publishedYear! : target.year,
    frequency: hasSnapshot ? target.publishedFrequency! : target.frequency,
    dueDate: hasSnapshot ? target.publishedDueDate! : target.dueDate,
    departmentName,
    departmentColor,
    departmentKey: publicDepartmentKey(target.departmentId),
    isHighlighted: hasSnapshot ? target.publishedHighlighted! : target.isHighlighted,
    publicOrder: hasSnapshot ? target.publishedOrder : target.publicOrder,
    publishedAt: target.publishedAt,
    targetValue,
    currentValue,
    direction,
    status: target.publishedStatus!,
    progress: calculateProgress(targetValue, currentValue, direction),
  };
}

class PublicOverviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Năm công bố phải là số nguyên' })
  @Min(2000, { message: 'Năm công bố không hợp lệ' })
  @Max(2100, { message: 'Năm công bố không hợp lệ' })
  year?: number;
}

class PublicTargetsQueryDto extends PublicOverviewQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^dep_[A-Za-z0-9_-]{22}$/, { message: 'Bộ lọc phòng ban không hợp lệ' })
  department?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Trang phải là số nguyên' })
  @Min(1, { message: 'Trang phải lớn hơn hoặc bằng 1' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số bản ghi mỗi trang phải là số nguyên' })
  @Min(1, { message: 'Số bản ghi mỗi trang phải lớn hơn hoặc bằng 1' })
  @Max(12, { message: 'Mỗi trang chỉ hiển thị tối đa 12 chỉ tiêu' })
  pageSize?: number;
}

@Controller('public')
export class PublicController {
  constructor(private prisma: PrismaService) {}

  private async loadPublishedTargets(year: number) {
    const rows = await this.prisma.target.findMany({
      where: publicTargetWhere(year),
      select: publicTargetSelect,
      orderBy: publicTargetOrderBy,
    });
    return rows.map(toPublishedTarget);
  }

  private toPublicTarget(target: Awaited<ReturnType<PublicController['loadPublishedTargets']>>[number]) {
    return {
      key: target.key,
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
      departmentColor: target.departmentColor,
      departmentKey: target.departmentKey,
      status: target.status,
      publishedAt: target.publishedAt,
    };
  }

  private async resolveYear(requestedYear?: number) {
    if (requestedYear) return requestedYear;
    const setting = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    return setting?.defaultYear ?? currentVietnamYear();
  }

  @Get('overview')
  async overview(@Query() query: PublicOverviewQueryDto) {
    const year = await this.resolveYear(query.year);
    const targets = await this.loadPublishedTargets(year);
    const weightedTotal = targets.reduce((sum, target) => sum + target.weight, 0);
    const weightedProgress = targets.reduce(
      (sum, target) => sum + (target.progress / 100) * target.weight,
      0,
    );
    const completed = targets.filter(target => target.status === TargetStatus.COMPLETED).length;
    const onTrack = targets.filter(target => target.status === TargetStatus.ON_TRACK).length;
    const departments = new Map<string, {
      key: string;
      name: string;
      color: string;
      total: number;
      completed: number;
      progress: number;
      weight: number;
      latestPublishedAt: Date | null;
    }>();
    for (const target of targets) {
      const departmentKey = target.departmentKey;
      const item = departments.get(departmentKey) || {
        key: target.departmentKey,
        name: target.departmentName,
        color: target.departmentColor,
        total: 0,
        completed: 0,
        progress: 0,
        weight: 0,
        latestPublishedAt: null,
      };
      if (
        target.publishedAt
        && (!item.latestPublishedAt || target.publishedAt > item.latestPublishedAt)
      ) {
        item.name = target.departmentName;
        item.color = target.departmentColor;
        item.latestPublishedAt = target.publishedAt;
      }
      item.total += 1;
      item.completed += target.status === TargetStatus.COMPLETED ? 1 : 0;
      item.progress += target.progress * target.weight;
      item.weight += target.weight;
      departments.set(departmentKey, item);
    }
    const highlights = targets
      .filter(target => target.isHighlighted)
      .slice(0, 6)
      .map(target => this.toPublicTarget(target));
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
        .map(({ weight, latestPublishedAt: _latestPublishedAt, ...item }) => ({
          ...item,
          progress: weight ? Math.round(item.progress / weight) : 0,
        }))
        .sort((left, right) => right.progress - left.progress),
      highlights,
      updatedAt: latestUpdate,
    };
  }

  @Get('targets')
  async targets(@Query() query: PublicTargetsQueryDto) {
    const year = await this.resolveYear(query.year);
    const baseWhere = publicTargetWhere(year);
    const department = query.department?.trim();
    let where = baseWhere;

    if (department) {
      const publishedDepartments = await this.prisma.target.findMany({
        where: baseWhere,
        select: { departmentId: true },
        distinct: ['departmentId'],
      });
      const matchedDepartment = publishedDepartments
        .map(target => ({
          departmentId: target.departmentId,
          key: publicDepartmentKey(target.departmentId),
        }))
        .find(item => item.key === department);

      if (!matchedDepartment) {
        return {
          year,
          items: [],
          total: 0,
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 6,
          pageCount: 0,
          department,
        };
      }

      where = {
        AND: [
          baseWhere,
          { departmentId: matchedDepartment.departmentId },
        ],
      };
    }

    const pageSize = query.pageSize ?? 6;
    const total = await this.prisma.target.count({ where });
    const pageCount = Math.ceil(total / pageSize);
    const page = query.page ?? 1;
    const start = (page - 1) * pageSize;
    const rows = await this.prisma.target.findMany({
      where,
      select: publicTargetSelect,
      orderBy: publicTargetOrderBy,
      skip: start,
      take: pageSize,
    });

    return {
      year,
      items: rows.map(toPublishedTarget).map(target => this.toPublicTarget(target)),
      total,
      page,
      pageSize,
      pageCount,
      department: department || null,
    };
  }
}
