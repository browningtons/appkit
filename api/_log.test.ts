import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspect } from 'node:util';
import Stripe from 'stripe';
import { errorLogFields, log, redactSessionIds, type LogFields } from './_log';

// Ported with our-family-lizard's api/__tests__/log.test.ts. Errors are built
// by the real Stripe SDK (StripeError.generate is the factory the SDK calls
// when Stripe answers with an error body), so each one has the class, type,
// `raw` and `headers` production would.
const { errors } = Stripe;

const LIVE_ID = 'cs_live_a1B2c3D4e5F6'.padEnd(66, 'x');
const TEST_ID = 'cs_test_a1B2c3D4e5F6'.padEnd(66, 'y');

// Stripe's answer for an id it never issued. The message quotes the id.
function noSuchSession(id: string): Error {
  return errors.StripeError.generate({
    type: 'invalid_request_error',
    code: 'resource_missing',
    message: `No such checkout.session: ${id}`,
    statusCode: 404,
    requestId: 'req_test_missing',
    headers: { 'request-id': 'req_test_missing' },
  } as Parameters<typeof errors.StripeError.generate>[0]);
}

// A key in the wrong mode gets this for a real buyer's id: the dangerous one.
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

// What a webhook signature failure throws for a real paid-session event,
// e.g. after the signing secret was rotated: the whole body rides along in
// the error's `payload`, session id and buyer's email included.
function signatureFailure(sessionId: string, email: string): Error {
  const body = JSON.stringify({
    id: 'evt_test_1',
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: { id: sessionId, object: 'checkout.session', customer_details: { email } } },
  });
  try {
    new Stripe('sk_test_not_a_real_key').webhooks.constructEvent(
      Buffer.from(body),
      't=1700000000,v1=deadbeef',
      'whsec_not_a_real_secret',
    );
  } catch (err) {
    return err as Error;
  }
  throw new Error('constructEvent accepted a bad signature');
}

describe('redactSessionIds', () => {
  it.each([
    ["Stripe's no-such-session message", `No such checkout.session: ${LIVE_ID}`, 'No such checkout.session: cs_live_…[redacted]'],
    ['a test-mode id', `No such checkout.session: ${TEST_ID}`, 'No such checkout.session: cs_test_…[redacted]'],
    ['a quoted id', `No such checkout.session: '${LIVE_ID}'`, "No such checkout.session: 'cs_live_…[redacted]'"],
    [
      "the wrong-mode message's `;`",
      `No such checkout.session: ${LIVE_ID}; a similar object exists in live mode`,
      'No such checkout.session: cs_live_…[redacted]; a similar object exists in live mode',
    ],
    [
      'an id inside a request path, with the rest of the path',
      `Unrecognized request URL (GET: /v1/checkout/sessions/${LIVE_ID}/y). Please see https://stripe.com/docs`,
      'Unrecognized request URL (GET: /v1/checkout/sessions/cs_live_…[redacted]). Please see https://stripe.com/docs',
    ],
    ['an id glued to what comes before it', `session_id%3D${LIVE_ID}%26x=1`, 'session_id%3Dcs_live_…[redacted]'],
    ['every id in the text', `${LIVE_ID} then ${TEST_ID}`, 'cs_live_…[redacted] then cs_test_…[redacted]'],
    ['an id in a JSON body', `{"id":"${LIVE_ID}","object":"checkout.session"}`, '{"id":"cs_live_…[redacted]","object":"checkout.session"}'],
    ["an id with characters today's ids don't use", 'cs_live_ab-cd.ef~gh', 'cs_live_…[redacted]'],
  ])('cuts %s to its mode', (_label, text, redacted) => {
    expect(redactSessionIds(text)).toBe(redacted);
  });

  it.each([
    'Expired API Key provided: sk_live_***',
    'No such product: prod_UL1H8uHMJ0DFRM',
    'No such charge: ch_3TYElzFgn5goWL8k157xx1BA',
    'Invalid string: cs_l...bbbb; must be at most 66 characters',
  ])('leaves text with no session id alone: %s', (text) => {
    expect(redactSessionIds(text)).toBe(text);
  });

  it('can run twice', () => {
    const once = redactSessionIds(`No such checkout.session: ${LIVE_ID}`);
    expect(redactSessionIds(once)).toBe(once);
  });
});

describe('errorLogFields', () => {
  it("keeps Stripe's diagnosis and a message with the id cut", () => {
    expect(errorLogFields(noSuchSession(LIVE_ID))).toEqual({
      type: 'StripeInvalidRequestError',
      code: 'resource_missing',
      statusCode: 404,
      stripeRequestId: 'req_test_missing',
      message: 'No such checkout.session: cs_live_…[redacted]',
    });
    expect(errorLogFields(sessionInOtherMode(TEST_ID))).toEqual({
      type: 'StripeInvalidRequestError',
      code: 'resource_missing',
      statusCode: 400,
      param: 'session',
      stripeRequestId: 'req_test_wrong_mode',
      message:
        'No such checkout.session: cs_test_…[redacted]; a similar object exists in live mode, but a test mode key was used to make this request.',
    });
  });

  it('holds only text and numbers: never the error, its raw body, or the response headers', () => {
    const fields = errorLogFields(noSuchSession(LIVE_ID));
    for (const value of Object.values(fields)) expect(['string', 'number']).toContain(typeof value);
    expect(fields).not.toHaveProperty('raw');
    expect(fields).not.toHaveProperty('headers');
    expect(JSON.stringify(fields)).not.toContain(LIVE_ID);
  });

  it("drops a webhook signature failure's payload: the event body, id and email", () => {
    const error = signatureFailure(LIVE_ID, 'buyer@example.com');
    // The SDK really does carry the body: this is what the old line printed.
    expect(inspect(error)).toContain(LIVE_ID);
    const fields = errorLogFields(error);
    expect(fields.type).toBe('StripeSignatureVerificationError');
    expect(fields.message).toMatch(/^No signatures found matching the expected signature/);
    expect(fields).not.toHaveProperty('payload');
    expect(fields).not.toHaveProperty('header');
    expect(JSON.stringify(fields)).not.toContain(LIVE_ID);
    expect(JSON.stringify(fields)).not.toContain('buyer@example.com');
  });

  it("drops a database error's details, which can quote the refused row", () => {
    // A PostgrestError: Postgres puts the failing row in `details`.
    const dbError = {
      message: 'new row for relation "entitlements" violates check constraint "entitlements_status_check"',
      code: '23514',
      details: `Failing row contains (${LIVE_ID}, buyer@example.com, null, null, prod_x, price_x, bogus).`,
      hint: null,
    };
    const fields = errorLogFields(dbError);
    expect(fields).toEqual({ code: '23514', message: dbError.message });
    expect(JSON.stringify(fields)).not.toContain(LIVE_ID);
  });

  it("keeps a connection error's cause, which can be the key and not the network", () => {
    const fields = errorLogFields(
      new errors.StripeConnectionError({
        message: 'An error occurred with our connection to Stripe. Request was retried 2 times.',
        detail: Object.assign(new Error(`socket hang up near ${LIVE_ID}`), { code: 'ECONNRESET' }),
      } as ConstructorParameters<typeof errors.StripeConnectionError>[0]),
    );
    expect(fields).toEqual({
      type: 'StripeConnectionError',
      message: 'An error occurred with our connection to Stripe. Request was retried 2 times.',
      detail: 'ECONNRESET: socket hang up near cs_live_…[redacted]',
    });
  });

  it('cuts an id out of every field, not just the message', () => {
    expect(
      errorLogFields({
        type: `StripeAPIError ${LIVE_ID}`,
        code: LIVE_ID,
        param: `session[${TEST_ID}]`,
        requestId: LIVE_ID,
        raw: { request_log_url: `https://dashboard.stripe.com/acct_x/workbench/logs?object=${LIVE_ID}` },
        message: 'm',
        detail: { code: 'ECONNRESET', message: `reset near ${TEST_ID}` },
      }),
    ).toEqual({
      type: 'StripeAPIError cs_live_…[redacted]',
      code: 'cs_live_…[redacted]',
      param: 'session[cs_test_…[redacted]',
      stripeRequestId: 'cs_live_…[redacted]',
      stripeRequestLogUrl: 'https://dashboard.stripe.com/acct_x/workbench/logs?object=cs_live_…[redacted]',
      message: 'm',
      detail: 'ECONNRESET: reset near cs_test_…[redacted]',
    });
  });

  it("keeps the stack of an error that isn't Stripe's, a bug of ours, with ids cut", () => {
    const fields = errorLogFields(new TypeError(`Cannot read properties of undefined near ${LIVE_ID}`));
    expect(fields.type).toBeUndefined();
    expect(fields.message).toBe('Cannot read properties of undefined near cs_live_…[redacted]');
    expect(fields.stack).toMatch(/^TypeError: Cannot read properties of undefined/);
    expect(fields.stack).not.toContain(LIVE_ID);
  });

  it("leaves out a Stripe error's stack: the SDK's frames, and the message again", () => {
    expect(errorLogFields(noSuchSession(LIVE_ID))).not.toHaveProperty('stack');
  });

  it.each([
    ['a string', `boom ${LIVE_ID}`, { message: 'boom cs_live_…[redacted]' }],
    ['undefined', undefined, { message: 'undefined' }],
    ['null', null, { message: 'null' }],
  ])('survives %s being thrown', (_label, thrown, fields) => {
    expect(errorLogFields(thrown)).toEqual(fields);
  });
});

describe('log', () => {
  const spies = {} as Record<'error' | 'warn' | 'info', ReturnType<typeof vi.spyOn>>;

  beforeEach(() => {
    for (const level of ['error', 'warn', 'info'] as const) {
      spies[level] = vi.spyOn(console, level).mockImplementation(() => {});
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['error', 'warn', 'info'] as const)(
    'log.%s writes the event and its fields with every session id cut',
    (level) => {
      log[level](`restore ${LIVE_ID}`, {
        session: LIVE_ID,
        checkoutUrl: `https://checkout.stripe.com/c/pay/${TEST_ID}#fidkdWxOYHwnPyd1blpxYHZxWjA0`,
        verified: true,
        checked: 2,
        requestId: undefined,
      });
      expect(spies[level].mock.calls).toEqual([
        [
          'restore cs_live_…[redacted]',
          {
            session: 'cs_live_…[redacted]',
            checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_…[redacted]',
            verified: true,
            checked: 2,
            requestId: undefined,
          },
        ],
      ]);
    },
  );

  it('writes a line with no id exactly as given', () => {
    log.info('verify-purchase checked', { verified: true, length: 66 });
    expect(spies.info).toHaveBeenCalledWith('verify-purchase checked', { verified: true, length: 66 });
  });

  it('drops a field that is not text, a number, a boolean or null, even past the type', () => {
    log.error('x', { raw: new Error(LIVE_ID), nested: { id: LIVE_ID }, ok: null } as unknown as LogFields);
    expect(spies.error).toHaveBeenCalledWith('x', { ok: null });
  });

  it('writes nothing of fields that are not an object, and cuts ids out of keys', () => {
    log.error('x', LIVE_ID as unknown as LogFields);
    log.error('y', { [LIVE_ID]: true });
    expect(spies.error.mock.calls).toEqual([
      ['x', {}],
      ['y', { 'cs_live_…[redacted]': true }],
    ]);
  });
});
