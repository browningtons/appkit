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

- `npm run verify` (lint, `test:coverage`, build, `audit:deps`) is the local gate. CI
  (`.github/workflows/ci.yml`) runs the same steps on push/PR to `main`.
- Coverage floor (2026-11-03, A17 follow-up): statements 55% / branches 54% /
  functions 52% / lines 55%. Vitest 4 only counts untested files when
  `coverage.include` lists them (`src/**/*.{ts,tsx}`, `api/**/*.ts`), so the
  2026-11-01 floor (60/60/65/60) was measured on imported files alone
  (~63/63/70/64) and let untested UI through. Remeasured on the merged tree:
  70% / 67.6% / 66.37% / 70.28%. The floor was not lowered. Regression guard,
  not a target.
- Coverage floor raised 2026-11-12 (A21) to statements 80% / branches 76% /
  functions 81% / lines 81%, the measured 80 / 76.33 / 81.41 / 81.37 rounded
  down, after the five kit components and `useEntitlement.ts` went from 0% to
  100%.
- No dependency-audit step yet (A5). Watch the recurring **dompurify** CVE.

## Adopter drift (reference-repo duty)

When a money-path invariant is fixed here, the same code may be stale in adopters.
Track follow-ups filed to Meseeks:

| Fix | our-family-lizard | debt-snowball-dolphin |
| --- | --- | --- |
| R1 promo/$0 unlock | ⏳ follow-up filed 2026-07-12 | ⏳ follow-up filed 2026-07-12 |
