import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../lib/auth.js';

const router = Router();
router.use(requireAuth);

// List appointments, optionally filtered by ?from=ISO&to=ISO&status=
router.get('/', (req, res) => {
  const { from, to, status } = req.query;
  const clauses = ['a.business_id = ?'];
  const params = [req.business.id];
  if (from) { clauses.push('a.starts_at >= ?'); params.push(from); }
  if (to) { clauses.push('a.starts_at <= ?'); params.push(to); }
  if (status) { clauses.push('a.status = ?'); params.push(status); }
  const rows = db
    .prepare(
      `SELECT a.*, s.name AS service_name, s.duration_min, s.price_cents
         FROM appointments a
         JOIN services s ON s.id = a.service_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY a.starts_at ASC`,
    )
    .all(...params);
  res.json(rows);
});

router.patch('/:id/cancel', (req, res) => {
  const info = db
    .prepare(
      "UPDATE appointments SET status = 'canceled' WHERE id = ? AND business_id = ?",
    )
    .run(req.params.id, req.business.id);
  if (!info.changes) return res.status(404).json({ error: 'Agendamento não encontrado.' });
  res.json({ ok: true });
});

// Simple stats for the dashboard header.
router.get('/stats/summary', (req, res) => {
  const now = new Date().toISOString();
  const upcoming = db
    .prepare(
      "SELECT COUNT(*) c FROM appointments WHERE business_id = ? AND status = 'confirmed' AND starts_at >= ?",
    )
    .get(req.business.id, now).c;
  const total = db
    .prepare("SELECT COUNT(*) c FROM appointments WHERE business_id = ? AND status = 'confirmed'")
    .get(req.business.id).c;
  const revenue = db
    .prepare(
      `SELECT COALESCE(SUM(s.price_cents),0) cents
         FROM appointments a JOIN services s ON s.id = a.service_id
        WHERE a.business_id = ? AND a.status = 'confirmed'`,
    )
    .get(req.business.id).cents;
  res.json({ upcoming, total, revenueCents: revenue });
});

export default router;
