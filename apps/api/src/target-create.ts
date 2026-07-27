import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, PrismaClient, TargetDirection, TargetFrequency } from '@prisma/client';
import { type Actor, audit } from './access';

export const TARGET_CODE_PREFIX = 'CT';

export function normalizeTargetDepartmentCode(code: string) {
  const normalized = code
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return normalized || 'DV';
}

export function nextTargetCode(year: number, departmentCode: string, existingCodes: string[]) {
  const prefix = `${TARGET_CODE_PREFIX}-${year}-${normalizeTargetDepartmentCode(departmentCode)}-`;
  const highestSequence = existingCodes.reduce((highest, code) => {
    if (!code.startsWith(prefix)) return highest;
    const sequence = Number(code.slice(prefix.length));
    return Number.isSafeInteger(sequence) && sequence > highest ? sequence : highest;
  }, 0);
  return `${prefix}${String(highestSequence + 1).padStart(3, '0')}`;
}

export function isTargetCodeAllocationError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === 'P2002' || error.code === 'P2034');
}

export interface CreateTargetInput {
  title: string;
  description?: string;
  unit: string;
  targetValue: number;
  weight: number;
  year: number;
  frequency: TargetFrequency;
  direction: TargetDirection;
  dueDate: Date;
  departmentId: string;
  isHighlighted: boolean;
  publicOrder?: number;
  legalBasis?: string;
  sourceDocumentId?: string;
}

type TargetCreateClient = Pick<PrismaClient, '$transaction'>;

// Cấp mã và tạo chỉ tiêu trong transaction Serializable, thử lại tối đa 3 lần khi
// đụng độ mã (P2002/P2034). Dùng chung cho tạo thủ công và duyệt chỉ tiêu AI đề xuất.
export async function createTargetWithGeneratedCode(
  prisma: TargetCreateClient,
  actor: Actor,
  input: CreateTargetInput,
  auditMetadata?: Prisma.InputJsonValue,
) {
  if (input.dueDate.getUTCFullYear() !== input.year) {
    throw new BadRequestException('Hạn hoàn thành phải thuộc cùng năm kế hoạch');
  }
  const data = {
    title: input.title.trim(),
    description: input.description?.trim(),
    unit: input.unit.trim(),
    targetValue: input.targetValue,
    weight: input.weight,
    year: input.year,
    frequency: input.frequency,
    direction: input.direction,
    dueDate: input.dueDate,
    departmentId: input.departmentId,
    isPublic: false,
    isHighlighted: input.isHighlighted,
    publicOrder: input.publicOrder,
    legalBasis: input.legalBasis?.trim() || undefined,
    sourceDocumentId: input.sourceDocumentId,
  };

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const department = await tx.department.findUnique({ where: { id: input.departmentId } });
        if (!department || !department.isActive) {
          throw new BadRequestException('Phòng ban phụ trách không tồn tại hoặc đã ngừng hoạt động');
        }
        const codePrefix = `${TARGET_CODE_PREFIX}-${input.year}-${normalizeTargetDepartmentCode(department.code)}-`;
        const existingCodes = await tx.target.findMany({
          where: { code: { startsWith: codePrefix } },
          select: { code: true },
        });
        const code = nextTargetCode(input.year, department.code, existingCodes.map(target => target.code));
        const created = await tx.target.create({
          data: { ...data, code },
          include: { department: true },
        });
        await audit(tx, actor, {
          action: 'TARGET_CREATED',
          entityType: 'Target',
          entityId: created.id,
          departmentId: input.departmentId,
          metadata: {
            code: created.code,
            year: created.year,
            codeGeneratedBySystem: true,
            ...(auditMetadata && typeof auditMetadata === 'object' ? auditMetadata : {}),
          },
        });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isTargetCodeAllocationError(error) && attempt < 3) continue;
      if (isTargetCodeAllocationError(error)) {
        throw new ConflictException('Hệ thống chưa thể cấp mã chỉ tiêu do có thao tác đồng thời. Vui lòng thử lại.');
      }
      throw error;
    }
  }

  throw new ConflictException('Hệ thống chưa thể cấp mã chỉ tiêu. Vui lòng thử lại.');
}
