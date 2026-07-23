#!/usr/bin/env bash
# Regenerate the self-hosted webfonts in assets/fonts/ + assets/css/fonts.css.
#
# The site does NOT link to fonts.googleapis.com: that would report every guest's
# page view to a third party and make the typography depend on a host we don't
# control. Instead the Google Fonts CSS is fetched once, every gstatic URL is
# rewritten to a local copy, and the woff2 files are committed.
#
# Run this only when the font FAMILIES or WEIGHTS change (edit FAMILIES below).
# The unicode-range rules are preserved, so browsers still download only the
# character subsets they need.
#
#   bash tools/refresh-fonts.sh
set -euo pipefail
cd "$(dirname "$0")/.."

FAMILIES="family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Noto+Sans+Thai:wght@300;400;500;600;700&family=Noto+Serif+Thai:wght@400;500;600&display=swap"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

mkdir -p assets/fonts
curl -s -A "$UA" "https://fonts.googleapis.com/css2?${FAMILIES}" -o /tmp/jpark-gf.css
test -s /tmp/jpark-gf.css || { echo "failed to fetch the Google Fonts CSS"; exit 1; }

python - <<'PY'
import re, os, urllib.request
css = open('/tmp/jpark-gf.css', encoding='utf-8').read()
urls = sorted(set(re.findall(r'https://fonts\.gstatic\.com/[^)]+', css)))
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'}
total = 0
for u in urls:
    m = re.search(r'/s/([a-z]+)/[^/]+/([^.]+)\.woff2', u)
    name = (m.group(1) + '-' + m.group(2) + '.woff2') if m else os.path.basename(u)
    data = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()
    open('assets/fonts/' + name, 'wb').write(data)
    total += len(data)
    css = css.replace(u, '../fonts/' + name)
open('assets/css/fonts.css', 'w', encoding='utf-8').write(
    "/* Self-hosted copies of the three Google Fonts this site uses (Cormorant\n"
    "   Garamond, Noto Sans Thai, Noto Serif Thai), generated from the Google Fonts\n"
    "   CSS API with every gstatic URL rewritten to assets/fonts/.\n\n"
    "   Self-hosted rather than linked so that no guest's page view is reported to a\n"
    "   third party, and so the typography does not depend on a host we do not\n"
    "   control. The unicode-range rules are kept intact, so a browser still\n"
    "   downloads only the character subsets it actually needs — a Thai visitor\n"
    "   never fetches the Cyrillic cut. Regenerate with tools/refresh-fonts.sh.  */\n\n"
    + css)
print(f"{len(urls)} font files, {total/1024:.0f} KB -> assets/fonts/")
PY

echo "Done. Review 'git status assets/fonts assets/css/fonts.css' before committing."
