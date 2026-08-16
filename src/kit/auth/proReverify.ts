// Pure decision helpers for the Pro re-verify flow in useAuth.
//
// Splitting them out keeps the hook itself thin and makes the policy
// (throttle and fail-open behavior) directly testable without a React
// renderer or testing-library dependency.
//
// Ported from our-family-lizard#44. The one deliberate divergence: OFL's
// restore path went through a `restorePurchase` util that returned a 4-state
// status enum (`success | not_found | rate_limited | error`), so it needed a
// second mapper. Here both verify-purchase paths — GET `?session_id=` and
// POST `{ email }` — return the same `{ verified?: boolean }` JSON and are read
// through the same `r.ok ? r.json() : null` wrapper, so one mapper
// (`applyReVerifyResponse`) covers both. A 429 (rate-limit) or 5xx from the
// endpoint is non-2xx → `null` → fail open; a 2xx `{ verified: false }` is the
// backend affirmatively reporting no active/unrefunded entitlement → revoke.

export const REVERIFY_THROTTLE_MS = 24 * 60 * 60 * 1000;

/**
 * How a boot re-verify should be performed, if at all.
 *
 * Pro can be unlocked two ways, and each leaves behind a different handle:
 *   - buying → the Stripe redirect gives us a `cs_...` session id (GET verify),
 *   - restoring by email → gives us nothing but the email the buyer typed.
 *
 * Both must stay revocable. Before this existed, useAuth had no boot re-verify
 * at all: once Pro was written to localStorage it was permanent on the device
 * by every route, so a refund (or any backend revocation) never reached a
 * device that had already unlocked.
 */
export type ReVerifyPlan =
  | { kind: 'skip' }
  | { kind: 'session'; sessionId: string }
  | { kind: 'restore'; email: string };

/**
 * Decide whether — and how — to fire a background re-verify request on boot.
 *
 * Fires only when the user currently has Pro from a real purchase
 * (`isProReal`), the throttle window since the last answered check has
 * elapsed, and we hold some handle to re-check with. A session id is
 * preferred: it is exact, needs no stored PII, and costs one Stripe call.
 *
 * Note the `#pro=1` instant-unlock path (Stripe Payment Link) leaves no handle
 * — no session id, no email — so it correctly resolves to `skip` here and is
 * inherently non-revocable. Adopters who need refund-revocable entitlement
 * should unlock via a `session_id` success_url or run server mode.
 */
export function reVerifyPlan(opts: {
  isProReal: boolean;
  sessionId: string | null | undefined;
  restoreEmail: string | null | undefined;
  lastCheck: number;
  now: number;
}): ReVerifyPlan {
  if (!opts.isProReal) return { kind: 'skip' };
  if (opts.now - opts.lastCheck < REVERIFY_THROTTLE_MS) return { kind: 'skip' };
  if (opts.sessionId && opts.sessionId.startsWith('cs_')) {
    return { kind: 'session', sessionId: opts.sessionId };
  }
  const email = opts.restoreEmail?.trim();
  if (email && email.includes('@')) return { kind: 'restore', email };
  return { kind: 'skip' };
}

/**
 * Session-path-only view of {@link reVerifyPlan}, kept as the narrow predicate
 * the GET (post-checkout) flow reads.
 */
export function shouldReVerify(opts: {
  isProReal: boolean;
  sessionId: string | null | undefined;
  lastCheck: number;
  now: number;
}): boolean {
  return reVerifyPlan({ ...opts, restoreEmail: null }).kind === 'session';
}

export type ReVerifyAction =
  // Network error / non-2xx (429 rate-limit, 5xx) — fail open. Leave Pro
  // intact and the throttle timestamp untouched so we retry on the next mount.
  | { kind: 'fail_open' }
  // Endpoint confirmed Pro is still valid — keep it, update the throttle.
  | { kind: 'keep' }
  // Endpoint says Pro is no longer valid (refunded, product mismatch,
  // unpaid, etc.) — revoke locally and update the throttle.
  | { kind: 'revoke' };

/**
 * Map a verify-purchase response (or a fail-open `null`) to a local action.
 * Used for BOTH the session (GET) and restore (POST) re-verify paths, since
 * `/api/verify-purchase` returns `{ verified: boolean }` in both modes.
 *
 * We treat `verified === false` as a revoke signal. We deliberately do NOT
 * revoke when the field is missing or the value is something other than
 * `true`/`false` — that protects buyers if the API contract ever drifts. A
 * spurious revoke is much worse than a missed one: buyers loudly notice, and
 * abusers do not.
 */
export function applyReVerifyResponse(
  data: { verified?: boolean } | null,
): ReVerifyAction {
  if (data == null) return { kind: 'fail_open' };
  if (data.verified === false) return { kind: 'revoke' };
  return { kind: 'keep' };
}
