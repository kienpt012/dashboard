import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DocumentStatus, Role } from '@prisma/client';
import {
  collectPublicDashboardReferences,
  DEFAULT_PUBLIC_DASHBOARD_CONFIG,
  normalizePublicDashboardConfig,
  publicDashboardReferencesPublication,
  publicDashboardTargetKey,
  PublicDashboardService,
  sanitizePublicDashboardHtml,
  type PublicDashboardConfig,
} from '../src/public-dashboard';

const admin = {
  id: 'admin-1',
  username: 'admin',
  fullName: 'Quản trị hệ thống',
  role: Role.ADMIN,
  isActive: true,
  departmentId: null,
};

const manager = { ...admin, id: 'manager-1', username: 'manager', role: Role.MANAGER };

function cloneDefault(): PublicDashboardConfig {
  return JSON.parse(JSON.stringify(DEFAULT_PUBLIC_DASHBOARD_CONFIG)) as PublicDashboardConfig;
}

function oneWidgetConfig(widget: PublicDashboardConfig['widgets'][number]): PublicDashboardConfig {
  return {
    ...cloneDefault(),
    widgets: [widget],
    layouts: {
      desktop: [{ i: widget.id, x: 0, y: 0, w: 12, h: 3 }],
      tablet: [{ i: widget.id, x: 0, y: 0, w: 8, h: 3 }],
      mobile: [{ i: widget.id, x: 0, y: 0, w: 4, h: 3 }],
    },
  };
}

test('bố cục mặc định dành đủ chiều cao cho số liệu tổng quan ở mọi thiết bị', () => {
  const config = cloneDefault();
  assert.deepEqual(
    config.layouts.desktop.map(item => [item.i, item.y, item.h, item.minH]),
    [
      ['overview', 0, 5, 5],
      ['targets', 5, 8, 5],
      ['departments', 5, 8, 5],
      ['feedbacks', 13, 6, 4],
      ['documents', 13, 6, 4],
      ['citizen-cta', 19, 3, 2],
    ],
  );
  assert.deepEqual(config.layouts.tablet[0], {
    i: 'overview', x: 0, y: 0, w: 8, h: 6, minW: 4, minH: 6,
  });
  assert.equal(config.layouts.mobile[0].minH, 7);
});

test('config cũ được nâng chiều cao theo loại widget và reflow mà không làm hỏng bản công khai', () => {
  const legacy = cloneDefault();
  legacy.layouts.desktop = [
    { i: 'overview', x: 0, y: 0, w: 12, h: 3, minW: 6, minH: 2 },
    { i: 'targets', x: 0, y: 3, w: 8, h: 8, minW: 4, minH: 5 },
    { i: 'departments', x: 8, y: 3, w: 4, h: 8, minW: 3, minH: 5 },
    { i: 'feedbacks', x: 0, y: 11, w: 6, h: 6, minW: 4, minH: 4 },
    { i: 'documents', x: 6, y: 11, w: 6, h: 6, minW: 4, minH: 4 },
    { i: 'citizen-cta', x: 0, y: 17, w: 12, h: 3, minW: 6, minH: 2 },
  ];
  legacy.layouts.tablet[0] = { ...legacy.layouts.tablet[0], h: 4, minH: 3 };
  legacy.layouts.tablet.slice(1).forEach(item => { item.y -= 2; });
  legacy.layouts.mobile[0] = { ...legacy.layouts.mobile[0], minH: 4 };

  const normalized = normalizePublicDashboardConfig(legacy);
  assert.deepEqual(
    normalized.layouts.desktop.map(item => [item.i, item.y, item.h, item.minH]),
    [
      ['overview', 0, 5, 5],
      ['targets', 5, 8, 5],
      ['departments', 5, 8, 5],
      ['feedbacks', 13, 6, 4],
      ['documents', 13, 6, 4],
      ['citizen-cta', 19, 3, 2],
    ],
  );
  assert.deepEqual(
    normalized.layouts.tablet.map(item => [item.i, item.y]),
    [['overview', 0], ['targets', 6], ['departments', 14], ['feedbacks', 20], ['documents', 20], ['citizen-cta', 27]],
  );
  assert.equal(normalized.layouts.mobile[0].minH, 7);

  const shortTarget = cloneDefault();
  shortTarget.layouts.desktop[1] = { ...shortTarget.layouts.desktop[1], h: 3, minH: 2 };
  const targetLayout = normalizePublicDashboardConfig(shortTarget).layouts.desktop[1];
  assert.equal(targetLayout.h, 5);
  assert.equal(targetLayout.minH, 5);
});

test('HTML tùy biến chặn script, event handler, URL JavaScript và CSS thoát khung', () => {
  const dangerous = [
    '<script>alert(1)</script>',
    '<div onclick="alert(1)">Bấm</div>',
    '<a href="javascript:alert(1)">Bấm</a>',
    '<a href="java&#x73;cript&#58;alert(1)">Bấm</a>',
    '<div style="position:fixed;z-index:9999">Che trang</div>',
    '<div style="background:url(https://tracker.example/pixel)">Theo dõi</div>',
  ];
  for (const html of dangerous) {
    assert.throws(
      () => sanitizePublicDashboardHtml(html),
      (error: unknown) => error instanceof BadRequestException,
      html,
    );
  }
});

test('config canonical giữ slot, class và CSS an toàn theo allowlist', () => {
  const config = oneWidgetConfig({
    id: 'custom-card',
    type: 'customHtml',
    title: 'Tiến độ chung',
    settings: {
      html: '<section class="metric" style="display:grid; gap:1rem; color:#123456"><strong data-ioc-slot="overall-progress"></strong></section>',
      bindings: [{
        slot: 'overall-progress',
        label: 'Tiến độ chung',
        source: 'overview',
        field: 'overallProgress',
        format: 'percent',
      }],
    },
  });

  const normalized = normalizePublicDashboardConfig(config);
  const html = String(normalized.widgets[0].settings.html);
  assert.match(html, /class="metric"/);
  assert.match(html, /data-ioc-slot="overall-progress"/);
  assert.match(html, /display:grid/);
  assert.equal(normalized.widgets[0].settings.bindings?.[0].field, 'overallProgress');
});

test('config từ chối widget chồng nhau và binding ngoài danh mục', () => {
  const overlapping = cloneDefault();
  overlapping.layouts.desktop[2] = { ...overlapping.layouts.desktop[2], x: 0, y: 3 };
  assert.throws(
    () => normalizePublicDashboardConfig(overlapping),
    (error: unknown) => error instanceof BadRequestException,
  );

  const badBinding = oneWidgetConfig({
    id: 'unsafe-binding',
    type: 'customHtml',
    settings: {
      html: '<strong data-ioc-slot="secret"></strong>',
      bindings: [{ slot: 'secret', label: 'Sai', source: 'overview', field: 'passwordHash' }],
    },
  });
  assert.throws(
    () => normalizePublicDashboardConfig(badBinding),
    (error: unknown) => error instanceof BadRequestException,
  );
});

test('collector chỉ trả khóa được chọn và documentList rỗng không tự công khai văn bản mới', () => {
  const config = cloneDefault();
  config.widgets[1].settings.mode = 'selected';
  config.widgets[1].settings.targetKeys = ['target_1234567890123456789012'];
  config.widgets[4].settings.publicationIds = ['publication-1'];
  const refs = collectPublicDashboardReferences(config);
  assert.deepEqual(refs.targetKeys, ['target_1234567890123456789012']);
  assert.deepEqual(refs.publicationIds, ['publication-1']);
  assert.equal(publicDashboardReferencesPublication(config, 'publication-1'), true);

  config.widgets[4].settings.publicationIds = [];
  assert.equal(publicDashboardReferencesPublication(config, 'any-active-publication'), false);
});

test('theme phải đạt độ tương phản đọc được trước khi lưu hoặc công bố', () => {
  const unreadableText = cloneDefault();
  unreadableText.theme.text = '#ffffff';
  assert.throws(
    () => normalizePublicDashboardConfig(unreadableText),
    (error: unknown) => error instanceof BadRequestException && /4\.5:1/.test(error.message),
  );

  const unreadableAccent = cloneDefault();
  unreadableAccent.theme.accent = '#eeeeee';
  assert.throws(
    () => normalizePublicDashboardConfig(unreadableAccent),
    (error: unknown) => error instanceof BadRequestException && /3:1/.test(error.message),
  );
});

test('config giới hạn tối đa 100 publication khác nhau trên toàn dashboard', () => {
  const config = cloneDefault();
  config.widgets[4].settings.publicationIds = Array.from({ length: 60 }, (_, index) => `publication-a-${index}`);
  config.widgets.push({
    id: 'documents-second',
    type: 'documentList',
    title: 'Văn bản khác',
    settings: {
      maxItems: 30,
      publicationIds: Array.from({ length: 60 }, (_, index) => `publication-b-${index}`),
    },
  });
  config.layouts.desktop.push({ i: 'documents-second', x: 0, y: 100, w: 12, h: 3 });
  config.layouts.tablet.push({ i: 'documents-second', x: 0, y: 100, w: 8, h: 3 });
  config.layouts.mobile.push({ i: 'documents-second', x: 0, y: 100, w: 4, h: 3 });

  assert.throws(
    () => normalizePublicDashboardConfig(config),
    (error: unknown) => error instanceof BadRequestException && /tối đa 100 văn bản/.test(error.message),
  );
});

test('config canonical có giới hạn kích thước UTF-8 tối đa 5 MB', () => {
  const oversized = { ...cloneDefault(), oversized: 'ữ'.repeat(1_800_000) };
  assert.throws(
    () => normalizePublicDashboardConfig(oversized),
    (error: unknown) => error instanceof BadRequestException && /5 MB/.test(error.message),
  );
});

test('CTA luôn cho đường dẫn nội bộ nhưng chỉ cho host HTTPS nằm trong allowlist', () => {
  const previous = process.env.PUBLIC_DASHBOARD_ALLOWED_LINK_HOSTS;
  try {
    delete process.env.PUBLIC_DASHBOARD_ALLOWED_LINK_HOSTS;
    const internal = oneWidgetConfig({
      id: 'cta-internal',
      type: 'cta',
      settings: { body: 'Nội dung', label: 'Mở trang', href: '/phan-anh' },
    });
    assert.equal(normalizePublicDashboardConfig(internal).widgets[0].settings.href, '/phan-anh');

    const external = oneWidgetConfig({
      id: 'cta-external',
      type: 'cta',
      settings: { body: 'Nội dung', label: 'Mở trang', href: 'https://dichvucong.example.vn/ho-so' },
    });
    assert.throws(
      () => normalizePublicDashboardConfig(external),
      (error: unknown) => error instanceof BadRequestException && /host HTTPS/.test(error.message),
    );

    for (const href of ['/\\evil.com', '/\\\\evil.com', '/%5Cevil.com', '/\t/evil.com', '/\n/evil.com', '/\r/evil.com']) {
      const unsafeInternal = oneWidgetConfig({
        id: 'cta-unsafe',
        type: 'cta',
        settings: { body: 'Nội dung', label: 'Mở trang', href },
      });
      assert.throws(
        () => normalizePublicDashboardConfig(unsafeInternal),
        (error: unknown) => error instanceof BadRequestException,
        href,
      );
    }

    process.env.PUBLIC_DASHBOARD_ALLOWED_LINK_HOSTS = 'dichvucong.example.vn';
    assert.equal(
      normalizePublicDashboardConfig(external).widgets[0].settings.href,
      'https://dichvucong.example.vn/ho-so',
    );
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_DASHBOARD_ALLOWED_LINK_HOSTS;
    else process.env.PUBLIC_DASHBOARD_ALLOWED_LINK_HOSTS = previous;
  }
});

test('service chặn vai trò không phải ADMIN ngay cả khi gọi trực tiếp', async () => {
  const service = new PublicDashboardService({} as any);
  await assert.rejects(
    service.editor(manager as any),
    (error: unknown) => error instanceof ForbiddenException && error.getStatus() === 403,
  );
});

test('lưu draft no-op không tăng version hoặc ghi audit nhưng vẫn chặn expectedVersion cũ', async () => {
  const current = {
    id: 'public-home',
    draftName: 'Trang thông tin công khai',
    draftTemplateKey: 'transparency',
    draftConfig: cloneDefault(),
    draftVersion: 5,
    publishedRevision: 2,
    updatedBy: 'admin',
    updatedAt: new Date(),
  };
  let updateCalls = 0;
  let auditCalls = 0;
  const tx = {
    publicDashboard: {
      findUniqueOrThrow: async () => current,
      updateMany: async () => { updateCalls += 1; return { count: 1 }; },
    },
    target: { findMany: async () => [] },
    documentPublication: { findMany: async () => [] },
    auditLog: { create: async () => { auditCalls += 1; } },
  };
  const prisma = {
    publicDashboard: { upsert: async () => current },
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  };
  const service = new PublicDashboardService(prisma as any);
  const result = await service.saveDraft(admin as any, {
    expectedVersion: 5,
    name: current.draftName,
    templateKey: current.draftTemplateKey,
    config: cloneDefault() as unknown as Record<string, unknown>,
  });
  assert.equal(result.draftVersion, 5);
  assert.equal(result.unchanged, true);
  assert.equal(updateCalls, 0);
  assert.equal(auditCalls, 0);

  await assert.rejects(
    service.saveDraft(admin as any, {
      expectedVersion: 4,
      name: current.draftName,
      templateKey: current.draftTemplateKey,
      config: cloneDefault() as unknown as Record<string, unknown>,
    }),
    (error: unknown) => error instanceof ConflictException && error.getStatus() === 409,
  );
  assert.equal(updateCalls, 0);
  assert.equal(auditCalls, 0);
});

test('publish tạo revision bất biến kế tiếp và tăng optimistic draftVersion trong cùng transaction', async () => {
  const current = {
    id: 'public-home',
    draftName: 'Dashboard tháng 8',
    draftTemplateKey: 'transparency',
    draftConfig: cloneDefault(),
    draftVersion: 7,
    publishedRevision: 3,
    updatedBy: 'admin',
    updatedAt: new Date(),
  };
  let createdRevision: any;
  let dashboardUpdate: any;
  let findCalls = 0;
  let auditCalls = 0;
  const tx = {
    publicDashboard: {
      findUniqueOrThrow: async () => {
        findCalls += 1;
        return findCalls === 1 ? current : { ...current, draftVersion: 8, publishedRevision: 4 };
      },
      updateMany: async (args: any) => { dashboardUpdate = args; return { count: 1 }; },
    },
    publicDashboardRevision: {
      aggregate: async () => ({ _max: { revision: 3 } }),
      create: async ({ data }: any) => {
        createdRevision = data;
        return { id: 'revision-4', publishedAt: new Date(), ...data };
      },
    },
    target: { findMany: async () => [] },
    documentPublication: { findMany: async () => [] },
    auditLog: { create: async () => { auditCalls += 1; } },
  };
  const prisma = {
    publicDashboard: { upsert: async () => current },
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  };
  const service = new PublicDashboardService(prisma as any);
  const result = await service.publish(admin as any, { expectedVersion: 7, changeNote: 'Cập nhật bố cục tháng 8' });

  assert.equal(createdRevision.revision, 4);
  assert.equal(createdRevision.name, current.draftName);
  assert.equal(createdRevision.changeNote, 'Cập nhật bố cục tháng 8');
  assert.equal(dashboardUpdate.where.draftVersion, 7);
  assert.equal(dashboardUpdate.data.publishedRevision, 4);
  assert.deepEqual(dashboardUpdate.data.draftVersion, { increment: 1 });
  assert.equal(result.dashboard.draftVersion, 8);
  assert.equal(auditCalls, 1);
});

test('restore chỉ sao chép revision cũ về draft, không tự công bố hoặc sửa lịch sử', async () => {
  const sourceRevision = {
    id: 'revision-2',
    dashboardId: 'public-home',
    revision: 2,
    name: 'Bố cục đã duyệt',
    templateKey: 'compact',
    config: cloneDefault(),
    changeNote: 'Phiên cũ',
    publishedBy: 'admin',
    publishedAt: new Date(),
  };
  let updateData: any;
  let createRevisionCalls = 0;
  const current = {
    id: 'public-home',
    draftName: 'Hiện tại',
    draftTemplateKey: 'transparency',
    draftConfig: cloneDefault(),
    draftVersion: 9,
    publishedRevision: 5,
    updatedBy: 'admin',
    updatedAt: new Date(),
  };
  const tx = {
    publicDashboardRevision: {
      findUnique: async () => sourceRevision,
      create: async () => { createRevisionCalls += 1; },
    },
    publicDashboard: {
      updateMany: async ({ data }: any) => { updateData = data; return { count: 1 }; },
      findUniqueOrThrow: async () => ({ ...current, ...updateData, draftVersion: 10 }),
    },
    target: { findMany: async () => [] },
    documentPublication: { findMany: async () => [] },
    auditLog: { create: async () => undefined },
  };
  const prisma = {
    publicDashboard: { upsert: async () => current },
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  };
  const service = new PublicDashboardService(prisma as any);
  const result = await service.restore(admin as any, 2, { expectedVersion: 9 });

  assert.equal(updateData.draftName, sourceRevision.name);
  assert.equal(updateData.draftTemplateKey, sourceRevision.templateKey);
  assert.equal(Object.prototype.hasOwnProperty.call(updateData, 'publishedRevision'), false);
  assert.equal(result.publishedRevision, 5);
  assert.equal(result.restoredFromRevision, 2);
  assert.equal(createRevisionCalls, 0);
});

test('công bố văn bản bắt buộc xác nhận an toàn và tạo snapshot riêng từ tệp đã xử lý', async () => {
  const source = {
    id: 'source-1',
    code: 'VB-2026-0001',
    title: 'Văn bản nguồn',
    originalName: 'quyet-dinh.pdf',
    mimeType: 'application/pdf',
    size: 4,
    sha256: 'abcd',
    data: Buffer.from('data'),
    status: DocumentStatus.PROCESSED,
  };
  let createdData: any;
  let auditCalls = 0;
  const tx = {
    sourceDocument: { findUnique: async () => source },
    documentPublication: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 'publication-1', publishedAt: new Date(), revokedAt: null, revokedBy: null, ...data };
      },
    },
    auditLog: { create: async () => { auditCalls += 1; } },
  };
  const prisma = { $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) };
  const service = new PublicDashboardService(prisma as any);

  await assert.rejects(
    service.setDocumentPublication(admin as any, source.id, {
      title: 'Công khai',
      confirmedSafe: false,
      public: true,
    } as any),
    (error: unknown) => error instanceof BadRequestException,
  );

  const result = await service.setDocumentPublication(admin as any, source.id, {
    title: 'Quyết định công khai',
    summary: 'Nội dung đã được rà soát',
    confirmedSafe: true,
    public: true,
  });
  assert.equal(result.publication.id, 'publication-1');
  assert.equal(createdData.sourceDocumentId, source.id);
  assert.equal(createdData.version, 1);
  assert.deepEqual(createdData.data, source.data);
  assert.equal(createdData.publishedBy, admin.username);
  assert.equal(auditCalls, 1);
});

test('download công khai từ chối publication không được dashboard hiện hành tham chiếu', async () => {
  const config = oneWidgetConfig({
    id: 'overview',
    type: 'overviewMetrics',
    settings: { metricKeys: ['total'] },
  });
  let publicationQueries = 0;
  const prisma = {
    publicDashboard: { findUnique: async () => ({ publishedRevision: 3 }) },
    publicDashboardRevision: { findUnique: async () => ({ config }) },
    documentPublication: {
      findFirst: async () => { publicationQueries += 1; return null; },
    },
  };
  const response = { setHeader: () => undefined };
  const service = new PublicDashboardService(prisma as any);
  await assert.rejects(
    service.downloadPublicDocument('publication-1', response as any),
    (error: unknown) => error instanceof NotFoundException && error.getStatus() === 404,
  );
  assert.equal(publicationQueries, 0);
});

test('public API queries only selected publications and hides internal sourceDocumentId', async () => {
  const config = oneWidgetConfig({
    id: 'documents',
    type: 'documentList',
    settings: { maxItems: 6, publicationIds: ['publication-1'] },
  });
  let publicationQuery: any;
  const prisma = {
    systemSetting: { findUnique: async () => ({ defaultYear: 2026 }) },
    publicDashboard: { findUnique: async () => ({ publishedRevision: 3 }) },
    publicDashboardRevision: { findUnique: async () => ({ revision: 3, config }) },
    target: { findMany: async () => [] },
    feedback: { findMany: async () => [] },
    documentPublication: {
      findMany: async (query: any) => {
        publicationQuery = query;
        return [{
          id: 'publication-1',
          sourceDocumentId: 'internal-source-id',
          publicCode: 'VBCK-2026-0001',
          title: 'Public document',
          summary: null,
          publishedAt: new Date('2026-08-09T00:00:00.000Z'),
        }];
      },
    },
  };
  const service = new PublicDashboardService(prisma as any);
  const result = await service.publicDashboard();

  assert.deepEqual(publicationQuery.where.id.in, ['publication-1']);
  assert.equal(Object.prototype.hasOwnProperty.call(result.data.documents[0], 'sourceDocumentId'), false);
});

test('public API does not expose active documents before the first dashboard publication', async () => {
  let publicationQueries = 0;
  const prisma = {
    systemSetting: { findUnique: async () => ({ defaultYear: 2026 }) },
    publicDashboard: { findUnique: async () => ({ publishedRevision: null }) },
    publicDashboardRevision: { findUnique: async () => null },
    target: { findMany: async () => [] },
    feedback: { findMany: async () => [] },
    documentPublication: {
      findMany: async () => {
        publicationQueries += 1;
        return [];
      },
    },
  };
  const service = new PublicDashboardService(prisma as any);
  const result = await service.publicDashboard();

  assert.equal(publicationQueries, 0);
  assert.deepEqual(result.data.documents, []);
});

test('editing an active document publication keeps its id and publicCode stable', async () => {
  const source = {
    id: 'source-1',
    code: 'VB-2026-0001',
    title: 'Source document',
    originalName: 'decision.pdf',
    mimeType: 'application/pdf',
    size: 4,
    sha256: 'abcd',
    data: Buffer.from('data'),
    status: DocumentStatus.PROCESSED,
  };
  const active = {
    id: 'publication-stable',
    sourceDocumentId: source.id,
    publicCode: 'VBCK-2026-STABLE',
    title: 'Old public title',
    summary: null,
    originalName: source.originalName,
    mimeType: source.mimeType,
    size: source.size,
    sha256: source.sha256,
    data: source.data,
    publishedBy: 'admin',
    publishedAt: new Date('2026-08-08T00:00:00.000Z'),
    revokedAt: null,
    revokedBy: null,
    version: 2,
  };
  let updateData: any;
  let createCalls = 0;
  const tx = {
    sourceDocument: { findUnique: async () => source },
    documentPublication: {
      findFirst: async () => active,
      updateMany: async ({ data }: any) => { updateData = data; return { count: 1 }; },
      findUniqueOrThrow: async () => ({
        ...active,
        title: updateData.title,
        summary: updateData.summary,
        publishedBy: updateData.publishedBy,
        publishedAt: updateData.publishedAt,
        version: 3,
      }),
      create: async () => { createCalls += 1; },
    },
    auditLog: { create: async () => undefined },
  };
  const prisma = { $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) };
  const service = new PublicDashboardService(prisma as any);
  const result = await service.setDocumentPublication(admin as any, source.id, {
    expectedVersion: 2,
    title: 'Updated public title',
    summary: 'Reviewed summary',
    confirmedSafe: true,
    public: true,
  });

  assert.equal(result.publication.id, active.id);
  assert.equal(result.publication.publicCode, active.publicCode);
  assert.equal(result.publication.version, 3);
  assert.deepEqual(updateData.version, { increment: 1 });
  assert.equal(createCalls, 0);
});

test('admin preview download streams an active processed publication and blocks non-admin roles', async () => {
  let publicationQueries = 0;
  const prisma = {
    documentPublication: {
      findFirst: async (query: any) => {
        publicationQueries += 1;
        assert.equal(query.where.id, 'publication-preview');
        assert.equal(query.where.revokedAt, null);
        assert.equal(query.where.sourceDocument.status, DocumentStatus.PROCESSED);
        return {
          originalName: 'quyet-dinh.pdf',
          mimeType: 'application/pdf',
          size: 4,
          data: Buffer.from('data'),
        };
      },
    },
  };
  const headers = new Map<string, string>();
  const response = { setHeader: (name: string, value: string) => headers.set(name, value) };
  const service = new PublicDashboardService(prisma as any);

  await assert.rejects(
    service.downloadEditorDocument(manager as any, 'publication-preview', response as any),
    (error: unknown) => error instanceof ForbiddenException && error.getStatus() === 403,
  );
  assert.equal(publicationQueries, 0);

  const file = await service.downloadEditorDocument(admin as any, 'publication-preview', response as any);
  assert.ok(file);
  assert.equal(publicationQueries, 1);
  assert.equal(headers.get('Content-Type'), 'application/pdf');
  assert.equal(headers.get('Content-Length'), '4');
  assert.equal(headers.get('Cache-Control'), 'private, no-store');
  assert.match(headers.get('Content-Disposition') ?? '', /quyet-dinh\.pdf/);
});

test('public download remains unavailable before the first dashboard publication', async () => {
  let publicationQueries = 0;
  const prisma = {
    publicDashboard: { findUnique: async () => ({ publishedRevision: null }) },
    documentPublication: {
      findFirst: async () => {
        publicationQueries += 1;
        return null;
      },
    },
  };
  const service = new PublicDashboardService(prisma as any);
  await assert.rejects(
    service.downloadPublicDocument('publication-preview', { setHeader: () => undefined } as any),
    (error: unknown) => error instanceof NotFoundException && error.getStatus() === 404,
  );
  assert.equal(publicationQueries, 0);
});

test('published documentList with no selected ids exposes no publication', async () => {
  const config = oneWidgetConfig({
    id: 'documents',
    type: 'documentList',
    settings: { maxItems: 6, publicationIds: [] },
  });
  let publicationQueries = 0;
  const prisma = {
    publicDashboard: { findUnique: async () => ({ publishedRevision: 1 }) },
    publicDashboardRevision: { findUnique: async () => ({ revision: 1, config }) },
    target: { findMany: async () => [] },
    feedback: { findMany: async () => [] },
    documentPublication: {
      findMany: async () => {
        publicationQueries += 1;
        return [{ id: 'must-not-leak' }];
      },
    },
  };
  const service = new PublicDashboardService(prisma as any);
  const result = await service.publicDashboard(2026);

  assert.equal(result.revision, 1);
  assert.deepEqual(result.data.documents, []);
  assert.equal(publicationQueries, 0);
  await assert.rejects(
    service.downloadPublicDocument('must-not-leak', { setHeader: () => undefined } as any),
    (error: unknown) => error instanceof NotFoundException && error.getStatus() === 404,
  );
});

test('selected target outside the base 200-row window is included in the public aggregate', async () => {
  const selectedId = 'selected-target-id';
  const selectedKey = publicDashboardTargetKey(selectedId);
  const config = oneWidgetConfig({
    id: 'targets',
    type: 'targetList',
    settings: { mode: 'selected', maxItems: 6, targetKeys: [selectedKey] },
  });
  const targetRow = (id: string, code: string) => ({
    id,
    departmentId: 'department-1',
    code,
    title: code,
    description: null,
    unit: '%',
    weight: 1,
    year: 2026,
    frequency: 'YEARLY',
    dueDate: new Date('2026-12-31T00:00:00.000Z'),
    isHighlighted: false,
    publicOrder: null,
    department: { name: 'Phòng chuyên môn', color: '#0f8378' },
    publishedTargetValue: 100,
    publishedValue: 50,
    publishedDirection: 'HIGHER_IS_BETTER',
    publishedStatus: 'ON_TRACK',
    publishedCode: code,
    publishedTitle: code,
    publishedDescription: null,
    publishedUnit: '%',
    publishedWeight: 1,
    publishedYear: 2026,
    publishedFrequency: 'YEARLY',
    publishedDueDate: new Date('2026-12-31T00:00:00.000Z'),
    publishedDepartmentName: 'Phòng chuyên môn',
    publishedDepartmentColor: '#0f8378',
    publishedHighlighted: false,
    publishedOrder: null,
    publishedAt: new Date('2026-08-01T00:00:00.000Z'),
  });
  const base = targetRow('base-target-id', 'CT-BASE');
  const selected = targetRow(selectedId, 'CT-SELECTED');
  const prisma = {
    publicDashboard: { findUnique: async () => ({ publishedRevision: 1 }) },
    publicDashboardRevision: { findUnique: async () => ({ revision: 1, config }) },
    target: {
      findMany: async (query: any) => {
        if (query.select && Object.keys(query.select).length === 1 && query.select.id) {
          return [{ id: base.id }, { id: selected.id }];
        }
        if (query.where?.id?.in) return [selected];
        assert.equal(query.take, 200);
        return [base];
      },
    },
    feedback: { findMany: async () => [] },
  };
  const service = new PublicDashboardService(prisma as any);
  const result = await service.publicDashboard(2026);

  assert.deepEqual(result.data.targets.map((target: any) => target.key), [
    publicDashboardTargetKey(base.id),
    selectedKey,
  ]);
});

test('invalid stored live revision fails closed before querying or downloading publications', async () => {
  let publicationQueries = 0;
  let dataQueries = 0;
  const prisma = {
    publicDashboard: { findUnique: async () => ({ publishedRevision: 2 }) },
    publicDashboardRevision: { findUnique: async () => ({ revision: 2, config: { schemaVersion: 1 } }) },
    target: { findMany: async () => { dataQueries += 1; return []; } },
    feedback: { findMany: async () => { dataQueries += 1; return []; } },
    documentPublication: {
      findMany: async () => { publicationQueries += 1; return []; },
      findFirst: async () => { publicationQueries += 1; return null; },
    },
  };
  const service = new PublicDashboardService(prisma as any);

  await assert.rejects(
    service.publicDashboard(2026),
    (error: unknown) => error instanceof ServiceUnavailableException && error.getStatus() === 503,
  );
  await assert.rejects(
    service.downloadPublicDocument('publication-secret', { setHeader: () => undefined } as any),
    (error: unknown) => error instanceof ServiceUnavailableException && error.getStatus() === 503,
  );
  assert.equal(dataQueries, 0);
  assert.equal(publicationQueries, 0);
});

test('public download streams an active publication selected by the live revision', async () => {
  const config = oneWidgetConfig({
    id: 'documents',
    type: 'documentList',
    settings: { maxItems: 6, publicationIds: ['publication-live'] },
  });
  const prisma = {
    publicDashboard: { findUnique: async () => ({ publishedRevision: 4 }) },
    publicDashboardRevision: { findUnique: async () => ({ config }) },
    documentPublication: {
      findFirst: async (query: any) => {
        assert.deepEqual(query.where, { id: 'publication-live', revokedAt: null });
        return {
          publicCode: 'VBCK-2026-PUBLIC',
          originalName: 'public.pdf',
          mimeType: 'application/pdf',
          size: 4,
          data: Buffer.from('data'),
        };
      },
    },
  };
  const headers = new Map<string, string>();
  const response = { setHeader: (name: string, value: string) => headers.set(name, value) };
  const service = new PublicDashboardService(prisma as any);
  const file = await service.downloadPublicDocument('publication-live', response as any);

  assert.ok(file);
  assert.equal(headers.get('Content-Type'), 'application/pdf');
  assert.equal(headers.get('Cache-Control'), 'no-store');
  assert.match(headers.get('Content-Disposition') ?? '', /VBCK-2026-PUBLIC\.pdf/);
  assert.doesNotMatch(headers.get('Content-Disposition') ?? '', /public\.pdf/);
});

test('editor preview uses the authenticated internal download route', async () => {
  const dashboard = {
    id: 'public-home',
    draftName: 'Draft',
    draftTemplateKey: 'transparency',
    draftConfig: cloneDefault(),
    draftVersion: 1,
    publishedRevision: null,
    updatedBy: null,
    updatedAt: new Date(),
  };
  let historyQuery: any;
  let targetQuery: any;
  let documentQuery: any;
  const prisma = {
    publicDashboard: { upsert: async () => dashboard },
    publicDashboardRevision: {
      findMany: async (query: any) => {
        historyQuery = query;
        return [{
          revision: 1,
          name: 'Published',
          templateKey: 'transparency',
          changeNote: 'Release',
          config: cloneDefault(),
          publishedAt: new Date(),
          publishedBy: 'admin',
        }];
      },
    },
    target: { findMany: async (query: any) => { targetQuery = query; return []; } },
    sourceDocument: {
      findMany: async (query: any) => {
        documentQuery = query;
        return [{
        id: 'source-1',
        code: 'VB-2026-0001',
        title: 'Source document',
        status: DocumentStatus.PROCESSED,
        originalName: 'quyet-dinh.pdf',
        mimeType: 'application/pdf',
        size: 4,
        updatedAt: new Date(),
        publications: [{
          id: 'publication-preview',
          publicCode: 'VBCK-2026-0001',
          title: 'Public document',
          summary: null,
          version: 1,
          publishedAt: new Date(),
          revokedAt: null,
        }],
        }];
      },
    },
    systemSetting: { findUnique: async () => ({ defaultYear: 2026 }) },
    feedback: { findMany: async () => [] },
  };
  const service = new PublicDashboardService(prisma as any);
  const result = await service.editor(admin as any);

  assert.equal(
    result.previewData.documents[0].downloadUrl,
    '/api/public-dashboard/documents/publication-preview/download',
  );
  assert.equal(Object.prototype.hasOwnProperty.call(historyQuery.select, 'config'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.history[0], 'config'), false);
  assert.equal(historyQuery.take, 30);
  assert.equal(targetQuery.take, 500);
  assert.equal(documentQuery.take, 200);
});

test('document publication survives the complete draft-to-live workflow and revoke closes old revision access', async () => {
  const source = {
    id: 'source-workflow',
    code: 'VB-2026-WORKFLOW',
    title: 'Source document',
    originalName: 'workflow.pdf',
    mimeType: 'application/pdf',
    size: 8,
    sha256: 'workflow-sha256',
    data: Buffer.from('workflow'),
    status: DocumentStatus.PROCESSED,
  };
  let dashboard: any = {
    id: 'public-home',
    draftName: 'Public home',
    draftTemplateKey: 'transparency',
    draftConfig: cloneDefault(),
    draftVersion: 1,
    publishedRevision: null,
    updatedBy: null,
    updatedAt: new Date(),
  };
  let publication: any = null;
  const revisions = new Map<number, any>();
  const tx: any = {
    publicDashboard: {
      findUniqueOrThrow: async () => dashboard,
      updateMany: async ({ where, data }: any) => {
        if (where.draftVersion !== dashboard.draftVersion) return { count: 0 };
        dashboard = {
          ...dashboard,
          ...data,
          draftVersion: data.draftVersion?.increment
            ? dashboard.draftVersion + data.draftVersion.increment
            : dashboard.draftVersion,
          updatedAt: new Date(),
        };
        return { count: 1 };
      },
    },
    publicDashboardRevision: {
      aggregate: async () => ({
        _max: { revision: revisions.size ? Math.max(...revisions.keys()) : null },
      }),
      create: async ({ data }: any) => {
        const row = { id: `revision-${data.revision}`, publishedAt: new Date(), ...data };
        revisions.set(data.revision, row);
        return row;
      },
      findUnique: async ({ where }: any) => {
        const revision = where.dashboardId_revision?.revision;
        return revision ? revisions.get(revision) ?? null : null;
      },
    },
    sourceDocument: {
      findUnique: async ({ where }: any) => where.id === source.id ? source : null,
    },
    documentPublication: {
      findFirst: async ({ where, select }: any) => {
        if (where.sourceDocumentId === source.id && where.revokedAt === null) {
          return publication?.revokedAt ? null : publication;
        }
        if (where.sourceDocumentId === source.id) {
          return publication && select?.version ? { version: publication.version } : publication;
        }
        if (where.id === publication?.id && where.revokedAt === null && !publication.revokedAt) {
          return publication;
        }
        return null;
      },
      findMany: async ({ where }: any) => {
        if (!publication || publication.revokedAt) return [];
        const ids = where.id?.in as string[] | undefined;
        if (ids && !ids.includes(publication.id)) return [];
        return [publication];
      },
      create: async ({ data }: any) => {
        publication = {
          id: 'publication-workflow',
          publishedAt: new Date(),
          revokedAt: null,
          revokedBy: null,
          ...data,
        };
        return publication;
      },
      updateMany: async ({ where, data }: any) => {
        if (!publication || publication.id !== where.id || publication.revokedAt) return { count: 0 };
        if (where.version !== undefined && publication.version !== where.version) return { count: 0 };
        publication = { ...publication, ...data };
        return { count: 1 };
      },
    },
    target: { findMany: async () => [] },
    feedback: { findMany: async () => [] },
    systemSetting: { findUnique: async () => ({ defaultYear: 2026 }) },
    auditLog: { create: async () => undefined },
  };
  const prisma: any = {
    ...tx,
    publicDashboard: {
      ...tx.publicDashboard,
      upsert: async () => dashboard,
      findUnique: async () => dashboard,
    },
    publicDashboardRevision: {
      ...tx.publicDashboardRevision,
      findUnique: tx.publicDashboardRevision.findUnique,
    },
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  };
  const service = new PublicDashboardService(prisma);

  const created = await service.setDocumentPublication(admin as any, source.id, {
    title: 'Public workflow document',
    summary: 'Reviewed and safe for publication',
    confirmedSafe: true,
    public: true,
  });
  const publicationId = created.publication.id;
  const config = oneWidgetConfig({
    id: 'documents',
    type: 'documentList',
    settings: { maxItems: 6, publicationIds: [publicationId] },
  });

  const saved = await service.saveDraft(admin as any, {
    expectedVersion: 1,
    name: 'Public documents',
    templateKey: 'transparency',
    config: config as unknown as Record<string, unknown>,
  });
  assert.equal(saved.draftVersion, 2);

  const published = await service.publish(admin as any, {
    expectedVersion: 2,
    changeNote: 'Publish reviewed document',
  });
  assert.equal(published.revision.revision, 1);
  assert.equal(dashboard.publishedRevision, 1);
  assert.equal(
    collectPublicDashboardReferences(revisions.get(1).config).publicationIds[0],
    publicationId,
  );

  const aggregate = await service.publicDashboard(2026);
  assert.equal(aggregate.data.documents.length, 1);
  assert.equal(aggregate.data.documents[0].id, publicationId);
  assert.equal(
    aggregate.data.documents[0].downloadUrl,
    `/api/public/dashboard/documents/${publicationId}/download`,
  );
  const liveHeaders = new Map<string, string>();
  const liveFile = await service.downloadPublicDocument(publicationId, {
    setHeader: (name: string, value: string) => liveHeaders.set(name, value),
  } as any);
  assert.ok(liveFile);
  assert.equal(liveHeaders.get('Content-Length'), String(source.size));

  await service.setDocumentPublication(admin as any, source.id, {
    expectedVersion: 1,
    title: 'Public workflow document',
    confirmedSafe: true,
    public: false,
  });
  assert.ok(publication.revokedAt instanceof Date);
  assert.equal(revisions.get(1).config.widgets[0].settings.publicationIds[0], publicationId);

  const afterRevoke = await service.publicDashboard(2026);
  assert.equal(afterRevoke.revision, 1);
  assert.deepEqual(afterRevoke.data.documents, []);
  await assert.rejects(
    service.downloadPublicDocument(publicationId, { setHeader: () => undefined } as any),
    (error: unknown) => error instanceof NotFoundException && error.getStatus() === 404,
  );
});
