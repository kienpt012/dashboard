import { App } from 'antd';
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useMe } from '@/app/session';
import { ApiError, errorText } from '@/lib/api';
import { deskApi } from './api';
import { History } from './history';
import type { DeskBreakpoint, DeskPayload, DeskProfileConfig, DeskSpace, DeskSpaceConfig, FocusDepartment, WidgetDefinition } from './types';

// Kho trạng thái của bàn làm việc: vẽ ngay từ bản lưu trên máy, tải bản mới ngầm; mọi thay đổi tự lưu sau 0,7 giây
// ngừng sửa (mỗi đích — hồ sơ, từng không gian — một hàng đợi riêng); hoàn tác/làm lại 50 bước; lệch phiên bản thì
// hỏi người dùng thay vì ghi đè.

const SAVE_DELAY = 700;
const COALESCE_MS = 1500;
const CACHE_PREFIX = 'ioc_desk_v1:';
const ACTIVE_PREFIX = 'ioc_desk_active:';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'offline';
type Target = 'profile' | `space:${string}`;
type SpaceDraft = { name: string; icon: string; config: DeskSpaceConfig };
type Entry =
  | { kind: 'profile'; before: DeskProfileConfig; after: DeskProfileConfig; key?: string; at: number }
  | { kind: 'space'; id: string; before: SpaceDraft; after: SpaceDraft; key?: string; at: number };

export interface DeskSnapshot {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  profile: { config: DeskProfileConfig; version: number } | null;
  spaces: DeskSpace[];
  focusDepartments: FocusDepartment[];
  catalog: WidgetDefinition[];
  activeSpaceId: string | null;
  editing: boolean;
  breakpoint: DeskBreakpoint;
  previewBreakpoint: DeskBreakpoint | null;
  save: SaveState;
  conflict: null | { kind: 'profile' | 'space'; id?: string };
  canUndo: boolean;
  canRedo: boolean;
}

type Notify = { error: (text: string) => void; success: (text: string) => void };

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* bộ nhớ trình duyệt đầy hoặc bị chặn — bỏ qua, lần sau tải từ máy chủ */
  }
}

const isNetwork = (error: unknown) => error instanceof ApiError && error.status === 0;
const isConflict = (error: unknown) => error instanceof ApiError && error.status === 409;

export class DeskStore {
  private snapshot: DeskSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly history = new History<Entry>(50);
  private readonly timers = new Map<Target, number>();
  private readonly inFlight = new Set<Target>();
  private readonly dirty = new Set<Target>();

  constructor(private readonly userId: string, private readonly notify: Notify) {
    const cached = readJson<DeskPayload & { catalog: WidgetDefinition[] }>(CACHE_PREFIX + userId);
    const active = readJson<string>(ACTIVE_PREFIX + userId);
    this.snapshot = {
      status: cached ? 'ready' : 'loading',
      profile: cached?.profile ?? null,
      spaces: cached?.spaces ?? [],
      focusDepartments: cached?.focusDepartments ?? [],
      catalog: cached?.catalog ?? [],
      activeSpaceId: cached?.spaces.some(space => space.id === active) ? active : cached?.spaces[0]?.id ?? null,
      editing: false,
      breakpoint: 'desktop',
      previewBreakpoint: null,
      save: 'idle',
      conflict: null,
      canUndo: false,
      canRedo: false,
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  private set(patch: Partial<DeskSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch, canUndo: this.history.canUndo, canRedo: this.history.canRedo };
    for (const listener of this.listeners) listener();
  }

  private persistCache() {
    const { profile, spaces, focusDepartments, catalog } = this.snapshot;
    if (profile) writeJson(CACHE_PREFIX + this.userId, { profile, spaces, focusDepartments, catalog });
  }

  private apply(payload: DeskPayload, catalog?: WidgetDefinition[]) {
    const keep = (target: Target) => this.dirty.has(target) || this.inFlight.has(target);
    const profile = keep('profile') && this.snapshot.profile ? this.snapshot.profile : payload.profile;
    const spaces = payload.spaces.map(space => (keep(`space:${space.id}`) ? this.snapshot.spaces.find(item => item.id === space.id) ?? space : space));
    const active = spaces.some(space => space.id === this.snapshot.activeSpaceId) ? this.snapshot.activeSpaceId : spaces[0]?.id ?? null;
    this.set({ status: 'ready', error: undefined, profile, spaces, focusDepartments: payload.focusDepartments, activeSpaceId: active, ...(catalog ? { catalog } : {}) });
    this.persistCache();
  }

  async load() {
    try {
      const [payload, catalog] = await Promise.all([deskApi.load(), deskApi.catalog()]);
      this.apply(payload, catalog);
    } catch (error) {
      if (this.snapshot.status === 'ready') {
        this.set({ save: isNetwork(error) ? 'offline' : this.snapshot.save });
        if (!isNetwork(error)) this.notify.error(errorText(error, 'Không tải được bàn làm việc'));
      } else {
        this.set({ status: 'error', error: errorText(error, 'Không tải được bàn làm việc') });
      }
    }
  }

  widgetDef(type: string) {
    return this.snapshot.catalog.find(def => def.type === type);
  }

  setActiveSpace = (id: string) => {
    if (!this.snapshot.spaces.some(space => space.id === id)) return;
    writeJson(ACTIVE_PREFIX + this.userId, id);
    this.set({ activeSpaceId: id });
  };

  setEditing = (editing: boolean) => this.set({ editing, previewBreakpoint: editing ? this.snapshot.previewBreakpoint : null });
  setBreakpoint = (breakpoint: DeskBreakpoint) => {
    if (breakpoint !== this.snapshot.breakpoint) this.set({ breakpoint });
  };
  setPreviewBreakpoint = (previewBreakpoint: DeskBreakpoint | null) => this.set({ previewBreakpoint });

  private record(entry: Entry) {
    const now = Date.now();
    const last = this.history.peek();
    if (entry.key && last && !this.history.canRedo && last.key === entry.key && now - last.at < COALESCE_MS && last.kind === entry.kind && (last.kind === 'profile' || (entry.kind === 'space' && last.id === entry.id))) {
      last.after = entry.after as never;
      last.at = now;
      return;
    }
    this.history.push({ ...entry, at: now });
  }

  updateProfile = (recipe: (config: DeskProfileConfig) => DeskProfileConfig, options: { coalesce?: string; history?: boolean } = {}) => {
    const profile = this.snapshot.profile;
    if (!profile) return;
    const after = recipe(profile.config);
    if (after === profile.config) return;
    if (options.history !== false) this.record({ kind: 'profile', before: profile.config, after, key: options.coalesce, at: 0 });
    this.set({ profile: { ...profile, config: after } });
    this.schedule('profile');
  };

  updateSpace = (id: string, recipe: (config: DeskSpaceConfig) => DeskSpaceConfig, options: { name?: string; icon?: string; coalesce?: string; history?: boolean } = {}) => {
    const space = this.snapshot.spaces.find(item => item.id === id);
    if (!space) return;
    const config = recipe(space.config);
    const name = options.name ?? space.name;
    const icon = options.icon ?? space.icon;
    if (config === space.config && name === space.name && icon === space.icon) return;
    if (options.history !== false) {
      this.record({ kind: 'space', id, before: { name: space.name, icon: space.icon, config: space.config }, after: { name, icon, config }, key: options.coalesce, at: 0 });
    }
    this.set({ spaces: this.snapshot.spaces.map(item => (item.id === id ? { ...item, name, icon, config } : item)) });
    this.schedule(`space:${id}`);
  };

  private applyEntry(entry: Entry, side: 'before' | 'after') {
    if (entry.kind === 'profile') {
      const profile = this.snapshot.profile;
      if (!profile) return;
      this.set({ profile: { ...profile, config: entry[side] } });
      this.schedule('profile');
      return;
    }
    const draft = entry[side];
    if (!this.snapshot.spaces.some(space => space.id === entry.id)) return;
    this.set({ spaces: this.snapshot.spaces.map(space => (space.id === entry.id ? { ...space, ...draft } : space)) });
    this.schedule(`space:${entry.id}`);
  }

  undo = () => {
    const entry = this.history.undo();
    if (entry) this.applyEntry(entry, 'before');
    else this.set({});
  };

  redo = () => {
    const entry = this.history.redo();
    if (entry) this.applyEntry(entry, 'after');
    else this.set({});
  };

  private schedule(target: Target) {
    this.dirty.add(target);
    const existing = this.timers.get(target);
    if (existing) window.clearTimeout(existing);
    this.timers.set(target, window.setTimeout(() => void this.saveTarget(target), SAVE_DELAY));
  }

  /** Lưu ngay mọi thay đổi đang chờ (rời trang, ẩn tab). */
  flush = () => {
    for (const [target, timer] of this.timers) {
      window.clearTimeout(timer);
      void this.saveTarget(target);
    }
    this.timers.clear();
  };

  private async saveTarget(target: Target) {
    this.timers.delete(target);
    if (this.inFlight.has(target)) return;
    if (!this.dirty.has(target)) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.set({ save: 'offline' });
      return;
    }
    this.dirty.delete(target);
    this.inFlight.add(target);
    this.set({ save: 'saving' });
    try {
      if (target === 'profile') {
        const profile = this.snapshot.profile;
        if (profile) {
          const result = await deskApi.saveProfile(profile.config, profile.version);
          const current = this.snapshot.profile!;
          this.set({ profile: { ...current, version: result.version } });
        }
      } else {
        const id = target.slice('space:'.length);
        const space = this.snapshot.spaces.find(item => item.id === id);
        if (space) {
          const result = await deskApi.saveSpace(id, { name: space.name, icon: space.icon, config: space.config, expectedVersion: space.version });
          this.set({ spaces: this.snapshot.spaces.map(item => (item.id === id ? { ...item, version: result.version } : item)) });
        }
      }
      this.inFlight.delete(target);
      if (this.dirty.has(target)) {
        void this.saveTarget(target);
        return;
      }
      this.set({ save: this.inFlight.size || this.dirty.size ? 'saving' : 'saved' });
      this.persistCache();
    } catch (error) {
      this.inFlight.delete(target);
      if (isConflict(error)) {
        this.set({ save: 'error', conflict: target === 'profile' ? { kind: 'profile' } : { kind: 'space', id: target.slice('space:'.length) } });
      } else if (isNetwork(error)) {
        this.dirty.add(target);
        this.set({ save: 'offline' });
      } else {
        this.dirty.add(target);
        this.set({ save: 'error' });
        this.notify.error(errorText(error, 'Không lưu được bàn làm việc'));
      }
    }
  }

  /** Có mạng trở lại: lưu những gì còn dở. */
  retry = () => {
    for (const target of this.dirty) void this.saveTarget(target);
  };

  resolveConflict = async (choice: 'theirs' | 'mine') => {
    const conflict = this.snapshot.conflict;
    if (!conflict) return;
    const target: Target = conflict.kind === 'profile' ? 'profile' : `space:${conflict.id}`;
    try {
      const fresh = await deskApi.load();
      if (choice === 'theirs') {
        this.dirty.delete(target);
        this.history.clear();
        this.set({ conflict: null });
        this.apply(fresh);
        return;
      }
      if (conflict.kind === 'profile' && this.snapshot.profile) {
        this.set({ profile: { ...this.snapshot.profile, version: fresh.profile.version } });
      } else {
        const remote = fresh.spaces.find(space => space.id === conflict.id);
        if (!remote) {
          this.set({ conflict: null });
          this.dirty.delete(target);
          this.apply(fresh);
          this.notify.error('Không gian này đã bị xoá ở nơi khác');
          return;
        }
        this.set({ spaces: this.snapshot.spaces.map(space => (space.id === remote.id ? { ...space, version: remote.version } : space)) });
      }
      this.set({ conflict: null });
      this.dirty.add(target);
      await this.saveTarget(target);
    } catch (error) {
      this.notify.error(errorText(error, 'Không tải được bản mới nhất'));
    }
  };

  addSpace = async (name: string, icon: string, copyFromId?: string) => {
    try {
      const space = await deskApi.createSpace({ name, icon, copyFromId });
      this.set({ spaces: [...this.snapshot.spaces, space] });
      this.setActiveSpace(space.id);
      this.persistCache();
      return space.id;
    } catch (error) {
      this.notify.error(errorText(error, 'Không tạo được không gian'));
      return undefined;
    }
  };

  removeSpace = async (id: string) => {
    try {
      const timer = this.timers.get(`space:${id}`);
      if (timer) window.clearTimeout(timer);
      this.dirty.delete(`space:${id}`);
      await deskApi.deleteSpace(id);
      const spaces = this.snapshot.spaces.filter(space => space.id !== id);
      this.set({ spaces, activeSpaceId: this.snapshot.activeSpaceId === id ? spaces[0]?.id ?? null : this.snapshot.activeSpaceId });
      this.persistCache();
    } catch (error) {
      this.notify.error(errorText(error, 'Không xoá được không gian'));
    }
  };

  moveSpace = async (id: string, toIndex: number) => {
    const spaces = [...this.snapshot.spaces];
    const from = spaces.findIndex(space => space.id === id);
    if (from < 0 || toIndex < 0 || toIndex >= spaces.length || from === toIndex) return;
    const [moved] = spaces.splice(from, 1);
    spaces.splice(toIndex, 0, moved);
    this.set({ spaces });
    try {
      await deskApi.orderSpaces(spaces.map(space => space.id));
      this.persistCache();
    } catch (error) {
      this.notify.error(errorText(error, 'Không sắp xếp được không gian'));
      void this.load();
    }
  };

  reset = async () => {
    try {
      for (const timer of this.timers.values()) window.clearTimeout(timer);
      this.timers.clear();
      this.dirty.clear();
      const payload = await deskApi.reset();
      this.history.clear();
      this.set({ editing: false });
      this.apply(payload);
      this.setActiveSpace(payload.spaces[0]?.id ?? '');
      this.notify.success('Đã khôi phục bàn làm việc mẫu');
    } catch (error) {
      this.notify.error(errorText(error, 'Không khôi phục được bàn làm việc'));
    }
  };
}

const DeskContext = createContext<DeskStore | null>(null);

export function DeskProvider({ children }: { children: ReactNode }) {
  const user = useMe();
  const { message } = App.useApp();
  const [store] = useState(() => new DeskStore(user.id, { error: text => message.error(text), success: text => message.success(text) }));

  useEffect(() => {
    void store.load();
    const online = () => store.retry();
    const hide = () => {
      if (document.visibilityState === 'hidden') store.flush();
    };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', hide);
      store.flush();
    };
  }, [store]);

  return <DeskContext.Provider value={store}>{children}</DeskContext.Provider>;
}

export function useDeskStore(): DeskStore {
  const store = useContext(DeskContext);
  if (!store) throw new Error('useDesk phải nằm trong DeskProvider');
  return store;
}

/** Trạng thái bàn làm việc + thao tác. */
export function useDesk() {
  const store = useDeskStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return useMemo(() => ({ ...snapshot, store }), [snapshot, store]);
}

/** Không gian đang mở. */
export function useActiveSpace() {
  const { spaces, activeSpaceId } = useDesk();
  return spaces.find(space => space.id === activeSpaceId) ?? spaces[0] ?? null;
}
