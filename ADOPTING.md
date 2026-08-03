# Adopting appkit in an app

appkit is consumed as a **versioned package**, not copied. Apps install a
tagged version from git, import the kit, and re-export the API routes in one
line each. Security fixes land in appkit and propagate by bumping the version —
no per-app code divergence.

## 1. Install

```bash
npm install github:browningtons/appkit#v1.0.0
```

Pin a tag (`#v1.0.0`), not a branch — that's your version. A `prepare` script
builds the library on install, so there's nothing else to run.

To upgrade later: bump the tag and reinstall.

```bash
npm install github:browningtons/appkit#v1.1.0
```

## 2. Wire the client

In `main.tsx`, wrap your app and provide your `kit.config.ts`:

```tsx
import { KitProvider } from '@browningtons/appkit';
import { KIT_CONFIG } from './kit.config';

createRoot(document.getElementById('root')!).render(
  <KitProvider config={KIT_CONFIG}>
    <App />
  </KitProvider>,
);
```

Then use the kit anywhere:

```tsx
import { useAuth, UpgradeModal, ProBadge, LockedOverlay } from '@browningtons/appkit';
```

Copy `kit.config.example.ts` from this repo into your app as `kit.config.ts`
and fill in the Stripe IDs + copy. Add `<stripe-buy-button>` to your app's own
`src/stripe.d.ts` (copy it from here) and the buy-button script tag to
`index.html`.

## 3. Wire the API routes

Create thin re-export files in your app's `api/` directory. Vercel turns these
into routes; the implementation lives in the package:

```ts
// api/verify-purchase.ts
export { default } from '@browningtons/appkit/verify-purchase';
```

```ts
// api/stripe-webhook.ts (only if using server-entitlement mode)
export { default, config } from '@browningtons/appkit/stripe-webhook';
```

The `config` re-export on the webhook is required — it disables body parsing so
Stripe signature verification works.

## 4. Environment variables (Vercel)

[`.env.example`](.env.example) is the canonical manifest — it lists every
variable the API routes read, with test/live key hygiene notes. Copy it to
`.env` for local dev and mirror the names into your host's env UI.

Always required:

```
STRIPE_SECRET_KEY
STRIPE_PRICE_ID
STRIPE_PRODUCT_ID
```

Add these three to turn on durable server-entitlement mode (webhook grant,
refund revocation, cross-device restore):

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
STRIPE_WEBHOOK_SECRET
```

> **All three, or none.** Server mode only switches on when every one of them is
> set — `serverModeEnabled()` requires all three, deliberately.
>
> The reason is worth knowing before you go hunting for why it "isn't turning
> on". Only the Stripe webhook writes the `entitlements` table, and it cannot
> verify a signature without `STRIPE_WEBHOOK_SECRET`. So a two-of-three config
> would leave that table permanently empty while the app still treated it as the
> source of truth — and `verify-purchase` would answer from the empty table
> instead of falling back to Stripe. **A customer who really paid gets told "no
> purchase found"** — with no error, no failed-webhook alert, and no retry.
>
> This is not hypothetical. Until 2026-08-01 `serverModeEnabled()` checked only
> the two Supabase vars, and the two-of-three config did exactly that, silently.
> It is **R6** in the risk register, and it is why this section exists.
>
> Two things now prevent it. A partial config runs in client mode, so the Stripe
> fallback stays live and the customer is served. And if you set the two Supabase
> vars but omit the secret, `/api/stripe-webhook` returns **500** with an
> explanatory log rather than a quiet `200` — so Stripe surfaces a failed
> delivery instead of recording a success that never happened.
>
> Still worth verifying by hand: after configuring, **buy one Pro seat and
> restore it by email before trusting it.** See [`.env.example`](.env.example)
> and R6 in the risk register.

**No browser env vars.** This kit reads no `VITE_`-prefixed variable anywhere.
Client-side values live in `kit.config.ts`, which ships in the bundle. Anything
you prefix with `VITE_` is served to every visitor — no secret above may ever
wear that prefix.

## 5. Server-mode setup (if used)

1. Apply the entitlements table to your Supabase project. The migration ships
   in the package:

   ```bash
   cp node_modules/@browningtons/appkit/supabase/migrations/0001_entitlements.sql \
      supabase/migrations/
   supabase db push
   ```

2. In Stripe → Webhooks, add `https://<your-app>/api/stripe-webhook`,
   subscribed to `checkout.session.completed` and `charge.refunded`. Put the
   signing secret in `STRIPE_WEBHOOK_SECRET`.

3. Smoke-test before launch:

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe-webhook
   stripe trigger checkout.session.completed   # row appears, status=active
   stripe trigger charge.refunded              # row flips to refunded
   ```

## Upgrade discipline

- Import only from the package's public entry points (`@browningtons/appkit`,
  `/server`, `/verify-purchase`, `/stripe-webhook`). Reaching into internals
  defeats versioned upgrades.
- When appkit ships a security fix, bump every app's pinned tag. Track which
  app is on which version (the launch-checklist review verifies this).

## Carry the audit gate

appkit's production dependencies become *your* production dependencies. Copy
both halves of the gate, not just the first:

```jsonc
// package.json
"audit:deps": "npm audit --omit=dev --audit-level=low",
"verify": "npm run lint && npm test && npm run build && npm run audit:deps"
```

1. **On push / PR** — call `npm run audit:deps` from your CI workflow.
2. **On a clock** — copy `.github/workflows/dependency-audit.yml`. This is the
   half that is easy to skip and the one that matters: a push-triggered audit
   can only catch an advisory that is already published at the moment someone
   happens to push, so a repo nobody touched this month is not audited, it is
   just quiet. A finished app is exactly the app that stops getting pushes.

Both call the same `audit:deps` script deliberately — one definition, so the
scheduled gate and the push gate cannot drift apart. `--omit=dev` keeps the gate
about what ships to users; `--audit-level=low` is the strictest setting that is
green today, and the pack has been bitten by *moderate* advisories three times
(dompurify), so do not loosen it without a reason written down.
