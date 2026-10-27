import assert from 'node:assert/strict';
import test from 'node:test';
import type { DockItem } from '../types';
import { DOCK_FOLDER_MAX, badgeFor, magnifyScale, moveIntoFolder, moveItem, newFolderWith, removeItem, replaceItem } from './dock-logic';

const link = (id: string): DockItem => ({ id, kind: 'link', url: `https://${id}.vn`, label: id, icon: 'global', color: null });
const folder = (id: string, items: DockItem[]): DockItem => ({ id, kind: 'folder', label: id, icon: 'folder', color: null, items });

test('phóng to theo khoảng cách con trỏ: 1,45 lần ngay dưới con trỏ, giảm dần, từ 140px trở ra giữ nguyên', () => {
  assert.equal(magnifyScale(0), 1.45);
  assert.equal(magnifyScale(70), 1.225);
  assert.equal(magnifyScale(140), 1);
  assert.equal(magnifyScale(400), 1);
});

test('kéo sắp xếp: chuyển mục tới vị trí mới, vị trí ngoài phạm vi thì kẹp lại', () => {
  const items = [link('a'), link('b'), link('c'), link('d')];
  assert.deepEqual(moveItem(items, 0, 2).map(item => item.id), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveItem(items, 3, 0).map(item => item.id), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveItem(items, 1, 99).map(item => item.id), ['a', 'c', 'd', 'b']);
});

test('đưa vào thư mục: rời hàng dock, thêm cuối thư mục; không lồng thư mục, không quá 12 mục', () => {
  const items = [link('a'), folder('f', [link('x')]), link('b')];
  assert.deepEqual(
    moveIntoFolder(items, 'a', 'f')?.map(item => (item.kind === 'folder' ? `${item.id}[${item.items.map(child => child.id).join(',')}]` : item.id)),
    ['f[x,a]', 'b'],
  );
  assert.equal(moveIntoFolder([folder('g', []), folder('f', [])], 'g', 'f'), null);
  const full = folder('f', Array.from({ length: DOCK_FOLDER_MAX }, (_, index) => link(`c${index}`)));
  assert.equal(moveIntoFolder([link('a'), full], 'a', 'f'), null);
});

test('tạo thư mục mới từ một mục: thư mục đứng đúng chỗ mục cũ', () => {
  const result = newFolderWith([link('a'), link('b'), link('c')], 'b', 'Tra cứu', 'f1');
  assert.deepEqual(result.map(item => item.id), ['a', 'f1', 'c']);
  assert.equal(result[1].kind === 'folder' && result[1].items[0].id, 'b');
});

test('sửa, xoá mục ở hàng dock hoặc trong thư mục', () => {
  const items = [link('a'), folder('f', [link('x'), link('y')])];
  assert.deepEqual(removeItem(items, 'x').map(item => (item.kind === 'folder' ? item.items.map(child => child.id).join(',') : item.id)), ['a', 'y']);
  const renamed = replaceItem(items, { ...link('y'), label: 'Mới' });
  assert.equal(renamed[1].kind === 'folder' && renamed[1].items[1].label, 'Mới');
});

test('huy hiệu số: duyệt báo cáo, phản ánh, việc của tôi; bỏ qua bộ lọc trong đường dẫn', () => {
  const counts = { approvals: 3, feedback: 0, work: 12 };
  assert.equal(badgeFor('/admin/approvals', counts), 3);
  assert.equal(badgeFor('/admin/feedback?status=RECEIVED', counts), 0);
  assert.equal(badgeFor('/admin/viec-cua-toi', counts), 12);
  assert.equal(badgeFor('/admin/targets', counts), 0);
});
