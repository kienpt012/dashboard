import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Allow, ArrayMaxSize, IsArray, IsInt, IsObject, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { type Actor, getActor, isGlobalRole } from '../access';
import { JwtAuthGuard } from '../common';
import { PrismaService } from '../prisma.service';
import { catalogFor, fieldsOf } from './catalog';
import { defaultProfileConfig, defaultSpaces, newWidgetId } from './defaults';
import {
  DeskConfigError,
  MAX_SPACES,
  normalizeProfileConfig,
  normalizeSpaceConfig,
  STATE_MAX_BYTES,
  type DeskSpaceConfig,
} from './validate';

// Bàn làm việc số: hồ sơ (giao diện, dock…), không gian (widget + bố cục) và trạng thái widget cá nhân. Mọi dữ liệu ở
// đây là của chính người đăng nhập — không có đường nào đọc bàn làm việc của người khác.

const ICON = /^[a-z0-9-]{1,40}$/;
const WIDGET_STATE_ID = /^(w_[A-Za-z0-9]{8,24}|alerts\.seen)$/;

class SaveProfileDto {
  @IsObject()
  config!: Record<string, unknown>;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

class CreateSpaceDto {
  @IsString()
  @MaxLength(40)
  name!: string;

  @IsString()
  @Matches(ICON)
  icon!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  copyFromId?: string;
}

class SaveSpaceDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(ICON)
  icon?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

class OrderSpacesDto {
  @IsArray()
  @ArrayMaxSize(MAX_SPACES)
  @IsString({ each: true })
  ids!: string[];
}

class SaveStateDto {
  @Allow()
  state!: unknown;

  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

type SpaceRow = { id: string; name: string; icon: string; position: number; config: Prisma.JsonValue; version: number };

function badConfig(error: unknown): never {
  if (error instanceof DeskConfigError) throw new BadRequestException(error.message);
  throw error;
}

function spaceName(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 40) || 'Không gian mới';
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Nhân bản cấu hình không gian với mã widget mới (bố cục đổi theo). */
function cloneSpaceConfig(config: DeskSpaceConfig): DeskSpaceConfig {
  const ids = new Map(config.widgets.map(widget => [widget.id, newWidgetId()]));
  const relabel = (items: DeskSpaceConfig['layouts']['desktop']) => items.map(item => ({ ...item, i: ids.get(item.i) ?? item.i }));
  return {
    ...config,
    widgets: config.widgets.map(widget => ({ ...widget, id: ids.get(widget.id)! })),
    layouts: { desktop: relabel(config.layouts.desktop), tablet: relabel(config.layouts.tablet), mobile: relabel(config.layouts.mobile) },
  };
}

@Controller('desk')
@UseGuards(JwtAuthGuard)
export class DeskController {
  constructor(private readonly prisma: PrismaService) {}

  /** Phòng người dùng được chọn làm "phòng đang xem": vai trò toàn địa phương chọn mọi phòng, người khác chỉ phòng mình. */
  private focusDepartments(actor: Actor) {
    return this.prisma.department.findMany({
      where: { isActive: true, ...(isGlobalRole(actor.role) ? {} : { id: actor.departmentId ?? '__none__' }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, color: true },
    });
  }

  private presentSpace(actor: Actor, space: SpaceRow) {
    const config = normalizeSpaceConfig(space.config, actor.role);
    if (!isGlobalRole(actor.role)) config.focusDepartmentId = actor.departmentId;
    return { id: space.id, name: space.name, icon: space.icon, position: space.position, version: space.version, config };
  }

  private async loadDesk(actor: Actor) {
    const profile = await this.prisma.deskProfile.findUnique({
      where: { userId: actor.id },
      include: { spaces: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (profile && profile.spaces.length) return profile;
    const departments = await this.focusDepartments(actor);
    const focus = actor.departmentId && departments.some(item => item.id === actor.departmentId) ? actor.departmentId : departments[0]?.id ?? null;
    const spaces = defaultSpaces(actor.role, focus);
    try {
      await this.prisma.$transaction(async tx => {
        if (!profile) {
          await tx.deskProfile.create({ data: { userId: actor.id, config: defaultProfileConfig(actor.role) as unknown as Prisma.InputJsonValue } });
        }
        await tx.deskSpace.createMany({
          data: spaces.map((space, position) => ({ userId: actor.id, name: space.name, icon: space.icon, position, config: space.config as unknown as Prisma.InputJsonValue })),
        });
      });
    } catch (error) {
      // Hai tab mở bàn làm việc lần đầu cùng lúc: tab đến sau đọc lại bản tab kia vừa tạo.
      if (!isUniqueViolation(error)) throw error;
    }
    return this.prisma.deskProfile.findUniqueOrThrow({
      where: { userId: actor.id },
      include: { spaces: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
  }

  private async present(actor: Actor) {
    const [profile, focusDepartments] = await Promise.all([this.loadDesk(actor), this.focusDepartments(actor)]);
    return {
      profile: { config: normalizeProfileConfig(profile.config), version: profile.version },
      spaces: profile.spaces.map(space => this.presentSpace(actor, space)),
      focusDepartments,
    };
  }

  /** Phòng đang xem phải là phòng người dùng được chọn; sai thì bỏ trống. */
  private async sanitizeFocus(actor: Actor, config: DeskSpaceConfig) {
    if (!isGlobalRole(actor.role)) {
      config.focusDepartmentId = actor.departmentId;
      return config;
    }
    if (config.focusDepartmentId) {
      const exists = await this.prisma.department.count({ where: { id: config.focusDepartmentId, isActive: true } });
      if (!exists) config.focusDepartmentId = null;
    }
    return config;
  }

  @Get()
  async desk(@Req() req: any) {
    return this.present(getActor(req));
  }

  @Get('catalog')
  catalog(@Req() req: any) {
    const actor = getActor(req);
    return catalogFor(actor.role).map(def => ({ ...def, fields: fieldsOf(def) }));
  }

  @Put('profile')
  async saveProfile(@Req() req: any, @Body() dto: SaveProfileDto) {
    const actor = getActor(req);
    let config;
    try {
      config = normalizeProfileConfig(dto.config);
    } catch (error) {
      badConfig(error);
    }
    const result = await this.prisma.deskProfile.updateMany({
      where: { userId: actor.id, version: dto.expectedVersion },
      data: { config: config as unknown as Prisma.InputJsonValue, version: { increment: 1 } },
    });
    if (!result.count) {
      const exists = await this.prisma.deskProfile.count({ where: { userId: actor.id } });
      if (!exists) throw new NotFoundException('Chưa có bàn làm việc, hãy tải lại trang');
      throw new ConflictException('Cài đặt bàn làm việc vừa được sửa ở nơi khác');
    }
    return { version: dto.expectedVersion + 1, config };
  }

  @Post('spaces')
  async createSpace(@Req() req: any, @Body() dto: CreateSpaceDto) {
    const actor = getActor(req);
    const desk = await this.loadDesk(actor);
    if (desk.spaces.length >= MAX_SPACES) throw new BadRequestException(`Mỗi người tối đa ${MAX_SPACES} không gian`);
    let config: DeskSpaceConfig;
    if (dto.copyFromId) {
      const source = desk.spaces.find(space => space.id === dto.copyFromId);
      if (!source) throw new NotFoundException('Không tìm thấy không gian để nhân bản');
      config = cloneSpaceConfig(normalizeSpaceConfig(source.config, actor.role));
    } else {
      const first = desk.spaces[0] ? normalizeSpaceConfig(desk.spaces[0].config, actor.role) : null;
      config = normalizeSpaceConfig({ focusDepartmentId: first?.focusDepartmentId ?? null, widgets: [] }, actor.role);
    }
    await this.sanitizeFocus(actor, config);
    const position = desk.spaces.reduce((max, space) => Math.max(max, space.position), -1) + 1;
    const space = await this.prisma.deskSpace.create({
      data: { userId: actor.id, name: spaceName(dto.name), icon: dto.icon, position, config: config as unknown as Prisma.InputJsonValue },
    });
    return this.presentSpace(actor, space);
  }

  @Put('spaces/:id')
  async saveSpace(@Req() req: any, @Param('id') id: string, @Body() dto: SaveSpaceDto) {
    const actor = getActor(req);
    const exists = await this.prisma.deskSpace.count({ where: { id, userId: actor.id } });
    if (!exists) throw new NotFoundException('Không tìm thấy không gian');
    const data: Prisma.DeskSpaceUpdateManyMutationInput = { version: { increment: 1 } };
    if (dto.name !== undefined) data.name = spaceName(dto.name);
    if (dto.icon !== undefined) data.icon = dto.icon;
    let config: DeskSpaceConfig | undefined;
    if (dto.config !== undefined) {
      try {
        config = normalizeSpaceConfig(dto.config, actor.role);
      } catch (error) {
        badConfig(error);
      }
      await this.sanitizeFocus(actor, config);
      data.config = config as unknown as Prisma.InputJsonValue;
    }
    const result = await this.prisma.deskSpace.updateMany({ where: { id, userId: actor.id, version: dto.expectedVersion }, data });
    if (!result.count) throw new ConflictException('Không gian này vừa được sửa ở nơi khác');
    return { version: dto.expectedVersion + 1, ...(config ? { config } : {}) };
  }

  @Delete('spaces/:id')
  async deleteSpace(@Req() req: any, @Param('id') id: string) {
    const actor = getActor(req);
    const spaces = await this.prisma.deskSpace.findMany({ where: { userId: actor.id }, select: { id: true, config: true } });
    const target = spaces.find(space => space.id === id);
    if (!target) throw new NotFoundException('Không tìm thấy không gian');
    if (spaces.length <= 1) throw new BadRequestException('Phải giữ ít nhất một không gian');
    const widgetIds = normalizeSpaceConfig(target.config, actor.role).widgets.map(widget => widget.id);
    await this.prisma.$transaction([
      this.prisma.deskSpace.deleteMany({ where: { id, userId: actor.id } }),
      this.prisma.deskWidgetState.deleteMany({ where: { userId: actor.id, widgetId: { in: widgetIds } } }),
    ]);
    return { ok: true };
  }

  @Post('spaces/order')
  async orderSpaces(@Req() req: any, @Body() dto: OrderSpacesDto) {
    const actor = getActor(req);
    const spaces = await this.prisma.deskSpace.findMany({ where: { userId: actor.id }, select: { id: true } });
    const own = new Set(spaces.map(space => space.id));
    if (dto.ids.length !== own.size || new Set(dto.ids).size !== own.size || dto.ids.some(id => !own.has(id))) {
      throw new BadRequestException('Danh sách không gian không khớp, hãy tải lại trang');
    }
    await this.prisma.$transaction(dto.ids.map((id, position) => this.prisma.deskSpace.updateMany({ where: { id, userId: actor.id }, data: { position } })));
    return { ok: true };
  }

  @Post('reset')
  async reset(@Req() req: any) {
    const actor = getActor(req);
    await this.prisma.$transaction(async tx => {
      await tx.deskSpace.deleteMany({ where: { userId: actor.id } });
      await tx.deskWidgetState.deleteMany({ where: { userId: actor.id } });
      await tx.deskProfile.deleteMany({ where: { userId: actor.id } });
    });
    return this.present(actor);
  }

  @Get('widgets/:widgetId/state')
  async state(@Req() req: any, @Param('widgetId') widgetId: string) {
    const actor = getActor(req);
    if (!WIDGET_STATE_ID.test(widgetId)) throw new BadRequestException('Mã widget không hợp lệ');
    const row = await this.prisma.deskWidgetState.findUnique({ where: { userId_widgetId: { userId: actor.id, widgetId } } });
    return row ? { state: row.state, version: row.version } : { state: null, version: 0 };
  }

  @Put('widgets/:widgetId/state')
  async saveState(@Req() req: any, @Param('widgetId') widgetId: string, @Body() dto: SaveStateDto) {
    const actor = getActor(req);
    if (!WIDGET_STATE_ID.test(widgetId)) throw new BadRequestException('Mã widget không hợp lệ');
    if (dto.state === undefined || Buffer.byteLength(JSON.stringify(dto.state), 'utf8') > STATE_MAX_BYTES) {
      throw new BadRequestException('Dữ liệu widget trống hoặc vượt quá 64 KB');
    }
    const state = dto.state as Prisma.InputJsonValue;
    if (dto.expectedVersion === 0) {
      try {
        await this.prisma.deskWidgetState.create({ data: { userId: actor.id, widgetId, state } });
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictException('Dữ liệu widget vừa được lưu ở nơi khác');
        throw error;
      }
      return { version: 1 };
    }
    const result = await this.prisma.deskWidgetState.updateMany({
      where: { userId: actor.id, widgetId, version: dto.expectedVersion },
      data: { state, version: { increment: 1 } },
    });
    if (!result.count) throw new ConflictException('Dữ liệu widget vừa được lưu ở nơi khác');
    return { version: dto.expectedVersion + 1 };
  }
}
