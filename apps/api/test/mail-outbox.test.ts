import assert from 'node:assert/strict';
import test from 'node:test';
import { MailOutboxStatus } from '@prisma/client';
import {
  FeedbackMailOutboxWorker,
  feedbackOutboxRetryDelayMs,
  parseFeedbackProgressPayload,
} from '../src/mail';

function config(values: Record<string, string | undefined> = {}) {
  return { get: (key: string) => values[key] } as any;
}

function prismaWithClaimedRows(rows: Array<Record<string, unknown>>) {
  const updates: any[] = [];
  return {
    updates,
    mailOutbox: {
      updateMany: async (args: any) => {
        updates.push(args);
        return { count: 1 };
      },
    },
    $transaction: async (callback: (tx: any) => unknown) => callback({
      $queryRaw: async () => rows,
    }),
  };
}

const validPayload = {
  to: 'nguoidan@example.com',
  code: 'PA-2026-12345678',
  status: 'IN_PROGRESS',
  action: 'FEEDBACK_STARTED',
  departmentName: 'Phòng Văn hóa - Xã hội',
};

const parsedValidPayload = { ...validPayload, publicNote: null };

test('payload outbox chỉ chấp nhận dữ liệu email tiến độ có cấu trúc an toàn', () => {
  assert.deepEqual(parseFeedbackProgressPayload(validPayload), parsedValidPayload);
  assert.equal(parseFeedbackProgressPayload({ ...validPayload, to: 'a@example.com\r\nBcc:x@example.com' }), null);
  assert.equal(parseFeedbackProgressPayload({ ...validPayload, action: '' }), null);
  assert.equal(parseFeedbackProgressPayload(['not', 'an', 'object']), null);
});

test('thời gian thử lại tăng dần và có trần sáu giờ', () => {
  assert.equal(feedbackOutboxRetryDelayMs(1), 30_000);
  assert.equal(feedbackOutboxRetryDelayMs(2), 60_000);
  assert.equal(feedbackOutboxRetryDelayMs(20), 6 * 60 * 60 * 1_000);
});

test('worker gửi hàng đã claim rồi đánh dấu SENT và xóa payload nhạy cảm', async () => {
  const prisma = prismaWithClaimedRows([{
    feedbackEventId: 'event-1',
    payload: validPayload,
    attempts: 1,
  }]);
  const delivered: any[] = [];
  const mail = {
    isConfigured: () => true,
    deliverFeedbackProgress: async (...args: any[]) => delivered.push(args),
  };
  const worker = new FeedbackMailOutboxWorker(prisma as any, mail as any, config());

  assert.equal(await worker.processAvailable(), 1);
  assert.deepEqual(delivered, [[parsedValidPayload, 'event-1']]);
  assert.equal(prisma.updates[0].where.OR[0].status, MailOutboxStatus.PENDING);
  assert.equal(prisma.updates[0].where.OR[1].status, MailOutboxStatus.PROCESSING);
  assert.ok(prisma.updates[0].where.OR[1].lockedAt.lt instanceof Date);
  assert.equal(prisma.updates.at(-1).data.status, MailOutboxStatus.SENT);
  assert.deepEqual(prisma.updates.at(-1).data.payload, {
    messageType: 'FEEDBACK_PROGRESS',
    delivered: true,
  });
  assert.equal(JSON.stringify(prisma.updates.at(-1)).includes('nguoidan@example.com'), false);
});

test('SMTP lỗi chỉ lưu mã lỗi đã làm sạch và lên lịch thử lại', async () => {
  const prisma = prismaWithClaimedRows([{
    feedbackEventId: 'event-2',
    payload: validPayload,
    attempts: 1,
  }]);
  const mail = {
    isConfigured: () => true,
    deliverFeedbackProgress: async () => {
      throw new Error('535 password=secret-user@example.com');
    },
  };
  const worker = new FeedbackMailOutboxWorker(
    prisma as any,
    mail as any,
    config({ MAIL_OUTBOX_MAX_ATTEMPTS: '3' }),
  );

  assert.equal(await worker.processAvailable(), 1);
  const retry = prisma.updates.at(-1);
  assert.equal(retry.data.status, MailOutboxStatus.PENDING);
  assert.equal(retry.data.lastError, 'SMTP_DELIVERY_FAILED');
  assert.equal(JSON.stringify(retry).includes('secret-user@example.com'), false);
  assert.ok(retry.data.availableAt.getTime() > Date.now());
});

test('lần thử cuối chuyển thư sang DEAD_LETTER', async () => {
  const prisma = prismaWithClaimedRows([{
    feedbackEventId: 'event-3',
    payload: validPayload,
    attempts: 2,
  }]);
  const mail = {
    isConfigured: () => true,
    deliverFeedbackProgress: async () => {
      throw new Error('temporary SMTP failure');
    },
  };
  const worker = new FeedbackMailOutboxWorker(
    prisma as any,
    mail as any,
    config({ MAIL_OUTBOX_MAX_ATTEMPTS: '2' }),
  );

  await worker.processAvailable();
  assert.equal(prisma.updates.at(-1).data.status, MailOutboxStatus.DEAD_LETTER);
  assert.equal(prisma.updates.at(-1).data.lastError, 'SMTP_DELIVERY_FAILED_MAX_ATTEMPTS');
});

test('SMTP chưa cấu hình thì worker không claim và không tiêu hao số lần thử', async () => {
  const prisma = prismaWithClaimedRows([{
    feedbackEventId: 'event-4',
    payload: validPayload,
    attempts: 1,
  }]);
  const worker = new FeedbackMailOutboxWorker(
    prisma as any,
    { isConfigured: () => false } as any,
    config(),
  );

  assert.equal(await worker.processAvailable(), 0);
  assert.equal(prisma.updates.length, 0);
});

test('cấu hình worker ngoài giới hạn bị từ chối ngay khi khởi động', () => {
  const prisma = prismaWithClaimedRows([]);
  const mail = { isConfigured: () => true };
  assert.throws(
    () => new FeedbackMailOutboxWorker(
      prisma as any,
      mail as any,
      config({ MAIL_OUTBOX_POLL_MS: '999' }),
    ),
    /MAIL_OUTBOX_POLL_MS must be an integer between 1000 and 60000/,
  );
});
