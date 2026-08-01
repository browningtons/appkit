import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  lineItemMatchesPro,
  entitlementFromSession,
  sessionIsSettled,
  serverModeEnabled,
  serverModePartiallyConfigured,
} from './_lib';
import type Stripe from 'stripe';

const PRICE = 'price_pro';
const PRODUCT = 'prod_pro';

// Minimal shapes that mirror what Stripe returns in session.line_items.data.
// Cast through `any` so the tests don't carry the full Stripe.LineItem type.
function items(data: unknown[]) {
  return { data } as Parameters<typeof lineItemMatchesPro>[0];
}

describe('lineItemMatchesPro', () => {
  it('returns false when there are no line items', () => {
    expect(lineItemMatchesPro(null, PRICE, PRODUCT)).toBe(false);
    expect(lineItemMatchesPro(undefined, PRICE, PRODUCT)).toBe(false);
    expect(lineItemMatchesPro(items([]), PRICE, PRODUCT)).toBe(false);
  });

  it('matches on price id', () => {
    const li = items([{ price: { id: PRICE, product: 'prod_other' } }]);
    expect(lineItemMatchesPro(li, PRICE, PRODUCT)).toBe(true);
  });

  it('matches on product id even when the price rotated', () => {
    // Stripe rotates prices under a product for promos; product still matches.
    const li = items([{ price: { id: 'price_promo', product: PRODUCT } }]);
    expect(lineItemMatchesPro(li, PRICE, PRODUCT)).toBe(true);
  });

  it('matches when product is an expanded object, not a string', () => {
    const li = items([{ price: { id: 'price_x', product: { id: PRODUCT } } }]);
    expect(lineItemMatchesPro(li, PRICE, PRODUCT)).toBe(true);
  });

  it('returns false when nothing matches', () => {
    const li = items([{ price: { id: 'price_other', product: 'prod_other' } }]);
    expect(lineItemMatchesPro(li, PRICE, PRODUCT)).toBe(false);
  });

  it('matches if any one line item in a multi-item cart is Pro', () => {
    const li = items([
      { price: { id: 'price_other', product: 'prod_other' } },
      { price: { id: PRICE, product: PRODUCT } },
    ]);
    expect(lineItemMatchesPro(li, PRICE, PRODUCT)).toBe(true);
  });

  it('tolerates a line item with a missing price', () => {
    const li = items([{ price: null }, { price: { id: PRICE } }]);
    expect(lineItemMatchesPro(li, PRICE, PRODUCT)).toBe(true);
  });
});

describe('sessionIsSettled', () => {
  it('treats paid sessions as settled', () => {
    expect(sessionIsSettled('paid')).toBe(true);
  });

  it('treats zero-total (no_payment_required) sessions as settled', () => {
    // 100%-off promotion codes complete checkout without a charge.
    expect(sessionIsSettled('no_payment_required')).toBe(true);
  });

  it('does not treat unpaid sessions as settled', () => {
    expect(sessionIsSettled('unpaid')).toBe(false);
  });
});

// A paid, Pro-matching session with the given overrides applied.
function session(overrides: Record<string, unknown> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_1',
    payment_status: 'paid',
    customer_details: { email: 'Buyer@Example.com' },
    customer: 'cus_123',
    payment_intent: 'pi_123',
    line_items: { data: [{ price: { id: PRICE, product: PRODUCT } }] },
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

describe('entitlementFromSession', () => {
  it('maps a paid Pro session to a normalized active row', () => {
    expect(entitlementFromSession(session(), PRICE, PRODUCT)).toEqual({
      stripe_session_id: 'cs_test_1',
      email: 'buyer@example.com', // lowercased + trimmed
      stripe_customer_id: 'cus_123',
      stripe_payment_intent_id: 'pi_123',
      product_id: PRODUCT,
      price_id: PRICE,
      status: 'active',
    });
  });

  it('returns null when the session is not paid', () => {
    expect(
      entitlementFromSession(session({ payment_status: 'unpaid' }), PRICE, PRODUCT),
    ).toBeNull();
  });

  it('maps a zero-total (no_payment_required) Pro session to an active row', () => {
    const row = entitlementFromSession(
      session({ payment_status: 'no_payment_required' }),
      PRICE,
      PRODUCT,
    );
    expect(row?.status).toBe('active');
    expect(row?.stripe_session_id).toBe('cs_test_1');
  });

  it('returns null when there is no email', () => {
    expect(
      entitlementFromSession(session({ customer_details: {} }), PRICE, PRODUCT),
    ).toBeNull();
  });

  it('returns null when line items do not match Pro', () => {
    const other = { data: [{ price: { id: 'price_x', product: 'prod_x' } }] };
    expect(
      entitlementFromSession(session({ line_items: other }), PRICE, PRODUCT),
    ).toBeNull();
  });

  it('handles expanded customer/payment_intent objects', () => {
    const row = entitlementFromSession(
      session({ customer: { id: 'cus_exp' }, payment_intent: { id: 'pi_exp' } }),
      PRICE,
      PRODUCT,
    );
    expect(row?.stripe_customer_id).toBe('cus_exp');
    expect(row?.stripe_payment_intent_id).toBe('pi_exp');
  });

  it('tolerates missing customer/payment_intent', () => {
    const row = entitlementFromSession(
      session({ customer: null, payment_intent: null }),
      PRICE,
      PRODUCT,
    );
    expect(row?.stripe_customer_id).toBeNull();
    expect(row?.stripe_payment_intent_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Server-mode configuration gate (R6/A6)
// ---------------------------------------------------------------------------
//
// The bug these lock down: ADOPTING.md promises three env vars turn on server
// mode; serverModeEnabled() checked two. Setting SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY and forgetting STRIPE_WEBHOOK_SECRET produced a
// silent, end-to-end failure in which real paying customers were told "no
// purchase found" — because server mode was on, verify-purchase trusted an
// entitlements table that the webhook could never write.
//
// Two of three was strictly worse than zero of three. These tests exist so it
// cannot quietly become two of three again.

describe('serverModeEnabled — all three vars, or none of it counts', () => {
  const KEYS = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  const set = (...keys: string[]) => {
    for (const k of keys) process.env[k] = `test-${k}`;
  };

  it('is off when nothing is configured', () => {
    expect(serverModeEnabled()).toBe(false);
  });

  it('is ON only when all three are set', () => {
    set('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_WEBHOOK_SECRET');
    expect(serverModeEnabled()).toBe(true);
  });

  it('is OFF with the two Supabase vars but no webhook secret — the whole bug', () => {
    // This exact combination used to return true, which is what routed a real
    // customer into an empty table and past the Stripe fallback that would
    // have found their purchase.
    set('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
    expect(serverModeEnabled()).toBe(false);
  });

  it('is off for every other partial combination', () => {
    const partials = [
      ['SUPABASE_URL'],
      ['SUPABASE_SERVICE_ROLE_KEY'],
      ['STRIPE_WEBHOOK_SECRET'],
      ['SUPABASE_URL', 'STRIPE_WEBHOOK_SECRET'],
      ['SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_WEBHOOK_SECRET'],
    ];
    for (const combo of partials) {
      for (const k of KEYS) delete process.env[k];
      set(...combo);
      expect(serverModeEnabled(), `partial: ${combo.join('+')}`).toBe(false);
    }
  });

  it('falling back to client mode is what rescues the customer', () => {
    // The point of returning false here is not tidiness. emailHasActiveEntitlement
    // returns null when server mode is off, and that null is what lets
    // verify-purchase fall through to its Stripe lookup instead of answering
    // from an empty table.
    set('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
    expect(serverModeEnabled()).toBe(false);
  });
});

describe('serverModePartiallyConfigured — tells misconfiguration from client mode', () => {
  const KEYS = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('is TRUE for the dangerous half-configured case', () => {
    process.env.SUPABASE_URL = 'x';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'y';
    expect(serverModePartiallyConfigured()).toBe(true);
  });

  it('is FALSE for a plain client-mode app, so the webhook still acks quietly', () => {
    // A client-mode app that merely has this route deployed must keep getting
    // a quiet 200 — failing loudly there would be noise, not signal.
    expect(serverModePartiallyConfigured()).toBe(false);
  });

  it('is FALSE once fully configured', () => {
    process.env.SUPABASE_URL = 'x';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'y';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_z';
    expect(serverModePartiallyConfigured()).toBe(false);
  });

  it('is FALSE when only the webhook secret is set (never intended server mode)', () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_z';
    expect(serverModePartiallyConfigured()).toBe(false);
  });

  it('never overlaps with serverModeEnabled', () => {
    // The two must be mutually exclusive: a config cannot be both "good to go"
    // and "half-configured". The webhook relies on that to pick a branch.
    const combos = [
      [], ['SUPABASE_URL'], ['SUPABASE_SERVICE_ROLE_KEY'], ['STRIPE_WEBHOOK_SECRET'],
      ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
      ['SUPABASE_URL', 'STRIPE_WEBHOOK_SECRET'],
      ['SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_WEBHOOK_SECRET'],
      ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_WEBHOOK_SECRET'],
    ];
    for (const combo of combos) {
      for (const k of KEYS) delete process.env[k];
      for (const k of combo) process.env[k] = 'v';
      expect(
        serverModeEnabled() && serverModePartiallyConfigured(),
        `combo: ${combo.join('+') || '(none)'}`,
      ).toBe(false);
    }
  });
});
