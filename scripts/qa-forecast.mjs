import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { cleanupQaActors, createQaActors } from './qa-actors.mjs';

if (!process.env.DATABASE_URL) throw new Error('Cần DATABASE_URL riêng cho kiểm thử dự báo');
const base = process.env.QA_API_URL || 'http://localhost:3103/api', prisma = new PrismaClient(), checks = [];
let actors, leaderId, targetId, originalCrossView, adminToken; const modelIds = [], historyKeys = [];
async function request(path, { token, method = 'GET', body, form, expected = 200, binary = false } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const data = binary ? new Uint8Array(await response.arrayBuffer()) : response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data).slice(0, 500)}`); return data;
}
async function login(user) { return (await request('/auth/login', { method: 'POST', body: { username: user.username, password: actors.password }, expected: 201 })).accessToken; }
function check(name, condition) { assert.ok(condition, name); checks.push(name); }
function csvFile(text) { const form = new FormData(); form.set('file', new Blob([text], { type: 'text/csv' }), 'lich-su.csv'); return form; }

let failure;
try {
  actors = await createQaActors(prisma, 'forecast');
  const passwordHash = (await prisma.user.findUniqueOrThrow({ where: { id: actors.admin.id }, select: { passwordHash: true } })).passwordHash;
  const leader = await prisma.user.create({ data: { username: `qa.forecast.leader.${actors.runId}`, fullName: 'Lãnh đạo kiểm thử dự báo', passwordHash, role: 'LEADER' } }); leaderId = leader.id;
  const [admin, manager, staff, viewer, leadership] = await Promise.all([actors.admin, actors.manager, actors.staff, actors.viewer, leader].map(login));
  adminToken = admin;
  const initialSettings = await request('/settings', { token: admin }); originalCrossView = initialSettings.crossDepartmentView;
  if (originalCrossView === false) await request('/settings', { token: admin, method: 'PATCH', body: { expectedVersion: initialSettings.version, crossDepartmentView: true } });
  const year = new Date().getFullYear();
  const target = await prisma.target.create({ data: { code: `QA-FORECAST-${actors.runId}`, title: 'Kiểm thử dự báo thu ngân sách', unit: 'Triệu đồng', targetValue: 100, currentValue: 20, year, dueDate: new Date(Date.UTC(year + 1, 0, 1)), departmentId: actors.departments.secondary.id, frequency: 'MONTHLY' } }); targetId = target.id;
  await request('/forecast', { expected: 401 }); checks.push('Dự báo yêu cầu đăng nhập');
  for (const token of [manager, staff, viewer]) {
    const mine = await request(`/forecast?year=${year}&scope=mine`, { token });
    check('Dự báo Phòng tôi không có phòng khác', mine.items.every(row => row.departmentId === actors.departments.primary.id));
    const setting = await prisma.systemSetting.findUnique({ where: { id: 'default' } });
    if (setting?.crossDepartmentView !== false) {
      const all = await request(`/forecast?year=${year}&scope=all`, { token }); check('Bật liên phòng đọc dự báo phòng khác', all.items.some(row => row.targetId === targetId));
      const detail = await request(`/forecast/targets/${targetId}`, { token }); check('Hồ sơ dự báo liên phòng', detail.targetId === targetId && detail.probability >= 0 && detail.probability <= 1);
    } else await request(`/forecast/targets/${targetId}`, { token, expected: 403 });
    for (const path of ['/forecast/model', '/forecast/history/template']) await request(path, { token, expected: 403 });
    await request('/forecast/train', { token, method: 'POST', body: {}, expected: 403 });
    await request('/forecast/history', { token, method: 'POST', form: csvFile('Năm,Kỳ\n2024,2024-M01'), expected: 403 });
  }
  checks.push('Ma trận MANAGER/STAFF/VIEWER không huấn luyện hoặc nhập lịch sử');
  const settingsBeforeOff = await request('/settings', { token: admin });
  await request('/settings', { token: admin, method: 'PATCH', body: { expectedVersion: settingsBeforeOff.version, crossDepartmentView: false } });
  for (const token of [manager, staff, viewer]) {
    await request(`/forecast/targets/${targetId}`, { token, expected: 403 });
    await request(`/forecast?year=${year}&departmentId=${target.departmentId}`, { token, expected: 403 });
    const all = await request(`/forecast?year=${year}&scope=all`, { token }); check('Tắt liên phòng: scope all vẫn chỉ trả phòng mình', all.items.every(row => row.departmentId === actors.departments.primary.id));
  }
  const settingsAfterOff = await request('/settings', { token: admin });
  await request('/settings', { token: admin, method: 'PATCH', body: { expectedVersion: settingsAfterOff.version, crossDepartmentView: true } });
  const template = await request('/forecast/history/template', { token: admin, binary: true }); check('Tải biểu mẫu Excel thật', template[0] === 80 && template[1] === 75);
  const key = `qa-forecast-${actors.runId}`; historyKeys.push(key);
  const header = 'Năm,Mã chỉ tiêu,Tên chỉ tiêu,Kỳ,Giá trị,Mức giao,Ngày báo cáo,Hạn,Đơn vị,Chiều đánh giá,Loại bộ\n';
  const csv = header + `2024,${key},Chỉ tiêu QA,2024-M06,30,100,2024-06-15,2024-12-31,Đơn vị,HIGHER_IS_BETTER,PLAN\n2024,${key},Chỉ tiêu QA,2024-M12,70,100,2024-12-20,2024-12-31,Đơn vị,HIGHER_IS_BETTER,PLAN`;
  const imported = await request('/forecast/history', { token: leadership, method: 'POST', form: csvFile(csv), expected: 201 }); check('Lãnh đạo nhập lịch sử vào bảng huấn luyện riêng', imported.imported === 2);
  const duplicate = await request('/forecast/history', { token: admin, method: 'POST', form: csvFile(csv), expected: 201 }); check('Nhập lại idempotent', duplicate.imported === 0 && duplicate.duplicates === 2);
  const xlsxKey = `${key}-xlsx`; historyKeys.push(xlsxKey);
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('LICH_SU'); sheet.addRow(header.trim().split(',')); sheet.addRow([2024, xlsxKey, 'Chỉ tiêu Excel QA', '2024-M06', 40, 100, '2024-06-15', '2024-12-31', 'Đơn vị', 'HIGHER_IS_BETTER', 'PLAN']);
  const excelForm = new FormData(); excelForm.set('file', new Blob([await workbook.xlsx.writeBuffer()]), 'lich-su.xlsx');
  const importedExcel = await request('/forecast/history', { token: admin, method: 'POST', form: excelForm, expected: 201 }); check('Nhập Excel thật', importedExcel.imported === 1);
  await request('/forecast/history', { token: admin, method: 'POST', form: csvFile(csv.replace('2024-06-15', '2024-02-30')), expected: 400 }); checks.push('Tệp có ngày sai bị từ chối toàn bộ');
  for (const token of [admin, leadership]) {
    const trained = await request('/forecast/train', { token, method: 'POST', body: {}, expected: 201 }); modelIds.push(trained.id);
    check('Quản trị và lãnh đạo huấn luyện được', Boolean(trained.id) && trained.sampleCount >= 0 && (trained.trained ? trained.metrics && trained.testSamples > 0 : trained.metrics === null));
  }
  const model = await request('/forecast/model', { token: leadership }); check('Mô hình lưu phiên bản đặc trưng và nguồn mô phỏng', model.featureVersion === 'ioc-risk-v1' && model.importance.length === 17 && typeof model.simulatedSamples === 'number');
  const exported = await request(`/forecast/export?year=${year}&scope=all`, { token: staff, binary: true }); check('Xuất dự báo Excel theo quyền đọc', exported[0] === 80 && exported[1] === 75);
  const copilot = await request('/copilot/messages', { token: staff, method: 'POST', body: { message: `Dự báo chỉ tiêu nào có nguy cơ không đạt toàn địa phương năm ${year}` }, expected: 201 }); check('Jarvis đọc từ mô hình theo quyền', copilot.intent === 'FORECAST_RISK' && copilot.source.tool === 'forecastRisk');
  await request('/forecast?year=2101', { token: admin, expected: 400 }); await request('/forecast?risk=UNKNOWN', { token: admin, expected: 400 }); checks.push('DTO từ chối năm và bộ lọc không hợp lệ');
} catch (error) { failure = error; }
finally {
  try {
    if (adminToken && originalCrossView !== undefined) {
      const current = await request('/settings', { token: adminToken });
      if (current.crossDepartmentView !== originalCrossView) await request('/settings', { token: adminToken, method: 'PATCH', body: { expectedVersion: current.version, crossDepartmentView: originalCrossView } });
    }
    if (modelIds.length) await prisma.forecastModel.deleteMany({ where: { id: { in: modelIds } } });
    if (historyKeys.length) await prisma.forecastHistory.deleteMany({ where: { seriesKey: { in: historyKeys } } });
    if (targetId) await prisma.target.deleteMany({ where: { id: targetId } });
    if (actors) await cleanupQaActors(prisma, actors, { additionalUserIds: [leaderId].filter(Boolean), entityIds: [targetId, ...modelIds].filter(Boolean) });
  } catch (error) { failure = new Error(`${failure ? `${failure.message}; ` : ''}Dọn QA: ${error.message}`); }
  await prisma.$disconnect();
}
console.log(JSON.stringify({ ok: !failure, checks: checks.length, details: checks, ...(failure ? { error: failure.message } : {}) }, null, 2));
if (failure) process.exitCode = 1;
