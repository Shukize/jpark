"""
Web-optimise only the photos that still need it.

optimize_images.py re-encodes the WHOLE tree unconditionally. That was right as
a one-off, but running it again puts a second generation of JPEG loss through
the ~118 photos it already optimised, for almost no saving. Photos added since
that pass are still full-camera-size — 3840px, 1MB, non-progressive — and those
are the ones costing page weight.

So this pass touches a file only when it is genuinely oversized:
  * long edge > MAX_EDGE (a browser never displays more, even a 4K lightbox), or
  * over SIZE_FLOOR bytes (heavier than a quality-84 1920px JPEG has any reason
    to be, i.e. it was saved at a higher quality than the site needs).

Everything else is left byte-for-byte alone. Originals stay in git history.
"""
import io
import os
import glob
from PIL import Image, ImageOps

ROOT = "images"
MAX_EDGE = 1920
QUALITY = 84
SIZE_FLOOR = 300 * 1024


def needs_work(path):
    try:
        w, h = Image.open(path).size
    except Exception:
        return False
    return max(w, h) > MAX_EDGE or os.path.getsize(path) > SIZE_FLOOR


def optimise(path):
    """Re-encode into memory first and keep the result only if it is actually
    smaller. Some source photos are large in DIMENSIONS but already squeezed
    hard on quality — an 81 KB 1772x2364 shot re-encodes to 239 KB at quality
    84, i.e. this pass would make the page slower and the photo no better.
    Returns True when the file was replaced."""
    im = ImageOps.exif_transpose(Image.open(path))   # bake rotation, drop EXIF
    w, h = im.size
    scale = MAX_EDGE / float(max(w, h))
    if scale < 1.0:
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    if im.mode != "RGB":
        bg = Image.new("RGB", im.size, (255, 255, 255))
        rgba = im.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        im = bg
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    # Require a real saving (>5%), so we never spend a generation of JPEG loss
    # for a rounding-error gain.
    if buf.tell() >= os.path.getsize(path) * 0.95:
        return False
    with open(path, "wb") as f:
        f.write(buf.getvalue())
    return True


def main():
    paths = sorted(set(
        p.replace("\\", "/")
        for ext in ("jpg", "jpeg")
        for p in glob.glob(os.path.join(ROOT, "**", "*." + ext), recursive=True)
    ))
    todo = [p for p in paths if needs_work(p)]
    print(f"{len(paths)} photos, {len(todo)} need optimising, "
          f"{len(paths) - len(todo)} already fine (left untouched)")

    before = after = 0
    changed = skipped = 0
    for i, p in enumerate(todo, 1):
        b = os.path.getsize(p)
        try:
            did = optimise(p)
        except Exception as e:
            print("  SKIP (unreadable):", p, e)
            continue
        if not did:
            skipped += 1
            continue
        a = os.path.getsize(p)
        before += b
        after += a
        changed += 1
        if b - a > 400 * 1024:
            print(f"  {b//1024:>5} KB -> {a//1024:>4} KB  {p}")
    print(f"\nreplaced {changed}, left alone {skipped} "
          f"(re-encoding them would not have helped)")

    mb = 1024 * 1024
    if before:
        print(f"\n{len(todo)} photos: {before/mb:.1f} MB -> {after/mb:.1f} MB "
              f"({100*(before-after)/before:.0f}% smaller)")


if __name__ == "__main__":
    main()
