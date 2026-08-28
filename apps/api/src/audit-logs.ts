import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { PrismaService } from './prisma.service';

const trimOptionalText = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const toOptionalNumber = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);

class AuditLogQueryDto {
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt({ message: 'Trang phải là số nguyên' })
  @Min(1, { message: 'Trang phải lớn hơn hoặc bằng 1' })
  page?: number;

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt({ message: 'Số dòng mỗi trang phải là số nguyên' })
  @Min(10, { message: 'Số dòng mỗi trang phải từ 10 đến 100' })
  @Max(100, { message: 'Số dòng mỗi trang phải từ 10 đến 100' })
  pageSize?: number;

  @IsOptional()
  @Transform(trimOptionalText)
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @Transform(trimOptionalText)
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @IsOptional()
  @Transform(trimOptionalText)
  @IsString()
  @MaxLength(100)
  departmentId?: string;

  @IsOptional()
  @Transform(trimOptionalText)
  @IsString()
  @MaxLength(120, { message: 'Từ khóa tìm kiếm không được vượt quá 120 ký tự' })
  search?: string;

  @IsOptional()
  @Transform(trimOptionalText)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày bắt đầu không hợp lệ' })
  fromDate?: string;

  @IsOptional()
  @Transform(trimOptionalText)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày kết thúc không hợp lệ' })
  toDate?: string;
}

const auditLogSelect = {
  id: true,
  actorUsername: true,
  actorRole: true,
  action: true,
  entityType: true,
  entityId: true,
  departmentId: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

const SAFE_METADATA_KEYS = new Set([
  'aiModel',
  'approved',
  'baseVersion',
  'candidateName',
  'category',
  'channel',
  'changedFields',
  'changedRows',
  'code',
  'confidence',
  'documentCode',
  'documentCount',
  'dashboardId',
  'extractionMethod',
  'failed',
  'fromCandidate',
  'humanEdited',
  'intent',
  'mimeType',
  'publicationVersion',
  'publicCode',
  'planner',
  'tool',
  'reason',
  'size',
  'targetCode',
  'currentActive',
  'currentRole',
  'errorRows',
  'fromStatus',
  'historyCount',
  'passwordReset',
  'previousActive',
  'previousRole',
  'previousVersion',
  'priority',
  'outcome',
  'publishedValue',
  'reviewStatus',
  'role',
  'targetCount',
  'templateKey',
  'toStatus',
  'totalRows',
  'unchangedRows',
  'username',
  'value',
  'version',
  'widgetCount',
  'sourceDocumentId',
  'revision',
  'revoked',
  'visibility',
  'year',
]);

function safeMetadata(value: Prisma.JsonValue | null): Record<string, string | number | boolean | string[]> | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  const safe: Record<string, string | number | boolean | string[]> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      safe[key] = item;
    } else if (Array.isArray(item) && item.every(entry => typeof entry === 'string')) {
      safe[key] = item.slice(0, 30) as string[];
    }
  }
  return Object.keys(safe).length ? safe : null;
}

function startOfLocalDay(value: string): Date {
  // Ngày trên giao diện được hiểu theo múi giờ Việt Nam (UTC+7), không theo UTC.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new BadRequestException('Ngày lọc không hợp lệ');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (calendarCheck.getUTCFullYear() !== year || calendarCheck.getUTCMonth() !== month - 1 || calendarCheck.getUTCDate() !== day) {
    throw new BadRequestException('Ngày lọc không hợp lệ');
  }
  const date = new Date(`${value}T00:00:00.000+07:00`);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Ngày lọc không hợp lệ');
  return date;
}

function nextLocalDay(value: string): Date {
  const date = startOfLocalDay(value);
  date.setTime(date.getTime() + 24 * 60 * 60 * 1000);
  return date;
}

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: AuditLogQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();
    const from = query.fromDate ? startOfLocalDay(query.fromDate) : undefined;
    const toExclusive = query.toDate ? nextLocalDay(query.toDate) : undefined;

    if (from && toExclusive && from >= toExclusive) {
      throw new BadRequestException('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
    }

    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action.trim() } : {}),
      ...(query.entityType ? { entityType: query.entityType.trim() } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId.trim() } : {}),
      ...(from || toExclusive
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) } }
        : {}),
      ...(search
        ? {
            OR: [
              { actorUsername: { contains: search, mode: 'insensitive' } },
              { action: { contains: search, mode: 'insensitive' } },
              { entityType: { contains: search, mode: 'insensitive' } },
              { entityId: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total, actionGroups, entityGroups] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        select: auditLogSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.groupBy({ by: ['action'], orderBy: { action: 'asc' } }),
      this.prisma.auditLog.groupBy({ by: ['entityType'], orderBy: { entityType: 'asc' } }),
    ]);

    const departmentIds = [...new Set(rows.map(row => row.departmentId).filter((id): id is string => Boolean(id)))];
    const departments = departmentIds.length
      ? await this.prisma.department.findMany({
          where: { id: { in: departmentIds } },
          select: { id: true, code: true, name: true },
        })
      : [];
    const departmentById = new Map(departments.map(department => [department.id, department]));

    return {
      items: rows.map(row => ({
        id: row.id,
        actorUsername: row.actorUsername,
        actorRole: row.actorRole,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        departmentId: row.departmentId,
        department: row.departmentId ? departmentById.get(row.departmentId) ?? null : null,
        metadata: safeMetadata(row.metadata),
        createdAt: row.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      filters: {
        actions: actionGroups.map(group => group.action),
        entityTypes: entityGroups.map(group => group.entityType),
      },
    };
  }
}
