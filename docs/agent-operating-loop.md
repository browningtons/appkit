# Agent Operating Loop — appkit

How the building pack works on this repo. appkit is not a shipped product with
its own users — it's the pack's **paywall + entitlement starter**: the reference
implementation of the money path (`api/verify-purchase.ts`, `api/stripe-webhook.ts`,
`api/_lib.ts`, `supabase/migrations/`) that other repos adopt via `ADOPTING.md`.

That changes the stakes. A money-path bug here isn't one app's problem — it's a
latent bug in **every repo that copied the kit**. So the standing mission is:
keep the reference money path correct, honest, and provably so, because the
blast radius is the whole portfolio. When you fix an invariant here, file
follow-ups (Meseeks) to check the same pattern in the repos that adopted it
(`our-family-lizard`, `debt-snowball-dolphin`).

Adapted from `mission-control/docs/agent-operating-loop.md` on 2026-07-12 by the
**Revenue Rail** wolf (first pack visit — onboarding).

## The loop

1. Read [docs/agent-backlog.md](agent-backlog.md). The highest-scoring **Active**
   item is the next thing to ship unless Paul says otherwise.
2. Read [docs/launch-risk-register.md](launch-risk-register.md). If a top risk
   shifted (fixed in another session), update the register before picking work.
3. Ship the chosen item in one focused change:
   - Make the edit.
   - Add or update tests so the change is covered. The money-path helpers in
     `api/_lib.ts` are pure and unit-tested (`api/_lib.test.ts`) — prefer proving
     an invariant there over a guess.
   - Run the local gate: `npm run lint && npm test && npm run build`. (There is
     no `npm run verify` alias here yet — see backlog.)
   - Update any doc the change invalidates (this file, the register, the backlog,
     `README.md`, `ADOPTING.md`).
4. Move the backlog item to **Completed** with a dated entry: files touched,
   verification command, follow-ups.
5. Move the corresponding risk out of **Active** if closed, or update its note.
6. Stage only the files for this change, commit on the stable lane branch
   `pack/revenue-rail` (per the pack automation contract), and open or update
   its PR. Real commit message + Anthropic `Co-Authored-By` trailer.
7. Surface the next 2–3 ranked backlog options.
8. Teach the next session — if the loop itself caused friction, fix this file.

## Scoring rubric

`Impact + Confidence + Risk Reduction − Effort`, each 1–5.

- **Impact**: how much does this matter for correctly taking money — here,
  multiplied by how many adopter repos share the code.
- **Confidence**: how sure are we the change works as intended?
- **Risk Reduction**: how much does this shrink the register?
- **Effort**: how big is the change? (subtracted, so smaller is better)

Ties broken by: closes a top-3 risk > smaller diff > less new dependency.

## What "the money path" means in this repo

The kit runs in two modes (see `api/_lib.ts` header):

- **Client mode** (default, no backend store): entitlement lives in the browser
  and is re-verified against Stripe on demand. `verify-purchase` GET confirms a
  checkout session; POST restores by scanning Stripe for the buyer's email.
- **Server mode** (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` +
  `STRIPE_WEBHOOK_SECRET` set): the `stripe-webhook` route records each paid
  session in the `entitlements` table, refunds flip the row to `refunded`, and
  restore reads the table instead of scanning Stripe.

The money-path invariants every session should defend:

- paid checkout unlocks Pro
- **$0 / promo (100%-off coupon) checkout unlocks correctly** — Stripe returns
  `payment_status: 'no_payment_required'`, not `'paid'`, for a zero-total session
- wrong product / price is rejected
- restore-by-email works **and reflects refunds** (client mode too, not just server)
- webhook signature validation holds
- purchase upsert is idempotent (no double-grant) — keyed on `stripe_session_id`
- refund marking revokes entitlement, but a **partial** refund must not revoke
  full access
- missing-env behavior fails safe (500 / no-op, never silent grant)
- test/live Stripe key hygiene — env docs and code never let test keys serve prod

## Bug rule

When a session finds a bug (not just ships a feature), ask: **what would have
caught this earlier?** Then add one of: a unit test, an endpoint test, a CI
check, a checklist item, a metric, a clearer doc, or a safer default. When the
root cause is a duplicated literal or hardcoded pattern, grep the whole source
tree for siblings and fix (or document) every one — and because this is the
reference kit, grep the **adopter repos** too via a Meseeks follow-up.

## Hard rules

- **Never push directly to `main`.** Use the `pack/revenue-rail` lane branch and a PR.
- **Recurring agents are single writers.** One stable `pack/<lane>` branch, update
  its open PR, no-op when output is unchanged. See
  `mission-control/docs/pack-automation-contract.md`.
- **Never touch code and money-path safety on a guess.** Prove it with a pure
  unit test in `api/_lib.test.ts`, a runbook note, or a test-mode fixture — never
  by touching live Stripe or production entitlement data.
- **Don't bundle `supabase/` migration changes with auth/test/CI work.** Migrations
  are append-only and ordering-sensitive; new schema work is its own commit.
- **If a public claim (README/ADOPTING) and the code disagree, fix one in the
  same change.** Don't let docs drift.

## Stop conditions

- The Active backlog is empty of items that don't need production credentials.
- The Active risk register has only items that need a live environment.

When all hold: say so plainly and hand back. Don't manufacture work — a clean
rail is a valid periodic-review outcome.
