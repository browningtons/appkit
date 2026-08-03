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

### R6 — Two of the three server-mode vars silently breaks restore for real buyers — **High** · `[→ revenue-rail]`
- **Where:** `api/_lib.ts:117` (`serverModeEnabled`), `api/stripe-webhook.ts:62`
  (the ack-and-ignore guard), `api/verify-purchase.ts:111` (restore's early
  return).
- **Found:** 2026-07-31 by Trust Ledger, while writing the `.env.example` that
  closes R5. The manifest is what made the asymmetry visible: the docs say
  three variables turn server mode on; the code gates on two.
- **Failure:** set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and forget
  `STRIPE_WEBHOOK_SECRET`, and every part behaves "correctly" into a hole:
  1. `serverModeEnabled()` → `true` (it never checks the webhook secret), so
     `emailHasActiveEntitlement()` returns a real boolean instead of `null`,
     and restore-by-email **returns at `verify-purchase.ts:113` without ever
     reaching the Stripe fallback below it.**
  2. The webhook, missing its secret, hits the `!webhookSecret` guard and
     returns `200 {received: true, handled: false}` — so the `entitlements`
     table is never written, and **Stripe records a successful delivery**, so
     no failed-webhook alert ever fires.
  3. The table stays permanently empty, so the boolean from step 1 is always
     `false`: a customer who really paid is told "no purchase found," and the
     Stripe scan that would have found their session is skipped *because*
     server mode is on.

  Two of three is strictly worse than zero of three, and it is silent end to
  end — no exception, no retry, no log line, no Stripe-side error. The `200`
  in step 2 is deliberate (it makes adding the route to a client-mode app
  harmless) and correct in isolation; it only becomes a trap in combination
  with a `serverModeEnabled()` that disagrees with it about what "server mode"
  means.
- **Fix (proposed):** make the two agree. Either `serverModeEnabled()` also
  requires `STRIPE_WEBHOOK_SECRET`, or the webhook throws loudly when the
  Supabase vars are set and its secret is not. Belongs to Revenue Rail —
  entitlement code is its lane; Trust Ledger has documented the trap in
  `.env.example` and `ADOPTING.md` in the meantime so the copy is honest
  either way.
- **Proof available today:** yes — no deploy needed. `serverModeEnabled()`
  reads two vars, the webhook guard reads four, and
  `emailHasActiveEntitlement()` returns `null` only when `getSupabase()` is
  null or the query errors.

### R7 — The kit ships a refund promise that reads like finished copy — **Low**
- **Where:** `kit.config.example.ts` → `upgrade.trustLine`: *"Secure payment via
  Stripe. 30-day refund, no questions asked. No account. No recurring
  charges."*
- **Failure:** every other placeholder in that file announces itself —
  `pk_live_REPLACE_ME`, `price_REPLACE_ME`, `'Feature one'`, `'Your App'`. The
  trust line is the one field that reads as production-ready, so it is the one
  most likely to ship unedited — and it is a **binding public promise about
  refunds**, made on behalf of an adopter who never chose it. It also sits
  slightly ahead of what the kit does: R2 (client-mode restore is not
  refund-aware) and R3 (a partial refund revokes full access) are both open.
- **Fix (proposed):** make it obviously a placeholder, consistent with its
  neighbours — e.g. `'REPLACE_ME: your refund and billing promise'` — so an
  adopter has to make the claim deliberately.
- **Proof available today:** yes — read the file; compare against the
  `REPLACE_ME` convention two fields above.

## Closed

### R8 — `npm ci` failed on `main`, and nothing audited dependencies at all — **Medium** — CLOSED 2026-08-02
- **Was:** two gaps in the same seam, found on Launch Shield's first visit.
  1. **No dependency audit anywhere.** CI ran lint/test/build; no `npm audit` on
     push, on a schedule, or in any script. appkit's four production
     dependencies (`stripe`, `@supabase/supabase-js`, `@vercel/analytics`,
     `lucide-react`) are inherited by every adopter, so an advisory here is an
     advisory in all of them — and this is the portfolio's *quietest* repo by
     design (nine days between #5 and #7), so a push-triggered gate alone would
     have been close to no gate.
  2. **The lockfile did not resolve.** `npm ci` exited 1 on `main` for everyone,
     on every platform: `lock file's @emnapi/wasi-threads@1.2.2 does not satisfy
     @emnapi/wasi-threads@1.2.3`. The nested
     `@tailwindcss/oxide-wasm32-wasi/node_modules/@emnapi/*` subtree had been
     pruned away, leaving the file inconsistent with itself. An adopter cloning
     the kit and running the documented install got an error.
- **Why it was invisible:** CI installs with `npm install`, which re-resolves and
  papers over exactly this. The green badge was truthful about `npm install` and
  said nothing about `npm ci`. **A gate that cannot fail the way users fail is
  not a gate** — the same shape as the disabled-workflow finding in
  `economic-dashboard` and the paraphrased-prompt check in `portfolio.md`.
- **Fixed:** shared `audit:deps` script (`npm audit --omit=dev --audit-level=low`)
  called from CI, from `npm run verify`, and from a new daily
  `dependency-audit.yml` that installs with `npm ci`; lockfile regenerated
  (additive only — 6 entries restored, none removed, all five
  `@tailwindcss/oxide-linux-*` binaries intact); `ADOPTING.md` gained a **Carry
  the audit gate** section so adopters copy both halves.
- **Verified:** `npm ci` 1 → 0 after the repair; `npm run verify` green (lint,
  36/36 tests, build, **0 production vulnerabilities**); and the gate proved able
  to go red — the same command without `--omit=dev` exits 1 against the dev tree.
- **Left open deliberately:** 15 dev-tree advisories (1 critical `tar`, 10 high)
  all trace to `@vercel/node`, whose only offered fix is a **major downgrade**.
  Build-time only; reaches no adopter. Flipping CI itself to `npm ci` is **A8**,
  held back one PR until the scheduled workflow proves `npm ci` on Linux.

### R5 — No `.env.example`; key hygiene lived only in code comments — **Low** — CLOSED 2026-07-31
- **Was:** no canonical env manifest, and no written guardrail against pointing
  a `sk_test_...` key at a production deploy. Seeded by Revenue Rail and
  explicitly offered to Trust Ledger (env docs / key hygiene is its lane);
  claimed and closed on this visit.
- **Fixed:** added `.env.example` covering all six variables the API routes
  read, with a required/optional split, the R6 trap called out in a box, the
  service-role-key warning, and a test-vs-live "keep whole sets together" rule.
  Cross-linked from `ADOPTING.md` §4, which also gained the no-`VITE_` note.
- **Verified:** the manifest and the code agree exactly in both directions —
  the six names in `.env.example` are precisely the six `process.env` reads in
  `api/`, with nothing documented that isn't read and nothing read that isn't
  documented. `.env.example` is not gitignored (`.gitignore` covers `.env` and
  `.env.local` only), so adopters actually receive it.
- **Re-run the check:** compare `grep -rhon "process\.env\.[A-Z_0-9]*" api src
  scripts | sed 's/.*process\.env\.//' | sort -u` against
  `grep -oE "^[A-Z_0-9]+=" .env.example | tr -d '=' | sort -u`. A new variable
  with no manifest line reopens R5.

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
