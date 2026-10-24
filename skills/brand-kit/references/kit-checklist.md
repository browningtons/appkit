# What a logo and web designer hand over

The deliverable list for a consumer web app with a logo or mascot. Mark each
row Have, Fix or Missing in the audit. Rows marked **generator** are what
`build_icons.py` writes. The rest need a designer, another generator pass or
a one-off script.

## Logo system

| Deliverable | Format | Why |
|---|---|---|
| Vector master of the mark | SVG + PDF | Everything else derives from it; raster tops out at its pixel size |
| Small-size mark | SVG or tuned PNG, 16/32/48 | Full figures fall apart below 48px; usually the head or a monogram |
| Horizontal lockup | mark + wordmark, SVG/PNG | Headers, Stripe Checkout, email, press |
| Stacked lockup | SVG/PNG | Square spaces: avatars, PDF covers, stickers |
| Wordmark alone | SVG, outlined | The name set once and kerned, not live text |
| One-color versions | dark on light, light on dark | Receipts, print, embossing, single-ink use |
| Pro / tier lockup | if the app has tiers | Upgrade page, Pro emails, Pro share card |
| Clear space and minimum size | one rule sheet | Keeps the mark from being crowded or shrunk to mush |

## App and browser icons

| File | Size | Rule | |
|---|---|---|---|
| `favicon.ico` | 16 + 32 + 48 | Browsers and crawlers request `/favicon.ico` whether or not it's linked | generator |
| `favicon-96.png` | 96 | Google Search: the favicon must be a multiple of 48px square, linked with `rel="icon"` from the homepage | generator |
| `apple-touch-icon.png` | 180 | Square, full-bleed, no transparency. iOS applies the mask | generator |
| `icon-192.png`, `icon-512.png` | 192, 512 | Manifest `purpose: any`, shown as-is in install dialogs and desktop PWAs | generator |
| `icon-maskable-512.png` | 512 | Manifest `purpose: maskable`. Full-bleed, with content inside the centered circle 80% wide | generator |
| `favicon.svg` | vector | Optional. Sharp at every density, can adapt to dark tabs. Needs a vector small mark | |
| Monochrome icon | 512 | Optional. Manifest `purpose: monochrome`, used by Android 13+ themed icons | |

## Social and marketing

| Deliverable | Size | Notes |
|---|---|---|
| Share card (`og:image`) | 1200×630 PNG/JPG | Also `twitter:card = summary_large_image` |
| Per-audience share card | 1200×630 | Pricing or upgrade routes can carry their own |
| Profile avatar | 400×400, 1080×1080 | Only if the app has social accounts |
| Profile banners | X 1500×500, LinkedIn 1584×396 | Same condition |
| Stripe Checkout branding | square icon ≥128, logo | Set in the Stripe dashboard. Paul's account is shared, so check what buyers see |
| Email header | the mark at 2× the displayed size | Magic-link and receipt templates |

## Illustration and source

| Deliverable | Notes |
|---|---|
| Posed illustrations | One per behavioral moment, same style and tile treatment |
| Transparent cut-outs | Each pose without its tile, around 1024px, for heroes, cards and stickers |
| Source files in the repo | The generator originals in `brand/`, so the art doesn't live on one laptop |
| Brand guide | UI palette, illustration palette (outline ink, accent colors), lockups, clear space, do and don't. Belongs in the app's DESIGN.md |

## Platform rules, with where they come from

- **Google Search favicons** (Search Central, "Define a favicon to show in
  search results"): a multiple of 48px square, any valid favicon format,
  linked from the homepage, crawlable.
- **Apple touch icon** (Apple, Configuring Web Applications): 180×180 for
  current iPhones. iOS adds the rounded mask. Transparent pixels render black.
- **Maskable icons** (W3C Web App Manifest, `purpose: maskable`): the safe
  zone is a centered circle with a radius of 40% of the icon size. Anything
  outside it may be cropped by the launcher's shape.
- **Open Graph**: 1200×630 is the common large-card size, and `og:image`
  must be an absolute URL.
