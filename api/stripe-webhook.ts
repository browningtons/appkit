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
//      Subscribe to: checkout.session.completed, charge.refunded,
//        charge.dispute.closed
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
  isFullRefund,
  paymentIntentIdFromCharge,
  recordEntitlement,
  revokeByPaymentIntent,
  serverModeEnabled,
  serverModePartiallyConfigured,
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

  // Half-configured server mode is the dangerous case, so it gets checked
  // first and it is NOT allowed to ack quietly.
  //
  // Supabase vars set + no webhook secret means someone intended server mode
  // and got two of the three vars. Acking 200 here would make Stripe record a
  // SUCCESSFUL delivery, so no failed-webhook alert ever fires, while the
  // entitlements table stays empty forever and real customers are told "no
  // purchase found" (see serverModeEnabled in _lib.ts for the full chain).
  //
  // 500 is deliberate: Stripe retries it and surfaces it as a failed delivery
  // in the dashboard. A retry storm is a nuisance; silently denying paying
  // customers is not. Loud beats quiet when the quiet version is invisible.
  if (serverModePartiallyConfigured()) {
    console.error(
      'stripe-webhook: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set but ' +
        'STRIPE_WEBHOOK_SECRET is missing. Server mode is half-configured: the ' +
        'entitlements table can never be written, so paying customers will be ' +
        'told "no purchase found". Set STRIPE_WEBHOOK_SECRET, or unset the ' +
        'Supabase vars to run in client mode.',
    );
    return res.status(500).json({
      error: 'server mode half-configured: STRIPE_WEBHOOK_SECRET is missing',
    });
  }

  // Genuinely not configured for server mode — ack and ignore, so adding this
  // route to a client-mode app stays harmless.
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
        // charge.refunded fires on partial refunds too — a $1 partial
        // refund on a $50 purchase must not revoke the whole entitlement.
        if (!isFullRefund(charge)) break;
        const pi = paymentIntentIdFromCharge(charge);
        if (pi) await revokeByPaymentIntent(pi);
        break;
      }
      case 'charge.dispute.closed': {
        const dispute = event.data.object;
        // Only a lost dispute means Stripe definitively pulled the funds
        // back — 'won' and the warning_* statuses leave the charge intact,
        // so there is nothing to revoke. A lost dispute is the same
        // buyer-keeps-the-product-and-the-money failure mode as
        // charge.refunded, just initiated by the cardholder's bank instead
        // of a manual refund — without this case it never reaches
        // revokeByPaymentIntent, so Pro stays granted forever.
        if (dispute.status !== 'lost') break;
        // Dispute events carry `charge` as a bare id, not expanded, so it
        // has to be fetched before payment_intent is readable.
        const charge =
          typeof dispute.charge === 'string'
            ? await stripe.charges.retrieve(dispute.charge)
            : dispute.charge;
        const pi = paymentIntentIdFromCharge(charge);
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
