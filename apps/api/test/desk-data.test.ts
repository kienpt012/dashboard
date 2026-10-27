import assert from 'node:assert/strict';
import test from 'node:test';
import { FrameworkKind, Role, TargetFrequency, TargetStatus, ValueSource } from '@prisma/client';
import { buildDeadlines, buildTeam, pickWatchlist, TtlCache } from '../src/desk/data';
import type { IocSnapshot } from '../src/ioc';

const DAY = 86_400_000;
const NOW = new Date('2026-10-15T10:00:00+07:00');

function item(partial: {
  id: string;
  code?: string;
  title?: string;
  status?: TargetStatus;
  dueDate?: Date;
  kind?: FrameworkKind;
  valueSource?: ValueSource;
  frequency?: TargetFrequency;
  assigneeId?: string | null;
  missingPeriods?: string[];
  explanation?: { id: string; dueAt: Date; message: string } | null;
  createdAt?: Date;
}) {
  return {
    target: {
      id: partial.id,
      code: partial.code ?? partial.id.toUpperCase(),
      title: partial.title ?? `Chỉ tiêu ${partial.id}`,
      dueDate: partial.dueDate ?? new Date('2026-12-31T16:59:59Z'),
      kind: partial.kind ?? FrameworkKind.PLAN,
      valueSource: partial.valueSource ?? ValueSource.COMPUTED,
      frequency: partial.frequency ?? TargetFrequency.YEARLY,
      year: 2026,
      reportDueDay: 20,
      createdAt: partial.createdAt ?? new Date('2026-01-01T00:00:00Z'),
      assigneeId: partial.assigneeId ?? null,
    },
    metric: { status: partial.status ?? TargetStatus.ON_TRACK, progress: 50 },
    isLeaf: true,
    missingPeriods: partial.missingPeriods ?? [],
    explanation: partial.explanation ?? null,
  };
}

function snapshot(items: ReturnType<typeof item>[], reported: Record<string, string[]> = {}) {
  return {
    now: NOW,
    evaluated: items,
    reportedByTarget: new Map(Object.entries(reported).map(([key, periods]) => [key, new Set(periods)])),
  } as unknown as IocSnapshot;
}

test('hạn sắp tới: gom hạn chỉ tiêu, hạn báo cáo kỳ, hạn giải trình, giờ tự thông qua; bỏ chỉ tiêu đã hoàn thành', () => {
  const snap = snapshot(
    [
      item({ id: 'due', dueDate: new Date(NOW.getTime() + 3 * DAY) }),
      item({ id: 'done', status: TargetStatus.COMPLETED, dueDate: new Date(NOW.getTime() - DAY) }),
      item({ id: 'expl', explanation: { id: 'e1', dueAt: new Date(NOW.getTime() + DAY), message: 'Vì sao chậm?' } }),
      item({ id: 'period', valueSource: ValueSource.MANUAL, frequency: TargetFrequency.MONTHLY, createdAt: new Date('2026-10-01T00:00:00+07:00') }),
    ],
  );
  const deadlines = buildDeadlines(snap, [{ id: 'p1', name: 'Đề xuất mới', autoApproveAt: new Date(NOW.getTime() + 2 * DAY) }], NOW, 30);
  assert.deepEqual(deadlines.map(entry => entry.kind), ['EXPLANATION_DUE', 'PROPOSAL_AUTO_APPROVE', 'TARGET_DUE', 'PERIOD_REPORT']);
  assert.equal(deadlines.find(entry => entry.kind === 'PERIOD_REPORT')?.link, '/admin/targets/period');
  assert.match(deadlines.find(entry => entry.kind === 'PERIOD_REPORT')!.title, /Tháng 10\/2026/);
  assert.ok(deadlines.every(entry => !entry.overdue));
});

test('hạn sắp tới: hạn đã qua mà chưa xong vẫn hiện, đánh dấu quá hạn; hạn ngoài khung xem trước thì không', () => {
  const snap = snapshot([
    item({ id: 'late', status: TargetStatus.OVERDUE, dueDate: new Date(NOW.getTime() - 2 * DAY) }),
    item({ id: 'far', dueDate: new Date(NOW.getTime() + 40 * DAY) }),
  ]);
  const deadlines = buildDeadlines(snap, [], NOW, 30);
  assert.deepEqual(deadlines.map(entry => [entry.kind, entry.overdue]), [['TARGET_DUE', true]]);
});

test('hạn sắp tới: kỳ đã báo cáo không hiện, chỉ tiêu thống kê không có hạn hoàn thành', () => {
  const snap = snapshot(
    [
      item({ id: 'period', valueSource: ValueSource.MANUAL, frequency: TargetFrequency.MONTHLY, createdAt: new Date('2026-10-01T00:00:00+07:00') }),
      item({ id: 'stat', kind: FrameworkKind.STAT, dueDate: new Date(NOW.getTime() + DAY) }),
    ],
    { period: ['2026-M10'] },
  );
  assert.deepEqual(buildDeadlines(snap, [], NOW, 30), []);
});

test('nhân sự trong phòng: đếm chỉ tiêu, thiếu báo cáo, quá hạn theo người phụ trách', () => {
  const snap = snapshot([
    item({ id: 'a', assigneeId: 'u1', missingPeriods: ['2026-M09'] }),
    item({ id: 'b', assigneeId: 'u1', status: TargetStatus.OVERDUE }),
    item({ id: 'c', assigneeId: 'u2' }),
    item({ id: 'd', assigneeId: null }),
  ]);
  const team = buildTeam(snap, [
    { id: 'u2', fullName: 'Trần Thị B', position: 'Chuyên viên', role: Role.STAFF, lastLoginAt: null },
    { id: 'u1', fullName: 'Nguyễn Văn A', position: 'Chuyên viên', role: Role.STAFF, lastLoginAt: null },
    { id: 'm', fullName: 'Lê Văn C', position: 'Trưởng phòng', role: Role.MANAGER, lastLoginAt: null },
  ]);
  assert.deepEqual(
    team.map(member => [member.userId, member.targets, member.missingReports, member.overdue]),
    [['m', 0, 0, 0], ['u1', 2, 1, 1], ['u2', 1, 0, 0]],
  );
});

test('bộ đệm: hết hạn sau thời gian sống, bỏ mục cũ nhất khi đầy', () => {
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const cache = new TtlCache<number>(30_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    assert.equal(cache.get('a'), 1);
    now += 29_999;
    assert.equal(cache.get('b'), 2);
    now += 2;
    assert.equal(cache.get('a'), undefined);
    cache.set('c', 3);
    cache.set('d', 4);
    cache.set('e', 5);
    assert.equal(cache.get('c'), undefined);
    assert.equal(cache.get('e'), 5);
  } finally {
    Date.now = realNow;
  }
});

function watch(id: string, partial: { assigneeId?: string | null; kind?: FrameworkKind; status?: TargetStatus; progress?: number; dueDate?: string; isLeaf?: boolean } = {}) {
  return {
    id,
    code: id.toUpperCase(),
    assigneeId: partial.assigneeId ?? null,
    kind: partial.kind ?? FrameworkKind.PLAN,
    status: partial.status ?? TargetStatus.ON_TRACK,
    progress: partial.progress ?? 50,
    dueDate: new Date(partial.dueDate ?? '2026-12-31T00:00:00Z'),
    isLeaf: partial.isLeaf ?? true,
  };
}

test('chỉ tiêu theo dõi — của tôi: chỉ chỉ tiêu tôi phụ trách, việc gấp (quá hạn, nguy cơ) lên đầu rồi theo hạn', () => {
  const list = pickWatchlist(
    [
      watch('a', { assigneeId: 'me', status: TargetStatus.ON_TRACK, dueDate: '2026-11-01T00:00:00Z' }),
      watch('b', { assigneeId: 'other', status: TargetStatus.OVERDUE }),
      watch('c', { assigneeId: 'me', status: TargetStatus.OVERDUE }),
      watch('d', { assigneeId: 'me', status: TargetStatus.AT_RISK }),
      watch('e', { assigneeId: 'me', status: TargetStatus.ON_TRACK, dueDate: '2026-10-20T00:00:00Z' }),
      watch('f', { assigneeId: 'me', status: TargetStatus.COMPLETED }),
    ],
    'mine',
    'me',
    10,
  );
  assert.deepEqual(list.map(entry => entry.id), ['c', 'd', 'e', 'a', 'f']);
});

test('chỉ tiêu theo dõi — tiến độ thấp nhất: bỏ chỉ tiêu thống kê, đã hoàn thành và chỉ tiêu cha; lấy đủ số dòng', () => {
  const list = pickWatchlist(
    [
      watch('a', { progress: 80 }),
      watch('b', { progress: 10 }),
      watch('stat', { kind: FrameworkKind.STAT, progress: 0 }),
      watch('done', { status: TargetStatus.COMPLETED, progress: 0 }),
      watch('parent', { progress: 1, isLeaf: false }),
      watch('c', { progress: 10, dueDate: '2026-06-30T00:00:00Z' }),
      watch('d', { progress: 40 }),
    ],
    'risk',
    'me',
    3,
  );
  assert.deepEqual(list.map(entry => entry.id), ['c', 'b', 'd']);
});

test('chỉ tiêu theo dõi — quá hạn: chỉ chỉ tiêu quá hạn, quá hạn lâu nhất trước', () => {
  const list = pickWatchlist(
    [
      watch('a', { status: TargetStatus.OVERDUE, dueDate: '2026-09-30T00:00:00Z' }),
      watch('b', { status: TargetStatus.AT_RISK }),
      watch('c', { status: TargetStatus.OVERDUE, dueDate: '2026-06-30T00:00:00Z' }),
    ],
    'overdue',
    'me',
    10,
  );
  assert.deepEqual(list.map(entry => entry.id), ['c', 'a']);
});
