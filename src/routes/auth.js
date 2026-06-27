import { Router } from 'express';
import { db } from '../db.js';
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
import { uniqueSlug } from '../lib/slug.js';
import { sendMail, welcomeEmail } from '../lib/email.js';

const router = Router();

const DEFAULT_HOURS = [
  // weekday 1..5 (Mon-Fri) open 09:00-18:00 by default
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '18:00' })),
];

router.post('/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres.' });
  }
  const exists = db
    .prepare('SELECT 1 FROM businesses WHERE owner_email = ?')
    .get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });

  const trialEnds = new Date(
    Date.now() + config.trialDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const slug = uniqueSlug(name);

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO businesses (name, slug, owner_email, password_hash, trial_ends_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(name.trim(), slug, email.toLowerCase(), hashPassword(password), trialEnds);
    const bid = info.lastInsertRowid;

    const insHours = db.prepare(
      'INSERT INTO availability (business_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)',
    );
    for (const h of DEFAULT_HOURS) insHours.run(bid, h.weekday, h.start, h.end);

    // A starter service so the booking page works immediately.
    db.prepare(
      'INSERT INTO services (business_id, name, duration_min, price_cents) VALUES (?, ?, ?, ?)',
    ).run(bid, 'Atendimento padrão', 30, 0);

    return bid;
  });

  const bid = tx();
  const business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(bid);

  const bookingUrl = `${config.appUrl}/book/${business.slug}`;
  sendMail(welcomeEmail(business, bookingUrl)).catch(() => {});

  setSessionCookie(res, issueToken(bid));
  res.status(201).json({ ok: true, slug: business.slug });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const business = db
    .prepare('SELECT * FROM businesses WHERE owner_email = ?')
    .get(String(email || '').toLowerCase());
  if (!business || !verifyPassword(password || '', business.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  }
  setSessionCookie(res, issueToken(business.id));
  res.json({ ok: true, slug: business.slug });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const b = req.business;
  res.json({
    id: b.id,
    name: b.name,
    slug: b.slug,
    email: b.owner_email,
    planStatus: b.plan_status,
    trialEndsAt: b.trial_ends_at,
    subscriptionActive: subscriptionActive(b),
    planPriceLabel: config.planPriceLabel,
    bookingUrl: `${config.appUrl}/book/${b.slug}`,
  });
});

export default router;
