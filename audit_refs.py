"""Audit every image/video reference in HTML/JS against files on disk."""
import re, sys, urllib.parse
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")
BASE = Path(r"C:\Users\Veteran\OneDrive\Documents\Visual Studio 2022\jparkhotel website")

files = list(BASE.glob("*.html")) + list((BASE/"assets"/"js").glob("*.js"))
ref_re = re.compile(r"""(images/[^"')]+?\.(?:jpg|jpeg|png|webp|mp4|gif))""", re.I)

refs = {}   # decoded path -> set(source files)
for f in files:
    txt = f.read_text(encoding="utf-8", errors="ignore")
    for m in ref_re.finditer(txt):
        p = urllib.parse.unquote(m.group(1))
        refs.setdefault(p, set()).add(f.name)

broken = []
for p in sorted(refs):
    if not (BASE / p).exists():
        broken.append((p, sorted(refs[p])))

print(f"Total distinct image refs: {len(refs)}")
print(f"BROKEN refs (file missing): {len(broken)}\n")
for p, srcs in broken:
    print(f"  MISSING  {p}    [{', '.join(srcs)}]")
