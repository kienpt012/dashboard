import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import { installHttpBodyParsers, IOC_HTTP_BODY_LIMIT } from '../src/http-config';

test('HTTP JSON body accepts bounded Unicode Studio payloads and rejects bodies above the 6 MB ceiling', async t => {
  const app = express();
  installHttpBodyParsers(app);
  app.post('/body', (request, response) => {
    response.json({ length: String(request.body?.config ?? '').length });
  });
  // Keep the error response deterministic and avoid logging the intentional
  // PayloadTooLargeError during this regression test.
  app.use((error: any, _request: any, response: any, _next: any) => {
    response.status(error?.status === 413 ? 413 : 500).json({ statusCode: error?.status ?? 500 });
  });

  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const endpoint = `http://127.0.0.1:${address.port}/body`;

  const studioPayload = 'ữ'.repeat(80 * 1024);
  const accepted = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: studioPayload }),
  });
  assert.equal(IOC_HTTP_BODY_LIMIT, '6mb');
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { length: studioPayload.length });

  const nearCeilingPayload = 'x'.repeat(5 * 1024 * 1024 + 512 * 1024);
  const nearCeiling = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: nearCeilingPayload }),
  });
  assert.equal(nearCeiling.status, 200);
  assert.deepEqual(await nearCeiling.json(), { length: nearCeilingPayload.length });

  const oversized = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: 'x'.repeat(6 * 1024 * 1024 + 1) }),
  });
  assert.equal(oversized.status, 413);
});
