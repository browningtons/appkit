import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// This portfolio's Stripe accounts are routinely shared across products (the
// same email can be a guest buyer on more than one app). The guest-checkout
// restore scan in verify-purchase.ts pages through ALL settled sessions for a
// matching email — it must not stop at the first one and must not report
// "not found" just because the first email match belongs to a different
// product than this app sells.

const stripeCalls = vi.hoisted(() => ({
  retrieve: vi.fn(),
  list: vi.fn(),
  search: vi.fn(),
}));

vi.mock('stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('stripe')>();
  const Real = actual.default;
  class FakeStripe {
    static errors = Real.errors;
    checkout = { sessions: { retrieve: stripeCalls.retrieve, list: stripeCalls.list } };
    customers = { search: stripeCalls.search };
  }
  return { default: FakeStripe };
});

const { default: verifyPurchase } = await import('./verify-purchase');

const BUYER_EMAIL = 'buyer@example.com';
const OTHER_PRODUCT_SESSION = 'cs_live_otherproductsession';
const PRO_SESSION = 'cs_live_prosession';

function fakeResponse() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

let ip = 0;
function request(init: Partial<VercelRequest>): VercelRequest {
  ip += 1;
  return {
    headers: { 'x-forwarded-for': `203.0.113.${100 + ip}` },
    query: {},
    ...init,
  } as VercelRequest;
}

beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_not_a_real_key');
  vi.stubEnv('STRIPE_PRICE_ID', 'price_pro');
  vi.stubEnv('STRIPE_PRODUCT_ID', 'prod_pro');
  stripeCalls.retrieve.mockReset();
  stripeCalls.list.mockReset();
  stripeCalls.search.mockReset();
  stripeCalls.search.mockResolvedValue({ data: [] }); // no Customer object → guest scan
});

describe('POST restore: guest-checkout scan on a Stripe account shared across products', () => {
  it('keeps scanning past a settled same-email session for a different product and finds the real Pro purchase', async () => {
    // Most recent first, as Stripe returns them: the other product's session
    // comes before the genuine Pro one.
    stripeCalls.list.mockResolvedValue({
      data: [
        { id: OTHER_PRODUCT_SESSION, payment_status: 'paid', customer_details: { email: BUYER_EMAIL } },
        { id: PRO_SESSION, payment_status: 'paid', customer_details: { email: BUYER_EMAIL } },
      ],
      has_more: false,
    });
    stripeCalls.retrieve.mockImplementation(async (id: string) => {
      if (id === OTHER_PRODUCT_SESSION) {
        return {
          id,
          line_items: { data: [{ price: { id: 'price_other', product: 'prod_other' } }] },
          payment_intent: null,
        };
      }
      if (id === PRO_SESSION) {
        return {
          id,
          line_items: { data: [{ price: { id: 'price_pro', product: 'prod_pro' } }] },
          payment_intent: null,
        };
      }
      throw new Error(`unexpected retrieve ${id}`);
    });

    const res = fakeResponse();
    await verifyPurchase(
      request({ method: 'POST', body: { email: BUYER_EMAIL } }),
      res as unknown as VercelResponse,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: true });
    // Both sessions had to be checked — not just the first email match.
    expect(stripeCalls.retrieve).toHaveBeenCalledWith(OTHER_PRODUCT_SESSION, expect.anything());
    expect(stripeCalls.retrieve).toHaveBeenCalledWith(PRO_SESSION, expect.anything());
  });

  it('reports not found only after no email match on any page is this product', async () => {
    stripeCalls.list.mockResolvedValue({
      data: [{ id: OTHER_PRODUCT_SESSION, payment_status: 'paid', customer_details: { email: BUYER_EMAIL } }],
      has_more: false,
    });
    stripeCalls.retrieve.mockResolvedValue({
      id: OTHER_PRODUCT_SESSION,
      line_items: { data: [{ price: { id: 'price_other', product: 'prod_other' } }] },
      payment_intent: null,
    });

    const res = fakeResponse();
    await verifyPurchase(
      request({ method: 'POST', body: { email: BUYER_EMAIL } }),
      res as unknown as VercelResponse,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: false });
  });
});
