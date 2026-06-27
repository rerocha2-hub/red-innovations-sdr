import { Router } from 'express';
import { db, DEFAULT_STAGES } from '../db.js';
import { config } from '../config.js';
import {
  hashPassword,
  verifyPassword,
  issueToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  subscriptionActive,
} from '../lib/auth.js';
import { sendMail, welcomeEmail } from '../lib/email.js';

const router = Router();

router.post('/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres.' });
  }
  const exists = db.prepare('SELECT 1 FROM reps WHERE email = ?').get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });

  const trialEnds = new Date(
    Date.now() + config.trialDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        'INSERT INTO reps (name, email, password_hash, trial_ends_at) VALUES (?, ?, ?, ?)',
      )
      .run(name.trim(), email.toLowerCase(), hashPassword(password), trialEnds);
    const rid = info.lastInsertRowid;

    const insStage = db.prepare(
      'INSERT INTO stages (rep_id, name, position, kind) VALUES (?, ?, ?, ?)',
    );
    DEFAULT_STAGES.forEach((s, i) => insStage.run(rid, s.name, i, s.kind));
    return rid;
  });

  const rid = tx();
  const rep = db.prepare('SELECT * FROM reps WHERE id = ?').get(rid);
  sendMail(welcomeEmail(rep)).catch(() => {});

  setSessionCookie(res, issueToken(rid));
  res.status(201).json({ ok: true });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const rep = db
    .prepare('SELECT * FROM reps WHERE email = ?')
    .get(String(email || '').toLowerCase());
  if (!rep || !verifyPassword(password || '', rep.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  }
  setSessionCookie(res, issueToken(rep.id));
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const r = req.rep;
  res.json({
    id: r.id,
    name: r.name,
    email: r.email,
    planStatus: r.plan_status,
    trialEndsAt: r.trial_ends_at,
    subscriptionActive: subscriptionActive(r),
    planPriceLabel: config.planPriceLabel,
  });
});

export default router;
