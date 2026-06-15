"""
Exploratory scrape of J-Park Hotel listings on Agoda and Trip.com.
Collects every <img> (alt + best-res src) and every image network request,
grouped by alt text, then writes JSON for inspection. No downloads of finals yet.
"""
import asyncio
import json
import re
import sys
from pathlib import Path
from playwright.async_api import async_playwright

sys.stdout.reconfigure(encoding="utf-8")

OUT = Path(r"C:\Users\Veteran\OneDrive\Documents\Visual Studio 2022\jparkhotel website\_work\scrape")
OUT.mkdir(parents=True, exist_ok=True)

AGODA = ("https://www.agoda.com/j-park-hotel/hotel/chonburi-th.html"
         "?countryId=106&finalPriceView=1&cid=1919460&adults=1&children=0&rooms=1"
         "&checkIn=2026-06-24&currencyCode=THB")
TRIP = ("https://th.trip.com/hotels/chon-buri-hotel-detail-7609475/"
        "j-park-hotel-and-serviced-apartment/?locale=en-TH")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


async def dismiss(page):
    for sel in ["#onetrust-accept-btn-handler", "button[id*='cookie']",
                "[class*='accept-cookie']", "[class*='consent'] button",
                "button:has-text('Accept')", "button:has-text('OK')",
                "[aria-label*='close' i]", "[class*='popup'] [class*='close']"]:
        try:
            await page.click(sel, timeout=1500)
            await page.wait_for_timeout(400)
        except Exception:
            pass


async def scrape(site, url):
    net_imgs = set()
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1440, "height": 960}, user_agent=UA,
                                        locale="en-US")
        page = await ctx.new_page()

        def on_resp(resp):
            u = resp.url
            if re.search(r"\.(jpe?g|png|webp)(\?|$)", u, re.I):
                net_imgs.add(u)
        page.on("response", on_resp)

        print(f"[{site}] opening...")
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            print(f"  goto warn: {e}")
        await page.wait_for_timeout(3000)
        await dismiss(page)

        # scroll to trigger lazy load
        for _ in range(16):
            await page.evaluate("window.scrollBy(0, 800)")
            await page.wait_for_timeout(400)
        await page.evaluate("window.scrollTo(0, 0)")
        await page.wait_for_timeout(800)

        # collect <img> alt+src
        imgs = await page.evaluate("""() => {
            const out = [];
            document.querySelectorAll('img').forEach(im => {
                const src = im.currentSrc || im.src || im.getAttribute('data-src') || '';
                const alt = (im.alt || im.getAttribute('aria-label') || '').trim();
                if (src) out.push({alt, src, w: im.naturalWidth, h: im.naturalHeight});
            });
            // also background-images
            document.querySelectorAll('*').forEach(el => {
                const bg = getComputedStyle(el).backgroundImage;
                const m = bg && bg.match(/url\\(\"?(.*?)\"?\\)/);
                if (m && /\\.(jpe?g|png|webp)/i.test(m[1])) {
                    out.push({alt: (el.getAttribute('aria-label')||'').trim(), src: m[1], w:0, h:0});
                }
            });
            return out;
        }""")

        html = await page.content()
        (OUT / f"{site}_page.html").write_text(html, encoding="utf-8")
        await browser.close()

    data = {"site": site, "url": url, "dom_imgs": imgs, "net_imgs": sorted(net_imgs)}
    (OUT / f"{site}_raw.json").write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"[{site}] dom imgs: {len(imgs)}  net imgs: {len(net_imgs)}")

    # alt histogram
    from collections import Counter
    c = Counter((i["alt"] or "(no alt)") for i in imgs)
    print(f"[{site}] top alt texts:")
    for alt, n in c.most_common(40):
        print(f"   {n:3d}  {alt[:80]}")


async def main():
    for site, url in [("agoda", AGODA), ("trip", TRIP)]:
        try:
            await scrape(site, url)
        except Exception as e:
            print(f"[{site}] FAILED: {e}")
        print("-" * 60)


if __name__ == "__main__":
    asyncio.run(main())
