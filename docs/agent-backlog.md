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

### A6 — Make `serverModeEnabled()` and the webhook agree — **score 13** · `[→ revenue-rail]`
- Impact 5, Confidence 5, Risk Reduction 5, Effort −2.
- Closes **R6 (High)**, found 2026-07-31 while writing the A4 manifest. Setting
  `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` without `STRIPE_WEBHOOK_SECRET`
  turns server mode on, stops restore falling back to Stripe, and leaves the
  `entitlements` table permanently empty — so paying customers are told "no
  purchase found," silently, with Stripe reporting successful webhook delivery.
- Either make `serverModeEnabled()` require the webhook secret too, or make the
  webhook fail loudly when the Supabase vars are set and its secret is not.
  **This is the top item in the repo** — it loses real buyers their access.
- Entitlement code is Revenue Rail's lane; Trust Ledger has documented the trap
  in `.env.example` and `ADOPTING.md` so the copy is honest until the code is.

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

_(Learning Loop wolf, weekly Pathfinder pass — proposals for Paul to select,_
_NOT auto-build. 2026-08-13, W33, lens = First-principles: rebuilt today,_
_what would you refuse to carry over?)_

**The bet: kill client-only mode, or demote it to an explicitly unsupported
fallback — every real adopter runs server mode, and the client/server split is
the single recurring source of this repo's entitlement bugs.** R1 (promo
checkout didn't unlock), R2 (client-mode restore isn't refund-aware — A3 is
still open and explicitly considers "just document the gap" an acceptable
fix), and R6 (server mode silently half-enabled, buyers told "no purchase
found") are three different symptoms of the same cause: two independent code
paths that have to agree on what "entitled" means, checked against Stripe
directly in one and against a mirrored Supabase table in the other. Both
repos that actually ship on this kit — `our-family-lizard` and
`debt-snowball-ant` — configure server mode. Client-only mode exists because
the kit was designed to work without a backend; that constraint stopped being
real the moment Supabase became a first-class kit dependency for auth. Why
now: A6 just closed (`#7`, requiring all three server-mode vars) by adding a
*third* rule to keep the two paths agreeing, which is treating the symptom
again — the bug class won't stop producing R-numbers until the two paths
become one. **Smallest slice: not a deletion.** Grep both adopters'
`kit.config` for 100% server-mode usage (data, not assumption), then change
nothing except the default: `serverModeEnabled() === false` starts emitting a
loud console/build-time warning ("client-only mode is unsupported — refund
and restore correctness are not guaranteed") instead of silently behaving as
a first-class mode. That alone converts three future silent-entitlement bugs
into one loud one, without breaking a hypothetical serverless adopter who
doesn't exist yet. **Risk:** ADOPTING.md currently sells client-only mode as
a legitimate zero-backend option; demoting it is a documented capability
regression for a kit whose whole pitch is "adopt in an afternoon," so this is
Paul's call on positioning, not just code.

**Supporting bet: the placeholder legal copy (A7) should fail the build, not
just look different.** `kit.config.example.ts` ships *"30-day refund, no
questions asked"* as production-ready `trustLine` copy while every
neighbouring field shouts `REPLACE_ME` — A7 proposes making it "an obvious
placeholder," which still trusts every future adopter to notice and edit
prose. First-principles: a refund promise is a legal commitment made on an
adopter's behalf by a starter kit; nothing should let it ship un-reviewed.
Smallest slice: if `trustLine` still equals the shipped example string at
build time, fail the build (or at minimum `console.warn` at kit
initialization, which A7 doesn't currently propose) rather than relying on a
code comment. Effort is near-zero; the only reason to hold it is that a
build-time string match is brittle against paraphrase, which is an
acceptable gap — brittle-but-loud beats silent-but-flexible for a legal
string.
