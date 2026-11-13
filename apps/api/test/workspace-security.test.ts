import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { setImmediate as immediate } from 'node:timers/promises';
import { BadGatewayException, BadRequestException, GatewayTimeoutException } from '@nestjs/common';
import { fetchPublicJson, isPublicAddress, parsePublicApiUrl, resolvePublicApi } from '../src/workspace-fetch';

const publicDns = async () => [{ address: '8.8.8.8', family: 4 }];

test('SSRF: private/reserved range boundaries, IPv6 transition encodings and zones fail closed', () => {
  const blocked = ['0.0.0.0', '0.255.255.255', '100.64.0.0', '100.127.255.255', '169.254.0.0', '169.254.255.255',
    '198.18.0.0', '198.19.255.255', '224.0.0.0', '239.255.255.255', '240.0.0.0', '255.255.255.255',
    '::ffff:8.8.8.8', '::ffff:c0a8:1', '::ffff:0:7f00:1', '::127.0.0.1', '64:ff9b::808:808', '64:ff9b:1::a00:1',
    '2002:0808:0808::', '2001:0:4136:e378:8000:63bf:3fff:fdd2', '2001:1ff:ffff::1', '3ffe::1',
    'fc00::', 'fdff:ffff::1', 'fe80::1', 'febf::1', 'ff00::1', '2606:4700::1%eth0'];
  for (const ip of blocked) assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ['100.63.255.255', '100.128.0.0', '198.17.255.255', '198.20.0.0', '223.255.255.255', '2606:4700::1111']) {
    assert.equal(isPublicAddress(ip), true, ip);
  }
});

test('SSRF: decimal, octal, hex, userinfo, trailing-dot private names and alternate ports are rejected', () => {
  for (const url of ['https://2130706433', 'https://0177.0.0.1', 'https://017700000001', 'https://0x7f.0.0.1',
    'https://0x7f000001', 'https://127.1', 'https://0300.0250.1.1', 'https://0', 'https://localhost.',
    'https://x.internal.', 'https://127.0.0.1.', 'https://public.example:80/', 'https://public.example:8443/',
    'https://user@public.example', 'https://user%3Apass@public.example', 'https://public.example\n/',
    'https://public.example\\@127.0.0.1/', 'https://[64:ff9b::7f00:1]/', 'https://[2002:7f00:1::]/']) {
    assert.throws(() => parsePublicApiUrl(url), BadRequestException, url);
  }
  assert.equal(parsePublicApiUrl('https://API.EXAMPLE.COM.:443/data').href, 'https://api.example.com/data');
});

test('SSRF: empty, mixed-private, invalid-family and non-IP DNS records are rejected', async () => {
  const url = parsePublicApiUrl('https://api.example.com');
  for (const records of [[], [{ address: '8.8.8.8', family: 6 }], [{ address: '8.8.8.8', family: 4 }, { address: 'fd00::1', family: 6 }], [{ address: 'example.com', family: 4 }]]) {
    await assert.rejects(resolvePublicApi(url, async () => records), BadRequestException);
  }
});

type FakeResponse = EventEmitter & { statusCode: number; headers: Record<string, string>; destroy(): void };
function transport(onResponse: (response: FakeResponse) => void, headers: Record<string, string> = {}, statusCode = 200) {
  let options: any;
  let url: URL;
  let destroyed = false;
  let responseDestroyed = false;
  const request = ((target: URL, opts: any, callback: (response: FakeResponse) => void) => {
    url = target; options = opts;
    const req = new EventEmitter() as any;
    req.destroy = () => { destroyed = true; };
    req.end = () => queueMicrotask(() => {
      const response = Object.assign(new EventEmitter(), { statusCode, headers: { 'content-type': 'application/json', ...headers }, destroy() { responseDestroyed = true; } });
      callback(response);
      onResponse(response);
    });
    return req;
  }) as any;
  return { request, get options() { return options; }, get url() { return url; }, get destroyed() { return destroyed; }, get responseDestroyed() { return responseDestroyed; } };
}
const json = (response: FakeResponse) => { response.emit('data', Buffer.from('{"ok":true}')); response.emit('end'); };

test('SSRF: DNS rebinding cannot change the checked IP, including lookup(all) on Node 22+', async () => {
  let lookups = 0;
  const mock = transport(json);
  await fetchPublicJson('https://api.example.com./data', {
    request: mock.request,
    resolve: async hostname => { assert.equal(hostname, 'api.example.com'); return [{ address: ++lookups === 1 ? '8.8.8.8' : '127.0.0.1', family: 4 }]; },
  });
  assert.equal(lookups, 1);
  assert.equal(mock.url.hostname, 'api.example.com');
  assert.equal(mock.options.agent, false);
  assert.equal(mock.options.headers['Accept-Encoding'], 'identity');
  assert.equal(mock.options.headers.Cookie, undefined);
  assert.equal(mock.options.headers.Authorization, undefined);
  assert.equal(mock.options.rejectUnauthorized, undefined); // Node's certificate validation stays enabled.
  mock.options.lookup('api.example.com', { all: true }, (error: unknown, addresses: unknown) => {
    assert.equal(error, null); assert.deepEqual(addresses, [{ address: '8.8.8.8', family: 4 }]);
  });
  mock.options.lookup('api.example.com', {}, (error: unknown, address: string, family: number) => {
    assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4);
  });
});

test('SSRF: redirect locations never get a second connection', async () => {
  for (const code of [301, 302, 303, 307, 308]) {
    const mock = transport(json, { location: 'https://127.0.0.1/secrets' }, code);
    await assert.rejects(fetchPublicJson('https://api.example.com', { request: mock.request, resolve: publicDns }), BadGatewayException);
    assert.equal(mock.responseDestroyed, true);
  }
});

test('SSRF: compressed bombs, wrong MIME and chunked bodies over 1 MB are stopped', async () => {
  for (const encoding of ['gzip', 'br', 'deflate', 'gzip, br']) {
    const mock = transport(json, { 'content-encoding': encoding });
    await assert.rejects(fetchPublicJson('https://api.example.com', { request: mock.request, resolve: publicDns }), BadGatewayException);
    assert.equal(mock.responseDestroyed, true);
  }
  for (const mime of ['text/html', 'text/plain', 'application/javascript', 'image/svg+xml', '']) {
    const mock = transport(json, { 'content-type': mime });
    await assert.rejects(fetchPublicJson('https://api.example.com', { request: mock.request, resolve: publicDns }), BadGatewayException);
  }
  const mock = transport(response => {
    response.emit('data', Buffer.alloc(600_000)); response.emit('data', Buffer.alloc(600_000)); response.emit('end');
  });
  await assert.rejects(fetchPublicJson('https://api.example.com', { request: mock.request, resolve: publicDns }), BadGatewayException);
  assert.equal(mock.responseDestroyed, true);
  const vendor = transport(json, { 'content-type': 'application/vnd.api+json; charset=utf-8' });
  assert.deepEqual((await fetchPublicJson('https://api.example.com', { request: vendor.request, resolve: publicDns })).data, { ok: true });
});

test('SSRF: timeout covers stalled response body, not only connection or headers', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const mock = transport(response => { response.emit('data', Buffer.from('{')); });
  const pending = assert.rejects(fetchPublicJson('https://api.example.com', { request: mock.request, resolve: publicDns }), GatewayTimeoutException);
  await immediate();
  context.mock.timers.tick(8001);
  await pending;
  assert.equal(mock.destroyed, true);
});

test('SSRF: DNS resolution has its own deadline', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = assert.rejects(resolvePublicApi(parsePublicApiUrl('https://api.example.com'), () => new Promise(() => {})), GatewayTimeoutException);
  context.mock.timers.tick(5001);
  await pending;
});
