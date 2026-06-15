"""
Full Agoda gallery scrape for J-Park Hotel.
Opens the property "see all photos" gallery (categorised) and every per-room
gallery, attributing each image URL to its category / room-type title.
Writes _work/scrape/agoda_catalog.json. No upscaling here.
"""
import asyncio, json, re, sys
from pathlib import Path
from playwright.async_api import async_playwright

sys.stdout.reconfigure(encoding="utf-8")
OUT = Path(r"C:\Users\Veteran\OneDrive\Documents\Visual Studio 2022\jparkhotel website\_work\scrape")
OUT.mkdir(parents=True, exist_ok=True)

URL = ("https://www.agoda.com/j-park-hotel/hotel/chonburi-th.html"
       "?countryId=106&finalPriceView=1&cid=1919460&adults=1&children=0&rooms=1"
       "&checkIn=2026-06-24&currencyCode=THB")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

# photo id -> {url, contexts:set}
catalog = {}
current_ctx = ["page"]

def photo_id(u):
    m = re.search(r"/(property|hotelImages)/\d+/(\d+)/", u)
    return m.group(2) if m else None

def record(u):
    if "agoda.net" not in u: return
    if not re.search(r"\.jpe?g", u, re.I): return
    if "/generic/" in u or "/images/" in u: return  # logos / cross-sell
    pid = photo_id(u)
    if not pid: return
    base = u.split("?")[0]
    e = catalog.setdefault(pid, {"base": base, "ctx": set()})
    e["ctx"].add(current_ctx[0])

async def dismiss(page):
    for sel in ["#onetrust-accept-btn-handler","button:has-text('Accept')",
                "[data-element-name='consent-banner-accept']",
                "button[aria-label*='Dismiss' i]","button[aria-label*='close' i]"]:
        try:
            await page.click(sel, timeout=1200); await page.wait_for_timeout(300)
        except Exception: pass

async def scroll_modal(page, n=18):
    # try scrolling any large scrollable overlay
    for _ in range(n):
        await page.mouse.wheel(0, 1200)
        await page.wait_for_timeout(350)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width":1440,"height":1000}, user_agent=UA, locale="en-US")
        page = await ctx.new_page()
        page.on("response", lambda r: record(r.url))

        print("opening..."); await page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3500); await dismiss(page)
        for _ in range(6):
            await page.mouse.wheel(0,900); await page.wait_for_timeout(300)
        await page.evaluate("window.scrollTo(0,0)"); await page.wait_for_timeout(500)

        # ---- 1. Full property gallery ----
        try:
            current_ctx[0] = "GALLERY"
            await page.click("[data-element-name='hotel-mosaic-see-all-photos']", timeout=8000)
            await page.wait_for_timeout(2500)
            # category tabs inside gallery
            tabs = await page.query_selector_all("[data-element-name*='gallery'] button, [class*='Category'] button, [role='tab']")
            print(f"gallery tabs found: {len(tabs)}")
            await scroll_modal(page, 24)
            # click each tab then scroll
            for i in range(len(tabs)):
                tabs = await page.query_selector_all("[role='tab'], [class*='Category'] button")
                if i >= len(tabs): break
                try:
                    label = (await tabs[i].inner_text()).strip().split("\n")[0]
                    current_ctx[0] = "CAT:" + label[:40]
                    await tabs[i].click(timeout=2500)
                    await page.wait_for_timeout(1200)
                    await scroll_modal(page, 14)
                except Exception as e:
                    pass
            # close
            for sel in ["[data-element-name='gallery-close-button']","button[aria-label*='close' i]","button[aria-label*='Close']"]:
                try: await page.click(sel, timeout=1500); break
                except Exception: pass
            await page.wait_for_timeout(800)
        except Exception as e:
            print("gallery err:", e)

        # ---- 2. Per-room galleries ----
        await page.keyboard.press("Escape"); await page.wait_for_timeout(500)
        # scroll to rooms section to load all room groups
        for _ in range(14):
            await page.mouse.wheel(0,1000); await page.wait_for_timeout(350)
        ctas = await page.query_selector_all("[data-element-name='mob-room-group-gallery-cta'], [data-element-name='room-group-gallery-cta'], [data-selenium='masterroom-photo']")
        print(f"room gallery CTAs: {len(ctas)}")
        # Find room titles too
        for i in range(len(ctas)):
            ctas = await page.query_selector_all("[data-element-name='mob-room-group-gallery-cta'], [data-element-name='room-group-gallery-cta'], [data-selenium='masterroom-photo']")
            if i >= len(ctas): break
            try:
                await ctas[i].scroll_into_view_if_needed(timeout=2000)
                await ctas[i].click(timeout=3000)
                await page.wait_for_timeout(1500)
                # modal title = room name
                title = ""
                for tsel in ["[data-element-name='room-gallery-title']","[class*='RoomGalleryModal'] h2","[role='dialog'] h2","h2"]:
                    el = await page.query_selector(tsel)
                    if el:
                        title = (await el.inner_text()).strip().split("\n")[0]
                        if title: break
                current_ctx[0] = "ROOM:" + (title[:50] or f"room{i}")
                print(f"  room[{i}] -> {current_ctx[0]}")
                await scroll_modal(page, 10)
                await page.keyboard.press("Escape"); await page.wait_for_timeout(700)
            except Exception as e:
                await page.keyboard.press("Escape"); await page.wait_for_timeout(500)

        await browser.close()

    out = {pid: {"base": e["base"], "ctx": sorted(e["ctx"])} for pid, e in catalog.items()}
    (OUT/"agoda_catalog.json").write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"\nTotal unique photos: {len(out)}")
    from collections import Counter
    c = Counter()
    for e in out.values():
        for x in e["ctx"]: c[x]+=1
    for k,n in c.most_common(60): print(f"  {n:3d}  {k}")

if __name__ == "__main__":
    asyncio.run(main())
