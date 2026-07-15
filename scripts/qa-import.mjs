import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';

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

async function cleanup() {
  if (targetId) await prisma.progressUpdate.deleteMany({ where: { targetId } });
  if (importBatchId) {
    await prisma.auditLog.deleteMany({ where: { entityType: 'IMPORT_BATCH', entityId: importBatchId } });
    await prisma.importBatch.deleteMany({ where: { id: importBatchId } });
  }
  if (targetId) {
    await prisma.auditLog.deleteMany({ where: { entityType: 'Target', entityId: targetId } });
    await prisma.target.deleteMany({ where: { id: targetId } });
  }
}

try {
  const login = await jsonRequest('/auth/login', {
    method: 'POST',
    expected: [201],
    body: { username: 'admin', password: 'Admin@123' },
  });
  check('Đăng nhập quản trị cho QA Excel', Boolean(login.accessToken));

  const departments = await jsonRequest('/departments', { token: login.accessToken });
  const department = departments.find(item => item.isActive);
  check('Có phòng ban hoạt động để kiểm thử', Boolean(department));

  const code = `QA-EXCEL-${Date.now()}`;
  const created = await jsonRequest('/targets', {
    method: 'POST',
    token: login.accessToken,
    expected: [201],
    body: {
      code,
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
  check('Tạo chỉ tiêu QA tạm', created.code === code && created.departmentId === department.id);

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
  if (previewResponse.status !== 201) throw new Error(`Xem trước Excel: ${previewResponse.status} - ${JSON.stringify(preview)}`);
  importBatchId = preview.id;
  check('Xem trước nhận đúng một thay đổi và không có lỗi', preview.canApply === true && preview.summary?.changedRows === 1 && preview.summary?.errorRows === 0);

  const applied = await jsonRequest(`/imports/${importBatchId}/apply`, {
    method: 'POST',
    token: login.accessToken,
    expected: [201],
  });
  check('Áp dụng Excel hoàn tất đúng trạng thái', applied.status === 'APPLIED' && applied.idempotent === false);

  const targets = await jsonRequest(`/targets?year=2026&departmentId=${encodeURIComponent(department.id)}&search=${encodeURIComponent(code)}`, { token: login.accessToken });
  check('Số liệu Excel được ghi nhận đúng chỉ tiêu', targets.length === 1 && targets[0].id === targetId && Number(targets[0].currentValue) === 25);

  console.log(JSON.stringify({ ok: true, checks: checks.length, details: checks }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, checks: checks.length, error: error.message }, null, 2));
  process.exitCode = 1;
} finally {
  try { await cleanup(); } finally { await prisma.$disconnect(); }
}
