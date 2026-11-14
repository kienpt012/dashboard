import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('workspace iframe remains isolated without same-origin, forms, presentation or permissions grants', () => {
  const source = readFileSync(new URL('../apps/web/src/pages/workspace/Widgets.tsx', import.meta.url), 'utf8');
  const frame = source.match(/<iframe\b[^>]+>/)?.[0];
  assert.ok(frame);
  assert.match(frame, /sandbox="allow-scripts"/);
  assert.match(frame, /referrerPolicy="no-referrer"/);
  assert.doesNotMatch(frame, /\ballow=|allow-same-origin|allow-forms|allow-popups|allow-top-navigation|allow-presentation/);
});

test('nginx limits external frames to admin entry documents and keeps external connections disabled', () => {
  const nginx = readFileSync(new URL('../apps/web/nginx.conf', import.meta.url), 'utf8');
  const policies = [...nginx.matchAll(/(?:default|~\^\/[^\s]+)\s+"(default-src[^"\n]+)"/g)].map(match => match[1]);
  assert.equal(policies.length, 2);
  assert.match(policies[0], /frame-src 'self' data: blob:;/);
  assert.match(policies[1], /frame-src 'self' data: blob: https:;/);
  for (const policy of policies) {
    assert.match(policy, /connect-src 'self';/);
    assert.match(policy, /img-src 'self' data: blob:;/);
    assert.match(policy, /object-src 'none';/);
    assert.match(policy, /form-action 'self';/);
  }
});
