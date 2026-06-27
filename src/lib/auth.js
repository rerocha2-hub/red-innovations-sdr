import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db.js';

const COOKIE = 'pipesolo_session';

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

export function issueToken(repId) {
  return jwt.sign({ rid: repId }, config.jwtSecret, { expiresIn: '30d' });
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: config.appUrl.startsWith('https'),
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE);
}

/** Express middleware: require a logged-in rep, load it onto req.rep. */
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    const { rid } = jwt.verify(token, config.jwtSecret);
    const rep = db.prepare('SELECT * FROM reps WHERE id = ?').get(rid);
    if (!rep) return res.status(401).json({ error: 'Sessão inválida.' });
    req.rep = rep;
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão expirada.' });
  }
}

/** True if the rep's account is usable (trial not expired OR paid). */
export function subscriptionActive(rep) {
  if (rep.plan_status === 'active') return true;
  if (rep.plan_status === 'trialing') {
    return new Date(rep.trial_ends_at).getTime() > Date.now();
  }
  return false;
}
