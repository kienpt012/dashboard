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
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DepartmentKind, Prisma, Role } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { audit, getActor, type Actor } from './access';
import { JwtAuthGuard } from './common';
import { PrismaService } from './prisma.service';
import { uploadFileName } from './upload-name';

// Lịch làm việc theo tuần của lãnh đạo UBND (G-40). Văn phòng lập lịch; người dân xem tuần đã công khai trên trang
// công khai. Mỗi tuần một bản ghi, khoá theo ngày thứ Hai; từng dòng lịch có cờ công khai riêng.

const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const SCHEDULE_SESSIONS = ['ALLDAY', 'AM', 'PM', 'EVENING'] as const;
export type ScheduleSession = typeof SCHEDULE_SESSIONS[number];

/** Ngày hiện tại theo giờ Việt Nam (UTC+7), dạng YYYY-MM-DD. */
export function vietnamToday(now = new Date()): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export function parseDay(value: string): Date {
  if (!DATE_PATTERN.test(value)) throw new BadRequestException('Ngày phải có dạng YYYY-MM-DD');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('Ngày không hợp lệ');
  }
  return date;
}

export const dayText = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(value: string, days: number): string {
  return dayText(new Date(parseDay(value).getTime() + days * DAY_MS));
}

/** Thứ Hai của tuần chứa ngày đã cho. */
export function weekStartOf(value: string): string {
  const date = parseDay(value);
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  return dayText(new Date(date.getTime() - sinceMonday * DAY_MS));
}

/** Lập, sửa, công khai lịch: quản trị, lãnh đạo, văn thư và cán bộ thuộc Văn phòng. */
export function canEditSchedule(actor: Pick<Actor, 'role'>, departmentKind: DepartmentKind | null | undefined): boolean {
  if (actor.role === Role.ADMIN || actor.role === Role.LEADER || actor.role === Role.CLERK) return true;
  return (actor.role === Role.MANAGER || actor.role === Role.STAFF) && departmentKind === DepartmentKind.OFFICE;
}

type EntryRow = {
  id: string;
  date: Date;
  session: string;
  startTime: string | null;
  content: string;
  leader: string;
  location: string | null;
  participants: string | null;
  isPublic: boolean;
  sortOrder: number;
};

type ScheduleRow = {
  id: string;
  weekStart: Date;
  title: string | null;
  note: string | null;
  isPublic: boolean;
  publishedAt: Date | null;
  fileName: string | null;
  fileSize: number | null;
  version: number;
  updatedAt: Date;
  entries: EntryRow[];
};

const sessionRank = (session: string) => {
  const index = SCHEDULE_SESSIONS.indexOf(session as ScheduleSession);
  return index < 0 ? SCHEDULE_SESSIONS.length : index;
};

/** Thứ tự đọc: theo ngày, cả ngày trước rồi sáng, chiều, tối; cùng buổi theo giờ rồi theo thứ tự nhập. */
export function sortEntries<T extends Pick<EntryRow, 'date' | 'session' | 'startTime' | 'sortOrder'>>(entries: T[]): T[] {
  return [...entries].sort((left, right) =>
    left.date.getTime() - right.date.getTime()
    || sessionRank(left.session) - sessionRank(right.session)
    || (left.startTime ?? '').localeCompare(right.startTime ?? '')
    || left.sortOrder - right.sortOrder);
}

/** Bản trả về cho giao diện. Bản công khai chỉ gồm dòng được đánh dấu công khai và không có ghi chú nội bộ. */
export function scheduleView(schedule: ScheduleRow, audience: 'staff' | 'public') {
  const entries = sortEntries(schedule.entries)
    .filter(entry => audience === 'staff' || entry.isPublic)
    .map(entry => ({
      ...(audience === 'staff' ? { id: entry.id, isPublic: entry.isPublic } : {}),
      date: dayText(entry.date),
      session: entry.session,
      startTime: entry.startTime,
      content: entry.content,
      leader: entry.leader,
      location: entry.location,
      participants: entry.participants,
    }));
  const weekStart = dayText(schedule.weekStart);
  return {
    weekStart,
    weekEnd: addDays(weekStart, 6),
    title: schedule.title,
    publishedAt: schedule.publishedAt,
    file: schedule.fileName ? { name: schedule.fileName, size: schedule.fileSize ?? 0 } : null,
    entries,
    ...(audience === 'staff'
      ? { id: schedule.id, note: schedule.note, isPublic: schedule.isPublic, version: schedule.version, updatedAt: schedule.updatedAt }
      : {}),
  };
}

const Trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
const EmptyToUndefined = () => Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() || undefined) : value ?? undefined);

class ScheduleEntryDto {
  @Matches(DATE_PATTERN, { message: 'Ngày của dòng lịch phải có dạng YYYY-MM-DD' })
  date!: string;

  @IsIn(SCHEDULE_SESSIONS as unknown as string[], { message: 'Buổi làm việc không hợp lệ' })
  session!: string;

  @EmptyToUndefined()
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'Giờ bắt đầu phải có dạng HH:MM' })
  startTime?: string;

  @Trim()
  @IsString({ message: 'Nội dung không hợp lệ' })
  @MinLength(3, { message: 'Nội dung phải có ít nhất 3 ký tự' })
  @MaxLength(500, { message: 'Nội dung không được vượt quá 500 ký tự' })
  content!: string;

  @Trim()
  @IsString({ message: 'Người chủ trì không hợp lệ' })
  @MinLength(2, { message: 'Người chủ trì phải có ít nhất 2 ký tự' })
  @MaxLength(120, { message: 'Người chủ trì không được vượt quá 120 ký tự' })
  leader!: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString({ message: 'Địa điểm không hợp lệ' })
  @MaxLength(200, { message: 'Địa điểm không được vượt quá 200 ký tự' })
  location?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString({ message: 'Thành phần không hợp lệ' })
  @MaxLength(500, { message: 'Thành phần không được vượt quá 500 ký tự' })
  participants?: string;

  @IsOptional()
  @IsBoolean({ message: 'Cờ công khai không hợp lệ' })
  isPublic?: boolean;
}

class SaveScheduleDto {
  @IsOptional()
  @IsInt({ message: 'Phiên bản phải là số nguyên' })
  @Min(1, { message: 'Phiên bản tối thiểu là 1' })
  expectedVersion?: number;

  @EmptyToUndefined()
  @IsOptional()
  @IsString({ message: 'Tiêu đề không hợp lệ' })
  @MaxLength(200, { message: 'Tiêu đề không được vượt quá 200 ký tự' })
  title?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString({ message: 'Ghi chú không hợp lệ' })
  @MaxLength(1000, { message: 'Ghi chú không được vượt quá 1000 ký tự' })
  note?: string;

  @IsArray({ message: 'Danh sách dòng lịch không hợp lệ' })
  @ArrayMaxSize(150, { message: 'Mỗi tuần tối đa 150 dòng lịch' })
  @ValidateNested({ each: true })
  @Type(() => ScheduleEntryDto)
  entries!: ScheduleEntryDto[];
}

class ScheduleVisibilityDto {
  @IsBoolean({ message: 'Trạng thái công khai không hợp lệ' })
  isPublic!: boolean;
}

class ScheduleWeekQueryDto {
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'Tuần phải có dạng YYYY-MM-DD' })
  week?: string;
}

const ENTRY_SELECT = {
  id: true, date: true, session: true, startTime: true, content: true, leader: true,
  location: true, participants: true, isPublic: true, sortOrder: true,
} satisfies Prisma.WorkScheduleEntrySelect;

// Không bao giờ kéo tệp PDF theo các truy vấn đọc lịch.
const SCHEDULE_SELECT = {
  id: true, weekStart: true, title: true, note: true, isPublic: true, publishedAt: true,
  fileName: true, fileSize: true, version: true, updatedAt: true,
  entries: { select: ENTRY_SELECT },
} satisfies Prisma.WorkScheduleSelect;

function requireMonday(week: string): string {
  const monday = weekStartOf(week);
  if (monday !== week) throw new BadRequestException('Tuần phải bắt đầu từ ngày thứ Hai');
  return monday;
}

function sendPdf(response: Response, file: { fileName: string | null; fileData: Uint8Array | null }, cache: string) {
  if (!file.fileData || !file.fileName) throw new NotFoundException('Tuần này chưa có tệp lịch');
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Length', String(file.fileData.byteLength));
  response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', cache);
  return new StreamableFile(Buffer.from(file.fileData));
}

@Controller('schedules')
@UseGuards(JwtAuthGuard)
export class ScheduleController {
  constructor(private readonly prisma: PrismaService) {}

  private async canEdit(actor: Actor): Promise<boolean> {
    if (canEditSchedule(actor, null)) return true;
    if (!actor.departmentId) return false;
    const department = await this.prisma.department.findUnique({
      where: { id: actor.departmentId },
      select: { kind: true, isActive: true },
    });
    return Boolean(department?.isActive) && canEditSchedule(actor, department?.kind);
  }

  private async requireEditor(actor: Actor) {
    if (!(await this.canEdit(actor))) {
      throw new ForbiddenException('Chỉ Văn phòng, văn thư, lãnh đạo hoặc quản trị được lập lịch làm việc');
    }
  }

  @Get()
  async week(@Req() req: any, @Query() query: ScheduleWeekQueryDto) {
    const actor = getActor(req);
    const today = vietnamToday();
    const weekStart = weekStartOf(query.week ?? today);
    const schedule = await this.prisma.workSchedule.findUnique({
      where: { weekStart: parseDay(weekStart) },
      select: SCHEDULE_SELECT,
    });
    return {
      weekStart,
      weekEnd: addDays(weekStart, 6),
      today,
      canEdit: await this.canEdit(actor),
      schedule: schedule ? scheduleView(schedule, 'staff') : null,
    };
  }

  @Put(':week')
  async save(@Req() req: any, @Param('week') week: string, @Body() dto: SaveScheduleDto) {
    const actor = getActor(req);
    await this.requireEditor(actor);
    const weekStart = requireMonday(week);
    const weekEnd = addDays(weekStart, 6);
    for (const [index, entry] of dto.entries.entries()) {
      parseDay(entry.date);
      if (entry.date < weekStart || entry.date > weekEnd) {
        throw new BadRequestException(`Dòng ${index + 1}: ngày ${entry.date} không thuộc tuần ${weekStart}`);
      }
    }
    const saved = await this.prisma.$transaction(async tx => {
      const current = await tx.workSchedule.findUnique({ where: { weekStart: parseDay(weekStart) }, select: { id: true, version: true } });
      if (current && dto.expectedVersion !== undefined && current.version !== dto.expectedVersion) {
        throw new ConflictException('Lịch tuần này vừa được người khác cập nhật. Hãy tải lại trước khi lưu.');
      }
      const schedule = current
        ? await tx.workSchedule.update({
            where: { id: current.id },
            data: { title: dto.title ?? null, note: dto.note ?? null, updatedById: actor.id, version: { increment: 1 } },
            select: { id: true },
          })
        : await tx.workSchedule.create({
            data: { weekStart: parseDay(weekStart), title: dto.title ?? null, note: dto.note ?? null, createdById: actor.id, updatedById: actor.id },
            select: { id: true },
          });
      await tx.workScheduleEntry.deleteMany({ where: { scheduleId: schedule.id } });
      if (dto.entries.length) {
        await tx.workScheduleEntry.createMany({
          data: dto.entries.map((entry, index) => ({
            scheduleId: schedule.id,
            date: parseDay(entry.date),
            session: entry.session,
            startTime: entry.startTime ?? null,
            content: entry.content,
            leader: entry.leader,
            location: entry.location ?? null,
            participants: entry.participants ?? null,
            isPublic: entry.isPublic ?? true,
            sortOrder: index,
          })),
        });
      }
      await audit(tx, actor, {
        action: 'SCHEDULE_SAVED', entityType: 'WorkSchedule', entityId: schedule.id, departmentId: null,
        metadata: { week: weekStart, entryCount: dto.entries.length },
      });
      return tx.workSchedule.findUniqueOrThrow({ where: { id: schedule.id }, select: SCHEDULE_SELECT });
    });
    return scheduleView(saved, 'staff');
  }

  @Post(':week/visibility')
  async visibility(@Req() req: any, @Param('week') week: string, @Body() dto: ScheduleVisibilityDto) {
    const actor = getActor(req);
    await this.requireEditor(actor);
    const weekStart = requireMonday(week);
    const saved = await this.prisma.$transaction(async tx => {
      const current = await tx.workSchedule.findUnique({ where: { weekStart: parseDay(weekStart) }, select: { id: true, isPublic: true } });
      if (!current) throw new NotFoundException('Tuần này chưa có lịch');
      if (current.isPublic !== dto.isPublic) {
        await tx.workSchedule.update({
          where: { id: current.id },
          data: dto.isPublic
            ? { isPublic: true, publishedAt: new Date(), publishedById: actor.id, version: { increment: 1 } }
            : { isPublic: false, version: { increment: 1 } },
        });
        await audit(tx, actor, {
          action: dto.isPublic ? 'SCHEDULE_PUBLISHED' : 'SCHEDULE_UNPUBLISHED', entityType: 'WorkSchedule', entityId: current.id,
          departmentId: null, metadata: { week: weekStart },
        });
      }
      return tx.workSchedule.findUniqueOrThrow({ where: { id: current.id }, select: SCHEDULE_SELECT });
    });
    return scheduleView(saved, 'staff');
  }

  /** Chép các dòng của tuần liền trước sang tuần đang mở (chỉ khi tuần này chưa có dòng nào). */
  @Post(':week/copy-previous')
  async copyPrevious(@Req() req: any, @Param('week') week: string) {
    const actor = getActor(req);
    await this.requireEditor(actor);
    const weekStart = requireMonday(week);
    const saved = await this.prisma.$transaction(async tx => {
      const previous = await tx.workSchedule.findUnique({
        where: { weekStart: parseDay(addDays(weekStart, -7)) },
        select: { entries: { select: ENTRY_SELECT } },
      });
      if (!previous?.entries.length) throw new NotFoundException('Tuần trước chưa có dòng lịch nào để chép');
      const current = await tx.workSchedule.findUnique({
        where: { weekStart: parseDay(weekStart) },
        select: { id: true, _count: { select: { entries: true } } },
      });
      if (current?._count.entries) throw new ConflictException('Tuần này đã có lịch; xoá các dòng hiện có trước khi chép');
      const schedule = current
        ? await tx.workSchedule.update({ where: { id: current.id }, data: { updatedById: actor.id, version: { increment: 1 } }, select: { id: true } })
        : await tx.workSchedule.create({ data: { weekStart: parseDay(weekStart), createdById: actor.id, updatedById: actor.id }, select: { id: true } });
      await tx.workScheduleEntry.createMany({
        data: sortEntries(previous.entries).map((entry, index) => ({
          scheduleId: schedule.id,
          date: new Date(entry.date.getTime() + 7 * DAY_MS),
          session: entry.session,
          startTime: entry.startTime,
          content: entry.content,
          leader: entry.leader,
          location: entry.location,
          participants: entry.participants,
          isPublic: entry.isPublic,
          sortOrder: index,
        })),
      });
      await audit(tx, actor, {
        action: 'SCHEDULE_SAVED', entityType: 'WorkSchedule', entityId: schedule.id, departmentId: null,
        metadata: { week: weekStart, entryCount: previous.entries.length, copiedFrom: addDays(weekStart, -7) },
      });
      return tx.workSchedule.findUniqueOrThrow({ where: { id: schedule.id }, select: SCHEDULE_SELECT });
    });
    return scheduleView(saved, 'staff');
  }

  @Post(':week/file')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { files: 1, fileSize: MAX_FILE_BYTES } }))
  async uploadFile(@Req() req: any, @Param('week') week: string, @UploadedFile() file?: Express.Multer.File) {
    const actor = getActor(req);
    await this.requireEditor(actor);
    const weekStart = requireMonday(week);
    if (!file?.buffer?.length) throw new BadRequestException('Chưa chọn tệp lịch');
    if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new BadRequestException('Tệp lịch phải là PDF');
    const fileName = (uploadFileName(file.originalname) || 'lich-lam-viec.pdf').slice(0, 200);
    const fileData = new Uint8Array(file.buffer);
    const saved = await this.prisma.$transaction(async tx => {
      const schedule = await tx.workSchedule.upsert({
        where: { weekStart: parseDay(weekStart) },
        create: {
          weekStart: parseDay(weekStart), createdById: actor.id, updatedById: actor.id,
          fileName, fileMime: 'application/pdf', fileSize: fileData.byteLength, fileData,
        },
        update: {
          updatedById: actor.id, version: { increment: 1 },
          fileName, fileMime: 'application/pdf', fileSize: fileData.byteLength, fileData,
        },
        select: { id: true },
      });
      await audit(tx, actor, {
        action: 'SCHEDULE_FILE_UPLOADED', entityType: 'WorkSchedule', entityId: schedule.id, departmentId: null,
        metadata: { week: weekStart, size: file.buffer.length },
      });
      return tx.workSchedule.findUniqueOrThrow({ where: { id: schedule.id }, select: SCHEDULE_SELECT });
    });
    return scheduleView(saved, 'staff');
  }

  @Delete(':week/file')
  async removeFile(@Req() req: any, @Param('week') week: string) {
    const actor = getActor(req);
    await this.requireEditor(actor);
    const weekStart = requireMonday(week);
    const saved = await this.prisma.$transaction(async tx => {
      const current = await tx.workSchedule.findUnique({ where: { weekStart: parseDay(weekStart) }, select: { id: true, fileName: true } });
      if (!current?.fileName) throw new NotFoundException('Tuần này chưa có tệp lịch');
      await tx.workSchedule.update({
        where: { id: current.id },
        data: { fileName: null, fileMime: null, fileSize: null, fileData: null, updatedById: actor.id, version: { increment: 1 } },
      });
      await audit(tx, actor, {
        action: 'SCHEDULE_FILE_REMOVED', entityType: 'WorkSchedule', entityId: current.id, departmentId: null,
        metadata: { week: weekStart },
      });
      return tx.workSchedule.findUniqueOrThrow({ where: { id: current.id }, select: SCHEDULE_SELECT });
    });
    return scheduleView(saved, 'staff');
  }

  @Get(':week/file')
  async file(@Param('week') week: string, @Res({ passthrough: true }) response: Response) {
    const schedule = await this.prisma.workSchedule.findUnique({
      where: { weekStart: parseDay(requireMonday(week)) },
      select: { fileName: true, fileData: true },
    });
    if (!schedule) throw new NotFoundException('Tuần này chưa có tệp lịch');
    return sendPdf(response, schedule, 'private, no-store');
  }
}

/** Bản người dân xem: chỉ tuần đã công khai, chỉ dòng được đánh dấu công khai. */
@Controller('public/schedule')
export class PublicScheduleController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async week(@Query() query: ScheduleWeekQueryDto, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    const today = vietnamToday();
    const weekStart = weekStartOf(query.week ?? today);
    const day = parseDay(weekStart);
    const [schedule, previous, next] = await Promise.all([
      this.prisma.workSchedule.findFirst({ where: { weekStart: day, isPublic: true }, select: SCHEDULE_SELECT }),
      this.prisma.workSchedule.findFirst({ where: { isPublic: true, weekStart: { lt: day } }, orderBy: { weekStart: 'desc' }, select: { weekStart: true } }),
      this.prisma.workSchedule.findFirst({ where: { isPublic: true, weekStart: { gt: day } }, orderBy: { weekStart: 'asc' }, select: { weekStart: true } }),
    ]);
    return {
      weekStart,
      weekEnd: addDays(weekStart, 6),
      today,
      previousWeek: previous ? dayText(previous.weekStart) : null,
      nextWeek: next ? dayText(next.weekStart) : null,
      schedule: schedule ? scheduleView(schedule, 'public') : null,
    };
  }

  @Get(':week/file')
  async file(@Param('week') week: string, @Res({ passthrough: true }) response: Response) {
    const schedule = await this.prisma.workSchedule.findFirst({
      where: { weekStart: parseDay(requireMonday(week)), isPublic: true },
      select: { fileName: true, fileData: true },
    });
    if (!schedule) throw new NotFoundException('Không tìm thấy lịch làm việc đã công khai');
    return sendPdf(response, schedule, 'public, max-age=300');
  }
}
