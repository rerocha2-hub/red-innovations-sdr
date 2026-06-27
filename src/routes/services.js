import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../lib/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM services WHERE business_id = ? ORDER BY active DESC, name')
    .all(req.business.id);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, duration_min, price_cents } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nome do serviço é obrigatório.' });
  const dur = Number(duration_min) || 30;
  if (dur < 5 || dur > 480) {
    return res.status(400).json({ error: 'Duração deve estar entre 5 e 480 minutos.' });
  }
  const info = db
    .prepare(
      'INSERT INTO services (business_id, name, duration_min, price_cents) VALUES (?, ?, ?, ?)',
    )
    .run(req.business.id, name.trim(), dur, Math.max(0, Number(price_cents) || 0));
  res.status(201).json(
    db.prepare('SELECT * FROM services WHERE id = ?').get(info.lastInsertRowid),
  );
});

router.patch('/:id', (req, res) => {
  const svc = db
    .prepare('SELECT * FROM services WHERE id = ? AND business_id = ?')
    .get(req.params.id, req.business.id);
  if (!svc) return res.status(404).json({ error: 'Serviço não encontrado.' });
  const name = req.body.name ?? svc.name;
  const dur = req.body.duration_min ?? svc.duration_min;
  const price = req.body.price_cents ?? svc.price_cents;
  const active = req.body.active ?? svc.active;
  db.prepare(
    'UPDATE services SET name = ?, duration_min = ?, price_cents = ?, active = ? WHERE id = ?',
  ).run(String(name).trim(), Number(dur), Number(price), active ? 1 : 0, svc.id);
  res.json(db.prepare('SELECT * FROM services WHERE id = ?').get(svc.id));
});

router.delete('/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM services WHERE id = ? AND business_id = ?')
    .run(req.params.id, req.business.id);
  if (!info.changes) return res.status(404).json({ error: 'Serviço não encontrado.' });
  res.json({ ok: true });
});

export default router;
