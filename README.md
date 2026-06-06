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

## Starting a new app

The current recommended workflow is **clone-and-customize**, not a published package. Pulling fixes back into existing apps is a manual `git diff src/kit` + paste; that overhead is fine while there are <5 apps using the kit.

```bash
# 1. Clone
cp -R appkit ~/Documents/Personal\ Projects/Github/my-new-app
cd ~/Documents/Personal\ Projects/Github/my-new-app
rm -rf .git && git init

# 2. Configure
cp kit.config.example.ts kit.config.ts
$EDITOR kit.config.ts             # Stripe IDs, copy, prefix

# 3. Replace the demo
$EDITOR src/App.tsx                # build your real app
$EDITOR index.html                 # title, OG tags

# 4. Stripe + Vercel
# - Create the product, price, Buy Button, Payment Link in Stripe
# - Set the env vars in Vercel (STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_PRODUCT_ID)
# - Deploy

# 5. Test the unlock flow with a real Stripe test charge before launch
```

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

- **Server entitlement mode** — for apps that need cross-device unlock or subscriptions (Birthday Sender will force this)
- **Magic-link auth** — when localStorage isn't enough
- **Subscription verification** — when one-time-purchase isn't enough

Don't add these speculatively. Add them when an app needs them.

## License

[MIT](./LICENSE) — fork it, ship it, charge for it. Attribution appreciated but not required.
