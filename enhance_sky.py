"""
Sky beautifier for selected Main Lobby photos.

Turns the flat, overcast white-grey sky into a clean, clear blue gradient
while leaving buildings, trees and foreground untouched.

How the sky is found (so we don't paint over cream walls or green leaves):
  * bright            -> V (max channel) high
  * washed out        -> low saturation
  * not strongly warm -> blue >= red - eps  (drops obviously warm cream walls)
  * not green         -> green is not clearly the dominant channel (drop foliage)
  * smooth            -> low local texture. THE key building guard: windows,
                         balconies, louvers and railings are busy; overcast sky
                         is almost flat. Flat warm walls are already dropped by
                         the warmth test, so smoothness mops up the rest.
  * spatially sky     -> keep candidate blobs that touch the top OR sit high in
                         the frame, then fill holes enclosed by sky (so pale
                         patches and canopy gaps inside the sky are not missed).
The warmth test is kept *loose* on purpose: an overcast sky shades from bright
near the zenith to a greyer, faintly warm haze near the rooftops, and a tight
test would slice it in two and leave a hard seam. Texture + greenness carry the
building/tree rejection instead.

The mask is feathered, then a vertical blue gradient is alpha-composited in.
A whisper of soft cloud breakup and a mild global vibrance lift sell the
"sunny day" look.

Originals live in git history. During development this reads the pristine
originals from SRC_DIR (extracted from git) and writes to DST_DIR, so the
script is idempotent. With SRC_DIR missing it edits DST_DIR in place.
"""
import os
import numpy as np
import cv2
from PIL import Image, ImageOps

SRC_DIR = "_orig_lobby"
DST_DIR = "images/Main Lobby"

FILES = [
    "20260607_174349.jpg",
    "20260607_174418.jpg",
    "20260609_175332.jpg",
]

# Sky-detection thresholds
V_MIN = 0.60        # min brightness (0..1) for a sky candidate
S_MAX = 0.28        # max saturation (0..1)
WARM_EPS = 0.05     # allow (b - r) >= -WARM_EPS; clearly warm cream falls below
GREEN_EPS = 0.012   # drop pixels where green clearly dominates (foliage)
STD_MAX = 0.055     # max local luminance std (0..1); above this is "textured"
TOP_BAND = 0.06     # rows within this top fraction always seed the sky
HIGH_BAND = 0.55    # candidate blobs sitting above this fraction are kept too
MIN_BLOB = 0.0008   # drop sky blobs smaller than this fraction of the frame
RECOVER_PX = 14     # radius to recover textured canopy sky next to clean sky
DILATE_PX = 1       # grow the mask a hair so blue eats the white edge halos

# Clear-sky gradient (RGB). Top = vivid but natural; horizon = pale.
TOP_COLOR = np.array([70, 140, 226], dtype=np.float32)
HORIZON_COLOR = np.array([198, 227, 245], dtype=np.float32)
GRADIENT_SPAN = 0.66  # fraction of height over which top->horizon plays out


def _fill_interior_holes(mask_u8):
    """Fill holes fully enclosed by the mask (flood-fill from the border)."""
    h, w = mask_u8.shape
    inv = (mask_u8 == 0).astype(np.uint8)
    ff = inv.copy()
    cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 0)
    # `ff` now marks background NOT reachable from the corner == enclosed holes.
    holes = (inv == 1) & (ff == 1)
    out = mask_u8.copy()
    out[holes] = 1
    return out


def sky_mask(rgb):
    """Return a feathered 0..1 sky mask for an HxWx3 float (0..1) RGB image."""
    h, w, _ = rgb.shape
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    v = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = np.where(v > 1e-6, (v - mn) / np.maximum(v, 1e-6), 0.0)

    # Local luminance texture (std over a small window) -> building rejector.
    lum = (0.299 * r + 0.587 * g + 0.114 * b).astype(np.float32)
    win = max(5, (int(w / 120) | 1))            # odd window, scales with width
    mean = cv2.blur(lum, (win, win))
    sq = cv2.blur(lum * lum, (win, win))
    std = np.sqrt(np.maximum(sq - mean * mean, 0.0))

    not_warm = (b - r) >= -WARM_EPS
    not_green = ~((g >= r + GREEN_EPS) & (g >= b + GREEN_EPS))
    smooth = std <= STD_MAX
    # Colour-only sky test (texture ignored). Buildings are kept out of the
    # *seed* by the smoothness gate below; this looser test is reused later to
    # recover sky peeking through the lacy canopy near real sky.
    color_ok = (v >= V_MIN) & (sat <= S_MAX) & not_warm & not_green
    candidate = color_ok & smooth
    cand_u8 = candidate.astype(np.uint8)
    color_u8 = color_ok.astype(np.uint8)

    # Keep candidate components that touch the top band OR live high in frame.
    num, labels = cv2.connectedComponents(cand_u8, connectivity=8)
    band = max(1, int(h * TOP_BAND))
    keep = set(np.unique(labels[:band, :])) - {0}

    rows = np.arange(h)[:, None]
    high = labels[rows.repeat(w, 1) <= int(h * HIGH_BAND)]
    keep |= set(np.unique(high)) - {0}

    min_area = MIN_BLOB * h * w
    sel = np.zeros_like(cand_u8)
    for lab in keep:
        comp = labels == lab
        if comp.sum() >= min_area:
            sel[comp] = 1

    sel = _fill_interior_holes(sel)

    # Recovery pass: near the clean smooth-sky core, accept colour-only sky even
    # where it is "textured" (the bright overcast slivers between lacy canopy
    # leaves, and the leftover white rim around them). Bounded to RECOVER_PX of
    # real sky so it never crawls into a building interior.
    if RECOVER_PX > 0:
        r2 = 2 * RECOVER_PX + 1
        neigh = cv2.dilate(sel, np.ones((r2, r2), np.uint8))
        sel = sel | (neigh & color_u8)
        sel = _fill_interior_holes(sel)

    mask = sel.astype(np.float32)
    # Clean speckle, then feather the edge so trees/branches blend softly.
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    if DILATE_PX > 0:
        # Push the edge out a touch so the leftover bright overcast rim around
        # leaves/rooflines gets coloured instead of glowing white next to blue.
        k = 2 * DILATE_PX + 1
        mask = cv2.dilate(mask, np.ones((k, k), np.uint8))
    mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=max(1.5, w / 600.0))
    return np.clip(mask, 0.0, 1.0)


def gradient_sky(h, w):
    """Vertical clear-blue gradient with a faint cloud breakup."""
    rows = np.clip(np.arange(h) / (GRADIENT_SPAN * h), 0.0, 1.0)[:, None, None]
    grad = TOP_COLOR[None, None, :] * (1 - rows) + HORIZON_COLOR[None, None, :] * rows
    grad = np.repeat(grad, w, axis=1).astype(np.float32)

    # Soft, low-contrast clouds: blurred low-frequency noise, screened in gently.
    rng = np.random.default_rng(7)
    noise = rng.random((max(2, h // 40), max(2, w // 40))).astype(np.float32)
    noise = cv2.resize(noise, (w, h), interpolation=cv2.INTER_CUBIC)
    noise = cv2.GaussianBlur(noise, (0, 0), sigmaX=w / 90.0)
    noise = (noise - noise.min()) / (np.ptp(noise) + 1e-6)
    veil = (0.10 * noise)[..., None]            # up to ~10% lift
    grad = grad + veil * (255.0 - grad)         # screen-ish toward white
    return np.clip(grad, 0, 255)


def vibrance(rgb_u8, sat_mul=1.08, contrast=1.05):
    """Mild global vibrance + contrast so the scene reads as a sunny day."""
    hsv = cv2.cvtColor(rgb_u8, cv2.COLOR_RGB2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * sat_mul, 0, 255)
    out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB).astype(np.float32)
    out = np.clip((out - 128) * contrast + 128, 0, 255)
    return out.astype(np.uint8)


def process(src, dst):
    img = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    arr = np.asarray(img).astype(np.float32)
    h, w, _ = arr.shape
    rgb01 = arr / 255.0

    mask = sky_mask(rgb01)[..., None]
    grad = gradient_sky(h, w)

    out = arr * (1 - mask) + grad * mask
    out = np.clip(out, 0, 255).astype(np.uint8)
    out = vibrance(out)

    # Tiny dither to kill any gradient banding after JPEG.
    out = np.clip(out.astype(np.float32) + np.random.default_rng(3).normal(0, 1.0, out.shape), 0, 255).astype(np.uint8)

    Image.fromarray(out).save(dst, "JPEG", quality=92, optimize=True)
    print(f"  {dst}  sky ~{float(mask.mean())*100:4.1f}% of frame")


if __name__ == "__main__":
    src_dir = SRC_DIR if os.path.isdir(SRC_DIR) else DST_DIR
    for name in FILES:
        src = os.path.join(src_dir, name)
        dst = os.path.join(DST_DIR, name)
        print("Enhancing", dst, "(from", src + ")")
        process(src, dst)
    print("Done.")
