# Launch Risk Register — appkit

Money-path and launch risks for the pack's paywall/entitlement reference kit.
Because this is the **reference implementation**, each risk here is also latent
in every repo that adopted the kit — the "Blast radius" column tracks that.

Seeded 2026-07-12 by the **Revenue Rail** wolf on its first pack visit. Scan was
~10 min over `api/`, `supabase/migrations/`, and the two payment routes; not
exhaustive. Severity: P0 (blocks launch / loses money now) · High · Medium · Low.

## Active

### R1 — Promo / $0 checkout does not unlock Pro — **High**
- **Where:** `api/_lib.ts` `entitlementFromSession` (`payment_status !== 'paid'`
  → null) and `api/verify-purchase.ts` GET (`paid = session.payment_status === 'paid'`).
- **Failure:** Stripe returns `payment_status: 'no_payment_required'` (not `'paid'`)
  for a checkout whose total is $0 — e.g. a 100%-off coupon or a free/intro price.
  Both the GET confirmation and the webhook's `entitlementFromSession` mapping
  reject such a session, so a legitimate promo buyer completes checkout and gets
  **no Pro access**. Confirmed by grep: `no_payment_required` is handled nowhere.
- **Fix (proposed):** treat `payment_status in ('paid','no_payment_required')` as
  entitled in both the pure mapper and the GET path. Guard with a unit test in
  `api/_lib.test.ts` (add a `no_payment_required` session fixture). Consider an
  explicit config flag if a repo wants to *reject* $0 unlocks.
- **Blast radius:** every adopter repo (`our-family-lizard`, `debt-snowball-dolphin`)
  copied this literal. File Meseeks follow-ups when fixing here.
- **Proof available today:** yes — pure unit test, no live money.

### R2 — Client-mode restore is not refund-aware — **Medium**
- **Where:** `api/verify-purchase.ts` POST, Stripe-scan branches (lines ~121–166).
- **Failure:** In client mode (no Supabase), restore-by-email matches any session
  with `payment_status === 'paid'` and a matching line item — it never checks
  whether the underlying charge was later refunded. A refunded buyer can restore
  Pro indefinitely. Server mode is safe (the `refunded` row status handles it);
  client mode is the exposed surface. `debt-snowball-dolphin` shipped a
  near-identical "canceled subscriber could restore Pro" fix (pack ledger 2026-05-27).
- **Fix (proposed):** when a matching paid session is found in client mode, check
  the charge/refund state (`payment_intent` → latest charge `refunded` /
  `amount_refunded`) before granting, or document client mode as
  "no refund revocation — use server mode for refund-aware restore" in `ADOPTING.md`.
- **Proof available today:** partial — pure helper is testable; full path needs a
  Stripe test-mode fixture.

### R3 — Partial refund revokes full Pro access — **Medium**
- **Where:** `api/stripe-webhook.ts` `charge.refunded` case → `revokeByPaymentIntent`.
- **Failure:** `charge.refunded` fires on **partial** refunds too. A $1 partial
  refund on a $50 Pro purchase flips the entitlement row to `refunded` and revokes
  all access. The handler doesn't compare `charge.amount_refunded` to
  `charge.amount` (full-refund test). No chargeback/dispute handling either.
- **Fix (proposed):** only revoke when the refund is full
  (`charge.amount_refunded >= charge.amount` / `charge.refunded === true`);
  optionally handle `charge.dispute.created`. Unit-test the full-vs-partial branch.
- **Proof available today:** yes — extract a pure `isFullRefund(charge)` helper and test it.

### R4 — Restore rate limiter is in-memory only — **Low**
- **Where:** `api/verify-purchase.ts` `rateBuckets` (module-level `Map`).
- **Failure:** Already documented in code as best-effort: it does not survive cold
  starts or span concurrent serverless instances, so the POST restore path remains
  an email-enumeration oracle at scale and can burn the Stripe rate limit.
- **Fix (proposed):** back the limiter with a shared store (Vercel KV / Upstash)
  for production; keep the in-memory default for the bare starter. Document the
  upgrade in `ADOPTING.md`. Low until real volume.
- **Proof available today:** N/A (infra change).

### R5 — No `.env.example`; key hygiene lives only in code comments — **Low**
- **Where:** repo root (no `.env.example`); env vars documented inline in
  `api/verify-purchase.ts` / `api/stripe-webhook.ts` / `api/_lib.ts` headers.
- **Failure:** Adopters have no single canonical env manifest, and there's no
  written guardrail against pointing a `sk_test_...` key at a production deploy (or
  vice-versa). This is a Trust-Ledger-adjacent gap surfaced here for coordination.
- **Fix (proposed):** add `.env.example` listing all money-path vars with
  test/live-key hygiene notes; cross-link from `ADOPTING.md`. (Consider handing to
  the Trust Ledger wolf.)
- **Proof available today:** yes — doc-only.

## Closed

_(none yet — first visit)_
