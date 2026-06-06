// Stripe webhook → durable entitlement (server-entitlement mode).
//
// Wire this up when you want access to survive a closed tab, work across
// devices (via restore-by-email), and be revoked on refund. It's a no-op
// safety-wise if you don't: the route only does work when SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY + STRIPE_WEBHOOK_SECRET are all set.
//
// Setup:
//   1. Run the migration in supabase/migrations/ against your project.
//   2. Stripe Dashboard → Developers → Webhooks → add endpoint:
//        https://<your-app>/api/stripe-webhook
//      Subscribe to: checkout.session.completed, charge.refunded
//   3. Copy the signing secret into STRIPE_WEBHOOK_SECRET (Vercel env).
//
// Local testing:
//   stripe listen --forward-to localhost:3000/api/stripe-webhook
//   stripe trigger checkout.session.completed
//
// Environment variables:
//   STRIPE_SECRET_KEY          — Stripe secret key
//   STRIPE_PRICE_ID            — Pro tier price ID
//   STRIPE_PRODUCT_ID          — Pro tier product ID
//   STRIPE_WEBHOOK_SECRET      — webhook signing secret (whsec_...)
//   SUPABASE_URL               — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY  — service role key (server-only)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import {
  entitlementFromSession,
  recordEntitlement,
  revokeByPaymentIntent,
  serverModeEnabled,
} from './_lib';

// Stripe signature verification needs the exact raw request bytes, so opt out
// of Vercel's automatic body parsing for this route.
export const config = { api: { bodyParser: false } };

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  const productId = process.env.STRIPE_PRODUCT_ID;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // If server mode or the webhook secret isn't configured, ack and ignore so
  // adding this route to a client-mode app is harmless.
  if (!secret || !priceId || !productId || !webhookSecret || !serverModeEnabled()) {
    return res.status(200).json({ received: true, handled: false });
  }

  const stripe = new Stripe(secret);

  let event: Stripe.Event;
  try {
    const raw = await readRawBody(req);
    const sig = req.headers['stripe-signature'];
    if (typeof sig !== 'string') {
      return res.status(400).json({ error: 'missing signature' });
    }
    event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
  } catch (err) {
    console.error('stripe-webhook signature verification failed', err);
    return res.status(400).json({ error: 'invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        // The webhook session isn't line-item-expanded; retrieve it so the
        // Pro match in entitlementFromSession has data to work with.
        const full = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ['line_items'],
        });
        const row = entitlementFromSession(full, priceId, productId);
        if (row) await recordEntitlement(row);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object;
        const pi =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : (charge.payment_intent?.id ?? null);
        if (pi) await revokeByPaymentIntent(pi);
        break;
      }
      default:
        // Unhandled event types are fine — Stripe sends many we don't need.
        break;
    }
    return res.status(200).json({ received: true, handled: true });
  } catch (err) {
    // Return 500 so Stripe retries — the handler is idempotent (upsert by
    // session id; refund update is a no-op if already refunded).
    console.error('stripe-webhook handler error', err);
    return res.status(500).json({ error: 'handler failed' });
  }
}
