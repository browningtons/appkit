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

### A8 — Flip CI from `npm install` to `npm ci` — **score 6** — still open, now blocked on scope
- Impact 3, Confidence 4, Risk Reduction 3, Effort −4.
- A5/R8 held this back pending "a day of evidence" from the scheduled
  `dependency-audit.yml`. **That evidence never arrived — PR #8 sat unmerged
  13 days**, so the scheduled workflow never ran on the default branch at all
  (`gh workflow list` showed only `CI`). This run tried to land the flip
  directly instead, on live proof (see the R8 addendum): `git push` was
  **rejected by GitHub** — `refusing to allow a Personal Access Token to
  create or update workflow .github/workflows/ci.yml without workflow
  scope`. The lane's push token can edit every file in this repo except the
  one this task needs to touch.
- **Next wolf / a human with `workflow` scope:** the one-line change is
  `- run: npm install` → `- run: npm ci` in `.github/workflows/ci.yml`,
  already proven safe by this run's `npm ci` pass against the re-repaired
  lockfile. Filed to Meseeks as a permissions follow-up; don't re-diagnose,
  just apply it.

## Completed

### R8 lockfile re-repair (bit-rot recurrence) — 2026-08-16
*(Launch Shield; second Launch Shield visit to this repo)*

Landed the unmerged PR #8 (open 13 days) carrying A5/R8. Verifying it first
surfaced that `npm ci` had broken **again** in the interim — a *different*
optional-platform subtree this time (`@rolldown/binding-wasm32-wasi`'s
`@emnapi/*` deps, missing `1.11.3`) — the same bit-rot class recurring within
two weeks, and exactly the scenario A8 exists to catch on push instead of
waiting for a quiet repo's schedule. Regenerated with
`npm install --package-lock-only --ignore-scripts`; diff is additive
(`@emnapi/core`/`@emnapi/runtime` restored) plus benign `peer` flag
normalization from a newer local npm, nothing removed. Verified: `npm ci`
now succeeds; `npm run verify` green (36/36 tests, clean lint, clean build);
`npm run audit:deps` 0 production vulnerabilities.

### A5 — `npm run verify` alias + dependency-audit gate, on push *and* on a clock — 2026-08-02
*(Launch Shield; first Launch Shield visit to this repo)*

CI ran lint/test/build and **nothing audited dependencies** — appkit had no
`npm audit` anywhere, and no `verify` alias despite the canonical operating loop
assuming one. Shipped:

- `audit:deps` = `npm audit --omit=dev --audit-level=low`, and
  `verify` = `lint && test && build && audit:deps`, in `package.json`.
- CI calls `npm run audit:deps` (not an inline command) so it cannot drift.
- New `.github/workflows/dependency-audit.yml` runs the same script daily at
  14:00 UTC with `workflow_dispatch`, installing via `npm ci`.
- `ADOPTING.md` gained a **Carry the audit gate** section, because appkit's
  production dependencies become the adopter's production dependencies.

**Why the scheduled half is the point.** A push-triggered audit only catches
advisories published at the moment someone pushes, and appkit is the portfolio's
quietest repo *by design* — nine days passed between #5 and #7. A finished
reference kit is exactly the repo that stops getting pushes, and its four
production deps (`stripe`, `@supabase/supabase-js`, `@vercel/analytics`,
`lucide-react`) are inherited by every adopter, so one advisory here lands in all
of them at once. This is the third ring repo in a row found with no audit gate —
after `finance-app` (2026-08-01), where adding the gate immediately surfaced an
unauthenticated RCE, and `golden-data-app` (2026-08-02, 10 advisories → 3).

**Writing the scheduled workflow is what found the broken lockfile.** It installs
with `npm ci`, so the gate had to be tried — and `npm ci` **failed on `main`**,
on every platform, not just Linux: `lock file's @emnapi/wasi-threads@1.2.2 does
not satisfy @emnapi/wasi-threads@1.2.3`. The nested
`@tailwindcss/oxide-wasm32-wasi/node_modules/@emnapi/*` subtree had been pruned
out of the lockfile (the macOS-prunes-emnapi failure the portfolio has hit
before), leaving it inconsistent with itself. **Anyone cloning the reference kit
and running `npm ci` — the documented way to install it — got an error, and CI
never noticed because CI runs `npm install`, which silently re-resolves.** Fixed
here by regenerating: purely additive, 6 entries restored, **nothing removed**,
all five `@tailwindcss/oxide-linux-*` binaries still present. See R8.

**Verified, both directions:** `npm run verify` green end to end — lint clean,
36/36 tests, build OK, **0 production vulnerabilities**. `npm ci` exits 0 against
the committed lockfile after the repair (it exited **1** before). And the gate
can actually fail: the identical command without `--omit=dev` exits **1** against
the 15 dev-tree advisories. A gate that cannot go red proves nothing.

**Method note for the next wolf:** the first reading of that `npm ci` was a false
green, because it was run as `npm ci | tail` — the pipeline returns *tail's*
exit status, so a failing install reported success. This is the same shadowing
bug that lost a wolf's `git push` on 2026-07-31. **Never read an exit code
through a pipe.**

**Deliberately not fixed:** those 15 dev advisories (1 critical `tar`, 10 high)
all trace to `@vercel/node`, whose only offered "fix" is a **major downgrade**
to 4.0.0. They are build-time only and reach no adopter. Ported from
[debt-snowball-ant#139](https://github.com/browningtons/debt-snowball-ant/pull/139).

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
