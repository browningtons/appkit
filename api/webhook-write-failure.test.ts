import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// If the durable-store write a webhook event depends on fails (a transient
// Supabase outage, a revoked service-role key, anything), the webhook must
// NOT ack 200 — a 200 tells Stripe delivery succeeded, so it never retries,
// and the write that should have happened (grant Pro, or revoke it on
// refund/chargeback) never does, silently, with no alert anywhere. This is
// the same "ack must mean written" invariant R6/serverModePartiallyConfigured
// already enforces for a half-configured env; these tests prove it also
// holds for an ordinary write failure against a fully-configured one.

const stripeCalls = vi.hoisted(() => ({
  retrieve: vi.fn(),
  chargesRetrieve: vi.fn(),
}));

const supabaseCalls = vi.hoisted(() => ({
  upsert: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('stripe')>();
  const Real = actual.default;
  class FakeStripe {
    static errors = Real.errors;
    checkout = { sessions: { retrieve: stripeCalls.retrieve } };
    charges = { retrieve: stripeCalls.chargesRetrieve };
    // Signature checks are the real SDK's.
    webhooks = new Real('sk_test_not_a_real_key').webhooks;
  }
  return { default: FakeStripe };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: supabaseCalls.upsert,
      update: vi.fn(() => ({ eq: supabaseCalls.eq })),
    })),
  })),
}));

const { default: stripeWebhook } = await import('./stripe-webhook');
const { default: RealStripe } = await vi.importActual<typeof import('stripe')>('stripe');

const PRICE_ID = 'price_pro';
const PRODUCT_ID = 'prod_pro';
const WEBHOOK_SECRET = 'whsec_not_a_real_secret';
const BUYER_SESSION = 'cs_live_webhookwritefailuretest';
const BUYER_EMAIL = 'buyer@example.com';

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

function signedRequest(payload: string): VercelRequest {
  const signature = new RealStripe('sk_test_not_a_real_key').webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  return {
    method: 'POST',
    headers: { 'stripe-signature': signature },
    body: Buffer.from(payload),
  } as unknown as VercelRequest;
}

beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_not_a_real_key');
  vi.stubEnv('STRIPE_PRICE_ID', PRICE_ID);
  vi.stubEnv('STRIPE_PRODUCT_ID', PRODUCT_ID);
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET);
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'not-a-real-service-role-key');
  stripeCalls.retrieve.mockReset();
  stripeCalls.chargesRetrieve.mockReset();
  supabaseCalls.upsert.mockReset();
  supabaseCalls.eq.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('stripe-webhook: a failed durable-store write must not ack success', () => {
  it('checkout.session.completed: recordEntitlement failing 500s instead of acking a grant that never happened', async () => {
    stripeCalls.retrieve.mockResolvedValue({
      id: BUYER_SESSION,
      payment_status: 'paid',
      customer_details: { email: BUYER_EMAIL },
      customer: null,
      payment_intent: null,
      line_items: { data: [{ price: { id: PRICE_ID, product: PRODUCT_ID } }] },
    });
    supabaseCalls.upsert.mockResolvedValue({ error: { message: 'connection reset' } });

    const payload = JSON.stringify({
      id: 'evt_test_1',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: BUYER_SESSION, object: 'checkout.session' } },
    });
    const res = fakeResponse();
    await stripeWebhook(signedRequest(payload), res as unknown as VercelResponse);

    expect(res.statusCode).toBe(500);
    expect(res.body).not.toMatchObject({ received: true, handled: true });
  });

  it('checkout.session.completed: a successful write still acks 200/handled', async () => {
    stripeCalls.retrieve.mockResolvedValue({
      id: BUYER_SESSION,
      payment_status: 'paid',
      customer_details: { email: BUYER_EMAIL },
      customer: null,
      payment_intent: null,
      line_items: { data: [{ price: { id: PRICE_ID, product: PRODUCT_ID } }] },
    });
    supabaseCalls.upsert.mockResolvedValue({ error: null });

    const payload = JSON.stringify({
      id: 'evt_test_2',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: BUYER_SESSION, object: 'checkout.session' } },
    });
    const res = fakeResponse();
    await stripeWebhook(signedRequest(payload), res as unknown as VercelResponse);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ received: true, handled: true });
  });

  it('charge.refunded: revokeByPaymentIntent failing 500s instead of leaving a refunded buyer entitled', async () => {
    supabaseCalls.eq.mockResolvedValue({ error: { message: 'connection reset' } });

    const payload = JSON.stringify({
      id: 'evt_test_3',
      object: 'event',
      type: 'charge.refunded',
      data: {
        object: {
          object: 'charge',
          refunded: true,
          amount: 5000,
          amount_refunded: 5000,
          payment_intent: 'pi_test_1',
        },
      },
    });
    const res = fakeResponse();
    await stripeWebhook(signedRequest(payload), res as unknown as VercelResponse);

    expect(res.statusCode).toBe(500);
  });

  it('charge.dispute.closed (lost): revokeByPaymentIntent failing 500s instead of leaving the loser entitled', async () => {
    stripeCalls.chargesRetrieve.mockResolvedValue({
      object: 'charge',
      payment_intent: 'pi_test_2',
    });
    supabaseCalls.eq.mockResolvedValue({ error: { message: 'connection reset' } });

    const payload = JSON.stringify({
      id: 'evt_test_4',
      object: 'event',
      type: 'charge.dispute.closed',
      data: { object: { object: 'dispute', status: 'lost', charge: 'ch_test_1' } },
    });
    const res = fakeResponse();
    await stripeWebhook(signedRequest(payload), res as unknown as VercelResponse);

    expect(res.statusCode).toBe(500);
  });
});
