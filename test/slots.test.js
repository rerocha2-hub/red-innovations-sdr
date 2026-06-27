import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  timeToMinutes,
  minutesToTime,
  generateCandidates,
  overlaps,
  availableSlots,
} from '../src/lib/slots.js';

test('timeToMinutes / minutesToTime round-trip', () => {
  assert.equal(timeToMinutes('09:30'), 570);
  assert.equal(minutesToTime(570), '09:30');
  assert.equal(minutesToTime(0), '00:00');
});

test('generateCandidates steps by duration and fits before close', () => {
  const c = generateCandidates('09:00', '10:00', 30);
  assert.deepEqual(c, ['09:00', '09:30']); // 10:00 would not fit a 30min slot
});

test('generateCandidates honors a custom step', () => {
  const c = generateCandidates('09:00', '10:00', 30, 15);
  assert.deepEqual(c, ['09:00', '09:15', '09:30']);
});

test('overlaps detects intersection correctly', () => {
  assert.ok(overlaps(540, 570, 555, 600));   // partial overlap
  assert.ok(!overlaps(540, 570, 570, 600));  // touching, no overlap
  assert.ok(!overlaps(540, 570, 600, 630));  // disjoint
});

test('availableSlots removes booked intervals', () => {
  const slots = availableSlots({
    startTime: '09:00',
    endTime: '12:00',
    durationMin: 60,
    booked: [{ start: '10:00', end: '11:00' }],
  });
  assert.deepEqual(slots, ['09:00', '11:00']);
});

test('availableSlots hides past slots when nowMinutes given', () => {
  const slots = availableSlots({
    startTime: '09:00',
    endTime: '12:00',
    durationMin: 60,
    booked: [],
    nowMinutes: timeToMinutes('10:30'),
  });
  assert.deepEqual(slots, ['11:00']);
});
