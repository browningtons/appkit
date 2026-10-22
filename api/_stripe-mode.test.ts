import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertLiveStripeKeys, stripeKeyProblem } from './_stripe-mode';

// Fixture strings only; nothing here is a real key.
const LIVE = 'sk_live_x';
const TEST = 'sk_test_x';

describe('stripeKeyProblem', () => {
  it('flags a test-mode secret key in Production', () => {
    expect(stripeKeyProblem({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: TEST })).toBe(
      'stripe_secret_key_not_live_mode',
    );
  });

  it('flags a value that is not a Stripe secret key at all in Production', () => {
    expect(
      stripeKeyProblem({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'pk_live_x' }),
    ).toBe('stripe_secret_key_not_live_mode');
  });

  it('accepts a live secret key, standard or restricted, in Production', () => {
    expect(stripeKeyProblem({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: LIVE })).toBeNull();
    expect(
      stripeKeyProblem({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'rk_live_x' }),
    ).toBeNull();
  });

  it('flags a webhook secret without the whsec_ shape in Production', () => {
    expect(
      stripeKeyProblem({
        VERCEL_ENV: 'production',
        STRIPE_SECRET_KEY: LIVE,
        STRIPE_WEBHOOK_SECRET: TEST,
      }),
    ).toBe('stripe_webhook_secret_malformed');
  });

  it('accepts a whsec_ webhook secret in Production', () => {
    expect(
      stripeKeyProblem({
        VERCEL_ENV: 'production',
        STRIPE_SECRET_KEY: LIVE,
        STRIPE_WEBHOOK_SECRET: 'whsec_x',
      }),
    ).toBeNull();
  });

  it('is silent when the keys are unset — the dormant state the handlers answer for', () => {
    expect(stripeKeyProblem({ VERCEL_ENV: 'production' })).toBeNull();
  });

  it('allows test keys outside Production: preview, development, and no VERCEL_ENV', () => {
    for (const VERCEL_ENV of ['preview', 'development', undefined]) {
      expect(
        stripeKeyProblem({ VERCEL_ENV, STRIPE_SECRET_KEY: TEST, STRIPE_WEBHOOK_SECRET: TEST }),
      ).toBeNull();
    }
  });
});

describe('assertLiveStripeKeys', () => {
  it('throws on a test-mode key in Production, naming the variable but never its value', () => {
    const env = { VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'sk_test_secretvalue' };
    expect(() => assertLiveStripeKeys(env)).toThrow(/STRIPE_SECRET_KEY is not a live-mode key/);
    expect(() => assertLiveStripeKeys(env)).not.toThrow(/secretvalue/);
  });

  it('does not throw on a live key in Production', () => {
    expect(() => assertLiveStripeKeys({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: LIVE })).not.toThrow();
  });
});

// The wiring: each route that builds a Stripe client calls the assertion at
// module load, so a misdeployed Production function fails on its first cold
// start. A test-mode key anywhere else still loads, as every other test in
// this directory relies on.
describe('routes refuse to load with a test-mode key in Production', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each(['./verify-purchase', './stripe-webhook'])('%s', async (route) => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', TEST);
    vi.resetModules();
    await expect(import(/* @vite-ignore */ route)).rejects.toThrow(/not a live-mode key/);

    vi.stubEnv('STRIPE_SECRET_KEY', LIVE);
    vi.resetModules();
    await expect(import(/* @vite-ignore */ route)).resolves.toBeDefined();
  });
});
