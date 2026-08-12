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

### A8 — Boot re-verify so a refund revokes on-device — 2026-08-12
*(closes R8 (High); ports our-family-lizard#44)*

`src/kit/auth/useAuth.ts` had no boot re-verify at all — cached Pro was
permanent on the device by every route, so a refund never revoked it there.
This was the root of the re-verifiers `our-family-lizard` (R15) and
`debt-snowball-ant` each hand-built independently, and as the reference kit it
shipped the gap to every future adopter.

Added `src/kit/auth/proReverify.ts` (pure policy: 24h throttle, session-id ▸
restore-email handle preference, affirmative-only response mapper) +
`proReverify.test.ts` (20 tests). `useAuth` now runs a mount-only, throttled
boot re-verify against `/api/verify-purchase` (GET by session id, POST by stored
email); it **revokes only on a 2xx `{verified:false}`** and **fails OPEN** on
429/5xx/network so a flaky backend never strips a paying buyer. Restore stores
the email handle; both unlock paths seed `pro_last_verified_at`. The handle-less
`#pro=1` path stays unlocked by design (documented).

**Verified:** `npm run lint && npm test && npm run build` green; 56/56 tests
across 3 files. Fixed a broken `npm ci` en route (hoisted `@emnapi/wasi-threads`
`1.2.2` → `1.2.3` to match `oxide-wasm32-wasi@4.2.4`'s bundle; surgical, no
whole-lock regen). **Blast-radius follow-up:** file Meseeks checks that
`our-family-lizard` and `debt-snowball-ant` match this kit shape (they should —
this was ported *from* their fixes).

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
