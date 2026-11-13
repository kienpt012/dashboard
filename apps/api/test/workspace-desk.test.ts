import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DepartmentKind, Role } from '@prisma/client';
import { validate } from 'class-validator';
import { Actor } from '../src/access';
import { RateLimitService } from '../src/rate-limit';
import { canBroadcastNotes, canReadDeskNote, canSendDeskNote, deskWorkScope, badgeNumber, safeAppUrl, workAppVisible, plainNote } from '../src/workspace-desk-policy';
import { WorkAppBadgeCache, SaveWorkAppDto } from '../src/workspace-desk-apps';
import { buildDeskBriefing, briefingShowsCards, proposalWorkWhere } from '../src/workspace-desk-briefing';
import { CreateDeskNoteDto, DeskNoteReplyDto, DeskNoteRecipientDto, DeskNotesController } from '../src/workspace-desk-notes';

function actor(role: Role, id = role, departmentId = 'econ', kind: DepartmentKind = 'SPECIALIZED'): Actor & { department: { id: string; code: string; name: string; isActive: boolean; kind: DepartmentKind } } {
  return { id, username: id, fullName: id, role, isActive: true, departmentId, department: { id: departmentId, code: departmentId, name: departmentId, isActive: true, kind } };
}

test('desk note complete send matrix: self, same department, leaders, office, managers and outsiders', () => {
  const destinations = [actor(Role.STAFF, 'same'), actor(Role.STAFF, 'other', 'culture'), actor(Role.MANAGER, 'manager', 'culture'), actor(Role.LEADER, 'leader', 'leadership'), actor(Role.ADMIN, 'admin', 'admin'), actor(Role.VIEWER, 'viewer', 'culture'), actor(Role.MANAGER, 'office', 'office', 'OFFICE')];
  const expected = {
    ADMIN: [true, true, true, true, true, true, true], LEADER: [true, true, true, true, true, true, true],
    CLERK: [true, false, false, true, false, false, true], MANAGER: [true, false, true, true, false, false, true],
    STAFF: [true, false, false, true, false, false, true], VIEWER: [false, false, false, false, false, false, false],
  };
  for (const role of Object.values(Role)) {
    const sender = actor(role);
    assert.deepEqual(destinations.map(recipient => canSendDeskNote(sender, recipient)), expected[role], role);
    assert.equal(canSendDeskNote(sender, sender), true, `${role} self`);
  }
  const office = actor(Role.MANAGER, 'office', 'office', 'OFFICE');
  assert.equal(canBroadcastNotes(office), true);
  assert.deepEqual(destinations.map(recipient => canSendDeskNote(office, recipient)), destinations.map(() => true));
  assert.equal(canBroadcastNotes(actor(Role.MANAGER)), false);
  assert.equal(canBroadcastNotes(actor(Role.CLERK)), false);
});

test('only author and actual recipients read a note, including admin', () => {
  const note = { authorId: 'a', recipients: [{ userId: 'b' }] };
  assert.equal(canReadDeskNote('a', note), true);
  assert.equal(canReadDeskNote('b', note), true);
  assert.equal(canReadDeskNote('admin', note), false);
});

test('note controller rejects outsider read/reply and non-recipient state before writes', async () => {
  let writes = 0;
  const db = { deskNote: { findFirst: async () => null }, deskNoteReply: { create: async () => { writes++; } }, deskNoteRecipient: { update: async () => { writes++; } }, $transaction: async (fn: (tx: unknown) => unknown) => fn(db) };
  const rate = new RateLimitService();
  try {
    const controller = new DeskNotesController(db as never, rate);
    const req = { user: actor(Role.ADMIN) };
    await assert.rejects(() => controller.detail(req, 'private'), NotFoundException);
    await assert.rejects(() => controller.reply(req, 'private', { content: 'Nội dung' }), NotFoundException);
    await assert.rejects(() => controller.updateRecipient(req, 'private', { done: true }), NotFoundException);
    assert.equal(writes, 0);
  } finally { rate.onModuleDestroy(); }
});

test('note and reply rate limits are separate per user and fixed to 30/60 each hour', () => {
  const rate = new RateLimitService();
  try {
    for (let i = 0; i < 30; i++) rate.consume('desk-note-create', 'a', { limit: 30, windowMs: 3_600_000 });
    assert.throws(() => rate.consume('desk-note-create', 'a', { limit: 30, windowMs: 3_600_000 }), (error: any) => error.getStatus() === 429);
    rate.consume('desk-note-create', 'b', { limit: 30, windowMs: 3_600_000 });
    for (let i = 0; i < 60; i++) rate.consume('desk-note-reply', 'a', { limit: 60, windowMs: 3_600_000 });
    assert.throws(() => rate.consume('desk-note-reply', 'a', { limit: 60, windowMs: 3_600_000 }), (error: any) => error.getStatus() === 429);
  } finally { rate.onModuleDestroy(); }
});

test('note DTO limits and whitespace validation', async () => {
  assert.ok((await validate(Object.assign(new CreateDeskNoteDto(), { content: 'x'.repeat(501), color: 'red' }))).length >= 2);
  assert.ok((await validate(Object.assign(new DeskNoteReplyDto(), { content: 'x'.repeat(301) }))).length);
  assert.throws(() => plainNote('   ', 500), BadRequestException);
  assert.equal(plainNote('<b>chữ thuần</b>', 500), '<b>chữ thuần</b>');
  assert.equal((await validate(Object.assign(new DeskNoteRecipientDto(), { x: null, y: null, seen: null, hidden: null, done: null }))).length, 5);
});

test('briefing scopes actionable work by assignee, department, leadership and viewer', () => {
  assert.deepEqual(deskWorkScope(actor(Role.STAFF)), { assigneeId: 'STAFF', departmentId: 'econ' });
  assert.deepEqual(deskWorkScope(actor(Role.MANAGER)), { departmentId: 'econ' });
  assert.deepEqual(deskWorkScope(actor(Role.LEADER)), {});
  assert.deepEqual(deskWorkScope(actor(Role.VIEWER)), { id: '__none__' });
  for (const role of Object.values(Role)) assert.equal(briefingShowsCards(actor(role)), ['STAFF', 'MANAGER', 'CLERK'].includes(role));
  assert.match(JSON.stringify(proposalWorkWhere(actor(Role.STAFF))), /__none__/);
});

test('briefing reuses reporting periods, suppresses submitted periods, shows leadership counts only and private dated tasks', async () => {
  const now = new Date('2026-11-13T03:00:00Z');
  const target = { id: 't', title: 'Tỷ lệ giải ngân', year: 2026, frequency: 'MONTHLY', reportDueDay: 14, createdAt: new Date('2026-11-01'), kind: 'PLAN', framework: null, currentValue: 30, targetValue: 100, direction: 'HIGHER_IS_BETTER', dueDate: new Date('2026-12-31'), lastReportedAt: now, valueSource: 'MANUAL', assigneeId: 'STAFF', assignee: { fullName: 'Thảo', username: 'thao.ktht' }, updates: [], explanationRequests: [], _count: { children: 0 } };
  const db = { target: { findMany: async (args: any) => args.where.id === '__none__' ? [] : [target] }, systemSetting: { findUnique: async () => null }, indicatorCandidate: { findMany: async () => [] }, deskNoteRecipient: { findMany: async () => [] }, userWorkspace: { findUnique: async () => ({ config: { spaces: [{ widgets: [{ type: 'tasks', settings: { items: [{ id: 'private', text: 'Chuẩn bị tài liệu', dueAt: '2026-11-13', done: false }, { id: 'monday', text: 'Việc đầu tuần', dueAt: '2026-11-09', done: false }, { id: 'next-week', text: 'Việc tuần sau', dueAt: '2026-11-16', done: false }] } }] }] } }) }, notification: { count: async () => 2 }, feedback: { count: async () => 3 } };
  const staff = await buildDeskBriefing(db as never, actor(Role.STAFF), now);
  assert.equal(staff.counts.reports, 1);
  assert.equal(staff.tomorrow[0].periodKey, '2026-M11');
  assert.equal(staff.tomorrow[0].href, '/admin/targets/t?bao-cao=2026-M11');
  assert.equal(staff.today[0].title, 'Chuẩn bị tài liệu');
  assert.ok(staff.week.some(item => item.id === 'private:monday'));
  assert.ok(!staff.week.some(item => item.id === 'private:next-week'));
  const sunday = await buildDeskBriefing(db as never, actor(Role.STAFF), new Date('2026-11-15T16:59:00Z'));
  assert.ok(sunday.tomorrow.some(item => item.id === 'private:next-week'));
  assert.ok(!sunday.week.some(item => item.id === 'private:next-week'));
  assert.equal(staff.systemNotes[0].assignee?.username, 'thao.ktht');
  const leader = await buildDeskBriefing(db as never, actor(Role.LEADER), now);
  assert.equal(leader.counts.reports, 1);
  assert.deepEqual(leader.systemNotes, []);
  assert.equal(leader.tomorrow.length, 0);
  const viewer = await buildDeskBriefing(db as never, actor(Role.VIEWER), now);
  assert.equal(viewer.counts.reports, 0);
  assert.equal(viewer.counts.feedback, 0);
  target.updates.push({ periodKey: '2026-M11', reviewStatus: 'PENDING', userId: 'STAFF', createdAt: now, id: 'report' } as never);
  const submitted = await buildDeskBriefing(db as never, actor(Role.STAFF), now);
  assert.equal(submitted.counts.reports, 0);
});

test('work apps apply role OR department audiences and inactive apps stay hidden', () => {
  for (const role of Object.values(Role)) assert.equal(workAppVisible({ isActive: true, roles: [], departmentIds: [] }, actor(role)), true);
  const app = { isActive: true, roles: [Role.LEADER], departmentIds: ['econ'] };
  assert.equal(workAppVisible(app, actor(Role.STAFF)), true);
  assert.equal(workAppVisible(app, actor(Role.LEADER, 'leader', 'else')), true);
  assert.equal(workAppVisible(app, actor(Role.STAFF, 'staff', 'else')), false);
  assert.equal(workAppVisible({ ...app, isActive: false }, actor(Role.LEADER)), false);
});

test('badge errors hide only the badge; coalesced requests and failures expire after five minutes', async () => {
  let now = 0, requests = 0;
  const cache = new WorkAppBadgeCache(async () => { requests++; throw new Error('offline'); }, () => now);
  const app = { badgeUrl: 'https://example.gov.vn/count', badgePath: 'data.count' };
  assert.deepEqual(await Promise.all([cache.get(app), cache.get(app)]), [undefined, undefined]);
  assert.equal(requests, 1);
  now = 300_001;
  assert.equal(await cache.get(app), undefined);
  assert.equal(requests, 2);
  assert.equal(badgeNumber({ data: { count: 8 } }, 'data.count'), 8);
  assert.equal(badgeNumber({ data: { count: '8' } }, 'data.count'), undefined);
  assert.equal(badgeNumber({ data: { count: -1 } }, 'data.count'), undefined);
  assert.equal(badgeNumber({}, '__proto__.count'), undefined);
});

test('app links allow only HTTP(S), no userinfo or script protocols; DTO bounds', async () => {
  assert.equal(safeAppUrl('https://mail.tphcm.gov.vn'), 'https://mail.tphcm.gov.vn/');
  for (const value of ['javascript:alert(1)', 'data:text/html,hi', 'https://user:pass@example.org', 'https://example.org\\@evil.test']) assert.throws(() => safeAppUrl(value), BadRequestException);
  const dto = Object.assign(new SaveWorkAppDto(), { name: 'Ứng dụng', url: 'https://mail.tphcm.gov.vn', icon: 'MailOutlined', color: '#1677ff', group: 'Công vụ', description: '', roles: [], departmentIds: [], sortOrder: 0, isActive: true });
  assert.deepEqual(await validate(dto), []);
});
