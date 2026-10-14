import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  FeedbackStatus,
  FrameworkKind,
  Prisma,
  ProgressReviewStatus,
  Role,
  ValueSource,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsArray, IsInt, IsObject, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { type Actor, audit, getActor, isGlobalRole, SYSTEM_ACTOR, WORKING_ROLES } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import {
  type DatasetColumn,
  datasetsReferenced,
  evaluateFormula,
  type FormulaResult,
  type FormulaSpec,
  formatFormula,
  normalizeRow,
  type Row,
  validateColumns,
  validateFormula,
} from './formula';
import { evaluateTarget } from './metrics';
import { periodKeyFor } from './periods';
import { PrismaService } from './prisma.service';
import { BUILTIN_DATASETS } from './templates';
import { recordWorkEvent } from './work';

// Kho dữ liệu nghiệp vụ: bảng có cấu trúc mà chỉ tiêu tự tính từ đó (QĐ "từ dữ liệu đến trách nhiệm").
// Mỗi khi dữ liệu đổi, mọi chỉ tiêu dùng bảng đó được tính lại ngay; giá trị đổi thì ghi một báo cáo đã duyệt
// đứng tên người vừa sửa dữ liệu — nhờ vậy con số trên màn hình điều hành luôn truy được về dòng dữ liệu gốc.

const Trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
const ValidateIfDefined = () => ValidateIf((_object, value) => value !== undefined);
const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 2000;
const MAX_ROWS_PER_DATASET = 20000;

type PrismaLike = Pick<PrismaService, 'dataset' | 'datasetRow' | 'feedback' | 'target' | '$transaction'>;

export function isBuiltinDataset(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILTIN_DATASETS, code);
}

function asColumns(value: Prisma.JsonValue): DatasetColumn[] {
  return Array.isArray(value) ? (value as unknown as DatasetColumn[]) : [];
}

/** Cột của các bảng (kể cả bảng dựng sẵn) — dùng để kiểm tra công thức trước khi lưu. */
export async function datasetColumnsMap(prisma: Pick<PrismaService, 'dataset'>, codes?: string[]): Promise<Map<string, DatasetColumn[]>> {
  const map = new Map<string, DatasetColumn[]>();
  for (const [code, builtin] of Object.entries(BUILTIN_DATASETS)) {
    if (!codes || codes.includes(code)) map.set(code, builtin.columns);
  }
  const custom = await prisma.dataset.findMany({
    where: codes ? { code: { in: codes.filter(code => !isBuiltinDataset(code)) } } : {},
    select: { code: true, columns: true },
  });
  for (const dataset of custom) map.set(dataset.code, asColumns(dataset.columns));
  return map;
}

function vnDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return new Date(value.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const FEEDBACK_DONE: FeedbackStatus[] = [FeedbackStatus.RESOLVED, FeedbackStatus.CLOSED, FeedbackStatus.REJECTED];
const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  RECEIVED: 'Tiếp nhận',
  ASSIGNED: 'Đã phân công',
  IN_PROGRESS: 'Đang xử lý',
  WAITING_CITIZEN: 'Chờ người dân bổ sung',
  PENDING_REVIEW: 'Chờ duyệt kết quả',
  RESOLVED: 'Đã giải quyết',
  CLOSED: 'Đã đóng',
  REJECTED: 'Không tiếp nhận',
  REOPENED: 'Mở lại',
};

/** Dòng dữ liệu của bảng dựng sẵn "phản ánh": không chứa thông tin cá nhân người gửi. */
async function feedbackRows(prisma: Pick<PrismaService, 'feedback'>): Promise<Row[]> {
  const items = await prisma.feedback.findMany({
    select: {
      code: true,
      createdAt: true,
      dueAt: true,
      resolvedAt: true,
      closedAt: true,
      category: true,
      status: true,
      department: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return items.map(item => {
    const done = FEEDBACK_DONE.includes(item.status);
    const finishedAt = item.resolvedAt ?? item.closedAt;
    return {
      ma: item.code,
      ngay_tiep_nhan: vnDate(item.createdAt),
      han_xu_ly: vnDate(item.dueAt),
      ngay_giai_quyet: vnDate(finishedAt),
      nhom_van_de: item.category,
      trang_thai: FEEDBACK_STATUS_LABEL[item.status],
      da_ket_thuc: done,
      dung_han: Boolean(done && finishedAt && (!item.dueAt || finishedAt <= item.dueAt)),
      don_vi: item.department?.name ?? null,
    };
  });
}

/** Bộ nạp dòng dữ liệu có bộ nhớ đệm trong một lượt tính. */
export function createRowLoader(prisma: Pick<PrismaService, 'datasetRow' | 'dataset' | 'feedback'>) {
  const cache = new Map<string, Row[]>();
  return async (codes: string[]) => {
    for (const code of codes) {
      if (cache.has(code)) continue;
      if (code === 'feedback') {
        cache.set(code, await feedbackRows(prisma));
        continue;
      }
      const dataset = await prisma.dataset.findUnique({ where: { code }, select: { id: true } });
      const rows = dataset
        ? await prisma.datasetRow.findMany({ where: { datasetId: dataset.id }, select: { data: true }, orderBy: { createdAt: 'asc' } })
        : [];
      cache.set(code, rows.map(row => (row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as Row : {})));
    }
    return (code: string) => cache.get(code) ?? [];
  };
}

/** Tính một công thức cho một năm, trả kèm dấu vết (bảng nào, bao nhiêu dòng khớp). */
export async function evaluateTargetFormula(prisma: PrismaLike, formula: FormulaSpec, year: number): Promise<FormulaResult> {
  const load = createRowLoader(prisma);
  const getRows = await load(datasetsReferenced(formula));
  return evaluateFormula(formula, getRows, { year });
}

function computedValue(kind: FrameworkKind, result: FormulaResult): number | null {
  if (kind === FrameworkKind.SCORE) return result.score ?? (result.value === null ? null : result.value);
  return result.value;
}

async function riskThreshold(prisma: Pick<PrismaService, 'systemSetting'>) {
  return (await prisma.systemSetting.findUnique({ where: { id: 'default' } }))?.riskThreshold ?? 70;
}

export interface RecomputeOutcome {
  targetId: string;
  code: string;
  title: string;
  previousValue: number;
  value: number | null;
  changed: boolean;
  warnings: string[];
}

/**
 * Tính lại các chỉ tiêu tự tính. Lọc theo danh sách chỉ tiêu, hoặc theo bảng dữ liệu vừa thay đổi.
 * `actor` là người vừa sửa dữ liệu; khi là hệ thống thì chỉ cập nhật giá trị, không tạo báo cáo đứng tên ai.
 */
export async function recomputeTargets(
  prisma: PrismaService,
  actor: Actor,
  filter: { targetIds?: string[]; datasetCode?: string },
): Promise<RecomputeOutcome[]> {
  const candidates = await prisma.target.findMany({
    where: {
      valueSource: ValueSource.COMPUTED,
      isArchived: false,
      ...(filter.targetIds ? { id: { in: filter.targetIds } } : {}),
    },
    select: {
      id: true, code: true, title: true, kind: true, year: true, formula: true, version: true, currentValue: true,
      targetValue: true, direction: true, dueDate: true, frequency: true, lastReportedAt: true, departmentId: true, parentId: true,
    },
  });
  const relevant = candidates.filter(target => {
    if (!target.formula) return false;
    if (!filter.datasetCode) return true;
    try {
      return datasetsReferenced(target.formula as unknown as FormulaSpec).includes(filter.datasetCode);
    } catch {
      return false;
    }
  });
  if (!relevant.length) return [];
  const threshold = await riskThreshold(prisma);
  const load = createRowLoader(prisma);
  const outcomes: RecomputeOutcome[] = [];
  const touchedParents = new Set<string>();
  for (const target of relevant) {
    const formula = target.formula as unknown as FormulaSpec;
    const getRows = await load(datasetsReferenced(formula));
    const result = evaluateFormula(formula, getRows, { year: target.year });
    const value = computedValue(target.kind, result);
    const changed = value !== null && (value !== target.currentValue || !target.lastReportedAt);
    outcomes.push({ targetId: target.id, code: target.code, title: target.title, previousValue: target.currentValue, value, changed, warnings: result.warnings });
    if (!changed || value === null) continue;
    const evaluation = evaluateTarget({
      targetValue: target.targetValue,
      currentValue: value,
      direction: target.direction,
      dueDate: target.dueDate,
      riskThreshold: threshold,
      hasReport: true,
      kind: target.kind,
    });
    const now = new Date();
    try {
      await prisma.$transaction(async tx => {
        const updated = await tx.target.updateMany({
          where: { id: target.id, version: target.version, isArchived: false },
          data: {
            currentValue: value,
            status: evaluation.status,
            lastReportedAt: now,
            computedAt: now,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) return; // Có người vừa đổi chỉ tiêu: lượt tính sau sẽ cập nhật.
        if (actor.id !== SYSTEM_ACTOR.id) {
          await tx.progressUpdate.create({
            data: {
              targetId: target.id,
              userId: actor.id,
              value,
              periodKey: periodKeyFor(target.frequency, now),
              dataSource: 'Tự tính từ kho dữ liệu',
              note: `Tự tính từ kho dữ liệu sau khi ${actor.fullName} cập nhật dữ liệu nguồn`,
              baseVersion: target.version,
              reviewStatus: ProgressReviewStatus.APPROVED,
              reviewedBy: actor.id,
              reviewedAt: now,
            },
          });
        }
        await recordWorkEvent(tx, {
          action: 'COMPUTED_UPDATE',
          actor,
          targetId: target.id,
          departmentId: target.departmentId,
          note: `Giá trị tự tính đổi từ ${target.currentValue} thành ${value}`,
          metadata: { value, previousValue: target.currentValue },
        });
      });
      if (target.parentId) touchedParents.add(target.parentId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2025'].includes(error.code)) continue;
      throw error;
    }
  }
  if (touchedParents.size) await rollupParents(prisma, [...touchedParents], actor);
  return outcomes;
}

/**
 * Tổng hợp chỉ tiêu cha có valueSource = CHILDREN: bộ chấm điểm cộng điểm các con (không vượt điểm tối đa);
 * các loại khác lấy tiến độ bình quân có trọng số của con quy về giá trị của cha.
 */
export async function rollupParents(prisma: PrismaService, parentIds: string[], actor: Actor, depth = 0): Promise<void> {
  if (!parentIds.length || depth > 5) return;
  const threshold = await riskThreshold(prisma);
  const grandParents = new Set<string>();
  for (const parentId of parentIds) {
    const parent = await prisma.target.findUnique({
      where: { id: parentId },
      include: { children: { where: { isArchived: false } } },
    });
    if (!parent || parent.isArchived || parent.valueSource !== ValueSource.CHILDREN || !parent.children.length) continue;
    const reported = parent.children.filter(child => child.lastReportedAt);
    if (!reported.length) continue;
    let value: number;
    if (parent.kind === FrameworkKind.SCORE) {
      value = parent.children.reduce((sum, child) => sum + (child.lastReportedAt ? child.currentValue : 0), 0);
      if (parent.maxScore) value = Math.min(value, parent.maxScore);
    } else {
      const weights = parent.children.reduce((sum, child) => sum + child.weight, 0) || 1;
      const progress = parent.children.reduce((sum, child) => {
        const metric = evaluateTarget({
          targetValue: child.targetValue, currentValue: child.currentValue, direction: child.direction,
          dueDate: child.dueDate, riskThreshold: threshold, hasReport: Boolean(child.lastReportedAt), kind: child.kind,
        });
        return sum + metric.progress * child.weight;
      }, 0) / weights;
      value = (parent.targetValue || 100) * progress / 100;
    }
    value = Math.round(value * 100) / 100;
    if (value === parent.currentValue && parent.lastReportedAt) continue;
    const evaluation = evaluateTarget({
      targetValue: parent.targetValue, currentValue: value, direction: parent.direction, dueDate: parent.dueDate,
      riskThreshold: threshold, hasReport: true, kind: parent.kind,
    });
    const now = new Date();
    await prisma.$transaction(async tx => {
      const updated = await tx.target.updateMany({
        where: { id: parent.id, version: parent.version },
        data: { currentValue: value, status: evaluation.status, lastReportedAt: now, computedAt: now, version: { increment: 1 } },
      });
      if (updated.count !== 1) return;
      await recordWorkEvent(tx, {
        action: 'COMPUTED_UPDATE',
        actor,
        targetId: parent.id,
        departmentId: parent.departmentId,
        note: `Tổng hợp từ ${parent.children.length} chỉ tiêu con: ${parent.currentValue} → ${value}`,
        metadata: { value, previousValue: parent.currentValue },
      });
    });
    if (parent.parentId) grandParents.add(parent.parentId);
  }
  if (grandParents.size) await rollupParents(prisma, [...grandParents], actor, depth + 1);
}

// ───────────────────────────── API ─────────────────────────────

class CreateDatasetDto {
  @Trim() @Matches(/^[a-z][a-z0-9_]{2,47}$/, { message: 'Mã bảng gồm chữ thường không dấu, số, gạch dưới; 3–48 ký tự, bắt đầu bằng chữ' })
  code!: string;
  @Trim() @IsString() @MinLength(3) @MaxLength(160) name!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(1000) description?: string;
  @IsArray({ message: 'Danh sách cột không hợp lệ' }) columns!: unknown[];
  @IsOptional() @IsString() ownerDepartmentId?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(120) updateCycle?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(300) sourceSystem?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(2000) collectionGuide?: string;
}

class UpdateDatasetDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @ValidateIfDefined() @Trim() @IsString() @MinLength(3) @MaxLength(160) name?: string;
  @ValidateIfDefined() @Trim() @IsString() @MaxLength(1000) description?: string;
  @ValidateIfDefined() @IsArray() columns?: unknown[];
  @ValidateIfDefined() @IsString() ownerDepartmentId?: string;
  @ValidateIfDefined() @Trim() @IsString() @MaxLength(120) updateCycle?: string;
  @ValidateIfDefined() @Trim() @IsString() @MaxLength(300) sourceSystem?: string;
  @ValidateIfDefined() @Trim() @IsString() @MaxLength(2000) collectionGuide?: string;
}

class RowDto {
  @IsObject({ message: 'Dữ liệu dòng không hợp lệ' }) data!: Record<string, unknown>;
}

class UpdateRowDto extends RowDto {
  @IsInt() @Min(1) expectedVersion!: number;
}

function validateWorkbook(file?: Express.Multer.File) {
  if (!file) throw new BadRequestException('Vui lòng chọn tệp Excel');
  if (!file.originalname.toLowerCase().endsWith('.xlsx')) throw new BadRequestException('Chỉ hỗ trợ tệp Excel .xlsx');
  if (file.size > MAX_IMPORT_FILE_SIZE) throw new BadRequestException('Tệp Excel vượt quá 5MB');
  if (file.buffer.length < 4 || file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) {
    throw new BadRequestException('Nội dung tệp không phải Excel .xlsx hợp lệ');
  }
  return file;
}

function fold(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value as unknown;
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const rich = value as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(rich.richText)) return rich.richText.map(part => part.text).join('');
    if (rich.result !== undefined) return rich.result;
    if (typeof rich.text === 'string') return rich.text;
    return null;
  }
  return value;
}

function canEditDataset(actor: Actor, ownerDepartmentId: string | null): boolean {
  if (isGlobalRole(actor.role)) return true;
  if (actor.role !== Role.MANAGER && actor.role !== Role.STAFF) return false;
  return Boolean(ownerDepartmentId && actor.departmentId === ownerDepartmentId);
}

@Controller('datasets')
@UseGuards(JwtAuthGuard)
export class DatasetsController {
  constructor(private readonly prisma: PrismaService) {}

  private async usage() {
    const targets = await this.prisma.target.findMany({
      where: { valueSource: ValueSource.COMPUTED, isArchived: false },
      select: { id: true, code: true, title: true, formula: true, currentValue: true, unit: true, kind: true, framework: { select: { name: true } } },
    });
    const byDataset = new Map<string, typeof targets>();
    for (const target of targets) {
      let codes: string[] = [];
      try { codes = datasetsReferenced(target.formula as unknown as FormulaSpec); } catch { codes = []; }
      for (const code of codes) byDataset.set(code, [...(byDataset.get(code) ?? []), target]);
    }
    return byDataset;
  }

  private async findDataset(code: string) {
    const dataset = await this.prisma.dataset.findUnique({ where: { code }, include: { ownerDepartment: { select: { id: true, name: true } } } });
    if (!dataset) throw new NotFoundException('Không tìm thấy bảng dữ liệu');
    return dataset;
  }

  @Get()
  async list(@Req() req: any) {
    const actor = getActor(req);
    const [datasets, usage] = await Promise.all([
      this.prisma.dataset.findMany({
        where: { isActive: true },
        include: { ownerDepartment: { select: { id: true, name: true } }, _count: { select: { rows: true } } },
        orderBy: { name: 'asc' },
      }),
      this.usage(),
    ]);
    const builtins = Object.entries(BUILTIN_DATASETS).map(([code, builtin]) => ({
      code, name: builtin.name, description: builtin.description, builtin: true, columns: builtin.columns,
      rowCount: null, lastDataAt: null, ownerDepartment: null, updateCycle: 'Tự động', sourceSystem: 'Dữ liệu của chính hệ thống IOC',
      canEdit: false, usedBy: (usage.get(code) ?? []).map(target => ({ id: target.id, code: target.code, title: target.title, framework: target.framework?.name ?? null })),
    }));
    return [
      ...builtins,
      ...datasets.map(dataset => ({
        id: dataset.id,
        code: dataset.code,
        name: dataset.name,
        description: dataset.description,
        builtin: false,
        columns: asColumns(dataset.columns),
        rowCount: dataset._count.rows,
        lastDataAt: dataset.lastDataAt,
        ownerDepartment: dataset.ownerDepartment,
        updateCycle: dataset.updateCycle,
        sourceSystem: dataset.sourceSystem,
        collectionGuide: dataset.collectionGuide,
        version: dataset.version,
        canEdit: canEditDataset(actor, dataset.ownerDepartmentId),
        usedBy: (usage.get(dataset.code) ?? []).map(target => ({ id: target.id, code: target.code, title: target.title, framework: target.framework?.name ?? null })),
      })),
    ];
  }

  @Get(':code/rows')
  async rows(@Req() req: any, @Param('code') code: string, @Query('take') takeRaw?: string, @Query('skip') skipRaw?: string) {
    getActor(req);
    const take = Math.min(Math.max(Number(takeRaw) || 200, 1), 500);
    const skip = Math.max(Number(skipRaw) || 0, 0);
    if (code === 'feedback') {
      const rows = await feedbackRows(this.prisma);
      return { total: rows.length, rows: rows.slice(skip, skip + take).map((data, index) => ({ id: `feedback-${skip + index}`, data, version: 1, readOnly: true })) };
    }
    const dataset = await this.findDataset(code);
    const [total, rows] = await Promise.all([
      this.prisma.datasetRow.count({ where: { datasetId: dataset.id } }),
      this.prisma.datasetRow.findMany({ where: { datasetId: dataset.id }, orderBy: { createdAt: 'desc' }, take, skip }),
    ]);
    const userIds = [...new Set(rows.flatMap(row => [row.createdById, row.updatedById]).filter((id): id is string => Boolean(id)))];
    const users = userIds.length ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : [];
    const names = new Map(users.map(user => [user.id, user.fullName]));
    return {
      total,
      rows: rows.map(row => ({
        id: row.id, data: row.data, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt,
        createdBy: names.get(row.createdById) ?? null, updatedBy: row.updatedById ? names.get(row.updatedById) ?? null : null,
      })),
    };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.LEADER, Role.CLERK)
  async create(@Req() req: any, @Body() dto: CreateDatasetDto) {
    const actor = getActor(req);
    if (isBuiltinDataset(dto.code)) throw new ConflictException('Mã bảng trùng với bảng dữ liệu dựng sẵn');
    const columns = validateColumns(dto.columns);
    if (!columns.ok) throw new BadRequestException(columns.errors.join(' '));
    try {
      return await this.prisma.$transaction(async tx => {
        if (dto.ownerDepartmentId) {
          const department = await tx.department.findUnique({ where: { id: dto.ownerDepartmentId } });
          if (!department?.isActive) throw new BadRequestException('Đơn vị chủ quản không tồn tại hoặc đã ngừng hoạt động');
        }
        const dataset = await tx.dataset.create({
          data: {
            code: dto.code, name: dto.name, description: dto.description, columns: columns.columns as unknown as Prisma.InputJsonValue,
            ownerDepartmentId: dto.ownerDepartmentId, updateCycle: dto.updateCycle, sourceSystem: dto.sourceSystem, collectionGuide: dto.collectionGuide,
          },
        });
        await audit(tx, actor, { action: 'DATASET_CREATED', entityType: 'Dataset', entityId: dataset.id, departmentId: dto.ownerDepartmentId ?? null, metadata: { code: dataset.code } });
        return dataset;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Mã bảng dữ liệu đã tồn tại');
      throw error;
    }
  }

  @Patch(':code')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.LEADER, Role.CLERK)
  async update(@Req() req: any, @Param('code') code: string, @Body() dto: UpdateDatasetDto) {
    const actor = getActor(req);
    const dataset = await this.findDataset(code);
    if (dataset.version !== dto.expectedVersion) throw new ConflictException('Bảng dữ liệu vừa được cập nhật. Vui lòng tải lại.');
    let columns: DatasetColumn[] | undefined;
    if (dto.columns !== undefined) {
      const parsed = validateColumns(dto.columns);
      if (!parsed.ok) throw new BadRequestException(parsed.errors.join(' '));
      columns = parsed.columns;
      const rowCount = await this.prisma.datasetRow.count({ where: { datasetId: dataset.id } });
      const removed = asColumns(dataset.columns).filter(old => !columns!.some(column => column.key === old.key && column.type === old.type));
      if (rowCount > 0 && removed.length) {
        throw new ConflictException('Bảng đã có dữ liệu nên không được xóa hoặc đổi kiểu cột; chỉ được đổi nhãn hoặc thêm cột mới.');
      }
      const usage = await this.usage();
      for (const target of usage.get(code) ?? []) {
        const check = validateFormula(target.formula, new Map([...(await datasetColumnsMap(this.prisma)).entries(), [code, columns]]));
        if (!check.ok) throw new ConflictException(`Thay đổi cột làm hỏng công thức của chỉ tiêu ${target.code}: ${check.errors.join(' ')}`);
      }
    }
    return this.prisma.$transaction(async tx => {
      const changed = await tx.dataset.updateMany({
        where: { id: dataset.id, version: dto.expectedVersion },
        data: {
          name: dto.name, description: dto.description, ownerDepartmentId: dto.ownerDepartmentId, updateCycle: dto.updateCycle,
          sourceSystem: dto.sourceSystem, collectionGuide: dto.collectionGuide,
          ...(columns ? { columns: columns as unknown as Prisma.InputJsonValue } : {}),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Bảng dữ liệu vừa được cập nhật. Vui lòng tải lại.');
      await audit(tx, actor, { action: 'DATASET_UPDATED', entityType: 'Dataset', entityId: dataset.id, departmentId: dataset.ownerDepartmentId, metadata: { code } });
      return tx.dataset.findUniqueOrThrow({ where: { id: dataset.id } });
    });
  }

  @Post(':code/rows')
  @UseGuards(RolesGuard)
  @Roles(...WORKING_ROLES)
  async addRow(@Req() req: any, @Param('code') code: string, @Body() dto: RowDto) {
    const actor = getActor(req);
    const dataset = await this.findDataset(code);
    if (!canEditDataset(actor, dataset.ownerDepartmentId)) throw new ForbiddenException('Chỉ đơn vị chủ quản hoặc lãnh đạo, văn thư được cập nhật bảng dữ liệu này');
    const normalized = normalizeRow(asColumns(dataset.columns), dto.data);
    if (!normalized.ok) throw new BadRequestException(normalized.errors.join(' '));
    const count = await this.prisma.datasetRow.count({ where: { datasetId: dataset.id } });
    if (count >= MAX_ROWS_PER_DATASET) throw new BadRequestException('Bảng đã đạt giới hạn 20.000 dòng');
    const row = await this.prisma.$transaction(async tx => {
      const created = await tx.datasetRow.create({ data: { datasetId: dataset.id, data: normalized.row as Prisma.InputJsonValue, createdById: actor.id } });
      await tx.dataset.update({ where: { id: dataset.id }, data: { lastDataAt: new Date() } });
      await audit(tx, actor, { action: 'DATASET_ROW_CREATED', entityType: 'DatasetRow', entityId: created.id, departmentId: dataset.ownerDepartmentId, metadata: { code } });
      return created;
    });
    const recomputed = await recomputeTargets(this.prisma, actor, { datasetCode: code });
    return { row, recomputed };
  }

  @Patch(':code/rows/:rowId')
  @UseGuards(RolesGuard)
  @Roles(...WORKING_ROLES)
  async updateRow(@Req() req: any, @Param('code') code: string, @Param('rowId') rowId: string, @Body() dto: UpdateRowDto) {
    const actor = getActor(req);
    const dataset = await this.findDataset(code);
    if (!canEditDataset(actor, dataset.ownerDepartmentId)) throw new ForbiddenException('Bạn không có quyền sửa bảng dữ liệu này');
    const normalized = normalizeRow(asColumns(dataset.columns), dto.data);
    if (!normalized.ok) throw new BadRequestException(normalized.errors.join(' '));
    await this.prisma.$transaction(async tx => {
      const changed = await tx.datasetRow.updateMany({
        where: { id: rowId, datasetId: dataset.id, version: dto.expectedVersion },
        data: { data: normalized.row as Prisma.InputJsonValue, updatedById: actor.id, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Dòng dữ liệu vừa được người khác sửa hoặc đã bị xóa. Vui lòng tải lại.');
      await tx.dataset.update({ where: { id: dataset.id }, data: { lastDataAt: new Date() } });
      await audit(tx, actor, { action: 'DATASET_ROW_UPDATED', entityType: 'DatasetRow', entityId: rowId, departmentId: dataset.ownerDepartmentId, metadata: { code } });
    });
    const recomputed = await recomputeTargets(this.prisma, actor, { datasetCode: code });
    return { ok: true, recomputed };
  }

  @Delete(':code/rows/:rowId')
  @UseGuards(RolesGuard)
  @Roles(...WORKING_ROLES)
  async deleteRow(@Req() req: any, @Param('code') code: string, @Param('rowId') rowId: string) {
    const actor = getActor(req);
    const dataset = await this.findDataset(code);
    if (!canEditDataset(actor, dataset.ownerDepartmentId)) throw new ForbiddenException('Bạn không có quyền sửa bảng dữ liệu này');
    await this.prisma.$transaction(async tx => {
      const removed = await tx.datasetRow.deleteMany({ where: { id: rowId, datasetId: dataset.id } });
      if (removed.count !== 1) throw new NotFoundException('Không tìm thấy dòng dữ liệu');
      await tx.dataset.update({ where: { id: dataset.id }, data: { lastDataAt: new Date() } });
      await audit(tx, actor, { action: 'DATASET_ROW_DELETED', entityType: 'DatasetRow', entityId: rowId, departmentId: dataset.ownerDepartmentId, metadata: { code } });
    });
    const recomputed = await recomputeTargets(this.prisma, actor, { datasetCode: code });
    return { ok: true, recomputed };
  }

  /** Tải biểu mẫu Excel đúng cột của bảng để đơn vị điền rồi nhập lại. */
  @Get(':code/template.xlsx')
  async template(@Req() req: any, @Param('code') code: string, @Res() res: Response) {
    getActor(req);
    const dataset = await this.findDataset(code);
    const columns = asColumns(dataset.columns);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IOC';
    const sheet = workbook.addWorksheet('Du lieu');
    sheet.addRow(columns.map(column => column.label));
    sheet.getRow(1).font = { bold: true };
    columns.forEach((column, index) => {
      sheet.getColumn(index + 1).width = Math.max(14, column.label.length + 4);
      const note = column.type === 'enum' ? `Chọn một trong: ${(column.options ?? []).join('; ')}`
        : column.type === 'date' ? 'Ngày dạng dd/mm/yyyy'
          : column.type === 'boolean' ? 'Có hoặc Không'
            : column.type === 'number' ? 'Số' : 'Văn bản';
      sheet.getRow(1).getCell(index + 1).note = `${note}${column.required ? ' — bắt buộc' : ''}`;
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const name = `Bieu_mau_${dataset.code}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(Buffer.from(buffer as ArrayBuffer));
  }

  /** Nhập dòng từ Excel: dòng 1 là tiêu đề (nhãn hoặc mã cột). `apply=true` ghi; ngược lại chỉ xem trước. Có lỗi thì không ghi dòng nào. */
  @Post(':code/import')
  @UseGuards(RolesGuard)
  @Roles(...WORKING_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_SIZE, files: 1 } }))
  async importRows(@Req() req: any, @Param('code') code: string, @UploadedFile() uploaded: Express.Multer.File, @Query('apply') applyRaw?: string) {
    const actor = getActor(req);
    const dataset = await this.findDataset(code);
    if (!canEditDataset(actor, dataset.ownerDepartmentId)) throw new ForbiddenException('Bạn không có quyền nhập dữ liệu cho bảng này');
    const file = validateWorkbook(uploaded);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer as any);
    } catch {
      throw new BadRequestException('Không đọc được tệp Excel; tệp có thể bị hỏng');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('Tệp Excel không có trang dữ liệu');
    const columns = asColumns(dataset.columns);
    const header = sheet.getRow(1);
    const mapping = new Map<number, DatasetColumn>();
    header.eachCell((cell, index) => {
      const text = fold(String(cellValue(cell) ?? ''));
      const column = columns.find(item => fold(item.label) === text || item.key === text);
      if (column) mapping.set(index, column);
    });
    const missing = columns.filter(column => column.required && ![...mapping.values()].includes(column));
    if (missing.length) throw new BadRequestException(`Thiếu cột bắt buộc: ${missing.map(column => column.label).join(', ')}`);
    const parsed: { line: number; row?: Row; errors?: string[] }[] = [];
    sheet.eachRow((row, line) => {
      if (line === 1) return;
      const input: Record<string, unknown> = {};
      let hasValue = false;
      for (const [index, column] of mapping) {
        const value = cellValue(row.getCell(index));
        if (value !== null && value !== '') hasValue = true;
        input[column.key] = value instanceof Date ? value : value;
      }
      if (!hasValue) return;
      const result = normalizeRow(columns, input);
      parsed.push(result.ok ? { line, row: result.row } : { line, errors: result.errors });
    });
    if (parsed.length > MAX_IMPORT_ROWS) throw new BadRequestException(`Mỗi lần nhập tối đa ${MAX_IMPORT_ROWS} dòng`);
    const errors = parsed.filter(item => item.errors).map(item => ({ line: item.line, errors: item.errors! }));
    const preview = { total: parsed.length, valid: parsed.length - errors.length, errors: errors.slice(0, 50), sample: parsed.filter(item => item.row).slice(0, 10).map(item => item.row) };
    if (applyRaw !== 'true') return { applied: false, ...preview };
    if (errors.length) throw new BadRequestException(`Tệp còn ${errors.length} dòng lỗi; sửa xong mới nhập được.`);
    await this.prisma.$transaction(async tx => {
      await tx.datasetRow.createMany({
        data: parsed.map(item => ({ datasetId: dataset.id, data: item.row as Prisma.InputJsonValue, createdById: actor.id })),
      });
      await tx.dataset.update({ where: { id: dataset.id }, data: { lastDataAt: new Date() } });
      await audit(tx, actor, { action: 'DATASET_IMPORTED', entityType: 'Dataset', entityId: dataset.id, departmentId: dataset.ownerDepartmentId, metadata: { code, totalRows: parsed.length } });
    });
    const recomputed = await recomputeTargets(this.prisma, actor, { datasetCode: code });
    return { applied: true, ...preview, recomputed };
  }
}

/** Mô tả công thức và dấu vết tính cho màn hình hồ sơ chỉ tiêu. */
export async function describeTargetFormula(prisma: PrismaService, formula: Prisma.JsonValue, year: number) {
  const spec = formula as unknown as FormulaSpec;
  const columns = await datasetColumnsMap(prisma, datasetsReferenced(spec));
  const names = new Map<string, string>(Object.entries(BUILTIN_DATASETS).map(([code, item]) => [code, item.name]));
  const custom = await prisma.dataset.findMany({ where: { code: { in: [...columns.keys()] } }, select: { code: true, name: true } });
  custom.forEach(item => names.set(item.code, item.name));
  const result = await evaluateTargetFormula(prisma, spec, year);
  return {
    text: formatFormula(spec, {
      dataset: code => names.get(code) ?? code,
      column: (dataset, key) => columns.get(dataset)?.find(column => column.key === key)?.label ?? key,
    }),
    result,
    datasets: [...columns.keys()].map(code => ({ code, name: names.get(code) ?? code, builtin: isBuiltinDataset(code) })),
  };
}
