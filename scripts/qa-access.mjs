import { PrismaClient } from '@prisma/client';
import { cleanupQaActors, createQaActors, qaActorIds } from './qa-actors.mjs';

try {
  process.loadEnvFile?.();
} catch {
  // The suite can still run when DATABASE_URL is supplied explicitly by CI.
}
const baseUrl = process.env.QA_API_URL || 'http://localhost:3000/api';
if (!process.env.DATABASE_URL) {
  const databaseUser = process.env.POSTGRES_USER || 'ioc_admin';
  const databaseName = process.env.POSTGRES_DB || 'ioc_laithieu';
  if (!process.env.POSTGRES_PASSWORD) {
    throw new Error('Thiếu POSTGRES_PASSWORD trong .env hoặc DATABASE_URL cho bộ kiểm thử phân quyền');
  }
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(databaseUser)}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@localhost:5432/${encodeURIComponent(databaseName)}?schema=public`;
}
const prisma = new PrismaClient();
const checks = [];
let qaUserId = null;
let qaUsername = null;
let qaFeedbackId = null;
let qaTargetId = null;
let qaInactiveAdminId = null;
let qaInactiveAdminUsername = null;
let qaActors = null;

function mergeFailure(current, next, phase) {
  const nextMessage = next instanceof Error ? next.message : String(next);
  if (!current) return new Error(`${phase}: ${nextMessage}`);
  return new Error(`${current.message}; ${phase}: ${nextMessage}`);
}

function check(name, condition, details = '') {
  if (!condition) throw new Error(`${name}: ${details || 'không đạt'}`);
  checks.push(name);
}

async function request(path, { method = 'GET', token, body, expected = [200] } = {}) {
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
  return { status: response.status, data };
}

async function login(username, password) {
  return (await request('/auth/login', { method: 'POST', expected: [201], body: { username, password } })).data;
}

async function cleanupBusinessData() {
  const operations = [];
  if (qaFeedbackId) operations.push(prisma.feedback.deleteMany({ where: { id: qaFeedbackId } }));
  if (qaTargetId) {
    operations.push(prisma.target.deleteMany({ where: { id: qaTargetId } }));
  }
  if (operations.length) await prisma.$transaction(operations);
}

async function assertCleanupPostconditions() {
  const actorIds = qaActorIds(qaActors);
  const additionalUserIds = [qaInactiveAdminId, qaUserId].filter(Boolean);
  const entityIds = [qaFeedbackId, qaTargetId, ...additionalUserIds].filter(Boolean);
  const [feedbacks, targets, users, audits] = await Promise.all([
    qaFeedbackId ? prisma.feedback.count({ where: { id: qaFeedbackId } }) : 0,
    qaTargetId ? prisma.target.count({ where: { id: qaTargetId } }) : 0,
    [...actorIds, ...additionalUserIds].length
      ? prisma.user.count({ where: { id: { in: [...actorIds, ...additionalUserIds] } } })
      : 0,
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
  if (feedbacks || targets || users || audits) {
    throw new Error(`Dữ liệu QA còn sót: feedbacks=${feedbacks}, targets=${targets}, users=${users}, audits=${audits}`);
  }
  return { feedbacks, targets, users, audits };
}

async function runSuite() {
  qaActors = await createQaActors(prisma, 'access');
  const [admin, manager, staff, otherManager] = await Promise.all([
    login(qaActors.admin.username, qaActors.password),
    login(qaActors.manager.username, qaActors.password),
    login(qaActors.staff.username, qaActors.password),
    login(qaActors.otherManager.username, qaActors.password),
  ]);
  check('Đăng nhập ma trận vai trò', [admin, manager, staff, otherManager].every(item => item.accessToken));

  const departments = (await request('/departments', { token: admin.accessToken })).data;
  const ktht = departments.find(item => item.id === qaActors.departments.primary.id);
  const vhxh = departments.find(item => item.id === qaActors.departments.secondary.id);
  check('Có dữ liệu hai phòng ban để kiểm tra scope', Boolean(ktht && vhxh));

  await request(`/departments/${ktht.id}`, { method: 'PATCH', token: admin.accessToken, expected: [409], body: { expectedVersion: ktht.version + 999, name: ktht.name } });
  checks.push('Phiên bản phòng ban cũ bị từ chối để tránh ghi đè');

  const settings = await request('/settings', { token: admin.accessToken });
  const staleSettingsVersion = settings.data.version > 1
    ? settings.data.version - 1
    : settings.data.version + 1;
  await request('/settings', {
    method: 'PATCH', token: admin.accessToken, expected: [409],
    body: { expectedVersion: staleSettingsVersion, warningDays: settings.data.warningDays },
  });
  checks.push('Thiết lập từ chối phiên bản cũ mà không cần ghi thay đổi giả vờ');

  const qaTargetCode = `QA-ARCHIVE-${Date.now()}`;
  await request('/targets', {
    method: 'POST', token: admin.accessToken, expected: [400],
    body: { code: `QA-PUBLIC-${Date.now()}`, title: 'Chỉ tiêu thử bỏ qua bước công bố', unit: '%', targetValue: 100, weight: 1, year: 2026, frequency: 'YEARLY', direction: 'HIGHER_IS_BETTER', dueDate: '2026-12-31', departmentId: ktht.id, isPublic: true },
  });
  checks.push('Không thể tạo chỉ tiêu ở trạng thái công khai trước khi có số liệu chính thức');

  const qaTarget = await request('/targets', {
    method: 'POST', token: admin.accessToken, expected: [201],
    body: { code: qaTargetCode, title: 'Chỉ tiêu kiểm thử vòng đời lưu trữ', description: 'Tự động xóa sau kiểm thử', unit: '%', targetValue: 100, weight: 1, year: 2026, frequency: 'YEARLY', direction: 'HIGHER_IS_BETTER', dueDate: '2026-12-31', departmentId: ktht.id, isPublic: false },
  });
  qaTargetId = qaTarget.data.id;
  const archivedTarget = await request(`/targets/${qaTargetId}/archive`, { method: 'POST', token: admin.accessToken, expected: [201], body: { reason: 'Kết thúc chỉ tiêu kiểm thử', expectedVersion: qaTarget.data.version, expectedPublicationVersion: qaTarget.data.publicationVersion } });
  const activeSearch = await request(`/targets?year=2026&search=${encodeURIComponent(qaTargetCode)}`, { token: admin.accessToken });
  const archiveSearch = await request(`/targets?year=2026&archived=true&search=${encodeURIComponent(qaTargetCode)}`, { token: admin.accessToken });
  check('Lưu trữ loại chỉ tiêu khỏi vận hành nhưng vẫn giữ để đối soát', archivedTarget.data.isArchived && activeSearch.data.length === 0 && archiveSearch.data.length === 1);
  const archivedReport = await request(`/dashboard/report?year=2026&departmentId=${encodeURIComponent(ktht.id)}`, { token: admin.accessToken });
  check('Báo cáo vận hành không trộn chỉ tiêu đã lưu trữ', archivedReport.data.every(item => item.code !== qaTargetCode));
  await request(`/targets/${qaTargetId}/publish`, { method: 'POST', token: admin.accessToken, expected: [409] });
  checks.push('Chỉ tiêu đã lưu trữ không thể được công bố lại bằng API');
  await request(`/targets/${qaTargetId}/progress`, { method: 'POST', token: admin.accessToken, expected: [409], body: { value: 10, note: 'Không được báo cáo sau lưu trữ', baseVersion: archivedTarget.data.version } });
  checks.push('Chỉ tiêu lưu trữ không nhận báo cáo mới');
  const restoredTarget = await request(`/targets/${qaTargetId}/unarchive`, { method: 'POST', token: admin.accessToken, expected: [201], body: { reason: 'Khôi phục để xác nhận QA', expectedVersion: archivedTarget.data.version, expectedPublicationVersion: archivedTarget.data.publicationVersion } });
  check('Khôi phục chỉ tiêu trở về nội bộ và yêu cầu công bố lại', restoredTarget.data.isArchived === false && restoredTarget.data.isPublic === false);
  await request(`/targets/${qaTargetId}`, {
    method: 'PATCH', token: admin.accessToken, expected: [400],
    body: { isPublic: true, expectedVersion: restoredTarget.data.version, expectedPublicationVersion: restoredTarget.data.publicationVersion },
  });
  checks.push('Không thể bật công khai bằng API chỉnh sửa để dùng lại bản chụp cũ');

  await request('/imports/template?year=2101', { token: admin.accessToken, expected: [400] });
  await request('/exports/targets.xlsx?year=2101', { token: admin.accessToken, expected: [400] });
  checks.push('Biểu mẫu nhập và báo cáo xuất dùng cùng giới hạn năm kế hoạch 2000–2100');

  await request(`/targets?departmentId=${encodeURIComponent(vhxh.id)}`, { token: staff.accessToken, expected: [403] });
  checks.push('STAFF không thể đổi bộ lọc sang phòng khác');
  await request('/users', { token: manager.accessToken, expected: [403] });
  checks.push('MANAGER không đọc danh sách tài khoản');
  await request('/settings', { token: manager.accessToken, expected: [403] });
  checks.push('MANAGER không đọc cấu hình hệ thống');
  await request('/audit-logs', { token: manager.accessToken, expected: [403] });
  checks.push('Nhật ký chỉ dành cho ADMIN');

  const audit = await request('/audit-logs?page=1&pageSize=10', { token: admin.accessToken });
  check('ADMIN đọc được nhật ký có phân trang', Array.isArray(audit.data.items) && audit.data.pageSize === 10);
  await request('/audit-logs?fromDate=2026-02-30', { token: admin.accessToken, expected: [400] });
  checks.push('Ngày lọc nhật ký không tồn tại bị từ chối');
  await request('/feedbacks?page=1.5&pageSize=20', { token: admin.accessToken, expected: [400] });
  checks.push('Phân trang phản ánh từ chối số thập phân');

  await request(`/departments/${ktht.id}`, { method: 'PATCH', token: admin.accessToken, expected: [409], body: { expectedVersion: ktht.version, isActive: false } });
  checks.push('Không thể ngừng phòng ban còn dữ liệu vận hành');

  await request(`/users/${admin.user.id}`, { method: 'PATCH', token: admin.accessToken, expected: [403], body: { expectedVersion: admin.user.version, isActive: false } });
  checks.push('ADMIN không thể tự khóa tài khoản');

  await request(`/users/${admin.user.id}`, {
    method: 'PATCH', token: admin.accessToken, expected: [403],
    body: { expectedVersion: admin.user.version, password: 'Blocked@1234' },
  });
  checks.push('ADMIN không thể tự đặt lại mật khẩu qua API quản lý tài khoản');

  qaInactiveAdminUsername = `qa.inactive-admin.${Date.now()}`;
  const extraAdmin = await request('/users', {
    method: 'POST', token: admin.accessToken, expected: [201],
    body: {
      username: qaInactiveAdminUsername,
      password: 'Start@1234',
      fullName: 'Quản trị viên ngừng hoạt động dùng cho QA',
      role: 'ADMIN',
    },
  });
  qaInactiveAdminId = extraAdmin.data.id;
  const inactiveAdmin = await request(`/users/${qaInactiveAdminId}`, {
    method: 'PATCH', token: admin.accessToken, expected: [200],
    body: { expectedVersion: extraAdmin.data.version, isActive: false },
  });
  const reassignedInactiveAdmin = await request(`/users/${qaInactiveAdminId}`, {
    method: 'PATCH', token: admin.accessToken, expected: [200],
    body: { expectedVersion: inactiveAdmin.data.version, role: 'VIEWER', departmentId: ktht.id },
  });
  check('Có thể chuyển vai trò quản trị viên đã khóa mà vẫn giữ nguyên quản trị viên hoạt động cuối cùng', reassignedInactiveAdmin.data.role === 'VIEWER' && reassignedInactiveAdmin.data.isActive === false);

  qaUsername = `qa.access.${Date.now()}`;
  await request('/users', {
    method: 'POST', token: admin.accessToken, expected: [400],
    body: {
      username: `qa.weak.${Date.now()}`,
      password: 'password',
      fullName: 'Tài khoản mật khẩu yếu',
      role: 'STAFF',
      departmentId: ktht.id,
    },
  });
  checks.push('Tạo và đặt lại tài khoản dùng cùng chính sách mật khẩu mạnh');

  const created = await request('/users', {
    method: 'POST', token: admin.accessToken, expected: [201],
    body: {
      username: qaUsername,
      password: 'Start@1234',
      fullName: 'Tài khoản kiểm thử quyền',
      email: `${qaUsername}@example.com`,
      role: 'STAFF',
      departmentId: ktht.id,
    },
  });
  qaUserId = created.data.id;
  check('ADMIN tạo tài khoản đúng phòng ban', created.data.departmentId === ktht.id && !('passwordHash' in created.data));

  const blockingFeedback = await prisma.feedback.create({
    data: {
      code: `PA-QA-${Date.now()}`,
      lookupSecretHash: 'qa-not-for-login',
      title: 'Phản ánh kiểm thử ràng buộc phân công',
      content: 'Hồ sơ giả lập để xác nhận không thể khóa cán bộ khi còn việc đang xử lý.',
      category: 'OTHER',
      status: 'ASSIGNED',
      submitterName: 'QA',
      submitterPhone: '0900000000',
      consentAcceptedAt: new Date(),
      scopeConfirmedAt: new Date(),
      consentPolicyVersion: 'qa-test-v1',
      departmentId: ktht.id,
      assignedToId: qaUserId,
    },
  });
  qaFeedbackId = blockingFeedback.id;
  await request(`/users/${qaUserId}`, {
    method: 'PATCH', token: admin.accessToken, expected: [409], body: { expectedVersion: created.data.version, isActive: false },
  });
  checks.push('Không thể khóa cán bộ còn phản ánh đang xử lý');
  await prisma.feedback.delete({ where: { id: qaFeedbackId } });

  const qaLogin = await login(qaUsername, 'Start@1234');
  await request('/auth/change-password', {
    method: 'POST', token: qaLogin.accessToken, expected: [400],
    body: { currentPassword: 'Sai@1234', newPassword: 'Changed@1234' },
  });
  await request('/auth/me', { token: qaLogin.accessToken });
  checks.push('Sai mật khẩu hiện tại không làm mất phiên');

  const changed = await request('/auth/change-password', {
    method: 'POST', token: qaLogin.accessToken, expected: [201],
    body: { currentPassword: 'Start@1234', newPassword: 'Changed@1234' },
  });
  check('Đổi mật khẩu trả phiên mới', Boolean(changed.data.accessToken) && changed.data.user.id === qaUserId);
  await request('/auth/me', { token: qaLogin.accessToken, expected: [401] });
  await request('/auth/me', { token: changed.data.accessToken });
  checks.push('Đổi mật khẩu thu hồi token cũ nhưng giữ token mới');
  const postChangeLogin = await login(qaUsername, 'Changed@1234');
  checks.push('Đăng nhập được bằng mật khẩu mới');

  const usersBeforeLock = await request('/users', { token: admin.accessToken });
  const currentQaUser = usersBeforeLock.data.find(item => item.id === qaUserId);
  const lockedUser = await request(`/users/${qaUserId}`, {
    method: 'PATCH', token: admin.accessToken, expected: [200], body: { expectedVersion: currentQaUser.version, isActive: false },
  });
  await request('/auth/me', { token: postChangeLogin.accessToken, expected: [401] });
  await request(`/users/${qaUserId}`, {
    method: 'PATCH', token: admin.accessToken, expected: [200], body: { expectedVersion: lockedUser.data.version, isActive: true },
  });
  await request('/auth/me', { token: postChangeLogin.accessToken, expected: [401] });
  const afterUnlockLogin = await login(qaUsername, 'Changed@1234');
  check('Khóa rồi mở không làm token cũ sống lại', Boolean(afterUnlockLogin.accessToken));

  const importHistory = await request('/imports', { token: staff.accessToken });
  check('Lịch sử Excel của STAFF không lộ payload', importHistory.data.every(item => !('changes' in item) && !('errors' in item) && item.createdBy === staff.user.username));

  const otherScopeTargets = await request('/targets', { token: otherManager.accessToken });
  check('MANAGER chỉ nhận chỉ tiêu phòng mình', otherScopeTargets.data.every(item => item.departmentId === otherManager.user.departmentId));

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
    additionalUserIds: [qaInactiveAdminId, qaUserId].filter(Boolean),
    entityIds: [qaFeedbackId, qaTargetId].filter(Boolean),
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
      users: cleanupSummary?.userIds.length ?? 0,
      audits: cleanupSummary?.auditIds.length ?? 0,
      residual: { feedbacks: 0, targets: 0, users: 0, audits: 0 },
    },
  }, null, 2));
}
