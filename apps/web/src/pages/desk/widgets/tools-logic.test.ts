import assert from 'node:assert/strict';
import test from 'node:test';
import { canOpenPath, matchScreens, monogram, providerUrl } from './tools-logic';

const screens = [
  { path: '/admin', label: 'Bàn làm việc', keywords: 'ban lam viec trang chu', roles: ['ADMIN', 'STAFF', 'VIEWER'] as const },
  { path: '/admin/targets', label: 'Danh mục chỉ tiêu', keywords: 'chi tieu danh muc', roles: ['ADMIN', 'STAFF'] as const },
  { path: '/admin/approvals', label: 'Duyệt báo cáo', keywords: 'duyet bao cao', roles: ['ADMIN', 'MANAGER'] as const },
  { path: '/admin/reports', label: 'Báo cáo tổng hợp', keywords: 'bao cao tong hop xuat', roles: ['ADMIN', 'STAFF'] as const },
];

test('lối tắt trong hệ thống chỉ hiện khi vai trò được mở màn hình đó; đường dẫn lạ để máy chủ tự kiểm', () => {
  assert.equal(canOpenPath('/admin/approvals', 'STAFF', screens), false);
  assert.equal(canOpenPath('/admin/approvals', 'MANAGER', screens), true);
  assert.equal(canOpenPath('/admin/targets?status=OVERDUE&year=2026', 'STAFF', screens), true);
  assert.equal(canOpenPath('/admin/targets/abc123', 'STAFF', screens), true);
  assert.equal(canOpenPath('/admin/targets', 'VIEWER', screens), false);
  assert.equal(canOpenPath('/admin/khong-co', 'VIEWER', screens), true);
});

test('chữ cái đại diện của trang web ngoài lấy từ tên miền, bỏ www', () => {
  assert.equal(monogram('https://www.dichvucong.gov.vn/p/home'), 'D');
  assert.equal(monogram('https://thuvienphapluat.vn'), 'T');
  assert.equal(monogram('không phải địa chỉ'), '?');
});

test('gợi ý màn hình: tìm không dấu theo tên và từ khoá, chỉ màn hình được phép, giới hạn số dòng', () => {
  assert.deepEqual(matchScreens('bao cao', 'STAFF', screens, 5).map(item => item.path), ['/admin/reports']);
  assert.deepEqual(matchScreens('BÁO CÁO', 'MANAGER', screens, 5).map(item => item.path), ['/admin/approvals']);
  assert.deepEqual(matchScreens('', 'STAFF', screens, 5), []);
  assert.equal(matchScreens('a', 'ADMIN', screens, 2).length, 2);
});

test('địa chỉ trang tra cứu thay {q} bằng từ khoá đã mã hoá', () => {
  assert.equal(providerUrl('https://www.google.com/search?q={q}', 'hộ nghèo & cận nghèo'), 'https://www.google.com/search?q=h%E1%BB%99%20ngh%C3%A8o%20%26%20c%E1%BA%ADn%20ngh%C3%A8o');
});
