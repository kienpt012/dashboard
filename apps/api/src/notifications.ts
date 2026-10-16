import { Controller, Get, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { getActor } from './access';
import { JwtAuthGuard } from './common';
import { PrismaService } from './prisma.service';

// Hộp thông báo trong ứng dụng: giao việc, nhắc việc, tự thông qua, yêu cầu giải trình… Mỗi người chỉ thấy thông báo của mình.

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: any, @Query('unread') unread?: string, @Query('take') takeRaw?: string) {
    const actor = getActor(req);
    const take = Math.min(Math.max(Number(takeRaw) || 30, 1), 100);
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: actor.id, ...(unread === 'true' ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, kind: true, title: true, body: true, link: true, entityType: true, entityId: true, readAt: true, createdAt: true },
      }),
      this.prisma.notification.count({ where: { userId: actor.id, readAt: null } }),
    ]);
    return { items, unreadCount };
  }

  @Get('count')
  async count(@Req() req: any) {
    const actor = getActor(req);
    return { unreadCount: await this.prisma.notification.count({ where: { userId: actor.id, readAt: null } }) };
  }

  @Post('read-all')
  async readAll(@Req() req: any) {
    const actor = getActor(req);
    const result = await this.prisma.notification.updateMany({ where: { userId: actor.id, readAt: null }, data: { readAt: new Date() } });
    return { updated: result.count };
  }

  @Post(':id/read')
  async read(@Req() req: any, @Param('id') id: string) {
    const actor = getActor(req);
    const result = await this.prisma.notification.updateMany({ where: { id, userId: actor.id }, data: { readAt: new Date() } });
    if (!result.count) throw new NotFoundException('Không tìm thấy thông báo');
    return { ok: true };
  }
}
