import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { Actor, audit, getActor } from './access';
import { JwtAuthGuard } from './common';
import { PrismaService } from './prisma.service';
import { RateLimitService } from './rate-limit';
import { canBroadcastNotes, canSendDeskNote, deskTargetScope, plainNote } from './workspace-desk-policy';
import { notifyUsers } from './work';

export class CreateDeskNoteDto {
  @IsString() @MinLength(1) @MaxLength(500) content!: string;
  @IsIn(['yellow', 'pink', 'blue', 'green']) color!: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() @MaxLength(100) targetId?: string;
  @IsOptional() @IsString() @MaxLength(100) documentId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @ArrayUnique() @IsString({ each: true }) recipientIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsString({ each: true }) departmentIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(6) @ArrayUnique() @IsEnum(Role, { each: true }) roles?: Role[];
  @IsOptional() @IsBoolean() all?: boolean;
}

export class DeskNoteReplyDto { @IsString() @MinLength(1) @MaxLength(300) content!: string; }
export class DeskNoteRecipientDto {
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() seen?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() done?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() hidden?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsNumber() @Min(0) @Max(10000) x?: number;
  @ValidateIf((_object, value) => value !== undefined) @IsNumber() @Min(0) @Max(10000) y?: number;
}

export const DESK_PERSON_SELECT = { id: true, fullName: true, username: true, position: true, role: true, departmentId: true } satisfies Prisma.UserSelect;
const noteInclude = {
  author: { select: DESK_PERSON_SELECT },
  target: { select: { id: true, title: true } }, document: { select: { id: true, title: true, docNumber: true } },
  recipients: { include: { user: { select: DESK_PERSON_SELECT } } },
  replies: { include: { author: { select: DESK_PERSON_SELECT } }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.DeskNoteInclude;

@Controller('workspace')
@UseGuards(JwtAuthGuard)
export class DeskNotesController {
  constructor(private readonly prisma: PrismaService, private readonly rateLimit: RateLimitService) {}

  private async person(actor: Actor) {
    const user = await this.prisma.user.findUnique({ where: { id: actor.id }, select: { ...DESK_PERSON_SELECT, department: { select: { kind: true, isActive: true } } } });
    if (!user) throw new ForbiddenException('Tài khoản không còn hoạt động');
    return user;
  }

  private async target(actor: Actor, id: string) {
    const target = await this.prisma.target.findFirst({ where: { id, isArchived: false, ...deskTargetScope(actor) }, select: { id: true, departmentId: true, assigneeId: true } });
    if (!target) throw new NotFoundException('Không tìm thấy chỉ tiêu');
    return target;
  }

  private async defaultRecipients(actor: Actor, targetId: string) {
    const target = await this.target(actor, targetId);
    const managers = await this.prisma.user.findMany({ where: { departmentId: target.departmentId, role: Role.MANAGER, isActive: true }, select: { id: true } });
    return [...new Set([target.assigneeId, ...managers.map(user => user.id)].filter((id): id is string => !!id))];
  }

  @Get('note-recipients')
  async recipients(@Req() req: any, @Query('targetId') targetId?: string) {
    const actor = getActor(req);
    const person = await this.person(actor);
    const users = await this.prisma.user.findMany({ where: { isActive: true }, select: { ...DESK_PERSON_SELECT, department: { select: { kind: true, isActive: true } } }, orderBy: { fullName: 'asc' } });
    const broad = canBroadcastNotes(person);
    return {
      users: users.filter(user => canSendDeskNote(person, user)).map(({ department, ...user }) => user),
      departments: await this.prisma.department.findMany({ where: { isActive: true, ...(broad ? {} : { id: actor.role === Role.MANAGER ? actor.departmentId ?? '__none__' : '__none__' }) }, select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }),
      roles: broad ? Object.values(Role) : [], canBroadcast: broad,
      defaultRecipientIds: targetId ? await this.defaultRecipients(actor, targetId) : [actor.id],
    };
  }

  @Get('notes')
  async list(@Req() req: any) {
    const actor = getActor(req);
    const [received, sent] = await Promise.all([
      this.prisma.deskNote.findMany({ where: { recalledAt: null, recipients: { some: { userId: actor.id, hiddenAt: null } } }, include: noteInclude, orderBy: { createdAt: 'desc' }, take: 200 }),
      this.prisma.deskNote.findMany({ where: { authorId: actor.id }, include: noteInclude, orderBy: { createdAt: 'desc' }, take: 200 }),
    ]);
    return { received, sent };
  }

  @Get('notes/:id')
  async detail(@Req() req: any, @Param('id') id: string) {
    const actor = getActor(req);
    const note = await this.prisma.deskNote.findFirst({ where: { id, OR: [{ authorId: actor.id }, { recipients: { some: { userId: actor.id } } }] }, include: noteInclude });
    if (!note) throw new NotFoundException('Không tìm thấy note');
    if (note.recalledAt && note.authorId !== actor.id) throw new NotFoundException('Note đã được thu hồi');
    return note;
  }

  @Post('notes')
  async create(@Req() req: any, @Body() dto: CreateDeskNoteDto) {
    const actor = getActor(req);
    const content = plainNote(dto.content, 500);
    const person = await this.person(actor);
    const broad = canBroadcastNotes(person);
    if (dto.all || dto.roles?.length) { if (!broad) throw new ForbiddenException('Bạn không có quyền gửi note theo vai trò hoặc toàn cơ quan'); }
    if (dto.departmentIds?.length && !broad && (actor.role !== Role.MANAGER || dto.departmentIds.some(id => id !== actor.departmentId))) {
      throw new ForbiddenException('Bạn chỉ được gửi note theo phòng mình');
    }
    const selected = dto.recipientIds ?? [];
    const defaults = dto.targetId ? await this.defaultRecipients(actor, dto.targetId) : [];
    if (dto.documentId && !await this.prisma.sourceDocument.findUnique({ where: { id: dto.documentId }, select: { id: true } })) throw new NotFoundException('Không tìm thấy văn bản');
    const implicit = !selected.length && !dto.departmentIds?.length && !dto.roles?.length && !dto.all;
    const directIds = implicit ? defaults.length ? defaults : [actor.id] : selected;
    const users = await this.prisma.user.findMany({ where: { isActive: true, ...(dto.all ? {} : { OR: [{ id: { in: directIds } }, { departmentId: { in: dto.departmentIds ?? [] } }, { role: { in: dto.roles ?? [] } }] }) }, select: { ...DESK_PERSON_SELECT, department: { select: { kind: true, isActive: true } } } });
    if (!users.length || directIds.some(id => !users.some(user => user.id === id))) throw new BadRequestException('Người nhận không tồn tại hoặc đã ngừng hoạt động');
    if (users.length > 1000) throw new BadRequestException('Mỗi note tối đa 1000 người nhận');
    if (users.some(user => !canSendDeskNote(person, user))) throw new ForbiddenException('Có người nhận nằm ngoài phạm vi gửi note của bạn');
    this.rateLimit.consume('desk-note-create', actor.id, { limit: 30, windowMs: 3_600_000, message: 'Mỗi người được dán tối đa 30 note trong một giờ' });
    return this.prisma.$transaction(async tx => {
      const note = await tx.deskNote.create({ data: { authorId: actor.id, content, color: dto.color, dueAt: dto.dueAt ? new Date(dto.dueAt) : null, targetId: dto.targetId || null, documentId: dto.documentId || null, recipients: { create: users.map(user => ({ userId: user.id })) } }, include: noteInclude });
      await audit(tx, actor, { action: 'DESK_NOTE_CREATED', entityType: 'DeskNote', entityId: note.id, metadata: { recipientCount: users.length } });
      await notifyUsers(tx, users.map(user => user.id), { kind: 'DESK_NOTE', title: `${actor.fullName} dán note nhắc việc`, link: `/admin?note=${note.id}`, entityType: 'DeskNote', entityId: note.id, dedupeKey: `desk-note:${note.id}` });
      return note;
    });
  }

  @Patch('notes/:id/recipient')
  async updateRecipient(@Req() req: any, @Param('id') id: string, @Body() dto: DeskNoteRecipientDto) {
    const actor = getActor(req);
    this.rateLimit.consume('desk-note-state', actor.id, { limit: 180, windowMs: 60_000 });
    return this.prisma.$transaction(async tx => {
      const note = await tx.deskNote.findFirst({ where: { id, recalledAt: null, recipients: { some: { userId: actor.id } } }, select: { id: true, recipients: { where: { userId: actor.id }, select: { seenAt: true } } } });
      if (!note) throw new NotFoundException('Không tìm thấy note');
      const now = new Date();
      const firstSeen = note.recipients[0]?.seenAt ?? now;
      const data = { ...(dto.seen === undefined ? {} : { seenAt: dto.seen ? firstSeen : null }), ...(dto.done === undefined ? {} : { doneAt: dto.done ? now : null, ...(dto.done ? { seenAt: firstSeen } : {}) }), ...(dto.hidden === undefined ? {} : { hiddenAt: dto.hidden ? now : null }), ...(dto.x === undefined ? {} : { x: dto.x }), ...(dto.y === undefined ? {} : { y: dto.y }) };
      const result = await tx.deskNoteRecipient.update({ where: { noteId_userId: { noteId: id, userId: actor.id } }, data });
      await audit(tx, actor, { action: 'DESK_NOTE_STATE_UPDATED', entityType: 'DeskNote', entityId: id, metadata: { changedFields: Object.keys(data) } });
      return result;
    });
  }

  @Post('notes/:id/replies')
  async reply(@Req() req: any, @Param('id') id: string, @Body() dto: DeskNoteReplyDto) {
    const actor = getActor(req);
    const content = plainNote(dto.content, 300);
    this.rateLimit.consume('desk-note-reply', actor.id, { limit: 60, windowMs: 3_600_000, message: 'Mỗi người được trả lời tối đa 60 lần trong một giờ' });
    return this.prisma.$transaction(async tx => {
      const note = await tx.deskNote.findFirst({ where: { id, recalledAt: null, OR: [{ authorId: actor.id }, { recipients: { some: { userId: actor.id } } }] }, select: { authorId: true, recipients: { select: { userId: true } } } });
      if (!note) throw new NotFoundException('Không tìm thấy note');
      const reply = await tx.deskNoteReply.create({ data: { noteId: id, authorId: actor.id, content }, include: { author: { select: DESK_PERSON_SELECT } } });
      await audit(tx, actor, { action: 'DESK_NOTE_REPLIED', entityType: 'DeskNote', entityId: id, metadata: { replyCount: 1 } });
      await notifyUsers(tx, [note.authorId, ...note.recipients.map(recipient => recipient.userId)], { kind: 'DESK_NOTE_REPLY', title: `${actor.fullName} trả lời note`, link: `/admin?note=${id}`, entityType: 'DeskNote', entityId: id, dedupeKey: `desk-reply:${reply.id}` }, actor.id);
      return reply;
    });
  }

  @Post('notes/:id/recall')
  async recall(@Req() req: any, @Param('id') id: string) {
    const actor = getActor(req);
    return this.prisma.$transaction(async tx => {
      const changed = await tx.deskNote.updateMany({ where: { id, authorId: actor.id, recalledAt: null }, data: { recalledAt: new Date() } });
      if (!changed.count) throw new NotFoundException('Không tìm thấy note đang gửi của bạn');
      await audit(tx, actor, { action: 'DESK_NOTE_RECALLED', entityType: 'DeskNote', entityId: id, metadata: { noteCount: 1 } });
      return { recalled: true };
    });
  }
}
