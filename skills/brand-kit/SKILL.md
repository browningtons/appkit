---
name: brand-kit
description: Audit a web app's artwork and build its platform icons from one piece of master art — favicon.ico, the search-result favicon, the Apple touch icon, PWA and maskable icons — for Paul Brown's apps (Vite + React on Vercel; works for any static site). Use when Paul asks for favicons, app icons, home-screen or PWA icons, "all the icon sizes", "all the artwork for this site", a brand asset audit or inventory, or what a logo or web designer would hand over; when a tab icon, search-result icon or home-screen icon looks wrong; or when new mascot or logo art arrives (usually generator PNGs on black) and needs turning into icons. Do NOT trigger for palette, tokens or layout (app-design-port), copy or voice (app-voice), drawing new art, or the social card on its own (launch-checklist covers the OG build script).
---

# Brand Kit

One master drawing in, every platform icon out. Before that, an audit that
says what art the app has, what's set up wrong, and what a professional kit
would add.

Snowball Penguin is the worked example (snowball-penguin #283, 2026-10-24).
Its art was strong and its icons were broken in ways no test catches:
`/favicon.ico` returned the app's HTML with a 200, the only favicon was 64px
(Google wants a multiple of 48), the full-body mascot was mush at 16px, the
Apple icon had transparent corners, and the maskable icon cropped the
mascot's feet. One generator run from the original drawing fixed all of it.

## Two modes

- **Audit**: "give me the lay of the land", "what artwork do we have", "what
  would a designer give me". Inventory, check each platform, compare against
  the kit, publish an audit sheet. Change nothing.
- **Build**: "fix the icons", "favicons", "new art is in". Generate, wire,
  verify, PR.

Paul usually wants the audit first, then picks what to build from it.

## Audit

1. **Inventory every image.** Note what each file is, its pixel size, its
   weight, and where the code uses it. Unreferenced files and art from an
   earlier brand count; repos keep both.

   ```bash
   find . -path ./node_modules -prune -o -path ./dist -prune -o -path ./.git -prune -o -type f \( -iname '*.png' -o -iname '*.svg' -o -iname '*.ico' -o -iname '*.jpg' -o -iname '*.webp' \) -print
   sips -g pixelWidth -g pixelHeight public/*.png          # macOS
   grep -n 'rel="icon"\|apple-touch-icon\|manifest' index.html public/*.html
   grep -n "icons" -A6 vite.config.ts                      # vite-plugin-pwa manifest
   grep -rnE "\.(png|svg|jpg|webp)" src api scripts | grep -v "\.test\."
   ```

2. **Probe the live site, reading content-type rather than status.** An SPA
   rewrite answers a missing file with `index.html` and a 200.

   ```bash
   for p in favicon.ico apple-touch-icon.png manifest.webmanifest; do curl -s -o /dev/null -w "$p %{http_code} %{content_type}\n" https://<domain>/$p; done
   ```

3. **Look at the art at the sizes it ships.** Downscale the favicon to 16 and
   32 and magnify with nearest-neighbor. Simulate iOS (transparency becomes
   black, then a rounded mask) and Android maskable (a centered circle 80%
   wide). Read the rendered images yourself; file names don't tell you a
   mascot's feet are cropped.

4. **Compare against [references/kit-checklist.md](references/kit-checklist.md)**
   and mark every row Have, Fix or Missing.

5. **Publish the audit sheet** as a private artifact. Start with Artifact
   quickstart, which loads the design guidance. Sections, in order:
   - Masthead with the marks and a stat row: files, used, need fixing, missing.
   - The marks with their specs, the UI palette from DESIGN.md, and the
     illustration colors sampled from the art.
   - A size ladder at actual size, 512 down to 16, with dashed ghosts for
     missing sizes and magnified 16/32 renders.
   - Platform renders: tab and search, iPhone, Android.
   - The pose or illustration library, placed vs not placed.
   - Social images, then clean-up candidates.
   - The kit table, then an ordered plan that says who does each step.

   Show assets on a transparency checkerboard with a mono spec line under each.

## Build

1. **Find the master art.** Don't use `public/*.png`; find the largest original.
   Generator art is usually 1024–1254px on flat black, often in
   `~/Downloads/<project>/`. Ask Paul when it isn't obvious. Copy it into
   `brand/<name>.png` in the app repo so the icons can be rebuilt without
   his laptop.

2. **Install the generator.**

   ```bash
   mkdir -p scripts/brand-icons brand
   cp "<appkit>/skills/brand-kit/scripts/build_icons.py" scripts/brand-icons/
   cp "<appkit>/skills/brand-kit/icons.example.json" brand/icons.json   # then edit
   ```

   Add `"icons:build": "python3 -I scripts/brand-icons/build_icons.py brand/icons.json"`
   to package.json. It needs Pillow and numpy on the machine running it
   (`python3 -I -c "import PIL, numpy"`). The outputs are committed, so CI and
   Vercel never run it, and no app dependency is added.

   The config keys are documented at the top of `build_icons.py`: `tile`,
   `radius`, `icon`, and the optional `small` figure with `source`, `key`,
   `crop`, `scale` and `anchor`.

3. **Tune the small mark.** A full-body figure falls apart below 48px. Give
   `small` a head crop (`crop` is `[left, top, right, bottom]` in source
   pixels), `"anchor": "bottom"` and a `scale` near 0.9. Render 16, 32 and 48
   magnified and look. Adjust the crop until the face and the brand color
   read at 16. Keep raised limbs and props out of the crop; at 16px they read
   as smudges. Two or three passes is normal.

4. **Run it and read every output.** Check that the ICO has 16, 32 and 48
   frames, that the 180 and maskable corner pixels are opaque, and that the
   maskable figure sits inside the circle.

5. **Wire it.**
   - Put the three `<head>` tags the script prints in `index.html` and in
     every static HTML page in `public/` that has its own head (legal pages
     do). Keep `%BASE_URL%` where the file already uses it.
   - Manifest: vite-plugin-pwa `manifest.icons`, plus `favicon.ico`,
     `favicon-96.png` and `apple-touch-icon.png` in `includeAssets`. Or edit
     `public/manifest.webmanifest`.
   - Leave art the UI uses (sidebar logo, onboarding art, the OG source)
     where it is. The generator writes standard names next to it. Delete only
     files your change orphaned, and grep before deleting.

6. **Verify.**
   - Run lint, tests and build.
   - Check that the built manifest lists the three icons.
   - Run `vite preview` and fetch each icon path to confirm `image/*` at the
     right size. Use the snippet below in the browser pane, and include the
     legal pages.
   - After deploy, `curl -sI https://<domain>/favicon.ico` should show an
     icon content-type (Vercel sends `image/vnd.microsoft.icon`), not
     `text/html`. Check the PR's preview first; it's behind Vercel login, so
     fetch it through the Vercel connector's `web_fetch_vercel_url`.

   ```js
   for (const p of ['/favicon.ico','/favicon-96.png','/apple-touch-icon.png','/icon-192.png','/icon-512.png','/icon-maskable-512.png']) {
     const b = await (await fetch(p, {cache:'no-store'})).blob();
     const bm = await createImageBitmap(b); console.log(p, b.type, `${bm.width}x${bm.height}`);
   }
   ```

7. **Record and ship.** Put the master's location and `npm run icons:build`
   in the app's agent notes, then open a PR.

## Hard-won lessons

- **A missing `/favicon.ico` looks fine in curl.** The SPA rewrite returns
  the HTML with a 200. Always read content-type.
- **Google's search favicon must be a multiple of 48px.** 64 doesn't qualify.
  `favicon-96.png` covers it; Google re-crawls on its own schedule.
- **The Apple touch icon is square, full-bleed and opaque.** iOS rounds it
  and fills any transparency with black. Pre-rounded corners only line up by
  luck.
- **Never reuse the regular icon as the maskable one.** Android only promises
  a centered circle 80% wide. The generator fits every opaque pixel inside
  it.
- **Browser and search icons use the small mark; home-screen icons use the
  full figure.** At 96 the favicon is still shown small in search results,
  so it gets the head too.
- **Keying removes only background connected to the image edge.** Pupils and
  dark outlines inside the figure survive. The tolerances (28 for
  background, 60 for the fringe) were tuned on navy-outlined art on black. If
  an outline gets eaten, lower `KEY_TOLERANCE`.
- **`python3 -I` ignores user site-packages.** If Pillow was installed with
  `pip --user`, `-I` can't see it; install it for the interpreter instead.
- **Experiment from the scratchpad, not inside the repo.** Importing
  `build_icons.py` as a module from the repo drops a `__pycache__` beside it,
  which then rides into the commit.

## Files

- `scripts/build_icons.py` is the generator. Apps carry a copy. When it
  changes here, re-copy it into the apps that use it.
- `icons.example.json` is Snowball Penguin's config, a working starting point.
- [references/kit-checklist.md](references/kit-checklist.md) lists what a
  logo and web designer hand over, with the platform rule behind each icon.

## Install

Skills load from `~/.claude/skills`. Link this one there once:

```bash
ln -s "$HOME/Documents/Personal Projects/Github/appkit/skills/brand-kit" ~/.claude/skills/brand-kit
```

The link follows whatever branch the appkit checkout is on, so the skill is
only there while that checkout has it (on `main` once merged).
