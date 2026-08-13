# Agent Backlog — appkit

Ranked work for the building pack. Score = `Impact + Confidence + Risk Reduction
− Effort` (each 1–5); higher is sooner. See
[docs/agent-operating-loop.md](agent-operating-loop.md) for the loop and rubric.

Seeded 2026-07-12 by the **Revenue Rail** wolf (first pack visit). These map to
risks in [docs/launch-risk-register.md](launch-risk-register.md).

## Active

### A1 — Unlock Pro on promo / $0 (`no_payment_required`) checkout — **score 13**
- Impact 5, Confidence 4, Risk Reduction 5, Effort −1.
- Closes **R1 (High)**. Accept `payment_status in ('paid','no_payment_required')`
  in `entitlementFromSession` (`api/_lib.ts`) and the GET path in
  `api/verify-purchase.ts`. Add a `no_payment_required` fixture to
  `api/_lib.test.ts`. Pure change, provable without live money.
- **Reference-repo blast radius:** after fixing, file Meseeks follow-ups to check
  `our-family-lizard` and `debt-snowball-dolphin` for the same `=== 'paid'` literal.
- Highest-value first mission item — do this before anything else.

### A2 — Don't revoke Pro on a partial refund — **score 10**
- Impact 4, Confidence 4, Risk Reduction 4, Effort −2.
- Closes **R3 (Medium)**. Extract `isFullRefund(charge)` (compare
  `amount_refunded` to `amount`), only `revokeByPaymentIntent` when full. Unit-test
  full-vs-partial. Consider `charge.dispute.created`.

### A3 — Make client-mode restore refund-aware (or document the gap) — **score 8**
- Impact 4, Confidence 3, Risk Reduction 3, Effort −2.
- Closes **R2 (Medium)**. Either check refund state on the matched paid session
  before granting in client mode, or explicitly document in `ADOPTING.md` that
  refund revocation requires server mode. Prefer the doc + a smaller code guard.

### A7 — Make the shipped `trustLine` an obvious placeholder — **score 6**
- Impact 2, Confidence 5, Risk Reduction 1, Effort −2.
- Closes **R7 (Low)**. `kit.config.example.ts` ships *"30-day refund, no
  questions asked"* as finished-looking copy while every neighbouring field
  shouts `REPLACE_ME`. It is a binding refund promise made on an adopter's
  behalf, and it runs slightly ahead of what the kit does (R2/R3 open).

### A5 — Add an `npm run verify` alias + dependency-audit CI step — **score 7**
- Impact 3, Confidence 4, Risk Reduction 2, Effort −2.
- CI runs lint/test/build but there's no `verify` alias (the canonical loop assumes
  one) and no `npm audit` gate. Add `"verify": "npm run lint && npm test && npm run build"`
  and an audit step (watch the recurring **dompurify** CVE the pack has hit 3×).

## Completed

### A6 — Make `serverModeEnabled()` and the webhook agree — 2026-08-02
*(Revenue Rail; [PR #7](https://github.com/browningtons/appkit/pull/7))*

Closed **R6 (High)**. `serverModeEnabled()` now requires all three server-mode
vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_WEBHOOK_SECRET`);
two of three leaves server mode off so `verify-purchase` falls through to the
Stripe scan instead of trusting an always-empty `entitlements` table. New
`serverModePartiallyConfigured()` makes the webhook 500 (Stripe retries and
surfaces it) on a half-configured server-mode app, vs. a quiet 200 for a
plain client-mode one. 14 new tests across all eight var combinations.

This entry was reconciled into Completed on **2026-08-13** (Revenue Rail) —
the fix landed 11 days earlier and [docs/pack-ledger.md](https://github.com/browningtons/mission-control/blob/main/docs/pack-ledger.md)
already recorded the closure, but this repo's own backlog and risk register
still listed A6/R6 as open `[→ revenue-rail]`, which would have wasted the
next wolf's pick. See the same fix in
[docs/launch-risk-register.md](launch-risk-register.md) `## Closed`.

### A4 — Add `.env.example` + test/live key-hygiene note — 2026-07-31
*(Trust Ledger; closes R5, and turned up R6/A7 on the way)*

Revenue Rail seeded this and offered it to Trust Ledger explicitly — env docs
and key hygiene are its lane. Claimed and shipped.

`.env.example` now covers all six variables the API routes read, split into
required (client mode) and optional (server mode), with the R6 trap boxed at
the top of the server-mode block, the service-role-key warning, and a
test-vs-live "keep whole sets together" rule. `ADOPTING.md` §4 links to it and
gained a note that the kit reads **no** `VITE_` variable — client values live
in `kit.config.ts`, which is public by design.

**Verified both directions:** the six names in the manifest are exactly the six
`process.env` reads under `api/` — nothing documented that isn't read, nothing
read that isn't documented — and `.env.example` is not gitignored, so adopters
receive it. Re-run that comparison when adding a variable; a mismatch reopens
R5.

Writing the manifest is what exposed R6: documenting "these three turn on
server mode" forced a read of `serverModeEnabled()`, which checks two.

## Radical bets

_(reserved for the Learning Loop wolf's weekly Pathfinder pass)_
