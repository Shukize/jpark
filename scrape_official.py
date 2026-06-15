"""Scrape J Park Hotel's OWN site (jparkhotel.com) accommodation pages:
enumerate room pages, collect full-size room images per room, save grouped to
_work/scrape/official/<slug>/ for review."""
import asyncio, sys, re, json
from pathlib import Path
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
OUT = Path(r"C:\Users\Veteran\OneDrive\Documents\Visual Studio 2022\jparkhotel website\_work\scrape\official")
OUT.mkdir(parents=True, exist_ok=True)
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

async def grab_imgs(page):
    return await page.evaluate("""() => {
        const set=new Set();
        document.querySelectorAll('img').forEach(im=>{
          let s=im.currentSrc||im.src||im.getAttribute('data-src')||im.getAttribute('data-lazy-src')||'';
          // strip WP resize suffix -1024x683.jpg -> full size
          s=s.replace(/-\\d{2,4}x\\d{2,4}(?=\\.(jpg|jpeg|png|webp))/i,'');
          if(s && /\\.(jpg|jpeg|png|webp)/i.test(s) && !/logo|icon|favicon|placeholder/i.test(s)) set.add(s);
        });
        document.querySelectorAll('[style*="background-image"]').forEach(el=>{
          const m=getComputedStyle(el).backgroundImage.match(/url\\(\"?(.*?)\"?\\)/);
          if(m && /\\.(jpg|jpeg|png|webp)/i.test(m[1]) && !/logo|icon/i.test(m[1])){
            set.add(m[1].replace(/-\\d{2,4}x\\d{2,4}(?=\\.(jpg|jpeg|png|webp))/i,''));
          }
        });
        return [...set];
    }""")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        c = await b.new_context(user_agent=UA, locale="en-US", viewport={"width":1440,"height":1000},
                                ignore_https_errors=True)
        pg = await c.new_page()
        await pg.goto("https://www.jparkhotel.com/accommodation/", wait_until="networkidle", timeout=60000)
        await pg.wait_for_timeout(1500)
        links = await pg.evaluate("""() => [...new Set([...document.querySelectorAll('a[href*=\"/accommodation/\"]')]
            .map(a=>a.href).filter(h=>/\\/accommodation\\/[a-z0-9-]+\\/?$/i.test(h)))]""")
        print("ROOM PAGES:")
        for l in links: print("  ", l)

        catalog = {}
        for url in links:
            slug = re.sub(r"/$","",url).rsplit("/",1)[-1]
            try:
                await pg.goto(url, wait_until="networkidle", timeout=60000)
                await pg.wait_for_timeout(1200)
                for _ in range(6):
                    await pg.mouse.wheel(0,800); await pg.wait_for_timeout(300)
                imgs = await grab_imgs(pg)
            except Exception as e:
                print(f"  ERR {slug}: {e}"); imgs=[]
            catalog[slug] = imgs
            print(f"  [{slug}] {len(imgs)} imgs")
        await b.close()
    (Path(OUT)/"catalog.json").write_text(json.dumps(catalog, indent=1, ensure_ascii=False), encoding="utf-8")

asyncio.run(main())
