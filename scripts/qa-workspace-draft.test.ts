import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultConfig, validConfig } from '../apps/web/src/pages/workspace/model';
import { readWorkspaceDraft, reconcileWorkspaceDraft, workspaceDraftKey } from '../apps/web/src/pages/workspace/workspace-draft';

test('invalid imported null records return false without crashing', () => {
  for (const section of ['spaces', 'shortcuts'] as const) {
    const value = defaultConfig() as any; value[section] = [null];
    assert.equal(validConfig(value), false);
  }
  const value = defaultConfig() as any; value.spaces[0].widgets = [null];
  assert.equal(validConfig(value), false);
  value.spaces[0].widgets = [{ ...defaultConfig().spaces[0].widgets[0], settings: null }];
  assert.equal(validConfig(value), false);
});

test('draft storage separates users and tabs and rejects mismatched owner', () => {
  assert.notEqual(workspaceDraftKey('alice', 'tab1'), workspaceDraftKey('bob', 'tab1'));
  assert.notEqual(workspaceDraftKey('alice', 'tab1'), workspaceDraftKey('alice', 'tab2'));
  const draft = { userId: 'alice', basedOnVersion: 2, config: defaultConfig() };
  const storage = { getItem: () => JSON.stringify(draft) };
  assert.deepEqual(readWorkspaceDraft(storage, 'key', 'alice'), draft);
  assert.equal(readWorkspaceDraft(storage, 'key', 'bob'), null);
  assert.equal(readWorkspaceDraft({ getItem: () => '{broken' }, 'key', 'alice'), null);
});

test('only a draft based on the same server version resumes automatic saving', () => {
  const server = defaultConfig();
  const edited = structuredClone(server); edited.spaces[0].name = 'Chưa kịp lưu';
  const draft = { userId: 'alice', basedOnVersion: 2, config: edited };
  assert.deepEqual(reconcileWorkspaceDraft(server, 2, draft), { config: edited, status: 'pending' });
  assert.deepEqual(reconcileWorkspaceDraft(server, 3, draft), { config: edited, status: 'conflict' });
  assert.deepEqual(reconcileWorkspaceDraft(edited, 3, draft), { config: edited, status: 'saved' });
  const reordered = { shortcuts: edited.shortcuts, spaces: edited.spaces, activeSpace: edited.activeSpace, appearance: edited.appearance, schemaVersion: edited.schemaVersion };
  assert.equal(reconcileWorkspaceDraft(reordered, 3, draft).status, 'saved');
  assert.deepEqual(reconcileWorkspaceDraft(server, 3, null), { config: server, status: 'saved' });
});
