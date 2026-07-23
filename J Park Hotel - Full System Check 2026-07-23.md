# J Park Hotel — Full System Check
**23 July 2026 · every layer tested twice · 1,500+ assertions**

---

## In one paragraph

The site works. The booking engine, the guest portal, live chat, the staff console and the brand
new request board all do what they are supposed to do, in all five languages, on desktop and on a
phone, against a database shaped like the real one. I found **nine real faults**, fixed **eight**
of them, and proved each fix with the same test that failed before it. Two of the nine were costing
you money or letting strangers in, and neither would ever have shown up as an error message: guests
travelling alone with a child were being **overcharged 190 THB a night**, and during any backend
outage the staff console could be opened by anyone using a password printed in the public page
source. The ninth is a one-line DNS change only you can make.

**Everything below is now committed, pushed and live** (commits `aec5d1b`, `7c2e12b`, `e037a52`;
GitHub Pages deploy succeeded, production serving `?v=e037a52`). The three items that remain are
yours to do — one DNS change, one hosting toggle, one mailbox setting — and are listed under
"Needs you".

---

## What was found

| # | Severity | What was wrong | Status |
|---|---|---|---|
| **F1** | **High** | Anyone could sign into the staff console as **admin** during a backend outage, using credentials published in the site's own JavaScript | **Fixed** |
| **F2** | **High** | The **11th booking from one IP address in 10 minutes was refused** — one hotel Wi-Fi, one office, one wedding party = lost bookings | **Fixed** |
| **F3** | **High** | A lone adult travelling with a child was **overcharged 190 THB per night** whenever breakfast was selected | **Fixed** |
| **F9** | **High** | Once any 8 guests signed in with their **confirmation reference**, every further reference sign-in on the whole property was blocked for 10 minutes | **Fixed** |
| **F4** | Medium | A guest name over 100 characters, or any stray control character, ended the booking with a raw "Database error" | **Fixed** |
| **F5** | Medium | The ✅ Verified badge on a live-chat thread could point at a **booking that does not exist** | **Fixed** |
| **F6** | Medium | Every page **drifted sideways** — 34px on desktop, 10px on a phone | **Fixed** |
| **F7** | Medium | The homepage weighed **12.4 MB** on first view | **Fixed** (12.4 MB → 1.97 MB) |
| **F8** | Medium | **Two DMARC records** in DNS, which per the standard means the domain has *no* DMARC at all | **Needs you** (DNS) |

All eight code fixes are deployed. F8 is a DNS record only you can change.

---

## The two that mattered most

### F3 — a single parent with a child was overcharged, every night, on every room

The breakfast rate steps up from a room's base occupancy — a Single rate covers one breakfast, a
Twin rate covers two. That step was counting **everybody in the room, including children**, while
the child pricing rules charged the same child *again* by age (free under 5, 100 THB for 5–8, adult
rate from 9). The child was billed twice.

Measured against the published 2026 rate card, Studio Single with breakfast, per night:

| Party | Was charged | Rate card says | Difference |
|---|---|---|---|
| 1 adult + infant (0–4) | 1,300 | 1,110 — under-5s are free | **+190** |
| 1 adult + child 5–8 | 1,400 | 1,210 — flat 100 THB | **+190** |
| 1 adult + child 9+ | 1,990 | 1,800 — 190 + bed 500 | **+190** |
| 2 adults + any child | correct | correct | 0 |

It only ever hit bookings with **fewer than two adults and at least one child**, with breakfast
selected. Two adults were always billed correctly, which is why it survived — and the booking page
quoted the same wrong number, so the guest was quoted and charged consistently, just 190 THB a night
above your own rate card. On a 5-night family stay that is 950 THB.

This is the same mistake as the twin-breakfast overcharge fixed on 14 July: the base-occupancy step
counting the wrong people. That fix corrected the adult side; the child side was still counting
heads. The rate now steps on **adults only**, and children are priced once, by age, in the one place
that was always right.

*Fixed in `backend/lib/rateOverrides.js`, `backend/routes/payments.js`,
`assets/js/booking-page.js`, `assets/js/booking-payment.js` — server and booking page changed
together so the quote and the charge can never disagree.*
**Proof: 82 of 82 pricing assertions now pass; the 9 that failed were exactly these cases.**

### F1 — the staff console could be opened with a password anyone can read

The console tried the server first, and if the server was unreachable — or returned any 5xx — it
fell back to checking the typed password against the browser's own local store. That store shipped
seeded with `admin` / `admin123` and `staff` / `staff123`, both plainly readable in
`assets/js/store.js` on the live site.

I proved it in a real browser: with the API blocked, typing those credentials opened the console as
**Hotel Admin, role admin**.

The exposure window is precisely your worst moment — the Neon database suspension on 13 July took
the API down for hours, and a Render cold-start failure does the same for a minute at a time.
Offline the console has no real data to show anyway, so the fallback bought nothing.

*The fallback is gone; sign-in is server-only, and a guest who cannot reach the server is told so
plainly in their own language (a new `staff.login.offline` string, added in all five). The seeded
passwords are deleted.*
**Proof: the same browser test now fails to get in.**

---

## The two that quietly turned guests away

Both are rate limits that were too tight for how a hotel actually works, and both fail **silently** —
the guest just sees "too many attempts" and gives up.

**F2 — bookings.** Ten reservations per 10 minutes, per IP address. Your own Wi-Fi is a single
address; so is an office; so is most Thai mobile data. And it counted *attempts*, not bookings, so a
guest who fumbled the form ten times locked themselves out at the final step. Now 120 per IP with a
tight per-device budget alongside it — the same shape already used for guest login.

**F9 — the guest portal.** This one was worse. The per-device limit fell back to the literal word
`unknown` whenever a guest signed in with their **booking reference** — which is exactly what the
confirmation email tells them to use. So every reference sign-in on the property shared **one**
bucket of 8 per 10 minutes.

Proven before the fix: ten different guests, ten different bookings, ten different IP addresses —
**all ten refused**. After the fix: twenty different guests, all twenty admitted, while a single
caller grinding away at one reference is still cut off after 8 tries.

---

## Everything that was checked and found working

**1,547 automated assertions**, each run at least twice, the second time against databases rebuilt
from scratch with different data.

| Area | Result |
|---|---|
| Security: 75 endpoints × 5 identities (anonymous, forged signature, expired, front desk, admin) | **535 / 535** — no forged or expired token ever accepted, no admin-only route admitted a front-desk user, nothing returned a server error |
| Pricing: every room, every variant, 1–365 nights, every child age tier, extra beds, group bookings | **82 / 82** |
| Booking lifecycle, adversarial input, races, guest privacy | **89 / 89** |
| Chat, messaging, dining orders, site content, rates, maintenance, IP bans, sessions | **48 / 48** |
| **The new request board (`04ddfd0`), API** — run against **four** database shapes | **140 / 140** on each |
| Pages × 5 languages × desktop and mobile | **221 / 221** |
| Guest and staff journeys end to end | **19 / 19** |
| **The new request board, driven by two consoles in a browser** | **37 / 37** |
| Your existing backend test suites | **24 / 24** |

Highlights worth knowing:

- **The database migration is safe.** I rebuilt your schema as it was at the very first deployment,
  then at an intermediate point, then deliberately damaged a copy (renamed a column back, left old
  status words, dropped a column). `migrate.js` healed all of them, folded a legacy note column into
  the current one **without overwriting the guest's own words**, and the new request board worked
  identically on all four. This is the failure that hid a total outage for weeks in July; it is now
  tested rather than assumed.
- **The "Request sent!" lie is genuinely dead.** I forced the server to fail and to go offline. The
  portal reports an error both times and never claims success.
- **Nobody can claim to be someone.** A guest cannot mark themselves verified, cannot set their own
  building, and cannot read or cancel another guest's requests (attempted — 404, victim untouched).
- **A staff IP ban still never blocks a guest** from booking or chatting — important, because it is
  all one Wi-Fi network.
- **Injected `<script>` and `<img onerror>` payloads render as text** in the staff console.
- **Translations are complete**: 1,110 keys × 5 languages, no key missing anywhere, nothing left in
  English inside a translated dictionary.
- **The database-egress protections work**: the booking list only transfers when something actually
  changed, polling stops when the tab is hidden, and every polled endpoint measured under 2 KB.
- **Production is healthy**: all pages 200, API responding in 80–200 ms, every staff endpoint
  correctly refusing anonymous callers, CORS locked to your own origin, TLS valid to 1 October, and
  the deployed `staff.js` byte-for-byte identical to the committed source.

---

## Held to a five-star standard

Beyond "does it work", I checked it the way a flagship property would check its own digital front
door. What passed: price transparency (the key-card deposit is disclosed with a required
acknowledgement *before* committing, in all five languages), no internal vocabulary anywhere on the
guest side, errors that never show a raw code, every image with alt text, every input labelled, a
visible keyboard focus ring, one clean heading structure, and a chat that answers immediately and
tells a guest the front desk will follow up even when nobody is on shift.

Three things I fixed on those grounds:

- **F6 — the page drifted sideways.** The hero image and the coffee-club carousel are deliberately
  scaled up (a slow zoom effect), but nothing clipped them, so the whole document could be dragged
  sideways: 34px on desktop, 19px on a tablet, 10px on a phone. On a phone that reads as cheap. Now
  0px at every size, with the zoom effect untouched.
- **F7 — the homepage weighed 12.4 MB.** The coffee-club carousel was downloading all eight
  full-size photos the instant the page opened, for a section below the fold whose slideshow doesn't
  even start until you scroll to it. Slides now load as they are needed. **12.4 MB → 1.97 MB, 54
  requests → 27.**
- **Two `<h1>` headings** on the homepage (the intro overlay and the real hero title) — the
  decorative one is no longer a heading.

Three things I flagged as judgement calls have since been done, on your instruction:

1. **"Reset all demo data" is gone as a one-click action.** It is now labelled *"Clear this
   browser's working data"* — the old name made real work sound like sample data — and it requires
   typing `CLEAR` after being told plainly what is lost. Five languages.
2. **A cancellation policy now appears before the guest commits**, beside the deposit note in the
   payment step and again on the confirmation screen: nothing is charged now, you pay at check-in,
   contact us with your confirmation number to change or cancel. That is a description of how the
   system already behaves — **if the property has stricter terms (a no-show charge, a deadline),
   `bk.pay.cancelNote` in `assets/js/booking-payment.js` is the string to rewrite**, in all five
   languages.
3. **Google Fonts is no longer loaded from Google.** The three families are served from
   `assets/fonts/`, so no guest's page view is reported to a third party and the typography no
   longer depends on a host we don't control. Measured after the change: **zero third-party hosts
   contacted on page load** (was two), and only the four character subsets actually needed are
   downloaded. Regenerate with `tools/refresh-fonts.sh` if the families ever change.

And the photos were re-exported: the Grand Suite folder was still full-camera-size (3840px, up to
1.6MB each). **14.3 MB → 2.0 MB** for those eleven pictures, at 1920px — more than any browser
displays. `optimize_new_images.py` does this and deliberately skips anything a re-encode would not
actually shrink; 144 of 155 candidates were already at their best, and forcing them through would
have cost a second generation of JPEG loss to make some *larger* (one 81 KB photo came back at
239 KB during testing).

**Homepage on a throttled 4G phone, cold cache: 12.4 MB and 54 requests at the start of this
sweep → 2.1 MB and 31 requests now.** Largest-contentful-paint is still slow on that deliberately
harsh profile because the hero photo is 505 KB; converting the handful of remaining large JPEGs to
WebP/AVIF is the next meaningful win, and is a quality decision on your photography rather than a
bug.

## Needs you

- **F8 — remove the duplicate DMARC record.** `_dmarc.jparkhotel.com` currently returns **two** TXT
  records. Per the standard, a domain with more than one DMARC record is treated as having **none** —
  so your DMARC is switched off despite being configured, and the reports going to
  `jparkhotel1@gmail.com` are not being generated. Delete the bare `v=DMARC1; p=none;` record and
  keep the one with `rua=`. (SPF and DKIM for Resend are correctly configured — that part is fine.)
  Once you have seen a few weeks of reports, consider moving `p=none` to `p=quarantine`: hotels are
  a standard phishing target and today anyone can send mail as your domain.
- **Photo weight — the next step is a format decision.** The oversized photos have been
  re-exported (14.3 MB → 2.0 MB for the Grand Suite folder), and the homepage is down to 2.1 MB.
  The remaining weight is a handful of already-efficient 1920px JPEGs of 300–500 KB each, including
  the 505 KB hero. Going further means WebP/AVIF, which is a judgement call about how your
  photography should look — say the word and it is a short job.
- **Security headers.** The site is served straight from GitHub Pages, which cannot add them, so
  there is no HSTS, no clickjacking protection and no content-type protection. Proxying the domain
  through Cloudflare (the DNS is already there) would let you add all three without touching code.
- **OTA email forwarding** — still switched off from the July shutdown. Until it is on, OTA guests
  have no booking on file, so they can't be verified and their building is unknown.

---

## What changed in the code

Shipped across three commits — `aec5d1b` (the fixes), `7c2e12b` (self-hosted fonts + asset
version bump) and `e037a52` (the rest, plus this report):

| File | Why |
|---|---|
| `assets/js/staff.js` | F1 — offline credential fallback removed; typed confirmation on the data-clearing button |
| `assets/js/store.js` | F1 — seeded passwords deleted |
| `assets/js/i18n-app.js` | F1 offline message + the clear-data confirmation strings, all 5 languages |
| `backend/routes/payments.js` | F2 rate limits, F3 pricing, F4 input sanitising |
| `backend/lib/rateOverrides.js` | F3 — breakfast steps on adults, not on heads |
| `assets/js/booking-page.js`, `assets/js/booking-payment.js` | F3 — the quote matches the charge; cancellation policy before commitment |
| `backend/routes/auth.js` | F9 — per-device bucket no longer pools strangers |
| `backend/routes/chat.js` | F5 — vouching verifies the reference |
| `assets/css/style.css` | F6 — sideways drift |
| `assets/js/main.js` | F7 — carousel loads as needed |
| `assets/css/fonts.css`, `assets/fonts/`, `tools/refresh-fonts.sh`, the four HTML pages | fonts served from our own origin |
| `optimize_new_images.py`, `images/Grand Suite 1 Bedroom/*` | oversized photos re-exported |
| `index.html` | second `<h1>` |

`assets/js/chat.js`, `assets/js/util.js` and `assets/css/app.css` are **your own chat-continuity
work** (commit `ec6673a`, "Live chat: tell the guest when the front desk answers") — I did not
write or modify it. It was loaded throughout the browser testing and produced no console errors.

**Deployment verified live:** GitHub Pages build succeeded, production serves `?v=e037a52`, all
four pages return 200, `assets/css/fonts.css` resolves, the deployed HTML contains **zero**
references to Google's font hosts, and the re-exported room photo is served at 142 KB (was
1,046 KB). The API answers `/health` in ~0.1s. Render rebuilds on the same push and its build
command runs the backend test suite (24/24 passing), so a broken backend cannot deploy — but
confirm the Render dashboard shows `e037a52` as its live commit, since that is the one thing not
observable from outside.

---

## How to re-run this

The whole sweep is reproducible. It runs against a throwaway PostgreSQL cluster and a local copy of
the API — production is never written to, and email sending is disabled. Every suite prints
`PASS`/`FAIL` per assertion and exits non-zero on failure.

The one habit worth keeping: **test against a database shaped like production**, not a fresh one.
Every silent outage this site has had came from the gap between the two.
