# Metrics — appkit

What "healthy" looks like for the pack's paywall/entitlement reference kit.
appkit has no live users of its own, so these are **code-health / coverage**
signals, not product analytics.

Seeded 2026-07-12 by the **Revenue Rail** wolf (first pack visit).

## Money-path invariant coverage

The pure helpers in `api/_lib.ts` are the correctness core. Track which
invariants have a proving test in `api/_lib.test.ts`:

| Invariant | Covered? |
| --- | --- |
| paid + Pro line item → active row | ✅ |
| not-paid → null | ✅ |
| no email → null | ✅ |
| wrong price/product → null | ✅ (rejects) |
| price rotated but product matches → active | ✅ |
| **$0 / `no_payment_required` → active** | ❌ (R1 / A1) |
| **partial refund → does NOT revoke** | ❌ (R3 / A2) |
| full refund → revokes | ⚠️ helper not extracted |
| idempotent record (upsert on session id) | ⚠️ implicit (PK), no test |

Goal: every row ✅ with a pure unit test. Fill top-down by backlog rank.

## Build / CI health

- `npm run lint && npm test && npm run build` is the local gate. CI (`.github/workflows/ci.yml`)
  runs the same on push/PR to `main`.
- No dependency-audit step yet (A5). Watch the recurring **dompurify** CVE.

## Adopter drift (reference-repo duty)

When a money-path invariant is fixed here, the same code may be stale in adopters.
Track follow-ups filed to Meseeks:

| Fix | our-family-lizard | debt-snowball-dolphin |
| --- | --- | --- |
| R1 promo/$0 unlock | ⏳ follow-up filed 2026-07-12 | ⏳ follow-up filed 2026-07-12 |
