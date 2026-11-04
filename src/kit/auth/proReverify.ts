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
  | { kind: 'restore'; email: string }
  | { kind: 'both'; sessionId: string; email: string };

/**
 * Decide whether — and how — to fire a background re-verify request on boot.
 *
 * Fires only when the user currently has Pro from a real purchase
 * (`isProReal`), the throttle window since the last answered check has
 * elapsed, and we hold some handle to re-check with.
 *
 * A device can hold both handles at once when it bought once (a session id)
 * and later restored a *different* purchase by email — or the reverse order.
 * Checking only the session id then revokes Pro the moment that first
 * purchase is refunded, even though the email's purchase is still paid
 * (our-family-lizard A-R1 item 1, ported from our-family-lizard#144). So when
 * both are on file, check both (`applyBothReVerifyOutcome` combines the
 * answers) rather than picking one.
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
  // Hand-edited storage can hold JSON that parses to a non-string — guard both
  // handles' types before calling string methods on them, rather than relying
  // on short-circuit branch order like the old session-preferring code did
  // (our-family-lizard A-R1 item 10: `.startsWith` / `.trim` on a number
  // crashed the whole boot re-verify).
  const sessionId =
    typeof opts.sessionId === 'string' && opts.sessionId.startsWith('cs_') ? opts.sessionId : null;
  const email = typeof opts.restoreEmail === 'string' ? opts.restoreEmail.trim() : undefined;
  const validEmail = email && email.includes('@') ? email : null;
  if (sessionId && validEmail) return { kind: 'both', sessionId, email: validEmail };
  if (sessionId) return { kind: 'session', sessionId };
  if (validEmail) return { kind: 'restore', email: validEmail };
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

/**
 * The handles a device holds for its Pro, as stored: the Checkout Session id
 * a checkout verified, and the email a restore was proved with. useAuth
 * passes the raw localStorage strings (`null` for a missing key), unparsed:
 * two parses of one JSON object are never equal, so comparing parsed values
 * would drop every revoke on a hand-edited object (our-family-lizard A-R1
 * item 6).
 */
export type ProHandles = {
  sessionId: string | null | undefined;
  restoreEmail: string | null | undefined;
};

/**
 * Whether a re-verify's revoke still applies when its answer lands.
 *
 * The answer is about the handle the re-verify sent, and the device can move
 * on while it's out: the load that brings a buyer back from checkout runs the
 * new purchase's verify alongside this one, and if that unlock lands first it
 * saves a new session id; a successful restore saves an email. Either is a
 * newer unlock, which a refund of the handle that was sent says nothing
 * about. So a revoke applies only while the device holds exactly the handles
 * the re-verify started from — both of them, whichever one was sent, because
 * an unlock through the other path is newer too.
 *
 * When they differ, the caller writes nothing and leaves whatever changed
 * them in place: an unlock, or a revoke that already cleared them (another
 * tab's, or this tab's own other re-verify when a boot and a refocus check
 * are both out).
 */
export function revokeStillApplies(checked: ProHandles, held: ProHandles): boolean {
  return held.sessionId === checked.sessionId && held.restoreEmail === checked.restoreEmail;
}

/**
 * Combine the answers for a device holding both handles (`kind: 'both'`).
 *
 * Revoking this device should mean *neither* purchase it can prove still
 * holds up, not just the one the session id happens to name. So:
 *   - either side confirming a live purchase keeps Pro, full stop — the other
 *     side's refund says nothing about a second, still-paid purchase;
 *   - only when both sides affirmatively say no (refunded / not found) do we
 *     revoke;
 *   - anything else (a rate limit, a transport error, a Stripe outage on one
 *     side) is inconclusive for that side, so we fail open rather than revoke
 *     on half an answer.
 */
export function applyBothReVerifyOutcome(
  sessionAction: ReVerifyAction,
  restoreAction: ReVerifyAction,
): ReVerifyAction {
  if (sessionAction.kind === 'keep' || restoreAction.kind === 'keep') return { kind: 'keep' };
  if (sessionAction.kind === 'revoke' && restoreAction.kind === 'revoke') return { kind: 'revoke' };
  return { kind: 'fail_open' };
}
