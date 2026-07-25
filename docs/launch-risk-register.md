# Launch Risk Register — appkit

Money-path and launch risks for the pack's paywall/entitlement reference kit.
Because this is the **reference implementation**, each risk here is also latent
in every repo that adopted the kit — the "Blast radius" column tracks that.

Seeded 2026-07-12 by the **Revenue Rail** wolf on its first pack visit. Scan was
~10 min over `api/`, `supabase/migrations/`, and the two payment routes; not
exhaustive. Severity: P0 (blocks launch / loses money now) · High · Medium · Low.

## Active

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

### R1 — Promo / $0 checkout does not unlock Pro — **High** — CLOSED 2026-07-24
- **Was:** Stripe returns `payment_status: 'no_payment_required'` (not `'paid'`)
  for a $0 total — a 100%-off coupon or a free/intro price. Four gates rejected
  such a session, so a legitimate promo buyer completed checkout and got **no
  Pro access**: `api/_lib.ts` `entitlementFromSession` (shared by the GET
  verification path *and* the `checkout.session.completed` webhook), plus
  `api/verify-purchase.ts` at the GET confirmation and both POST restore
  branches (customer-search and recent-session scan).
- **Fixed by:** [appkit#4](https://github.com/browningtons/appkit/pull/4),
  merged 2026-07-24. Adds a shared exported `sessionIsSettled(status)` helper
  (`'paid' || 'no_payment_required'`) in `api/_lib.ts` and substitutes it at all
  four gates. Ports the pattern proven in
  [our-family-lizard#25](https://github.com/browningtons/our-family-lizard/pull/25).
- **Refund revocation deliberately untouched:** `charge.refunded` →
  `revokeByPaymentIntent` still runs, matching the reference fix. A settled $0
  session is entitled; a refunded one is still revoked.
- **Test:** `api/_lib.test.ts` — `treats zero-total (no_payment_required)
  sessions as settled` (helper unit) and `maps a zero-total
  (no_payment_required) Pro session to an active row` (mapper integration).
  Suite green: 48/48 across 4 files, `tsc -b` clean.
- **Blast radius — all adopters now clear:** `our-family-lizard` fixed
  2026-07-15 (#25); `debt-snowball-ant` (local folder `debt-snowball-dolphin`)
  audited 2026-07-24 and found already clean — it defines the same
  `sessionIsSettled` helper in both `api/verify-purchase.ts` and
  `api/stripe-webhook.ts`, with zero bare `payment_status === 'paid'` gates
  remaining. appkit was the last carrier, and as the pack's paywall starter it
  would have shipped the bug to every future adopter.
