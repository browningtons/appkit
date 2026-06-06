# appkit

[![License: MIT](https://img.shields.io/github/license/browningtons/appkit)](./LICENSE)
[![Made with Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Stripe](https://img.shields.io/badge/Stripe-Buy_Button-635BFF?logo=stripe&logoColor=white)](https://stripe.com)

Shared paywall + entitlement starter for shipping small monetized React apps.

Extracted from [Our Family Lizard](https://ourfamilylizard.com). The patterns are battle-tested on a real, paying production app — this repo is the same code, generalized so each new app fills in one config file and ships.

## What's in the box

- **`<UpgradeModal>`** — Stripe Buy Button, $29 price, feature checklist, restore link, trust footer
- **`<LockedOverlay>`** — translucent overlay for gating cards/sections in place
- **`<ProBadge>`** — amber gradient pill for marking Pro features
- **`<AdminBar>`** — admin top bar with view-as-user toggle (5-tap on logo to enter admin)
- **`useAuth()`** — entitlement + admin state, URL-based unlock activation, `requirePro(action, source)` wrapper, manual restore-by-email flow
- **`api/verify-purchase.ts`** — Vercel serverless route that verifies Stripe Checkout sessions and email-based restores. The restore path is IP rate-limited and uses Stripe Customer search (with a recent-session scan as fallback)
- **`api/stripe-webhook.ts`** — optional Stripe webhook for durable server-side entitlement (grant on `checkout.session.completed`, revoke on `charge.refunded`). No-op until you set the Supabase env vars — see below
- **Analytics layer** — UTM capture, Stripe `client_reference_id` decoration, named funnel events on Vercel Analytics

## Per-app contract: `kit.config.ts`

The only file each app fills in. Everything under `src/kit/` reads from it.

```ts
export const KIT_CONFIG: KitConfig = {
  app: { name, shortName, storagePrefix },
  stripe: { publishableKey, buyButtonId, paymentUrl, priceIdHint, productIdHint },
  upgrade: { headerTitle, headerSubtitle, price, priceCaption, features, trustLine },
  analytics: { eventPrefix },
  admin: { logoTapsToToggle, tapWindowMs },
};
```

See [`kit.config.example.ts`](./kit.config.example.ts) for the documented version.

## Required environment variables (Vercel)

```
STRIPE_SECRET_KEY    # sk_live_... or sk_test_...
STRIPE_PRICE_ID      # price_...
STRIPE_PRODUCT_ID    # prod_...
```

### Optional: server-entitlement mode

By default entitlement is client-trusted (localStorage + on-demand Stripe
re-verification). That deters casual non-payment but a determined user can
bypass it, and it can't survive a closed tab, work across devices, or react to
refunds. Set these three vars to upgrade an app to **durable, server-side
entitlement — with no code change**:

```
SUPABASE_URL                # project URL
SUPABASE_SERVICE_ROLE_KEY   # service role key (server-only, never shipped to client)
STRIPE_WEBHOOK_SECRET       # whsec_... signing secret for /api/stripe-webhook
```

When set:
- `api/stripe-webhook.ts` records every paid Checkout Session in the
  `entitlements` table — so a buyer who closes the tab before redirect still
  gets access.
- Refunds (`charge.refunded`) flip the row to `refunded`, revoking access.
- Restore-by-email reads the table (fast, refund-aware, no buyer-count ceiling)
  instead of scanning Stripe.

Setup:
1. Run `supabase/migrations/0001_entitlements.sql` against your project
   (`supabase db push` or the SQL editor).
2. Add a Stripe webhook endpoint pointing at `https://<app>/api/stripe-webhook`,
   subscribed to `checkout.session.completed` and `charge.refunded`. Copy its
   signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Deploy. Verify locally with
   `stripe listen --forward-to localhost:3000/api/stripe-webhook`.

## Starting a new app

appkit is consumed as a **versioned package**, installed from git and pinned to
a tag. Security fixes propagate by bumping the version — no copied code to keep
in sync across apps.

```bash
npm install github:browningtons/appkit#v1.0.0
```

Then wire the client, re-export the API routes in one line each, and set the
Stripe (and optional Supabase) env vars. Full walkthrough in
[`ADOPTING.md`](./ADOPTING.md).

This repo doubles as the **demo app** — `npm run dev` runs the showcase; the
package build (`npm run build:lib`) emits the consumable library to `dist/`.

## Running the demo locally

```bash
npm install
npm run dev
```

The demo renders all four UI primitives, the `requirePro` flow, the admin bar (tap logo 5× within 3s), and the upgrade modal. The Stripe Buy Button won't render with the placeholder `pk_test_DEMO` key — that's expected until you wire up real IDs.

## Tests

```bash
npm test          # run once
npm run test:watch
```

Tests cover the shared money path — the Stripe line-item matcher (`lineItemMatchesPro`) and the URL activation parser (`parseActivation`). These are the pieces that get copied verbatim into every consuming app, so a regression here would propagate silently. Add a case here before changing either.

> **Restore endpoint rate limiting** is best-effort in-memory — it dampens bursts within a warm serverless instance but does not survive cold starts or span concurrent instances. For a high-traffic app, back it with a shared store (Vercel KV / Upstash). See the comment block in `api/verify-purchase.ts`.

## Funnel events

Every app emits the same shared event names, prefixed with `analytics.eventPrefix`:

| Event | When |
|---|---|
| `landing_view` | First page load |
| `tab_view` | Tab/route changed |
| `upgrade_shown` | Upgrade modal opened (with `source`) |
| `pro_purchase` | Stripe verify succeeded |
| `restore_attempt` | Restore-by-email attempted (with `success`) |

Use `trackEvent(name, data)` for app-specific events. The kit doesn't try to be a full analytics framework — it's just a thin wrapper on `@vercel/analytics`.

## Roadmap

The kit will grow when consuming apps reveal real gaps:

- ✅ **Server entitlement mode** — durable Supabase-backed entitlement with webhook grant + refund revocation. Opt in via env vars (see above).
- **Magic-link auth** — for seamless cross-device unlock without re-entering email (today, server-mode cross-device goes through the restore-by-email flow).
- **Subscription verification** — when one-time-purchase isn't enough (`customer.subscription.*` events + a subscription status column).

Don't add these speculatively. Add them when an app needs them.

## License

[MIT](./LICENSE) — fork it, ship it, charge for it. Attribution appreciated but not required.
