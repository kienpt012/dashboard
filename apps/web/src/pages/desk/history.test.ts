import assert from 'node:assert/strict';
import test from 'node:test';
import { History } from './history';

test('lịch sử thao tác: hoàn tác rồi làm lại đúng thứ tự', () => {
  const history = new History<number>(50);
  history.push(1);
  history.push(2);
  history.push(3);
  assert.equal(history.undo(), 3);
  assert.equal(history.undo(), 2);
  assert.equal(history.redo(), 2);
  assert.equal(history.canUndo, true);
  assert.equal(history.canRedo, true);
});

test('lịch sử thao tác: thao tác mới xoá nhánh làm lại', () => {
  const history = new History<string>(50);
  history.push('a');
  history.push('b');
  history.undo();
  history.push('c');
  assert.equal(history.canRedo, false);
  assert.equal(history.redo(), undefined);
  assert.equal(history.undo(), 'c');
  assert.equal(history.undo(), 'a');
  assert.equal(history.undo(), undefined);
});

test('lịch sử thao tác: chỉ giữ 50 bước gần nhất', () => {
  const history = new History<number>(50);
  for (let step = 1; step <= 60; step += 1) history.push(step);
  let count = 0;
  let last: number | undefined;
  while (history.canUndo) {
    last = history.undo();
    count += 1;
  }
  assert.equal(count, 50);
  assert.equal(last, 11);
});
