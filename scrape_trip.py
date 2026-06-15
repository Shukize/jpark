"""
Trip.com scrape for J-Park Hotel (id 7609475).
Captures JSON API responses + image network requests + deep DOM, dumps to
_work/scrape/trip_catalog.json for inspection.
"""
import asyncio, json, re, sys
from pathlib import Path
from playwright.async_api import async_playwright

sys.stdout.reconfigure(encoding="utf-8")
OUT = Path(r"C:\Users\Veteran\OneDrive\Documents\Visual Studio 2022\jparkhotel website\_work\scrape")
OUT.mkdir(parents=True, exist_ok=True)

URL = ("https://th.trip.com/hotels/chon-buri-hotel-detail-7609475/"
       "j-park-hotel-and-serviced-apartment/?locale=en-TH&curr=THB")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

img_urls = set()
json_blobs = []

def is_img(u):
    return re.search(r"\.(jpe?g|png|webp)(\?|$|_)", u, re.I) and (
        "tripcdn" in u or "ctrip" in u or "trip.com" in u)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width":1440,"height":1000}, user_agent=UA, locale="en-US")
        page = await ctx.new_page()

        async def on_resp(resp):
            u = resp.url
            if is_img(u):
                img_urls.add(u)
            ct = resp.headers.get("content-type","")
            if "json" in ct and ("hotel" in u.lower() or "image" in u.lower() or "room" in u.lower() or "album" in u.lower() or "detail" in u.lower()):
                try:
                    body = await resp.text()
                    if len(body) > 200 and ("ImageList" in body or "imageList" in body or "image" in body.lower() and "room" in body.lower()):
                        json_blobs.append({"url": u, "body": body[:600000]})
                except Exception:
                    pass
        page.on("response", lambda r: asyncio.create_task(on_resp(r)))

        print("opening trip..."); await page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(4000)
        for sel in ["button:has-text('Accept')","button:has-text('OK')","[class*='close']","[aria-label*='close' i]"]:
            try: await page.click(sel, timeout=1200); await page.wait_for_timeout(300)
            except Exception: pass

        for _ in range(25):
            await page.mouse.wheel(0, 900); await page.wait_for_timeout(450)
        await page.evaluate("window.scrollTo(0,0)"); await page.wait_for_timeout(1000)

        # try opening photo gallery
        for sel in ["[class*='headAlbum']","[class*='albumEntry']","[class*='gallery']",
                    "[class*='headPic']","img[class*='hotelHead']","[class*='photo'] img"]:
            try:
                await page.click(sel, timeout=2000); await page.wait_for_timeout(2500)
                for _ in range(20):
                    await page.mouse.wheel(0,1000); await page.wait_for_timeout(350)
                break
            except Exception: pass

        # DOM imgs
        dom = await page.evaluate("""() => {
            const out=[];
            document.querySelectorAll('img').forEach(im=>{
              const s=im.currentSrc||im.src||''; const a=(im.alt||'').trim();
              if(s) out.push({alt:a,src:s});
            });
            return out;
        }""")
        for im in dom:
            if is_img(im["src"]): img_urls.add(im["src"])

        html = await page.content()
        (OUT/"trip_page2.html").write_text(html, encoding="utf-8")
        await browser.close()

    (OUT/"trip_catalog.json").write_text(json.dumps(
        {"img_urls": sorted(img_urls), "dom": dom, "json_blobs": json_blobs},
        indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"trip img urls: {len(img_urls)}  json blobs: {len(json_blobs)}")
    for b in json_blobs[:6]:
        print("  JSON:", b["url"][:120])

if __name__ == "__main__":
    asyncio.run(main())
