import { Body, ConflictException, Controller, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsInt, IsObject, IsString, MaxLength, Min } from 'class-validator';
import { audit, getActor } from './access';
import { JwtAuthGuard } from './common';
import { PrismaService } from './prisma.service';
import { RateLimitService } from './rate-limit';
import { validateWorkspaceConfig } from './workspace-config';
import { fetchPublicJson } from './workspace-fetch';

export class SaveWorkspaceDto {
  @IsInt({ message: 'Phiên bản phải là số nguyên' })
  @Min(1, { message: 'Phiên bản tối thiểu là 1' })
  expectedVersion!: number;

  @IsObject({ message: 'Cấu hình bàn làm việc phải là một đối tượng' })
  config!: Record<string, unknown>;
}

export class WorkspaceFetchDto {
  @IsString({ message: 'Địa chỉ API phải là chuỗi' })
  @MaxLength(2048, { message: 'Địa chỉ API tối đa 2048 ký tự' })
  url!: string;
}

const select = { config: true, version: true, updatedAt: true } satisfies Prisma.UserWorkspaceSelect;
const conflict = () => new ConflictException('Bàn làm việc vừa được cập nhật ở một phiên khác. Hãy tải lại trước khi lưu tiếp.');

@Controller('workspace')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(private readonly prisma: PrismaService, private readonly rateLimit: RateLimitService) {}

  @Get()
  async get(@Req() req: any) {
    const actor = getActor(req);
    return await this.prisma.userWorkspace.findUnique({ where: { userId: actor.id }, select })
      ?? { config: null, version: 1, updatedAt: null };
  }

  @Put()
  async save(@Body() dto: SaveWorkspaceDto, @Req() req: any) {
    const actor = getActor(req);
    const config = validateWorkspaceConfig(dto.config);
    this.rateLimit.consume('workspace-save', actor.id, { limit: 120, windowMs: 60_000 });
    try {
      return await this.prisma.$transaction(async tx => {
        const current = await tx.userWorkspace.findUnique({ where: { userId: actor.id }, select: { version: true } });
        if ((current?.version ?? 1) !== dto.expectedVersion) throw conflict();
        if (current) {
          const result = await tx.userWorkspace.updateMany({
            where: { userId: actor.id, version: dto.expectedVersion },
            data: { config, version: { increment: 1 } },
          });
          if (result.count !== 1) throw conflict();
        } else {
          await tx.userWorkspace.create({ data: { userId: actor.id, config, version: 2 } });
        }
        await audit(tx, actor, {
          action: 'WORKSPACE_UPDATED', entityType: 'UserWorkspace', entityId: actor.id,
          // Personal notes, links and wallpaper contents are never included in the shared audit log.
          metadata: { changedFields: ['config'], previousVersion: dto.expectedVersion },
        });
        return tx.userWorkspace.findUniqueOrThrow({ where: { userId: actor.id }, select });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && ['P2002', 'P2025', 'P2034'].includes(String(error.code))) throw conflict();
      throw error;
    }
  }

  @Post('fetch')
  async fetch(@Body() dto: WorkspaceFetchDto, @Req() req: any) {
    const actor = getActor(req);
    this.rateLimit.consume('workspace-fetch-user', actor.id, { limit: 60, windowMs: 60_000, message: 'Đã đạt giới hạn 60 lần tải API mỗi phút. Vui lòng đợi một chút.' });
    this.rateLimit.consume('workspace-fetch-total', 'all', { limit: 600, windowMs: 60_000 });
    return fetchPublicJson(dto.url);
  }
}
