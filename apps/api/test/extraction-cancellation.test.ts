import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import {
  ExtractionJobKind,
  ExtractionJobStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { DocumentsController } from '../src/documents';
import { LlmIndicatorExtractor } from '../src/extraction-llm';
import { ExtractionJobCancelledError } from '../src/extraction-worker';
import { OllamaService } from '../src/ollama';

const actor = {
  id: 'user-1',
  username: 'canbo',
  fullName: 'Cán bộ kiểm thử',
  role: Role.STAFF,
  isActive: true,
  departmentId: 'dept-1',
};

test('endpoint hủy commit trạng thái và audit trước khi phát AbortController', async () => {
  const events: string[] = [];
  let isolationLevel: Prisma.TransactionIsolationLevel | undefined;
  let updateData: Record<string, unknown> | undefined;
  const tx = {
    sourceDocument: {
      findUnique: async () => ({ id: 'doc-1', code: 'VB-2026-0001', departmentId: 'dept-1' }),
    },
    extractionJob: {
      findUnique: async () => ({
        id: 'job-1',
        documentId: 'doc-1',
        kind: ExtractionJobKind.INDICATOR_EXTRACT,
        status: ExtractionJobStatus.PROCESSING,
        chunksTotal: 20,
        chunksDone: 2,
        cancelRequestedAt: null,
        finishedAt: null,
      }),
      updateMany: async (args: { data: Record<string, unknown> }) => {
        events.push('status');
        updateData = args.data;
        return { count: 1 };
      },
    },
    auditLog: {
      create: async (args: { data: { action: string; entityId?: string | null; metadata?: unknown } }) => {
        events.push('audit');
        assert.equal(args.data.action, 'DOCUMENT_EXTRACTION_CANCELLED');
        assert.equal(args.data.entityId, 'job-1');
        assert.deepEqual(args.data.metadata, { code: 'VB-2026-0001' });
        return {};
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>, options: { isolationLevel: Prisma.TransactionIsolationLevel }) => {
      isolationLevel = options.isolationLevel;
      const result = await callback(tx);
      events.push('commit');
      return result;
    },
  };
  const worker = {
    requestCancellation: (jobId: string) => {
      assert.equal(jobId, 'job-1');
      assert.deepEqual(events, ['status', 'audit', 'commit']);
      events.push('abort');
      return true;
    },
  };
  const controller = new DocumentsController(prisma as never, worker as never);

  const result = await controller.cancelExtractionJob({ user: actor }, 'doc-1', 'job-1');

  assert.equal(isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
  assert.equal(updateData?.status, ExtractionJobStatus.CANCELLED);
  assert.ok(updateData?.cancelRequestedAt instanceof Date);
  assert.equal(updateData?.lockedAt, null);
  assert.equal(updateData?.lockedBy, null);
  assert.equal(result.status, ExtractionJobStatus.CANCELLED);
  assert.deepEqual(events, ['status', 'audit', 'commit', 'abort']);
});

test('LlmIndicatorExtractor truyền nguyên external signal xuống Ollama', async () => {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  const ollama = {
    chatStructured: async (
      _messages: unknown,
      _schema: unknown,
      options: { signal?: AbortSignal },
    ) => {
      receivedSignal = options.signal;
      return {
        content: '{"indicators":[]}',
        model: 'test-model',
        durationMs: 1,
      };
    },
  };
  const extractor = new LlmIndicatorExtractor(ollama as OllamaService);

  await extractor.extractFromChunk('Không có chỉ tiêu.', {
    documentTitle: 'Tài liệu kiểm thử',
    docNumber: null,
    defaultYear: 2026,
  }, controller.signal);

  assert.equal(receivedSignal, controller.signal);
});

test('Ollama trả nguyên lý do hủy external signal thay vì bọc thành lỗi để retry', async () => {
  const originalFetch = globalThis.fetch;
  let combinedSignal: AbortSignal | undefined;
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    combinedSignal = init?.signal ?? undefined;
    combinedSignal?.addEventListener('abort', () => reject(combinedSignal?.reason), { once: true });
  })) as typeof fetch;

  try {
    const config = {
      get: (key: string) => key === 'OLLAMA_TIMEOUT_MS' ? '480000' : undefined,
    } as ConfigService;
    const ollama = new OllamaService(config);
    const controller = new AbortController();
    const reason = new ExtractionJobCancelledError('job-1');
    const pending = ollama.chatStructured([], {}, {
      timeoutMs: 15_000,
      signal: controller.signal,
    });

    controller.abort(reason);

    await assert.rejects(pending, error => error === reason);
    assert.ok(combinedSignal?.aborted);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
