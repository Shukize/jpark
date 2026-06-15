"""
Build final room/facility image sets from staged Agoda images:
combine source groups -> perceptual-dedupe -> AI-upscale (Real-ESRGAN 4K) ->
write into images/<folder>/ with the chosen cover first.
"""
import sys, types, shutil
from pathlib import Path
from PIL import Image

# torchvision shim (newer torchvision removed functional_tensor)
import torchvision.transforms.functional as _F
_ft = types.ModuleType("torchvision.transforms.functional_tensor")
_ft.rgb_to_grayscale = _F.rgb_to_grayscale
sys.modules["torchvision.transforms.functional_tensor"] = _ft
import cv2

BASE = Path(r"C:\Users\Veteran\OneDrive\Documents\Visual Studio 2022\jparkhotel website")
STAGE = BASE / "_work" / "scrape" / "agoda"
IMAGES = BASE / "images"
TARGET_LONG = 3840

# target folder -> (prefix, [source group names], cover group hint)
# cover hint = source group whose img_01 should be the cover (room_01)
PLAN = {
    "Corner Suite":            ("room", ["Corner Suite", "Corner Suite - Bed",
                                          "Corner Suite Twin Room - Bed",
                                          "Corner Suite Twin Room - Guestroom"], "Corner Suite"),
    "Grand Suite 1 Bedroom":   ("room", ["Grand Suite Room", "Grand Suite Room - Bedroom",
                                          "Grand Suite Room - Guestroom"], "Grand Suite Room"),
    "Deluxe":                  ("room", ["Deluxe Twin Room"], "Deluxe Twin Room"),
    "Prestige Twin":           ("room", ["Prestige Twin Room"], "Prestige Twin Room"),
    "Studio Single":           ("room", ["Studio Room"], "Studio Room"),
    "Studio B4":               ("room", ["Studio Double Room"], "Studio Double Room"),
    "Main Lobby":              ("lobby", ["Lobby", "Reception", "Entrance", "Public areas",
                                          "Interior view", "J. Park Hotel"], "Lobby"),
    "Onsen Men":               ("onsen", ["Hot spring bath", "Sauna", "Steamroom"], "Hot spring bath"),
}

def dhash(path, size=8):
    try:
        im = Image.open(path).convert("L").resize((size + 1, size), Image.LANCZOS)
    except Exception:
        return None
    px = list(im.getdata())
    bits = 0
    for r in range(size):
        for c in range(size):
            i = r * (size + 1) + c
            bits = (bits << 1) | (1 if px[i] < px[i + 1] else 0)
    return bits

def hamming(a, b):
    return bin(a ^ b).count("1")

def gather(sources, cover_hint):
    """Return ordered, deduped list of source image paths, cover first."""
    items = []   # (path, is_cover)
    for g in sources:
        folder = STAGE / g
        if not folder.exists():
            continue
        for p in sorted(folder.glob("*.jpg")):
            items.append((p, g == cover_hint))
    # order: cover-group images first
    items.sort(key=lambda t: (not t[1],))
    # perceptual dedupe + drop tiny/odd
    out, hashes = [], []
    for p, _ in items:
        try:
            w, h = Image.open(p).size
        except Exception:
            continue
        if w < 600 or h < 400:           # skip small
            continue
        hv = dhash(p)
        if hv is None:
            continue
        if any(hamming(hv, e) <= 6 for e in hashes):
            continue
        hashes.append(hv)
        out.append(p)
    return out

def setup_upsampler():
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer
    model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
    return RealESRGANer(scale=4,
        model_path="https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
        model=model, tile=512, tile_pad=10, pre_pad=0, half=True, gpu_id=0)

def upscale(upsampler, src, dest):
    img = cv2.imread(str(src), cv2.IMREAD_COLOR)
    if img is None:
        return False
    out, _ = upsampler.enhance(img, outscale=4)
    oh, ow = out.shape[:2]
    if oh >= ow:
        nh, nw = TARGET_LONG, int(ow * TARGET_LONG / oh)
    else:
        nw, nh = TARGET_LONG, int(oh * TARGET_LONG / ow)
    out = cv2.resize(out, (nw, nh), interpolation=cv2.INTER_LANCZOS4)
    dest.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(dest), out, [cv2.IMWRITE_JPEG_QUALITY, 95])
    return True

def main():
    plan_resolved = {}
    for folder, (prefix, sources, cover) in PLAN.items():
        files = gather(sources, cover)
        plan_resolved[folder] = (prefix, files)
        print(f"{folder}: {len(files)} images (prefix={prefix})")
    print("\nLoading Real-ESRGAN (RTX 5070)...")
    up = setup_upsampler()
    print("Model ready.\n")
    for folder, (prefix, files) in plan_resolved.items():
        dest_dir = IMAGES / folder
        if dest_dir.exists():
            for old in dest_dir.glob("*.jpg"):
                old.unlink()
        dest_dir.mkdir(parents=True, exist_ok=True)
        print(f"[{folder}]")
        n = 0
        for i, src in enumerate(files, 1):
            n += 1
            dest = dest_dir / f"{prefix}_{n:02d}.jpg"
            ok = upscale(up, src, dest)
            print(f"   {'OK ' if ok else 'ERR'} {dest.name}  <- {src.parent.name}/{src.name}")
            if not ok:
                n -= 1
        print(f"   -> {n} files\n")

if __name__ == "__main__":
    main()
