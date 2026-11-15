import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { ApiError, errorText, http, session } from '@/lib/api';
import { defaultConfig, migrateConfig, validConfig, type WorkspaceConfig } from './model';
import { allocateWorkspaceTab, readWorkspaceDraft, reconcileWorkspaceDraft, workspaceDraftKey } from './workspace-draft';

type Response = { config: WorkspaceConfig | null; version: number };
let documentTab: { id: string; recoveryId: string | null } | undefined;
const recoveredUsers = new Set<string>();
function tabId() {
  if (documentTab) return documentTab;
  try {
    documentTab = allocateWorkspaceTab(sessionStorage);
  } catch { documentTab = { id: crypto.randomUUID(), recoveryId: null }; }
  return documentTab;
}

export function useWorkspace(userId: string) {
  const [config, setConfigState] = useState(() => defaultConfig(session.user?.role));
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<'loading'|'saved'|'pending'|'saving'|'error'|'conflict'>('loading');
  const [error, setError] = useState('');
  const [draftTab] = useState(tabId);
  const draftKey = workspaceDraftKey(userId, draftTab.id);
  const current = useRef(config);
  const version = useRef(1);
  const draftVersion = useRef(1);
  const saved = useRef('');
  const saving = useRef<number | null>(null);
  const blocked = useRef(false);
  const conflicted = useRef(false);
  const alive = useRef(true);
  const isReady = useRef(false);
  const generation = useRef(0);
  const ownsSession = useCallback(() => session.user?.id === userId && !!session.token, [userId]);

  const persistDraft = useCallback((next: WorkspaceConfig) => {
    if (!ownsSession()) return;
    try {
      if (JSON.stringify(next) === saved.current) localStorage.removeItem(draftKey);
      else localStorage.setItem(draftKey, JSON.stringify({ userId, basedOnVersion: draftVersion.current, config: next }));
    } catch {
      // Server saving continues. The close-page warning remains active until that save succeeds.
      setError('Trình duyệt không lưu được bản nháp trên thiết bị. Hãy đợi trạng thái “Đã đồng bộ” trước khi rời trang.');
    }
  }, [draftKey, ownsSession, userId]);

  const setConfig = useCallback((action: SetStateAction<WorkspaceConfig>) => {
    if (!alive.current || !isReady.current || !ownsSession()) return;
    const next = typeof action === 'function' ? action(current.current) : action;
    current.current = next;
    // Persist synchronously, before routing can unmount the component or cancel the debounce.
    persistDraft(next);
    setConfigState(next);
  }, [ownsSession, persistDraft]);

  const load = useCallback(async (recoverDraft: boolean) => {
    const requestGeneration = ++generation.current;
    const token = session.token;
    isReady.current = false;
    setReady(false); setStatus('loading'); setError(''); blocked.current = false; conflicted.current = false;
    if (!ownsSession()) return;
    try {
      const result = await http.get<Response>('/workspace');
      if (!alive.current || requestGeneration !== generation.current || !ownsSession() || token !== session.token) return;
      if (result.config && !validConfig(result.config)) throw new Error('Cấu hình bàn làm việc không hợp lệ. Hãy kiểm tra bản sao đã xuất.');
      const server = result.config ? migrateConfig(result.config) : defaultConfig(session.user?.role);
      let draft = null;
      if (recoverDraft) {
        try {
          draft = readWorkspaceDraft(localStorage, draftKey, userId)
            ?? (!recoveredUsers.has(userId) && draftTab.recoveryId ? readWorkspaceDraft(localStorage, workspaceDraftKey(userId, draftTab.recoveryId), userId) : null);
          if (draft) draft = { ...draft, config: migrateConfig(draft.config) };
        } catch { /* Storage can be disabled. */ }
      }
      const restored = reconcileWorkspaceDraft(server, result.version, draft);
      recoveredUsers.add(userId);
      version.current = result.version;
      draftVersion.current = restored.status === 'conflict' && draft ? draft.basedOnVersion : result.version;
      saved.current = JSON.stringify(server); current.current = restored.config;
      blocked.current = conflicted.current = restored.status === 'conflict';
      if (restored.status === 'saved') {
        try { localStorage.removeItem(draftKey); } catch { /* Nothing pending to recover. */ }
      } else {
        persistDraft(restored.config);
      }
      if (restored.status === 'conflict') setError('Bản nháp trên thiết bị được tạo từ phiên bản cũ. Bạn có thể xuất bản sao để giữ thay đổi, sau đó tải bản đã lưu trên máy chủ.');
      setConfigState(restored.config); isReady.current = true; setReady(true); setStatus(restored.status);
    } catch (err) {
      if (alive.current && requestGeneration === generation.current && ownsSession()) { setError(errorText(err)); setStatus('error'); }
    }
  }, [draftKey, draftTab.recoveryId, ownsSession, persistDraft, userId]);

  useEffect(() => {
    alive.current = true; void load(true);
    return () => { alive.current = false; isReady.current = false; generation.current++; };
  }, [load]);

  const save = useCallback(async () => {
    const runGeneration = generation.current;
    const token = session.token;
    if (saving.current === runGeneration || blocked.current || !alive.current || !isReady.current || !ownsSession()) return;
    saving.current = runGeneration;
    const stillCurrent = () => alive.current && runGeneration === generation.current && ownsSession() && token === session.token;
    try {
      while (stillCurrent() && JSON.stringify(current.current) !== saved.current) {
        const snapshot = JSON.stringify(current.current);
        setStatus('saving'); setError('');
        // The owner check is adjacent to http.put: a queued save never uses another user's new token.
        const result = await http.put<Response>('/workspace', { config: JSON.parse(snapshot), expectedVersion: version.current });
        if (!stillCurrent()) return;
        version.current = result.version; draftVersion.current = result.version; saved.current = snapshot;
        persistDraft(current.current);
      }
      if (stillCurrent()) setStatus('saved');
    } catch (err) {
      if (stillCurrent()) {
        blocked.current = true;
        conflicted.current = err instanceof ApiError && err.status === 409;
        setStatus(conflicted.current ? 'conflict' : 'error'); setError(errorText(err));
      }
    } finally { if (saving.current === runGeneration) saving.current = null; }
  }, [ownsSession, persistDraft]);

  useEffect(() => {
    if (!ready || blocked.current || JSON.stringify(config) === saved.current) return;
    setStatus('pending');
    const timer = window.setTimeout(() => void save(), 850);
    return () => clearTimeout(timer);
  }, [config, ready, save]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (isReady.current && JSON.stringify(current.current) !== saved.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  const retry = () => { if (!conflicted.current) { blocked.current = false; void save(); } };
  const keepLocal = async () => {
    if (!conflicted.current || !ownsSession()) return;
    const runGeneration = generation.current;
    const token = session.token;
    setStatus('saving');
    try {
      // Explicit conflict resolution still uses CAS: a third edit between GET and PUT returns 409.
      const result = await http.get<Response>('/workspace');
      if (!alive.current || generation.current !== runGeneration || !ownsSession() || token !== session.token) return;
      version.current = result.version; draftVersion.current = result.version;
      persistDraft(current.current);
      blocked.current = false; conflicted.current = false;
      await save();
    } catch (err) {
      if (alive.current && generation.current === runGeneration && ownsSession() && token === session.token) {
        setStatus('conflict'); setError(errorText(err));
      }
    }
  };
  // Initial loading failures must still recover a pending draft on Retry. Once ready,
  // the caller's confirmed "load server version" action explicitly discards that draft.
  const reload = () => load(!isReady.current);
  return { config, setConfig, ready, status, error, reload, retry, keepLocal };
}
