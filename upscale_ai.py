"""
AI-enhanced upscaling using Real-ESRGAN on RTX 5070.
Strategy: extract original images from git, apply 4x ESRGAN, supersample to 3840px.
"""
import os
import sys
import subprocess
import tempfile
import cv2
import numpy as np
from pathlib import Path

# Compatibility shim: newer torchvision removed functional_tensor module
import torchvision.transforms.functional as _F
import types as _types
_ft = _types.ModuleType("torchvision.transforms.functional_tensor")
_ft.rgb_to_grayscale = _F.rgb_to_grayscale
sys.modules["torchvision.transforms.functional_tensor"] = _ft

def get_original_from_git(git_path, output_path):
    """Extract original image from git commit 60f3f45 (pre-upscale)."""
    result = subprocess.run(
        ["git", "show", f"60f3f45:{git_path}"],
        capture_output=True, cwd=BASE_DIR
    )
    if result.returncode != 0:
        return False
    with open(output_path, "wb") as f:
        f.write(result.stdout)
    return True

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
        half=True,  # fp16 for RTX 5070
        gpu_id=0
    )
    return upsampler

def process_image(upsampler, src_path, dest_path, target_long_edge=3840):
    img = cv2.imread(str(src_path), cv2.IMREAD_COLOR)
    if img is None:
        print(f"  SKIP (unreadable): {src_path}")
        return False

    h, w = img.shape[:2]
    print(f"  Original: {w}x{h}")

    # Real-ESRGAN 4x upscale
    output, _ = upsampler.enhance(img, outscale=4)
    oh, ow = output.shape[:2]
    print(f"  After ESRGAN: {ow}x{oh}")

    # Supersample down to target long edge (sharper than direct upscale)
    if oh >= ow:
        new_h = target_long_edge
        new_w = int(ow * target_long_edge / oh)
    else:
        new_w = target_long_edge
        new_h = int(oh * target_long_edge / ow)

    output = cv2.resize(output, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    print(f"  Final: {new_w}x{new_h}")

    os.makedirs(os.path.dirname(str(dest_path)), exist_ok=True)
    cv2.imwrite(str(dest_path), output, [cv2.IMWRITE_JPEG_QUALITY, 95])
    return True


BASE_DIR = Path(r"c:\Users\Veteran\OneDrive\Documents\Visual Studio 2022\jparkhotel website")
IMAGES_DIR = BASE_DIR / "images"

# Priority order: hero first, then MCC carousel, then everything else
PRIORITY_IMAGES = [
    "images/48cd9718-cece-4c80-adcd-dd637ed35d00.jpg",  # HERO
    "images/New Midnight Coffee Club/587f2a86-cbf1-4cac-9e69-9279d2478323.jpg",
    "images/New Midnight Coffee Club/533e41e3-da93-4733-b004-9d2ea6f73b93.jpg",
    "images/New Midnight Coffee Club/e46b8210-aa80-4e70-9752-ebc89b40d507.jpg",
    "images/New Midnight Coffee Club/71ef2776-f865-424b-9c49-8b8d6408996a.jpg",
    "images/New Midnight Coffee Club/9fc27bb2-ce97-4825-84b4-e3c2152c5628.jpg",
    "images/New Midnight Coffee Club/f930c440-b85d-46c2-a6d5-fea5ee506ac9.jpg",
    "images/New Midnight Coffee Club/3f2b3f47-b2ab-42ef-aae2-03638f1d26da.jpg",
    "images/New Midnight Coffee Club/b85f1406-83f2-4969-84c6-11299dfdb391.jpg",
]

# Collect all other images
def get_all_images():
    all_imgs = []
    for p in IMAGES_DIR.rglob("*.jpg"):
        rel = p.relative_to(BASE_DIR).as_posix()
        # Skip duplicates with "(1)" in name - they're identical
        if "(1)" not in str(p):
            all_imgs.append(rel)
    return all_imgs

def main():
    print("Setting up Real-ESRGAN (RTX 5070 GPU)...")
    upsampler = setup_upsampler()
    print("Model loaded.\n")

    all_images = get_all_images()

    # Build ordered list: priority first, then rest
    remaining = [img for img in all_images if img not in PRIORITY_IMAGES]
    ordered = PRIORITY_IMAGES + remaining

    total = len(ordered)
    for i, rel_path in enumerate(ordered, 1):
        dest = BASE_DIR / rel_path
        print(f"\n[{i}/{total}] {rel_path}")

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            if get_original_from_git(rel_path, tmp_path):
                ok = process_image(upsampler, tmp_path, dest)
                if ok:
                    print(f"  -> Saved to {dest.name}")
            else:
                print(f"  -> Not in git history, processing current file")
                ok = process_image(upsampler, dest, dest)
                if ok:
                    print(f"  -> Enhanced in-place")
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    print(f"\nDone! {total} images AI-upscaled with Real-ESRGAN + supersampling to 3840px.")

if __name__ == "__main__":
    main()
