import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDeal, followUpQueue, daysBetween } from '../src/lib/followup.js';

const NOW = new Date('2026-06-27T12:00:00Z');
const iso = (d) => new Date(d).toISOString();
function daysAgo(n) { return iso(NOW.getTime() - n * 86400000); }
function daysAhead(n) { return iso(NOW.getTime() + n * 86400000); }

test('daysBetween computes whole-day difference', () => {
  assert.equal(daysBetween(daysAhead(0), daysAgo(3)), 3);
  assert.equal(daysBetween(null, daysAgo(1)), null);
});

test('scheduled action that is due flags follow-up as "due"', () => {
  const c = classifyDeal({ status: 'open', next_action_at: daysAgo(2) }, NOW, 3);
  assert.equal(c.needsFollowUp, true);
  assert.equal(c.reason, 'due');
  assert.equal(c.overdueDays, 2);
});

test('scheduled action in the future does not flag follow-up', () => {
  const c = classifyDeal({ status: 'open', next_action_at: daysAhead(2) }, NOW, 3);
  assert.equal(c.needsFollowUp, false);
  assert.equal(c.reason, 'scheduled');
});

test('no scheduled action + stale last activity flags "cold"', () => {
  const c = classifyDeal({ status: 'open', last_activity_at: daysAgo(5) }, NOW, 3);
  assert.equal(c.needsFollowUp, true);
  assert.equal(c.reason, 'cold');
  assert.equal(c.overdueDays, 5);
});

test('recent activity with no scheduled action is OK', () => {
  const c = classifyDeal({ status: 'open', last_activity_at: daysAgo(1) }, NOW, 3);
  assert.equal(c.needsFollowUp, false);
  assert.equal(c.reason, 'ok');
});

test('closed (won/lost) deals never need follow-up', () => {
  assert.equal(classifyDeal({ status: 'won', next_action_at: daysAgo(10) }, NOW, 3).needsFollowUp, false);
  assert.equal(classifyDeal({ status: 'lost', last_activity_at: daysAgo(99) }, NOW, 3).needsFollowUp, false);
});

test('queue lists only deals needing follow-up, most urgent first', () => {
  const deals = [
    { id: 'future', status: 'open', next_action_at: daysAhead(1) },        // excluded
    { id: 'cold5', status: 'open', last_activity_at: daysAgo(5) },         // cold, prio 505
    { id: 'due3', status: 'open', next_action_at: daysAgo(3) },            // due, prio 1003
    { id: 'fresh', status: 'open', last_activity_at: daysAgo(0) },         // excluded
    { id: 'won', status: 'won', next_action_at: daysAgo(20) },            // excluded
  ];
  const q = followUpQueue(deals, NOW, 3);
  assert.deepEqual(q.map((x) => x.deal.id), ['due3', 'cold5']);
});
