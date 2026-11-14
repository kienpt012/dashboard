import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Role, WorkApp } from '@prisma/client';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { audit, getActor } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { PrismaService } from './prisma.service';
import { RateLimitService } from './rate-limit';
import { buildDeskBriefing } from './workspace-desk-briefing';
import { badgeNumber, safeAppUrl, workAppVisible } from './workspace-desk-policy';
import { fetchPublicJson, parsePublicApiUrl } from './workspace-fetch';

export class SaveWorkAppDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsString() @MaxLength(2048) url!: string;
  @IsString() @MinLength(1) @MaxLength(40) icon!: string;
  @Matches(/^#[0-9a-f]{6}$/i) color!: string;
  @IsString() @MinLength(1) @MaxLength(80) group!: string;
  @IsString() @MaxLength(200) description!: string;
  @IsArray() @ArrayMaxSize(6) @ArrayUnique() @IsEnum(Role, { each: true }) roles!: Role[];
  @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsString({ each: true }) departmentIds!: string[];
  @IsInt() @Min(-10000) @Max(10000) sortOrder!: number;
  @IsBoolean() isActive!: boolean;
  @IsOptional() @IsString() @MaxLength(2048) badgeUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(200) badgePath?: string | null;
}

type JsonFetcher = typeof fetchPublicJson;
/** Cache successful and failed results, and coalesce concurrent requests. Never cache per-user IOC counts. */
export class WorkAppBadgeCache {
  private readonly entries = new Map<string, { until: number; result: Promise<number | undefined> }>();
  constructor(private readonly fetcher: JsonFetcher = fetchPublicJson, private readonly clock = Date.now) {}

  get(app: Pick<WorkApp, 'badgeUrl' | 'badgePath'>): Promise<number | undefined> {
    if (!app.badgeUrl || !app.badgePath) return Promise.resolve(undefined);
    const key = `${app.badgeUrl}\n${app.badgePath}`;
    const cached = this.entries.get(key);
    if (cached && cached.until > this.clock()) return cached.result;
    if (this.entries.size >= 500) this.entries.delete(this.entries.keys().next().value!);
    const result = this.fetcher(app.badgeUrl).then(response => badgeNumber(response.data, app.badgePath!)).catch(() => undefined);
    this.entries.set(key, { until: this.clock() + 300_000, result });
    return result;
  }
}

@Controller('workspace/apps')
@UseGuards(JwtAuthGuard)
export class WorkAppsController {
  private readonly badges = new WorkAppBadgeCache();
  constructor(private readonly prisma: PrismaService, private readonly rateLimit: RateLimitService) {}

  @Get()
  async list(@Req() req: any) {
    const actor = getActor(req);
    this.rateLimit.consume('desk-app-read', actor.id, { limit: 60, windowMs: 60_000 });
    const [apps, briefing] = await Promise.all([
      this.prisma.workApp.findMany({ where: { isActive: true }, orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] }),
      buildDeskBriefing(this.prisma, actor),
    ]);
    const visible = apps.filter(app => workAppVisible(app, actor));
    const result = await Promise.all(visible.map(async ({ badgeUrl, badgePath, ...app }) => ({ ...app, badge: await this.badges.get({ badgeUrl, badgePath }) })));
    const { approvals, work, proposals, feedback, notifications } = briefing.counts;
    return { apps: result, badges: { approvals, work, proposals, feedback, notifications } };
  }

  @Get('admin')
  @UseGuards(RolesGuard) @Roles(Role.ADMIN)
  adminList() { return this.prisma.workApp.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }); }

  private async appData(dto: SaveWorkAppDto) {
    const name = dto.name.trim(), group = dto.group.trim(), icon = dto.icon.trim();
    if (!name || !group || !icon) throw new BadRequestException('Tên, nhóm và biểu tượng không được để trống');
    const url = safeAppUrl(dto.url);
    if (dto.departmentIds.length !== await this.prisma.department.count({ where: { id: { in: dto.departmentIds }, isActive: true } })) throw new BadRequestException('Đối tượng có phòng ban không hợp lệ');
    const badgeUrl = dto.badgeUrl?.trim() || null, badgePath = dto.badgePath?.trim() || null;
    if (!!badgeUrl !== !!badgePath) throw new BadRequestException('Cần khai báo cả địa chỉ và trường huy hiệu');
    if (badgeUrl) parsePublicApiUrl(badgeUrl);
    if (badgePath && (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(badgePath) || badgePath.split('.').some(part => ['__proto__', 'constructor', 'prototype'].includes(part)))) throw new BadRequestException('Đường dẫn trường huy hiệu không hợp lệ');
    return { ...dto, name, group, icon, url, description: dto.description.trim(), badgeUrl, badgePath };
  }

  @Post('admin')
  @UseGuards(RolesGuard) @Roles(Role.ADMIN)
  async create(@Req() req: any, @Body() dto: SaveWorkAppDto) {
    const actor = getActor(req);
    const data = await this.appData(dto);
    return this.prisma.$transaction(async tx => {
      const app = await tx.workApp.create({ data });
      await audit(tx, actor, { action: 'WORK_APP_CREATED', entityType: 'WorkApp', entityId: app.id, metadata: { appCount: 1 } });
      return app;
    });
  }

  @Put('admin/:id')
  @UseGuards(RolesGuard) @Roles(Role.ADMIN)
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: SaveWorkAppDto) {
    const actor = getActor(req);
    const data = await this.appData(dto);
    return this.prisma.$transaction(async tx => {
      if (!await tx.workApp.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Không tìm thấy ứng dụng');
      const app = await tx.workApp.update({ where: { id }, data });
      await audit(tx, actor, { action: 'WORK_APP_UPDATED', entityType: 'WorkApp', entityId: id, metadata: { appCount: 1, isActive: app.isActive } });
      return app;
    });
  }
}
