import type { DockItem } from '../types';

// Tính toán thuần của dock (có kiểm thử): phóng to theo con trỏ, sắp xếp, thư mục, sửa/xoá, huy hiệu số.

export const DOCK_MAX = 40;
export const DOCK_FOLDER_MAX = 12;

/** Hệ số phóng to biểu tượng theo khoảng cách (px) từ con trỏ tới tâm biểu tượng. */
export function magnifyScale(distance: number) {
  return Math.round((1 + 0.45 * Math.max(0, 1 - distance / 140)) * 1000) / 1000;
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}

/** Đưa một mục ở hàng dock vào thư mục; không lồng thư mục, không quá 12 mục — vi phạm thì trả null. */
export function moveIntoFolder(items: DockItem[], itemId: string, folderId: string): DockItem[] | null {
  const item = items.find(entry => entry.id === itemId);
  const target = items.find(entry => entry.id === folderId);
  if (!item || !target || target.kind !== 'folder' || item.kind === 'folder' || target.items.length >= DOCK_FOLDER_MAX) return null;
  return items.filter(entry => entry.id !== itemId).map(entry => (entry.id === folderId && entry.kind === 'folder' ? { ...entry, items: [...entry.items, item] } : entry));
}

/** Thư mục mới chứa mục `itemId`, đặt đúng chỗ của mục đó. */
export function newFolderWith(items: DockItem[], itemId: string, label: string, folderId: string): DockItem[] {
  return items.map(entry => (entry.id === itemId && entry.kind !== 'folder' ? { id: folderId, kind: 'folder', label, icon: 'folder', color: null, items: [entry] } : entry));
}

export function removeItem(items: DockItem[], itemId: string): DockItem[] {
  return items.filter(entry => entry.id !== itemId).map(entry => (entry.kind === 'folder' ? { ...entry, items: entry.items.filter(child => child.id !== itemId) } : entry));
}

export function replaceItem(items: DockItem[], item: DockItem): DockItem[] {
  return items.map(entry => (entry.id === item.id ? item : entry.kind === 'folder' ? { ...entry, items: entry.items.map(child => (child.id === item.id ? item : child)) } : entry));
}

export interface DockCounts {
  approvals: number;
  feedback: number;
  work: number;
}

/** Số trên huy hiệu của lối tắt tới Duyệt báo cáo, Phản ánh, Việc của tôi. */
export function badgeFor(path: string, counts: DockCounts) {
  const pathname = path.split(/[?#]/)[0];
  if (pathname === '/admin/approvals') return counts.approvals;
  if (pathname === '/admin/feedback') return counts.feedback;
  if (pathname === '/admin/viec-cua-toi') return counts.work;
  return 0;
}
