import asyncio, sys, json, re
from pathlib import Path
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
OUT = Path(r"C:\Users\Veteran\OneDrive\Documents\Visual Studio 2022\jparkhotel website\_work\scrape")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
URL = "https://www.traveloka.com/en-th/hotel/thailand/j-park-hotel-and-serviced-apartment-1000000621488"

async def main():
    imgs = set()
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        c = await b.new_context(user_agent=UA, locale="en-US", viewport={"width":1440,"height":1000})
        pg = await c.new_page()
        pg.on("response", lambda r: imgs.add(r.url) if re.search(r"\.(jpe?g|webp)", r.url, re.I) and ("traveloka" in r.url or "tvlk" in r.url) else None)
        try:
            await pg.goto(URL, wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            print("goto:", e)
        await pg.wait_for_timeout(5000)
        for _ in range(30):
            await pg.mouse.wheel(0, 900); await pg.wait_for_timeout(350)
        names = await pg.evaluate("""() => {
            const out=new Set();
            document.querySelectorAll('h1,h2,h3,h4,[data-testid*=room i],[class*=roomName i],[class*=RoomName i]').forEach(e=>{
              const t=(e.innerText||'').trim();
              if(t && t.length<60) out.add(t);
            });
            const dom=[];
            document.querySelectorAll('img').forEach(im=>{const s=im.currentSrc||im.src||''; const a=(im.alt||'').trim(); if(s)dom.push({alt:a,src:s});});
            window.__DOM=dom;
            return [...out];
        }""")
        dom = await pg.evaluate("() => window.__DOM")
        (OUT/"traveloka_full.html").write_text(await pg.content(), encoding="utf-8")
        await b.close()
    print("CANDIDATE NAMES:")
    for n in sorted(names): print("  ", n[:70])
    alts = sorted({d["alt"] for d in dom if d["alt"] and len(d["alt"])<60})
    print("\nDOM ALT (non-empty):")
    for a in alts[:60]: print("  ", a)
    print(f"\ntraveloka imgs: {len(imgs)}")
    (OUT/"traveloka.json").write_text(json.dumps({"names":sorted(names),"imgs":sorted(imgs),"dom":dom}, indent=1, ensure_ascii=False), encoding="utf-8")

asyncio.run(main())
