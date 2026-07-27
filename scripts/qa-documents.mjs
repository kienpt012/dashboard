// QA end-to-end cho luồng kho văn bản + trích xuất chỉ tiêu:
// upload -> pipeline xử lý -> ứng viên -> hiệu chỉnh -> duyệt thành Target -> bảo vệ provenance.
// Suite hoạt động cả khi Ollama tắt (fallback luật): assert theo nội dung xác định,
// không assert số lượng tuyệt đối các đề xuất do model sinh thêm.
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { cleanupQaActors, createQaActors, qaActorIds } from './qa-actors.mjs';

try {
  process.loadEnvFile?.();
} catch {
  // CI có thể cấp DATABASE_URL trực tiếp.
}

const baseUrl = process.env.QA_API_URL || 'http://localhost:3000/api';
if (!process.env.DATABASE_URL) {
  const databaseUser = process.env.POSTGRES_USER || 'ioc_admin';
  const databaseName = process.env.POSTGRES_DB || 'ioc_laithieu';
  if (!process.env.POSTGRES_PASSWORD) throw new Error('Thiếu POSTGRES_PASSWORD hoặc DATABASE_URL cho QA tài liệu');
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(databaseUser)}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@localhost:5432/${encodeURIComponent(databaseName)}?schema=public`;
}

const prisma = new PrismaClient();
const checks = [];
let qaActors = null;
let documentId = null;
let targetId = null;
const candidateIds = new Set();

function mergeFailure(current, next, phase) {
  const nextMessage = next instanceof Error ? next.message : String(next);
  if (!current) return new Error(`${phase}: ${nextMessage}`);
  return new Error(`${current.message}; ${phase}: ${nextMessage}`);
}

function check(name, condition, details = '') {
  if (!condition) throw new Error(`${name}: ${details || 'không đạt'}`);
  checks.push(name);
}

async function jsonRequest(path, { method = 'GET', token, body, expected = [200] } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : await response.text();
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path}: ${response.status} - ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

async function uploadDocument(token, fileBuffer, fileName, mime, expected = [201]) {
  const form = new FormData();
  form.append('file', new Blob([fileBuffer], { type: mime }), fileName);
  form.append('title', 'Tài liệu QA tự động — sẽ được dọn sạch');
  form.append('docType', 'KE_HOACH');
  form.append('year', '2026');
  const response = await fetch(`${baseUrl}/documents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await response.json();
  if (!expected.includes(response.status)) {
    throw new Error(`POST /documents: ${response.status} - ${JSON.stringify(data).slice(0, 300)}`);
  }
  return { status: response.status, data };
}

async function buildQaWorkbook(departmentName) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('KE_HOACH_QA');
  sheet.addRow(['KẾ HOẠCH KIỂM THỬ TỰ ĐỘNG NĂM 2026']);
  sheet.addRow([]);
  // Câu chỉ tiêu dạng văn xuôi để bộ luật trích xuất được một cách xác định
  // (không phụ thuộc LLM đang bật hay tắt).
  sheet.addRow([`1. Tỷ lệ hồ sơ kiểm thử tự động giải quyết đúng hạn đạt 97% trở lên. Đơn vị chủ trì: ${departmentName}. Báo cáo hàng quý.`]);
  sheet.addRow(['2. Số vụ việc tồn đọng kiểm thử không quá 12 vụ. Báo cáo hàng tháng.']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function waitForProcessing(token, id, timeoutMs = 6 * 60 * 1000) {
  const startedAt = Date.now();
  for (;;) {
    const document = await jsonRequest(`/documents/${id}`, { token });
    if (document.status === 'FAILED') {
      throw new Error(`Tài liệu xử lý thất bại: ${document.processingError}`);
    }
    const extractDone = (document.jobs ?? []).some(
      job => job.kind === 'INDICATOR_EXTRACT' && job.status === 'COMPLETED',
    );
    const active = (document.jobs ?? []).some(
      job => job.status === 'PENDING' || job.status === 'PROCESSING',
    );
    if (document.status === 'PROCESSED' && extractDone && !active) return document;
    if (Date.now() - startedAt > timeoutMs) throw new Error('Hết thời gian chờ pipeline xử lý tài liệu');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

async function runSuite() {
  qaActors = await createQaActors(prisma, 'docs');
  const adminLogin = await jsonRequest('/auth/login', {
    method: 'POST',
    expected: [201],
    body: { username: qaActors.admin.username, password: qaActors.password },
  });
  check('Đăng nhập quản trị cho QA tài liệu', Boolean(adminLogin.accessToken));
  const adminToken = adminLogin.accessToken;

  const viewerLogin = await jsonRequest('/auth/login', {
    method: 'POST',
    expected: [201],
    body: { username: qaActors.viewer.username, password: qaActors.password },
  });

  const department = qaActors.departments.primary;
  const workbookBuffer = await buildQaWorkbook(department.name);

  // VIEWER không được tải tài liệu.
  const viewerUpload = await uploadDocument(viewerLogin.accessToken, workbookBuffer, 'qa-tai-lieu.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', [403]);
  check('VIEWER bị chặn tải tài liệu', viewerUpload.status === 403);

  // Tệp giả mạo phần mở rộng bị từ chối theo chữ ký nội dung.
  const fakeUpload = await uploadDocument(adminToken, Buffer.from('day khong phai tai lieu'), 'gia-mao.pdf',
    'application/pdf', [400]);
  check('Tệp sai chữ ký nội dung bị từ chối', fakeUpload.status === 400);

  const uploaded = await uploadDocument(adminToken, workbookBuffer, 'qa-tai-lieu.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  documentId = uploaded.data.id;
  check('Tải tài liệu nhận mã hệ thống cấp', /^VB-2026-\d{4}$/.test(uploaded.data.code));

  const duplicate = await uploadDocument(adminToken, workbookBuffer, 'qa-tai-lieu-2.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', [409]);
  check('Tải trùng nội dung bị chặn theo SHA-256', duplicate.status === 409);

  const processed = await waitForProcessing(adminToken, documentId);
  check('Pipeline phân tích tài liệu hoàn tất', processed.status === 'PROCESSED' && processed.counts.pages >= 1);

  const text = await jsonRequest(`/documents/${documentId}/text`, { token: adminToken });
  check(
    'Nội dung số hóa chứa câu chỉ tiêu gốc',
    text.pages.some(page => page.text.includes('giải quyết đúng hạn đạt 97%')),
  );

  const candidates = await jsonRequest(`/candidates?documentId=${documentId}`, { token: adminToken });
  candidates.forEach(candidate => candidateIds.add(candidate.id));
  const main = candidates.find(candidate =>
    candidate.targetValue === 97 && (candidate.unit ?? '').includes('%'));
  check('Có đề xuất đúng giá trị 97% từ câu chỉ tiêu', Boolean(main), JSON.stringify(candidates.map(c => [c.name, c.targetValue, c.unit])).slice(0, 200));
  check(
    'Đề xuất có đủ dấu vết nguồn gốc và độ tin cậy',
    main.sourceQuote.length > 10
      && ['RULE_BASED', 'LLM'].includes(main.extractionMethod)
      && main.confidence > 0 && main.confidence <= 1
      && main.documentId === documentId,
  );
  const lower = candidates.find(candidate => candidate.targetValue === 12);
  check('Chỉ tiêu "không quá" nhận chiều hướng càng thấp càng tốt', !lower || lower.direction === 'LOWER_IS_BETTER');

  // Hiệu chỉnh của con người được ghi vết và giữ qua optimistic lock.
  const edited = await jsonRequest(`/candidates/${main.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: {
      expectedVersion: main.version,
      name: 'Tỷ lệ hồ sơ kiểm thử tự động giải quyết đúng hạn (đã hiệu chỉnh)',
      responsibleDepartmentId: department.id,
      frequency: 'QUARTERLY',
      deadline: '2026-12-31',
      targetYear: 2026,
      unit: '%',
    },
  });
  check('Hiệu chỉnh ứng viên ghi nhận humanEdited và trường đã sửa',
    edited.humanEdited === true && edited.editedFields.includes('name') && edited.version === main.version + 1);

  await jsonRequest(`/candidates/${main.id}`, {
    method: 'PATCH',
    token: adminToken,
    expected: [409],
    body: { expectedVersion: main.version, name: 'Phiên bản cũ phải bị chặn' },
  });
  check('Sửa với phiên bản cũ bị chặn 409', true);

  const approved = await jsonRequest(`/candidates/${main.id}/approve`, {
    method: 'POST',
    token: adminToken,
    expected: [201],
    body: { expectedVersion: edited.version, weight: 1 },
  });
  targetId = approved.target.id;
  check(
    'Duyệt ứng viên tạo chỉ tiêu chính thức có mã hệ thống và nguồn gốc tài liệu',
    /^CT-2026-[A-Z0-9]+-\d{3,}$/.test(approved.target.code)
      && approved.target.sourceDocumentId === documentId
      && approved.candidate.status === 'APPROVED',
  );

  await jsonRequest(`/candidates/${main.id}/approve`, {
    method: 'POST',
    token: adminToken,
    expected: [409],
    body: { expectedVersion: edited.version + 1 },
  });
  check('Duyệt lần hai bị chặn (đã xử lý)', true);

  if (lower) {
    const rejected = await jsonRequest(`/candidates/${lower.id}/reject`, {
      method: 'POST',
      token: adminToken,
      expected: [201],
      body: { expectedVersion: lower.version, reason: 'QA: từ chối để kiểm thử luồng, dữ liệu sẽ được dọn.' },
    });
    check('Từ chối ứng viên ghi lý do và người duyệt', rejected.status === 'REJECTED' && Boolean(rejected.reviewNote));
  }

  await jsonRequest(`/documents/${documentId}`, {
    method: 'DELETE',
    token: adminToken,
    expected: [409],
  });
  check('Không thể xóa tài liệu đã có chỉ tiêu được duyệt (bảo toàn nguồn gốc)', true);

  const targets = await jsonRequest(`/targets?year=2026&search=${encodeURIComponent(approved.target.code)}`, { token: adminToken });
  check('Chỉ tiêu mới xuất hiện trong danh mục chính thức', targets.some(target => target.id === targetId));
}

async function cleanupBusinessData() {
  const operations = [];
  if (targetId) operations.push(prisma.target.deleteMany({ where: { id: targetId } }));
  if (documentId) operations.push(prisma.sourceDocument.deleteMany({ where: { id: documentId } }));
  if (operations.length) await prisma.$transaction(operations);
}

async function assertCleanupPostconditions() {
  const actorIds = qaActorIds(qaActors);
  const entityIds = [documentId, targetId, ...candidateIds].filter(Boolean);
  const [documents, targets, candidates, users, audits] = await Promise.all([
    documentId ? prisma.sourceDocument.count({ where: { id: documentId } }) : 0,
    targetId ? prisma.target.count({ where: { id: targetId } }) : 0,
    candidateIds.size ? prisma.indicatorCandidate.count({ where: { id: { in: [...candidateIds] } } }) : 0,
    actorIds.length ? prisma.user.count({ where: { id: { in: actorIds } } }) : 0,
    actorIds.length || entityIds.length
      ? prisma.auditLog.count({
          where: {
            OR: [
              ...(actorIds.length ? [{ actorId: { in: actorIds } }] : []),
              ...(entityIds.length ? [{ entityId: { in: entityIds } }] : []),
            ],
          },
        })
      : 0,
  ]);
  if (documents || targets || candidates || users || audits) {
    throw new Error(`Dữ liệu QA còn sót: documents=${documents}, targets=${targets}, candidates=${candidates}, users=${users}, audits=${audits}`);
  }
}

let failure = null;
let cleanupSummary = null;
try {
  await runSuite();
} catch (error) {
  failure = mergeFailure(failure, error, 'Thực thi QA');
}

try {
  await cleanupBusinessData();
} catch (error) {
  failure = mergeFailure(failure, error, 'Dọn dữ liệu nghiệp vụ');
}

try {
  cleanupSummary = await cleanupQaActors(prisma, qaActors, {
    entityIds: [documentId, targetId, ...candidateIds].filter(Boolean),
  });
} catch (error) {
  failure = mergeFailure(failure, error, 'Dọn nhật ký và actor');
}

try {
  await assertCleanupPostconditions();
} catch (error) {
  failure = mergeFailure(failure, error, 'Hậu kiểm cleanup');
}

try {
  await prisma.$disconnect();
} catch (error) {
  failure = mergeFailure(failure, error, 'Ngắt kết nối cơ sở dữ liệu');
}

if (failure) {
  console.error(JSON.stringify({ ok: false, checks: checks.length, error: failure.message }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, checks: checks.length, details: checks, cleanup: cleanupSummary }, null, 2));
}
