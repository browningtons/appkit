import { describe, it, expect } from 'vitest';
import { lineItemMatchesPro, entitlementFromSession } from './_lib';
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
