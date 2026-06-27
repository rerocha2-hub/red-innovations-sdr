// Pure slot-generation logic — no DB, no I/O, so it is easy to unit-test.

/** Convert "HH:MM" to minutes since midnight. */
export function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Convert minutes since midnight to "HH:MM". */
export function minutesToTime(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Generate candidate start times (as "HH:MM") within a working window,
 * stepping by `stepMin` and ensuring a full `durationMin` fits before close.
 */
export function generateCandidates(startTime, endTime, durationMin, stepMin = 0) {
  const step = stepMin > 0 ? stepMin : durationMin;
  const open = timeToMinutes(startTime);
  const close = timeToMinutes(endTime);
  const out = [];
  for (let t = open; t + durationMin <= close; t += step) {
    out.push(minutesToTime(t));
  }
  return out;
}

/** Does [aStart,aEnd) overlap [bStart,bEnd)?  Values are minutes. */
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Given working hours, the service duration, and already-booked intervals
 * (each {start:"HH:MM", end:"HH:MM"}), return the list of free start times.
 * `nowMinutes` (optional) removes slots already in the past for "today".
 */
export function availableSlots({
  startTime,
  endTime,
  durationMin,
  booked = [],
  stepMin = 0,
  nowMinutes = null,
}) {
  const candidates = generateCandidates(startTime, endTime, durationMin, stepMin);
  return candidates.filter((slot) => {
    const s = timeToMinutes(slot);
    const e = s + durationMin;
    if (nowMinutes !== null && s < nowMinutes) return false;
    return !booked.some((b) =>
      overlaps(s, e, timeToMinutes(b.start), timeToMinutes(b.end)),
    );
  });
}
