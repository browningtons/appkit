import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// The money-path routes' failure lines, end to end: each test makes a route
// fail on a real buyer's Checkout Session id (a bearer credential) and reads
// back everything the route printed. Stripe is faked only where a call would
// leave the machine; its errors and webhook signing are the real SDK's.

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
    // Signature checks are local: keep the SDK's own.
    webhooks = new Real('sk_test_not_a_real_key').webhooks;
  }
  return { default: FakeStripe };
});

const { default: verifyPurchase } = await import('./verify-purchase');
const { default: stripeWebhook } = await import('./stripe-webhook');
const { default: RealStripe } = await vi.importActual<typeof import('stripe')>('stripe');
const { errors } = RealStripe;

const BUYER_SESSION = 'cs_live_c3abuyerssessionquotedbystripe'.padEnd(66, '0');
const BUYER_EMAIL = 'buyer@example.com';
const WEBHOOK_SECRET = 'whsec_not_a_real_secret';

// What Stripe says when the key is in the wrong mode for a real buyer's
// session: it names the session, id and all.
function sessionInOtherMode(id: string): Error {
  return errors.StripeError.generate({
    type: 'invalid_request_error',
    code: 'resource_missing',
    param: 'session',
    message: `No such checkout.session: ${id}; a similar object exists in live mode, but a test mode key was used to make this request.`,
    statusCode: 400,
    requestId: 'req_test_wrong_mode',
  });
}

// Everything a route could print, silenced and recorded, as text: deeper
// than Vercel prints it and with hidden properties shown, so nothing a line
// carries escapes the assertion.
function captureLogs() {
  const spies = [
    ...(['error', 'warn', 'info', 'log', 'debug', 'trace', 'dir', 'table'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    ),
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true),
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true),
  ];
  return {
    text: () =>
      inspect(
        spies.map((spy) => spy.mock.calls),
        { depth: Infinity, showHidden: true, breakLength: Infinity, maxStringLength: Infinity },
      ),
  };
}

function expectNoSessionIds(logged: string): void {
  expect(logged).not.toContain(BUYER_SESSION);
  expect(logged).not.toMatch(/cs_(live|test)_[A-Za-z0-9]/);
}

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
    headers: { 'x-forwarded-for': `203.0.113.${ip}` },
    query: {},
    ...init,
  } as VercelRequest;
}

let logs: ReturnType<typeof captureLogs>;

beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_not_a_real_key');
  vi.stubEnv('STRIPE_PRICE_ID', 'price_pro');
  vi.stubEnv('STRIPE_PRODUCT_ID', 'prod_pro');
  stripeCalls.retrieve.mockReset();
  stripeCalls.list.mockReset();
  stripeCalls.search.mockReset();
  logs = captureLogs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('verify-purchase failure lines', () => {
  it("GET: a 500 on a real buyer's session keeps Stripe's diagnosis and cuts the id", async () => {
    stripeCalls.retrieve.mockRejectedValue(sessionInOtherMode(BUYER_SESSION));
    const res = fakeResponse();
    await verifyPurchase(
      request({ method: 'GET', query: { session_id: BUYER_SESSION } }),
      res as unknown as VercelResponse,
    );

    expect(res.statusCode).toBe(500);
    const logged = logs.text();
    expectNoSessionIds(logged);
    expect(logged).toContain('verify-purchase error');
    expect(logged).toContain('StripeInvalidRequestError');
    expect(logged).toContain('req_test_wrong_mode');
    expect(logged).toContain('cs_live_…[redacted]');
  });

  it("POST restore: a failure on a buyer's own session, found by email, cuts the id", async () => {
    stripeCalls.search.mockResolvedValue({ data: [] });
    stripeCalls.list.mockResolvedValue({
      data: [{ id: BUYER_SESSION, payment_status: 'paid', customer_details: { email: BUYER_EMAIL } }],
      has_more: false,
    });
    stripeCalls.retrieve.mockRejectedValue(sessionInOtherMode(BUYER_SESSION));
    const res = fakeResponse();
    await verifyPurchase(
      request({ method: 'POST', body: { email: BUYER_EMAIL } }),
      res as unknown as VercelResponse,
    );

    expect(res.statusCode).toBe(500);
    expect(stripeCalls.retrieve).toHaveBeenCalledWith(BUYER_SESSION, expect.anything());
    expectNoSessionIds(logs.text());
  });
});

describe('stripe-webhook failure lines', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET);
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'not-a-real-service-role-key');
  });

  const paidSessionEvent = JSON.stringify({
    id: 'evt_test_1',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: BUYER_SESSION,
        object: 'checkout.session',
        payment_status: 'paid',
        customer_details: { email: BUYER_EMAIL },
      },
    },
  });

  it("a bad signature on a real paid-session event logs neither the event's session id nor its email", async () => {
    // E.g. a rotated signing secret: every real event fails here, and the
    // SDK's error carries the whole body in `payload`.
    const res = fakeResponse();
    await stripeWebhook(
      request({
        method: 'POST',
        headers: { 'stripe-signature': 't=1700000000,v1=deadbeef' },
        body: Buffer.from(paidSessionEvent),
      }),
      res as unknown as VercelResponse,
    );

    expect(res.statusCode).toBe(400);
    const logged = logs.text();
    expectNoSessionIds(logged);
    expect(logged).not.toContain(BUYER_EMAIL);
    expect(logged).toContain('stripe-webhook signature verification failed');
    expect(logged).toContain('StripeSignatureVerificationError');
  });

  it('a handler error on a signed event cuts the session id Stripe quotes', async () => {
    stripeCalls.retrieve.mockRejectedValue(sessionInOtherMode(BUYER_SESSION));
    const signature = new RealStripe('sk_test_not_a_real_key').webhooks.generateTestHeaderString({
      payload: paidSessionEvent,
      secret: WEBHOOK_SECRET,
    });
    const res = fakeResponse();
    await stripeWebhook(
      request({
        method: 'POST',
        headers: { 'stripe-signature': signature },
        body: Buffer.from(paidSessionEvent),
      }),
      res as unknown as VercelResponse,
    );

    expect(res.statusCode).toBe(500);
    expect(stripeCalls.retrieve).toHaveBeenCalledWith(BUYER_SESSION, expect.anything());
    const logged = logs.text();
    expectNoSessionIds(logged);
    expect(logged).toContain('stripe-webhook handler error');
    expect(logged).toContain('req_test_wrong_mode');
  });
});
