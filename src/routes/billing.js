import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import {
  createCheckout,
  billingEnabled,
  parseWebhook,
  applySubscriptionStatus,
} from '../lib/billing.js';

const router = Router();

router.get('/status', requireAuth, (req, res) => {
  res.json({ stripeEnabled: billingEnabled, planStatus: req.business.plan_status });
});

// Start a subscription checkout (real Stripe or local stub).
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const { url, stub } = await createCheckout(req.business);
    res.json({ url, stub });
  } catch (err) {
    console.error('checkout error', err);
    res.status(500).json({ error: 'Não foi possível iniciar o checkout.' });
  }
});

// Stripe webhook. Body is the raw buffer (see server.js mounting).
router.post('/webhook', (req, res) => {
  let event;
  try {
    event = parseWebhook(req.body, req.headers['stripe-signature']);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }
  if (!event) return res.status(200).json({ ignored: true });

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      applySubscriptionStatus(sub.customer, sub.status);
      break;
    }
    default:
      break;
  }
  res.json({ received: true });
});

export default router;
