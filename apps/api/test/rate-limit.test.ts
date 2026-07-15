import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitService } from '../src/rate-limit';

test('rate limit trả 429 khi vượt ngưỡng và cho biết thời gian thử lại', () => {
  const service = new RateLimitService();
  try {
    const rule = { limit: 2, windowMs: 1_000 };
    service.consume('login', '127.0.0.1', rule);
    service.consume('login', '127.0.0.1', rule);

    assert.throws(
      () => service.consume('login', '127.0.0.1', rule),
      (error: unknown) => {
        assert.ok(error instanceof HttpException);
        assert.equal(error.getStatus(), HttpStatus.TOO_MANY_REQUESTS);
        const response = error.getResponse() as { retryAfterSeconds?: number };
        assert.equal(response.retryAfterSeconds, 1);
        return true;
      },
    );
  } finally {
    service.onModuleDestroy();
  }
});

test('rate limit cho phép thao tác lại sau khi reset', () => {
  const service = new RateLimitService();
  try {
    const rule = { limit: 1, windowMs: 1_000 };
    service.consume('feedback', '127.0.0.1', rule);
    service.reset('feedback', '127.0.0.1');
    assert.doesNotThrow(() => service.consume('feedback', '127.0.0.1', rule));
  } finally {
    service.onModuleDestroy();
  }
});
