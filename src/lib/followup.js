// Pure follow-up logic — no DB, no I/O — so the rules that decide "who do I
// chase today" are fully unit-testable. This is the heart of the product:
// research shows 48% of reps never follow up, and a standardized follow-up
// process lifts conversion ~78%. So we never let an open deal go cold.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days between two ISO timestamps (a - b), or null if a is missing. */
export function daysBetween(aIso, bIso) {
  if (!aIso) return null;
  return Math.floor((new Date(aIso).getTime() - new Date(bIso).getTime()) / DAY_MS);
}

/**
 * Classify a single deal's follow-up state relative to `now`.
 * Returns { needsFollowUp, reason, overdueDays, priority }.
 *   reason: 'due' (scheduled action is due) | 'cold' (no action + stale) | 'ok'
 *   priority: higher = more urgent (drives queue ordering)
 */
export function classifyDeal(deal, now = new Date(), staleDays = 3) {
  const nowIso = now instanceof Date ? now.toISOString() : now;

  if (deal.status && deal.status !== 'open') {
    return { needsFollowUp: false, reason: 'closed', overdueDays: 0, priority: -1 };
  }

  // 1) A scheduled next action that is due/overdue.
  if (deal.next_action_at) {
    const overdue = daysBetween(nowIso, deal.next_action_at); // whole days past due
    if (new Date(deal.next_action_at).getTime() <= new Date(nowIso).getTime()) {
      return {
        needsFollowUp: true,
        reason: 'due',
        overdueDays: Math.max(0, overdue),
        priority: 1000 + Math.max(0, overdue),
      };
    }
    // Scheduled in the future → not yet, and not cold (rep has a plan).
    return { needsFollowUp: false, reason: 'scheduled', overdueDays: 0, priority: 0 };
  }

  // 2) No scheduled action: has it gone cold since the last touch?
  const ref = deal.last_activity_at || deal.created_at;
  const idle = daysBetween(nowIso, ref);
  if (idle !== null && idle >= staleDays) {
    return {
      needsFollowUp: true,
      reason: 'cold',
      overdueDays: idle,
      priority: 500 + idle,
    };
  }

  return { needsFollowUp: false, reason: 'ok', overdueDays: 0, priority: 0 };
}

/**
 * Build the ordered "Hoje" follow-up queue from a list of deals.
 * Most urgent first (overdue scheduled actions, then coldest deals).
 */
export function followUpQueue(deals, now = new Date(), staleDays = 3) {
  return deals
    .map((d) => ({ deal: d, ...classifyDeal(d, now, staleDays) }))
    .filter((x) => x.needsFollowUp)
    .sort((a, b) => b.priority - a.priority);
}
