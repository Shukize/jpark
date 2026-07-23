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

Nothing has been committed or deployed. Everything is in the working tree for your review.

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

And three judgement calls that are **yours, not mine**:

1. **"Reset all demo data" is still a button in the admin console.** On a live property one click
   discards real requests, messages and bookings. I have not removed it because I don't know if you
   still use it — but it should either go, or sit behind a typed confirmation.
2. **No cancellation policy is shown to a guest anywhere before they book.** Since payment happens
   at check-in, a guest currently commits without being told what happens if they don't arrive. That
   is a policy decision to write, not a bug to fix.
3. **Google Fonts loads from Google's servers on every page view.** It works, but it tells a third
   party about every visitor, and it is a render-blocking external dependency. Self-hosting the two
   font files would remove both concerns.

---

## Needs you

- **F8 — remove the duplicate DMARC record.** `_dmarc.jparkhotel.com` currently returns **two** TXT
  records. Per the standard, a domain with more than one DMARC record is treated as having **none** —
  so your DMARC is switched off despite being configured, and the reports going to
  `jparkhotel1@gmail.com` are not being generated. Delete the bare `v=DMARC1; p=none;` record and
  keep the one with `rua=`. (SPF and DKIM for Resend are correctly configured — that part is fine.)
  Once you have seen a few weeks of reports, consider moving `p=none` to `p=quarantine`: hotels are
  a standard phishing target and today anyone can send mail as your domain.
- **Photo weight.** The homepage is now 1.97 MB, but a single 1,046 KB room photo still dominates
  it, and there are **112 images over 300 KB** (98 MB total). Re-exporting the largest at a sane
  width would cut the remaining page weight by more than half. `optimize_images.py` in the repo root
  already does this — I have not run it, because re-encoding your photography is your call.
- **Security headers.** The site is served straight from GitHub Pages, which cannot add them, so
  there is no HSTS, no clickjacking protection and no content-type protection. Proxying the domain
  through Cloudflare (the DNS is already there) would let you add all three without touching code.
- **OTA email forwarding** — still switched off from the July shutdown. Until it is on, OTA guests
  have no booking on file, so they can't be verified and their building is unknown.

---

## What changed in the code

Fourteen files, all uncommitted. Mine are:

| File | Why |
|---|---|
| `assets/js/staff.js` | F1 — offline credential fallback removed |
| `assets/js/store.js` | F1 — seeded passwords deleted |
| `assets/js/i18n-app.js` | F1 — new offline message, all 5 languages |
| `backend/routes/payments.js` | F2 rate limits, F3 pricing, F4 input sanitising |
| `backend/lib/rateOverrides.js` | F3 — breakfast steps on adults |
| `assets/js/booking-page.js`, `assets/js/booking-payment.js` | F3 — the quote matches the charge |
| `backend/routes/auth.js` | F9 — per-device bucket no longer pools strangers |
| `backend/routes/chat.js` | F5 — vouching verifies the reference |
| `assets/css/style.css` | F6 — sideways drift |
| `assets/js/main.js` | F7 — carousel loads as needed |
| `index.html` | second `<h1>` |

`assets/js/chat.js` and `assets/css/app.css` (and part of `assets/js/staff.js` and
`backend/routes/chat.js`) contain **your own in-progress chat-continuity work**, which was already
in the tree — I have not touched it. It was loaded during all browser testing and produced no errors.

---

## How to re-run this

The whole sweep is reproducible. It runs against a throwaway PostgreSQL cluster and a local copy of
the API — production is never written to, and email sending is disabled. Every suite prints
`PASS`/`FAIL` per assertion and exits non-zero on failure.

The one habit worth keeping: **test against a database shaped like production**, not a fresh one.
Every silent outage this site has had came from the gap between the two.
