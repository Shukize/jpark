import asyncio, sys, json, re
from pathlib import Path
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
OUT = Path(r"C:\Users\Veteran\OneDrive\Documents\Visual Studio 2022\jparkhotel website\_work\scrape")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
URL = ("https://www.booking.com/hotel/th/j-park-chon-buri6.html"
       "?checkin=2026-07-15&checkout=2026-07-16&group_adults=2&no_rooms=1&group_children=0"
       "&selected_currency=THB&lang=en-us")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        c = await b.new_context(user_agent=UA, locale="en-US", viewport={"width":1440,"height":1100})
        pg = await c.new_page()
        await pg.goto(URL, wait_until="domcontentloaded", timeout=70000)
        await pg.wait_for_timeout(5000)
        for sel in ["button:has-text('Accept')","[aria-label*='Dismiss' i]"]:
            try: await pg.click(sel, timeout=1500); break
            except Exception: pass
        for _ in range(30):
            await pg.mouse.wheel(0, 800); await pg.wait_for_timeout(300)
        # extract room names from the rooms table
        names = await pg.evaluate("""() => {
            const out=new Set();
            document.querySelectorAll('a.hprt-roomtype-link, span.hprt-roomtype-icon-link, .hprt-roomtype-link, [data-testid=\"title\"], .hprt-table .hprt-roomtype-name').forEach(e=>{
              const t=(e.innerText||'').trim(); if(t && t.length<70) out.add(t);
            });
            return [...out];
        }""")
        html = await pg.content()
        (OUT/"booking_dated.html").write_text(html, encoding="utf-8")
        await b.close()
    print("ROOM NAMES (table):")
    for n in sorted(names): print("  ", n)

asyncio.run(main())
