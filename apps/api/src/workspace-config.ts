import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { assertWorkspaceConfig, validateWorkspaceLink as checkLink } from './workspace-schema';

export function validateWorkspaceConfig(value: unknown): Prisma.InputJsonObject {
  try { return assertWorkspaceConfig(value) as Prisma.InputJsonObject; }
  catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Cấu hình không hợp lệ'); }
}

export function validateWorkspaceLink(value: unknown, allowRelative = true): string {
  try { return checkLink(value, allowRelative); }
  catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Liên kết không hợp lệ'); }
}
