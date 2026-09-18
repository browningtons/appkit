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

### ~~A7~~ CLOSED 2026-09-04 — obvious placeholder shipped (see Completed)

### ~~A8~~ CLOSED 2026-08-25 — flipped by hand with `workflow` scope (see Completed)
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

### A7 — Make the shipped `trustLine` an obvious placeholder — 2026-09-04
*(Trust Ledger; closes R7)*

`kit.config.example.ts` → `upgrade.trustLine` shipped *"Secure payment via
Stripe. 30-day refund, no questions asked. No account. No recurring
charges."* as finished-looking copy while every neighbouring field shouted
`REPLACE_ME` — a binding refund promise an adopter never chose, running
ahead of what the kit does (R2/R3 both still open). Now reads
`'REPLACE_ME: your refund and billing promise (e.g. ...)'`, matching the
`pk_live_REPLACE_ME` convention, plus a comment pointing at R2/R3 so an
adopter who does fill it in knows "no questions asked" isn't true yet.
`npm run lint` / `npm run build` verified green.

**Left the stronger fix for Launch Shield, `[→ launch-shield]`.** This
file's own "supporting bet" on A7 scoped a build-time or kit-init check
that fails/warns if `trustLine` still equals the shipped string —
brittle-but-loud beats silent-but-flexible for a legal string, and it's a
code-behavior guard rather than a copy fix. Filed rather than built here to
keep this change to the one thing it's for.

### A8 CI flips to `npm ci` — 2026-08-25
*(Applied by hand exactly as the A8 entry asked — no re-diagnosis.)*

Paul decided **keep the audit + fix properly** on the 4×-failed escalation card
(the audit was green three scheduled runs straight after the 8/22 lockfile
repair, #14). The one-line flip (`npm install` → `npm ci` in
`.github/workflows/ci.yml`) landed from a session running with Paul's own
credentials, which carry the `workflow` scope the lane token lacks — the
scope gap itself is still tracked in Meseeks as the PAT follow-up. With this,
lockfile bit-rot fails CI on the offending push instead of waiting for the
quiet repo's scheduled audit to notice.

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

### A8 — Promote the purchase-celebration banner from demo to a shared kit component — **score 6**
- Impact 3, Confidence 4, Risk Reduction 1, Effort −2.
- Found 2026-08-13 by **User Journey** while fixing the demo (see A9 below —
  Completed). `our-family-lizard` and `debt-snowball-dolphin` each hand-built
  their own post-purchase confirmation banner around the same
  `justPurchased`/`dismissJustPurchased` hook state, independently, because the
  kit never shipped one. The demo fix proves the pattern but still leaves every
  *new* adopter to build their own copy from scratch, same as the two existing
  ones did.
- **Fix (proposed):** extract a small `<PurchaseConfirmation>` (or similarly
  named) component under `src/kit/components/`, export it from `src/kit/index.ts`
  alongside `UpgradeModal`/`LockedOverlay`/`ProBadge`/`AdminBar`, and swap the demo
  to use it. Not done in the same change as A9 — new shared component +
  export-surface change is a larger, separate unit of work than wiring existing
  state into the existing demo.

### A5 — Add an `npm run verify` alias + dependency-audit CI step — **score 7**
- Impact 3, Confidence 4, Risk Reduction 2, Effort −2.
- CI runs lint/test/build but there's no `verify` alias (the canonical loop assumes
  one) and no `npm audit` gate. Add `"verify": "npm run lint && npm test && npm run build"`
  and an audit step (watch the recurring **dompurify** CVE the pack has hit 3×).

## Completed

### A9 — Render the post-purchase celebration in the reference demo — 2026-08-13
*(User Journey; [PR #10](https://github.com/browningtons/appkit/pull/10))*

`useAuth()` has returned `justPurchased`/`dismissJustPurchased` since the kit's
first cut, documented in its own JSDoc as existing "to show a celebration
banner once after a successful Stripe redirect" — but `src/App.tsx`, the demo
that claims to "exercise every kit primitive end to end," never rendered it. A
first-time buyer on a fresh, unmodified appkit app completed checkout and got
no confirmation beyond a small `ProBadge` appearing in the header.

Traced the gate-friction journey (fresh load → premium gate → `UpgradeModal` →
simulated Stripe redirect) and found the state was computed and returned but
had zero consumers anywhere in the repo (`grep -rn justPurchased src/` outside
`useAuth.ts` was empty). Downstream, `our-family-lizard` and
`debt-snowball-dolphin` each independently hand-built the same banner —
confirming this is a real, recurring gap, not a hypothetical one.

Wired it into the demo with a small dismissible emerald confirmation bar,
matching the pattern both downstream apps converged on. Demo-only change; no
`src/kit/` primitives, entitlement logic, or Stripe/webhook code touched.
Verified: `npm run lint` clean, `npm test` 36/36, `npm run build` succeeds.
Seeds **A8** (promote this to a proper shared kit component, not just a demo
fix) for a future visit.

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
