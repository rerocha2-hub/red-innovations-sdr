import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { timeToMinutes } from '../lib/slots.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM availability WHERE business_id = ? ORDER BY weekday')
    .all(req.business.id);
  res.json(rows);
});

/**
 * Replace the full weekly schedule.
 * Body: { hours: [ { weekday, start_time, end_time }, ... ] }
 */
router.put('/', (req, res) => {
  const hours = Array.isArray(req.body?.hours) ? req.body.hours : [];
  for (const h of hours) {
    if (
      h.weekday < 0 || h.weekday > 6 ||
      !/^\d{2}:\d{2}$/.test(h.start_time) ||
      !/^\d{2}:\d{2}$/.test(h.end_time) ||
      timeToMinutes(h.start_time) >= timeToMinutes(h.end_time)
    ) {
      return res.status(400).json({ error: 'Horário inválido em um dos dias.' });
    }
  }
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM availability WHERE business_id = ?').run(req.business.id);
    const ins = db.prepare(
      'INSERT INTO availability (business_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)',
    );
    for (const h of hours) ins.run(req.business.id, h.weekday, h.start_time, h.end_time);
  });
  tx();
  res.json(
    db.prepare('SELECT * FROM availability WHERE business_id = ? ORDER BY weekday')
      .all(req.business.id),
  );
});

export default router;
