import { Router } from 'express';
import { db } from '../db.js';
import { config } from '../config.js';
import { requireAuth } from '../lib/auth.js';
import { classifyDeal, followUpQueue } from '../lib/followup.js';

const router = Router();
router.use(requireAuth);

const DEAL_SELECT = `
  SELECT d.*, c.name AS contact_name, c.company AS contact_company,
         s.name AS stage_name, s.kind AS stage_kind, s.position AS stage_position
    FROM deals d
    LEFT JOIN contacts c ON c.id = d.contact_id
    JOIN stages s ON s.id = d.stage_id
   WHERE d.rep_id = @rep`;

function loadDeals(repId, extra = '') {
  return db.prepare(`${DEAL_SELECT} ${extra}`).all({ rep: repId });
}

function decorate(deal) {
  const f = classifyDeal(deal, new Date(), config.staleDays);
  return { ...deal, followUp: { needs: f.needsFollowUp, reason: f.reason, overdueDays: f.overdueDays } };
}

// All deals (optionally ?status=open).
router.get('/', (req, res) => {
  const status = req.query.status;
  const extra = status ? 'AND d.status = @status ORDER BY d.created_at DESC' : 'ORDER BY d.created_at DESC';
  const rows = db.prepare(`${DEAL_SELECT} ${extra}`).all({ rep: req.rep.id, status });
  res.json(rows.map(decorate));
});

// Kanban board: stages with their open deals + value totals.
router.get('/board', (req, res) => {
  const stages = db
    .prepare('SELECT * FROM stages WHERE rep_id = ? ORDER BY position')
    .all(req.rep.id);
  const deals = loadDeals(req.rep.id, "AND d.status = 'open' ORDER BY d.next_action_at IS NULL, d.next_action_at").map(decorate);
  const board = stages.map((stage) => {
    const stageDeals = deals.filter((d) => d.stage_id === stage.id);
    return {
      ...stage,
      deals: stageDeals,
      totalCents: stageDeals.reduce((sum, d) => sum + d.value_cents, 0),
    };
  });
  res.json(board);
});

// The "Hoje" follow-up queue — the product's core feature.
router.get('/followup', (req, res) => {
  const deals = loadDeals(req.rep.id, "AND d.status = 'open'");
  const queue = followUpQueue(deals, new Date(), config.staleDays).map((q) => ({
    ...decorate(q.deal),
    reason: q.reason,
    overdueDays: q.overdueDays,
  }));
  res.json(queue);
});

// Header metrics.
router.get('/stats/summary', (req, res) => {
  const deals = loadDeals(req.rep.id, "AND d.status = 'open'");
  const openValue = deals.reduce((s, d) => s + d.value_cents, 0);
  const needFollow = followUpQueue(deals, new Date(), config.staleDays).length;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const wonThisMonth = db
    .prepare(
      "SELECT COUNT(*) c, COALESCE(SUM(value_cents),0) v FROM deals WHERE rep_id = ? AND status = 'won' AND closed_at >= ?",
    )
    .get(req.rep.id, monthStart);
  res.json({
    openCount: deals.length,
    openValueCents: openValue,
    needFollowUp: needFollow,
    wonThisMonthCount: wonThisMonth.c,
    wonThisMonthCents: wonThisMonth.v,
  });
});

// Single deal with its activity timeline.
router.get('/:id', (req, res) => {
  const deal = db.prepare(`${DEAL_SELECT} AND d.id = @id`).get({ rep: req.rep.id, id: req.params.id });
  if (!deal) return res.status(404).json({ error: 'Negócio não encontrado.' });
  const activities = db
    .prepare('SELECT * FROM activities WHERE deal_id = ? ORDER BY created_at DESC')
    .all(deal.id);
  res.json({ ...decorate(deal), activities });
});

function firstOpenStageId(repId) {
  return db
    .prepare("SELECT id FROM stages WHERE rep_id = ? AND kind = 'open' ORDER BY position LIMIT 1")
    .get(repId)?.id;
}

router.post('/', (req, res) => {
  const { title, value_cents, contact_id, stage_id, next_action, next_action_at } = req.body || {};
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Título do negócio é obrigatório.' });
  }
  let stageId = stage_id;
  if (stageId) {
    const ok = db.prepare('SELECT 1 FROM stages WHERE id = ? AND rep_id = ?').get(stageId, req.rep.id);
    if (!ok) return res.status(400).json({ error: 'Estágio inválido.' });
  } else {
    stageId = firstOpenStageId(req.rep.id);
  }
  if (contact_id) {
    const ok = db.prepare('SELECT 1 FROM contacts WHERE id = ? AND rep_id = ?').get(contact_id, req.rep.id);
    if (!ok) return res.status(400).json({ error: 'Contato inválido.' });
  }
  const info = db
    .prepare(
      `INSERT INTO deals (rep_id, contact_id, title, value_cents, stage_id, next_action, next_action_at, last_activity_at)
       VALUES (@rep, @contact, @title, @value, @stage, @na, @nat, datetime('now'))`,
    )
    .run({
      rep: req.rep.id,
      contact: contact_id || null,
      title: title.trim(),
      value: Math.max(0, Number(value_cents) || 0),
      stage: stageId,
      na: (next_action || '').trim() || null,
      nat: next_action_at || null,
    });
  const deal = db.prepare(`${DEAL_SELECT} AND d.id = @id`).get({ rep: req.rep.id, id: info.lastInsertRowid });
  res.status(201).json(decorate(deal));
});

router.patch('/:id', (req, res) => {
  const deal = db.prepare('SELECT * FROM deals WHERE id = ? AND rep_id = ?').get(req.params.id, req.rep.id);
  if (!deal) return res.status(404).json({ error: 'Negócio não encontrado.' });
  const b = req.body || {};
  db.prepare(
    `UPDATE deals SET title = ?, value_cents = ?, contact_id = ?, next_action = ?, next_action_at = ?
      WHERE id = ?`,
  ).run(
    (b.title ?? deal.title).toString().trim(),
    b.value_cents != null ? Math.max(0, Number(b.value_cents)) : deal.value_cents,
    b.contact_id !== undefined ? b.contact_id || null : deal.contact_id,
    b.next_action !== undefined ? (b.next_action || null) : deal.next_action,
    b.next_action_at !== undefined ? (b.next_action_at || null) : deal.next_action_at,
    deal.id,
  );
  const out = db.prepare(`${DEAL_SELECT} AND d.id = @id`).get({ rep: req.rep.id, id: deal.id });
  res.json(decorate(out));
});

// Move a deal to another stage. Terminal stages (won/lost) close the deal.
router.patch('/:id/stage', (req, res) => {
  const deal = db.prepare('SELECT * FROM deals WHERE id = ? AND rep_id = ?').get(req.params.id, req.rep.id);
  if (!deal) return res.status(404).json({ error: 'Negócio não encontrado.' });
  const stage = db.prepare('SELECT * FROM stages WHERE id = ? AND rep_id = ?').get(req.body?.stage_id, req.rep.id);
  if (!stage) return res.status(400).json({ error: 'Estágio inválido.' });

  const status = stage.kind === 'open' ? 'open' : stage.kind; // 'won' | 'lost'
  const closedAt = stage.kind === 'open' ? null : new Date().toISOString();
  db.prepare('UPDATE deals SET stage_id = ?, status = ?, closed_at = ? WHERE id = ?').run(
    stage.id, status, closedAt, deal.id,
  );
  const out = db.prepare(`${DEAL_SELECT} AND d.id = @id`).get({ rep: req.rep.id, id: deal.id });
  res.json(decorate(out));
});

// Log an activity (the 1-tap interaction). Keeps the deal warm and lets the rep
// schedule the next step in the same gesture, so leads never go cold.
router.post('/:id/activity', (req, res) => {
  const deal = db.prepare('SELECT * FROM deals WHERE id = ? AND rep_id = ?').get(req.params.id, req.rep.id);
  if (!deal) return res.status(404).json({ error: 'Negócio não encontrado.' });
  const { type, note, next_action, next_action_at } = req.body || {};
  const allowed = ['call', 'email', 'meeting', 'whatsapp', 'note'];
  const t = allowed.includes(type) ? type : 'note';

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO activities (rep_id, deal_id, type, note) VALUES (?, ?, ?, ?)').run(
      req.rep.id, deal.id, t, (note || '').trim() || null,
    );
    db.prepare(
      "UPDATE deals SET last_activity_at = datetime('now'), next_action = ?, next_action_at = ? WHERE id = ?",
    ).run((next_action || '').trim() || null, next_action_at || null, deal.id);
  });
  tx();

  const out = db.prepare(`${DEAL_SELECT} AND d.id = @id`).get({ rep: req.rep.id, id: deal.id });
  res.status(201).json(decorate(out));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM deals WHERE id = ? AND rep_id = ?').run(req.params.id, req.rep.id);
  if (!info.changes) return res.status(404).json({ error: 'Negócio não encontrado.' });
  res.json({ ok: true });
});

export default router;
