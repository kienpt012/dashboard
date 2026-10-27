import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { Role } from '@prisma/client';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { audit, getActor } from '../access';
import { JwtAuthGuard } from '../common';
import { PrismaService } from '../prisma.service';
import { RateLimitService } from '../rate-limit';
import { uploadFileName } from '../upload-name';
import { DeskConfigError } from './validate';

// Ảnh nền và ảnh của widget. Ảnh được giải mã rồi mã hoá lại WebP: mọi siêu dữ liệu (EXIF, vị trí GPS, tệp đính kèm
// lén trong ảnh) đều mất, kích thước gọn để tải nhanh. Ảnh dùng chung do quản trị đăng, ai cũng chọn được.

export const ASSET_INPUT_MAX_BYTES = 10 * 1024 * 1024;
export const ASSET_MAX_EDGE = 2560;
export const ASSET_THUMB_EDGE = 480;
export const ASSET_QUALITY = 82;
export const ASSET_MAX_PIXELS = 40_000_000;
export const ASSETS_PER_USER = 20;
export const ASSET_BYTES_PER_USER = 40 * 1024 * 1024;
export const SHARED_ASSETS_MAX = 60;

export type ImageKind = 'jpeg' | 'png' | 'webp';

export function sniffImage(buffer: Buffer): ImageKind | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

/** Đọc kích thước khai báo trong phần đầu tệp, để từ chối "bom" giải nén trước khi giải mã. Không đọc được thì trả null. */
export function declaredSize(buffer: Buffer, kind: ImageKind): { width: number; height: number } | null {
  try {
    if (kind === 'png') return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    if (kind === 'webp') {
      const chunk = buffer.subarray(12, 16).toString('latin1');
      if (chunk === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
      if (chunk === 'VP8 ') return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L') {
        const bits = buffer.readUInt32LE(21);
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
      }
      return null;
    }
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) return null;
      const marker = buffer[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
    return null;
  } catch {
    return null;
  }
}

async function encode(image: Awaited<ReturnType<typeof loadImage>>, edge: number) {
  const scale = Math.min(1, edge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').drawImage(image, 0, 0, width, height);
  return { bytes: await canvas.encode('webp', ASSET_QUALITY), width, height };
}

export async function processImage(input: Buffer): Promise<{ bytes: Buffer; thumb: Buffer; width: number; height: number }> {
  const kind = sniffImage(input);
  if (!kind) throw new DeskConfigError('Tệp không phải ảnh JPEG, PNG hoặc WebP');
  const declared = declaredSize(input, kind);
  if (declared && declared.width * declared.height > ASSET_MAX_PIXELS) {
    throw new DeskConfigError('Ảnh quá lớn (tối đa 40 triệu điểm ảnh)');
  }
  let image: Awaited<ReturnType<typeof loadImage>>;
  try {
    image = await loadImage(input);
  } catch {
    throw new DeskConfigError('Không đọc được ảnh, tệp có thể bị hỏng');
  }
  if (!image.width || !image.height) throw new DeskConfigError('Không đọc được ảnh, tệp có thể bị hỏng');
  if (image.width * image.height > ASSET_MAX_PIXELS) throw new DeskConfigError('Ảnh quá lớn (tối đa 40 triệu điểm ảnh)');
  const full = await encode(image, ASSET_MAX_EDGE);
  const thumb = await encode(image, ASSET_THUMB_EDGE);
  return { bytes: full.bytes, thumb: thumb.bytes, width: full.width, height: full.height };
}

const META = { id: true, name: true, width: true, height: true, sizeBytes: true, isShared: true, ownerId: true, createdAt: true } as const;

function assetName(raw: string | undefined) {
  const name = uploadFileName(raw).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return (name || 'Ảnh').slice(0, 120);
}

class UpdateAssetDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;
}

@Controller('desk/assets')
@UseGuards(JwtAuthGuard)
export class DeskAssetsController {
  constructor(private readonly prisma: PrismaService, private readonly rateLimit: RateLimitService) {}

  @Get()
  async list(@Req() req: any) {
    const actor = getActor(req);
    const [mine, shared] = await Promise.all([
      this.prisma.deskAsset.findMany({ where: { ownerId: actor.id }, select: META, orderBy: { createdAt: 'desc' } }),
      this.prisma.deskAsset.findMany({ where: { isShared: true }, select: META, orderBy: { createdAt: 'desc' } }),
    ]);
    const usedBytes = mine.reduce((sum, asset) => sum + asset.sizeBytes, 0);
    return { mine, shared, usedBytes, limitBytes: ASSET_BYTES_PER_USER, limitCount: ASSETS_PER_USER };
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { files: 1, fileSize: ASSET_INPUT_MAX_BYTES } }))
  async upload(@Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    const actor = getActor(req);
    this.rateLimit.consume('desk-asset-upload', actor.id, { limit: 30, windowMs: 10 * 60_000, message: 'Bạn tải ảnh quá nhanh, vui lòng thử lại sau ít phút' });
    if (!file?.buffer?.length) throw new BadRequestException('Chưa chọn ảnh');
    let processed: Awaited<ReturnType<typeof processImage>>;
    try {
      processed = await processImage(file.buffer);
    } catch (error) {
      if (error instanceof DeskConfigError) throw new BadRequestException(error.message);
      throw error;
    }
    const sha256 = createHash('sha256').update(processed.bytes).digest('hex');
    const duplicate = await this.prisma.deskAsset.findFirst({ where: { ownerId: actor.id, sha256 }, select: META });
    if (duplicate) return duplicate;
    const owned = await this.prisma.deskAsset.aggregate({ where: { ownerId: actor.id }, _count: true, _sum: { sizeBytes: true } });
    if (owned._count >= ASSETS_PER_USER) throw new BadRequestException(`Mỗi người lưu tối đa ${ASSETS_PER_USER} ảnh, hãy xoá bớt ảnh cũ`);
    if ((owned._sum.sizeBytes ?? 0) + processed.bytes.length > ASSET_BYTES_PER_USER) throw new BadRequestException('Đã dùng hết 40 MB dành cho ảnh, hãy xoá bớt ảnh cũ');
    return this.prisma.deskAsset.create({
      data: {
        ownerId: actor.id,
        name: assetName(file.originalname),
        mimeType: 'image/webp',
        width: processed.width,
        height: processed.height,
        sizeBytes: processed.bytes.length,
        sha256,
        bytes: Uint8Array.from(processed.bytes),
        thumb: Uint8Array.from(processed.thumb),
      },
      select: META,
    });
  }

  @Get(':id')
  async content(
    @Req() req: any,
    @Param('id') id: string,
    @Query('size') size: string | undefined,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ) {
    const actor = getActor(req);
    const thumb = size === 'thumb';
    const where = { id, OR: [{ ownerId: actor.id }, { isShared: true }] };
    const asset = thumb
      ? await this.prisma.deskAsset.findFirst({ where, select: { sha256: true, mimeType: true, thumb: true } }).then(row => row && { ...row, data: row.thumb })
      : await this.prisma.deskAsset.findFirst({ where, select: { sha256: true, mimeType: true, bytes: true } }).then(row => row && { ...row, data: row.bytes });
    if (!asset) throw new NotFoundException('Không tìm thấy ảnh');
    const etag = `"${asset.sha256}${thumb ? '-t' : ''}"`;
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('ETag', etag);
    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }
    const body = Buffer.from(asset.data);
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Content-Length', String(body.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).end(body);
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateAssetDto) {
    const actor = getActor(req);
    const asset = await this.prisma.deskAsset.findUnique({ where: { id }, select: META });
    const isAdmin = actor.role === Role.ADMIN;
    if (!asset || (asset.ownerId !== actor.id && !(isAdmin && asset.isShared))) throw new NotFoundException('Không tìm thấy ảnh');
    if (dto.isShared !== undefined && dto.isShared !== asset.isShared) {
      if (!isAdmin) throw new ForbiddenException('Chỉ quản trị hệ thống được đăng ảnh dùng chung');
      if (dto.isShared && (await this.prisma.deskAsset.count({ where: { isShared: true } })) >= SHARED_ASSETS_MAX) {
        throw new BadRequestException(`Tối đa ${SHARED_ASSETS_MAX} ảnh dùng chung`);
      }
    }
    const name = dto.name === undefined ? undefined : dto.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) || asset.name;
    const updated = await this.prisma.deskAsset.update({ where: { id }, data: { name, isShared: dto.isShared }, select: META });
    if (dto.isShared !== undefined && dto.isShared !== asset.isShared) {
      await audit(this.prisma, actor, { action: 'DESK_ASSET_SHARED', entityType: 'DeskAsset', entityId: id, metadata: { isShared: dto.isShared, name: updated.name } });
    }
    return updated;
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const actor = getActor(req);
    const result = await this.prisma.deskAsset.deleteMany({
      where: { id, OR: [{ ownerId: actor.id }, ...(actor.role === Role.ADMIN ? [{ isShared: true }] : [])] },
    });
    if (!result.count) throw new NotFoundException('Không tìm thấy ảnh');
    return { ok: true };
  }
}
