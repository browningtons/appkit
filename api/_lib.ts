// Shared server-side helpers for the appkit payment routes.
//
// Files prefixed with `_` are NOT turned into Vercel routes, so this is a safe
// place for code imported by verify-purchase.ts and stripe-webhook.ts.
//
// SERVER ENTITLEMENT MODE
// -----------------------
// The kit works with zero backend store: entitlement lives in the browser and
// is re-verified against Stripe on demand. That's the default ("client" mode).
//
// Setting these env vars upgrades an app to durable, server-side entitlement
// ("server" mode) WITH NO CODE CHANGE:
//
//   SUPABASE_URL                — project URL
//   SUPABASE_SERVICE_ROLE_KEY   — service role key (server-only, bypasses RLS)
//   STRIPE_WEBHOOK_SECRET       — signing secret for the stripe-webhook route
//
// In server mode:
//   - the Stripe webhook records each paid Checkout Session in the
//     `entitlements` table (so a buyer who closes the tab still gets access),
//   - refunds flip the row to `refunded` (revoking access),
//   - restore-by-email reads the table instead of scanning Stripe (fast,
//     correct past ~500 buyers, and refund-aware).

import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Stripe line-item matching
// ---------------------------------------------------------------------------

// Both PRICE and PRODUCT are checked because Stripe occasionally rotates
// prices under the same product (e.g. promotional pricing). Either match
// counts as verified.
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

// Stripe uses `no_payment_required` when a completed Checkout Session is
// reduced to $0 by a promotion. It is settled even though no charge exists.
export function sessionIsSettled(
  status: Stripe.Checkout.Session['payment_status'],
): boolean {
  return status === 'paid' || status === 'no_payment_required';
}

// ---------------------------------------------------------------------------
// Entitlement row mapping (pure — unit tested)
// ---------------------------------------------------------------------------

export interface EntitlementRow {
  stripe_session_id: string;
  email: string;
  stripe_customer_id: string | null;
  stripe_payment_intent_id: string | null;
  product_id: string;
  price_id: string;
  status: 'active' | 'refunded';
}

/**
 * Turn a (line-items-expanded) Checkout Session into an active entitlement
 * row, or return null if it shouldn't grant access. Pure: no network, no env.
 *
 * Returns null when the session is not settled (paid or no_payment_required),
 * has no email, or its line items don't match the configured Pro price/product.
 */
export function entitlementFromSession(
  session: Stripe.Checkout.Session,
  priceId: string,
  productId: string,
): EntitlementRow | null {
  if (!sessionIsSettled(session.payment_status)) return null;

  const email = session.customer_details?.email?.trim().toLowerCase();
  if (!email) return null;

  if (!lineItemMatchesPro(session.line_items, priceId, productId)) return null;

  const customer =
    typeof session.customer === 'string'
      ? session.customer
      : (session.customer?.id ?? null);
  const paymentIntent =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  return {
    stripe_session_id: session.id,
    email,
    stripe_customer_id: customer,
    stripe_payment_intent_id: paymentIntent,
    product_id: productId,
    price_id: priceId,
    status: 'active',
  };
}

// ---------------------------------------------------------------------------
// Supabase (server entitlement store)
// ---------------------------------------------------------------------------

/** True when the app is configured for durable server-side entitlement. */
export function serverModeEnabled(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

let cachedClient: SupabaseClient | null = null;

/** Returns a service-role Supabase client, or null if server mode is off. */
export function getSupabase(): SupabaseClient | null {
  if (!serverModeEnabled()) return null;
  if (!cachedClient) {
    cachedClient = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      { auth: { persistSession: false } },
    );
  }
  return cachedClient;
}

const TABLE = 'entitlements';

/** Upsert an active entitlement. No-op (returns false) if server mode is off. */
export async function recordEntitlement(row: EntitlementRow): Promise<boolean> {
  const db = getSupabase();
  if (!db) return false;
  const { error } = await db
    .from(TABLE)
    .upsert({ ...row, updated_at: new Date().toISOString() }, {
      onConflict: 'stripe_session_id',
    });
  if (error) {
    console.error('recordEntitlement error', error);
    return false;
  }
  return true;
}

/** Flip any entitlement(s) for a payment intent to refunded. */
export async function revokeByPaymentIntent(
  paymentIntentId: string,
): Promise<boolean> {
  const db = getSupabase();
  if (!db) return false;
  const { error } = await db
    .from(TABLE)
    .update({ status: 'refunded', updated_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', paymentIntentId);
  if (error) {
    console.error('revokeByPaymentIntent error', error);
    return false;
  }
  return true;
}

/**
 * Does this email have an active entitlement in the durable store?
 * Returns null if server mode is off (caller should fall back to Stripe).
 */
export async function emailHasActiveEntitlement(
  email: string,
): Promise<boolean | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from(TABLE)
    .select('stripe_session_id')
    .eq('email', email.trim().toLowerCase())
    .eq('status', 'active')
    .limit(1);
  if (error) {
    console.error('emailHasActiveEntitlement error', error);
    return null;
  }
  return (data?.length ?? 0) > 0;
}
