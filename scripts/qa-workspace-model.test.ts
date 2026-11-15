import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWorkspaceConfig } from '../apps/api/src/workspace-config';
import { defaultConfig, makeWidget, migrateConfig, validConfig, WIDGETS } from '../apps/web/src/pages/workspace/model';

test('web and API share rejection decisions including inert JSON, image bytes, URLs, version and pins', () => {
  const variants = [
    (c: any) => { c.schemaVersion = 3; },
    (c: any) => { c.appearance.dock = 'right'; },
    (c: any) => { c.appearance.customWallpaper = 'data:image/png;base64,bm90YW5pbWFnZQ=='; },
    (c: any) => { c.spaces[0].widgets[0].settings = JSON.parse('{"__proto__":{}}'); },
    (c: any) => { c.spaces[0].widgets[0].settings = { content: 'x'.repeat(131072) }; },
    (c: any) => { c.spaces[0].widgets[0] = { ...makeWidget('api'), settings: { url: 'http://example.com' } }; },
    (c: any) => { c.spaces[0].widgets[0] = { ...makeWidget('embed'), settings: { url: 'javascript:alert(1)' } }; },
    (c: any) => { c.spaces[0].widgets[0] = { ...makeWidget('pins'), settings: { items: [{ id: 'a', title: 'A', kind: 'script' }] } }; },
    (c: any) => { c.shortcuts[0].url = '/abc\u0000'; },
  ];
  for (const alter of variants) {
    const config = defaultConfig(); alter(config);
    assert.equal(validConfig(config), false);
    assert.throws(() => validateWorkspaceConfig(config));
  }
});

test('role defaults are distinct, valid and contain all retained and added widget types', () => {
  for (const role of ['ADMIN', 'LEADER', 'MANAGER', 'STAFF', 'CLERK', 'VIEWER']) {
    const config = defaultConfig(role);
    assert.equal(config.schemaVersion, 2);
    assert.equal(validConfig(config), true, role);
    assert.doesNotThrow(() => validateWorkspaceConfig(config));
  }
  assert.deepEqual(defaultConfig('VIEWER').spaces[0].widgets.map(item => item.type), ['ioc']);
  assert.ok(defaultConfig('LEADER').spaces[0].widgets.some(item => item.type === 'departments'));
  assert.ok(defaultConfig('CLERK').spaces[0].widgets.some(item => item.type === 'proposals'));
  assert.equal(WIDGETS.length, 24);
});

test('v1 migration preserves all personal text, links, spaces and positions', () => {
  const old = defaultConfig(); old.schemaVersion = 1; delete old.appearance.dock;
  old.spaces[0].widgets.push({ ...makeWidget('notes'), settings: { text: 'Ghi chú cần giữ' } });
  const original = structuredClone(old);
  const migrated = migrateConfig(old);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.appearance.dock, 'bottom');
  assert.deepEqual(migrated.spaces, original.spaces);
  assert.deepEqual(migrated.shortcuts, original.shortcuts);
  assert.deepEqual(old, original);
  assert.equal(validConfig(original), true);
  assert.equal(validConfig(migrated), true);
});
