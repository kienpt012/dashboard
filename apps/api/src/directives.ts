import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { DirectiveKind, FrameworkKind, Prisma, ProgressReviewStatus, Role, TargetFrequency, ValueSource } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { Actor, audit, getActor, resolveReadDepartmentScope } from './access';
import { JwtAuthGuard } from './common';
import { isDispatcher } from './dispatch';
import { DIRECTIVE_KINDS, monthlyPeriods, monthRange, parsePastedTasks, summarizeTasks, TASK_STATUS, taskMetric, taskStatistics } from './directives-logic';
import { parsePlanningDueDate } from './planning-date';
import { PrismaService } from './prisma.service';
import { RateLimitService } from './rate-limit';
import { createTargetInTransaction } from './target-create';
import { archiveTargetData, restoreTargetData } from './target-lifecycle';
import { departmentManagerIds, notifyUsers, recordWorkEvent, vietnamDayKey } from './work';

const Trim = () => Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value);
const Defined = () => ValidateIf((_object, value) => value !== undefined);
const DateDay = () => Matches(/^(20\d{2}|2100)-\d{2}-\d{2}$/);

class DirectiveQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
  @IsOptional() @IsEnum(DirectiveKind) kind?: DirectiveKind;
  @IsOptional() @Matches(/^(mine|all)$/) scope?: string;
  @IsOptional() @IsString() @MaxLength(100) departmentId?: string;
  @IsOptional() @Matches(/^(NOT_STARTED|IN_PROGRESS|COMPLETED|OVERDUE|DUE_SOON)$/) status?: string;
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @Matches(/^(true|false)$/) includeArchived?: string;
}
class MonthlyQuery {
  @Matches(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/) month!: string;
  @IsOptional() @Matches(/^(mine|all)$/) scope?: string;
  @IsOptional() @IsString() @MaxLength(100) departmentId?: string;
}
class CreateDirectiveDto {
  @Trim() @IsString() @MinLength(3) @MaxLength(500) name!: string;
  @IsEnum(DirectiveKind) directiveKind!: DirectiveKind;
  @Trim() @IsString() @MinLength(1) @MaxLength(100) docNumber!: string;
  @DateDay() issuedDate!: string;
  @Trim() @IsString() @MinLength(1) @MaxLength(300) issuer!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(200) signer?: string;
  @IsOptional() @IsString() @MaxLength(100) sourceDocumentId?: string;
}
class UpdateDirectiveDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @Defined() @Trim() @IsString() @MinLength(3) @MaxLength(500) name?: string;
  @Defined() @IsEnum(DirectiveKind) directiveKind?: DirectiveKind;
  @Defined() @Trim() @IsString() @MinLength(1) @MaxLength(100) docNumber?: string;
  @Defined() @DateDay() issuedDate?: string;
  @Defined() @Trim() @IsString() @MinLength(1) @MaxLength(300) issuer?: string;
  @Defined() @Trim() @IsString() @MaxLength(200) signer?: string;
  @IsOptional() @IsString() @MaxLength(100) sourceDocumentId?: string | null;
  @Defined() @IsBoolean() isActive?: boolean;
}
class CreateTaskDto {
  @Trim() @IsString() @MinLength(3) @MaxLength(500) title!: string;
  @IsString() @MinLength(1) @MaxLength(100) departmentId!: string;
  @DateDay() dueDate!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({ each: true }) coordinatorDepartmentIds?: string[];
  @IsOptional() @IsString() @MaxLength(100) relatedTargetId?: string;
}
class PasteTasksDto {
  @IsString() @MinLength(3) @MaxLength(60_000) text!: string;
  @IsString() @MinLength(1) @MaxLength(100) departmentId!: string;
  @IsOptional() @DateDay() dueDate?: string;
}
class UpdateTaskDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @Defined() @Trim() @IsString() @MinLength(3) @MaxLength(500) title?: string;
  @Defined() @IsString() @MinLength(1) @MaxLength(100) departmentId?: string;
  @Defined() @DateDay() dueDate?: string;
  @Defined() @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({ each: true }) coordinatorDepartmentIds?: string[];
  @IsOptional() @IsString() @MaxLength(100) relatedTargetId?: string | null;
  @Defined() @IsBoolean() isArchived?: boolean;
}
class TaskVersionDto {
  @IsString() @MinLength(1) @MaxLength(100) id!: string;
  @IsInt() @Min(1) expectedVersion!: number;
}
class BulkTasksDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => TaskVersionDto) tasks!: TaskVersionDto[];
  @Defined() @IsString() @MinLength(1) @MaxLength(100) departmentId?: string;
  @Defined() @DateDay() dueDate?: string;
  @Defined() @IsBoolean() isArchived?: boolean;
}

const taskInclude = {
  department: { select: { id: true, name: true, color: true } },
  assignee: { select: { id: true, fullName: true } },
  coordinators: { include: { department: { select: { id: true, name: true, color: true } } } },
  framework: { select: { id: true, name: true, docNumber: true, legalBasis: true, sourceDocument: { select: { docNumber: true } }, directiveKind: true, issuedDate: true, year: true } },
  updates: { where: { reviewStatus: ProgressReviewStatus.APPROVED }, select: { value: true, createdAt: true, reviewedAt: true, periodKey: true } },
} satisfies Prisma.TargetInclude;
type DirectiveTask = Prisma.TargetGetPayload<{ include: typeof taskInclude }>;

function presentTask(task: DirectiveTask, now = new Date()) {
  const { updates, ...fields } = task;
  return { ...fields, ...taskMetric(task, now) };
}
function summary(tasks: DirectiveTask[], documents = 0, now = new Date()) {
  return summarizeTasks(tasks.map(task => taskMetric(task, now)), documents, now, tasks.map(task => task.dueDate));
}
function scopeWhere(departmentId?: string): Prisma.TargetWhereInput {
  return departmentId ? { OR: [{ departmentId }, { coordinators: { some: { departmentId } } }] } : {};
}
function fitsStatus(task: DirectiveTask, status: string | undefined, now: Date) {
  if (!status) return true;
  const metric = taskMetric(task, now);
  return status === 'DUE_SOON' ? metric.status !== 'COMPLETED' && task.dueDate >= now && task.dueDate.getTime() <= now.getTime() + 7 * 86_400_000 : metric.status === status;
}

@Controller('directives')
@UseGuards(JwtAuthGuard)
export class DirectivesController {
  constructor(private readonly prisma: PrismaService, private readonly rateLimit: RateLimitService) {}

  private async context(actor: Actor, requestedDepartmentId?: string, scope?: string) {
    const setting = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    const canDispatch = isDispatcher(actor, setting);
    const departmentId = canDispatch ? requestedDepartmentId?.trim() || undefined : await resolveReadDepartmentScope(this.prisma, actor, requestedDepartmentId, scope);
    if (departmentId && !await this.prisma.department.count({ where: { id: departmentId, isActive: true } })) throw new BadRequestException('Phòng ban không tồn tại hoặc đã ngừng hoạt động');
    return { departmentId, permissions: { canDispatch, canCreate: canDispatch || actor.role === Role.CLERK } };
  }

  private async dispatch(actor: Actor) {
    const ctx = await this.context(actor);
    if (!ctx.permissions.canDispatch) throw new ForbiddenException('Chỉ người phân việc được giao và sửa nhiệm vụ');
    this.rateLimit.consume('directive-write', actor.id, { limit: 60, windowMs: 60_000 });
    return ctx;
  }

  private async framework(client: Pick<Prisma.TransactionClient, 'framework'>, id: string, active = false) {
    const row = await client.framework.findFirst({ where: { id, kind: FrameworkKind.TASK } });
    if (!row) throw new NotFoundException('Không tìm thấy văn bản chỉ đạo');
    if (active && !row.isActive) throw new BadRequestException('Văn bản chỉ đạo đã lưu trữ');
    return row;
  }

  private async document(tx: Prisma.TransactionClient, sourceDocumentId?: string | null) {
    if (sourceDocumentId && !await tx.sourceDocument.count({ where: { id: sourceDocumentId } })) throw new BadRequestException('Không tìm thấy tệp trong Kho văn bản');
  }

  private async related(tx: Prisma.TransactionClient, relatedTargetId?: string | null, taskId?: string) {
    if (!relatedTargetId) return;
    const target = await tx.target.findFirst({ where: { id: relatedTargetId, isArchived: false, kind: { not: FrameworkKind.TASK } } });
    if (!target || target.id === taskId) throw new BadRequestException('Chỉ tiêu liên quan phải là chỉ tiêu đang theo dõi, không phải nhiệm vụ');
  }

  @Get('options')
  async options(@Req() req: any, @Query('scope') scope?: string) {
    const actor = getActor(req);
    const ctx = await this.context(actor, undefined, scope);
    const [departments, documents, relatedTargets] = await Promise.all([
      this.prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true, color: true }, orderBy: { sortOrder: 'asc' } }),
      ctx.permissions.canCreate ? this.prisma.sourceDocument.findMany({ select: { id: true, title: true, docNumber: true, issuedDate: true, issuedBy: true }, orderBy: { issuedDate: 'desc' }, take: 500 }) : [],
      this.prisma.target.findMany({ where: { isArchived: false, kind: { not: FrameworkKind.TASK }, ...scopeWhere(ctx.departmentId) }, select: { id: true, title: true }, orderBy: { title: 'asc' }, take: 2000 }),
    ]);
    return { departments: ctx.departmentId ? departments.filter(dept => dept.id === ctx.departmentId) : departments, documents: documents.map(document => ({ ...document, issuer: document.issuedBy })), relatedTargets, kinds: Object.entries(DIRECTIVE_KINDS).map(([value, label]) => ({ value, label })), permissions: ctx.permissions, defaultDepartmentId: actor.departmentId };
  }

  private async dataset(actor: Actor, query: DirectiveQuery) {
    const ctx = await this.context(actor, query.departmentId, query.scope);
    const now = new Date();
    const q = query.q?.trim();
    const frameworks = await this.prisma.framework.findMany({
      where: { kind: FrameworkKind.TASK, ...(query.includeArchived === 'true' ? {} : { isActive: true }), ...(query.year ? { year: query.year } : {}), ...(query.kind ? { directiveKind: query.kind } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { docNumber: { contains: q, mode: 'insensitive' } }, { legalBasis: { contains: q, mode: 'insensitive' } }] } : {}) },
      orderBy: [{ issuedDate: 'desc' }, { createdAt: 'desc' }],
    });
    const tasks = (await this.prisma.target.findMany({ where: { frameworkId: { in: frameworks.map(row => row.id) }, kind: FrameworkKind.TASK, ...scopeWhere(ctx.departmentId), AND: query.includeArchived === 'true' ? [{ OR: [{ isArchived: false }, { framework: { isActive: false } }] }] : [{ isArchived: false }] }, include: taskInclude, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })).filter(task => fitsStatus(task, query.status, now));
    const visible = frameworks.filter(row => (!ctx.departmentId && !query.status) || tasks.some(task => task.frameworkId === row.id));
    return { ...ctx, now, frameworks: visible, tasks };
  }

  @Get()
  async list(@Req() req: any, @Query() query: DirectiveQuery) {
    const data = await this.dataset(getActor(req), query);
    return { items: data.frameworks.map(row => ({ ...row, summary: summary(data.tasks.filter(task => task.frameworkId === row.id), 1, data.now) })), summary: summary(data.tasks, data.frameworks.length, data.now), permissions: data.permissions };
  }

  private async statisticsData(actor: Actor, query: DirectiveQuery) {
    const data = await this.dataset(actor, query);
    const group = (get: (task: DirectiveTask) => { id: string; name: string }) => {
      const groups = new Map<string, { id: string; name: string; tasks: DirectiveTask[] }>();
      for (const task of data.tasks) { const key = get(task); const row = groups.get(key.id) ?? { ...key, tasks: [] }; row.tasks.push(task); groups.set(key.id, row); }
      return [...groups.values()].map(({ tasks, ...row }) => ({ ...row, ...taskStatistics(tasks.map(task => taskMetric(task, data.now))) })).sort((a, b) => a.id.localeCompare(b.id, 'vi'));
    };
    return {
      summary: { ...summary(data.tasks, data.frameworks.length, data.now), ...taskStatistics(data.tasks.map(task => taskMetric(task, data.now))) },
      byDocument: group(task => ({ id: task.frameworkId!, name: `${task.framework?.docNumber || ''} · ${task.framework?.name || ''}`.replace(/^ · /, '') })),
      byDepartment: group(task => ({ id: task.departmentId, name: task.department.name })),
      byKind: group(task => ({ id: task.framework?.directiveKind ?? 'KHAC', name: DIRECTIVE_KINDS[task.framework?.directiveKind ?? 'KHAC'] })),
      byMonth: group(task => ({ id: vietnamDayKey(task.dueDate).slice(0, 7), name: vietnamDayKey(task.dueDate).slice(0, 7) })), permissions: data.permissions,
    };
  }

  @Get('statistics')
  statistics(@Req() req: any, @Query() query: DirectiveQuery) { return this.statisticsData(getActor(req), query); }

  private async monthlyData(actor: Actor, query: MonthlyQuery) {
    const { start, end, year } = monthRange(query.month);
    const ctx = await this.context(actor, query.departmentId, query.scope);
    const now = new Date();
    const targets = await this.prisma.target.findMany({
      where: { isArchived: false, ...scopeWhere(ctx.departmentId), AND: [
        { OR: [{ frameworkId: null }, { framework: { isActive: true } }] },
        { OR: [{ kind: FrameworkKind.TASK, dueDate: { gte: start, lt: end } }, { kind: { not: FrameworkKind.TASK }, year, valueSource: ValueSource.MANUAL }] },
      ] }, include: taskInclude, orderBy: [{ dueDate: 'asc' }, { sortOrder: 'asc' }],
    });
    type Item = ReturnType<typeof presentTask> & { targetId?: string; periodLabel?: string; periodKey?: string; frameworkName: string | null; docNumber: string | null };
    const groups = new Map<string, { id: string; name: string; items: Item[] }>();
    for (const task of targets) {
      const frameworkName = task.framework?.name ?? null;
      const docNumber = task.framework?.docNumber ?? task.framework?.sourceDocument?.docNumber ?? task.framework?.legalBasis ?? null;
      const groupId = task.frameworkId ?? 'outside-framework';
      const group = groups.get(groupId) ?? { id: groupId, name: [docNumber, frameworkName].filter(Boolean).join(' · ') || 'Chỉ tiêu ngoài bộ', items: [] };
      if (task.kind === FrameworkKind.TASK) group.items.push({ ...presentTask(task, now), frameworkName, docNumber });
      else for (const period of monthlyPeriods(task, query.month)) {
        const report = task.updates.filter(update => update.periodKey === period.key).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        const status = report ? 'COMPLETED' : period.deadline < now ? 'OVERDUE' : 'NOT_STARTED';
        group.items.push({ ...presentTask(task, now), id: `${task.id}:${period.key}`, targetId: task.id, dueDate: period.deadline, status, progress: report ? 100 : 0, periodLabel: period.label, periodKey: period.key, frameworkName, docNumber } as Item);
      }
      if (group.items.length) groups.set(groupId, group);
    }
    const department = ctx.departmentId ? await this.prisma.department.findUnique({ where: { id: ctx.departmentId }, select: { name: true } }) : null;
    return { month: query.month, departmentName: department?.name ?? 'Toàn địa phương', groups: [...groups.values()], permissions: ctx.permissions };
  }

  @Get('monthly')
  monthly(@Req() req: any, @Query() query: MonthlyQuery) { return this.monthlyData(getActor(req), query); }

  private worksheet(workbook: ExcelJS.Workbook, name: string, headers: string[], rows: (string | number | Date | null)[][]) {
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = headers.map((header, index) => ({ header, width: index === 0 ? 55 : 22 }));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    for (const row of rows) { const added = sheet.addRow(row); added.alignment = { wrapText: true, vertical: 'top' }; added.eachCell(cell => { if (cell.value instanceof Date) cell.numFmt = 'dd/mm/yyyy'; }); }
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  }
  private async sendWorkbook(actor: Actor, res: Response, workbook: ExcelJS.Workbook, file: string) {
    await audit(this.prisma, actor, { action: 'DIRECTIVE_EXPORTED', entityType: 'Framework', metadata: { sheets: workbook.worksheets.length } });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer));
  }

  @Get('statistics.xlsx')
  async statisticsExcel(@Req() req: any, @Res() res: Response, @Query() query: DirectiveQuery) {
    const actor = getActor(req); const data = await this.statisticsData(actor, query); const workbook = new ExcelJS.Workbook();
    const columns = ['Nội dung', 'Số giao', 'Hoàn thành đúng hạn', 'Hoàn thành trễ', 'Đang thực hiện', 'Chưa bắt đầu', 'Quá hạn', 'Tỷ lệ hoàn thành (%)', 'Ngày trễ bình quân'];
    for (const [name, rows] of [['Theo văn bản', data.byDocument], ['Theo phòng', data.byDepartment], ['Theo loại', data.byKind], ['Theo tháng', data.byMonth]] as const) this.worksheet(workbook, name, columns, rows.map(row => [row.name, row.total, row.completedOnTime, row.completedLate, row.inProgress, row.notStarted, row.overdue, row.completionRate, row.averageLateDays]));
    return this.sendWorkbook(actor, res, workbook, 'Thong-ke-van-ban-chi-dao.xlsx');
  }

  @Get('monthly.xlsx')
  async monthlyExcel(@Req() req: any, @Res() res: Response, @Query() query: MonthlyQuery) {
    const actor = getActor(req); const data = await this.monthlyData(actor, query); const workbook = new ExcelJS.Workbook();
    this.worksheet(workbook, 'Việc theo tháng', ['Nội dung', 'Văn bản giao', 'Phòng chủ trì', 'Người phụ trách', 'Hạn hoàn thành', 'Trạng thái', 'Kỳ báo cáo'], data.groups.flatMap(group => group.items.map(item => [item.title, group.name, item.department.name, item.assignee?.fullName ?? 'Chưa giao', item.dueDate, TASK_STATUS[item.status], item.periodLabel ?? ''])));
    return this.sendWorkbook(actor, res, workbook, `Viec-theo-thang-${query.month}.xlsx`);
  }

  @Get('related/:targetId')
  async relatedTasks(@Req() req: any, @Param('targetId') targetId: string) {
    const ctx = await this.context(getActor(req));
    if (!await this.prisma.target.count({ where: { id: targetId, ...scopeWhere(ctx.departmentId) } })) throw new NotFoundException('Không tìm thấy chỉ tiêu');
    const items = await this.prisma.target.findMany({ where: { relatedTargetId: targetId, isArchived: false, kind: FrameworkKind.TASK, framework: { isActive: true }, ...scopeWhere(ctx.departmentId) }, include: taskInclude, orderBy: { dueDate: 'asc' } });
    return { items: items.map(task => presentTask(task)) };
  }

  @Get(':id')
  async detail(@Req() req: any, @Param('id') id: string) {
    const ctx = await this.context(getActor(req));
    const framework = await this.framework(this.prisma, id);
    const tasks = await this.prisma.target.findMany({ where: { frameworkId: id, kind: FrameworkKind.TASK, ...(framework.isActive ? { isArchived: false } : {}), ...scopeWhere(ctx.departmentId) }, include: taskInclude, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    if (ctx.departmentId && !tasks.length) throw new NotFoundException('Không tìm thấy văn bản chỉ đạo trong phạm vi của bạn');
    const sourceDocument = framework.sourceDocumentId ? await this.prisma.sourceDocument.findUnique({ where: { id: framework.sourceDocumentId }, select: { id: true, title: true, docNumber: true } }) : null;
    return { ...framework, sourceDocument, tasks: tasks.map(task => presentTask(task)), summary: summary(tasks, 1), permissions: ctx.permissions };
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateDirectiveDto) {
    const actor = getActor(req); const ctx = await this.context(actor);
    if (!ctx.permissions.canCreate) throw new ForbiddenException('Bạn không có quyền tạo văn bản chỉ đạo');
    this.rateLimit.consume('directive-write', actor.id, { limit: 60, windowMs: 60_000 });
    const issuedDate = parsePlanningDueDate(dto.issuedDate);
    return this.prisma.$transaction(async tx => {
      await this.document(tx, dto.sourceDocumentId);
      const row = await tx.framework.create({ data: { ...dto, issuedDate, year: issuedDate.getUTCFullYear(), code: `VB-${randomUUID()}`, kind: FrameworkKind.TASK, sourceDocumentId: dto.sourceDocumentId || null, legalBasis: dto.docNumber } });
      await audit(tx, actor, { action: 'DIRECTIVE_CREATED', entityType: 'Framework', entityId: row.id, departmentId: null });
      return row;
    });
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateDirectiveDto) {
    const actor = getActor(req); await this.dispatch(actor);
    return this.prisma.$transaction(async tx => {
      await this.framework(tx, id); await this.document(tx, dto.sourceDocumentId);
      const { expectedVersion, issuedDate: raw, ...rest } = dto;
      const issuedDate = raw ? parsePlanningDueDate(raw) : undefined;
      const changed = await tx.framework.updateMany({ where: { id, version: expectedVersion }, data: { ...rest, sourceDocumentId: dto.sourceDocumentId === '' ? null : dto.sourceDocumentId, ...(issuedDate ? { issuedDate, year: issuedDate.getUTCFullYear() } : {}), ...(dto.docNumber ? { legalBasis: dto.docNumber } : {}), version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException('Văn bản vừa thay đổi. Vui lòng tải lại.');
      if (dto.isActive === false) await tx.target.updateMany({ where: { frameworkId: id, isArchived: false }, data: { ...archiveTargetData(actor.id, 'Lưu trữ văn bản chỉ đạo'), version: { increment: 1 }, publicationVersion: { increment: 1 } } });
      if (dto.isActive === true) await tx.target.updateMany({ where: { frameworkId: id, isArchived: true, archiveReason: 'Lưu trữ văn bản chỉ đạo' }, data: { ...restoreTargetData(), version: { increment: 1 }, publicationVersion: { increment: 1 } } });
      await audit(tx, actor, { action: 'DIRECTIVE_UPDATED', entityType: 'Framework', entityId: id, metadata: { version: expectedVersion + 1, archived: dto.isActive === false } });
      return tx.framework.findUniqueOrThrow({ where: { id } });
    });
  }

  private async createTask(tx: Prisma.TransactionClient, actor: Actor, framework: Awaited<ReturnType<DirectivesController['framework']>>, dto: { title: string; departmentId: string; dueDate: Date; coordinatorDepartmentIds?: string[]; relatedTargetId?: string }, ordinal: number) {
    await this.related(tx, dto.relatedTargetId);
    const created = await createTargetInTransaction(tx, actor, { ...dto, unit: '%', targetValue: 100, weight: 1, year: framework.year ?? dto.dueDate.getUTCFullYear(), frequency: TargetFrequency.YEARLY, direction: 'HIGHER_IS_BETTER', isHighlighted: false, frameworkId: framework.id, kind: FrameworkKind.TASK, ordinal: String(ordinal), sortOrder: ordinal * 10, sourceDocumentId: framework.sourceDocumentId ?? undefined, legalBasis: framework.docNumber ?? framework.legalBasis ?? undefined });
    await tx.target.update({ where: { id: created.id }, data: { relatedTargetId: dto.relatedTargetId || null, dispatchedById: actor.id, dispatchedByName: actor.fullName, dispatchedAt: new Date() } });
    await notifyUsers(tx, await departmentManagerIds(tx, dto.departmentId), { kind: 'TASK_DISPATCHED', title: `${dto.title} — nhiệm vụ được giao`, link: `/admin/targets/${created.id}`, entityType: 'Target', entityId: created.id, dedupeKey: `task-dispatched:${created.id}:1` }, actor.id);
    return tx.target.findUniqueOrThrow({ where: { id: created.id }, include: taskInclude });
  }

  @Post(':id/tasks')
  async addTask(@Req() req: any, @Param('id') id: string, @Body() dto: CreateTaskDto) {
    const actor = getActor(req); await this.dispatch(actor);
    return this.transaction(async tx => { const framework = await this.framework(tx, id, true); const ordinal = await tx.target.count({ where: { frameworkId: id } }); return presentTask(await this.createTask(tx, actor, framework, { ...dto, dueDate: parsePlanningDueDate(dto.dueDate) }, ordinal + 1)); });
  }

  @Post(':id/paste')
  async paste(@Req() req: any, @Param('id') id: string, @Body() dto: PasteTasksDto) {
    const actor = getActor(req); await this.dispatch(actor);
    const items = parsePastedTasks(dto.text, dto.dueDate);
    return this.transaction(async tx => {
      const framework = await this.framework(tx, id, true); const ordinal = await tx.target.count({ where: { frameworkId: id } }); const tasks = [];
      for (const [index, item] of items.entries()) tasks.push(presentTask(await this.createTask(tx, actor, framework, { ...item, departmentId: dto.departmentId }, ordinal + index + 1)));
      await audit(tx, actor, { action: 'DIRECTIVE_TASKS_PASTED', entityType: 'Framework', entityId: id, metadata: { count: tasks.length } });
      return { created: tasks.length, tasks };
    });
  }

  private async changeTask(tx: Prisma.TransactionClient, actor: Actor, frameworkId: string, taskId: string, dto: UpdateTaskDto) {
    const task = await tx.target.findFirst({ where: { id: taskId, frameworkId, kind: FrameworkKind.TASK } });
    if (!task) throw new NotFoundException('Không tìm thấy nhiệm vụ trong văn bản');
    const departmentId = dto.departmentId ?? task.departmentId;
    if (!await tx.department.count({ where: { id: departmentId, isActive: true } })) throw new BadRequestException('Phòng chủ trì không tồn tại hoặc đã ngừng hoạt động');
    const coordination = dto.coordinatorDepartmentIds?.filter(id => id !== departmentId);
    if (coordination && await tx.department.count({ where: { id: { in: coordination }, isActive: true } }) !== coordination.length) throw new BadRequestException('Phòng phối hợp không tồn tại hoặc đã ngừng hoạt động');
    await this.related(tx, dto.relatedTargetId, taskId);
    const moved = departmentId !== task.departmentId;
    const { expectedVersion, coordinatorDepartmentIds: ignored, dueDate: raw, ...rest } = dto;
    const changed = await tx.target.updateMany({ where: { id: taskId, version: expectedVersion }, data: {
      ...rest, relatedTargetId: dto.relatedTargetId === '' ? null : dto.relatedTargetId, dueDate: raw ? parsePlanningDueDate(raw) : undefined,
      ...(moved ? { assigneeId: null, assignedAt: null, assignedById: null, transferCount: 0, bounceCount: 0 } : {}),
      ...(dto.departmentId ? { dispatchedById: actor.id, dispatchedByName: actor.fullName, dispatchedAt: new Date() } : {}),
      ...(dto.isArchived === undefined ? {} : dto.isArchived ? archiveTargetData(actor.id, 'Lưu trữ nhiệm vụ') : restoreTargetData()), version: { increment: 1 }, publicationVersion: { increment: 1 },
    } });
    if (changed.count !== 1) throw new ConflictException('Nhiệm vụ vừa thay đổi. Vui lòng tải lại.');
    if (coordination) { await tx.targetCoordinator.deleteMany({ where: { targetId: taskId } }); if (coordination.length) await tx.targetCoordinator.createMany({ data: coordination.map(departmentId => ({ targetId: taskId, departmentId })) }); }
    else if (moved) await tx.targetCoordinator.deleteMany({ where: { targetId: taskId, departmentId } });
    await audit(tx, actor, { action: 'DIRECTIVE_TASK_UPDATED', entityType: 'Target', entityId: taskId, departmentId, metadata: { version: expectedVersion + 1, departmentChanged: moved } });
    await recordWorkEvent(tx, { action: 'TARGET_UPDATED', actor, targetId: taskId, departmentId, note: moved ? 'Điều chỉnh phòng chủ trì nhiệm vụ' : 'Điều chỉnh nhiệm vụ' });
    if (moved) await notifyUsers(tx, await departmentManagerIds(tx, departmentId), { kind: 'TASK_DISPATCHED', title: `${task.title} — nhiệm vụ được giao`, link: `/admin/targets/${taskId}`, entityType: 'Target', entityId: taskId, dedupeKey: `task-dispatched:${taskId}:${expectedVersion + 1}` }, actor.id);
    return presentTask(await tx.target.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude }));
  }

  @Patch(':id/tasks/:taskId')
  async editTask(@Req() req: any, @Param('id') id: string, @Param('taskId') taskId: string, @Body() dto: UpdateTaskDto) {
    const actor = getActor(req); await this.dispatch(actor);
    return this.transaction(async tx => { await this.framework(tx, id, true); return this.changeTask(tx, actor, id, taskId, dto); });
  }

  @Post(':id/bulk')
  async bulk(@Req() req: any, @Param('id') id: string, @Body() dto: BulkTasksDto) {
    const actor = getActor(req); await this.dispatch(actor);
    if (!dto.departmentId && !dto.dueDate && dto.isArchived === undefined) throw new BadRequestException('Chọn phòng, hạn hoặc thao tác lưu trữ');
    if (new Set(dto.tasks.map(task => task.id)).size !== dto.tasks.length) throw new BadRequestException('Danh sách nhiệm vụ bị trùng');
    return this.transaction(async tx => {
      await this.framework(tx, id, true); const tasks = [];
      for (const item of dto.tasks) tasks.push(await this.changeTask(tx, actor, id, item.id, { expectedVersion: item.expectedVersion, departmentId: dto.departmentId, dueDate: dto.dueDate, isArchived: dto.isArchived }));
      return { updated: tasks.length, tasks };
    });
  }

  private async transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try { return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 }); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new ConflictException('Dữ liệu vừa thay đổi. Vui lòng tải lại và thử lại.'); throw error; }
  }
}
