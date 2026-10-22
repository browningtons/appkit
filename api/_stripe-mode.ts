// What a Stripe key's prefix says about the mode it belongs to, and the one
// deployment where that mode must be live: `VERCEL_ENV === 'production'`.
//
// A Stripe test-mode secret key (`sk_test_…`) is indistinguishable from a
// live one by eye in a Vercel env var, and setting one in Production fails
// nowhere loud: `new Stripe(key)` accepts it, the routes answer, and only a
// real buyer finds out — their live Checkout Session is invisible to a
// test-mode key, so verify-purchase says "no purchase found" and the webhook
// can never match a live event. Same shape as golden-data-app's
// `assertLiveStripeUrl()` for Payment Links (its R10), applied to the keys
// the server-side routes trust.
//
// Outside Production (preview deploys, local dev, tests) any key is fine:
// test keys against test prices is exactly how those environments work.
// An unset key is the dormant state the handlers already answer for
// ("server not configured") and is not this module's concern.
//
// Files prefixed with `_` are not Vercel routes.

export type StripeKeyProblem =
  | 'stripe_secret_key_not_live_mode'
  | 'stripe_webhook_secret_malformed';

// Live secret keys: the standard `sk_live_…` and a restricted `rk_live_…`.
const LIVE_SECRET_KEY = /^(?:sk|rk)_live_/;
// Webhook signing secrets carry no mode in their prefix, so only the shape
// is checkable: a pasted API key or a blank-but-set value is the realistic
// mistake, and either makes every signature check fail.
const WEBHOOK_SECRET = /^whsec_/;

/** Why the configured Stripe keys must not be trusted here, or null. */
export function stripeKeyProblem(
  env: Record<string, string | undefined> = process.env,
): StripeKeyProblem | null {
  if (env.VERCEL_ENV !== 'production') return null;
  const secret = env.STRIPE_SECRET_KEY;
  if (secret && !LIVE_SECRET_KEY.test(secret)) return 'stripe_secret_key_not_live_mode';
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (webhookSecret && !WEBHOOK_SECRET.test(webhookSecret)) {
    return 'stripe_webhook_secret_malformed';
  }
  return null;
}

// The messages name the variable and the expected shape, never the value.
const MESSAGE: Record<StripeKeyProblem, string> = {
  stripe_secret_key_not_live_mode:
    'STRIPE_SECRET_KEY is not a live-mode key (sk_live_… or rk_live_…) but ' +
    'VERCEL_ENV is production. A test-mode key here cannot see a real ' +
    "buyer's Checkout Session, so every real purchase would read as " +
    '"no purchase found". Set the live key, or move this deploy out of Production.',
  stripe_webhook_secret_malformed:
    'STRIPE_WEBHOOK_SECRET does not look like a Stripe signing secret (whsec_…) ' +
    'but VERCEL_ENV is production. Every real event would fail signature ' +
    "verification. Paste the live endpoint's signing secret from Stripe → Webhooks.",
};

/**
 * Throws when a Production deploy is configured with a Stripe key from the
 * wrong mode. Called at module load by every route that builds a Stripe
 * client, so a misdeployed function fails on its first cold start instead
 * of answering buyers wrong.
 */
export function assertLiveStripeKeys(
  env: Record<string, string | undefined> = process.env,
): void {
  const problem = stripeKeyProblem(env);
  if (problem) throw new Error(MESSAGE[problem]);
}
