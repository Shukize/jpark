"""
Download J-Park Hotel Agoda images grouped by Agoda's descriptive alt text,
at native (largest) resolution, into _work/scrape/agoda/<group>/ for review.
"""
import asyncio, re, sys, urllib.request, io, hashlib
from pathlib import Path
from collections import defaultdict
from playwright.async_api import async_playwright

sys.stdout.reconfigure(encoding="utf-8")
STAGE = Path(r"C:\Users\Veteran\OneDrive\Documents\Visual Studio 2022\jparkhotel website\_work\scrape\agoda")
STAGE.mkdir(parents=True, exist_ok=True)

URL = ("https://www.agoda.com/j-park-hotel/hotel/chonburi-th.html"
       "?countryId=106&finalPriceView=1&cid=1919460&adults=2&children=0&rooms=1"
       "&checkIn=2026-07-15&currencyCode=THB")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

def norm_group(alt):
    a = alt.strip()
    a = re.sub(r",\s*J\.?\s*Park Hotel.*$", "", a, flags=re.I)   # facility suffix
    a = re.sub(r"^Image of\s+", "", a, flags=re.I)
    a = re.sub(r"\s+\d+\s*$", "", a)                              # trailing index
    return a.strip()

SKIP = ["logo","icon","flag","badge","activity-image","dayuse","car picture",
        "user generated","popular things","more about","airport transfer"]
def keep(alt):
    al = alt.lower()
    if not al: return False
    if any(s in al for s in SKIP): return False
    return True

def hires(u):
    # strip size param -> native resolution
    u = re.sub(r"[?&]s=\d+x\d*", "", u)
    return u

def fetch(u):
    req = urllib.request.Request(u, headers={"User-Agent": UA, "Referer": "https://www.agoda.com/"})
    return urllib.request.urlopen(req, timeout=30).read()

async def collect_dom(page):
    return await page.evaluate("""() => {
        const out=[];
        document.querySelectorAll('img').forEach(im=>{
          const s=im.currentSrc||im.src||im.getAttribute('data-src')||'';
          const a=(im.alt||im.getAttribute('aria-label')||'').trim();
          if(s && s.includes('agoda.net')) out.push({alt:a, src:s});
        });
        return out;
    }""")

async def main():
    groups = defaultdict(set)   # group -> set of photo base urls
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width":1440,"height":1000}, user_agent=UA, locale="en-US")
        page = await ctx.new_page()
        print("opening..."); await page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3500)
        for sel in ["#onetrust-accept-btn-handler","[data-element-name='consent-banner-accept']","button:has-text('Accept')"]:
            try: await page.click(sel, timeout=1200); break
            except Exception: pass
        await page.keyboard.press("Escape")
        for _ in range(18):
            await page.mouse.wheel(0, 900); await page.wait_for_timeout(380)
        await page.evaluate("window.scrollTo(0,0)"); await page.wait_for_timeout(800)

        dom = await collect_dom(page)
        # open full gallery via JS click (bypass popup interception)
        try:
            await page.evaluate("""() => {
                const el=document.querySelector("[data-element-name='hotel-mosaic-see-all-photos']");
                if(el) el.click();
            }""")
            await page.wait_for_timeout(2500)
            for _ in range(30):
                await page.mouse.wheel(0, 1100); await page.wait_for_timeout(300)
            dom += await collect_dom(page)
        except Exception as e:
            print("gallery:", e)

        await browser.close()

    # group
    for im in dom:
        if not keep(im["alt"]): continue
        g = norm_group(im["alt"])
        if not g: continue
        groups[g].add(hires(im["src"].split("?")[0]) )  # base path, native res

    print(f"\n{len(groups)} groups:")
    for g in sorted(groups):
        print(f"  {len(groups[g]):3d}  {g}")

    # download, dedupe by content hash within group
    for g in sorted(groups):
        folder = STAGE / re.sub(r'[<>:"/\\|?*\[\]]', "", g)[:60].strip()
        folder.mkdir(parents=True, exist_ok=True)
        seen = {}
        i = 0
        for url in sorted(groups[g]):
            try:
                data = fetch(url)
            except Exception as e:
                print(f"   ERR {g}: {e}"); continue
            if len(data) < 8000:   # tiny = thumbnail/placeholder
                continue
            h = hashlib.md5(data).hexdigest()
            if h in seen: continue
            seen[h] = 1
            i += 1
            (folder / f"img_{i:02d}.jpg").write_bytes(data)
        print(f"   saved {i} -> {folder.name}")

if __name__ == "__main__":
    asyncio.run(main())
