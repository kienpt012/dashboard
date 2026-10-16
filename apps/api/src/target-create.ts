import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  FrameworkKind,
  IssuingLevel,
  Prisma,
  PrismaClient,
  TargetDirection,
  TargetFrequency,
  ValueSource,
} from '@prisma/client';
import { type Actor, audit } from './access';
import { recordWorkEvent } from './work';

export const TARGET_CODE_PREFIX = 'CT';

export function normalizeTargetDepartmentCode(code: string) {
  const normalized = code
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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
  // Trường của IOC bản 2 (đều tùy chọn để luồng cũ không đổi hành vi).
  frameworkId?: string | null;
  kind?: FrameworkKind;
  issuingLevel?: IssuingLevel;
  ordinal?: string | null;
  standardCode?: string | null;
  groupName?: string | null;
  sortOrder?: number;
  parentId?: string | null;
  targetText?: string | null;
  maxScore?: number | null;
  scoringRule?: string | null;
  evidenceRequirement?: string | null;
  dataSourceSystem?: string | null;
  dataSourceAgency?: string | null;
  collectionGuide?: string | null;
  dataSourceUrl?: string | null;
  reportDueDay?: number | null;
  valueSource?: ValueSource;
  formula?: Prisma.InputJsonValue | null;
  assigneeId?: string | null;
  coordinatorDepartmentIds?: string[];
}

type TargetCreateClient = Pick<PrismaClient, '$transaction'>;

function optionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Tạo chỉ tiêu bên trong một transaction có sẵn (không tự thử lại). Dùng khi việc tạo chỉ tiêu phải nguyên tử
 * với thao tác khác — ví dụ duyệt đề xuất: giữ đề xuất, cấp mã, tạo chỉ tiêu và đổi trạng thái trong cùng giao dịch.
 */
export async function createTargetInTransaction(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: CreateTargetInput,
  auditMetadata?: Prisma.InputJsonValue,
) {
  if (input.dueDate.getUTCFullYear() !== input.year) {
    throw new BadRequestException('Hạn hoàn thành phải thuộc cùng năm kế hoạch');
  }
  const department = await tx.department.findUnique({ where: { id: input.departmentId } });
  if (!department || !department.isActive) {
    throw new BadRequestException('Phòng ban phụ trách không tồn tại hoặc đã ngừng hoạt động');
  }
  if (input.frameworkId) {
    const framework = await tx.framework.findUnique({ where: { id: input.frameworkId }, select: { isActive: true } });
    if (!framework || !framework.isActive) throw new BadRequestException('Bộ chỉ tiêu không tồn tại hoặc đã ngừng sử dụng');
  }
  if (input.parentId) {
    const parent = await tx.target.findUnique({ where: { id: input.parentId }, select: { year: true, isArchived: true } });
    if (!parent || parent.isArchived) throw new BadRequestException('Chỉ tiêu cha không tồn tại hoặc đã lưu trữ');
    if (parent.year !== input.year) throw new BadRequestException('Chỉ tiêu con phải cùng năm kế hoạch với chỉ tiêu cha');
  }
  if (input.assigneeId) {
    const assignee = await tx.user.findUnique({ where: { id: input.assigneeId }, select: { departmentId: true, isActive: true } });
    if (!assignee || !assignee.isActive || assignee.departmentId !== input.departmentId) {
      throw new BadRequestException('Người phụ trách phải là cán bộ đang hoạt động của phòng chủ trì');
    }
  }
  const coordinatorIds = [...new Set((input.coordinatorDepartmentIds ?? []).filter(id => id && id !== input.departmentId))];
  if (coordinatorIds.length) {
    const found = await tx.department.count({ where: { id: { in: coordinatorIds }, isActive: true } });
    if (found !== coordinatorIds.length) throw new BadRequestException('Đơn vị phối hợp không tồn tại hoặc đã ngừng hoạt động');
  }
  const codePrefix = `${TARGET_CODE_PREFIX}-${input.year}-${normalizeTargetDepartmentCode(department.code)}-`;
  const existingCodes = await tx.target.findMany({
    where: { code: { startsWith: codePrefix } },
    select: { code: true },
  });
  const code = nextTargetCode(input.year, department.code, existingCodes.map(target => target.code));
  const now = new Date();
  const created = await tx.target.create({
    data: {
      code,
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
      frameworkId: input.frameworkId ?? undefined,
      kind: input.kind,
      issuingLevel: input.issuingLevel,
      ordinal: optionalText(input.ordinal),
      standardCode: optionalText(input.standardCode),
      groupName: optionalText(input.groupName),
      sortOrder: input.sortOrder,
      parentId: input.parentId ?? undefined,
      targetText: optionalText(input.targetText),
      maxScore: input.maxScore ?? undefined,
      scoringRule: optionalText(input.scoringRule),
      evidenceRequirement: optionalText(input.evidenceRequirement),
      dataSourceSystem: optionalText(input.dataSourceSystem),
      dataSourceAgency: optionalText(input.dataSourceAgency),
      collectionGuide: optionalText(input.collectionGuide),
      dataSourceUrl: optionalText(input.dataSourceUrl),
      reportDueDay: input.reportDueDay ?? undefined,
      valueSource: input.valueSource,
      formula: input.formula ?? undefined,
      assigneeId: input.assigneeId ?? undefined,
      assignedAt: input.assigneeId ? now : undefined,
      assignedById: input.assigneeId ? actor.id : undefined,
      coordinators: coordinatorIds.length
        ? { create: coordinatorIds.map(departmentId => ({ departmentId })) }
        : undefined,
    },
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
  await recordWorkEvent(tx, {
    action: 'TARGET_CREATED',
    actor,
    targetId: created.id,
    departmentId: created.departmentId,
    note: input.assigneeId ? 'Tạo và giao ngay cho chuyên viên phụ trách' : null,
  });
  return created;
}

// Cấp mã và tạo chỉ tiêu trong transaction Serializable, thử lại tối đa 3 lần khi
// đụng độ mã (P2002/P2034). Dùng chung cho tạo thủ công, nạp bộ chỉ tiêu mẫu và nhập Excel.
export async function createTargetWithGeneratedCode(
  prisma: TargetCreateClient,
  actor: Actor,
  input: CreateTargetInput,
  auditMetadata?: Prisma.InputJsonValue,
) {
  if (input.dueDate.getUTCFullYear() !== input.year) {
    throw new BadRequestException('Hạn hoàn thành phải thuộc cùng năm kế hoạch');
  }
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) => createTargetInTransaction(tx, actor, input, auditMetadata),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
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
