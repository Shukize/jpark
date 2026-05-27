# J Park Hotel Website

A multilingual static hotel website for **J Park Hotel · Chonburi, Thailand** — no build step, no server required. Open `index.html` directly in a browser.

---

## Features

- 5 languages: Thai · English · Japanese · Simplified Chinese · Traditional Chinese
- Guest portal: service requests, in-room dining, live request tracker
- Live chat (guest ↔ front desk, localStorage-based)
- Staff & admin console (`staff.html`) with internal messaging and a team status board
- **Site Editor (admin)** — a streamlined, tabbed CMS that edits **every** piece of public text and **every** photo in **every** section:
  - **Website text** — edit any string per language; one edit **auto-translates into the other four languages** so they stay in sync. Each group shows a thumbnail of where it appears, with "View on site" to jump there and highlight it.
  - **Photos & videos** — add, replace, reorder (◀ ▶) and remove the photos in any section (hero, about, rooms, dining, facilities, pool, gym, gallery…). Current photos are shown.
  - **Colours**, **show/hide sections**, **announcement banner**
  - **Previous edits** — an audit log of who changed what and when
- **Self-service staff login** — Forgot Password, Forgot Username, and New Staff Account flows
- **Guest Booking inbox** — OTA reservations (Agoda, Booking.com, Airbnb, Trip.com…) land in Messages, auto-translated
- **Password Reset Requests** inbox for admins
- Mobile / Desktop view toggle

---

## Demo logins

### Guest portal (`index.html → Guest Services`)

| Last name   | Room | Booking ref |
|-------------|------|-------------|
| Robinson    | 101  | JP-1001     |
| Miyamoto    | 204  | JP-1002     |
| Chen        | 312  | JP-1003     |

Enter the last name + room number (case-insensitive) **or** the booking reference.

### Staff console (`staff.html`)

| Username | Password  | Role          |
|----------|-----------|---------------|
| staff    | staff123  | Front Desk    |
| admin    | admin123  | Administrator |

---

## Staff accounts & passwords

Admins manage accounts under **Staff console → Staff**.

1. **Admin adds a member** — enter a full name + username and pick a role. No password is set by the admin; new accounts start on the shared temporary password **`jparkhotel`** and are flagged "must change password".
2. **The new member activates their account** — on the login page they choose **New Staff Account**, enter the username the admin gave them and the temporary password `jparkhotel`, then set their own password. They're signed in immediately. (If someone signs in normally while still on the temporary password, they're sent to set a new one too.)
3. **Forgot Password / Forgot Username** — links under the Sign in button file a request that appears in **Messages → Password Reset Requests** (admin-only). For a password request the admin can click **Reset to default password**, which puts the account back on `jparkhotel` and re-flags "must change"; the member then re-runs the New Staff Account flow.

> Note: this is a front-end demo. Passwords live in `localStorage` in plain text. In a real deployment, authentication and password hashing must happen on a server.

---

## Site Editor (admin)

Open **Staff console → Site Editor**. Everything updates the live public site immediately (text/colour edits apply instantly across open tabs; photo/gallery changes apply on the public page's next load). Tabs:

| Tab | What it does |
|-----|--------------|
| **Website text** | Pick the editing language, search or browse grouped sections, and edit any string. Saving **auto-translates** the change into the other four languages via the live translation service so all languages match (you can still hand-edit any language). Each group shows a thumbnail; click it (or a field's **View on site ↗**) to open that spot on the live site and briefly highlight it. |
| **Photos & videos** | Open any section to **add / replace / reorder / remove** its photos. Uploads (≤ 2 MB, stored as data URLs) or pasted image/video links. The current photos are shown so you always see what's live. |
| **Colours** | Recolour the whole site (primary / accent / gold). |
| **Sections** | Show/hide whole sections, post an announcement banner, "Undo all my edits", and "Reset all demo data". |
| **Previous edits** | Audit log of every change — who, what and when (newest first). |

Edits are stored in the `content` table in `localStorage`: text in `content.overrides[lang][key]`, photos in `content.media[setId]`, plus `content.theme`, `content.hidden` and `content.editLog`. **Undo all my edits** clears them and restores the shipped defaults. Auto-translation needs an internet connection; if it's unavailable the other languages keep their current text and can be edited by hand.

---

## Local Concierge (temporarily hidden)

The **Local Concierge** section — curated Chonburi experiences (Bangsaen Beach, Night Market, Wat Yansangwararam, Thai Spa, Golf, Airport Transfer) with chat/booking integration — has been commented out of `index.html` pending a design refresh.

To re-enable it:

1. In `index.html`, find the comment  
   `<!-- LOCAL CONCIERGE — temporarily hidden; see README to re-enable -->`  
   and replace it with the section below.

2. Add the nav link back inside `.nav-links`:  
   ```html
   <a href="#concierge" data-i18n="nav.concierge">Concierge</a>
   ```

3. Add the footer link back inside `.footer-links`:  
   ```html
   <a href="#concierge" data-i18n="nav.concierge">Concierge</a>
   ```

### Full section HTML to restore

```html
<!-- ====== LOCAL CONCIERGE ====== -->
<section class="concierge section" id="concierge">
  <div class="section-head reveal">
    <p class="eyebrow" data-i18n="conc.eyebrow">Explore Chonburi</p>
    <h2 class="section-title" data-i18n="conc.title">Local Concierge</h2>
    <p class="section-lede" data-i18n="conc.lede">Curated experiences near J Park. Tap a card to ask a question or request a booking.</p>
  </div>
  <div class="conc-grid reveal" id="concGrid"><!-- injected by JS --></div>
</section>
```

All strings, images, and JS logic are still in place (`assets/js/guest.js → renderConcierge`, `assets/js/i18n-app.js → conc.*`). Restore the HTML and the feature works immediately.

---

## Guest Booking inbox (OTA reservations)

When a booking reaches the site, the confirmation — guest details + the booking
email — shows up under **Messages → Guest Booking** for both Admin and Staff,
auto-translated into whatever language the reader has selected, exactly like
internal messages and live chat.

### ✅ Does OTA communication work?

**The in-browser intake works and is verified.** Calling `JPark.bookings.ingest(...)`
or opening the `staff.html#booking=…` deep link reliably normalises a payload,
de-duplicates on `channel`+`ref`, stores it in the `guestBookings` table, fires a
notification and syncs across tabs. Four demo bookings are seeded so the inbox is
populated out of the box. You can confirm it yourself right now: open `staff.html`,
sign in, open the browser console and run the `JPark.bookings.ingest({…})` example
below — the booking appears immediately under **Messages → Guest Booking**.

**What does _not_ happen automatically:** because this is a 100% client-side site
with **no server**, an OTA (Agoda/Booking.com/…) has no way to reach the browser
on its own. OTAs deliver bookings by **email or webhook to a server endpoint** —
and there isn't one here. So real bookings will **not** flow in by themselves
until you add the small **bridge** described below. This is a hosting/architecture
limitation, not a bug: the intake seam is ready and waiting; it just needs
something to call it.

**To make live OTA communication work** you need one piece of always-on infrastructure
(a serverless function, channel-manager webhook, or a Zapier/Make automation) that
receives the OTA email/webhook and calls `JPark.bookings.ingest()` — or, more
realistically for a production hotel, a proper backend that stores bookings in a
database and the page reads from it. See **Integration guide** below.

### How a booking gets in

This site is fully client-side, so an OTA booking can't reach the browser on its
own. A small **bridge** does the linking — typically an email-forwarding rule on
the hotel's reservations inbox, or a channel-manager webhook — which calls the
intake seam in `assets/js/bookings.js`. There are two ways to push a booking in:

**1. JavaScript API** (e.g. from a webhook handler that has the page open, or the browser console):

```js
JPark.bookings.ingest({
  channel:    "agoda",            // agoda | booking | airbnb | trip | expedia | other
  ref:        "AGD-849217643",    // OTA confirmation / booking number
  guestName:  "Daniel Robinson",
  guestEmail: "d.robinson@gmail.com",
  guestPhone: "+44 7700 900812",
  room:       "Deluxe Twin",
  checkIn:    "2026-06-02",
  checkOut:   "2026-06-03",
  adults:     2,
  children:   0,
  total:      1850,
  currency:   "THB",
  // optional: paste the raw OTA email text; otherwise a summary is generated
  confirmation: "Dear J Park Hotel, a new reservation has been confirmed…",
  lang:       "en"               // source language of `confirmation`, for translation
});
```

Only `channel` + a guest name are really needed; everything else is filled in or
defaulted. Re-sending the same `channel` + `ref` is a no-op (de-duplicated).

**2. Deep link** — a forwarding service opens:

```
staff.html#booking=<base64-encoded JSON>
```

where the JSON is the same payload as above, encoded with
`btoa(unescape(encodeURIComponent(json)))`. The booking is ingested on page load
and the hash is then cleared so a refresh won't insert it twice.

A new booking fires a desktop/toast notification and syncs live across open tabs.
Four demo bookings (Agoda, Booking.com, Airbnb, Trip.com) are seeded so the inbox
is populated out of the box.

### ⚡ Integration guide: live OTA notifications

To **automatically receive** booking notifications from your OTA channels, you'll need a small **bridge**
that watches your reservation inbox and pushes bookings into the staff console. Here are the most common approaches:

#### Option 1: Email forwarding + serverless function
Set up a forwarding rule on your hotel's reservations inbox (Gmail, Outlook) to pipe OTA confirmations to a Lambda/Cloud Function that:
1. Parses the booking email (extract guest name, ref, dates from the raw email)
2. Calls the intake API (see API example above) or opens the deep link

This works with **any OTA** that sends email confirmations.

#### Option 2: Channel manager webhook
If you use a hotel channel manager (CloudBeds, Hostaway, RMS, Beds24, etc.), set up a webhook on booking arrival that calls the intake API with the booking details.

#### Option 3: Zapier / Make automation
Use a no-code platform to watch an inbox or API, extract booking data, and POST it to a simple proxy endpoint that calls the JS API.

#### Option 4: Manual entry (for low-volume)
Staff can paste a booking confirmation email into the console, or use the API in the browser console directly (useful for testing).

**All methods feed into the same `JPark.bookings.ingest()` seam.** New bookings:
- Appear instantly under **Messages → Guest Booking** for all staff/admin
- Fire a desktop notification + toast
- Auto-translate the confirmation into each viewer's language
- Sync live across open tabs
- Track unread/read status per user (like internal messages)

Start with Option 1 (email + Lambda) — it's low-friction and works universally.

---

## Architecture

### Frontend (static — no build step required)

- Pure HTML / CSS / JS — open `index.html` or `staff.html` directly in a browser
- All shared state falls back to `localStorage` via `JPark.store` (`assets/js/store.js`)
- Real-time cross-tab sync uses the `storage` event
- i18n strings: `assets/js/i18n.js` (core) + `assets/js/i18n-app.js` (feature strings). Admin text edits are read first from `content.overrides[lang][key]`
- **Photo registry**: `assets/js/media.js` (`JPark.media`) is the single source of truth for every photo/video set. `main.js` builds the carousel, room/facility/dining cards, the full Gallery and all lightboxes from it; admin edits live in `content.media[setId]`
- Public-site CMS layer (`assets/js/cms.js`) applies text/photo/colour/section overrides to `index.html` and reloads the page when the photo sets change
- OTA booking intake seam: `assets/js/bookings.js` → `JPark.bookings.ingest()`, stored in the `guestBookings` table
- Free-text translation (chat, internal mail, booking confirmations, Site Editor auto-translate): `assets/js/translate.js` (keyless Google Translate web endpoint, cached in `localStorage`)
- Demo data is seeded once on first load; reset via Admin → "Reset all demo data"
- **API client**: `assets/js/api.js` (`JPark.api`) is a thin `fetch` wrapper that attaches the JWT `Authorization` header and normalises errors. `assets/js/config.js` auto-detects the API base URL (`localhost:3000` for local dev; `https://jpark.onrender.com` when deployed)
- **Auth token**: `assets/js/auth-token.js` (`JPark.authToken`) mints / caches / clears the JWT issued by the backend; all API calls are **API-first with localStorage fallback** so the site works even when the backend is offline

### `content` table (admin edits)

```
content = {
  overrides: { en: { "hero.title": "…" }, th: {…}, … },  // text, per language
  media:     { "room:Superior Room": [ {src,video}, … ], … },  // photo sets
  theme:     { teal, terracotta, gold },
  hidden:    { rooms: true, … },                          // hidden sections
  editLog:   [ { ts, userName, type, … } ]                // Previous edits
}
```

### Backend (`backend/`)

A Node/Express + PostgreSQL API service that backs the entire staff console and
guest portal. It runs independently of the static frontend and is deployable to
Render (or any Node host) with a `DATABASE_URL` env var.

| Route | Purpose |
|-------|---------|
| `POST /api/auth/login` | Staff/admin login — returns a signed JWT |
| `POST /api/auth/register` | New staff account self-activation |
| `GET/POST /api/service-requests` | Guest service requests |
| `GET/POST /api/chat` | Live chat messages |
| `GET/POST /api/orders` | In-room dining orders |
| `GET/POST /api/guest-bookings` | OTA booking inbox |
| `GET/POST /api/messages` | Internal staff messages |
| `GET/POST /api/employees` | Staff roster management |
| `GET/PUT /api/content` | Site Editor overrides (text, media, theme) |
| `GET/POST /api/v1/ota-sync` | OTA webhook intake |
| `GET /health` | Liveness probe |

**Running locally:**

```bash
cd backend
DATABASE_URL=postgres://... node server.js
```

`migrate.js` runs automatically on startup — it creates all tables and seeds
bcrypt-hashed demo accounts (`admin`/`admin123`, `staff`/`staff123`) plus 8
demo guest bookings.

**Every frontend module is API-first with localStorage fallback** — the public
website, guest portal, staff console, Site Editor, and OTA inbox all work
offline/locally without the backend; they sync to Postgres when the API is
reachable.
