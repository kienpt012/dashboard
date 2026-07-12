import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { audit, getActor } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { PrismaService } from './prisma.service';

class UpdateSystemSettingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Năm kế hoạch mặc định phải là số nguyên' })
  @Min(2000, { message: 'Năm kế hoạch mặc định không hợp lệ' })
  @Max(2100, { message: 'Năm kế hoạch mặc định không hợp lệ' })
  defaultYear?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số ngày cảnh báo phải là số nguyên' })
  @Min(1, { message: 'Số ngày cảnh báo phải từ 1 đến 365' })
  @Max(365, { message: 'Số ngày cảnh báo phải từ 1 đến 365' })
  warningDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Ngưỡng rủi ro phải là một số' })
  @Min(0, { message: 'Ngưỡng rủi ro phải từ 0 đến 100' })
  @Max(100, { message: 'Ngưỡng rủi ro phải từ 0 đến 100' })
  riskThreshold?: number;
}

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SettingsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async get() {
    return await this.prisma.systemSetting.findUnique({ where: { id: 'default' } }) ?? {
      id: 'default',
      defaultYear: new Date().getFullYear(),
      warningDays: 14,
      riskThreshold: 70,
      updatedBy: null,
      updatedAt: null,
    };
  }

  @Patch()
  async update(@Body() dto: UpdateSystemSettingDto, @Req() req: any) {
    const actor = getActor(req);
    const setting = await this.prisma.systemSetting.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        defaultYear: dto.defaultYear ?? new Date().getFullYear(),
        warningDays: dto.warningDays ?? 14,
        riskThreshold: dto.riskThreshold ?? 70,
        updatedBy: actor.username,
      },
      update: {
        ...dto,
        updatedBy: actor.username,
      },
    });
    await audit(this.prisma, actor, {
      action: 'SYSTEM_SETTINGS_UPDATED',
      entityType: 'SystemSetting',
      entityId: setting.id,
      metadata: { changedFields: Object.keys(dto) },
    });
    return setting;
  }
}
