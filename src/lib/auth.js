import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db.js';

const COOKIE = 'agendapro_session';

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

export function issueToken(businessId) {
  return jwt.sign({ bid: businessId }, config.jwtSecret, { expiresIn: '30d' });
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

/** Express middleware: require a logged-in business, load it onto req.business. */
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    const { bid } = jwt.verify(token, config.jwtSecret);
    const business = db
      .prepare('SELECT * FROM businesses WHERE id = ?')
      .get(bid);
    if (!business) return res.status(401).json({ error: 'Sessão inválida.' });
    req.business = business;
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão expirada.' });
  }
}

/** True if the business may take new bookings (trial not expired OR paid). */
export function subscriptionActive(business) {
  if (business.plan_status === 'active') return true;
  if (business.plan_status === 'trialing') {
    return new Date(business.trial_ends_at).getTime() > Date.now();
  }
  return false;
}
