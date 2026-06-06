// Vercel serverless function: verifies a Stripe purchase for Pro unlock.
//
// Two modes:
//   GET  /api/verify-purchase?session_id=cs_...   → post-checkout confirmation
//   POST /api/verify-purchase  { email: "..." }    → manual restore
//
// Returns { verified: boolean } in both cases. We intentionally do not leak
// anything else — the frontend only needs yes/no.
//
// Environment variables (set in Vercel project settings):
//   STRIPE_SECRET_KEY  — Stripe secret key (sk_live_... or sk_test_...)
//   STRIPE_PRICE_ID    — Pro tier price ID  (e.g. price_1ABC...)
//   STRIPE_PRODUCT_ID  — Pro tier product ID (e.g. prod_ABC...)
//
// Both PRICE and PRODUCT are checked because Stripe occasionally rotates
// prices under the same product (e.g. promotional pricing). Either match
// counts as verified.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Rate limiting.
//
// The POST (email restore) path is the abuse surface: unauthenticated, and
// each call fans out to several Stripe API requests. Without a limit it's an
// email-enumeration oracle and a cheap way to burn the account's Stripe rate
// limit. This is a best-effort in-memory limiter — it dampens bursts within a
// single warm serverless instance but does NOT survive cold starts or span
// concurrent instances. For production-grade limiting, back it with a shared
// store (Vercel KV / Upstash). It is deliberately dependency-free so the
// starter works on a bare Vercel project.
// ---------------------------------------------------------------------------

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_HITS = 8;
const rateBuckets = new Map<string, number[]>();

function clientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  return raw?.split(',')[0]?.trim() || 'unknown';
}

/** Returns true if this IP has exceeded the window budget. */
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const hits = (rateBuckets.get(ip) ?? []).filter((t) => t > cutoff);
  hits.push(now);
  rateBuckets.set(ip, hits);
  return hits.length > RATE_MAX_HITS;
}

export function lineItemMatchesPro(
  items: Stripe.ApiList<Stripe.LineItem> | null | undefined,
  priceId: string,
  productId: string,
): boolean {
  if (!items?.data) return false;
  return items.data.some((li) => {
    const liPriceId = li.price?.id;
    const liProductId =
      typeof li.price?.product === 'string'
        ? li.price.product
        : li.price?.product?.id;
    return liPriceId === priceId || liProductId === productId;
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  const productId = process.env.STRIPE_PRODUCT_ID;

  if (!secret || !priceId || !productId) {
    return res.status(500).json({ error: 'server not configured' });
  }

  if (isRateLimited(clientIp(req))) {
    return res.status(429).json({ error: 'too many requests' });
  }

  const stripe = new Stripe(secret);

  try {
    if (req.method === 'GET') {
      const sessionId = req.query.session_id;
      if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
        return res.status(400).json({ error: 'missing session_id' });
      }
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['line_items'],
      });
      const paid = session.payment_status === 'paid';
      const matches = lineItemMatchesPro(session.line_items, priceId, productId);
      return res.status(200).json({ verified: paid && matches });
    }

    if (req.method === 'POST') {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'missing email' });
      }
      const target = email.toLowerCase();

      // Fast path: if Stripe created a Customer for this email (the common
      // case when checkout collects an email), look it up directly and list
      // only that customer's sessions. This is O(buyers-with-this-email)
      // instead of O(all recent sessions), so it stays correct past the
      // ~500-buyer ceiling of the scan below. Single quotes are stripped to
      // keep the search query well-formed.
      const customers = await stripe.customers.search({
        query: `email:'${target.replace(/'/g, '')}'`,
        limit: 10,
      });
      for (const cust of customers.data) {
        const sessions = await stripe.checkout.sessions.list({
          customer: cust.id,
          limit: 100,
          expand: ['data.line_items'],
        });
        const hit = sessions.data.find(
          (s) =>
            s.payment_status === 'paid' &&
            lineItemMatchesPro(s.line_items, priceId, productId),
        );
        if (hit) return res.status(200).json({ verified: true });
      }

      // Fallback: scan recent paid Checkout Sessions. `sessions.list` doesn't
      // support email filtering, so we page through the most recent results.
      // This catches guest checkouts where no Customer object was created.
      // For launch volume this is fine — revisit if Pro buyers exceed ~500.
      const MAX_PAGES = 5;
      let startingAfter: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const batch = await stripe.checkout.sessions.list({
          limit: 100,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });
        const hit = batch.data.find(
          (s) =>
            s.payment_status === 'paid' &&
            s.customer_details?.email?.toLowerCase() === target,
        );
        if (hit) {
          const full = await stripe.checkout.sessions.retrieve(hit.id, {
            expand: ['line_items'],
          });
          return res
            .status(200)
            .json({ verified: lineItemMatchesPro(full.line_items, priceId, productId) });
        }
        if (!batch.has_more) break;
        startingAfter = batch.data[batch.data.length - 1]?.id;
      }
      return res.status(200).json({ verified: false });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('verify-purchase error', err);
    return res.status(500).json({ error: 'verification failed' });
  }
}
