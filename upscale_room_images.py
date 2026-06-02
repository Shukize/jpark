"""
AI upscale all newly downloaded room images to 4K using Real-ESRGAN (RTX 5070).
Processes all images inside the per-room-type subfolders and overwrites in-place.
"""
import sys
import os
import types as _types

# Compatibility shim: newer torchvision removed functional_tensor module
import torchvision.transforms.functional as _F
_ft = _types.ModuleType("torchvision.transforms.functional_tensor")
_ft.rgb_to_grayscale = _F.rgb_to_grayscale
sys.modules["torchvision.transforms.functional_tensor"] = _ft

import cv2
from pathlib import Path

ROOM_FOLDERS = [
    "Corner Suite",
    "Deluxe Twin Room",
    "Grand Suite 1 Bedroom",
    "Grand Suite Two Bedrooms",
    "Prestige Twin Room",
    "Standard Single",
    "Studio Double Room",
    "Studio Room",
    "Superior Room",
]

IMAGES_ROOT = Path(r"C:\Users\Veteran\OneDrive\Documents\Visual Studio 2022\jparkhotel website\images")
TARGET_LONG_EDGE = 3840


def setup_upsampler():
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    model = RRDBNet(
        num_in_ch=3, num_out_ch=3,
        num_feat=64, num_block=23, num_grow_ch=32, scale=4
    )
    upsampler = RealESRGANer(
        scale=4,
        model_path="https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
        model=model,
        tile=512,
        tile_pad=10,
        pre_pad=0,
        half=True,
        gpu_id=0
    )
    return upsampler


def upscale_image(upsampler, path: Path) -> bool:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        print(f"  SKIP (unreadable): {path.name}")
        return False

    h, w = img.shape[:2]
    long_edge = max(h, w)

    # Skip if already at or above 4K resolution
    if long_edge >= TARGET_LONG_EDGE:
        print(f"  SKIP (already {w}x{h}): {path.name}")
        return True

    print(f"  Input: {w}x{h}", end=" ... ", flush=True)

    output, _ = upsampler.enhance(img, outscale=4)
    oh, ow = output.shape[:2]

    # Downsample to exact 4K long edge with Lanczos (sharper than raw 4x)
    if oh >= ow:
        new_h, new_w = TARGET_LONG_EDGE, int(ow * TARGET_LONG_EDGE / oh)
    else:
        new_w, new_h = TARGET_LONG_EDGE, int(oh * TARGET_LONG_EDGE / ow)

    output = cv2.resize(output, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    cv2.imwrite(str(path), output, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"-> {new_w}x{new_h}  saved.")
    return True


def collect_images() -> list[Path]:
    images = []
    for folder_name in ROOM_FOLDERS:
        folder = IMAGES_ROOT / folder_name
        if not folder.exists():
            print(f"WARNING: folder not found: {folder}")
            continue
        for p in sorted(folder.glob("*.jpg")):
            images.append(p)
        for p in sorted(folder.glob("*.png")):
            images.append(p)
        for p in sorted(folder.glob("*.webp")):
            images.append(p)
    return images


def main():
    images = collect_images()
    total = len(images)
    print(f"Found {total} room images to upscale.\n")
    if total == 0:
        print("Nothing to do.")
        return

    print("Loading Real-ESRGAN model (RTX 5070)...")
    upsampler = setup_upsampler()
    print("Model ready.\n")

    ok_count = 0
    for i, path in enumerate(images, 1):
        rel = path.relative_to(IMAGES_ROOT)
        print(f"[{i}/{total}] {rel}")
        if upscale_image(upsampler, path):
            ok_count += 1

    print(f"\nDone. {ok_count}/{total} images upscaled to 4K.")


if __name__ == "__main__":
    main()
