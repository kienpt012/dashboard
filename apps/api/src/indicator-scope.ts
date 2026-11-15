import { FrameworkKind } from '@prisma/client';

/** Nhiệm vụ dùng chung Target nhưng không thuộc mẫu số điều hành chỉ tiêu. */
export function isIndicator(kind: FrameworkKind) { return kind !== FrameworkKind.TASK; }
export function isPerformanceIndicator(kind: FrameworkKind) { return kind === FrameworkKind.PLAN || kind === FrameworkKind.SCORE; }
