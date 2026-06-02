"""
Crisp 4K finishing pass for the 2026-06-01 photo batch.

For every images/**/20260601_*.jpg:
  1. Apply EXIF orientation physically (many are stored rotated, tag=6),
     then strip EXIF so the file is upright everywhere with no tag.
  2. Resize the long edge down to 3840px (4K-class) with Lanczos.
  3. Tasteful vibrance: saturation + slight contrast/brightness lift.
  4. Subtle bloom: soft glow screen-blended onto the brightest areas.
  5. Mild unsharp mask for crispness.
  6. Save JPEG quality 92 (optimized) in place.

No AI super-resolution: the source photos are already 4000px (above 4K),
so resampling + finishing gives a clean result without ESRGAN artifacts.
"""
import glob
import sys
import numpy as np
import cv2
from PIL import Image, ImageOps, ImageEnhance

TARGET_LONG_EDGE = 3840
JPEG_QUALITY = 92

# Finishing strengths (kept tasteful, not amateur/over-processed)
SATURATION = 1.12
CONTRAST = 1.05
BRIGHTNESS = 1.02
BLOOM_THRESHOLD = 0.72   # luminance above which highlights bloom
BLOOM_STRENGTH = 0.35    # screen-blend opacity of the glow
UNSHARP_AMOUNT = 0.6
UNSHARP_RADIUS = 1.6


def add_bloom(pil_img):
    arr = np.asarray(pil_img).astype(np.float32) / 255.0
    lum = arr @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    mask = np.clip((lum - BLOOM_THRESHOLD) / (1.0 - BLOOM_THRESHOLD), 0.0, 1.0) ** 2
    highlights = arr * mask[..., None]
    sigma = max(arr.shape[:2]) / 250.0
    glow = cv2.GaussianBlur(highlights, (0, 0), sigmaX=sigma, sigmaY=sigma)
    # screen blend the glow back in at BLOOM_STRENGTH
    out = 1.0 - (1.0 - arr) * (1.0 - glow * BLOOM_STRENGTH)
    out = np.clip(out * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def unsharp(pil_img):
    arr = np.asarray(pil_img).astype(np.float32)
    blur = cv2.GaussianBlur(arr, (0, 0), sigmaX=UNSHARP_RADIUS)
    out = np.clip(arr + (arr - blur) * UNSHARP_AMOUNT, 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def process(path):
    im = Image.open(path)
    im = ImageOps.exif_transpose(im).convert("RGB")  # bake rotation, drop EXIF
    w, h = im.size
    long_edge = max(w, h)
    if long_edge > TARGET_LONG_EDGE:
        scale = TARGET_LONG_EDGE / long_edge
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    im = ImageEnhance.Color(im).enhance(SATURATION)
    im = ImageEnhance.Contrast(im).enhance(CONTRAST)
    im = ImageEnhance.Brightness(im).enhance(BRIGHTNESS)
    im = add_bloom(im)
    im = unsharp(im)
    im.save(path, "JPEG", quality=JPEG_QUALITY, optimize=True)
    return im.size


def main():
    if len(sys.argv) > 1:
        files = sys.argv[1:]
    else:
        files = sorted(glob.glob("images/**/20260601_*.jpg", recursive=True))
    print(f"Processing {len(files)} images -> long edge {TARGET_LONG_EDGE}px\n")
    for i, f in enumerate(files, 1):
        before = Image.open(f).size
        size = process(f)
        print(f"[{i}/{len(files)}] {f}  {before[0]}x{before[1]} -> {size[0]}x{size[1]}")
    print("\nDone.")


if __name__ == "__main__":
    main()
