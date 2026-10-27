import { createCanvas } from '@napi-rs/canvas';
import { PrismaClient } from '@prisma/client';
import { cleanupQaActors, createQaActors } from './qa-actors.mjs';

// Kiểm thử API Bàn làm việc số trên máy chủ đang chạy: hồ sơ, không gian, khoá phiên bản, phạm vi phòng, trạng thái
// widget. Tài khoản QA tạo riêng rồi xoá hết (bàn làm việc của họ xoá dây chuyền theo tài khoản).

try {
  process.loadEnvFile?.();
} catch {
  // Bộ kiểm thử vẫn chạy được khi DATABASE_URL được truyền trực tiếp.
}
const baseUrl = process.env.QA_API_URL || 'http://localhost:3000/api';
if (!process.env.DATABASE_URL) {
  const databaseUser = process.env.POSTGRES_USER || 'ioc_admin';
  const databaseName = process.env.POSTGRES_DB || 'ioc_laithieu';
  if (!process.env.POSTGRES_PASSWORD) {
    throw new Error('Thiếu POSTGRES_PASSWORD trong .env hoặc DATABASE_URL cho bộ kiểm thử bàn làm việc');
  }
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(databaseUser)}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@localhost:5432/${encodeURIComponent(databaseName)}?schema=public`;
}
const prisma = new PrismaClient();
const checks = [];
let qaActors = null;

function check(name, condition, details = '') {
  if (!condition) throw new Error(`${name}: ${details || 'không đạt'}`);
  checks.push(name);
}

async function request(path, { method = 'GET', token, body, expected = [200], raw = false } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined || isForm ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: isForm ? body : JSON.stringify(body) }),
  });
  if (raw) {
    if (!expected.includes(response.status)) throw new Error(`${method} ${path}: ${response.status}`);
    return response;
  }
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
  if (!expected.includes(response.status)) throw new Error(`${method} ${path}: ${response.status} - ${JSON.stringify(data)}`);
  return { status: response.status, data };
}

async function login(username, password) {
  return (await request('/auth/login', { method: 'POST', expected: [201], body: { username, password } })).data.accessToken;
}

const widget = (id, type, settings = {}) => ({ id, type, title: null, settings, style: {} });

async function profileAndSpaces(tokens) {
  const first = (await request('/desk', { token: tokens.staff })).data;
  check('Lần đầu mở có bàn làm việc dựng sẵn một không gian "Hằng ngày"', first.spaces.length === 1 && first.spaces[0].name === 'Hằng ngày', JSON.stringify(first.spaces.map(space => space.name)));
  check('Chuyên viên chỉ được chọn phòng của mình', first.focusDepartments.length === 1 && first.focusDepartments[0].id === qaActors.departments.primary.id);
  check('Không gian của chuyên viên luôn xem phòng mình', first.spaces[0].config.focusDepartmentId === qaActors.departments.primary.id);

  const again = (await request('/desk', { token: tokens.staff })).data;
  check('Mở lại không tạo thêm không gian', again.spaces.length === 1 && again.spaces[0].id === first.spaces[0].id);

  const saved = (await request('/desk/profile', { method: 'PUT', token: tokens.staff, body: { config: { ...first.profile.config, startPage: 'work' }, expectedVersion: first.profile.version } })).data;
  check('Lưu hồ sơ tăng phiên bản', saved.version === first.profile.version + 1);
  await request('/desk/profile', { method: 'PUT', token: tokens.staff, expected: [409], body: { config: first.profile.config, expectedVersion: first.profile.version } });
  checks.push('Hồ sơ gửi bằng phiên bản cũ bị từ chối (409)');
  const afterProfile = (await request('/desk', { token: tokens.staff })).data;
  check('Hồ sơ đã lưu đọc lại đúng', afterProfile.profile.config.startPage === 'work');

  const space = first.spaces[0];
  const withTeam = { ...space.config, widgets: [...space.config.widgets, widget('w_qateam0001', 'dept.team')] };
  const spaceSaved = (await request(`/desk/spaces/${space.id}`, { method: 'PUT', token: tokens.staff, body: { config: withTeam, expectedVersion: space.version } })).data;
  check('Lưu không gian tăng phiên bản', spaceSaved.version === space.version + 1);
  const reread = (await request('/desk', { token: tokens.staff })).data.spaces[0];
  check('Widget ngoài quyền (nhân sự trong phòng) không được lưu cho chuyên viên', !reread.config.widgets.some(item => item.type === 'dept.team'));
  await request(`/desk/spaces/${space.id}`, { method: 'PUT', token: tokens.staff, expected: [409], body: { config: space.config, expectedVersion: space.version } });
  checks.push('Không gian gửi bằng phiên bản cũ bị từ chối (409)');

  const created = [];
  for (let index = 1; index < 12; index += 1) {
    created.push((await request('/desk/spaces', { method: 'POST', token: tokens.staff, expected: [201], body: { name: `Không gian ${index}`, icon: 'appstore' } })).data);
  }
  check('Tạo được tới 12 không gian', created.length === 11);
  await request('/desk/spaces', { method: 'POST', token: tokens.staff, expected: [400], body: { name: 'Thừa', icon: 'appstore' } });
  checks.push('Không gian thứ 13 bị từ chối');

  const copy = created[0];
  const ordered = (await request('/desk', { token: tokens.staff })).data.spaces.map(item => item.id).reverse();
  await request('/desk/spaces/order', { method: 'POST', token: tokens.staff, expected: [201], body: { ids: ordered } });
  const reordered = (await request('/desk', { token: tokens.staff })).data.spaces.map(item => item.id);
  check('Sắp xếp lại thứ tự không gian', JSON.stringify(reordered) === JSON.stringify(ordered));

  await request(`/desk/spaces/${copy.id}`, { method: 'DELETE', token: tokens.manager, expected: [404] });
  checks.push('Không xoá được không gian của người khác');
  for (const item of created) await request(`/desk/spaces/${item.id}`, { method: 'DELETE', token: tokens.staff });
  await request(`/desk/spaces/${space.id}`, { method: 'DELETE', token: tokens.staff, expected: [400] });
  checks.push('Không xoá được không gian cuối cùng');

  const duplicated = (await request('/desk/spaces', { method: 'POST', token: tokens.staff, expected: [201], body: { name: 'Bản sao', icon: 'copy', copyFromId: space.id } })).data;
  const duplicatedIds = duplicated.config.widgets.map(item => item.id);
  check('Nhân bản không gian sinh mã widget mới', duplicatedIds.length === reread.config.widgets.length && duplicatedIds.every(id => !reread.config.widgets.some(item => item.id === id)));

  const manager = (await request('/desk', { token: tokens.manager })).data;
  check('Trưởng phòng có không gian Hằng ngày và Giao ban', manager.spaces.map(item => item.name).join('|') === 'Hằng ngày|Giao ban');
  const forced = { ...manager.spaces[0].config, focusDepartmentId: qaActors.departments.secondary.id };
  await request(`/desk/spaces/${manager.spaces[0].id}`, { method: 'PUT', token: tokens.manager, body: { config: forced, expectedVersion: manager.spaces[0].version } });
  const managerAfter = (await request('/desk', { token: tokens.manager })).data;
  check('Người thuộc phòng không đổi được phòng đang xem sang phòng khác', managerAfter.spaces[0].config.focusDepartmentId === qaActors.departments.primary.id);

  const admin = (await request('/desk', { token: tokens.admin })).data;
  check('Quản trị chọn được mọi phòng đang hoạt động', admin.focusDepartments.length >= 2);

  const staffCatalog = (await request('/desk/catalog', { token: tokens.staff })).data;
  const managerCatalog = (await request('/desk/catalog', { token: tokens.manager })).data;
  check('Sổ widget lọc theo vai trò', !staffCatalog.some(item => item.type === 'dept.team') && managerCatalog.some(item => item.type === 'dept.team'));

  const reset = (await request('/desk/reset', { method: 'POST', token: tokens.staff, expected: [201] })).data;
  check('Khôi phục mẫu đưa về một không gian Hằng ngày', reset.spaces.length === 1 && reset.spaces[0].name === 'Hằng ngày' && reset.profile.config.startPage === 'desk');
}

async function widgetState(tokens) {
  const empty = (await request('/desk/widgets/w_qastate001/state', { token: tokens.staff })).data;
  check('Trạng thái widget chưa có trả rỗng', empty.state === null && empty.version === 0);
  const saved = (await request('/desk/widgets/w_qastate001/state', { method: 'PUT', token: tokens.staff, body: { state: { text: 'Ghi chú QA' }, expectedVersion: 0 } })).data;
  check('Lưu trạng thái widget lần đầu', saved.version === 1);
  const read = (await request('/desk/widgets/w_qastate001/state', { token: tokens.staff })).data;
  check('Đọc lại trạng thái widget đúng nội dung', read.state?.text === 'Ghi chú QA' && read.version === 1);
  await request('/desk/widgets/w_qastate001/state', { method: 'PUT', token: tokens.staff, expected: [409], body: { state: { text: 'cũ' }, expectedVersion: 0 } });
  checks.push('Trạng thái widget gửi bằng phiên bản cũ bị từ chối (409)');
  const other = (await request('/desk/widgets/w_qastate001/state', { token: tokens.manager })).data;
  check('Người khác không đọc được trạng thái widget của mình', other.state === null && other.version === 0);
  await request('/desk/widgets/bad id/state', { token: tokens.staff, expected: [400] });
  checks.push('Mã widget sai khuôn bị từ chối');
  await request('/desk/widgets/w_qastate002/state', { method: 'PUT', token: tokens.staff, expected: [400], body: { state: { text: 'x'.repeat(70 * 1024) }, expectedVersion: 0 } });
  checks.push('Trạng thái widget quá 64 KB bị từ chối');
}

async function pngFile(width, height, name) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0ea5e9';
  ctx.fillRect(0, 0, width, height);
  const form = new FormData();
  form.append('file', new Blob([await canvas.encode('png')], { type: 'image/png' }), name);
  return form;
}

async function assets(tokens) {
  const uploaded = (await request('/desk/assets', { method: 'POST', token: tokens.staff, expected: [201], body: await pngFile(3200, 1800, 'Ảnh nền phòng.png') })).data;
  check('Tải ảnh lên được thu nhỏ về cạnh dài 2560', uploaded.width === 2560 && uploaded.height === 1440, JSON.stringify(uploaded));
  check('Tên ảnh tiếng Việt giữ đúng, bỏ đuôi tệp', uploaded.name === 'Ảnh nền phòng', uploaded.name);
  const again = (await request('/desk/assets', { method: 'POST', token: tokens.staff, expected: [201], body: await pngFile(3200, 1800, 'lại.png') })).data;
  check('Tải lại đúng ảnh cũ không tạo bản trùng', again.id === uploaded.id);
  const response = await request(`/desk/assets/${uploaded.id}`, { token: tokens.staff, raw: true });
  const etag = response.headers.get('etag');
  check('Ảnh trả về WebP kèm ETag', response.headers.get('content-type') === 'image/webp' && Boolean(etag));
  const cached = await fetch(`${baseUrl}/desk/assets/${uploaded.id}`, { headers: { authorization: `Bearer ${tokens.staff}`, 'if-none-match': etag } });
  if (cached.status !== 304) throw new Error(`ETag không cho 304: ${cached.status}`);
  checks.push('Ảnh không đổi trả 304 theo ETag');
  await request(`/desk/assets/${uploaded.id}`, { token: tokens.manager, raw: true, expected: [404] });
  checks.push('Người khác không xem được ảnh riêng');
  await request(`/desk/assets/${uploaded.id}`, { method: 'PATCH', token: tokens.staff, expected: [403], body: { isShared: true } });
  checks.push('Chuyên viên không đăng được ảnh dùng chung');
  const bad = new FormData();
  bad.append('file', new Blob([Buffer.from('%PDF-1.7 không phải ảnh')], { type: 'image/png' }), 'gia-mao.png');
  await request('/desk/assets', { method: 'POST', token: tokens.staff, expected: [400], body: bad });
  checks.push('Tệp đội lốt ảnh bị từ chối');

  const adminAsset = (await request('/desk/assets', { method: 'POST', token: tokens.admin, expected: [201], body: await pngFile(1200, 800, 'Toàn cảnh phường.png') })).data;
  const shared = (await request(`/desk/assets/${adminAsset.id}`, { method: 'PATCH', token: tokens.admin, body: { isShared: true } })).data;
  check('Quản trị đăng ảnh dùng chung', shared.isShared === true);
  const list = (await request('/desk/assets', { token: tokens.staff })).data;
  check('Chuyên viên thấy ảnh dùng chung và ảnh của mình', list.shared.some(item => item.id === adminAsset.id) && list.mine.some(item => item.id === uploaded.id) && list.usedBytes > 0);
  await request(`/desk/assets/${adminAsset.id}`, { token: tokens.staff, raw: true });
  checks.push('Chuyên viên tải được ảnh dùng chung');
  await request(`/desk/assets/${adminAsset.id}`, { method: 'DELETE', token: tokens.staff, expected: [404] });
  checks.push('Chuyên viên không xoá được ảnh dùng chung');
  await request(`/desk/assets/${adminAsset.id}`, { method: 'DELETE', token: tokens.admin });
  await request(`/desk/assets/${uploaded.id}`, { method: 'DELETE', token: tokens.staff });
  await request(`/desk/assets/${uploaded.id}`, { token: tokens.staff, raw: true, expected: [404] });
  checks.push('Xoá ảnh xong không còn tải được');
}

async function departmentData(tokens) {
  const primary = qaActors.departments.primary.id;
  const secondary = qaActors.departments.secondary.id;
  const pack = (await request(`/desk/data/department?departmentId=${primary}&year=2026`, { token: tokens.admin })).data;
  check('Gói dữ liệu phòng có đủ phần cho widget', pack.department?.id === primary && typeof pack.totals?.targets === 'number' && Array.isArray(pack.deadlines) && Array.isArray(pack.team) && Array.isArray(pack.documents) && pack.feedback?.counts);
  const overview = (await request(`/ioc/overview?year=2026&departmentId=${primary}`, { token: tokens.admin })).data;
  check('Số liệu gói phòng khớp Trung tâm điều hành cùng phòng', pack.totals.targets === overview.totals.targets && pack.totals.progress === overview.totals.progress && pack.alerts.length === overview.alerts.length);
  await request('/desk/data/department?year=2026', { token: tokens.admin, expected: [400] });
  checks.push('Vai trò toàn địa phương phải chọn phòng');
  const own = (await request('/desk/data/department?year=2026', { token: tokens.staff })).data;
  check('Chuyên viên không truyền phòng thì xem phòng mình', own.department.id === primary);
  await request(`/desk/data/department?departmentId=${secondary}&year=2026`, { token: tokens.staff, expected: [403] });
  checks.push('Chuyên viên không xem được gói dữ liệu phòng khác');
  const foreign = await prisma.target.findFirst({ where: { departmentId: secondary, year: 2026, isArchived: false }, select: { id: true } });
  const mine = await prisma.target.findFirst({ where: { departmentId: primary, year: 2026, isArchived: false }, select: { id: true } });
  if (foreign && mine) {
    const series = (await request(`/desk/data/series?ids=${foreign.id},${mine.id}&year=2026`, { token: tokens.staff })).data;
    check('Chuỗi số liệu bỏ chỉ tiêu phòng khác', series.targets.length === 1 && series.targets[0].id === mine.id);
  }
  await request('/desk/data/series?ids=a,b,c,d,e,f,g', { token: tokens.staff, expected: [400] });
  checks.push('Chuỗi số liệu tối đa 6 chỉ tiêu');
  const list = (await request('/desk/data/targets?year=2026', { token: tokens.staff })).data;
  const departments = await prisma.target.findMany({ where: { id: { in: list.map(item => item.id) } }, select: { departmentId: true } });
  check('Danh sách chọn chỉ tiêu chỉ trong phòng mình', list.length > 0 && departments.every(item => item.departmentId === primary));
  if (foreign && mine) {
    const byIds = (await request(`/desk/data/targets?ids=${mine.id},${foreign.id}`, { token: tokens.staff })).data;
    check('Tra tên chỉ tiêu theo mã chỉ trả chỉ tiêu được xem', byIds.length === 1 && byIds[0].id === mine.id && typeof byIds[0].title === 'string');
  }
  const two = await prisma.target.findMany({ where: { departmentId: primary, year: 2026, isArchived: false }, select: { id: true }, orderBy: { code: 'asc' }, take: 2 });
  if (two.length === 2) {
    const ordered = (await request(`/desk/data/targets?ids=${two[1].id},${two[0].id}`, { token: tokens.staff })).data;
    check('Tra theo mã giữ đúng thứ tự đã chọn', ordered.map(item => item.id).join() === `${two[1].id},${two[0].id}`);
  }
  // Widget "Chỉ tiêu theo dõi" ở chế độ tự động
  if (mine) {
    const before = await prisma.target.findUnique({ where: { id: mine.id }, select: { assigneeId: true } });
    await prisma.target.update({ where: { id: mine.id }, data: { assigneeId: qaActors.staff.id } });
    try {
      const assigned = (await request('/desk/data/targets?year=2026&mode=mine', { token: tokens.staff })).data;
      check('Theo dõi "tôi phụ trách" trả đúng chỉ tiêu được giao', assigned.length === 1 && assigned[0].id === mine.id && assigned[0].assigneeName === qaActors.staff.fullName);
    } finally {
      await prisma.target.update({ where: { id: mine.id }, data: { assigneeId: before?.assigneeId ?? null } });
    }
  }
  const risk = (await request(`/desk/data/targets?year=2026&mode=risk&take=3&departmentId=${primary}`, { token: tokens.admin })).data;
  check(
    'Theo dõi "tiến độ thấp nhất" bỏ thống kê và đã xong, tăng dần, đủ số dòng',
    risk.length <= 3 && risk.every((item, index) => item.kind !== 'STAT' && item.status !== 'COMPLETED' && (index === 0 || risk[index - 1].progress <= item.progress)),
    JSON.stringify(risk.map(item => [item.code, item.kind, item.status, item.progress])),
  );
  const overdue = (await request('/desk/data/targets?year=2026&mode=overdue&take=20', { token: tokens.staff })).data;
  const overdueDepartments = await prisma.target.findMany({ where: { id: { in: overdue.map(item => item.id) } }, select: { departmentId: true } });
  check('Theo dõi "quá hạn" chỉ có chỉ tiêu quá hạn của phòng mình', overdue.every(item => item.status === 'OVERDUE') && overdueDepartments.every(item => item.departmentId === primary));
  await request('/desk/data/targets?mode=lung-tung', { token: tokens.staff, expected: [400] });
  await request('/desk/data/targets?mode=risk&take=0', { token: tokens.staff, expected: [400] });
  checks.push('Chế độ hoặc số dòng sai bị từ chối');
}

async function runSuite() {
  qaActors = await createQaActors(prisma, 'desk');
  const [admin, manager, staff] = await Promise.all([
    login(qaActors.admin.username, qaActors.password),
    login(qaActors.manager.username, qaActors.password),
    login(qaActors.staff.username, qaActors.password),
  ]);
  const tokens = { admin, manager, staff };
  await profileAndSpaces(tokens);
  await widgetState(tokens);
  await assets(tokens);
  await departmentData(tokens);
}

let failure = null;
try {
  await runSuite();
} catch (error) {
  failure = error instanceof Error ? error : new Error(String(error));
}
try {
  await cleanupQaActors(prisma, qaActors);
} catch (error) {
  failure = failure ?? (error instanceof Error ? error : new Error(String(error)));
}
await prisma.$disconnect().catch(() => undefined);

if (failure) {
  console.error(JSON.stringify({ ok: false, checks: checks.length, passed: checks, error: failure.message }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, checks: checks.length, details: checks }, null, 2));
}
