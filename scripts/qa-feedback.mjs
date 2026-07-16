import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { cleanupQaActors, createQaActors, qaActorIds } from './qa-actors.mjs';

const baseUrl = process.env.QA_API_URL || 'http://localhost:3000/api';
try {
  process.loadEnvFile?.();
} catch {
  // The suite can still run when DATABASE_URL is supplied explicitly by CI.
}
if (!process.env.DATABASE_URL) {
  const databaseUser = process.env.POSTGRES_USER || 'ioc_admin';
  const databaseName = process.env.POSTGRES_DB || 'ioc_laithieu';
  if (!process.env.POSTGRES_PASSWORD) {
    throw new Error('Thiếu POSTGRES_PASSWORD trong .env hoặc DATABASE_URL cho bộ kiểm thử phản ánh');
  }
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(databaseUser)}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@localhost:5432/${encodeURIComponent(databaseName)}?schema=public`;
}

const prisma = new PrismaClient();
const createdFeedbackIds = new Set();
const checks = [];
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
  const payload = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : await response.text();
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path}: nhận ${response.status}, mong ${expected.join('/')} - ${JSON.stringify(payload)}`);
  }
  return { status: response.status, data: payload };
}

async function login(username, password) {
  const { data } = await request('/auth/login', {
    method: 'POST',
    body: { username, password },
    expected: [201],
  });
  return data;
}

function newSubmission(overrides = {}) {
  return {
    clientSubmissionId: randomUUID(),
    lookupSecret: randomBytes(20).toString('hex').toUpperCase(),
    title: 'QA - Đèn chiếu sáng tại tuyến đường thử nghiệm',
    content: 'Đèn chiếu sáng công cộng tại vị trí kiểm thử không hoạt động trong nhiều ngày.',
    category: 'INFRASTRUCTURE',
    submitterName: 'Người dân kiểm thử',
    submitterPhone: '0901234567',
    submitterEmail: 'qa.citizen@example.com',
    address: 'Địa chỉ QA sẽ được xóa sau kiểm thử',
    preferredContact: 'EMAIL',
    consent: true,
    scopeConfirmed: true,
    ...overrides,
  };
}

async function createFeedback(body) {
  const created = await request('/public/feedbacks', {
    method: 'POST',
    expected: [201],
    body,
  });
  const stored = await prisma.feedback.findUnique({
    where: { code: created.data.code },
    select: { id: true },
  });
  if (!stored) throw new Error(`Không tìm thấy ID của phản ánh QA ${created.data.code}`);
  createdFeedbackIds.add(stored.id);
  return created.data;
}

async function findFeedback(code, token) {
  const result = await request(`/feedbacks?search=${encodeURIComponent(code)}`, { token });
  check(`Tìm thấy hồ sơ ${code}`, result.data.total === 1);
  return result.data.items[0];
}

async function assignAndStart(feedback, { admin, staff, department, assignee, priority = 'NORMAL' }) {
  const assigned = await request(`/feedbacks/${feedback.id}/assign`, {
    method: 'POST',
    token: admin.accessToken,
    expected: [201],
    body: {
      expectedVersion: feedback.version,
      departmentId: department.id,
      assignedToId: assignee.id,
      priority,
      note: 'Phân công hồ sơ cho cán bộ trong kịch bản QA',
    },
  });
  return (await request(`/feedbacks/${feedback.id}/start`, {
    method: 'POST',
    token: staff.accessToken,
    expected: [201],
    body: { expectedVersion: assigned.data.version },
  })).data;
}

async function cleanupBusinessData() {
  const ids = [...createdFeedbackIds];
  if (ids.length) await prisma.feedback.deleteMany({ where: { id: { in: ids } } });
}

async function assertCleanupPostconditions() {
  const actorIds = qaActorIds(qaActors);
  const feedbackIds = [...createdFeedbackIds];
  const [feedbacks, users, audits] = await Promise.all([
    feedbackIds.length ? prisma.feedback.count({ where: { id: { in: feedbackIds } } }) : 0,
    actorIds.length ? prisma.user.count({ where: { id: { in: actorIds } } }) : 0,
    actorIds.length || feedbackIds.length
      ? prisma.auditLog.count({
          where: {
            OR: [
              ...(actorIds.length ? [{ actorId: { in: actorIds } }] : []),
              ...(feedbackIds.length ? [{ entityId: { in: feedbackIds } }] : []),
            ],
          },
        })
      : 0,
  ]);
  if (feedbacks || users || audits) {
    throw new Error(`Dữ liệu QA còn sót: feedbacks=${feedbacks}, users=${users}, audits=${audits}`);
  }
  return { feedbacks, users, audits };
}

async function runSuite() {
  qaActors = await createQaActors(prisma, 'feedback');
  const [admin, manager, staff, viewer, otherManager] = await Promise.all([
    login(qaActors.admin.username, qaActors.password),
    login(qaActors.manager.username, qaActors.password),
    login(qaActors.staff.username, qaActors.password),
    login(qaActors.viewer.username, qaActors.password),
    login(qaActors.otherManager.username, qaActors.password),
  ]);
  check('Đăng nhập đủ 5 tài khoản kiểm thử', [admin, manager, staff, viewer, otherManager].every(item => item.accessToken));

  await request('/public/feedbacks', {
    method: 'POST',
    expected: [400],
    body: newSubmission({ submitterPhone: '12345' }),
  });
  checks.push('Số điện thoại không hợp lệ bị từ chối');

  await request('/public/feedbacks', {
    method: 'POST',
    expected: [400],
    body: newSubmission({ preferredContact: 'EMAIL', submitterEmail: '' }),
  });
  checks.push('Chọn liên hệ qua email bắt buộc phải có địa chỉ email');

  const mainSubmission = newSubmission();
  const created = await createFeedback(mainSubmission);
  check(
    'Tạo phản ánh trả đúng biên nhận do trình duyệt nắm giữ',
    created.lookupSecret === mainSubmission.lookupSecret && created.status === 'RECEIVED',
  );

  const replay = await request('/public/feedbacks', {
    method: 'POST',
    expected: [201],
    body: mainSubmission,
  });
  check(
    'Gửi lại cùng mã idempotency khôi phục đúng biên nhận, không tạo hồ sơ trùng',
    replay.data.code === created.code && replay.data.lookupSecret === created.lookupSecret,
  );
  await request('/public/feedbacks', {
    method: 'POST',
    expected: [409],
    body: { ...mainSubmission, lookupSecret: randomBytes(20).toString('hex').toUpperCase() },
  });
  checks.push('Không thể chiếm biên nhận idempotency bằng mã bảo mật khác');

  await request('/public/feedbacks/track', {
    method: 'POST',
    expected: [404],
    body: { code: created.code, lookupSecret: randomBytes(20).toString('hex').toUpperCase() },
  });
  checks.push('Secret sai không đọc được hồ sơ');

  let feedback = await findFeedback(created.code, admin.accessToken);
  const duplicateList = await request(`/feedbacks?search=${encodeURIComponent(created.code)}`, { token: admin.accessToken });
  check('Idempotency chỉ lưu đúng một hồ sơ', duplicateList.data.total === 1);

  await request('/feedbacks?assignedToMe=khong-hop-le', { token: admin.accessToken, expected: [400] });
  checks.push('Bộ lọc việc được giao từ chối giá trị không phải boolean');

  const managerBeforeAssign = await request(`/feedbacks?search=${encodeURIComponent(created.code)}`, { token: manager.accessToken });
  check('Phòng ban không thấy hồ sơ chưa phân công', managerBeforeAssign.data.total === 0);

  const departments = await request('/departments', { token: admin.accessToken });
  const targetDepartment = departments.data.find(item => item.id === qaActors.departments.primary.id);
  check('Tìm được phòng ban xử lý QA', Boolean(targetDepartment));

  const triaged = await request(`/feedbacks/${feedback.id}/triage`, {
    method: 'POST',
    token: admin.accessToken,
    expected: [201],
    body: { expectedVersion: feedback.version, category: 'INFRASTRUCTURE', priority: 'HIGH', note: 'Phân loại tự động trong kiểm thử QA' },
  });
  feedback = triaged.data;
  check('Phân loại có khóa phiên bản', feedback.version === 2 && feedback.priority === 'HIGH');

  const assignees = await request(`/feedbacks/assignees?departmentId=${targetDepartment.id}`, { token: admin.accessToken });
  const assignee = assignees.data.find(item => item.username === qaActors.staff.username);
  check('Danh sách giao việc chỉ trả cán bộ hợp lệ', Boolean(assignee));

  const managerAssignees = await request('/feedbacks/assignees', { token: manager.accessToken });
  check('Trưởng phòng chỉ thấy cán bộ cùng phòng', managerAssignees.data.length > 0 && managerAssignees.data.every(item => item.departmentId === manager.user.departmentId));

  const assigned = await request(`/feedbacks/${feedback.id}/assign`, {
    method: 'POST',
    token: admin.accessToken,
    expected: [201],
    body: {
      expectedVersion: feedback.version,
      departmentId: targetDepartment.id,
      assignedToId: assignee.id,
      priority: 'HIGH',
      note: 'Giao cán bộ kiểm tra hiện trường trong quy trình QA',
    },
  });
  feedback = assigned.data;
  check('Phân công giữ SLA và tăng phiên bản', feedback.status === 'ASSIGNED' && feedback.version === 3 && Boolean(feedback.dueAt));

  await request(`/feedbacks/${feedback.id}`, { token: otherManager.accessToken, expected: [404] });
  checks.push('Trưởng phòng khác không đọc được hồ sơ');

  const staffList = await request(`/feedbacks?search=${encodeURIComponent(created.code)}`, { token: staff.accessToken });
  check('Cán bộ thấy việc được giao', staffList.data.total === 1 && staffList.data.items[0].assignedToId === staff.user.id);

  const viewerDetail = await request(`/feedbacks/${feedback.id}`, { token: viewer.accessToken });
  check(
    'Người chỉ xem nhận dữ liệu đã che',
    viewerDetail.data.submitterPhone.includes('***')
      && viewerDetail.data.address === null
      && viewerDetail.data.title === 'Phản ánh trong phạm vi đơn vị'
      && viewerDetail.data.content.includes('giới hạn'),
  );

  await request(`/feedbacks/${feedback.id}/start`, {
    method: 'POST',
    token: viewer.accessToken,
    expected: [403],
    body: { expectedVersion: feedback.version },
  });
  checks.push('VIEWER không thể xử lý hồ sơ');

  const started = await request(`/feedbacks/${feedback.id}/start`, {
    method: 'POST',
    token: staff.accessToken,
    expected: [201],
    body: { expectedVersion: feedback.version },
  });
  feedback = started.data;
  check('Cán bộ bắt đầu xử lý đúng trạng thái', feedback.status === 'IN_PROGRESS' && feedback.version === 4);

  await request(`/feedbacks/${feedback.id}/contact-attempt`, {
    method: 'POST',
    token: staff.accessToken,
    expected: [201],
    body: {
      expectedVersion: feedback.version,
      channel: 'PHONE',
      outcome: 'NO_ANSWER',
      note: 'Gọi lần đầu nhưng người dân chưa nghe máy.',
    },
  });
  feedback = (await request(`/feedbacks/${feedback.id}`, { token: staff.accessToken })).data;
  check(
    'Lần liên hệ không thành công được ghi nhận nhưng chưa tính là phản hồi đầu tiên',
    feedback.firstResponseAt === null
      && feedback.events.some(item => item.action === 'CONTACT_ATTEMPT_LOGGED' && item.metadata?.outcome === 'NO_ANSWER'),
  );

  await request(`/feedbacks/${feedback.id}/contact-attempt`, {
    method: 'POST',
    token: staff.accessToken,
    expected: [201],
    body: {
      expectedVersion: feedback.version,
      channel: 'EMAIL',
      outcome: 'MESSAGE_SENT',
      note: 'Đã gửi hướng dẫn bổ sung thông tin qua email đăng ký.',
    },
  });
  feedback = (await request(`/feedbacks/${feedback.id}`, { token: staff.accessToken })).data;
  check(
    'Liên hệ thành công thiết lập mốc phản hồi đầu tiên và lưu kênh liên hệ',
    Boolean(feedback.firstResponseAt)
      && feedback.events.some(item => item.action === 'CONTACT_ATTEMPT_LOGGED' && item.metadata?.channel === 'EMAIL' && item.metadata?.outcome === 'MESSAGE_SENT'),
  );

  await request(`/feedbacks/${feedback.id}/request-information`, {
    method: 'POST',
    token: staff.accessToken,
    expected: [201],
    body: { expectedVersion: feedback.version, message: 'Vui lòng bổ sung mô tả vị trí cột đèn gần nhất.' },
  });
  let tracked = (await request('/public/feedbacks/track', {
    method: 'POST',
    expected: [201],
    body: { code: created.code, lookupSecret: created.lookupSecret },
  })).data;
  check('Người dân thấy yêu cầu bổ sung', tracked.status === 'WAITING_CITIZEN' && tracked.messages.some(item => item.body.includes('cột đèn')));
  check(
    'Tra cứu công dân nhận đủ mốc SLA chờ bổ sung',
    Boolean(tracked.firstResponseDueAt) && Boolean(tracked.firstResponseAt) && Boolean(tracked.waitingCitizenAt) && Boolean(tracked.citizenResponseDueAt),
  );
  check(
    'Nhật ký liên hệ nội bộ không lộ trên dòng thời gian công dân',
    tracked.events.every(item => item.action !== 'CONTACT_ATTEMPT_LOGGED'),
  );

  const waitingSnapshot = {
    waitingCitizenAt: tracked.waitingCitizenAt,
    citizenResponseDueAt: tracked.citizenResponseDueAt,
    dueAt: tracked.dueAt,
  };
  const reassignedWaiting = await request(`/feedbacks/${feedback.id}/assign`, {
    method: 'POST',
    token: admin.accessToken,
    expected: [201],
    body: {
      expectedVersion: tracked.version,
      departmentId: targetDepartment.id,
      assignedToId: assignee.id,
      priority: 'HIGH',
      note: 'Xác nhận lại người phụ trách khi đang chờ người dân bổ sung',
    },
  });
  check(
    'Phân công lại khi chờ người dân không làm mất mốc tạm dừng SLA',
    reassignedWaiting.data.status === 'WAITING_CITIZEN'
      && reassignedWaiting.data.waitingCitizenAt === waitingSnapshot.waitingCitizenAt
      && reassignedWaiting.data.citizenResponseDueAt === waitingSnapshot.citizenResponseDueAt
      && reassignedWaiting.data.dueAt === waitingSnapshot.dueAt,
  );

  tracked = (await request(`/public/feedbacks/${created.code}/messages`, {
    method: 'POST',
    expected: [201],
    body: {
      lookupSecret: created.lookupSecret,
      expectedVersion: reassignedWaiting.data.version,
      message: 'Vị trí nằm cạnh số nhà QA-01, ngay đầu tuyến đường thử nghiệm.',
    },
  })).data;
  check(
    'Bổ sung của người dân nối lại xử lý và kết thúc thời gian tạm dừng SLA',
    tracked.status === 'IN_PROGRESS'
      && tracked.waitingCitizenAt === null
      && tracked.citizenResponseDueAt === null
      && new Date(tracked.dueAt).getTime() >= new Date(waitingSnapshot.dueAt).getTime(),
  );

  await request(`/feedbacks/${feedback.id}/submit-resolution`, {
    method: 'POST',
    token: staff.accessToken,
    expected: [400],
    body: { expectedVersion: tracked.version, summary: '            ' },
  });
  checks.push('Kết quả toàn khoảng trắng bị từ chối');

  const resolutionDraft = 'Đơn vị đã kiểm tra, thay bộ nguồn và khôi phục hoạt động của đèn chiếu sáng.';
  const submitted = await request(`/feedbacks/${feedback.id}/submit-resolution`, {
    method: 'POST',
    token: staff.accessToken,
    expected: [201],
    body: { expectedVersion: tracked.version, summary: resolutionDraft },
  });
  feedback = submitted.data;
  check('Kết quả của cán bộ phải chờ duyệt', feedback.status === 'PENDING_REVIEW');

  const pendingPublic = (await request('/public/feedbacks/track', {
    method: 'POST',
    expected: [201],
    body: { code: created.code, lookupSecret: created.lookupSecret },
  })).data;
  check(
    'Bản dự thảo chờ duyệt không lộ cho người dân',
    pendingPublic.status === 'PENDING_REVIEW'
      && pendingPublic.resolutionSummary === null
      && !JSON.stringify(pendingPublic).includes(resolutionDraft),
  );
  check(
    'Dòng thời gian công dân không lộ ghi chú nội bộ',
    pendingPublic.events.some(item => item.action === 'FEEDBACK_SUBMITTED_FOR_REVIEW')
      && pendingPublic.events.every(item => !Object.prototype.hasOwnProperty.call(item, 'note')),
  );

  await request(`/feedbacks/${feedback.id}/messages`, {
    method: 'POST',
    token: staff.accessToken,
    expected: [409],
    body: { expectedVersion: feedback.version, visibility: 'PUBLIC', body: 'Không được bỏ qua bước duyệt nội dung.' },
  });
  checks.push('Không thể gửi phản hồi công khai để bỏ qua bước duyệt');

  await request(`/feedbacks/${feedback.id}/review`, {
    method: 'POST',
    token: staff.accessToken,
    expected: [403],
    body: { expectedVersion: feedback.version, decision: 'APPROVE' },
  });
  checks.push('Cán bộ không có quyền tự duyệt');

  const returned = await request(`/feedbacks/${feedback.id}/review`, {
    method: 'POST',
    token: manager.accessToken,
    expected: [201],
    body: {
      expectedVersion: feedback.version,
      decision: 'RETURN',
      note: 'Cần làm rõ biện pháp khắc phục và thời điểm hoàn thành.',
    },
  });
  check('Lãnh đạo có thể trả kết quả về cán bộ hoàn thiện', returned.data.status === 'IN_PROGRESS');
  const returnedPublic = (await request('/public/feedbacks/track', {
    method: 'POST',
    expected: [201],
    body: { code: created.code, lookupSecret: created.lookupSecret },
  })).data;
  check(
    'Lý do trả lại nội bộ và bản dự thảo vẫn không lộ cho người dân',
    returnedPublic.status === 'IN_PROGRESS'
      && returnedPublic.resolutionSummary === null
      && returnedPublic.events.every(item => item.action !== 'RESOLUTION_RETURNED')
      && !JSON.stringify(returnedPublic).includes('Cần làm rõ biện pháp'),
  );
  const resubmitted = await request(`/feedbacks/${feedback.id}/submit-resolution`, {
    method: 'POST',
    token: staff.accessToken,
    expected: [201],
    body: {
      expectedVersion: returned.data.version,
      summary: `${resolutionDraft} Hoàn thành và nghiệm thu trong ngày kiểm thử.`,
    },
  });
  feedback = resubmitted.data;
  check('Cán bộ có thể hoàn thiện và trình lại kết quả đã bị trả', feedback.status === 'PENDING_REVIEW');

  await request(`/feedbacks/${feedback.id}/review`, {
    method: 'POST',
    token: manager.accessToken,
    expected: [409],
    body: { expectedVersion: feedback.version - 1, decision: 'APPROVE' },
  });
  checks.push('Xung đột phiên bản trả 409');

  const approved = await request(`/feedbacks/${feedback.id}/review`, {
    method: 'POST',
    token: manager.accessToken,
    expected: [201],
    body: { expectedVersion: feedback.version, decision: 'APPROVE', note: 'Kết quả đạt yêu cầu QA' },
  });
  feedback = approved.data;
  check('Trưởng phòng duyệt kết quả', feedback.status === 'RESOLVED' && feedback.closureReason === 'RESOLVED');

  const rated = await request(`/public/feedbacks/${created.code}/rating`, {
    method: 'POST',
    expected: [201],
    body: { lookupSecret: created.lookupSecret, expectedVersion: feedback.version, rating: 5, comment: 'Phản hồi QA rõ ràng.' },
  });
  check('Người dân đánh giá và đóng hồ sơ', rated.data.status === 'CLOSED' && rated.data.rating === 5);
  await request(`/public/feedbacks/${created.code}/rating`, {
    method: 'POST',
    expected: [409],
    body: { lookupSecret: created.lookupSecret, expectedVersion: rated.data.version, rating: 1, comment: 'Không được đánh giá lần hai.' },
  });
  checks.push('Mỗi hồ sơ chỉ được đánh giá một lần');

  await request(`/feedbacks/${feedback.id}/publish`, {
    method: 'POST',
    token: admin.accessToken,
    expected: [409],
    body: {
      expectedVersion: feedback.version,
      publish: true,
      confirmAnonymized: true,
      title: 'Phản ánh chiếu sáng đã xử lý',
      summary: 'Đã khôi phục đèn chiếu sáng tại khu vực phản ánh.',
    },
  });
  checks.push('Công bố bằng phiên bản cũ bị chặn');

  await request(`/feedbacks/${feedback.id}/publish`, {
    method: 'POST',
    token: admin.accessToken,
    expected: [400],
    body: {
      expectedVersion: rated.data.version,
      publish: true,
      title: 'Phản ánh chiếu sáng đã xử lý',
      summary: 'Đã khôi phục đèn chiếu sáng tại khu vực phản ánh.',
    },
  });
  checks.push('Công bố bắt buộc xác nhận đã ẩn danh');

  await request(`/feedbacks/${feedback.id}/publish`, {
    method: 'POST',
    token: admin.accessToken,
    expected: [400],
    body: {
      expectedVersion: rated.data.version,
      publish: true,
      confirmAnonymized: true,
      title: 'Kết quả phản ánh của Người dân kiểm thử',
      summary: 'Đã liên hệ số 0901234567 và xử lý nội dung phản ánh.',
    },
  });
  checks.push('Bộ lọc PII chặn họ tên và số điện thoại trong nội dung công khai');

  await request(`/feedbacks/${feedback.id}/publish`, {
    method: 'POST',
    token: admin.accessToken,
    expected: [400],
    body: {
      expectedVersion: rated.data.version,
      publish: true,
      confirmAnonymized: true,
      title: 'Ket qua cua Nguoi   dan kiem thu',
      summary: 'Nội dung kết quả đã được xử lý nhưng tiêu đề còn dữ liệu nhận diện.',
    },
  });
  checks.push('Bộ lọc PII nhận diện họ tên dù bỏ dấu hoặc thay đổi khoảng trắng');

  let published = await request(`/feedbacks/${feedback.id}/publish`, {
    method: 'POST',
    token: admin.accessToken,
    expected: [201],
    body: {
      expectedVersion: rated.data.version,
      publish: true,
      confirmAnonymized: true,
      title: 'Phản ánh chiếu sáng đã xử lý',
      summary: 'Đã khôi phục đèn chiếu sáng tại khu vực phản ánh.',
    },
  });
  check('Admin công bố bản đã ẩn danh', published.data.isPublic === true);

  const publicItems = await request('/public/feedbacks/published');
  check('Danh sách công khai chỉ chứa snapshot', publicItems.data.some(item => item.code === created.code && !JSON.stringify(item).includes('0901234567')));

  const unpublished = await request(`/feedbacks/${feedback.id}/publish`, {
    method: 'POST',
    token: admin.accessToken,
    expected: [201],
    body: { expectedVersion: published.data.version, publish: false },
  });
  const publicItemsAfterUnpublish = await request('/public/feedbacks/published');
  check(
    'Gỡ công khai ẩn hồ sơ khỏi trang người dân nhưng giữ hồ sơ nội bộ',
    unpublished.data.isPublic === false && !publicItemsAfterUnpublish.data.some(item => item.code === created.code),
  );
  published = await request(`/feedbacks/${feedback.id}/publish`, {
    method: 'POST',
    token: admin.accessToken,
    expected: [201],
    body: {
      expectedVersion: unpublished.data.version,
      publish: true,
      confirmAnonymized: true,
      title: 'Phản ánh chiếu sáng đã xử lý',
      summary: 'Đã khôi phục đèn chiếu sáng tại khu vực phản ánh.',
    },
  });
  check('Có thể công khai lại bằng phiên bản mới sau khi gỡ', published.data.isPublic === true);

  const firstAppeal = await request(`/public/feedbacks/${created.code}/reopen`, {
    method: 'POST',
    expected: [201],
    body: {
      lookupSecret: created.lookupSecret,
      expectedVersion: published.data.version,
      reason: 'Tôi đề nghị kiểm tra lại vì hiện tượng chưa được khắc phục hoàn toàn.',
    },
  });
  check('Người dân tạo đề nghị xem xét lại', Boolean(firstAppeal.data.reopenRequestedAt) && firstAppeal.data.reopenRequestCount === 1);
  await request(`/public/feedbacks/${created.code}/reopen`, {
    method: 'POST',
    expected: [409],
    body: {
      lookupSecret: created.lookupSecret,
      expectedVersion: firstAppeal.data.version,
      reason: 'Không thể tạo thêm một đề nghị khi đề nghị trước vẫn đang chờ xử lý.',
    },
  });
  checks.push('Mỗi thời điểm chỉ có một đề nghị xem xét lại đang chờ');

  const rejectedAppeal = await request(`/feedbacks/${feedback.id}/reopen-request/reject`, {
    method: 'POST',
    token: manager.accessToken,
    expected: [201],
    body: {
      expectedVersion: firstAppeal.data.version,
      reason: 'Qua kiểm tra lần đầu, đơn vị chưa nhận được bằng chứng phát sinh mới.',
    },
  });
  check('Trưởng phòng từ chối đề nghị và lưu lý do', rejectedAppeal.data.reopenRequestDecision === 'REJECTED' && !rejectedAppeal.data.reopenRequestedAt);

  const secondAppeal = await request(`/public/feedbacks/${created.code}/reopen`, {
    method: 'POST',
    expected: [201],
    body: {
      lookupSecret: created.lookupSecret,
      expectedVersion: rejectedAppeal.data.version,
      reason: 'Tôi bổ sung thông tin mới và đề nghị đơn vị kiểm tra lại hiện trường.',
    },
  });
  check('Người dân có thể gửi lại đề nghị trong giới hạn cho phép', secondAppeal.data.reopenRequestCount === 2 && Boolean(secondAppeal.data.reopenRequestedAt));

  const reopened = await request(`/feedbacks/${feedback.id}/reopen`, {
    method: 'POST',
    token: manager.accessToken,
    expected: [201],
    body: { expectedVersion: secondAppeal.data.version, reason: 'Chấp thuận xem xét lại dựa trên thông tin mới của người dân.' },
  });
  check(
    'Chấp thuận đề nghị mở lại và xóa dữ liệu kết quả cũ',
    reopened.data.status === 'REOPENED'
      && reopened.data.reopenRequestDecision === 'APPROVED'
      && reopened.data.reopenRequestedAt === null
      && reopened.data.isPublic === false
      && reopened.data.rating === null
      && reopened.data.resolutionSummary === null
      && reopened.data.closureReason === null
      && Boolean(reopened.data.dueAt),
  );
  const publicItemsAfterReopen = await request('/public/feedbacks/published');
  check('Hồ sơ mở lại biến mất khỏi danh sách công khai', !publicItemsAfterReopen.data.some(item => item.code === created.code));

  const rejectedSubmission = newSubmission({
    title: 'QA - Phản ánh ngoài phạm vi tiếp nhận',
    content: 'Nội dung giả lập dùng để kiểm thử khả năng phục hồi hồ sơ bị từ chối tiếp nhận.',
    submitterPhone: '0912345678',
    submitterEmail: 'qa.rejected@example.com',
  });
  const rejectedCreated = await createFeedback(rejectedSubmission);
  let rejectedFeedback = await findFeedback(rejectedCreated.code, admin.accessToken);
  const rejected = await request(`/feedbacks/${rejectedFeedback.id}/reject`, {
    method: 'POST',
    token: admin.accessToken,
    expected: [201],
    body: {
      expectedVersion: rejectedFeedback.version,
      reason: 'Nội dung kiểm thử được xác định ngoài phạm vi tiếp nhận của kênh phản ánh.',
    },
  });
  rejectedFeedback = rejected.data;
  check('Hồ sơ ngoài phạm vi có lý do kết thúc riêng', rejectedFeedback.status === 'REJECTED' && rejectedFeedback.closureReason === 'OUT_OF_SCOPE');

  await prisma.feedback.update({
    where: { id: rejectedFeedback.id },
    data: { reopenRequestCount: 3 },
  });
  await request(`/public/feedbacks/${rejectedCreated.code}/reopen`, {
    method: 'POST',
    expected: [409],
    body: {
      lookupSecret: rejectedCreated.lookupSecret,
      expectedVersion: rejectedFeedback.version,
      reason: 'Yêu cầu thứ tư phải bị chặn bởi giới hạn số lần xem xét lại.',
    },
  });
  checks.push('Giới hạn tối đa ba lần đề nghị xem xét lại được thực thi');

  await prisma.feedback.update({
    where: { id: rejectedFeedback.id },
    data: { reopenRequestCount: 0 },
  });
  const recoveredRejected = await request(`/feedbacks/${rejectedFeedback.id}/reopen`, {
    method: 'POST',
    token: admin.accessToken,
    expected: [201],
    body: {
      expectedVersion: rejectedFeedback.version,
      reason: 'Khôi phục hồ sơ bị từ chối để xử lý lại sau khi rà soát phạm vi.',
    },
  });
  check(
    'Admin có thể phục hồi hồ sơ REJECTED về quy trình xử lý',
    recoveredRejected.data.status === 'REOPENED'
      && recoveredRejected.data.rejectionReason === null
      && recoveredRejected.data.closureReason === null,
  );

  const noResponseSubmission = newSubmission({
    title: 'QA - Hồ sơ quá hạn bổ sung thông tin',
    content: 'Nội dung giả lập dùng để kiểm thử kết thúc hồ sơ khi người dân không bổ sung đúng hạn.',
    submitterPhone: '0923456789',
    submitterEmail: 'qa.noresponse@example.com',
  });
  const noResponseCreated = await createFeedback(noResponseSubmission);
  let noResponseFeedback = await findFeedback(noResponseCreated.code, admin.accessToken);
  noResponseFeedback = await assignAndStart(noResponseFeedback, {
    admin,
    staff,
    department: targetDepartment,
    assignee,
  });
  await request(`/feedbacks/${noResponseFeedback.id}/request-information`, {
    method: 'POST',
    token: staff.accessToken,
    expected: [201],
    body: {
      expectedVersion: noResponseFeedback.version,
      message: 'Vui lòng bổ sung ảnh hiện trường và mốc địa chỉ trước thời hạn quy định.',
    },
  });
  noResponseFeedback = (await request(`/feedbacks/${noResponseFeedback.id}`, { token: manager.accessToken })).data;
  await prisma.feedback.update({
    where: { id: noResponseFeedback.id },
    data: { citizenResponseDueAt: new Date(Date.now() - 60_000) },
  });

  const expiredStats = (await request('/feedbacks/stats', { token: admin.accessToken })).data;
  const expiredQueue = await request(`/feedbacks?waitingCitizenExpired=true&search=${encodeURIComponent(noResponseCreated.code)}`, { token: admin.accessToken });
  check('Hồ sơ quá hạn bổ sung xuất hiện trong thống kê và hàng đợi', expiredStats.waitingCitizenExpired >= 1 && expiredQueue.data.total === 1);

  const noResponseClosed = await request(`/feedbacks/${noResponseFeedback.id}/close-no-response`, {
    method: 'POST',
    token: manager.accessToken,
    expected: [201],
    body: {
      expectedVersion: noResponseFeedback.version,
      note: 'Đã liên hệ theo kênh ưu tiên nhưng chưa nhận được thông tin bổ sung.',
    },
  });
  check(
    'Kết thúc quá hạn bổ sung dùng đúng lý do nghiệp vụ',
    noResponseClosed.data.status === 'CLOSED'
      && noResponseClosed.data.closureReason === 'NO_CITIZEN_RESPONSE'
      && noResponseClosed.data.citizenResponseDueAt === null,
  );

  const noResponsePublic = (await request('/public/feedbacks/track', {
    method: 'POST',
    expected: [201],
    body: { code: noResponseCreated.code, lookupSecret: noResponseCreated.lookupSecret },
  })).data;
  check(
    'Người dân thấy trạng thái và thông báo kết thúc do quá hạn bổ sung',
    noResponsePublic.status === 'CLOSED'
      && noResponsePublic.resolutionSummary.includes('quá thời hạn bổ sung thông tin')
      && noResponsePublic.events.some(item => item.action === 'FEEDBACK_CLOSED_NO_RESPONSE'),
  );

  const closedStats = (await request('/feedbacks/stats', { token: admin.accessToken })).data;
  check(
    'Đóng do không phản hồi không bị tính nhầm là đã giải quyết',
    closedStats.waitingCitizenExpired === expiredStats.waitingCitizenExpired - 1
      && closedStats.resolved === expiredStats.resolved,
  );

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
    entityIds: [...createdFeedbackIds],
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
      feedbacks: createdFeedbackIds.size,
      users: cleanupSummary?.userIds.length ?? 0,
      audits: cleanupSummary?.auditIds.length ?? 0,
      residual: { feedbacks: 0, users: 0, audits: 0 },
    },
  }, null, 2));
}
