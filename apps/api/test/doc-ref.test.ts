import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { docRef, docRefText } from '../src/doc-ref';
import { attachDocRefs } from '../src/doc-ref.interceptor';

test('văn bản giao: bốn mức ưu tiên, khoảng trắng, STT và cấp giao', () => {
  const framework = { name: 'Kế hoạch năm', legalBasis: 'Quyết định số 333/QĐ-UBND ngày 01/01/2026', issuingLevel: 'PROVINCE' as const, sourceDocument: { docNumber: '444/QĐ-UBND' } };
  assert.equal(docRef({ sourceDocument: { docNumber: ' 555/QĐ-UBND ' }, framework }).docRef, '555/QĐ-UBND');
  assert.equal(docRef({ framework }).docRef, '444/QĐ-UBND');
  assert.equal(docRef({ framework: { ...framework, sourceDocument: null } }).docRef, '333/QĐ-UBND');
  assert.equal(docRef({ framework: { name: 'Kế hoạch năm' } }).docRef, 'Kế hoạch năm');
  assert.deepEqual(docRef({}), { docRef: null, issuingLevel: null, ordinal: null });
  assert.equal(docRefText({}), '');
  assert.equal(docRefText({ ordinal: '3', framework }), 'STT 3 · 444/QĐ-UBND · Tỉnh/Thành phố giao');
  assert.equal(docRef({ framework: { name: 'N'.repeat(100) } }).docRef?.length, 78);
});

test('bổ sung tham chiếu chỉ truy vấn ID đã có trong phản hồi, không mở rộng dữ liệu', async () => {
  let where: any;
  const prisma = { target: { findMany: async (args: any) => { where = args.where; return [{ id: 'visible', ordinal: '2', framework: { name: 'Kế hoạch' } }]; } } };
  const data = { items: [{ id: 'visible', code: 'CT-2026-1', title: 'Thu ngân sách' }], alert: { targetId: 'visible' } };
  await attachDocRefs(prisma as any, data);
  assert.deepEqual(where, { id: { in: ['visible'] } });
  assert.equal((data.items[0] as any).docRef, 'Kế hoạch');
  assert.equal((data.alert as any).ordinal, '2');
  assert.equal(data.items.length, 1);
});
