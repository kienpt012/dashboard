import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { cleanupQaActors, createQaActors, qaActorIds } from './qa-actors.mjs';

try { process.loadEnvFile?.(); } catch { /* Environment can be provided by CI. */ }

const baseUrl = process.env.QA_API_URL || 'http://localhost:3000/api';
if (!process.env.DATABASE_URL) {
  if (!process.env.POSTGRES_PASSWORD) throw new Error('Thiếu POSTGRES_PASSWORD hoặc DATABASE_URL');
  const user = encodeURIComponent(process.env.POSTGRES_USER || 'ioc_admin');
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD);
  const port = process.env.POSTGRES_PORT || '5432';
  const database = encodeURIComponent(process.env.POSTGRES_DB || 'ioc_laithieu');
  process.env.DATABASE_URL = `postgresql://${user}:${password}@localhost:${port}/${database}?schema=public`;
}
const prisma = new PrismaClient();
let actors;
let failure;
const checks = [];

async function request(path, { token, method = 'GET', body, expected = 200 } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}

const config = name => ({
  schemaVersion: 1,
  appearance: { wallpaper: 'aurora', customWallpaper: '', accent: '#7ce6c5', blur: 16, overlay: 25 },
  activeSpace: 'home',
  spaces: [{ id: 'home', name, widgets: [{ id: 'notes', type: 'notes', title: 'Ghi chú', x: 0, y: 0, w: 4, h: 5, settings: { text: `Riêng tư ${name}` } }] }],
  shortcuts: [{ id: 'ops', title: 'Điều hành', url: '/admin/dieu-hanh', icon: '◈', color: '#63dcc0', hotkey: '1' }],
});

try {
  actors = await createQaActors(prisma, 'workspace');
  const [admin, staff] = await Promise.all([actors.admin, actors.staff].map(actor => request('/auth/login', {
    method: 'POST', body: { username: actor.username, password: actors.password }, expected: 201,
  })));
  await request('/workspace', { expected: 401 });
  checks.push('Bắt buộc đăng nhập');

  assert.deepEqual(await request('/workspace', { token: admin.accessToken }), { config: null, version: 1, updatedAt: null });
  checks.push('Tài khoản mới chưa có cấu hình');

  let a = await request('/workspace', { token: admin.accessToken, method: 'PUT', body: { expectedVersion: 1, config: config('A') } });
  assert.equal(a.version, 2);
  assert.equal(a.config.spaces[0].name, 'A');
  assert.equal((await request('/workspace', { token: staff.accessToken })).config, null);
  const b = await request('/workspace', { token: staff.accessToken, method: 'PUT', body: { expectedVersion: 1, config: config('B') } });
  assert.equal(b.config.spaces[0].name, 'B');
  assert.equal((await request(`/workspace?userId=${actors.admin.id}`, { token: staff.accessToken })).config.spaces[0].name, 'B');
  assert.equal((await request('/workspace', { token: admin.accessToken })).config.spaces[0].name, 'A');
  checks.push('Lưu bền vững và cách ly cấu hình giữa tài khoản');

  await request('/workspace', { token: admin.accessToken, method: 'PUT', body: { expectedVersion: 1, config: config('Cũ') }, expected: 409 });
  checks.push('Chặn ghi đè bằng phiên bản cũ');

  const races = await Promise.all(['C', 'D'].map(name => fetch(`${baseUrl}/workspace`, {
    method: 'PUT', headers: { authorization: `Bearer ${admin.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ expectedVersion: a.version, config: config(name) }),
    signal: AbortSignal.timeout(20_000),
  })));
  assert.deepEqual(races.map(response => response.status).sort(), [200, 409]);
  a = await request('/workspace', { token: admin.accessToken });
  assert.equal(a.version, 3);
  checks.push('Hai phiên lưu đồng thời: chỉ một phiên thành công');

  await request('/workspace', { token: staff.accessToken, method: 'PUT', body: { expectedVersion: b.version, config: config('Giả mạo'), userId: actors.admin.id }, expected: 400 });
  const malformed = config('Không hợp lệ');
  malformed.spaces[0].widgets[0].type = 'script';
  await request('/workspace', { token: admin.accessToken, method: 'PUT', body: { expectedVersion: a.version, config: malformed }, expected: 400 });
  assert.equal((await request('/workspace', { token: admin.accessToken })).version, a.version);
  checks.push('Chặn giả mạo người dùng và cấu hình sai');

  for (const url of ['http://example.com/data', 'https://127.0.0.1/', 'https://169.254.169.254/', 'https://[::1]/', 'https://localhost/', 'https://example.com:8443/', 'https://user:pass@example.com/']) {
    await request('/workspace/fetch', { token: staff.accessToken, method: 'POST', body: { url }, expected: 400 });
  }
  await request('/workspace/fetch', { method: 'POST', body: { url: 'https://example.com/' }, expected: 401 });
  checks.push('API ngoài: chặn HTTP, IP nội bộ, cổng lạ và thông tin đăng nhập');

  if (process.env.QA_EXTERNAL_API === '1') {
    const result = await request('/workspace/fetch', { token: staff.accessToken, method: 'POST', expected: 201,
      body: { url: 'https://api.open-meteo.com/v1/forecast?latitude=10.905&longitude=106.699&current=temperature_2m' } });
    assert.equal(typeof result.data.current.temperature_2m, 'number');
    assert.equal(typeof result.fetchedAt, 'string');
    checks.push('Tải JSON thời tiết thật qua API ngoài');
  }
} catch (error) {
  failure = error;
} finally {
  try {
    const ids = qaActorIds(actors);
    await cleanupQaActors(prisma, actors);
    if (ids.length) {
      assert.equal(await prisma.userWorkspace.count({ where: { userId: { in: ids } } }), 0);
      checks.push('Đã dọn toàn bộ tài khoản, audit và cấu hình QA');
    }
  } catch (error) {
    failure = new Error(`${failure ? `${failure.message}; ` : ''}Dọn dữ liệu QA: ${error.message}`);
  }
  await prisma.$disconnect();
}
for (const check of checks) console.log(`PASS ${check}`);
if (failure) { console.error(failure.message); process.exitCode = 1; }
else console.log(`Hoàn tất ${checks.length} kiểm tra bàn làm việc.`);
