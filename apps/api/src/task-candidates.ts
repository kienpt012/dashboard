import { BadRequestException } from '@nestjs/common';
import { FrameworkKind, Prisma, TargetDirection, TargetFrequency } from '@prisma/client';

/** Đề xuất nhiệm vụ dùng cùng quy ước 100% như tạo tay; bộ TASK quyết định loại khi nguồn đề xuất cũ thiếu loại. */
export async function taskCandidateFields(
  tx: Pick<Prisma.TransactionClient, 'framework'>,
  proposal: { frameworkId?: string | null; targetKind?: FrameworkKind },
) {
  const framework = proposal.frameworkId
    ? await tx.framework.findUnique({ where: { id: proposal.frameworkId }, select: { kind: true, isActive: true } })
    : null;
  if (proposal.frameworkId && !framework?.isActive) throw new BadRequestException('Bộ chỉ tiêu không tồn tại hoặc đã lưu trữ');
  if (framework?.kind !== FrameworkKind.TASK && proposal.targetKind !== FrameworkKind.TASK) return {};
  if (framework && framework.kind !== FrameworkKind.TASK) throw new BadRequestException('Nhiệm vụ phải thuộc bộ loại Nhiệm vụ');
  return {
    targetKind: FrameworkKind.TASK,
    unit: '%',
    targetValue: 100,
    frequency: TargetFrequency.YEARLY,
    direction: TargetDirection.HIGHER_IS_BETTER,
  };
}
