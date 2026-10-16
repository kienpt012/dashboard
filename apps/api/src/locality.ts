import { Body, ConflictException, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { LocalityKind, LocalityProfile, Prisma, Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsHexColor, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { audit, getActor } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { PrismaService } from './prisma.service';

// Hồ sơ địa phương: nguồn duy nhất cho tên đơn vị, tiêu đề, chân trang, email, tệp xuất.
// Mang IOC sang xã/phường khác chỉ cần chạy trình thiết lập — không còn chuỗi địa danh nào trong mã nguồn.

const Trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
const ValidateIfDefined = () => ValidateIf((_object, value) => value !== undefined && value !== null && value !== '');

export const LOCALITY_KIND_LABELS: Record<LocalityKind, string> = {
  XA: 'Xã',
  PHUONG: 'Phường',
  DAC_KHU: 'Đặc khu',
  TRUONG_HOC: 'Trường học',
  CO_QUAN_KHAC: 'Cơ quan, đơn vị khác',
};

type LocalityView = Omit<LocalityProfile, 'updatedAt'> & { updatedAt: Date | null; configured: boolean };

export const DEFAULT_LOCALITY: LocalityView = {
  id: 'default',
  kind: LocalityKind.PHUONG,
  name: 'Đơn vị chưa thiết lập',
  agencyName: 'Ủy ban nhân dân',
  shortName: '',
  provinceName: null,
  adminUnitCode: null,
  agencyCode: null,
  address: null,
  phone: null,
  email: null,
  website: null,
  emailDomain: null,
  primaryColor: '#1d4ed8',
  setupCompletedAt: null,
  appliedTemplates: [],
  version: 0,
  updatedBy: null,
  updatedAt: null,
  configured: false,
};

export async function loadLocality(prisma: Pick<PrismaService, 'localityProfile'>): Promise<LocalityView> {
  const profile = await prisma.localityProfile.findUnique({ where: { id: 'default' } });
  return profile ? { ...profile, configured: Boolean(profile.setupCompletedAt) } : DEFAULT_LOCALITY;
}

/** Tên ứng dụng hiển thị: "IOC Lái Thiêu", hoặc "IOC" khi chưa thiết lập. */
export function brandName(profile: Pick<LocalityView, 'shortName'>): string {
  return profile.shortName?.trim() ? `IOC ${profile.shortName.trim()}` : 'IOC';
}

export function publicLocality(profile: LocalityView) {
  return {
    configured: profile.configured,
    kind: profile.kind,
    kindLabel: LOCALITY_KIND_LABELS[profile.kind],
    name: profile.name,
    agencyName: profile.agencyName,
    shortName: profile.shortName,
    brandName: brandName(profile),
    provinceName: profile.provinceName,
    adminUnitCode: profile.adminUnitCode,
    address: profile.address,
    phone: profile.phone,
    email: profile.email,
    website: profile.website,
    primaryColor: profile.primaryColor,
  };
}

export class UpdateLocalityDto {
  @IsOptional() @IsInt() @Min(0)
  expectedVersion?: number;

  @IsEnum(LocalityKind, { message: 'Loại đơn vị không hợp lệ' })
  kind!: LocalityKind;

  @Trim() @IsString() @MinLength(3, { message: 'Tên địa phương phải có ít nhất 3 ký tự' })
  @MaxLength(160, { message: 'Tên địa phương không được vượt quá 160 ký tự' })
  name!: string;

  @Trim() @IsString() @MinLength(3, { message: 'Tên cơ quan phải có ít nhất 3 ký tự' })
  @MaxLength(200, { message: 'Tên cơ quan không được vượt quá 200 ký tự' })
  agencyName!: string;

  @Trim() @IsString() @MinLength(1, { message: 'Tên ngắn không được để trống' })
  @MaxLength(40, { message: 'Tên ngắn không được vượt quá 40 ký tự' })
  shortName!: string;

  @ValidateIfDefined() @Trim() @IsString() @MaxLength(160)
  provinceName?: string | null;

  @ValidateIfDefined() @Trim() @Matches(/^\d{5}$/, { message: 'Mã đơn vị hành chính cấp xã gồm 5 chữ số (QĐ 19/2025/QĐ-TTg)' })
  adminUnitCode?: string | null;

  @ValidateIfDefined() @Trim() @Matches(/^[A-Za-z0-9.\-]{2,40}$/, { message: 'Mã định danh cơ quan chỉ gồm chữ, số, dấu chấm, gạch ngang' })
  agencyCode?: string | null;

  @ValidateIfDefined() @Trim() @IsString() @MaxLength(300)
  address?: string | null;

  @ValidateIfDefined() @Trim() @Matches(/^[0-9+().\s-]{6,30}$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string | null;

  @ValidateIfDefined() @Trim() @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'Email liên hệ không hợp lệ' })
  email?: string | null;

  @ValidateIfDefined() @Trim() @Matches(/^https?:\/\/\S+$/, { message: 'Trang thông tin phải bắt đầu bằng http:// hoặc https://' })
  website?: string | null;

  @ValidateIfDefined() @Trim() @Matches(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i, { message: 'Tên miền email không hợp lệ (vd laithieu.gov.vn)' })
  emailDomain?: string | null;

  @ValidateIfDefined() @IsHexColor({ message: 'Màu thương hiệu phải là mã màu hex' })
  primaryColor?: string;
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : null;
}

export function localityData(dto: UpdateLocalityDto) {
  return {
    kind: dto.kind,
    name: dto.name.trim(),
    agencyName: dto.agencyName.trim(),
    shortName: dto.shortName.trim(),
    provinceName: emptyToNull(dto.provinceName),
    adminUnitCode: emptyToNull(dto.adminUnitCode),
    agencyCode: emptyToNull(dto.agencyCode),
    address: emptyToNull(dto.address),
    phone: emptyToNull(dto.phone),
    email: emptyToNull(dto.email),
    website: emptyToNull(dto.website),
    emailDomain: emptyToNull(dto.emailDomain)?.toLowerCase() ?? null,
    primaryColor: dto.primaryColor || '#1d4ed8',
  };
}

/** Ghi hồ sơ địa phương trong transaction có sẵn, có kiểm tra phiên bản để hai quản trị viên không ghi đè nhau. */
export async function saveLocality(tx: Prisma.TransactionClient, actor: import('./access').Actor, dto: UpdateLocalityDto) {
  const current = await tx.localityProfile.findUnique({ where: { id: 'default' } });
  const data = localityData(dto);
  if (!current) {
    if (dto.expectedVersion !== undefined && dto.expectedVersion !== 0) {
      throw new ConflictException('Hồ sơ địa phương vừa thay đổi. Vui lòng tải lại.');
    }
    const created = await tx.localityProfile.create({ data: { id: 'default', ...data, updatedBy: actor.id } });
    await audit(tx, actor, { action: 'LOCALITY_UPDATED', entityType: 'LocalityProfile', entityId: 'default', departmentId: null, metadata: { version: created.version } });
    return created;
  }
  if (dto.expectedVersion !== undefined && dto.expectedVersion !== current.version) {
    throw new ConflictException('Hồ sơ địa phương vừa được người khác cập nhật. Vui lòng tải lại.');
  }
  const changed = await tx.localityProfile.updateMany({
    where: { id: 'default', version: current.version },
    data: { ...data, updatedBy: actor.id, version: { increment: 1 } },
  });
  if (changed.count !== 1) throw new ConflictException('Hồ sơ địa phương vừa được người khác cập nhật. Vui lòng tải lại.');
  const updated = await tx.localityProfile.findUniqueOrThrow({ where: { id: 'default' } });
  await audit(tx, actor, { action: 'LOCALITY_UPDATED', entityType: 'LocalityProfile', entityId: 'default', departmentId: null, metadata: { previousVersion: current.version, version: updated.version } });
  return updated;
}

@Controller()
export class LocalityController {
  constructor(private readonly prisma: PrismaService) {}

  /** Công khai: trang người dân và màn hình đăng nhập cần tên đơn vị trước khi có phiên. */
  @Get('public/locality')
  async publicProfile() {
    return publicLocality(await loadLocality(this.prisma));
  }

  @Get('locality')
  @UseGuards(JwtAuthGuard)
  async profile() {
    const profile = await loadLocality(this.prisma);
    return { ...profile, brandName: brandName(profile), kindLabel: LOCALITY_KIND_LABELS[profile.kind] };
  }

  @Put('locality')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async update(@Req() req: any, @Body() dto: UpdateLocalityDto) {
    const actor = getActor(req);
    try {
      const saved = await this.prisma.$transaction(tx => saveLocality(tx, actor, dto), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      return { ...saved, configured: Boolean(saved.setupCompletedAt), brandName: brandName(saved) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
        throw new ConflictException('Hồ sơ địa phương vừa được cập nhật đồng thời. Vui lòng tải lại.');
      }
      throw error;
    }
  }
}
