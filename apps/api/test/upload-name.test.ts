import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadFileName } from '../src/upload-name';

test('tên tệp tiếng Việt bị multer đọc theo latin1 được đổi lại đúng', () => {
  const sent = 'Báo cáo thử nghiệm tên tiếng Việt.pdf';
  const misread = Buffer.from(sent, 'utf8').toString('latin1');
  assert.equal(uploadFileName(misread), sent);
  assert.equal(uploadFileName(Buffer.from('café.pdf', 'utf8').toString('latin1')), 'café.pdf');
});

test('tên đã đúng hoặc chỉ có chữ ASCII giữ nguyên', () => {
  assert.equal(uploadFileName('Quyết định 333.pdf'), 'Quyết định 333.pdf');
  assert.equal(uploadFileName('report-2026.pdf'), 'report-2026.pdf');
  assert.equal(uploadFileName('naïve.pdf'), 'naïve.pdf');
  assert.equal(uploadFileName(''), '');
});
