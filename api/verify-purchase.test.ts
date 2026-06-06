import { describe, it, expect } from 'vitest';
import { lineItemMatchesPro } from './verify-purchase';

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
