"""Fill the 7 gap rooms + Building 5 from the closest Agoda categories
(approximate tier matches; reuse accepted by user). Dedupe + 4K upscale."""
import sys
import process_ota as P

# target -> (prefix, [agoda source groups], cover hint)
GAP = {
    "Prestige Single":            ("room", ["Standard Single", "Standard Single - Bed",
                                            "Standard Single - Guestroom"], "Standard Single"),
    "Premium Single":             ("room", ["Superior Room", "Superior Room - Bedroom",
                                            "Superior Room - Guestroom"], "Superior Room"),
    "Premium Twin":               ("room", ["Guestroom"], "Guestroom"),
    "Grand Premium":              ("room", ["Premier"], "Premier"),
    "Premium Suite":              ("room", ["Grand Suite Two Bedrooms",
                                            "Grand Suite Two Bedrooms - Bedroom",
                                            "Grand Suite Two Bedrooms - Family room"], "Grand Suite Two Bedrooms"),
    "Grand Deluxe":               ("room", ["Deluxe Twin Room"], "Deluxe Twin Room"),
    "Executive Suite 1 Bedroom":  ("room", ["Grand Suite Two Bedrooms",
                                            "Grand Suite Two Bedrooms - Bedroom",
                                            "Grand Suite Two Bedrooms - Family room"], "Grand Suite Two Bedrooms"),
    "B5":                         ("b5",   ["Ballroom", "Banquet hall", "Meeting room  ballrooms",
                                            "Exterior view"], "Ballroom"),
}

def main(dry=False):
    resolved = {}
    for folder, (prefix, sources, cover) in GAP.items():
        files = P.gather(sources, cover)
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
            if not P.upscale(up, src, dest):
                n -= 1
        print(f"   -> {n} files")

if __name__ == "__main__":
    main(dry="--dry" in sys.argv)
