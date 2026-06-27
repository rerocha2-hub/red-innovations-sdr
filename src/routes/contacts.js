import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../lib/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM deals d WHERE d.contact_id = c.id AND d.status = 'open') AS open_deals
         FROM contacts c
        WHERE c.rep_id = ?
        ORDER BY c.name`,
    )
    .all(req.rep.id);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, company, email, phone, notes } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome do contato é obrigatório.' });
  }
  const info = db
    .prepare(
      'INSERT INTO contacts (rep_id, name, company, email, phone, notes) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      req.rep.id,
      name.trim(),
      (company || '').trim() || null,
      (email || '').trim() || null,
      (phone || '').trim() || null,
      (notes || '').trim() || null,
    );
  res.status(201).json(
    db.prepare('SELECT * FROM contacts WHERE id = ?').get(info.lastInsertRowid),
  );
});

router.patch('/:id', (req, res) => {
  const c = db
    .prepare('SELECT * FROM contacts WHERE id = ? AND rep_id = ?')
    .get(req.params.id, req.rep.id);
  if (!c) return res.status(404).json({ error: 'Contato não encontrado.' });
  const next = {
    name: req.body.name ?? c.name,
    company: req.body.company ?? c.company,
    email: req.body.email ?? c.email,
    phone: req.body.phone ?? c.phone,
    notes: req.body.notes ?? c.notes,
  };
  db.prepare(
    'UPDATE contacts SET name = ?, company = ?, email = ?, phone = ?, notes = ? WHERE id = ?',
  ).run(String(next.name).trim(), next.company, next.email, next.phone, next.notes, c.id);
  res.json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(c.id));
});

router.delete('/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM contacts WHERE id = ? AND rep_id = ?')
    .run(req.params.id, req.rep.id);
  if (!info.changes) return res.status(404).json({ error: 'Contato não encontrado.' });
  res.json({ ok: true });
});

export default router;
