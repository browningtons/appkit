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

### A4 — Add `.env.example` + test/live key-hygiene note — **score 8**
- Impact 3, Confidence 5, Risk Reduction 2, Effort −2.
- Closes **R5 (Low)**. Single canonical env manifest for all money-path vars.
  May be handed to the Trust Ledger wolf (its lane: env docs / key hygiene).

### A5 — Add an `npm run verify` alias + dependency-audit CI step — **score 7**
- Impact 3, Confidence 4, Risk Reduction 2, Effort −2.
- CI runs lint/test/build but there's no `verify` alias (the canonical loop assumes
  one) and no `npm audit` gate. Add `"verify": "npm run lint && npm test && npm run build"`
  and an audit step (watch the recurring **dompurify** CVE the pack has hit 3×).

## Completed

_(none yet — first visit)_

## Radical bets

_(reserved for the Learning Loop wolf's weekly Pathfinder pass)_
