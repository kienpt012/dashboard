import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreatePublicFeedbackDto,
  feedbackCodeYear,
  LOOKUP_SECRET_MAX_LENGTH,
  LOOKUP_SECRET_MIN_LENGTH,
  TrackFeedbackDto,
  VersionedSecretDto,
} from '../src/feedback';

test('mã phản ánh dùng năm lịch Việt Nam tại biên giao thừa', () => {
  assert.equal(feedbackCodeYear(new Date('2026-12-31T16:59:59.999Z')), 2026);
  assert.equal(feedbackCodeYear(new Date('2026-12-31T17:00:00.000Z')), 2027);
});

function lookupSecretIsValid<T extends object>(
  dto: ClassConstructor<T>,
  payload: Record<string, unknown>,
) {
  return !validateSync(plainToInstance(dto, payload))
    .some(error => error.property === 'lookupSecret');
}

test('lookup secret uses the same 20-64 bounds for create, tracking and citizen mutations', () => {
  assert.equal(LOOKUP_SECRET_MIN_LENGTH, 20);
  assert.equal(LOOKUP_SECRET_MAX_LENGTH, 64);

  const dtoPayloads: Array<[ClassConstructor<object>, Record<string, unknown>]> = [
    [CreatePublicFeedbackDto, {}],
    [TrackFeedbackDto, { code: 'PA-2026-12345678' }],
    [VersionedSecretDto, { expectedVersion: 1 }],
  ];

  for (const length of [20, 40, 41, 64]) {
    for (const [dto, payload] of dtoPayloads) {
      assert.equal(lookupSecretIsValid(dto, { ...payload, lookupSecret: 's'.repeat(length) }), true);
    }
  }

  for (const length of [19, 65]) {
    for (const [dto, payload] of dtoPayloads) {
      assert.equal(lookupSecretIsValid(dto, { ...payload, lookupSecret: 's'.repeat(length) }), false);
    }
  }
});
