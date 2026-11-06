import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { BadGatewayException, BadRequestException, ConflictException } from '@nestjs/common';
import { validateWorkspaceConfig } from '../src/workspace-config';
import { fetchPublicJson, isPublicAddress, parsePublicApiUrl, resolvePublicApi } from '../src/workspace-fetch';
import { WorkspaceController } from '../src/workspace';

function config() {
  return {
    schemaVersion: 1,
    appearance: { wallpaper: 'aurora', customWallpaper: '', accent: '#7ce6c5', blur: 40, overlay: 90 },
    activeSpace: 'home',
    spaces: [{ id: 'home', name: 'Cá nhân', widgets: [{ id: 'notes', type: 'notes', title: 'Ghi chú', x: 0, y: 0, w: 4, h: 5, settings: { text: 'Nội dung riêng' } }] }],
    shortcuts: [{ id: 'link', title: 'IOC', url: '/admin/dieu-hanh', icon: '◈', color: '#ffffff', hotkey: '1' }],
  };
}

test('workspace validates current frontend contract, bounds and unique ids', () => {
  assert.deepEqual(validateWorkspaceConfig(config()), config());
  const variants = [
    (c: any) => { c.activeSpace = 'missing'; },
    (c: any) => { c.spaces.push(c.spaces[0]); },
    (c: any) => { c.spaces[0].widgets[0].x = 11; },
    (c: any) => { c.spaces[0].widgets[0].h = 1; },
    (c: any) => { c.spaces[0].widgets[0].settings = { text: 'a'.repeat(128 * 1024) }; },
    (c: any) => { c.spaces[0].widgets[0].settings = JSON.parse('{"__proto__":{"polluted":true}}'); },
    (c: any) => { c.shortcuts[0].url = 'javascript:alert(1)'; },
    (c: any) => { c.shortcuts[0].url = '//evil.example'; },
    (c: any) => { c.shortcuts[0].url = '/\\evil.example'; },
    (c: any) => { c.shortcuts[0].url = 'https://user:password@example.com'; },
    (c: any) => { c.appearance.customWallpaper = 'data:image/svg+xml;base64,PHN2Zz4='; },
    (c: any) => { c.appearance.customWallpaper = `data:image/png;base64,${Buffer.from('not an actual image').toString('base64')}`; },
    (c: any) => { c.shortcuts[0].hotkey = 'Control'; },
  ];
  for (const alter of variants) {
    const value = config(); alter(value);
    assert.throws(() => validateWorkspaceConfig(value), BadRequestException);
  }
});

test('workspace image wallpaper validates real magic bytes and total size', () => {
  const c = config();
  c.appearance.customWallpaper = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  assert.doesNotThrow(() => validateWorkspaceConfig(c));
  c.appearance.customWallpaper = `data:image/png;base64,${Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(1024 * 1024)]).toString('base64')}`;
  assert.throws(() => validateWorkspaceConfig(c), BadRequestException);
});

const requestFor = (id: string) => ({ user: { id, username: id, fullName: id, role: 'STAFF', isActive: true, departmentId: 'department-1' }, query: { userId: 'someone-else' } });

function database() {
  const records = new Map<string, any>();
  const auditEvents: any[] = [];
  const calls: any[] = [];
  const tx = {
    userWorkspace: {
      findUnique: async ({ where }: any) => records.get(where.userId) ?? null,
      create: async ({ data }: any) => { records.set(data.userId, { ...data, updatedAt: new Date() }); },
      updateMany: async (args: any) => {
        calls.push(args);
        const record = records.get(args.where.userId);
        if (!record || record.version !== args.where.version) return { count: 0 };
        records.set(record.userId, { ...record, config: args.data.config, version: record.version + 1 });
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }: any) => records.get(where.userId),
    },
    auditLog: { create: async (args: any) => { auditEvents.push(args.data); } },
  };
  const prisma = { ...tx, $transaction: async (callback: (t: typeof tx) => any, options: any) => { assert.equal(options.isolationLevel, 'Serializable'); return callback(tx); } };
  return { records, auditEvents, calls, tx, prisma, controller: new WorkspaceController(prisma as any, { consume() {} } as any) };
}

test('workspace uses authenticated owner for every read and write; first write moves version to 2', async () => {
  const db = database();
  assert.deepEqual(await db.controller.get(requestFor('alice')), { config: null, version: 1, updatedAt: null });
  const saved = await db.controller.save({ config: config(), expectedVersion: 1 }, requestFor('alice'));
  assert.equal(saved.version, 2);
  assert.equal(db.records.size, 1);
  assert.equal(db.records.get('alice').config.spaces[0].widgets[0].settings.text, 'Nội dung riêng');
  assert.equal((await db.controller.get(requestFor('bob'))).config, null);
  await db.controller.save({ config: config(), expectedVersion: 2 }, requestFor('alice'));
  assert.deepEqual(db.calls[0].where, { userId: 'alice', version: 2 });
  assert.equal(db.auditEvents[0].actorId, 'alice');
  assert.equal(JSON.stringify(db.auditEvents).includes('Nội dung riêng'), false);
  assert.equal((await db.controller.get(requestFor('alice'))).version, 3);
});

test('workspace rejects stale saves and concurrent first-write/revision conflicts', async () => {
  const db = database();
  await assert.rejects(db.controller.save({ config: config(), expectedVersion: 7 }, requestFor('alice')), ConflictException);
  await db.controller.save({ config: config(), expectedVersion: 1 }, requestFor('alice'));
  await assert.rejects(db.controller.save({ config: config(), expectedVersion: 1 }, requestFor('alice')), ConflictException);
  db.tx.userWorkspace.updateMany = async () => ({ count: 0 });
  await assert.rejects(db.controller.save({ config: config(), expectedVersion: 2 }, requestFor('alice')), ConflictException);
  assert.equal(db.auditEvents.length, 1);
  for (const code of ['P2002', 'P2025', 'P2034']) {
    db.prisma.$transaction = async () => { throw { code }; };
    await assert.rejects(db.controller.save({ config: config(), expectedVersion: 2 }, requestFor('alice')), ConflictException);
  }
});

test('external APIs reject private, reserved, mapped, transition and special IPv4/IPv6 addresses', () => {
  for (const address of ['0.0.0.0', '127.0.0.1', '10.2.3.4', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.127.255.255', '192.0.0.1', '192.0.2.1', '198.19.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255', '::', '::1', '::ffff:127.0.0.1', '::ffff:a00:1', 'fc00::1', 'fe80::1', '64:ff9b::7f00:1', '2001::1', '2001:db8::1', '2002:7f00:1::', '3fff::1', 'ff02::1']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of ['1.1.1.1', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(isPublicAddress(address), true, address);
});

test('external APIs reject URL tricks and private DNS answers', async () => {
  for (const url of ['http://api.example.com', 'file:///etc/passwd', 'https://localhost', 'https://foo.local', 'https://2130706433', 'https://0x7f000001', 'https://127.1', 'https://[::1]', 'https://api.example.com:444', 'https://a:b@api.example.com', 'https://api.example.com/#x', 'https://api.example.com\\@127.0.0.1']) {
    assert.throws(() => parsePublicApiUrl(url), BadRequestException, url);
  }
  const url = parsePublicApiUrl('https://api.example.com/data?q=1');
  await assert.rejects(resolvePublicApi(url, async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]), BadRequestException);
  await assert.rejects(resolvePublicApi(url, async () => []), BadRequestException);
  assert.deepEqual(await resolvePublicApi(url, async () => [{ address: '8.8.8.8', family: 4 }]), { address: '8.8.8.8', family: 4 });
});

function transport(status = 200, contentType = 'application/json', payload = '{"value":42}', extra: Record<string, string> = {}) {
  let captured: any;
  const request = ((url: URL, options: any, callback: (res: any) => void) => {
    captured = { url, options };
    const req = new EventEmitter() as any;
    req.destroy = () => {};
    req.end = () => queueMicrotask(() => {
      const response = new EventEmitter() as any;
      response.statusCode = status;
      response.headers = { 'content-type': contentType, ...extra };
      response.destroy = () => {};
      callback(response);
      response.emit('data', Buffer.from(payload));
      response.emit('end');
    });
    return req;
  }) as any;
  return { request, captured: () => captured };
}

test('public fetch pins DNS into socket while preserving hostname and sends no credentials', async () => {
  const mock = transport();
  let resolves = 0;
  const result = await fetchPublicJson('https://api.example.com/data', { request: mock.request, resolve: async () => { resolves++; return [{ address: '8.8.8.8', family: 4 }]; } });
  assert.deepEqual(result.data, { value: 42 });
  assert.equal(resolves, 1);
  assert.equal(mock.captured().url.hostname, 'api.example.com');
  assert.equal(mock.captured().options.headers.Authorization, undefined);
  assert.equal(mock.captured().options.agent, false);
  mock.captured().options.lookup('api.example.com', {}, (error: any, address: string, family: number) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4); });
});

test('public fetch rejects redirects, HTML, invalid JSON, compressed and oversized responses', async () => {
  for (const mock of [transport(302), transport(200, 'text/html'), transport(200, 'application/json', 'not-json'), transport(200, 'application/json', '{}', { 'content-encoding': 'gzip' }), transport(200, 'application/json', '{}', { 'content-length': '1048577' }), transport(200, 'application/json', 'a'.repeat(1048577))]) {
    await assert.rejects(fetchPublicJson('https://api.example.com/data', { request: mock.request, resolve: async () => [{ address: '8.8.8.8', family: 4 }] }), BadGatewayException);
  }
});
