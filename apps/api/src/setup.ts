import { BadRequestException, Body, Controller, Get, NotFoundException, Post, Req, UseGuards } from '@nestjs/common';
import { DepartmentKind, LocalityKind, Prisma, Role } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { audit, getActor } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { applyFrameworkTemplate, type TemplateApplyResult } from './frameworks';
import { LOCALITY_KIND_LABELS, saveLocality, UpdateLocalityDto } from './locality';
import { currentVietnamYear } from './planning-date';
import { PrismaService } from './prisma.service';
import { findFrameworkTemplate, FRAMEWORK_TEMPLATES, frameworkTemplateSummary, ORG_TEMPLATES } from './templates';

// Trình thiết lập địa phương: hồ sơ → cơ cấu tổ chức → bộ chỉ tiêu từ thư viện → thời hạn trách nhiệm.
// Chạy lại được nhiều lần (idempotent): phòng đã có thì cập nhật thông tin, bộ chỉ tiêu đã nạp thì bỏ qua.

const Trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

class SetupDepartmentDto {
  @Trim() @Matches(/^[A-Za-z0-9_-]{2,30}$/, { message: 'Mã phòng ban chỉ gồm chữ, số, gạch ngang, gạch dưới (2–30 ký tự)' })
  code!: string;
  @Trim() @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(80) shortName?: string;
  @IsEnum(DepartmentKind, { message: 'Loại đơn vị không hợp lệ' }) kind!: DepartmentKind;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(1000) responsibilities?: string;
}

class SetupSettingsDto {
  @IsInt() @Min(0) @Max(60) reportAutoApproveDays!: number;
  @IsInt() @Min(0) @Max(30) proposalAutoApproveDays!: number;
  @IsInt() @Min(1) @Max(30) explanationDueDays!: number;
  @IsInt() @Min(0) @Max(30) assignmentStallDays!: number;
  @IsInt() @Min(0) @Max(5) maxTransfers!: number;
  @IsInt() @Min(5) @Max(300) wallboardRotateSeconds!: number;
}

class ApplySetupDto {
  @ValidateNested() @Type(() => UpdateLocalityDto) locality!: UpdateLocalityDto;
  @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => SetupDepartmentDto) departments!: SetupDepartmentDto[];
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) frameworkTemplates!: string[];
  @IsInt() @Min(2000) @Max(2100) year!: number;
  @IsOptional() @ValidateNested() @Type(() => SetupSettingsDto) settings?: SetupSettingsDto;
}

@Controller('setup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SetupController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('templates')
  async templates() {
    const [departments, setting, frameworks] = await Promise.all([
      this.prisma.department.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.systemSetting.findUnique({ where: { id: 'default' } }),
      this.prisma.framework.findMany({ select: { code: true, templateKey: true, year: true } }),
    ]);
    return {
      year: currentVietnamYear(),
      localityKinds: Object.entries(LOCALITY_KIND_LABELS).map(([value, label]) => ({ value, label })),
      orgTemplates: Object.entries(ORG_TEMPLATES).map(([kind, template]) => ({ kind, ...template })),
      frameworkTemplates: FRAMEWORK_TEMPLATES.map(template => ({
        ...frameworkTemplateSummary(template),
        appliedYears: frameworks.filter(framework => framework.templateKey === template.key).map(framework => framework.year),
      })),
      existingDepartments: departments.map(department => ({
        id: department.id, code: department.code, name: department.name, shortName: department.shortName, kind: department.kind,
        color: department.color, responsibilities: department.responsibilities, isActive: department.isActive,
      })),
      settings: {
        reportAutoApproveDays: setting?.reportAutoApproveDays ?? 7,
        proposalAutoApproveDays: setting?.proposalAutoApproveDays ?? 3,
        explanationDueDays: setting?.explanationDueDays ?? 3,
        assignmentStallDays: setting?.assignmentStallDays ?? 3,
        maxTransfers: setting?.maxTransfers ?? 1,
        wallboardRotateSeconds: setting?.wallboardRotateSeconds ?? 20,
      },
    };
  }

  @Post('apply')
  async apply(@Req() req: any, @Body() dto: ApplySetupDto) {
    const actor = getActor(req);
    const templates = dto.frameworkTemplates.map(key => {
      const template = findFrameworkTemplate(key);
      if (!template) throw new NotFoundException(`Không tìm thấy bộ chỉ tiêu mẫu ${key}`);
      return template;
    });
    const codes = dto.departments.map(department => department.code.toUpperCase());
    if (new Set(codes).size !== codes.length) throw new BadRequestException('Mã phòng ban bị trùng');

    const organisation = await this.prisma.$transaction(async tx => {
      const profile = await saveLocality(tx, actor, dto.locality);
      let created = 0;
      let updated = 0;
      for (const [index, department] of dto.departments.entries()) {
        const existing = await tx.department.findFirst({ where: { code: { equals: department.code, mode: 'insensitive' } } });
        const data = {
          name: department.name,
          shortName: department.shortName || null,
          kind: department.kind,
          responsibilities: department.responsibilities || null,
          sortOrder: (index + 1) * 10,
          ...(department.color ? { color: department.color } : {}),
        };
        if (existing) {
          await tx.department.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } });
          updated += 1;
        } else {
          await tx.department.create({ data: { code: department.code.toUpperCase(), ...data } });
          created += 1;
        }
      }
      if (dto.settings) {
        await tx.systemSetting.upsert({
          where: { id: 'default' },
          create: { id: 'default', defaultYear: dto.year, ...dto.settings, updatedBy: actor.id },
          update: { ...dto.settings, defaultYear: dto.year, updatedBy: actor.id, version: { increment: 1 } },
        });
      }
      await audit(tx, actor, {
        action: 'LOCALITY_SETUP_APPLIED',
        entityType: 'LocalityProfile',
        entityId: profile.id,
        departmentId: null,
        metadata: { year: dto.year, documentCount: dto.departments.length, templateKey: dto.frameworkTemplates.join(',') },
      });
      return { profile, created, updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });

    const frameworks: (TemplateApplyResult | { key: string; error: string })[] = [];
    for (const template of templates) {
      try {
        frameworks.push(await applyFrameworkTemplate(this.prisma, actor, template, dto.year));
      } catch (error) {
        frameworks.push({ key: template.key, error: error instanceof Error ? error.message : 'Lỗi không xác định' });
      }
    }
    const applied = new Set([...(organisation.profile.appliedTemplates ?? []), ...templates.map(template => template.key)]);
    const profile = await this.prisma.localityProfile.update({
      where: { id: 'default' },
      data: { setupCompletedAt: organisation.profile.setupCompletedAt ?? new Date(), appliedTemplates: [...applied] },
    });
    return {
      profile,
      departments: { created: organisation.created, updated: organisation.updated },
      frameworks,
    };
  }
}

export { LocalityKind };
