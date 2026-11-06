import { validConfig, type WorkspaceConfig } from './model';

export type WorkspaceDraft = { userId: string; basedOnVersion: number; config: WorkspaceConfig };
type StorageReader = Pick<Storage, 'getItem'>;

/** Separate accounts and tabs so an unfinished edit cannot replace another tab's draft. */
export const workspaceDraftKey = (userId: string, tabId: string) => `ioc_workspace_draft:${encodeURIComponent(userId)}:${tabId}`;

export function readWorkspaceDraft(storage: StorageReader, key: string, userId: string): WorkspaceDraft | null {
  try {
    const raw = storage.getItem(key);
    if (!raw || raw.length > 2_100_000) return null;
    const value = JSON.parse(raw) as WorkspaceDraft | null;
    return value?.userId === userId && Number.isInteger(value.basedOnVersion) && value.basedOnVersion >= 1 && validConfig(value.config) ? value : null;
  } catch { return null; }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** A stale draft remains available for export, never silently overwrites newer server data. */
export function reconcileWorkspaceDraft(server: WorkspaceConfig, version: number, draft: WorkspaceDraft | null) {
  // PostgreSQL JSONB may reorder object keys; a completed save is still the same configuration.
  if (!draft || stableJson(server) === stableJson(draft.config)) return { config: server, status: 'saved' as const };
  return { config: draft.config, status: draft.basedOnVersion === version ? 'pending' as const : 'conflict' as const };
}
