"""
Scrape J-Park Hotel room images from Agoda and download them into per-room subfolders.
"""
import asyncio
import re
import os
import sys
import urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

# Force UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

AGODA_URL = (
    "https://www.agoda.com/j-park-hotel/hotel/chonburi-th.html"
    "?countryId=106&finalPriceView=1&isShowMobileAppPrice=false"
    "&cid=1919460&adults=1&children=0&rooms=1&checkIn=2026-06-02"
    "&currencyCode=THB"
)

IMAGES_ROOT = Path(r"C:\Users\Veteran\OneDrive\Documents\Visual Studio 2022\jparkhotel website\images")


def safe_folder_name(name: str) -> str:
    name = re.sub(r'[<>:"/\\|?*]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name[:80]


def normalize_room_name(alt: str) -> str:
    """Strip 'Image of' prefix and trailing index number from alt text."""
    name = re.sub(r'^Image of\s+', '', alt, flags=re.IGNORECASE)
    name = re.sub(r'\s+\d+$', '', name).strip()
    return name


def is_room_image(alt: str) -> bool:
    alt_lower = alt.lower()
    # Skip logos, icons, and non-room images
    skip_keywords = ['logo', 'icon', 'map', 'badge', 'star', 'flag', 'arrow', 'button', 'loading']
    if any(kw in alt_lower for kw in skip_keywords):
        return False
    room_keywords = ['room', 'suite', 'deluxe', 'superior', 'standard', 'studio',
                     'villa', 'bungalow', 'twin', 'double', 'king', 'queen',
                     'prestige', 'corner', 'grand', 'single']
    return any(kw in alt_lower for kw in room_keywords)


def best_image_url(src: str) -> str:
    """Try to get the highest-resolution version of an Agoda image URL."""
    # Agoda CDN pattern: /hotelImages/{id}/{img_id}/x_{size}.jpg or similar
    # Try to replace size hints with larger values
    src = re.sub(r'(?<=/)\d{2,4}x\d{2,4}(?=/)', '1024x768', src)
    src = re.sub(r'_(1[0-9]{2}|[1-9][0-9])\.jpg', '_1024.jpg', src)
    # Remove width/height query params that limit size
    src = re.sub(r'[?&](w|h|width|height|maxwidth|maxheight)=\d+', '', src)
    return src


def download_image(url: str, dest: Path) -> bool:
    if dest.exists():
        print(f"  SKIP (exists): {dest.name}")
        return True
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://www.agoda.com/",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        if len(data) < 1000:
            print(f"  SKIP (too small, likely placeholder): {dest.name}")
            return False
        dest.write_bytes(data)
        size_kb = len(data) // 1024
        print(f"  OK ({size_kb} KB): {dest.name}")
        return True
    except Exception as e:
        print(f"  ERROR: {dest.name} -- {e}")
        return False


async def scrape():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1400, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        )
        page = await context.new_page()

        print("Opening Agoda page...")
        await page.goto(AGODA_URL, wait_until="networkidle", timeout=60000)

        # Dismiss cookie/consent banners
        for btn_sel in ["#onetrust-accept-btn-handler", "button[id*='cookie']",
                        "[class*='accept-cookie']", "[class*='consent'] button"]:
            try:
                await page.click(btn_sel, timeout=2000)
                await page.wait_for_timeout(500)
                break
            except Exception:
                pass

        print("Scrolling to load all room images...")
        for _ in range(10):
            await page.evaluate("window.scrollBy(0, 700)")
            await page.wait_for_timeout(600)

        # Collect images grouped by normalised room name
        room_data: dict[str, list[str]] = {}
        all_imgs = await page.query_selector_all("img")

        print(f"Total images on page: {len(all_imgs)}")

        for img in all_imgs:
            alt = (await img.get_attribute("alt") or "").strip()
            src = (await img.get_attribute("src") or
                   await img.get_attribute("data-src") or
                   await img.get_attribute("data-lazy-src") or "").strip()

            if not src or not alt:
                continue
            if not is_room_image(alt):
                continue
            if not src.startswith("http"):
                continue

            room_name = normalize_room_name(alt)
            if not room_name:
                continue

            best_src = best_image_url(src)
            room_data.setdefault(room_name, [])
            if best_src not in room_data[room_name]:
                room_data[room_name].append(best_src)

        if not room_data:
            print("WARNING: No room data found. Saving page HTML for inspection...")
            html = await page.content()
            Path("agoda_page_dump.html").write_text(html, encoding="utf-8")
            print("Saved agoda_page_dump.html")
        else:
            print(f"\nFound {len(room_data)} room types:")
            for rn, urls in sorted(room_data.items()):
                print(f"  {rn!r}: {len(urls)} image(s)")

        await browser.close()
        return room_data


def download_all(room_data: dict[str, list[str]]):
    IMAGES_ROOT.mkdir(parents=True, exist_ok=True)
    for room_name in sorted(room_data):
        urls = room_data[room_name]
        folder = IMAGES_ROOT / safe_folder_name(room_name)
        folder.mkdir(parents=True, exist_ok=True)
        print(f"\n[{room_name}] -> {folder}")
        for i, url in enumerate(urls, 1):
            ext = "jpg"
            m = re.search(r'\.(jpe?g|png|webp)(\?|$)', url, re.IGNORECASE)
            if m:
                ext = m.group(1).lower().replace("jpeg", "jpg")
            dest = folder / f"room_{i:02d}.{ext}"
            download_image(url, dest)


async def main():
    room_data = await scrape()
    if room_data:
        download_all(room_data)
        print("\nDone! Images saved to:", IMAGES_ROOT)
    else:
        print("\nNo images downloaded.")


if __name__ == "__main__":
    asyncio.run(main())
