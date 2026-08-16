import { describe, it, expect } from 'vitest';
import {
  shouldReVerify,
  reVerifyPlan,
  applyReVerifyResponse,
  REVERIFY_THROTTLE_MS,
} from './proReverify';

const NOW = 1_700_000_000_000; // arbitrary fixed "now" for determinism

describe('shouldReVerify', () => {
  it('fires when pro is real, session is on file, and the throttle has expired', () => {
    expect(
      shouldReVerify({
        isProReal: true,
        sessionId: 'cs_live_abc',
        lastCheck: NOW - REVERIFY_THROTTLE_MS - 1, // just past throttle
        now: NOW,
      }),
    ).toBe(true);
  });

  it('fires when there is no prior check timestamp (lastCheck = 0)', () => {
    expect(
      shouldReVerify({
        isProReal: true,
        sessionId: 'cs_live_abc',
        lastCheck: 0,
        now: NOW,
      }),
    ).toBe(true);
  });

  it('skips when pro is not real (no purchase to re-check)', () => {
    expect(
      shouldReVerify({
        isProReal: false,
        sessionId: 'cs_live_abc',
        lastCheck: 0,
        now: NOW,
      }),
    ).toBe(false);
  });

  it('skips when no verified Stripe session_id is stored', () => {
    expect(
      shouldReVerify({
        isProReal: true,
        sessionId: '',
        lastCheck: 0,
        now: NOW,
      }),
    ).toBe(false);
  });

  it('skips when the stored session_id is malformed (defensive: no cs_ prefix)', () => {
    expect(
      shouldReVerify({
        isProReal: true,
        sessionId: 'not_a_session',
        lastCheck: 0,
        now: NOW,
      }),
    ).toBe(false);
  });

  it('skips when null is somehow loaded for sessionId', () => {
    expect(
      shouldReVerify({
        isProReal: true,
        sessionId: null,
        lastCheck: 0,
        now: NOW,
      }),
    ).toBe(false);
  });

  it('skips within the 24h throttle window', () => {
    expect(
      shouldReVerify({
        isProReal: true,
        sessionId: 'cs_live_abc',
        lastCheck: NOW - REVERIFY_THROTTLE_MS + 60_000, // 1 minute inside window
        now: NOW,
      }),
    ).toBe(false);
  });

  it('fires exactly at the throttle boundary', () => {
    // Boundary check — at exactly 24h since lastCheck, we fire (not skip).
    expect(
      shouldReVerify({
        isProReal: true,
        sessionId: 'cs_live_abc',
        lastCheck: NOW - REVERIFY_THROTTLE_MS,
        now: NOW,
      }),
    ).toBe(true);
  });
});

describe('reVerifyPlan', () => {
  const base = { isProReal: true, sessionId: '', restoreEmail: '', lastCheck: 0, now: NOW };

  it('prefers the session id when both handles are on file', () => {
    // Exact, no stored PII, one Stripe call.
    expect(
      reVerifyPlan({ ...base, sessionId: 'cs_live_abc', restoreEmail: 'buyer@example.com' }),
    ).toEqual({ kind: 'session', sessionId: 'cs_live_abc' });
  });

  it('falls back to the restore email when there is no session id', () => {
    // The regression this exists for: a device that unlocked Pro via
    // restore-by-email stores no `cs_...`, so without this fallback it would
    // never be re-checked against the backend again and a later refund could
    // not revoke it there.
    expect(reVerifyPlan({ ...base, restoreEmail: 'buyer@example.com' })).toEqual({
      kind: 'restore',
      email: 'buyer@example.com',
    });
  });

  it('trims a stored restore email', () => {
    expect(reVerifyPlan({ ...base, restoreEmail: '  buyer@example.com  ' })).toEqual({
      kind: 'restore',
      email: 'buyer@example.com',
    });
  });

  it('skips when neither handle is on file (e.g. a #pro=1 instant unlock)', () => {
    expect(reVerifyPlan(base)).toEqual({ kind: 'skip' });
  });

  it('skips a malformed stored restore email', () => {
    expect(reVerifyPlan({ ...base, restoreEmail: 'not-an-email' })).toEqual({ kind: 'skip' });
  });

  it('skips when pro is not real, whichever handle is present', () => {
    expect(
      reVerifyPlan({ ...base, isProReal: false, restoreEmail: 'buyer@example.com' }),
    ).toEqual({ kind: 'skip' });
  });

  it('respects the throttle on the restore path too', () => {
    expect(
      reVerifyPlan({
        ...base,
        restoreEmail: 'buyer@example.com',
        lastCheck: NOW - REVERIFY_THROTTLE_MS + 60_000,
      }),
    ).toEqual({ kind: 'skip' });
  });

  it('falls back to restore when the stored session id is malformed', () => {
    expect(
      reVerifyPlan({ ...base, sessionId: 'not_a_session', restoreEmail: 'buyer@example.com' }),
    ).toEqual({ kind: 'restore', email: 'buyer@example.com' });
  });
});

describe('applyReVerifyResponse', () => {
  // Shared by BOTH the session (GET) and restore (POST) re-verify paths —
  // `/api/verify-purchase` returns `{ verified: boolean }` in both modes, read
  // through the same `r.ok ? r.json() : null` wrapper.

  it('revokes when the endpoint explicitly returns verified: false', () => {
    // The affirmative "no active/unrefunded entitlement" answer — a refunded
    // buyer, a wrong product, or an unpaid session.
    expect(applyReVerifyResponse({ verified: false })).toEqual({ kind: 'revoke' });
  });

  it('keeps pro when verified: true', () => {
    expect(applyReVerifyResponse({ verified: true })).toEqual({ kind: 'keep' });
  });

  it('fails open on a null response (non-2xx: 429 rate-limit or 5xx)', () => {
    // A 429 (the restore endpoint is IP rate-limited) or a 5xx (Stripe blip,
    // missing env) both become null via the fetch wrapper. We must not revoke —
    // a flaky backend is not evidence of a refund, and stripping Pro from a
    // paying buyer is the worst outcome.
    expect(applyReVerifyResponse(null)).toEqual({ kind: 'fail_open' });
  });

  it('keeps pro when the verified field is missing (treat ambiguity as no signal)', () => {
    // API contract drift: if `verified` is missing or the wrong type, we err on
    // the side of NOT revoking. A spurious revoke is much worse than a missed
    // one — buyers loudly notice; abusers do not.
    expect(applyReVerifyResponse({} as { verified?: boolean })).toEqual({
      kind: 'keep',
    });
  });
});
