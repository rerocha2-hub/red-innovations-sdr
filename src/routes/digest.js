import { Router } from 'express';
import { db } from '../db.js';
import { config } from '../config.js';
import { followUpQueue } from '../lib/followup.js';
import { sendMail, followUpDigestEmail } from '../lib/email.js';

const router = Router();

/**
 * Send each rep their daily follow-up digest. Meant to be triggered by a cron
 * job (e.g. Make/Zapier or a scheduled task) hitting this endpoint once a
 * morning — the "envia e-mails enquanto você dorme" automation from the brief.
 * Protected by a shared secret so it isn't publicly triggerable.
 */
router.post('/run', async (req, res) => {
  const secret = req.headers['x-digest-secret'] || req.query.secret;
  if (config.jwtSecret && secret !== config.jwtSecret) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  const reps = db.prepare('SELECT * FROM reps').all();
  let sent = 0;
  for (const rep of reps) {
    const deals = db
      .prepare("SELECT * FROM deals WHERE rep_id = ? AND status = 'open'")
      .all(rep.id);
    const queue = followUpQueue(deals, new Date(), config.staleDays);
    if (queue.length === 0) continue;
    await sendMail(followUpDigestEmail(rep, queue)).catch(() => {});
    sent += 1;
  }
  res.json({ ok: true, repsNotified: sent });
});

export default router;
