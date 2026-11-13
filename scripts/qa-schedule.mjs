// Kiểm tra API Lịch làm việc trên hệ thống đang chạy (CSDL thử). Dùng tuần xa trong tương lai rồi dọn sau khi chạy.
//   QA_API_URL=http://localhost:3100/api QA_ADMIN_PASSWORD=... QA_USER_PASSWORD=... node scripts/qa-schedule.mjs
const API = process.env.QA_API_URL ?? 'http://localhost:3000/api';
const ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD ?? process.env.DEMO_ADMIN_PASSWORD;
const USER_PASSWORD = process.env.QA_USER_PASSWORD ?? process.env.DEMO_USER_PASSWORD;
const WEEK = '2031-03-03'; // thứ Hai
const PREVIOUS = '2031-02-24';
let failed = 0;

function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ĐẠT ' : 'LỖI '} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

async function call(path, { token, method = 'GET', body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API}${path}`, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const type = response.headers.get('content-type') ?? '';
  return { status: response.status, type, data: type.includes('json') ? await response.json() : await response.arrayBuffer() };
}

async function login(username, password) {
  const result = await call('/auth/login', { method: 'POST', body: { username, password } });
  if (result.status !== 201 && result.status !== 200) throw new Error(`Không đăng nhập được ${username}: ${result.status}`);
  return result.data.accessToken;
}

const entry = (date, session, startTime, content, isPublic = true) => ({ date, session, startTime, content, leader: 'Chủ tịch UBND', location: 'Phòng họp số 1', isPublic });

async function cleanup(token) {
  for (const week of [WEEK, PREVIOUS]) {
    const current = await call(`/schedules?week=${week}`, { token });
    if (!current.data.schedule) continue;
    await call(`/schedules/${week}/visibility`, { token, method: 'POST', body: { isPublic: false } });
    if (current.data.schedule.file) await call(`/schedules/${week}/file`, { token, method: 'DELETE' });
    await call(`/schedules/${week}`, { token, method: 'PUT', body: { entries: [] } });
  }
}

const office = await login('chanh.vp', USER_PASSWORD);
const staff = await login('thao.ktht', USER_PASSWORD);
const admin = await login('admin', ADMIN_PASSWORD);
await cleanup(admin);

try {
  const view = await call(`/schedules?week=2031-03-06`, { token: staff });
  check('Chuyên viên xem được lịch, tuần tự quy về thứ Hai', view.status === 200 && view.data.weekStart === WEEK && view.data.canEdit === false);
  check('Trưởng Văn phòng được lập lịch', (await call(`/schedules?week=${WEEK}`, { token: office })).data.canEdit === true);

  const denied = await call(`/schedules/${WEEK}`, { token: staff, method: 'PUT', body: { entries: [] } });
  check('Chuyên viên phòng chuyên môn không lưu được lịch', denied.status === 403, String(denied.status));

  const notMonday = await call('/schedules/2031-03-04', { token: office, method: 'PUT', body: { entries: [] } });
  check('Tuần phải bắt đầu từ thứ Hai', notMonday.status === 400, String(notMonday.status));

  const outside = await call(`/schedules/${WEEK}`, { token: office, method: 'PUT', body: { entries: [entry('2031-03-10', 'AM', '08:00', 'Ngoài tuần')] } });
  check('Từ chối dòng lịch ngoài tuần', outside.status === 400, String(outside.status));

  const saved = await call(`/schedules/${WEEK}`, {
    token: office, method: 'PUT',
    body: { entries: [entry('2031-03-04', 'PM', '14:00', 'Họp nội bộ', false), entry('2031-03-03', 'AM', '08:00', 'Tiếp công dân định kỳ'), entry('2031-03-03', 'ALLDAY', undefined, 'Kiểm tra cơ sở')] },
  });
  check('Lưu lịch tuần', saved.status === 200 && saved.data.entries.length === 3, JSON.stringify(saved.data).slice(0, 200));
  check('Dòng lịch xếp theo ngày, buổi, giờ', saved.data.entries?.map(item => item.content).join('|') === 'Kiểm tra cơ sở|Tiếp công dân định kỳ|Họp nội bộ');

  const stale = await call(`/schedules/${WEEK}`, { token: office, method: 'PUT', body: { expectedVersion: saved.data.version + 5, entries: [] } });
  check('Phiên bản cũ bị từ chối', stale.status === 409, String(stale.status));

  const hidden = await call(`/public/schedule?week=${WEEK}`);
  check('Chưa công khai thì người dân không thấy', hidden.status === 200 && hidden.data.schedule === null);

  const published = await call(`/schedules/${WEEK}/visibility`, { token: office, method: 'POST', body: { isPublic: true } });
  check('Công khai tuần', published.status === 201 || published.status === 200, String(published.status));
  const open = await call(`/public/schedule?week=${WEEK}`);
  const publicEntries = open.data.schedule?.entries ?? [];
  check('Trang công khai chỉ có dòng công khai', publicEntries.length === 2 && publicEntries.every(item => item.content !== 'Họp nội bộ'));
  check('Trang công khai không lộ mã bản ghi, ghi chú nội bộ', !('id' in (publicEntries[0] ?? {})) && !('note' in (open.data.schedule ?? {})) && !('version' in (open.data.schedule ?? {})));

  const pdf = new Blob([new TextEncoder().encode('%PDF-1.4\n%QA\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')], { type: 'application/pdf' });
  const form = new FormData();
  form.append('file', pdf, 'Lịch tuần 10.pdf');
  const uploaded = await call(`/schedules/${WEEK}/file`, { token: office, method: 'POST', form });
  check('Đính kèm tệp lịch PDF, giữ tên tiếng Việt', (uploaded.status === 201 || uploaded.status === 200) && uploaded.data.file?.name === 'Lịch tuần 10.pdf', JSON.stringify(uploaded.data).slice(0, 160));
  const notPdf = new FormData();
  notPdf.append('file', new Blob(['xin chào'], { type: 'application/pdf' }), 'gia.pdf');
  check('Từ chối tệp không phải PDF', (await call(`/schedules/${WEEK}/file`, { token: office, method: 'POST', form: notPdf })).status === 400);
  const download = await call(`/public/schedule/${WEEK}/file`);
  check('Người dân tải được tệp lịch đã công khai', download.status === 200 && download.type.includes('pdf'));

  const copied = await call(`/schedules/${WEEK}/copy-previous`, { token: office, method: 'POST' });
  check('Không chép đè khi tuần đã có lịch (hoặc tuần trước trống)', copied.status === 409 || copied.status === 404, String(copied.status));
  await call(`/schedules/${PREVIOUS}`, { token: office, method: 'PUT', body: { entries: [entry('2031-02-27', 'AM', '08:00', 'Tiếp công dân định kỳ')] } });
  const emptied = await call(`/schedules/${WEEK}`, { token: office, method: 'PUT', body: { entries: [] } });
  check('Xoá hết dòng của tuần', emptied.status === 200 && emptied.data.entries.length === 0);
  const copy = await call(`/schedules/${WEEK}/copy-previous`, { token: office, method: 'POST' });
  check('Chép lịch tuần trước, ngày lùi đúng 7 ngày', (copy.status === 201 || copy.status === 200) && copy.data.entries?.[0]?.date === '2031-03-06', JSON.stringify(copy.data).slice(0, 160));

  await call(`/schedules/${WEEK}/visibility`, { token: office, method: 'POST', body: { isPublic: false } });
  check('Ngừng công khai thì tệp không còn tải được', (await call(`/public/schedule/${WEEK}/file`)).status === 404);
} finally {
  await cleanup(admin);
}
console.log(failed ? `\n${failed} mục LỖI` : '\nTất cả đạt');
process.exit(failed ? 1 : 0);
