"""Every platform icon from one piece of master art. Part of appkit's brand-kit skill.

    python3 -I scripts/brand-icons/build_icons.py brand/icons.json

Writes into the config's outDir:

    favicon.ico            16/32/48   browser tabs, bookmarks, anything that asks for /favicon.ico
    favicon-96.png         96         search results (Google wants a multiple of 48)
    apple-touch-icon.png   180        iOS home screen: square and full-bleed, iOS rounds it
    icon-192.png           192        PWA manifest
    icon-512.png           512        PWA manifest, install dialogs
    icon-maskable-512.png  512        Android launchers: full-bleed, figure inside the safe circle

then prints the <head> tags and manifest icons to paste. The two favicons use the
`small` figure (tight crop, for 16-48px); everything else uses `icon`.

Config (paths resolve against the config file's folder):

    {
      "outDir": "../public",
      "tile": "#27B8D6",            background behind the figure
      "radius": 0.22,               corner radius of the rounded icons, as a fraction of the side
      "icon":  { "source": "pebble.png", "key": "#000000", "scale": 0.78 },
      "small": { "source": "pebble.png", "key": "#000000", "scale": 0.94,
                 "crop": [320, 20, 970, 640], "anchor": "bottom" }
    }

  source  the master art, as large as you have it
  key     optional: remove this background color where it touches the image edge
          (generator art on flat black). Omit when the source already has transparency.
  crop    optional: [left, top, right, bottom] in source pixels, applied after keying
  scale   the figure's longer side as a fraction of the tile (at most 1)
  anchor  "center" (default) or "bottom": sit a cropped bust on the tile's bottom edge

Needs Pillow and numpy.
"""
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SUPER = 4            # draw at 4x and downsample, so tile corners stay smooth at 16px
SAFE_RADIUS = 0.40   # maskable safe zone: a centered circle 80% of the icon wide
SAFE_MARGIN = 0.03   # breathing room inside that circle
KEY_TOLERANCE = 28   # a pixel is background when every channel is within this of the key
EDGE_RANGE = 60      # fringe pixels within this of the key get partial alpha


def hex_rgb(value: str) -> tuple:
    value = value.lstrip('#')
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def key_background(rgb: np.ndarray, key: tuple) -> np.ndarray:
    """RGBA with only the edge-connected background removed; dark details inside stay."""
    dist = np.abs(rgb.astype(int) - np.array(key)).max(axis=2)
    cand = dist <= KEY_TOLERANCE
    bg = np.zeros_like(cand)
    bg[0, :], bg[-1, :], bg[:, 0], bg[:, -1] = cand[0, :], cand[-1, :], cand[:, 0], cand[:, -1]
    while True:  # flood fill as repeated dilation, constrained to candidates
        grown = bg.copy()
        grown[1:, :] |= bg[:-1, :]
        grown[:-1, :] |= bg[1:, :]
        grown[:, 1:] |= bg[:, :-1]
        grown[:, :-1] |= bg[:, 1:]
        grown &= cand
        if (grown == bg).all():
            break
        bg = grown

    near = bg.copy()  # two pixels of fringe around the keyed area
    for _ in range(2):
        n = near.copy()
        n[1:, :] |= near[:-1, :]
        n[:-1, :] |= near[1:, :]
        n[:, 1:] |= near[:, :-1]
        n[:, :-1] |= near[:, 1:]
        near = n
    fringe = near & ~bg

    a = np.clip(dist / EDGE_RANGE, 0, 1)
    alpha = np.full(cand.shape, 255.0)
    alpha[bg] = 0
    alpha[fringe] = a[fringe] * 255
    out = rgb.astype(float)
    safe = np.where(a > 0, a, 1)[..., None]
    k = np.array(key, dtype=float)
    out[fringe] = np.clip((out[fringe] - k * (1 - safe[fringe])) / safe[fringe], 0, 255)  # un-blend
    return np.dstack([out, alpha]).astype(np.uint8)


def load_figure(spec: dict, base: Path) -> Image.Image:
    img = Image.open(base / spec['source'])
    if 'key' in spec:
        img = Image.fromarray(key_background(np.asarray(img.convert('RGB')), hex_rgb(spec['key'])), 'RGBA')
    else:
        img = img.convert('RGBA')
    if 'crop' in spec:
        img = img.crop(tuple(spec['crop']))
    box = img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if box is None:
        sys.exit(f"{spec['source']}: nothing left after keying. Check `key` and `crop`.")
    return img.crop(box)


def fit(fig: Image.Image, longest: float) -> Image.Image:
    s = longest / max(fig.size)
    return fig.resize((max(1, round(fig.width * s)), max(1, round(fig.height * s))), Image.LANCZOS)


def render(fig: Image.Image, size: int, spec: dict, tile: tuple, radius: float) -> Image.Image:
    w = size * SUPER
    shape = Image.new('L', (w, w), 0)
    ImageDraw.Draw(shape).rounded_rectangle((0, 0, w - 1, w - 1), round(radius * w), fill=255)
    out = Image.new('RGBA', (w, w), tile + (255,))
    f = fit(fig, min(spec.get('scale', 0.78), 1) * w)
    y = w - f.height if spec.get('anchor') == 'bottom' else (w - f.height) // 2
    out.alpha_composite(f, ((w - f.width) // 2, y))
    out.putalpha(shape)  # clips the tile and anything that overhangs it
    return out.resize((size, size), Image.LANCZOS)


def render_maskable(fig: Image.Image, size: int, tile: tuple) -> Image.Image:
    """Full-bleed tile; every opaque pixel lands inside the safe circle."""
    alpha = np.asarray(fig.getchannel('A')) > 32
    ys, xs = np.nonzero(alpha)
    reach = np.sqrt((xs - fig.width / 2) ** 2 + (ys - fig.height / 2) ** 2).max()
    w = size * SUPER
    f = fit(fig, max(fig.size) * (SAFE_RADIUS - SAFE_MARGIN) * w / reach)
    out = Image.new('RGBA', (w, w), tile + (255,))
    out.alpha_composite(f, ((w - f.width) // 2, (w - f.height) // 2))
    return out.resize((size, size), Image.LANCZOS)


def write_ico(frames: list, path: Path) -> None:
    """ICO with PNG-encoded frames (every browser since IE9 reads these)."""
    blobs = []
    for frame in frames:
        buf = io.BytesIO()
        frame.save(buf, 'PNG', optimize=True)
        blobs.append(buf.getvalue())
    header = (0).to_bytes(2, 'little') + (1).to_bytes(2, 'little') + len(frames).to_bytes(2, 'little')
    offset = 6 + 16 * len(frames)
    entries = b''
    for frame, blob in zip(frames, blobs):
        side = frame.width if frame.width < 256 else 0
        entries += bytes([side, side, 0, 0]) + (1).to_bytes(2, 'little') + (32).to_bytes(2, 'little')
        entries += len(blob).to_bytes(4, 'little') + offset.to_bytes(4, 'little')
        offset += len(blob)
    path.write_bytes(header + entries + b''.join(blobs))


def main(config_path: Path) -> None:
    cfg = json.loads(config_path.read_text())
    base = config_path.parent
    out = (base / cfg.get('outDir', '.')).resolve()
    out.mkdir(parents=True, exist_ok=True)
    tile = hex_rgb(cfg['tile'])
    radius = cfg.get('radius', 0.22)

    icon_spec = cfg['icon']
    small_spec = cfg.get('small', icon_spec)
    icon = load_figure(icon_spec, base)
    small = icon if small_spec is icon_spec else load_figure(small_spec, base)

    write_ico([render(small, s, small_spec, tile, radius) for s in (16, 32, 48)], out / 'favicon.ico')
    render(small, 96, small_spec, tile, radius).save(out / 'favicon-96.png', optimize=True)
    render(icon, 180, icon_spec, tile, 0).save(out / 'apple-touch-icon.png', optimize=True)
    render(icon, 192, icon_spec, tile, radius).save(out / 'icon-192.png', optimize=True)
    render(icon, 512, icon_spec, tile, radius).save(out / 'icon-512.png', optimize=True)
    render_maskable(icon, 512, tile).save(out / 'icon-maskable-512.png', optimize=True)

    for name in ('favicon.ico', 'favicon-96.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'):
        print(f'wrote {out / name}  ({(out / name).stat().st_size // 1024 or 1} KB)')
    print('''
<head> tags:
    <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png" />
    <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

manifest icons:
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }''')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]).expanduser())
