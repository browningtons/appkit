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

## Closed

### R7 — The kit ships a refund promise that reads like finished copy — **Low** — CLOSED 2026-09-04
- **Was:** `kit.config.example.ts` → `upgrade.trustLine`: *"Secure payment via
  Stripe. 30-day refund, no questions asked. No account. No recurring
  charges."* — production-ready prose while every neighbouring field shouted
  `REPLACE_ME`. It's a binding public promise about refunds made on an
  adopter's behalf, and it ran slightly ahead of what the kit does: R2
  (client-mode restore is not refund-aware) and R3 (a partial refund revokes
  full access) are both still open.
- **Fixed:** `trustLine` now reads `'REPLACE_ME: your refund and billing
  promise (e.g. ...)'`, consistent with the `pk_live_REPLACE_ME` /
  `price_REPLACE_ME` convention two fields above, plus a comment at the field
  pointing at R2/R3 so an adopter who does fill it in sees why "no questions
  asked" isn't true yet. `lint`/`build` verified green.
- **Left open deliberately — copy-only fix, not the stronger one the backlog
  scoped.** `docs/agent-backlog.md`'s "supporting bet" on A7 proposed failing
  the build (or `console.warn` at kit init) if `trustLine` still equals the
  shipped string — brittle-but-loud beats silent-but-flexible for a legal
  string. That's a code-behavior guard, not a copy fix, so it's filed to
  Launch Shield rather than done here: `[→ launch-shield]` wire a
  build-time or init-time check that `trustLine` was actually edited.

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
  Build-time only; reaches no adopter.
- **Addendum 2026-08-16 (lockfile re-repaired; A8 still open):** the PR
  carrying this fix sat unmerged for 13 days, so `dependency-audit.yml` never
  ran on the default branch and the "prove `npm ci` on Linux first" plan
  never got evidence — a repeat of the open-draft-is-invisible lesson. `npm
  ci` had bit-rotted *again* by landing time, on a different
  optional-platform subtree (`@rolldown/binding-wasm32-wasi`). Re-repaired
  the same way (additive lockfile regen; verified `npm ci` + `npm run verify`
  green). **Flipping `ci.yml` to `npm ci` (A8) was attempted but rejected by
  GitHub** — the lane's push token lacks `workflow` scope to modify files
  under `.github/workflows/`. A8 stays open, now correctly framed as a
  permissions blocker rather than a design choice; see `agent-backlog.md`.

### R6 — Two of the three server-mode vars silently breaks restore for real buyers — **High** — CLOSED 2026-08-02
- **Was:** `serverModeEnabled()` (`api/_lib.ts`) turned server mode on with
  just `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, while `ADOPTING.md`
  promised three vars. Set those two and forget `STRIPE_WEBHOOK_SECRET`, and
  every part behaved "correctly" into a hole: `emailHasActiveEntitlement()`
  returned a real (always-`false`) boolean instead of `null`, so restore
  never reached the Stripe fallback that would have found the purchase; the
  webhook, missing its secret, quietly 200'd `{handled:false}` and never
  wrote the `entitlements` table; Stripe recorded a successful delivery, so
  no failed-webhook alert ever fired. A customer who really paid was told
  "no purchase found," silently, forever.
- **Fixed:** [#7](https://github.com/browningtons/appkit/pull/7) —
  `serverModeEnabled()` now requires all three vars; a partial config (two of
  three) leaves server mode off, so `verify-purchase` falls through to the
  Stripe scan instead. New `serverModePartiallyConfigured()` lets the webhook
  distinguish a half-configured server-mode app (500, so Stripe retries and
  surfaces the failure) from a plain client-mode app (quiet 200, unchanged).
  14 new tests pin both functions across all eight var combinations,
  including that they can never both be true.
- **Verified:** re-ran `npm test` this visit — 36/36 passing, including the
  `serverModeEnabled` / `serverModePartiallyConfigured` suites. This repo's
  own `docs/agent-backlog.md` and this register had not been reconciled with
  the shipped fix; [docs/pack-ledger.md](https://github.com/browningtons/mission-control/blob/main/docs/pack-ledger.md)
  already recorded the closure 2026-08-02 — only the local copies were stale.

### R8 — The kit never re-verifies Pro, so a refund never revokes on-device — **High** — CLOSED 2026-08-12
- **Was:** `src/kit/auth/useAuth.ts` had no boot re-verify effect at all. Once
  Pro was written to `localStorage` (checkout redirect, `#pro=1`, or
  restore-by-email) it was permanent on that device by every route — the hook
  read `load('pro', false)` on mount and never asked the backend again. So even
  when a refund correctly flipped the server `entitlements` row to `refunded`
  (server mode) or would have, the device that had already unlocked kept Pro
  forever. The public claim in `README.md` (server mode "revoking access") and
  `ADOPTING.md` was only half-true: the row was revoked, the device was not.
  Because appkit is the reference kit, every future adopter shipped this — and
  it is the **root** of the independently hand-built re-verifiers in
  `our-family-lizard` (R15) and `debt-snowball-ant`.
- **Distinct from R2:** R2 is the *endpoint's* client-mode Stripe scan ignoring
  refund state (it answers `verified:true` for a refunded buyer). R8 is the
  *client* never asking again. They compose: in **server mode** the endpoint is
  refund-aware, so R8's re-verify now revokes end-to-end; in **client mode** the
  device now re-asks, but the honest answer still waits on R2. R8 is the
  plumbing; R2 is one source's truthfulness.
- **Fixed by:** porting the proven pattern from
  [our-family-lizard#44](https://github.com/browningtons/our-family-lizard/pull/44).
  New `src/kit/auth/proReverify.ts` holds the pure policy: a 24h throttle
  (`pro_last_verified_at`), a handle-preference plan (`cs_...` session id else
  restore email), and an affirmative-only response mapper. `useAuth` gained a
  mount-only boot re-verify effect that re-checks `/api/verify-purchase` (GET by
  session id, POST by stored email), **revokes only on a 2xx `{verified:false}`**,
  and **fails OPEN** on 429/5xx/network so a flaky backend never strips a paying
  buyer. Restore now stores the email handle and both unlock paths seed the
  throttle clock. The handle-less `#pro=1` instant unlock has nothing to
  re-check and stays unlocked by design — documented, not silent.
- **Verified:** `npm run lint && npm test && npm run build` green;
  `proReverify.test.ts` adds 20 pure-policy tests (throttle boundary,
  handle preference, affirmative-only revoke, fail-open on null/missing).
  Suite 56/56 across 3 files.
- **Build hygiene fixed en route:** `npm ci` was broken on `main` — the hoisted
  `@emnapi/wasi-threads` node was pinned to `1.2.2` while `@tailwindcss/oxide-wasm32-wasi@4.2.4`
  bundles `1.2.3`, so the lockfile was inconsistent with itself. Surgically
  bumped that one node (authoritative registry integrity, no whole-lock regen).
  CI uses `npm install`, which masked it — see backlog **A5** (switch CI to
  `npm ci` + add the `verify` alias) for the durable guard.

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
