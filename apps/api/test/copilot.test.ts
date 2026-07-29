import assert from 'node:assert/strict';
import test from 'node:test';
import { ruleBasedPlan } from '../src/copilot';

test('Copilot định tuyến tổng quan năm mà không cần chờ LLM', () => {
  assert.deepEqual(ruleBasedPlan('Tình hình thực hiện năm 2026'), {
    intent: 'DASHBOARD_SUMMARY',
    year: 2026,
  });
});

test('Copilot nhận diện bộ lọc tiến độ chỉ tiêu', () => {
  const plan = ruleBasedPlan('Chỉ tiêu nào dưới 70%?');
  assert.equal(plan.intent, 'LIST_TARGETS');
  assert.equal(plan.belowProgress, 70);
});

test('Copilot giữ HELP cho câu chưa đủ rõ để LLM phân loại có giới hạn', () => {
  assert.deepEqual(ruleBasedPlan('Cho tôi biết thêm'), { intent: 'HELP' });
});
