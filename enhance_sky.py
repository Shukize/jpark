"""
Sky beautifier for selected Main Lobby photos.

Turns the flat, overcast white-grey sky into a clean, clear blue gradient
while leaving buildings, trees and foreground looking real.

The hard part is the edge: where bare branches and lacy leaves sit against the
sky, the original photo has a bright overcast rim around every twig. A plain
binary "sky / not sky" mask leaves that rim glowing white next to the new blue
— the dead giveaway of a faked sky. So instead of a hard mask we build a
*continuous* sky alpha:

  1. Find a clean sky CORE — bright, washed-out, not-warm, not-green AND smooth
     (low local texture). Smoothness keeps busy building surfaces (windows,
     louvers, balconies) out of the core. Keep the blobs that touch the top or
     sit high in the frame, fill interior holes. This is solid, confident sky.

  2. Around that core, define a sky ZONE (a generous dilation). Only inside the
     zone do we judge edges, so a white van or pavement elsewhere is never
     touched.

  3. Inside the zone, every pixel gets a soft skyness in 0..1 from how bright,
     how desaturated, how neutral (not warm) and how not-green it is. A white
     halo between branches scores ~1 and turns fully blue; a half-leaf edge
     scores ~0.4 and blends; a dark branch or green leaf scores ~0 and is kept.
     This dissolves the white fringe and lets trees/buildings blend naturally.

The resulting alpha composites a vertical blue gradient (faint cloud breakup),
then a mild vibrance lift sells the sunny day.

Originals live in git history; during development this reads them from SRC_DIR
and writes to DST_DIR, so it is idempotent.
"""
import os
import numpy as np
import cv2
from PIL import Image, ImageOps

SRC_DIR = "_orig_lobby"
DST_DIR = "images/Main Lobby"

# Both targets here are trees against open sky: the connected extension crawls
# along sky-coloured pixels through the canopy to dissolve the white leaf fringe.
#
# The third lobby exterior, 20260609_175332.jpg, is deliberately NOT processed
# here. It is a low-angle building close-up whose glass *mirrors* the sky, so any
# sky fill crawls across the reflections and paints the windows blue, and it has
# no tree-against-sky fringe to fix anyway. Its clean version was produced by the
# earlier conservative pass and is kept as-is in the repo.
FILES = [
    "20260607_174349.jpg",
    "20260607_174418.jpg",
]

# --- clean sky CORE (confident sky only) ---
V_MIN = 0.62        # min brightness for a core candidate
S_MAX = 0.24        # max saturation for a core candidate
WARM_CORE = 0.04    # core must have (b - r) >= -WARM_CORE
GREEN_EPS = 0.012   # drop core pixels where green clearly dominates
STD_MAX = 0.055     # max local luminance std for the core (drops textured walls)
TOP_BAND = 0.06     # rows within this top fraction seed the core
HIGH_BAND = 0.55    # core blobs sitting above this fraction are kept too
MIN_BLOB = 0.0008   # drop core blobs smaller than this fraction of the frame
BIG_BLOB = 0.006    # keep any sky blob this big wherever it sits (lower pockets)

# --- continuous edge skyness (connected to the core) ---
PASS_T = 0.22       # min skyness for a pixel to bridge the canopy back to sky
V_LO, V_HI = 0.52, 0.80     # brightness ramp (0..1 skyness)
S_LO, S_HI = 0.10, 0.32     # saturation ramp (full sky <=S_LO, none >=S_HI)
WARM_LO, WARM_HI = 0.13, 0.03   # warmth ramp on (r - b): neutral keeps, warm drops
GREEN_LO, GREEN_HI = 0.00, 0.06  # green-dominance ramp: neutral keeps, green drops
EDGE_GROW_PX = 3    # grow sky alpha this far into edges to swallow pale rims

# Clear-sky gradient (RGB). Top = vivid but natural; horizon = pale.
TOP_COLOR = np.array([70, 140, 226], dtype=np.float32)
HORIZON_COLOR = np.array([198, 227, 245], dtype=np.float32)
GRADIENT_SPAN = 0.66


def _smoothstep(x, lo, hi):
    """Hermite ramp: 0 at lo, 1 at hi (works for lo>hi too)."""
    t = np.clip((x - lo) / (hi - lo + 1e-9), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _fill_interior_holes(mask_u8):
    """Fill background (0) regions fully enclosed by the mask (1). Background
    that touches the image border stays open; only truly enclosed holes fill.
    Seeds from a 1px background ring so it is correct no matter what sits in the
    corners (e.g. a tree at (0,0))."""
    h, w = mask_u8.shape
    bg = (mask_u8 == 0).astype(np.uint8)
    pad = np.ones((h + 2, w + 2), np.uint8)     # ring of background around the frame
    pad[1:-1, 1:-1] = bg
    ff = pad.copy()
    cv2.floodFill(ff, np.zeros((h + 4, w + 4), np.uint8), (0, 0), 0)
    enclosed = ((pad == 1) & (ff == 1))[1:-1, 1:-1]   # background unreachable from the ring
    out = mask_u8.copy()
    out[enclosed] = 1
    return out


def sky_alpha(rgb, extend=True):
    """Return a continuous 0..1 sky alpha for an HxWx3 float (0..1) RGB image.
    When extend is False only the texture-gated core is coloured (no crawling
    through the canopy), for building close-ups whose glass mirrors the sky."""
    h, w, _ = rgb.shape
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    v = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = np.where(v > 1e-6, (v - mn) / np.maximum(v, 1e-6), 0.0)
    gdom = g - np.maximum(r, b)         # green dominance (foliage)
    warm = r - b                         # warmth (cream walls > 0)

    # ---- 1. clean sky CORE ----
    lum = (0.299 * r + 0.587 * g + 0.114 * b).astype(np.float32)
    win = max(5, (int(w / 120) | 1))
    mean = cv2.blur(lum, (win, win))
    sq = cv2.blur(lum * lum, (win, win))
    std = np.sqrt(np.maximum(sq - mean * mean, 0.0))

    core_cand = ((v >= V_MIN) & (sat <= S_MAX) & (warm <= WARM_CORE) &
                 (gdom <= GREEN_EPS) & (std <= STD_MAX)).astype(np.uint8)

    num, labels, stats, _ = cv2.connectedComponentsWithStats(core_cand, connectivity=8)
    band = max(1, int(h * TOP_BAND))
    top_labels = set(np.unique(labels[:band, :])) - {0}
    high_labels = set(np.unique(labels[: int(h * HIGH_BAND) + 1, :])) - {0}
    min_area = MIN_BLOB * h * w
    big_area = BIG_BLOB * h * w
    core = np.zeros_like(core_cand)
    for lab in range(1, num):
        area = stats[lab, cv2.CC_STAT_AREA]
        if area < min_area:
            continue
        # sky if it reaches the top, lives high in the frame, or is simply a
        # large open patch (catches lower sky pockets walled off by foreground).
        if lab in top_labels or lab in high_labels or area >= big_area:
            core[labels == lab] = 1
    core = _fill_interior_holes(core)

    # ---- 2. continuous skyness (colour only, texture ignored) ----
    bright = _smoothstep(v, V_LO, V_HI)
    desat = _smoothstep(sat, S_HI, S_LO)            # 1 when very desaturated
    neutral = _smoothstep(warm, WARM_LO, WARM_HI)   # 1 when neutral/cool
    notgreen = _smoothstep(gdom, GREEN_HI, GREEN_LO)
    skyness = bright * desat * neutral * notgreen

    # ---- 3. keep only skyness that is CONNECTED to the open-sky core ----
    # A pixel counts as sky-edge only if a chain of plausibly-sky pixels links
    # it back to the core. Canopy gaps reach the sky through thin sky channels;
    # a building's glass reflections are walled off by frames and the roofline,
    # so they never connect and stay untouched (no blue windows / fake clouds).
    if extend:
        passable = ((skyness > PASS_T).astype(np.uint8) | core)
        num, lbl = cv2.connectedComponents(passable, connectivity=8)
        keep = set(np.unique(lbl[core == 1])) - {0}
        grown = np.isin(lbl, list(keep)) if keep else np.zeros_like(core, bool)
    else:
        grown = core.astype(bool)

    alpha = np.maximum(core.astype(np.float32), grown.astype(np.float32) * skyness)

    # Grow the sky a few pixels into the edges so the thin pale overcast rim
    # that anti-aliasing leaves around leaves/twigs/rooflines gets swallowed by
    # blue instead of glowing. Twigs only lose a hair of width.
    if EDGE_GROW_PX > 0:
        k = 2 * EDGE_GROW_PX + 1
        alpha = cv2.dilate(alpha, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))

    # Feather just enough to avoid a hard line; the continuous term already
    # carries most of the blending.
    alpha = cv2.GaussianBlur(alpha, (0, 0), sigmaX=max(1.0, w / 900.0))
    return np.clip(alpha, 0.0, 1.0)


def gradient_sky(h, w):
    """Clean vertical clear-blue gradient — vivid at the top, pale at the
    horizon. No cloud veil: a real clear sky is smooth, and the faint veil was
    quantising into visible contour lines after JPEG."""
    rows = np.clip(np.arange(h) / (GRADIENT_SPAN * h), 0.0, 1.0)[:, None, None]
    grad = TOP_COLOR[None, None, :] * (1 - rows) + HORIZON_COLOR[None, None, :] * rows
    return np.repeat(grad, w, axis=1).astype(np.float32)


def vibrance(rgb_u8, sat_mul=1.08, contrast=1.05):
    """Mild global vibrance + contrast so the scene reads as a sunny day."""
    hsv = cv2.cvtColor(rgb_u8, cv2.COLOR_RGB2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * sat_mul, 0, 255)
    out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB).astype(np.float32)
    out = np.clip((out - 128) * contrast + 128, 0, 255)
    return out.astype(np.uint8)


def process(src, dst, extend=True):
    img = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    arr = np.asarray(img).astype(np.float32)
    h, w, _ = arr.shape
    rgb01 = arr / 255.0

    alpha = sky_alpha(rgb01, extend=extend)[..., None]
    grad = gradient_sky(h, w)

    out = arr * (1 - alpha) + grad * alpha
    out = np.clip(out, 0, 255).astype(np.uint8)
    out = vibrance(out)

    # Dither before JPEG so the smooth blue gradient never bands into contours.
    out = np.clip(out.astype(np.float32) + np.random.default_rng(3).normal(0, 1.8, out.shape), 0, 255).astype(np.uint8)
    Image.fromarray(out).save(dst, "JPEG", quality=92, optimize=True)
    print(f"  {dst}  sky ~{float(alpha.mean())*100:4.1f}% of frame")


if __name__ == "__main__":
    src_dir = SRC_DIR if os.path.isdir(SRC_DIR) else DST_DIR
    for name in FILES:
        src = os.path.join(src_dir, name)
        dst = os.path.join(DST_DIR, name)
        print("Enhancing", dst, "(from", src + ")")
        process(src, dst)
    print("Done.")
