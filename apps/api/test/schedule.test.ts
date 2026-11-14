import test from 'node:test';
import assert from 'node:assert/strict';
import { DepartmentKind, Role } from '@prisma/client';
import { addDays, canEditSchedule, scheduleView, sortEntries, vietnamToday, weekStartOf } from '../src/schedule';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('tuần luôn bắt đầu từ thứ Hai, kể cả khi ngày đưa vào là Chủ nhật', () => {
  assert.equal(weekStartOf('2026-11-13'), '2026-11-09'); // thứ Sáu
  assert.equal(weekStartOf('2026-11-09'), '2026-11-09'); // thứ Hai
  assert.equal(weekStartOf('2026-11-15'), '2026-11-09'); // Chủ nhật
  assert.equal(weekStartOf('2027-01-01'), '2026-12-28'); // vắt qua năm
  assert.equal(addDays('2026-12-28', 6), '2027-01-03');
  assert.throws(() => weekStartOf('2026-02-30'));
  assert.throws(() => weekStartOf('13/11/2026'));
});

test('ngày hôm nay tính theo giờ Việt Nam', () => {
  assert.equal(vietnamToday(new Date('2026-11-13T16:59:00.000Z')), '2026-11-13');
  assert.equal(vietnamToday(new Date('2026-11-13T17:00:00.000Z')), '2026-11-14');
});

test('chỉ quản trị, lãnh đạo, văn thư và cán bộ Văn phòng được lập lịch', () => {
  for (const role of [Role.ADMIN, Role.LEADER, Role.CLERK]) assert.equal(canEditSchedule({ role }, null), true);
  assert.equal(canEditSchedule({ role: Role.MANAGER }, DepartmentKind.OFFICE), true);
  assert.equal(canEditSchedule({ role: Role.STAFF }, DepartmentKind.OFFICE), true);
  assert.equal(canEditSchedule({ role: Role.MANAGER }, DepartmentKind.SPECIALIZED), false);
  assert.equal(canEditSchedule({ role: Role.STAFF }, null), false);
  assert.equal(canEditSchedule({ role: Role.VIEWER }, DepartmentKind.OFFICE), false);
});

const entry = (id: string, date: string, session: string, startTime: string | null, isPublic = true, sortOrder = 0) => ({
  id, date: day(date), session, startTime, content: `Việc ${id}`, leader: 'Chủ tịch UBND', location: null,
  participants: id === 'b' ? 'Thành phần nội bộ' : null, isPublic, sortOrder,
});

test('dòng lịch xếp theo ngày, buổi rồi giờ', () => {
  const sorted = sortEntries([
    entry('pm', '2026-11-09', 'PM', '14:00'),
    entry('am2', '2026-11-09', 'AM', '09:30'),
    entry('next', '2026-11-10', 'AM', '08:00'),
    entry('all', '2026-11-09', 'ALLDAY', null),
    entry('am1', '2026-11-09', 'AM', '08:00'),
  ]);
  assert.deepEqual(sorted.map(item => item.id), ['all', 'am1', 'am2', 'pm', 'next']);
});

test('bản công khai không lộ dòng nội bộ, ghi chú nội bộ, mã bản ghi', () => {
  const schedule = {
    id: 's1', weekStart: day('2026-11-09'), title: 'Lịch tuần 46', note: 'Ghi chú nội bộ', isPublic: true,
    publishedAt: new Date('2026-11-08T03:00:00.000Z'), fileName: 'lich.pdf', fileSize: 1234, version: 3,
    updatedAt: new Date('2026-11-08T03:00:00.000Z'),
    entries: [entry('a', '2026-11-09', 'AM', '08:00'), entry('b', '2026-11-09', 'PM', '14:00', false)],
  };
  const publicView = scheduleView(schedule, 'public') as Record<string, unknown> & { entries: Record<string, unknown>[] };
  assert.equal(publicView.entries.length, 1);
  assert.equal(publicView.entries[0].content, 'Việc a');
  assert.equal('id' in publicView.entries[0], false);
  assert.equal('note' in publicView, false);
  assert.equal('version' in publicView, false);
  assert.deepEqual(publicView.file, { name: 'lich.pdf', size: 1234 });
  assert.equal(publicView.weekEnd, '2026-11-15');
  const staffView = scheduleView(schedule, 'staff') as Record<string, unknown> & { entries: Record<string, unknown>[] };
  assert.equal(staffView.entries.length, 2);
  assert.equal(staffView.note, 'Ghi chú nội bộ');
  assert.equal(staffView.entries[1].isPublic, false);
});
