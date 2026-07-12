import { TargetDirection, TargetStatus } from '@prisma/client';

export interface TargetMetricInput {
  targetValue: number;
  currentValue: number;
  direction?: TargetDirection;
  dueDate?: Date | string;
  riskThreshold?: number;
  now?: Date;
  hasReport?: boolean;
}

export interface TargetMetric {
  progress: number;
  status: TargetStatus;
  completed: boolean;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function calculateProgress(
  targetValue: number,
  currentValue: number,
  direction: TargetDirection = TargetDirection.HIGHER_IS_BETTER,
): number {
  if (!Number.isFinite(targetValue) || !Number.isFinite(currentValue)) return 0;

  if (direction === TargetDirection.LOWER_IS_BETTER) {
    if (currentValue <= targetValue) return 100;
    if (currentValue <= 0) return 100;
    return clampPercent((targetValue / currentValue) * 100);
  }

  if (targetValue <= 0) return currentValue >= targetValue ? 100 : 0;
  return clampPercent((currentValue / targetValue) * 100);
}

export function evaluateTarget(input: TargetMetricInput): TargetMetric {
  const direction = input.direction ?? TargetDirection.HIGHER_IS_BETTER;
  const hasReport = input.hasReport ?? input.currentValue !== 0;
  if (!hasReport) {
    return { progress: 0, status: TargetStatus.NOT_STARTED, completed: false };
  }

  const progress = calculateProgress(input.targetValue, input.currentValue, direction);
  const completed = direction === TargetDirection.LOWER_IS_BETTER
    ? input.currentValue <= input.targetValue
    : input.currentValue >= input.targetValue;

  if (completed) {
    return { progress: 100, status: TargetStatus.COMPLETED, completed: true };
  }

  const dueDate = input.dueDate ? new Date(input.dueDate) : undefined;
  const now = input.now ?? new Date();
  if (dueDate && Number.isFinite(dueDate.getTime()) && dueDate < now) {
    return { progress, status: TargetStatus.OVERDUE, completed: false };
  }
  const threshold = Math.max(0, Math.min(100, input.riskThreshold ?? 70));
  return {
    progress,
    status: progress >= threshold ? TargetStatus.ON_TRACK : TargetStatus.AT_RISK,
    completed: false,
  };
}
