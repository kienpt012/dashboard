// Bản lưu số liệu phòng trên máy để bàn làm việc hiện số ngay khi mở (rồi tải bản mới). Khoá gồm người dùng để người
// đăng nhập sau trên cùng máy không thấy số liệu của người trước; mỗi người giữ vài bản mới nhất; đăng xuất xoá hết.

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const PREFIX = 'ioc_desk_data_v1:';
const KEEP = 6;

export const dataCacheKey = (userId: string, departmentId: string, year: number) => `${PREFIX}${userId}:${departmentId}:${year}`;

function keysOf(storage: StorageLike, prefix: string) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

export function readDataCache<T>(storage: StorageLike, key: string): { savedAt: number; data: T } | undefined {
  try {
    const raw = storage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; data?: T };
    return typeof parsed.savedAt === 'number' && parsed.data !== undefined ? { savedAt: parsed.savedAt, data: parsed.data } : undefined;
  } catch {
    return undefined;
  }
}

export function writeDataCache(storage: StorageLike, userId: string, key: string, data: unknown, now = Date.now()) {
  try {
    storage.setItem(key, JSON.stringify({ savedAt: now, data }));
    const mine = keysOf(storage, `${PREFIX}${userId}:`)
      .map(entry => ({ entry, savedAt: readDataCache(storage, entry)?.savedAt ?? 0 }))
      .sort((a, b) => b.savedAt - a.savedAt);
    for (const { entry } of mine.slice(KEEP)) storage.removeItem(entry);
  } catch {
    // Bộ nhớ đầy hoặc bị chặn: bỏ qua, lần sau tải từ máy chủ.
  }
}

export function clearDataCache(storage: StorageLike) {
  try {
    for (const key of keysOf(storage, PREFIX)) storage.removeItem(key);
  } catch {
    // ignore
  }
}
