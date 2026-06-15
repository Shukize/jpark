import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

STAGE = Path(r"C:\Users\Veteran\OneDrive\Documents\Visual Studio 2022\jparkhotel website\_work\scrape\agoda")
OUT = Path(r"C:\Users\Veteran\OneDrive\Documents\Visual Studio 2022\jparkhotel website\_work\scrape\agoda_montage.jpg")

NOISE = {"australia","bali","china","fukuoka","india","indonesia","jakarta","jeju",
         "malaysia","nagoya","new york (ny)","nha trang","okinawa main island","penang",
         "philippines","sapporo","shanghai","singapore","taichung","tokyo","united states",
         "yokohama","surrounding environment","j. park hotel video","j. park hotel 3d photo"}

cells = []
for d in sorted(STAGE.iterdir()):
    if not d.is_dir(): continue
    if d.name.lower() in NOISE: continue
    imgs = sorted(d.glob("*.jpg"))
    if not imgs: continue
    cells.append((f"{d.name} ({len(imgs)})", imgs[0]))

cols = 5
tw, th = 320, 240
pad, lab = 8, 22
rows = (len(cells) + cols - 1) // cols
W = cols * (tw + pad) + pad
H = rows * (th + lab + pad) + pad
canvas = Image.new("RGB", (W, H), (245, 245, 245))
draw = ImageDraw.Draw(canvas)
try: font = ImageFont.truetype("arial.ttf", 14)
except Exception: font = ImageFont.load_default()

for i, (label, path) in enumerate(cells):
    r, c = divmod(i, cols)
    x = pad + c * (tw + pad)
    y = pad + r * (th + lab + pad)
    try:
        im = Image.open(path).convert("RGB")
        im.thumbnail((tw, th))
        canvas.paste(im, (x, y + lab))
    except Exception:
        pass
    draw.text((x + 2, y + 3), label[:42], fill=(0, 0, 0), font=font)

canvas.save(OUT, quality=85)
print("saved", OUT, canvas.size, "cells:", len(cells))
