import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../lib/auth.js';

const router = Router();
router.use(requireAuth);

// List the rep's pipeline stages (used to populate selects on the frontend).
router.get('/stages', (req, res) => {
  const rows = db
    .prepare('SELECT id, name, position, kind FROM stages WHERE rep_id = ? ORDER BY position')
    .all(req.rep.id);
  res.json(rows);
});

export default router;
