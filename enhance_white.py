"""
Bright / dreamy / WHITE finishing pass for the 2026-06-09 photo batch.

Goal: make every new photo look like a 5-star hotel listing — clean, airy,
neutral-white (no yellow cast), gently glowing, crisp. Per image:

  1. EXIF-transpose (bakes any sideways rotation upright, drops the tag).
  2. Upscale: < 3840px long edge -> Real-ESRGAN x4 -> Lanczos to 3840;
     larger -> Lanczos down to 3840. Panoramas handled (bomb check off).
  3. White balance: robust "shades-of-grey" on the bright pixels to kill the
     yellow/tungsten cast and make whites actually white (clamped so warm
     wood stays warm, not grey).
  4. Auto-exposure: adaptive gamma lift toward an airy target luminance —
     dim onsen shots get lifted more, already-bright shots barely move.
  5. Gentle S-curve contrast for a clean, "glass" feel.
  6. Light vibrance so greenery/wood stay natural after the white balance.
  7. Edge-preserving smooth (glassy linens/surfaces) + highlight bloom (dreamy).
  8. Unsharp mask for crispness. Save JPEG q93.

Originals are backed up to _work/orig_backup (gitignored) first.

Usage:
  python enhance_white.py            # back up + process the whole new batch
  python enhance_white.py <files…>   # process just these (still backs up)
"""
import sys
import math
import shutil
from pathlib import Path

import numpy as np
import cv2
from PIL import Image, ImageOps, ImageEnhance

Image.MAX_IMAGE_PIXELS = None  # some shots are 16320x12240 panoramas

BASE = Path(__file__).resolve().parent
IMAGES = BASE / "images"
BACKUP = BASE / "_work" / "orig_backup"
TARGET_LONG_EDGE = 3840
JPEG_QUALITY = 93

# The new 2026-06-09 batch (+ the new 06-07 lobby pair is already finished).
NEW_GLOBS = [
    "Onsen Lady/*.jpg",
    "Onsen Men/*.jpg",
    "Onsen Description/*.jpg",
    "Deluxe/20260609_*.jpg",
    "Studio Single/20260609_*.jpg",
    "Studio B4/20260609_*.jpg",
    "Main Lobby/20260609_*.jpg",
    "New Midnight Coffee Club/20260609_*.jpg",
]

# ---- finishing strengths (tasteful, magazine-clean, not over-cooked) ----
WB_STRENGTH = 0.82       # how far to push toward neutral whites
WB_GAIN_CLAMP = (0.78, 1.45)
EXPOSURE_TARGET = 0.60   # airy mean luminance
EXPOSURE_GAMMA_CLAMP = (0.55, 1.0)  # only ever brighten
SCURVE_AMOUNT = 0.10
VIBRANCE = 1.06
SMOOTH_SIGMA_S = 18      # edge-preserving spatial (glassy surfaces)
SMOOTH_SIGMA_R = 0.12
SMOOTH_BLEND = 0.45      # mix smoothed back in (keep detail)
BLOOM_THRESHOLD = 0.74
BLOOM_STRENGTH = 0.30
UNSHARP_AMOUNT = 0.55
UNSHARP_RADIUS = 1.5

_UPSAMPLER = None


def get_upsampler():
    global _UPSAMPLER
    if _UPSAMPLER is not None:
        return _UPSAMPLER
    import types
    import torchvision.transforms.functional as _F
    _ft = types.ModuleType("torchvision.transforms.functional_tensor")
    _ft.rgb_to_grayscale = _F.rgb_to_grayscale
    sys.modules["torchvision.transforms.functional_tensor"] = _ft
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer
    model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
    _UPSAMPLER = RealESRGANer(
        scale=4,
        model_path="https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
        model=model, tile=512, tile_pad=10, pre_pad=0, half=True, gpu_id=0,
    )
    return _UPSAMPLER


def white_balance(arr):
    """Shades-of-grey illuminant estimate over the brighter pixels, clamped."""
    lum = arr @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    thr = np.percentile(lum, 70)
    mask = lum >= thr
    if mask.sum() < 100:
        mask = np.ones_like(lum, dtype=bool)
    means = arr[mask].reshape(-1, 3).mean(axis=0)
    means = np.maximum(means, 1e-4)
    gains = means.mean() / means
    gains = 1.0 + (gains - 1.0) * WB_STRENGTH
    gains = np.clip(gains, *WB_GAIN_CLAMP)
    return np.clip(arr * gains, 0.0, 1.0)


def auto_exposure(arr):
    lum_mean = float((arr @ np.array([0.299, 0.587, 0.114], dtype=np.float32)).mean())
    lum_mean = min(max(lum_mean, 0.02), 0.98)
    g = math.log(EXPOSURE_TARGET) / math.log(lum_mean)
    g = min(max(g, EXPOSURE_GAMMA_CLAMP[0]), EXPOSURE_GAMMA_CLAMP[1])
    return np.power(arr, g)


def s_curve(arr):
    return np.clip(arr + SCURVE_AMOUNT * np.sin((arr - 0.5) * math.pi), 0.0, 1.0)


def edge_smooth(arr):
    u8 = (arr * 255).astype(np.uint8)
    sm = cv2.edgePreservingFilter(u8, flags=cv2.RECURS_FILTER,
                                  sigma_s=SMOOTH_SIGMA_S, sigma_r=SMOOTH_SIGMA_R)
    sm = sm.astype(np.float32) / 255.0
    return np.clip(arr * (1 - SMOOTH_BLEND) + sm * SMOOTH_BLEND, 0.0, 1.0)


def add_bloom(arr):
    lum = arr @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    mask = np.clip((lum - BLOOM_THRESHOLD) / (1.0 - BLOOM_THRESHOLD), 0.0, 1.0) ** 2
    highlights = arr * mask[..., None]
    sigma = max(arr.shape[:2]) / 250.0
    glow = cv2.GaussianBlur(highlights, (0, 0), sigmaX=sigma, sigmaY=sigma)
    return np.clip(1.0 - (1.0 - arr) * (1.0 - glow * BLOOM_STRENGTH), 0.0, 1.0)


def unsharp(arr):
    blur = cv2.GaussianBlur(arr, (0, 0), sigmaX=UNSHARP_RADIUS)
    return np.clip(arr + (arr - blur) * UNSHARP_AMOUNT, 0.0, 1.0)


def to_3840(im):
    """PIL image -> RGB at <=3840 long edge, AI-upscaling small ones."""
    im = ImageOps.exif_transpose(im).convert("RGB")
    w, h = im.size
    long_edge = max(w, h)
    if long_edge < TARGET_LONG_EDGE:
        bgr = cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)
        out, _ = get_upsampler().enhance(bgr, outscale=4)
        oh, ow = out.shape[:2]
        if oh >= ow:
            nh, nw = TARGET_LONG_EDGE, round(ow * TARGET_LONG_EDGE / oh)
        else:
            nw, nh = TARGET_LONG_EDGE, round(oh * TARGET_LONG_EDGE / ow)
        out = cv2.resize(out, (nw, nh), interpolation=cv2.INTER_LANCZOS4)
        im = Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB))
    elif long_edge > TARGET_LONG_EDGE:
        s = TARGET_LONG_EDGE / long_edge
        im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    return im


def process(path: Path):
    im = to_3840(Image.open(path))
    arr = np.asarray(im).astype(np.float32) / 255.0
    arr = white_balance(arr)
    arr = auto_exposure(arr)
    arr = s_curve(arr)
    im = Image.fromarray((arr * 255).astype(np.uint8))
    im = ImageEnhance.Color(im).enhance(VIBRANCE)
    arr = np.asarray(im).astype(np.float32) / 255.0
    arr = edge_smooth(arr)
    arr = add_bloom(arr)
    arr = unsharp(arr)
    out = Image.fromarray((arr * 255).astype(np.uint8))
    out.save(path, "JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.size


def collect():
    files = []
    for g in NEW_GLOBS:
        files += sorted(IMAGES.glob(g))
    return files


def backup(files):
    BACKUP.mkdir(parents=True, exist_ok=True)
    for f in files:
        rel = f.relative_to(IMAGES)
        dst = BACKUP / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists():
            shutil.copy2(f, dst)


def main():
    if len(sys.argv) > 1:
        files = [Path(a).resolve() for a in sys.argv[1:]]
    else:
        files = collect()
    print(f"Backing up + finishing {len(files)} images -> {TARGET_LONG_EDGE}px, bright/white/dreamy\n")
    backup(files)
    for i, f in enumerate(files, 1):
        try:
            before = Image.open(f).size
            size = process(f)
            print(f"[{i}/{len(files)}] {f.relative_to(BASE)}  {before[0]}x{before[1]} -> {size[0]}x{size[1]}")
        except Exception as e:
            print(f"[{i}/{len(files)}] {f.name}  ERROR: {e}")
    print("\nDone.")


if __name__ == "__main__":
    main()
