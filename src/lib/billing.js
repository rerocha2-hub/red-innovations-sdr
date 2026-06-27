import Stripe from 'stripe';
import { config } from '../config.js';
import { db } from '../db.js';

const stripe = config.stripe.enabled
  ? new Stripe(config.stripe.secretKey)
  : null;

export const billingEnabled = Boolean(stripe);

/**
 * Create a Checkout Session for a monthly subscription.
 * When Stripe is not configured we fall back to a "stub" mode that activates
 * the plan immediately and returns a local success URL — so the whole flow is
 * demonstrable without real keys.
 */
export async function createCheckout(rep) {
  if (!stripe) {
    db.prepare("UPDATE reps SET plan_status = 'active' WHERE id = ?").run(rep.id);
    return { url: `${config.appUrl}/dashboard?billing=stub-activated`, stub: true };
  }

  let customerId = rep.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: rep.email,
      name: rep.name,
      metadata: { rep_id: String(rep.id) },
    });
    customerId = customer.id;
    db.prepare('UPDATE reps SET stripe_customer_id = ? WHERE id = ?').run(
      customerId,
      rep.id,
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: config.stripe.priceId, quantity: 1 }],
    success_url: `${config.appUrl}/dashboard?billing=success`,
    cancel_url: `${config.appUrl}/dashboard?billing=canceled`,
    metadata: { rep_id: String(rep.id) },
  });
  return { url: session.url, stub: false };
}

/** Verify and parse a Stripe webhook event from the raw request body. */
export function parseWebhook(rawBody, signature) {
  if (!stripe || !config.stripe.webhookSecret) return null;
  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    config.stripe.webhookSecret,
  );
}

/** Apply a subscription state change coming from Stripe to the DB. */
export function applySubscriptionStatus(customerId, status) {
  const map = {
    active: 'active',
    trialing: 'active',
    past_due: 'past_due',
    canceled: 'canceled',
    unpaid: 'past_due',
  };
  const plan = map[status] || 'past_due';
  db.prepare('UPDATE reps SET plan_status = ? WHERE stripe_customer_id = ?').run(
    plan,
    customerId,
  );
}
