import type { CurrentUser } from '../types/auth';

export const TOKEN_KEY = 'ioc_token';
export const USER_KEY = 'ioc_user';
export type SessionSnapshot = { token: string | null; user: CurrentUser | null };
type SessionStorage = Pick<Storage, 'getItem'>;

export function emptySession(): SessionSnapshot {
  return { token: null, user: null };
}

export function sessionIdentityChanged(before: SessionSnapshot, after: SessionSnapshot): boolean {
  return before.token !== after.token || before.user?.id !== after.user?.id;
}

/** This only binds UI state to its token; signature/permission checks remain on the API. */
function tokenSubject(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const bytes = Uint8Array.from(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { sub?: unknown } | null;
    return typeof payload?.sub === 'string' ? payload.sub : null;
  } catch { return null; }
}

/** Storage events may arrive between the two writes of a login: never accept a mixed pair. */
export function readSessionSnapshot(storage: SessionStorage): SessionSnapshot {
  try {
    const token = storage.getItem(TOKEN_KEY);
    const rawUser = storage.getItem(USER_KEY);
    if (!token || !rawUser) return emptySession();
    const user = JSON.parse(rawUser) as CurrentUser | null;
    if (!user || typeof user.id !== 'string' || tokenSubject(token) !== user.id) return emptySession();
    return { token, user };
  } catch { return emptySession(); }
}

/** Late requests must not clear or rewrite a newer login, even before its storage event arrives. */
export function isCurrentSessionToken(snapshot: SessionSnapshot, storage: SessionStorage, token: string | null): boolean {
  if (!token || !snapshot.user || snapshot.token !== token) return false;
  try { return storage.getItem(TOKEN_KEY) === token; } catch { return false; }
}
