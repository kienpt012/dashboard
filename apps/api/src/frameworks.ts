import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  Department,
  DepartmentKind,
  FrameworkKind,
  IssuingLevel,
  Prisma,
  Role,
  TargetDirection,
  TargetStatus,
  ValueSource,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { type Actor, audit, getActor, LEADERSHIP_ROLES, resolveDepartmentScope } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { datasetColumnsMap, recomputeTargets, rollupParents } from './datasets';
import { validateFormula } from './formula';
import { evaluateTarget } from './metrics';
import { currentVietnamYear, parsePlanningDueDate } from './planning-date';
import { PrismaService } from './prisma.service';
import { createTargetInTransaction } from './target-create';
import {
  findFrameworkTemplate,
  FRAMEWORK_TEMPLATES,
  frameworkTemplateSummary,
  type FrameworkTemplate,
  type OrgRole,
  type TemplateTarget,
} from './templates';

// Bộ chỉ tiêu: mỗi văn bản giao hoặc bộ chỉ số là một bộ (KT-XH, chuyển đổi số, thống kê, nhiệm vụ…).
// Địa phương mới chọn bộ mẫu từ thư viện, hệ thống tự gán phòng chủ trì theo vai trò nghiệp vụ.

const Trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
const ValidateIfDefined = () => ValidateIf((_object, value) => value !== undefined);

export const FRAMEWORK_KIND_LABELS: Record<FrameworkKind, string> = {
  PLAN: 'Kế hoạch – thực hiện',
  SCORE: 'Chấm điểm',
  TASK: 'Nhiệm vụ',
  STAT: 'Thống kê',
};

export const ISSUING_LEVEL_LABELS: Record<IssuingLevel, string> = {
  CENTRAL: 'Trung ương giao',
  PROVINCE: 'Tỉnh/Thành phố giao',
  LOCAL: 'Địa phương tự đặt',
};

const CODE_ROLES: Record<string, OrgRole> = {
  VP: 'OFFICE', KTHTDT: 'ECONOMY', KT: 'ECONOMY', VHXH: 'SOCIAL', TTCC: 'CENTER', CAND: 'POLICE', QS: 'MILITARY',
  MTTQ: 'FRONT', BHXH: 'SOCIAL_INSURANCE', TKCS: 'STATISTICS', BGH: 'LEADERSHIP', LD: 'LEADERSHIP',
};

const ROLE_KEYWORDS: [OrgRole, RegExp][] = [
  ['POLICE', /cong an/],
  ['MILITARY', /quan su/],
  ['FRONT', /mat tran/],
  ['SOCIAL_INSURANCE', /bao hiem xa hoi/],
  ['STATISTICS', /thong ke/],
  ['CENTER', /phuc vu hanh chinh|mot cua/],
  ['SOCIAL', /van hoa|xa hoi/],
  ['ECONOMY', /kinh te|tai chinh|ha tang|do thi/],
  ['OFFICE', /van phong/],
];

/** Vai trò nào không có phòng tương ứng thì giao cho vai trò thay thế (vd chưa tạo Công an → Văn phòng). */
const ROLE_FALLBACKS: Record<OrgRole, OrgRole[]> = {
  LEADERSHIP: ['OFFICE'],
  OFFICE: ['LEADERSHIP', 'ECONOMY'],
  ECONOMY: ['OFFICE'],
  SOCIAL: ['OFFICE'],
  CENTER: ['OFFICE'],
  POLICE: ['OFFICE'],
  MILITARY: ['OFFICE'],
  FRONT: ['SOCIAL', 'OFFICE'],
  SOCIAL_INSURANCE: ['SOCIAL', 'OFFICE'],
  STATISTICS: ['ECONOMY', 'OFFICE'],
  ACADEMIC: ['OFFICE', 'LEADERSHIP'],
  OTHER: ['OFFICE'],
};

function fold(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

export function departmentRole(department: Pick<Department, 'code' | 'name' | 'kind' | 'responsibilities'>): OrgRole | null {
  const byCode = CODE_ROLES[department.code.toUpperCase()];
  if (byCode) return byCode;
  if (department.kind === DepartmentKind.OFFICE) return 'OFFICE';
  if (department.kind === DepartmentKind.CENTER) return 'CENTER';
  if (department.kind === DepartmentKind.LEADERSHIP) return 'LEADERSHIP';
  const text = fold(`${department.name} ${department.responsibilities ?? ''}`);
  return ROLE_KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

/** Chọn phòng thực tế cho một vai trò nghiệp vụ, có phương án thay thế; luôn trả về một phòng nếu địa phương có phòng hoạt động. */
export function departmentResolver(departments: Department[]) {
  const active = departments.filter(department => department.isActive);
  const byRole = new Map<OrgRole, Department>();
  for (const department of [...active].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const role = departmentRole(department);
    if (role && !byRole.has(role)) byRole.set(role, department);
  }
  return {
    exact: (role: OrgRole) => byRole.get(role) ?? null,
    resolve: (role: OrgRole): Department | null => {
      if (byRole.has(role)) return byRole.get(role)!;
      for (const fallback of ROLE_FALLBACKS[role] ?? []) if (byRole.has(fallback)) return byRole.get(fallback)!;
      return active[0] ?? null;
    },
  };
}

function templateDepth(target: TemplateTarget, byKey: Map<string, TemplateTarget>): number {
  let depth = 0;
  let current = target;
  while (current.parentKey && byKey.has(current.parentKey) && depth < 10) {
    current = byKey.get(current.parentKey)!;
    depth += 1;
  }
  return depth;
}

export interface TemplateApplyResult {
  frameworkId: string;
  code: string;
  name: string;
  createdTargets: number;
  createdDatasets: string[];
  computedTargets: number;
  needsPlanValue: number;
  alreadyExisted: boolean;
}

/**
 * Nạp một bộ mẫu cho một năm trong MỘT transaction (đủ hoặc không có gì): tạo bộ, bảng dữ liệu còn thiếu và toàn
 * bộ chỉ tiêu (cha trước, con sau). Bộ đã nạp cho năm đó thì không nạp lại. Sau khi ghi xong, chỉ tiêu tự tính được
 * tính ngay từ dữ liệu sẵn có.
 */
export async function applyFrameworkTemplate(
  prisma: PrismaService,
  actor: Actor,
  template: FrameworkTemplate,
  year: number,
): Promise<TemplateApplyResult> {
  const code = template.codeFor(year);
  const existing = await prisma.framework.findUnique({ where: { code } });
  if (existing) {
    return { frameworkId: existing.id, code, name: existing.name, createdTargets: 0, createdDatasets: [], computedTargets: 0, needsPlanValue: 0, alreadyExisted: true };
  }
  const departments = await prisma.department.findMany();
  const resolver = departmentResolver(departments);
  if (!resolver.resolve('OFFICE')) throw new BadRequestException('Địa phương chưa có phòng ban nào đang hoạt động. Hãy tạo cơ cấu tổ chức trước.');

  // Công thức phải hợp lệ với cột của bảng (kể cả bảng sắp tạo) trước khi ghi bất cứ thứ gì.
  const columns = await datasetColumnsMap(prisma);
  for (const dataset of template.datasets ?? []) if (!columns.has(dataset.code)) columns.set(dataset.code, dataset.columns);
  for (const target of template.targets) {
    if (!target.formula) continue;
    const check = validateFormula(target.formula, columns);
    if (!check.ok) throw new BadRequestException(`Công thức mẫu của chỉ tiêu ${target.key} không hợp lệ: ${check.errors.join(' ')}`);
  }

  const byKey = new Map(template.targets.map(target => [target.key, target]));
  const ordered = [...template.targets]
    .map((target, index) => ({ target, index, depth: templateDepth(target, byKey) }))
    .sort((a, b) => a.depth - b.depth || a.index - b.index);
  const dueDate = parsePlanningDueDate(`${year}-12-31`);

  const result = await prisma.$transaction(async tx => {
    const framework = await tx.framework.create({
      data: {
        code,
        name: template.nameFor(year),
        kind: template.kind,
        issuingLevel: template.issuingLevel,
        year,
        legalBasis: template.legalBasis,
        description: template.description,
        maxScore: template.maxScore,
        templateKey: template.key,
        sortOrder: FRAMEWORK_TEMPLATES.indexOf(template) * 10 + 10,
      },
    });
    const createdDatasets: string[] = [];
    for (const dataset of template.datasets ?? []) {
      const found = await tx.dataset.findUnique({ where: { code: dataset.code } });
      if (found) continue;
      const owner = resolver.resolve(dataset.ownerRole);
      await tx.dataset.create({
        data: {
          code: dataset.code,
          name: dataset.name,
          description: dataset.description,
          columns: dataset.columns as unknown as Prisma.InputJsonValue,
          ownerDepartmentId: owner?.id,
          updateCycle: dataset.updateCycle,
          sourceSystem: dataset.sourceSystem,
          collectionGuide: dataset.collectionGuide,
          templateKey: template.key,
        },
      });
      createdDatasets.push(dataset.code);
    }
    const ids = new Map<string, string>();
    for (const { target, index } of ordered) {
      const lead = resolver.resolve(target.leadRole)!;
      const coordinators = (target.coordinateRoles ?? [])
        .map(role => resolver.exact(role))
        .filter((department): department is Department => Boolean(department) && department!.id !== lead.id)
        .map(department => department.id);
      const created = await createTargetInTransaction(tx, actor, {
        title: target.title,
        description: target.description,
        unit: target.unit,
        targetValue: target.maxScore ?? target.targetValue ?? 0,
        weight: target.weight ?? 1,
        year,
        frequency: target.frequency,
        direction: target.direction ?? TargetDirection.HIGHER_IS_BETTER,
        dueDate,
        departmentId: lead.id,
        isHighlighted: false,
        legalBasis: template.legalBasis,
        frameworkId: framework.id,
        kind: template.kind,
        issuingLevel: template.issuingLevel,
        ordinal: target.ordinal,
        standardCode: target.standardCode,
        groupName: target.groupName,
        sortOrder: (index + 1) * 10,
        parentId: target.parentKey ? ids.get(target.parentKey) ?? null : null,
        targetText: target.targetText,
        maxScore: target.maxScore,
        scoringRule: target.scoringRule,
        evidenceRequirement: target.evidenceRequirement,
        dataSourceSystem: target.dataSourceSystem,
        dataSourceAgency: target.dataSourceAgency,
        collectionGuide: target.collectionGuide,
        reportDueDay: target.reportDueDay,
        valueSource: target.formula ? ValueSource.COMPUTED : target.sumChildren ? ValueSource.CHILDREN : ValueSource.MANUAL,
        formula: target.formula as unknown as Prisma.InputJsonValue | undefined,
        coordinatorDepartmentIds: coordinators,
      }, { templateKey: template.key });
      ids.set(target.key, created.id);
    }
    await audit(tx, actor, {
      action: 'FRAMEWORK_TEMPLATE_APPLIED',
      entityType: 'Framework',
      entityId: framework.id,
      departmentId: null,
      metadata: { code, templateKey: template.key, year, targetCount: template.targets.length },
    });
    return { framework, createdDatasets, ids };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000, maxWait: 10_000 });

  const computedIds = template.targets.filter(target => target.formula).map(target => result.ids.get(target.key)!).filter(Boolean);
  const outcomes = computedIds.length ? await recomputeTargets(prisma, actor, { targetIds: computedIds }) : [];
  return {
    frameworkId: result.framework.id,
    code,
    name: result.framework.name,
    createdTargets: template.targets.length,
    createdDatasets: result.createdDatasets,
    computedTargets: outcomes.filter(outcome => outcome.value !== null).length,
    needsPlanValue: template.targets.filter(target => target.needsPlanValue).length,
    alreadyExisted: false,
  };
}

class CreateFrameworkDto {
  @Trim() @Matches(/^[A-Z0-9][A-Z0-9_-]{1,39}$/, { message: 'Mã bộ chỉ tiêu gồm chữ in hoa không dấu, số, gạch ngang; 2–40 ký tự' })
  code!: string;
  @Trim() @IsString() @MinLength(3) @MaxLength(200) name!: string;
  @IsEnum(FrameworkKind, { message: 'Loại bộ chỉ tiêu không hợp lệ' }) kind!: FrameworkKind;
  @IsEnum(IssuingLevel, { message: 'Cấp giao không hợp lệ' }) issuingLevel!: IssuingLevel;
  @IsOptional() @IsInt() @Min(2000) @Max(2100) year?: number;
  @IsOptional() @Trim() @IsString() @MaxLength(300) legalBasis?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(1000) maxScore?: number;
  @IsOptional() @IsBoolean() showOnWallboard?: boolean;
}

class UpdateFrameworkDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @ValidateIfDefined() @Trim() @IsString() @MinLength(3) @MaxLength(200) name?: string;
  @ValidateIfDefined() @IsEnum(IssuingLevel) issuingLevel?: IssuingLevel;
  @ValidateIfDefined() @Trim() @IsString() @MaxLength(300) legalBasis?: string;
  @ValidateIfDefined() @Trim() @IsString() @MaxLength(2000) description?: string;
  @ValidateIfDefined() @IsBoolean() showOnWallboard?: boolean;
  @ValidateIfDefined() @IsBoolean() isActive?: boolean;
  @ValidateIfDefined() @IsInt() @Min(0) sortOrder?: number;
}

class ApplyTemplateDto {
  @IsInt() @Min(2000) @Max(2100) year!: number;
}

/** Tóm tắt một bộ chỉ tiêu cho màn hình điều hành: tiến độ, điểm, độ đầy đủ hồ sơ. */
export function summarizeFramework(
  framework: { id: string; kind: FrameworkKind; maxScore: number | null },
  targets: {
    id: string; parentId: string | null; kind: FrameworkKind; status: TargetStatus; progress: number; weight: number;
    currentValue: number; maxScore: number | null; hasReport: boolean; directiveCount: number; evaluationCount: number;
  }[],
) {
  const topLevel = targets.filter(target => !target.parentId || !targets.some(other => other.id === target.parentId));
  const leaves = targets.filter(target => !targets.some(other => other.parentId === target.id));
  const counts = Object.values(TargetStatus).reduce((acc, status) => ({ ...acc, [status]: leaves.filter(target => target.status === status).length }), {} as Record<TargetStatus, number>);
  const weight = topLevel.reduce((sum, target) => sum + target.weight, 0);
  const progress = weight ? Math.round(topLevel.reduce((sum, target) => sum + target.progress * target.weight, 0) / weight) : 0;
  const score = framework.kind === FrameworkKind.SCORE ? Math.round(topLevel.reduce((sum, target) => sum + (target.hasReport ? target.currentValue : 0), 0) * 100) / 100 : null;
  return {
    total: leaves.length,
    counts,
    progress: framework.kind === FrameworkKind.STAT ? null : progress,
    score,
    maxScore: framework.kind === FrameworkKind.SCORE ? framework.maxScore ?? topLevel.reduce((sum, target) => sum + (target.maxScore ?? 0), 0) : null,
    reported: leaves.filter(target => target.hasReport).length,
    withDirective: leaves.filter(target => target.directiveCount > 0).length,
    withEvaluation: leaves.filter(target => target.evaluationCount > 0).length,
  };
}

@Controller('frameworks')
@UseGuards(JwtAuthGuard)
export class FrameworksController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('templates')
  templates() {
    return FRAMEWORK_TEMPLATES.map(frameworkTemplateSummary);
  }

  @Get()
  async list(@Req() req: any, @Query('includeInactive') includeInactive?: string) {
    const actor = getActor(req);
    const departmentId = resolveDepartmentScope(actor);
    const [frameworks, setting] = await Promise.all([
      this.prisma.framework.findMany({
        where: includeInactive === 'true' ? {} : { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.systemSetting.findUnique({ where: { id: 'default' } }),
    ]);
    const targets = await this.prisma.target.findMany({
      where: { frameworkId: { in: frameworks.map(framework => framework.id) }, isArchived: false, ...(departmentId ? { departmentId } : {}) },
      select: {
        id: true, frameworkId: true, parentId: true, kind: true, weight: true, currentValue: true, targetValue: true, direction: true,
        dueDate: true, lastReportedAt: true, maxScore: true,
        _count: { select: { directives: true, evaluations: true } },
      },
    });
    const threshold = setting?.riskThreshold ?? 70;
    return frameworks.map(framework => {
      const own = targets.filter(target => target.frameworkId === framework.id).map(target => {
        const metric = evaluateTarget({
          targetValue: target.targetValue, currentValue: target.currentValue, direction: target.direction, dueDate: target.dueDate,
          riskThreshold: threshold, hasReport: Boolean(target.lastReportedAt), kind: target.kind,
        });
        return {
          id: target.id, parentId: target.parentId, kind: target.kind, status: metric.status, progress: metric.progress, weight: target.weight,
          currentValue: target.currentValue, maxScore: target.maxScore, hasReport: Boolean(target.lastReportedAt),
          directiveCount: target._count.directives, evaluationCount: target._count.evaluations,
        };
      });
      return {
        ...framework,
        kindLabel: FRAMEWORK_KIND_LABELS[framework.kind],
        issuingLevelLabel: ISSUING_LEVEL_LABELS[framework.issuingLevel],
        summary: summarizeFramework(framework, own),
      };
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...LEADERSHIP_ROLES, Role.CLERK)
  async create(@Req() req: any, @Body() dto: CreateFrameworkDto) {
    const actor = getActor(req);
    try {
      return await this.prisma.$transaction(async tx => {
        const framework = await tx.framework.create({
          data: {
            code: dto.code, name: dto.name, kind: dto.kind, issuingLevel: dto.issuingLevel, year: dto.year ?? currentVietnamYear(),
            legalBasis: dto.legalBasis, description: dto.description, maxScore: dto.kind === FrameworkKind.SCORE ? dto.maxScore ?? 100 : null,
            showOnWallboard: dto.showOnWallboard ?? true, sortOrder: 500,
          },
        });
        await audit(tx, actor, { action: 'FRAMEWORK_CREATED', entityType: 'Framework', entityId: framework.id, departmentId: null, metadata: { code: framework.code } });
        return framework;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Mã bộ chỉ tiêu đã tồn tại');
      throw error;
    }
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(...LEADERSHIP_ROLES, Role.CLERK)
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateFrameworkDto) {
    const actor = getActor(req);
    const { expectedVersion, ...changes } = dto;
    return this.prisma.$transaction(async tx => {
      const changed = await tx.framework.updateMany({ where: { id, version: expectedVersion }, data: { ...changes, version: { increment: 1 } } });
      if (changed.count !== 1) {
        const exists = await tx.framework.count({ where: { id } });
        if (!exists) throw new NotFoundException('Không tìm thấy bộ chỉ tiêu');
        throw new ConflictException('Bộ chỉ tiêu vừa được cập nhật. Vui lòng tải lại.');
      }
      await audit(tx, actor, { action: 'FRAMEWORK_UPDATED', entityType: 'Framework', entityId: id, departmentId: null, metadata: { version: expectedVersion + 1 } });
      return tx.framework.findUniqueOrThrow({ where: { id } });
    });
  }

  @Post('templates/:key/apply')
  @UseGuards(RolesGuard)
  @Roles(...LEADERSHIP_ROLES)
  async applyTemplate(@Req() req: any, @Param('key') key: string, @Body() dto: ApplyTemplateDto) {
    const actor = getActor(req);
    const template = findFrameworkTemplate(key);
    if (!template) throw new NotFoundException('Không tìm thấy bộ chỉ tiêu mẫu');
    const result = await applyFrameworkTemplate(this.prisma, actor, template, dto.year);
    if (result.alreadyExisted) throw new ConflictException(`Bộ "${result.name}" đã được nạp cho năm ${dto.year}`);
    return result;
  }

  /** Tính lại toàn bộ chỉ tiêu tự tính của một bộ (sau khi sửa công thức hoặc nhập dữ liệu hàng loạt). */
  @Post(':id/recompute')
  @UseGuards(RolesGuard)
  @Roles(...LEADERSHIP_ROLES, Role.CLERK)
  async recompute(@Req() req: any, @Param('id') id: string) {
    const actor = getActor(req);
    const targets = await this.prisma.target.findMany({ where: { frameworkId: id, isArchived: false }, select: { id: true, valueSource: true } });
    const outcomes = await recomputeTargets(this.prisma, actor, { targetIds: targets.filter(t => t.valueSource === ValueSource.COMPUTED).map(t => t.id) });
    await rollupParents(this.prisma, targets.filter(t => t.valueSource === ValueSource.CHILDREN).map(t => t.id), actor);
    return { recomputed: outcomes };
  }
}
