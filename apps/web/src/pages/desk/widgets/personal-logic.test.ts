import assert from 'node:assert/strict';
import test from 'node:test';
import { countdownParts, dateLine, dueReminders, focusStart, focusTick, greetingFor, mergeTodos, monthGrid, type FocusState, type TodoItem } from './personal-logic';

const at = (value: string) => new Date(value);

test('lời chào theo giờ Việt Nam: sáng 4:00–10:59, trưa 11:00–13:59, chiều 14:00–17:59, tối còn lại', () => {
  assert.equal(greetingFor(at('2026-10-27T04:00:00+07:00')), 'Chào buổi sáng');
  assert.equal(greetingFor(at('2026-10-27T10:59:00+07:00')), 'Chào buổi sáng');
  assert.equal(greetingFor(at('2026-10-27T11:00:00+07:00')), 'Chào buổi trưa');
  assert.equal(greetingFor(at('2026-10-27T14:00:00+07:00')), 'Chào buổi chiều');
  assert.equal(greetingFor(at('2026-10-27T17:59:00+07:00')), 'Chào buổi chiều');
  assert.equal(greetingFor(at('2026-10-27T18:00:00+07:00')), 'Chào buổi tối');
  assert.equal(greetingFor(at('2026-10-27T03:59:00+07:00')), 'Chào buổi tối');
});

test('dòng ngày: thứ, ngày dương, ngày âm kèm can chi', () => {
  assert.equal(dateLine(at('2026-10-27T09:00:00+07:00'), true), 'Thứ Ba, 27/10/2026 · 18/9 Bính Ngọ');
  assert.equal(dateLine(at('2026-11-01T09:00:00+07:00'), false), 'Chủ nhật, 01/11/2026');
});

test('đếm ngược: tách ngày giờ phút giây; đã tới thì báo xong; chưa đặt mốc thì không có', () => {
  const now = at('2026-10-27T10:00:00+07:00');
  assert.deepEqual(countdownParts('2026-10-29T12:30:15+07:00', now), { done: false, days: 2, hours: 2, minutes: 30, seconds: 15 });
  assert.deepEqual(countdownParts('2026-10-27T09:00:00+07:00', now), { done: true, days: 0, hours: 0, minutes: 0, seconds: 0 });
  assert.equal(countdownParts(null, now), null);
  assert.equal(countdownParts('không phải ngày', now), null);
});

const item = (id: string, patch: Partial<TodoItem> = {}): TodoItem => ({ id, text: id, done: false, ...patch });

test('việc riêng: xung đột thì giữ bản đang sửa trên máy này, thêm việc mới từ nơi khác, không hồi sinh việc đã xoá', () => {
  const local = [item('a', { done: true }), item('c')];
  const remote = [item('a'), item('b'), item('d')];
  const merged = mergeTodos(local, remote, new Set(['b']));
  assert.deepEqual(merged.map(entry => [entry.id, entry.done]), [['a', true], ['c', false], ['d', false]]);
});

test('nhắc việc: tới giờ nhắc mà chưa xong, chưa nhắc; bỏ việc đã xong, đã nhắc, nhắc quá cũ (hơn 12 giờ)', () => {
  const now = at('2026-10-27T10:00:00+07:00');
  const items = [
    item('due', { remindAt: '2026-10-27T09:59:00+07:00' }),
    item('later', { remindAt: '2026-10-27T11:00:00+07:00' }),
    item('done', { remindAt: '2026-10-27T09:00:00+07:00', done: true }),
    item('seen', { remindAt: '2026-10-27T09:30:00+07:00' }),
    item('stale', { remindAt: '2026-10-26T20:00:00+07:00' }),
  ];
  assert.deepEqual(dueReminders(items, now, new Set(['seen@2026-10-27T09:30:00+07:00'])).map(entry => entry.id), ['due']);
});

test('tập trung: bắt đầu phiên làm việc, hết giờ chuyển sang nghỉ và cộng một phiên, hết nghỉ về chờ', () => {
  const t0 = at('2026-10-27T09:00:00+07:00').getTime();
  let state: FocusState = focusStart({ phase: 'idle', endsAt: null, pausedLeft: null, rounds: 0 }, t0, 25, 5);
  assert.deepEqual(state, { phase: 'work', endsAt: t0 + 25 * 60_000, pausedLeft: null, rounds: 0 });
  let step = focusTick(state, t0 + 10 * 60_000, 25, 5);
  assert.equal(step.event, null);
  step = focusTick(state, t0 + 25 * 60_000 + 500, 25, 5);
  assert.equal(step.event, 'work-done');
  state = step.state;
  assert.deepEqual(state, { phase: 'break', endsAt: t0 + 25 * 60_000 + 500 + 5 * 60_000, pausedLeft: null, rounds: 1 });
  step = focusTick(state, state.endsAt! + 1, 25, 5);
  assert.equal(step.event, 'break-done');
  assert.deepEqual(step.state, { phase: 'idle', endsAt: null, pausedLeft: null, rounds: 1 });
});

test('tập trung: đang tạm dừng thì không chạy giờ', () => {
  const paused: FocusState = { phase: 'work', endsAt: null, pausedLeft: 60_000, rounds: 2 };
  assert.deepEqual(focusTick(paused, Date.now() + 3_600_000, 25, 5), { state: paused, event: null });
});

test('lịch tháng: 6 tuần bắt đầu từ thứ Hai, đánh dấu ngày trong tháng', () => {
  const cells = monthGrid(2026, 10);
  assert.equal(cells.length, 42);
  assert.deepEqual(cells[0], { year: 2026, month: 9, day: 28, inMonth: false });
  assert.deepEqual(cells[3], { year: 2026, month: 10, day: 1, inMonth: true });
  assert.equal(cells.filter(cell => cell.inMonth).length, 31);
  assert.deepEqual(cells[41], { year: 2026, month: 11, day: 8, inMonth: false });
});
