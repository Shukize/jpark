"""
Download J-Park Hotel Booking.com images grouped by alt/room name, hi-res,
into _work/scrape/booking/<group>/ for review.
"""
import asyncio, re, sys, urllib.request, hashlib
from pathlib import Path
from collections import defaultdict
from playwright.async_api import async_playwright

sys.stdout.reconfigure(encoding="utf-8")
STAGE = Path(r"C:\Users\Veteran\OneDrive\Documents\Visual Studio 2022\jparkhotel website\_work\scrape\booking")
STAGE.mkdir(parents=True, exist_ok=True)

URL = "https://www.booking.com/hotel/th/j-park-chon-buri6.html?selected_currency=THB&lang=en-us"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

SKIP = ["logo","icon","flag","badge","genius","map","avatar","review","wishlist","sprite"]
def keep(alt):
    al = alt.lower()
    if any(s in al for s in SKIP): return False
    return True

def norm_group(alt):
    a = alt.strip()
    a = re.sub(r"^(Photo of|Image of|Picture of)\s+", "", a, flags=re.I)
    a = re.sub(r"\s*[-–]\s*J\.?\s*Park.*$", "", a, flags=re.I)
    a = re.sub(r"\s+\d+\s*$", "", a)
    return a.strip()

def hires(u):
    # bstatic size segment -> larger
    u = re.sub(r"/(square\d+|max\d+x\d+|max\d+|\d+x\d+)/", "/max1920x1280/", u)
    return u

def fetch(u):
    req = urllib.request.Request(u, headers={"User-Agent": UA, "Referer": "https://www.booking.com/"})
    return urllib.request.urlopen(req, timeout=30).read()

async def collect(page):
    return await page.evaluate("""() => {
        const out=[];
        document.querySelectorAll('img').forEach(im=>{
          const s=im.currentSrc||im.src||im.getAttribute('data-src')||'';
          const a=(im.alt||im.getAttribute('aria-label')||'').trim();
          if(s && s.includes('bstatic.com')) out.push({alt:a, src:s});
        });
        return out;
    }""")

async def main():
    groups = defaultdict(set)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width":1440,"height":1000}, user_agent=UA, locale="en-US")
        page = await ctx.new_page()
        print("opening booking..."); await page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3500)
        for sel in ["#onetrust-accept-btn-handler","button:has-text('Accept')","[aria-label*='Dismiss' i]","button[aria-label='Dismiss sign-in info.']"]:
            try: await page.click(sel, timeout=1500); break
            except Exception: pass
        await page.keyboard.press("Escape")
        for _ in range(20):
            await page.mouse.wheel(0, 900); await page.wait_for_timeout(380)
        await page.evaluate("window.scrollTo(0,0)"); await page.wait_for_timeout(800)
        dom = await collect(page)

        # open the photo gallery (click hero grid)
        for sel in ["[data-testid='gallery-image']","[data-testid='property-gallery'] img",
                    "a[data-thumbnail-url]","img[data-emjs]","[class*='gallery'] img","#photo_wrapper img"]:
            try:
                await page.click(sel, timeout=2500); await page.wait_for_timeout(2200)
                break
            except Exception: pass
        # scroll the lightbox / thumbnail strip
        for _ in range(40):
            await page.mouse.wheel(0, 1000); await page.wait_for_timeout(250)
        # click any "show all photos" sidebar tags then collect repeatedly
        dom += await collect(page)
        for _ in range(8):
            await page.keyboard.press("ArrowRight"); await page.wait_for_timeout(150)
        dom += await collect(page)

        await browser.close()

    for im in dom:
        if not keep(im["alt"]): continue
        g = norm_group(im["alt"]) or "(unlabeled)"
        groups[g].add(hires(im["src"].split("?")[0]))

    print(f"\n{len(groups)} groups:")
    for g in sorted(groups):
        print(f"  {len(groups[g]):3d}  {g}")

    for g in sorted(groups):
        folder = STAGE / re.sub(r'[<>:"/\\|?*\[\]]', "", g)[:60].strip()
        folder.mkdir(parents=True, exist_ok=True)
        seen={}; i=0
        for url in sorted(groups[g]):
            try: data=fetch(url)
            except Exception: continue
            if len(data) < 8000: continue
            h=hashlib.md5(data).hexdigest()
            if h in seen: continue
            seen[h]=1; i+=1
            (folder/f"img_{i:02d}.jpg").write_bytes(data)
        if i: print(f"   saved {i} -> {folder.name}")

if __name__ == "__main__":
    asyncio.run(main())
