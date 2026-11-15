import assert from 'node:assert/strict';
import test from 'node:test';
import type { CurrentUser } from '../types/auth';
import { emptySession, isCurrentSessionToken, readSessionSnapshot, sessionIdentityChanged, TOKEN_KEY, USER_KEY } from './session-state';

const user = (id: string): CurrentUser => ({ id, username: id, fullName: `Người ${id}`, role: 'STAFF', isActive: true, departmentId: null });
const token = (id: string, version = 1) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, ver: version })).toString('base64url')}.test-signature`;
function store(id: string) {
  const values = new Map([[TOKEN_KEY, token(id)], [USER_KEY, JSON.stringify(user(id))]]);
  return { getItem: (key: string) => values.get(key) ?? null, set: (key: string, value: string) => values.set(key, value), remove: (key: string) => values.delete(key) };
}

test('snapshot binds a cached user to its own token before a cross-tab storage event', () => {
  const storage = store('A');
  const snapshot = readSessionSnapshot(storage);
  storage.set(TOKEN_KEY, token('B'));
  storage.set(USER_KEY, JSON.stringify(user('B')));
  assert.equal(snapshot.user?.id, 'A');
  assert.equal(snapshot.token, token('A'));
  assert.equal(isCurrentSessionToken(snapshot, storage, token('A')), false);
  const synchronized = readSessionSnapshot(storage);
  assert.equal(synchronized.user?.id, 'B');
  assert.equal(synchronized.token, token('B'));
});

test('half-written token/user pairs and incomplete logout are never authenticated', () => {
  const storage = store('A');
  storage.set(TOKEN_KEY, token('B'));
  assert.deepEqual(readSessionSnapshot(storage), emptySession());
  storage.set(USER_KEY, JSON.stringify(user('B')));
  assert.equal(readSessionSnapshot(storage).user?.id, 'B');
  storage.remove(TOKEN_KEY);
  assert.deepEqual(readSessionSnapshot(storage), emptySession());
});

test('late 401 cannot clear a newer session or renewed token for the same user', () => {
  const storage = store('A');
  const first = readSessionSnapshot(storage);
  assert.equal(isCurrentSessionToken(first, storage, token('A')), true);
  storage.set(TOKEN_KEY, token('A', 2));
  assert.equal(isCurrentSessionToken(first, storage, token('A')), false);
  const renewed = readSessionSnapshot(storage);
  assert.equal(isCurrentSessionToken(renewed, storage, token('A')), false);
  assert.equal(isCurrentSessionToken(renewed, storage, token('A', 2)), true);
  assert.equal(isCurrentSessionToken(renewed, storage, null), false);
});

test('malformed storage and inaccessible storage fail closed', () => {
  const storage = store('A');
  storage.set(USER_KEY, '{broken');
  assert.deepEqual(readSessionSnapshot(storage), emptySession());
  storage.set(USER_KEY, JSON.stringify(user('A')));
  storage.set(TOKEN_KEY, 'not-a-jwt');
  assert.deepEqual(readSessionSnapshot(storage), emptySession());
  const unavailable = { getItem: () => { throw new Error('disabled'); } };
  assert.deepEqual(readSessionSnapshot(unavailable), emptySession());
  assert.equal(isCurrentSessionToken({ token: token('A'), user: user('A') }, unavailable, token('A')), false);
});

test('cross-tab identity changes reload once; same-token profile updates do not reload', () => {
  const initial = readSessionSnapshot(store('A'));
  const profile = { ...initial, user: { ...user('A'), fullName: 'Tên đã cập nhật' } };
  assert.equal(sessionIdentityChanged(initial, profile), false);
  assert.equal(sessionIdentityChanged(initial, readSessionSnapshot(store('A'))), false);
  assert.equal(sessionIdentityChanged(initial, readSessionSnapshot(store('B'))), true);
  assert.equal(sessionIdentityChanged(initial, { ...initial, token: token('A', 2) }), true);
  assert.equal(sessionIdentityChanged(initial, emptySession()), true);
  assert.equal(sessionIdentityChanged(emptySession(), emptySession()), false);
});
