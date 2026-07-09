"""
Prepare the new wreath-monogram logo (fix images/2fb8ed55-...jpg) as two
transparent-background web assets:

  images/logo-full.png  — full vertical lockup (wreath + "J. Park Hotel"
                           wordmark), for the footer where there's vertical
                           room.
  images/logo-mark.png  — the wreath circle only, cropped out of the same
                           source, for tight horizontal slots (header,
                           staff.html auth cards/sidebar, maintenance.html).

Source is simple single-color (royal blue) line art on flat white — no
photo content — so background removal is a plain near-white color-key
threshold rather than real segmentation, with a small alpha feather at the
edges to soften JPEG compression artifacts around the linework.

Usage: python prepare_logo.py
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

BASE = Path(__file__).resolve().parent
SRC = BASE / "fix images" / "2fb8ed55-bf6b-4580-9085-b990b768fc89.jpg"
OUT_DIR = BASE / "images"

WHITE_THRESHOLD = 235  # channels at/above this are treated as background
FEATHER_SIGMA = 0.8    # px, softens the alpha edge

# Crop box for the mark-only (wreath circle) version, hand-measured from the
# source's ink-density profile: a clear blank row-gap separates the wreath
# (rows ~15-195) from the "J. Park Hotel" wordmark below it (rows ~200-250).
MARK_BOX = (50, 12, 242, 198)  # left, top, right, bottom


def remove_white_background(im: Image.Image) -> Image.Image:
    arr = np.asarray(im.convert("RGB")).astype(np.float32)
    # Alpha = how far a pixel is from pure white, ramped from the threshold.
    dist_from_white = 255.0 - arr.min(axis=2)
    alpha = np.clip((dist_from_white - (255 - WHITE_THRESHOLD)) / max(1, (255 - WHITE_THRESHOLD)), 0.0, 1.0)
    alpha = gaussian_filter(alpha, sigma=FEATHER_SIGMA)
    alpha = np.clip(alpha * 255.0, 0, 255).astype(np.uint8)
    rgba = np.dstack([arr.astype(np.uint8), alpha])
    return Image.fromarray(rgba, mode="RGBA")


def main():
    OUT_DIR.mkdir(exist_ok=True)
    src = Image.open(SRC)

    full = remove_white_background(src)
    full_path = OUT_DIR / "logo-full.png"
    full.save(full_path, "PNG")
    print(f"Saved {full_path}  {full.size}")

    mark = remove_white_background(src.crop(MARK_BOX))
    mark_path = OUT_DIR / "logo-mark.png"
    mark.save(mark_path, "PNG")
    print(f"Saved {mark_path}  {mark.size}")


if __name__ == "__main__":
    main()
