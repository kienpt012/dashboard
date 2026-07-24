import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { cleanupQaActors, createQaActors, qaActorIds } from './qa-actors.mjs';

try {
  process.loadEnvFile?.();
} catch {
  // CI can provide DATABASE_URL directly.
}

const baseUrl = process.env.QA_API_URL || 'http://localhost:3000/api';
if (!process.env.DATABASE_URL) {
  const databaseUser = process.env.POSTGRES_USER || 'ioc_admin';
  const databaseName = process.env.POSTGRES_DB || 'ioc_laithieu';
  if (!process.env.POSTGRES_PASSWORD) throw new Error('Thiếu POSTGRES_PASSWORD hoặc DATABASE_URL cho QA Excel');
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(databaseUser)}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@localhost:5432/${encodeURIComponent(databaseName)}?schema=public`;
}

const prisma = new PrismaClient();
const checks = [];
let targetId = null;
let importBatchId = null;
let qaActors = null;
const progressUpdateIds = new Set();

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
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
  if (!expected.includes(response.status)) throw new Error(`${method} ${path}: ${response.status} - ${JSON.stringify(data)}`);
  return data;
}

async function captureProgressUpdateIds() {
  const filters = [];
  if (targetId) filters.push({ targetId });
  if (importBatchId) filters.push({ importBatchId });
  if (!filters.length) return;
  const rows = await prisma.progressUpdate.findMany({
    where: { OR: filters },
    select: { id: true },
  });
  rows.forEach(item => progressUpdateIds.add(item.id));
}

async function cleanupBusinessData() {
  await captureProgressUpdateIds();
  const operations = [];
  if (progressUpdateIds.size) {
    operations.push(prisma.progressUpdate.deleteMany({ where: { id: { in: [...progressUpdateIds] } } }));
  }
  if (importBatchId) operations.push(prisma.importBatch.deleteMany({ where: { id: importBatchId } }));
  if (targetId) operations.push(prisma.target.deleteMany({ where: { id: targetId } }));
  if (operations.length) await prisma.$transaction(operations);
}

async function assertCleanupPostconditions() {
  const actorIds = qaActorIds(qaActors);
  const entityIds = [targetId, importBatchId, ...progressUpdateIds].filter(Boolean);
  const [updates, batches, targets, users, audits] = await Promise.all([
    progressUpdateIds.size
      ? prisma.progressUpdate.count({ where: { id: { in: [...progressUpdateIds] } } })
      : 0,
    importBatchId ? prisma.importBatch.count({ where: { id: importBatchId } }) : 0,
    targetId ? prisma.target.count({ where: { id: targetId } }) : 0,
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
  if (updates || batches || targets || users || audits) {
    throw new Error(`Dữ liệu QA còn sót: updates=${updates}, batches=${batches}, targets=${targets}, users=${users}, audits=${audits}`);
  }
  return { updates, batches, targets, users, audits };
}

async function runSuite() {
  qaActors = await createQaActors(prisma, 'import');
  const login = await jsonRequest('/auth/login', {
    method: 'POST',
    expected: [201],
    body: { username: qaActors.admin.username, password: qaActors.password },
  });
  check('Đăng nhập quản trị cho QA Excel', Boolean(login.accessToken));

  const departments = await jsonRequest('/departments', { token: login.accessToken });
  const department = departments.find(item => item.id === qaActors.departments.primary.id);
  check('Có phòng ban hoạt động để kiểm thử', Boolean(department));

  const created = await jsonRequest('/targets', {
    method: 'POST',
    token: login.accessToken,
    expected: [201],
    body: {
      title: 'Chỉ tiêu tạm kiểm thử toàn bộ luồng Excel',
      unit: 'hồ sơ',
      targetValue: 100,
      weight: 1,
      year: 2026,
      frequency: 'YEARLY',
      direction: 'HIGHER_IS_BETTER',
      dueDate: '2026-12-31',
      departmentId: department.id,
    },
  });
  targetId = created.id;
  const code = created.code;
  check(
    'Tạo chỉ tiêu QA tạm với mã do backend cấp',
    /^CT-2026-[A-Z0-9]+-\d{3,}$/.test(code) && created.departmentId === department.id,
  );

  const templateResponse = await fetch(`${baseUrl}/imports/template?year=2026&departmentId=${encodeURIComponent(department.id)}`, {
    headers: { authorization: `Bearer ${login.accessToken}` },
  });
  if (!templateResponse.ok) throw new Error(`Tải biểu mẫu: ${templateResponse.status}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await templateResponse.arrayBuffer());
  const sheet = workbook.getWorksheet('CAP_NHAT');
  check('Biểu mẫu có trang CAP_NHAT', Boolean(sheet));

  let targetRow = null;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && String(row.getCell(2).value ?? '').trim() === code) targetRow = row;
  });
  check('Biểu mẫu chứa đúng chỉ tiêu và phiên bản hệ thống', Boolean(targetRow) && String(targetRow.getCell(1).value ?? '').trim() === targetId && Number(targetRow.getCell(8).value) === created.version);
  targetRow.getCell(9).value = 25;
  targetRow.getCell(10).value = 'QA end-to-end: số liệu kiểm thử sẽ được tự động dọn sạch';

  const fileBuffer = await workbook.xlsx.writeBuffer();
  const form = new FormData();
  form.append('file', new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'qa-import.xlsx');
  const previewResponse = await fetch(`${baseUrl}/imports/targets/preview`, {
    method: 'POST',
    headers: { authorization: `Bearer ${login.accessToken}` },
    body: form,
  });
  const preview = await previewResponse.json();
  if (preview?.id) importBatchId = preview.id;
  if (previewResponse.status !== 201) throw new Error(`Xem trước Excel: ${previewResponse.status} - ${JSON.stringify(preview)}`);
  check('Xem trước nhận đúng một thay đổi và không có lỗi', preview.canApply === true && preview.summary?.changedRows === 1 && preview.summary?.errorRows === 0);

  const applied = await jsonRequest(`/imports/${importBatchId}/apply`, {
    method: 'POST',
    token: login.accessToken,
    expected: [201],
  });
  check('Áp dụng Excel hoàn tất đúng trạng thái', applied.status === 'APPLIED' && applied.idempotent === false);

  const targets = await jsonRequest(`/targets?year=2026&departmentId=${encodeURIComponent(department.id)}&search=${encodeURIComponent(code)}`, { token: login.accessToken });
  check('Số liệu Excel được ghi nhận đúng chỉ tiêu', targets.length === 1 && targets[0].id === targetId && Number(targets[0].currentValue) === 25);

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
    entityIds: [targetId, importBatchId, ...progressUpdateIds].filter(Boolean),
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
  console.log(JSON.stringify({
    ok: true,
    checks: checks.length,
    details: checks,
    cleanup: {
      updates: progressUpdateIds.size,
      batches: importBatchId ? 1 : 0,
      targets: targetId ? 1 : 0,
      users: cleanupSummary?.userIds.length ?? 0,
      audits: cleanupSummary?.auditIds.length ?? 0,
      residual: { updates: 0, batches: 0, targets: 0, users: 0, audits: 0 },
    },
  }, null, 2));
}
