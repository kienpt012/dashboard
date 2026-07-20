import { BadRequestException, Body, ConflictException, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, Max, Min, ValidateIf } from 'class-validator';
import { audit, getActor } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { PrismaService } from './prisma.service';
import { currentVietnamYear } from './planning-date';

const ValidateIfDefined = () => ValidateIf((_object, value) => value !== undefined);

export class UpdateSystemSettingDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ValidateIfDefined()
  @Type(() => Number)
  @IsInt({ message: 'Năm kế hoạch mặc định phải là số nguyên' })
  @Min(2000, { message: 'Năm kế hoạch mặc định không hợp lệ' })
  @Max(2100, { message: 'Năm kế hoạch mặc định không hợp lệ' })
  defaultYear?: number;

  @ValidateIfDefined()
  @Type(() => Number)
  @IsInt({ message: 'Số ngày cảnh báo phải là số nguyên' })
  @Min(1, { message: 'Số ngày cảnh báo phải từ 1 đến 365' })
  @Max(365, { message: 'Số ngày cảnh báo phải từ 1 đến 365' })
  warningDays?: number;

  @ValidateIfDefined()
  @Type(() => Number)
  @IsNumber({}, { message: 'Ngưỡng rủi ro phải là một số' })
  @Min(0, { message: 'Ngưỡng rủi ro phải từ 0 đến 100' })
  @Max(100, { message: 'Ngưỡng rủi ro phải từ 0 đến 100' })
  riskThreshold?: number;

  @ValidateIfDefined()
  @Type(() => Number)
  @IsInt({ message: 'Thời hạn phản hồi ban đầu phải là số nguyên' })
  @Min(1, { message: 'Thời hạn phản hồi ban đầu phải từ 1 đến 30 ngày' })
  @Max(30, { message: 'Thời hạn phản hồi ban đầu phải từ 1 đến 30 ngày' })
  feedbackFirstResponseDays?: number;

  @ValidateIfDefined()
  @Type(() => Number)
  @IsInt({ message: 'Thời hạn xử lý phản ánh phải là số nguyên' })
  @Min(1, { message: 'Thời hạn xử lý phản ánh phải từ 1 đến 365 ngày' })
  @Max(365, { message: 'Thời hạn xử lý phản ánh phải từ 1 đến 365 ngày' })
  feedbackResolutionDays?: number;

  @ValidateIfDefined()
  @Type(() => Number)
  @IsInt({ message: 'Thời hạn người dân bổ sung thông tin phải là số nguyên' })
  @Min(1, { message: 'Thời hạn bổ sung thông tin phải từ 1 đến 60 ngày' })
  @Max(60, { message: 'Thời hạn bổ sung thông tin phải từ 1 đến 60 ngày' })
  feedbackCitizenResponseDays?: number;
}

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SettingsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async get() {
    const setting = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    if (setting) {
      const updater = setting.updatedBy
        ? await this.prisma.user.findFirst({
            where: { OR: [{ id: setting.updatedBy }, { username: setting.updatedBy }] },
            select: { username: true },
          })
        : null;
      return { ...setting, updatedBy: updater?.username ?? setting.updatedBy };
    }
    return {
      id: 'default',
      defaultYear: currentVietnamYear(),
      warningDays: 14,
      riskThreshold: 70,
      feedbackFirstResponseDays: 2,
      feedbackResolutionDays: 10,
      feedbackCitizenResponseDays: 7,
      version: 1,
      updatedBy: null,
      updatedAt: null,
    };
  }

  @Patch()
  async update(@Body() dto: UpdateSystemSettingDto, @Req() req: any) {
    const actor = getActor(req);
    return this.prisma.$transaction(async tx => {
      const current = await tx.systemSetting.findUnique({ where: { id: 'default' } });
      if (current && current.version !== dto.expectedVersion) {
        throw new ConflictException('Thiết lập vừa được quản trị viên khác cập nhật. Vui lòng tải lại.');
      }
      const firstResponseDays = dto.feedbackFirstResponseDays
        ?? current?.feedbackFirstResponseDays
        ?? 2;
      const resolutionDays = dto.feedbackResolutionDays
        ?? current?.feedbackResolutionDays
        ?? 10;
      if (resolutionDays < firstResponseDays) {
        throw new BadRequestException(
          'Thời hạn xử lý phản ánh phải lớn hơn hoặc bằng thời hạn phản hồi ban đầu',
        );
      }

      let setting;
      let changedFields: string[];
      if (!current) {
        if (dto.expectedVersion !== 1) throw new ConflictException('Thiết lập vừa được khởi tạo. Vui lòng tải lại.');
        setting = await tx.systemSetting.create({ data: {
          id: 'default',
          defaultYear: dto.defaultYear ?? currentVietnamYear(),
          warningDays: dto.warningDays ?? 14,
          riskThreshold: dto.riskThreshold ?? 70,
          feedbackFirstResponseDays: firstResponseDays,
          feedbackResolutionDays: resolutionDays,
          feedbackCitizenResponseDays: dto.feedbackCitizenResponseDays ?? 7,
          updatedBy: actor.username,
        } });
        changedFields = Object.keys(dto).filter(field => field !== 'expectedVersion');
      } else {
        const updates = {
          ...(dto.defaultYear !== undefined && dto.defaultYear !== current.defaultYear
            ? { defaultYear: dto.defaultYear }
            : {}),
          ...(dto.warningDays !== undefined && dto.warningDays !== current.warningDays
            ? { warningDays: dto.warningDays }
            : {}),
          ...(dto.riskThreshold !== undefined && dto.riskThreshold !== current.riskThreshold
            ? { riskThreshold: dto.riskThreshold }
            : {}),
          ...(dto.feedbackFirstResponseDays !== undefined
            && dto.feedbackFirstResponseDays !== current.feedbackFirstResponseDays
            ? { feedbackFirstResponseDays: dto.feedbackFirstResponseDays }
            : {}),
          ...(dto.feedbackResolutionDays !== undefined
            && dto.feedbackResolutionDays !== current.feedbackResolutionDays
            ? { feedbackResolutionDays: dto.feedbackResolutionDays }
            : {}),
          ...(dto.feedbackCitizenResponseDays !== undefined
            && dto.feedbackCitizenResponseDays !== current.feedbackCitizenResponseDays
            ? { feedbackCitizenResponseDays: dto.feedbackCitizenResponseDays }
            : {}),
        };
        changedFields = Object.keys(updates);
        if (changedFields.length === 0) return current;
        const changed = await tx.systemSetting.updateMany({
          where: { id: 'default', version: dto.expectedVersion },
          data: { ...updates, updatedBy: actor.username, version: { increment: 1 } },
        });
        if (changed.count !== 1) throw new ConflictException('Thiết lập vừa được quản trị viên khác cập nhật. Vui lòng tải lại.');
        setting = await tx.systemSetting.findUniqueOrThrow({ where: { id: 'default' } });
      }
      await audit(tx, actor, {
        action: 'SYSTEM_SETTINGS_UPDATED',
        entityType: 'SystemSetting',
        entityId: setting.id,
        metadata: { changedFields },
      });
      return setting;
    });
  }
}
