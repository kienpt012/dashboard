import { HttpException, HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitRule {
  limit: number;
  windowMs: number;
  message?: string;
}

const CLEANUP_INTERVAL_MS = 60_000;
const MAX_ENTRIES = 50_000;

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly entries = new Map<string, RateLimitEntry>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  consume(bucket: string, key: string, rule: RateLimitRule): void {
    if (!Number.isInteger(rule.limit) || rule.limit < 1 || rule.windowMs < 1) {
      throw new Error('Cấu hình rate limit không hợp lệ');
    }

    const now = Date.now();
    const entryKey = this.entryKey(bucket, key);
    const current = this.entries.get(entryKey);

    if (!current || current.resetAt <= now) {
      this.ensureCapacity(now);
      this.entries.set(entryKey, { count: 1, resetAt: now + rule.windowMs });
      return;
    }

    if (current.count >= rule.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1_000));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: rule.message || 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    current.count += 1;
  }

  reset(bucket: string, key: string): void {
    this.entries.delete(this.entryKey(bucket, key));
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
    this.entries.clear();
  }

  private entryKey(bucket: string, key: string): string {
    const safeBucket = bucket.trim().toLowerCase().slice(0, 80) || 'default';
    const safeKey = key.trim().toLowerCase().slice(0, 256) || 'unknown';
    return `${safeBucket}:${safeKey}`;
  }

  private ensureCapacity(now: number): void {
    if (this.entries.size < MAX_ENTRIES) return;
    this.cleanup(now);
    if (this.entries.size < MAX_ENTRIES) return;

    const oldestKey = this.entries.keys().next().value as string | undefined;
    if (oldestKey) this.entries.delete(oldestKey);
  }

  private cleanup(now = Date.now()): void {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }
}

export function getClientIp(request: any): string {
  return String(request?.ip || request?.socket?.remoteAddress || 'unknown').trim();
}
