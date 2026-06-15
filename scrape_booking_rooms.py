import asyncio, sys, json, re
from pathlib import Path
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
OUT = Path(r"C:\Users\Veteran\OneDrive\Documents\Visual Studio 2022\jparkhotel website\_work\scrape")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
URL = "https://www.booking.com/hotel/th/j-park-chon-buri6.html?selected_currency=THB&lang=en-us"

JS = r"""
() => {
  const out = new Set();
  const sels = ['a.hprt-roomtype-link','span.hprt-roomtype-icon-link',
    '[data-testid="roomtype-link"]','.hprt-roomtype-name','.e2e-room-name',
    'h3','h4'];
  sels.forEach(s => document.querySelectorAll(s).forEach(e => {
    const t = (e.innerText||'').trim();
    if (t && t.length < 60) out.add(t);
  }));
  return [...out];
}
"""

async def main():
    imgs = set()
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        c = await b.new_context(user_agent=UA, locale="en-US", viewport={"width":1440,"height":1000})
        pg = await c.new_page()
        pg.on("response", lambda r: imgs.add(r.url) if ("bstatic.com" in r.url and re.search(r"\.(jpe?g|webp)", r.url, re.I)) else None)
        await pg.goto(URL, wait_until="domcontentloaded", timeout=60000)
        await pg.wait_for_timeout(4000)
        for sel in ["button:has-text('Accept')","[aria-label*='Dismiss' i]"]:
            try: await pg.click(sel, timeout=1500); break
            except Exception: pass
        for _ in range(28):
            await pg.mouse.wheel(0, 900); await pg.wait_for_timeout(320)
        names = await pg.evaluate(JS)
        # dump rooms section html
        html = await pg.content()
        (OUT/"booking_full.html").write_text(html, encoding="utf-8")
        await b.close()
    print("CANDIDATE NAMES:")
    for n in sorted(names): print("  ", n)
    print(f"\nbstatic imgs seen: {len(imgs)}")
    (OUT/"booking_imgs.json").write_text(json.dumps(sorted(imgs), indent=1), encoding="utf-8")

asyncio.run(main())
