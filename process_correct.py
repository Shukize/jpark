"""Build the 4 correctly-matched room photo sets (Prestige Single, Premium
Single, Grand Deluxe, Grand Suite 1 Bedroom) from real Trip.com/Klook
room-specific photos staged in _work/scrape/correct/<Source Room Name>/.
Same dedupe + 4K-upscale pipeline as process_ota.py, pointed at the new
correctly-matched sources instead of the old Agoda approximate categories."""
import sys
import process_ota as P

STAGE = P.BASE / "_work" / "scrape" / "correct"

# target folder -> (prefix, [source group names under _work/scrape/correct/], cover hint)
PLAN = {
    "Prestige Single": ("room", ["Trip - Prestige Double Bed", "Trip - Prestige Twin Room",
                                  "Klook - Superior Double Room"], "Trip - Prestige Double Bed"),
    "Premium Single":  ("room", ["Trip - Premier Double Room", "Trip - Premier Twin Room"],
                                 "Trip - Premier Double Room"),
    "Grand Deluxe":    ("room", ["Klook - Deluxe Double Room", "Klook - Deluxe Twin Room",
                                  "Trip - Corner Suite Double", "Trip - Corner Suite Twin"],
                                 "Klook - Deluxe Double Room"),
    "Grand Suite 1 Bedroom": ("room", ["Trip - Grand Suite One Bedroom"], "Trip - Grand Suite One Bedroom"),
}

def gather_local(sources, cover_hint):
    items = []
    for g in sources:
        folder = STAGE / g
        if not folder.exists():
            continue
        for p in sorted(folder.glob("*.jpg")):
            items.append((p, g == cover_hint))
    items.sort(key=lambda t: (not t[1],))
    out, hashes = [], []
    from PIL import Image
    for p, _ in items:
        try:
            w, h = Image.open(p).size
        except Exception:
            continue
        if w < 600 or h < 400:
            continue
        hv = P.dhash(p)
        if hv is None:
            continue
        if any(P.hamming(hv, e) <= 6 for e in hashes):
            continue
        hashes.append(hv)
        out.append(p)
    return out

MAX_PHOTOS = 20

def main(dry=False):
    resolved = {}
    for folder, (prefix, sources, cover) in PLAN.items():
        files = gather_local(sources, cover)[:MAX_PHOTOS]
        resolved[folder] = (prefix, files)
        cov = (files[0].parent.name + "/" + files[0].name) if files else "NONE"
        print(f"{folder:28s} {len(files):2d}  cover<-{cov}")
    if dry:
        return
    print("\nLoading Real-ESRGAN...")
    up = P.setup_upsampler()
    print("Model ready.\n")
    for folder, (prefix, files) in resolved.items():
        dest_dir = P.IMAGES / folder
        if dest_dir.exists():
            for old in dest_dir.glob("*.jpg"):
                old.unlink()
        dest_dir.mkdir(parents=True, exist_ok=True)
        print(f"[{folder}]")
        n = 0
        for src in files:
            n += 1
            dest = dest_dir / f"{prefix}_{n:02d}.jpg"
            ok = P.upscale(up, src, dest)
            print(f"   {'OK ' if ok else 'ERR'} {dest.name}  <- {src.parent.name}/{src.name}")
            if not ok:
                n -= 1
        print(f"   -> {n} files\n")

if __name__ == "__main__":
    main(dry="--dry" in sys.argv)
