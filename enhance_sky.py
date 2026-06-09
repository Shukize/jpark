"""
Sky beautifier for selected Main Lobby photos.

Turns the flat, overcast white-grey sky into a clean, clear blue gradient
while leaving buildings, trees and foreground untouched.

How the sky is found (so we don't paint over cream walls or green leaves):
  * bright            -> V (max channel) high
  * washed out        -> low saturation
  * neutral / cool    -> blue >= red  (warm cream buildings are excluded)
  * connected to top  -> flood the mask down from the sky at the top edge,
                         plus keep low-saturation bright patches high in the
                         frame (sky seen through the tree canopy), so stray
                         white objects lower down (vans, signs) are ignored.
The mask is feathered, then a vertical blue gradient is alpha-composited in.
A whisper of soft cloud breakup and a mild global vibrance lift sell the
"sunny day" look. Originals are tracked in git, so this edits in place.
"""
import sys
import numpy as np
import cv2
from PIL import Image, ImageOps

TARGETS = [
    r"images/Main Lobby/20260607_174349.jpg",
    r"images/Main Lobby/20260607_174418.jpg",
    r"images/Main Lobby/20260609_175332.jpg",
]

# Sky-detection thresholds
V_MIN = 0.66        # min brightness (0..1) for a sky candidate
S_MAX = 0.22        # max saturation (0..1)
COOL_MIN = -0.045   # min (B - R) in 0..1 units; cream walls fall below this
TOP_BAND = 0.04     # rows within this top fraction seed the "connected" sky
HIGH_BAND = 0.42    # bright/low-sat patches above this fraction are kept too

# Clear-sky gradient (RGB). Top = vivid but natural; horizon = pale.
TOP_COLOR = np.array([70, 140, 226], dtype=np.float32)
HORIZON_COLOR = np.array([198, 227, 245], dtype=np.float32)
GRADIENT_SPAN = 0.66  # fraction of height over which top->horizon plays out


def sky_mask(rgb):
    """Return a feathered 0..1 sky mask for an HxWx3 float (0..1) RGB image."""
    h, w, _ = rgb.shape
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    v = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = np.where(v > 1e-6, (v - mn) / np.maximum(v, 1e-6), 0.0)

    candidate = (v >= V_MIN) & (sat <= S_MAX) & ((b - r) >= COOL_MIN)
    cand_u8 = candidate.astype(np.uint8)

    # Components of the candidate mask that reach the very top of the frame.
    num, labels = cv2.connectedComponents(cand_u8, connectivity=8)
    top_rows = labels[: max(1, int(h * TOP_BAND)), :]
    keep = set(np.unique(top_rows)) - {0}
    connected = np.isin(labels, list(keep)) if keep else np.zeros_like(candidate)

    # Also keep bright low-sat candidates high in the frame (canopy gaps),
    # so holes of sky between leaves get coloured consistently.
    rows = np.arange(h)[:, None] / float(h)
    high = candidate & (rows <= HIGH_BAND)

    mask = (connected | high).astype(np.float32)

    # Clean speckle, then feather the edge so trees/branches blend softly.
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
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


def process(path):
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
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

    Image.fromarray(out).save(path, "JPEG", quality=92, optimize=True)
    cover = float(mask.mean())
    print(f"  {path}  sky ~{cover*100:4.1f}% of frame")


if __name__ == "__main__":
    for p in TARGETS:
        print("Enhancing", p)
        process(p)
    print("Done.")
