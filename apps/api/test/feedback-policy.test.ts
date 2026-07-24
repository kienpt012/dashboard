import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  buildPublicFeedbackSnapshot,
  CreatePublicFeedbackDto,
  declaredAttachmentMimeMatches,
  detectAllowedAttachmentMime,
  feedbackCodeYear,
  FEEDBACK_ATTACHMENT_MAX_BYTES,
  FEEDBACK_ATTACHMENT_MAX_FILES,
  LOOKUP_SECRET_MAX_LENGTH,
  LOOKUP_SECRET_MIN_LENGTH,
  PublicFeedbackController,
  sanitizeAttachmentFileName,
  sanitizePublicFeedbackText,
  shouldNotifyFeedbackByEmail,
  TrackFeedbackDto,
  VersionedSecretDto,
} from '../src/feedback';

test('mã phản ánh dùng năm lịch Việt Nam tại biên giao thừa', () => {
  assert.equal(feedbackCodeYear(new Date('2026-12-31T16:59:59.999Z')), 2026);
  assert.equal(feedbackCodeYear(new Date('2026-12-31T17:00:00.000Z')), 2027);
});

function lookupSecretIsValid<T extends object>(
  dto: ClassConstructor<T>,
  payload: Record<string, unknown>,
) {
  return !validateSync(plainToInstance(dto, payload))
    .some(error => error.property === 'lookupSecret');
}

test('lookup secret uses the same 20-64 bounds for create, tracking and citizen mutations', () => {
  assert.equal(LOOKUP_SECRET_MIN_LENGTH, 20);
  assert.equal(LOOKUP_SECRET_MAX_LENGTH, 64);

  const dtoPayloads: Array<[ClassConstructor<object>, Record<string, unknown>]> = [
    [CreatePublicFeedbackDto, {}],
    [TrackFeedbackDto, { code: 'PA-2026-12345678' }],
    [VersionedSecretDto, { expectedVersion: 1 }],
  ];

  for (const length of [20, 40, 41, 64]) {
    for (const [dto, payload] of dtoPayloads) {
      assert.equal(lookupSecretIsValid(dto, { ...payload, lookupSecret: 's'.repeat(length) }), true);
    }
  }

  for (const length of [19, 65]) {
    for (const [dto, payload] of dtoPayloads) {
      assert.equal(lookupSecretIsValid(dto, { ...payload, lookupSecret: 's'.repeat(length) }), false);
    }
  }
});

test('public feedback content is redacted and its timeline contract does not expose database ids', async () => {
  const pii = {
    submitterName: 'Nguyễn Văn Minh',
    submitterPhone: '0912 345 678',
    submitterEmail: 'minh@example.com',
    address: '12 Đường A, Lái Thiêu',
  };
  const safe = sanitizePublicFeedbackText(
    'Nguyễn Văn Minh phản ánh tại 12 Đường A, Lái Thiêu. '
      + 'Liên hệ 0912 345 678, minh@example.com hoặc Zalo: nguyenvanminh.',
    pii,
  );
  assert.equal(safe.includes('Nguyễn Văn Minh'), false);
  assert.equal(safe.includes('12 Đường A'), false);
  assert.equal(safe.includes('0912 345 678'), false);
  assert.equal(safe.includes('minh@example.com'), false);
  assert.equal(safe.includes('nguyenvanminh'), false);
  assert.match(safe, /\[đã ẩn/);
  assert.equal(
    sanitizePublicFeedbackText('NguYen Van Minh - điện thoại +84 912.345.678', pii).includes('Minh'),
    false,
  );

  let publishedQuery: any;
  const createdAt = new Date('2026-07-20T08:00:00.000Z');
  const controller = new PublicFeedbackController({
    feedback: {
      findFirst: async (query: any) => {
        publishedQuery = query;
        return {
          code: 'PA-2026-12345678',
          title: 'Tiêu đề gốc',
          content: 'Nội dung gốc',
          category: 'OTHER',
          status: 'RESOLVED',
          submitterName: pii.submitterName,
          submitterPhone: pii.submitterPhone,
          submitterEmail: pii.submitterEmail,
          address: pii.address,
          resolutionSummary: 'Đã xử lý',
          publicSnapshotVersion: 1,
          publicTitle: 'Tiêu đề công khai',
          publicSummary: 'Nội dung công khai',
          publicResolutionSummary: 'Kết quả công khai',
          publicCategory: 'OTHER',
          publicDepartmentName: 'Đơn vị xử lý',
          publicResolvedAt: createdAt,
          publicPublishedAt: createdAt,
          createdAt,
          resolvedAt: createdAt,
          closedAt: null,
          messages: [{ id: 'internal-message-id', body: 'Đã tiếp nhận', authorName: 'Cán bộ A', createdAt }],
          events: [
            {
              id: 'internal-event-id',
              action: 'CONTACT_ATTEMPT_LOGGED',
              fromStatus: 'RECEIVED',
              toStatus: 'RECEIVED',
              note: `Cán bộ đã gọi ${pii.submitterPhone}`,
              createdAt,
            },
            {
              id: 'public-event-id',
              action: 'INFORMATION_REQUESTED',
              fromStatus: 'RECEIVED',
              toStatus: 'WAITING_CITIZEN',
              note: `Vui lòng liên hệ ${pii.submitterPhone}`,
              createdAt,
            },
          ],
        };
      },
    },
  } as any, {} as any);
  const detail = await controller.publishedDetail('PA-2026-12345678', { setHeader() {} } as any);

  assert.equal(publishedQuery.select.messages.select.id, undefined);
  assert.equal(publishedQuery.select.events.select.id, undefined);
  assert.equal('id' in detail.messages[0], false);
  assert.equal('id' in detail.timeline[0], false);
  assert.equal('note' in detail.timeline[0], false);
  assert.equal('note' in detail.timeline[1], false);
  assert.deepEqual(detail.messages[0], {
    body: 'Đã tiếp nhận',
    authorName: 'Đơn vị xử lý',
    createdAt,
  });
});

test('approved publication snapshot freezes title, content and resolution together', () => {
  const source = {
    title: 'Nguyễn Văn Minh đề nghị sửa đèn đường',
    content: 'Đèn đường trước nhà tại 12 Đường A, Lái Thiêu đã hỏng nhiều ngày.',
    resolutionSummary: 'Đơn vị đã thay bóng đèn và liên hệ 0912 345 678 để xác nhận.',
    submitterName: 'Nguyễn Văn Minh',
    submitterPhone: '0912 345 678',
    submitterEmail: 'minh@example.com',
    address: '12 Đường A, Lái Thiêu',
  };
  const snapshot = buildPublicFeedbackSnapshot(source);
  assert.deepEqual(snapshot, {
    title: '[đã ẩn] đề nghị sửa đèn đường',
    content: 'Đèn đường trước nhà tại [đã ẩn] đã hỏng nhiều ngày.',
    resolutionSummary: 'Đơn vị đã thay bóng đèn và liên hệ [đã ẩn] để xác nhận.',
  });
  source.title = 'Tiêu đề bị sửa sau khi duyệt';
  source.content = 'Nội dung bị sửa sau khi duyệt';
  source.resolutionSummary = 'Kết quả bị sửa sau khi duyệt';
  assert.equal(snapshot.title, '[đã ẩn] đề nghị sửa đèn đường');
  assert.match(snapshot.resolutionSummary!, /\[đã ẩn\]/);
});

test('attachment policy accepts only verified JPEG, PNG, WEBP and PDF signatures', () => {
  assert.equal(detectAllowedAttachmentMime(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
  assert.equal(detectAllowedAttachmentMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(detectAllowedAttachmentMime(Buffer.from('RIFF0000WEBP', 'ascii')), 'image/webp');
  assert.equal(detectAllowedAttachmentMime(Buffer.from('%PDF-1.7', 'ascii')), 'application/pdf');
  assert.equal(detectAllowedAttachmentMime(Buffer.from('<script>alert(1)</script>')), null);
  assert.equal(declaredAttachmentMimeMatches('', 'application/pdf'), true);
  assert.equal(declaredAttachmentMimeMatches('application/octet-stream', 'application/pdf'), true);
  assert.equal(declaredAttachmentMimeMatches('image/png', 'application/pdf'), false);
  assert.equal(FEEDBACK_ATTACHMENT_MAX_FILES, 5);
  assert.equal(FEEDBACK_ATTACHMENT_MAX_BYTES, 10 * 1024 * 1024);
});

test('attachment filenames cannot escape storage or inject response headers', () => {
  assert.equal(sanitizeAttachmentFileName('../../bien-chung.pdf\r\nX-Test: yes'), 'bien-chung.pdfX-Test_ yes');
  assert.equal(sanitizeAttachmentFileName('   '), 'tep-minh-chung');
});

test('chỉ gửi email tiến độ khi người dân chủ động chọn Email làm kênh liên hệ', () => {
  assert.equal(shouldNotifyFeedbackByEmail('PHONE', 'nguoidan@example.com'), false);
  assert.equal(shouldNotifyFeedbackByEmail('EMAIL', null), false);
  assert.equal(shouldNotifyFeedbackByEmail('EMAIL', '   '), false);
  assert.equal(shouldNotifyFeedbackByEmail('EMAIL', 'nguoidan@example.com'), true);
});
