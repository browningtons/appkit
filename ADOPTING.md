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

> **Set all three or none — two of the three is worse than zero.**
> `serverModeEnabled()` checks only `SUPABASE_URL` and
> `SUPABASE_SERVICE_ROLE_KEY`. Set those two and forget the webhook secret and
> the app reports server mode ON, so restore-by-email stops falling back to
> Stripe — while the webhook, missing its secret, acks 200 and writes nothing,
> leaving the `entitlements` table permanently empty. Real buyers are then told
> "no purchase found," with no error, no failed-webhook alert, and no retry.
> After configuring, buy one Pro seat and restore it by email before trusting
> it. See `.env.example` and R6 in the risk register.

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
