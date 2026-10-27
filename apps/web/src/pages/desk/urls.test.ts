import assert from 'node:assert/strict';
import test from 'node:test';
import { hostOf, isInternalPath, isSafeUrl } from './urls';

test('URL ngoài phía giao diện: cùng quy tắc với máy chủ', () => {
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeUrl('https://user:pw@a.vn'), false);
  assert.equal(isSafeUrl('ftp://a.vn/file'), false);
  assert.equal(isSafeUrl('https://dichvucong.gov.vn/p/home'), true);
  assert.equal(isSafeUrl('http://10.0.0.5:8080/camera'), true);
});

test('đường dẫn nội bộ phía giao diện: cùng quy tắc với máy chủ', () => {
  assert.equal(isInternalPath('/admin/targets?status=OVERDUE'), true);
  assert.equal(isInternalPath('/trinh-chieu'), true);
  assert.equal(isInternalPath('//evil.com'), false);
  assert.equal(isInternalPath('/api/users'), false);
  assert.equal(isInternalPath('/administrator'), false);
  assert.equal(isInternalPath('/admin/../api'), false);
});

test('tên miền hiển thị của lối tắt', () => {
  assert.equal(hostOf('https://www.dichvucong.gov.vn/p/home'), 'dichvucong.gov.vn');
  assert.equal(hostOf('không phải url'), '');
});
