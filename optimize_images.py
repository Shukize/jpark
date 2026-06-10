"""
Web-optimise every photo under images/ for fast loading on slow networks.

The source photos are ~3840 px on the long edge and 3-10 MB each — far larger
than any browser ever displays them (even a full-screen lightbox on a 4K panel
needs <= ~1920 px). Serving the originals is why pages crawl on slow links.

This pass, run once over the tree:
  * downscales the long edge to MAX_EDGE (only ever shrinks, never enlarges),
  * bakes EXIF orientation into the pixels then drops all metadata,
  * re-encodes as a *progressive* JPEG at QUALITY (progressive = a low-res
    preview paints almost immediately, then sharpens — the "almost instant"
    feel on slow connections), optimised Huffman tables,
  * converts the handful of opaque PNG photos to JPEG (smaller) and rewrites
    their references in the code.

Typical result: ~90% smaller files with no visible quality loss at display size.
Originals remain in git history if a re-encode is ever needed.
"""
import os
import glob
from PIL import Image, ImageOps

ROOT = "images"
MAX_EDGE = 1920
QUALITY = 84

# Opaque PNGs that become JPEGs; their references are patched separately.
PNG_TO_JPG = {
    "images/Tsubaki/299142779_1061028674597720_627657094659192438_n.png":
        "images/Tsubaki/299142779_1061028674597720_627657094659192438_n.jpg",
    "images/New Midnight Coffee Club/unnamed4.png":
        "images/New Midnight Coffee Club/unnamed4.jpg",
}


def _resized(im):
    im = ImageOps.exif_transpose(im)        # bake rotation, we drop EXIF below
    w, h = im.size
    scale = MAX_EDGE / float(max(w, h))
    if scale < 1.0:
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    return im


def _save_jpeg(im, path):
    if im.mode != "RGB":
        bg = Image.new("RGB", im.size, (255, 255, 255))
        rgba = im.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])   # flatten any alpha onto white
        im = bg
    im.save(path, "JPEG", quality=QUALITY, optimize=True, progressive=True)


def main():
    paths = []
    for ext in ("jpg", "jpeg", "png"):
        paths += glob.glob(os.path.join(ROOT, "**", "*." + ext), recursive=True)
    paths = sorted(set(p.replace("\\", "/") for p in paths))

    before = after = 0
    for p in paths:
        before += os.path.getsize(p)
        try:
            im = _resized(Image.open(p))
        except Exception as e:
            print("  SKIP (unreadable):", p, e)
            after += os.path.getsize(p)
            continue
        ext = os.path.splitext(p)[1].lower()
        if ext == ".png":
            out = PNG_TO_JPG.get(p, os.path.splitext(p)[0] + ".jpg")
            _save_jpeg(im, out)
            if out != p:
                os.remove(p)
            after += os.path.getsize(out)
        else:
            _save_jpeg(im, p)
            after += os.path.getsize(p)

    mb = 1024 * 1024
    print(f"\n{len(paths)} images: {before/mb:.0f} MB -> {after/mb:.0f} MB "
          f"({100*(before-after)/before:.0f}% smaller)")


if __name__ == "__main__":
    main()
