# J Park Hotel Website

A multilingual hotel website for **J Park Hotel · Chonburi, Thailand**. The public
site is static (no build step — `index.html` opens straight in a browser); a small
Node/Express + Postgres API backs the staff console, guest portal and OTA intake.

---

## Project status (current stage)

**Live in production.** The public site is served by **GitHub Pages**
(`https://shukize.github.io/jpark/`); the API runs on **Render Starter**
(`https://jpark.onrender.com`) against a **Neon** Postgres database, with
transactional email through **Resend**. Auth is a real server-side trust boundary
(HS256 JWT; the server rejects forged/`alg:none` tokens). Every frontend module is
**API-first with a localStorage fallback**, so the site keeps working offline.

| Area | State |
|------|-------|
| Public website (5 languages, rooms, dining, facilities, gallery) | ✅ Live |
| Guest portal, live chat, staff/admin console, internal messaging | ✅ Live |
| Site Editor (admin CMS: text, photos, colours, sections) | ✅ Live |
| Photos | ✅ Original curated marketing set — one folder per room/area under `images/` |
| OTA booking intake → Guest Booking inbox + hotel-notice email | ✅ Built (channel webhook, email-forwarding bridge, browser API) |
| Transactional email delivery | ⚠️ Needs `RESEND_API_KEY` set in Render + a verified sending domain |
| Custom domain `jparkhotelchonburi.com` | ⏳ Code is domain-ready; registration + DNS + `CNAME` pending |

**Operator to-dos that are not code** (dashboard / DNS): set `RESEND_API_KEY` and
`OTA_WEBHOOK_SECRET` in Render, verify a Resend sending domain, register the domain
and point DNS, then rotate the `admin/admin123` demo password. See the
[Custom domain](#custom-domain--final-go-live-steps) and
[OTA email forwarding](#-ota-email-forwarding-make-real-bookings-flow-in) sections.

---

## Features

- 5 languages: Thai · English · Japanese · Simplified Chinese · Traditional Chinese
- Guest portal: service requests, in-room dining, live request tracker
- Live chat (guest ↔ front desk, localStorage-based)
- Staff & admin console (`staff.html`) with internal messaging and a team status board
- **Site Editor (admin)** — a streamlined, tabbed CMS that edits **every** piece of public text and **every** photo in **every** section:
  - **Website text** — edit any string per language; one edit **auto-translates into the other four languages** so they stay in sync. Every field shows a **plain-language location** (e.g. "📍 Rooms › Grand Suite Name") so you always know where the text lives, and **View on site ↗** opens the homepage straight to that spot — the brand intro is skipped and the exact text (or whole section) is highlighted with a "here's what you're editing" banner.
  - **Photos & videos** — add, replace, reorder (◀ ▶) and remove the photos in any section (hero, about, rooms, dining, facilities, pool, gym, gallery…). Current photos are shown.
  - **Colours**, **show/hide sections**, **announcement banner**
  - **Previous edits** — an audit log of who changed what and when
- **Self-service staff login** — Forgot Password, Forgot Username, and New Staff Account flows
- **Guest Booking inbox** — OTA reservations (Agoda, Booking.com, Airbnb, Trip.com…) land in Messages, auto-translated
- **Password Reset Requests** inbox for admins
- **Message actions** — Reply, Forward, Star, **Delete** and **Report** on every internal message; Star, Forward and **Delete** (admin) on booking confirmations; a **Starred** folder (⭐) collects starred items across both inboxes; reported messages are flagged for admin review
- **Auto shift status** — each employee's on-shift / off-shift state updates automatically from their shift field and the current ICT clock (no manual toggling needed); `on_break` remains a manual state
- **Daily demo refresh** — guest booking timestamps reset at **04:00 AM ICT** every day so the demo inbox always shows relative times ("26 min ago", "3 hr ago") rather than stale dates
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
| **Website text** | Pick the editing language, search or browse grouped sections, and edit any string. Each field is labelled with its **plain-language location** ("📍 Rooms › Grand Suite Name") and keeps the raw key as a tooltip, so you always know what you're editing. Saving **auto-translates** the change into the other four languages via the live translation service so all languages match (you can still hand-edit any language). Click a group thumbnail, or a field's **View on site ↗**, to open that spot on the live site — the brand intro is skipped and the text (or the whole section) is highlighted with a banner so you see it instantly. |
| **Photos & videos** | Open any section to **add / replace / reorder / remove** its photos. Uploads (≤ 4 MB, stored as data URLs) or pasted image/video links. The current photos are shown so you always see what's live. |
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

**Yes — the intake is built end-to-end and there is now a live server.** A booking
can arrive three ways, all landing in **Messages → Guest Booking** (and, when email
is configured, sending a hotel-notice + guest confirmation):

1. **Forwarded OTA email** → `POST /api/v1/ota-email` parses it (see
   [OTA email forwarding](#-ota-email-forwarding-make-real-bookings-flow-in)).
2. **Channel-manager webhook** → `POST /api/v1/ota-sync` (structured JSON, assigns a
   physical room and refuses double-bookings).
3. **Browser API / deep link** → `JPark.bookings.ingest(...)` or
   `staff.html#booking=…` (handy for testing; persists to the backend when reachable).

You can confirm the browser path right now: open `staff.html`, sign in, open the
console and run the `JPark.bookings.ingest({…})` example below — the booking appears
immediately. Four demo bookings are seeded so the inbox is populated out of the box.

**What still needs an operator step:** an OTA can't reach the server on its own — it
delivers by email or webhook. So you connect **one always-on receiver** (an email
forwarder or a channel manager) that calls one of the endpoints above. The seam is
ready and verified; it just needs to be pointed at your reservations inbox. Set
`RESEND_API_KEY` in Render to turn on the notice/confirmation emails (without it the
booking still lands in the inbox; the email is just skipped).

### How a booking gets in

The simplest production path is the **email bridge**: an auto-forward rule on the
hotel's reservations inbox sends each OTA confirmation to a receiver that POSTs it to
`/api/v1/ota-email`. For testing or a webhook handler that has the page open, you can
also push a booking straight into the browser intake seam in `assets/js/bookings.js`:

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

### ⚡ OTA email forwarding (make real bookings flow in)

Every OTA emails the hotel a confirmation. The backend now has a **bridge that turns
that forwarded email into a booking** in the Guest Booking inbox — and fires the
hotel-notice email — automatically:

```
POST  https://jpark.onrender.com/api/v1/ota-email
Auth:  X-API-Key: <OTA_WEBHOOK_SECRET>     (or append ?key=<secret> to the URL)
Body:  { "subject": "...", "from": "...", "text": "...", "html": "..." }
```

It auto-detects the channel (Agoda / Booking.com / Airbnb / Trip.com / Expedia),
and best-effort extracts the guest, reference, dates, room, occupancy and total.
**The full raw email is always stored on the booking**, so even if a field can't be
read the front desk never loses a reservation — they read the original in the inbox
and correct any blanks (such bookings are flagged *needs review*). Re-forwarding the
same email is idempotent (de-duplicated on the OTA reference, or a stable hash when
none is present). Parsing is covered by `backend/test-ota-email.js` (`node test-ota-email.js`).

> 📒 **Ready-to-use receiver setups are saved in
> [`docs/OTA_EMAIL_BRIDGE.md`](docs/OTA_EMAIL_BRIDGE.md)** — a copy-paste Gmail
> Apps Script ([`tools/ota-gmail-forwarder.gs`](tools/ota-gmail-forwarder.gs),
> works today) and a Cloudflare Email Worker
> ([`tools/ota-cloudflare-email-worker.js`](tools/ota-cloudflare-email-worker.js),
> the free production receiver for `jparkhotel.com`).

**To wire it up, pick one always-on receiver that forwards the OTA email here** —
all free or low-cost:

1. **Cloudflare Email Routing + an Email Worker** *(recommended once the domain is on
   Cloudflare)* — a few lines of Worker code POST the message JSON to the endpoint.
2. **Email Parser by Zapier / Make / Mailparser** — no code: forward OTA mail to the
   parser address, map fields, POST to the endpoint.
3. **SendGrid / Mailgun Inbound Parse** — point an MX subdomain at the service and it
   POSTs each inbound email to the endpoint.

Then add a **Gmail/Outlook auto-forward rule** on the reservations inbox
(`jparkhotel1@gmail.com`) so every Agoda/Booking.com/Airbnb confirmation is forwarded
to that receiver. That's the whole pipeline: **OTA → hotel inbox → receiver → website
Guest Booking inbox + notice email.**

> **Two things must be set for delivery to work** (dashboard, not code):
> `RESEND_API_KEY` in Render (otherwise the notice email is skipped — the booking
> still lands in the inbox), and `OTA_WEBHOOK_SECRET` in Render so the endpoint only
> accepts your receiver. Until a Resend **sending domain is verified**, mail only
> delivers to the Resend account owner.

#### A note on reliability (for a 4–5★ operation)

Email parsing is pragmatic and works today, but OTAs change their templates and an
email alone can't prevent an **overbooking**. The production-grade path is a **channel
manager** (Cloudbeds, Hostaway, Beds24, SiteMinder, RMS…) connected to your OTAs: it
syncs availability/rates both ways and POSTs clean, structured reservations to the
already-built `POST /api/v1/ota-sync` webhook (which also assigns a physical room and
refuses double-bookings). Recommended once volume justifies the monthly fee — run the
email bridge now, move to a channel manager as you scale.

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

## Team Status board — auto shift status

Each employee card shows a live on-shift / off-shift status derived from their **shift** field (`HH:MM–HH:MM`) and the current **Indochina Time (ICT, UTC+7)** clock:

| Shift example | Current ICT time | Auto status |
|--------------|------------------|-------------|
| `07:00–15:00` | 10:30 | **on_shift** |
| `07:00–15:00` | 18:00 | **off_shift** |
| `23:00–07:00` | 01:00 | **on_shift** (overnight) |
| `23:00–07:00` | 12:00 | **off_shift** (overnight) |

- Status re-evaluates **every 60 seconds** — the board transitions automatically when the clock crosses a shift boundary.
- `on_break` is the only **manual** state; it is never overridden by the clock. Set it in the edit panel and it stays until the admin changes it.
- When the backend API is reachable, the board uses the live roster; when offline, it uses the last-cached roster. Auto status is applied in both cases.

---

## Messages — Reply, Forward, Star, Delete and Report

Every internal message and OTA booking confirmation has action buttons at the bottom of its detail view:

| Action | Internal messages | Booking confirmations |
|--------|------------------|-----------------------|
| **↩ Reply** | Opens Compose pre-filled with the sender as recipient and `Re:` subject | — (not shown; can't reply to an OTA) |
| **↪ Forward** | Opens Compose with `Fwd:` subject and the original body quoted | Opens Compose with the booking fields + confirmation text quoted |
| **☆ Star** | Toggles a gold star on the message | Toggles a gold star on the booking |
| **⚑ Report** | Flags the message for admin review (available to recipients, not the sender). Reported messages show an orange ⚑ flag in the inbox list for admins. | — (not applicable to OTA bookings) |
| **🗑 Delete** | Admin: deletes any message. Sender: deletes their own messages. Prompts for confirmation. | Admin only; prompts for confirmation. |

Starred items appear in the **⭐ Starred** folder in the messages sidebar, showing messages and bookings interleaved by date. The folder badge shows the total count. Stars persist in `localStorage` and survive page reloads.

Reported messages are visible to admin in the inbox list with an orange flag next to the timestamp. A recipient can only report a message once; the button changes to "Already reported" after the first report. Admins can see report flags but the report state is informational only — there is no separate "Reported" folder.

---

## Daily demo data refresh

The four demo guest bookings use **relative timestamps** (26 min ago, 3 hr ago, 20 hr ago, 30 hr ago). To keep the demo inbox feeling current, `store.js` schedules a daily reset:

- **Trigger time:** 04:00 AM ICT (= 21:00 UTC the prior calendar day)
- **What it does:** re-stamps each seed booking's `createdAt` to `now − original_offset`, so "26 minutes ago" stays 26 minutes ago regardless of when the browser was last opened
- **First-load catch-up:** if the page opens after 04:00 ICT and the refresh hasn't run yet today, it runs immediately on load
- **Tracked via:** `localStorage["jpark.lastFallbackRefresh"]` (ICT date string)

This is a demo convenience only; real deployments get live timestamps from the OTA bridge / backend.

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

**Production hosting (Option B, ~$7/mo):**

| Layer | Host | Cost |
|-------|------|------|
| Frontend (static site) | GitHub Pages (`.github/workflows/deploy.yml`) | Free |
| Database (Postgres) | [Neon](https://neon.tech) — durable free tier | Free |
| API (this service) | Render **Starter** plan — always-on, no cold start | ~$7/mo |
| Transactional email | [Resend](https://resend.com) free tier (~3k/mo) | Free |

Set these in the Render dashboard (Environment tab — all are `sync:false` in
[`render.yaml`](render.yaml), so they are never committed):

- `DATABASE_URL` — the Neon connection string
- `OTA_WEBHOOK_SECRET` — shared secret for the OTA channel-manager webhook
- `AUTH_TOKEN_SECRET` — server-side JWT signing secret (long random string)
- `RESEND_API_KEY` — Resend API key (`re_…`); leave blank to disable email
- `EMAIL_FROM` — sender, e.g. `J Park Hotel <onboarding@resend.dev>` until you
  verify your own domain in Resend

| Route | Purpose |
|-------|---------|
| `POST /api/auth/login` | Staff/admin login — returns a signed JWT |
| `POST /api/auth/register` | New staff account self-activation |
| `GET/POST /api/service-requests` | Guest service requests |
| `GET/POST /api/chat` | Live chat messages |
| `GET/POST /api/orders` | In-room dining orders |
| `GET/POST /api/guest-bookings` | OTA booking inbox |
| `GET/POST /api/messages` | Internal staff messages |
| `PATCH /api/messages/:id/report` | Flag a message as reported by a user |
| `DELETE /api/messages/:id` | Delete a message (admin only) |
| `GET/POST /api/employees` | Staff roster management |
| `GET/PUT /api/content` | Site Editor overrides (text, media, theme) |
| `POST /api/v1/ota-sync` | OTA / channel-manager webhook intake (structured JSON, assigns a room) |
| `POST /api/v1/ota-email` | OTA **email-forwarding** bridge — parses a forwarded confirmation email into the Guest Booking inbox |
| `POST /api/email` | Send transactional email (Resend); `GET /api/email/status` reports if configured |
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

---

## Custom domain — final go-live steps

The code is already **domain-ready** for the chosen primary domain
`jparkhotelchonburi.com` (no code change needed to switch over):

- [`assets/js/config.js`](assets/js/config.js) routes the apex and `www` of the
  domain to the Render API (`https://jpark.onrender.com`).
- [`render.yaml`](render.yaml) already lists both `https://jparkhotelchonburi.com`
  and `https://www.jparkhotelchonburi.com` in the `FRONTEND_ORIGIN` CORS allowlist.
- **No `CNAME` file is committed** — that is intentional. Adding it before DNS
  resolves would break the live GitHub Pages site.

Once the domain is registered (Cloudflare Registrar or Porkbun, ~$10–13/yr), do
these **manual** steps to finish the plan:

1. **DNS** — at the registrar add four apex `A` records → `185.199.108.153`,
   `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, plus a `www`
   `CNAME` → `shukize.github.io`.
2. **Wait for DNS** — confirm with `nslookup jparkhotelchonburi.com` returning a
   `185.199.x.x` address before the next step.
3. **GitHub Pages** — repo → Settings → Pages → Custom domain →
   `jparkhotelchonburi.com` → Save. GitHub writes the `CNAME` file and issues
   HTTPS via Let's Encrypt (~15 min).
4. **Render** — re-sync the blueprint (or confirm the dashboard env), then set
   `RESEND_API_KEY` and, after verifying the domain in Resend, update
   `EMAIL_FROM` to `J Park Hotel <noreply@jparkhotelchonburi.com>`.

After step 3 the site is live on the custom domain; the API, CORS allowlist and
email all follow automatically from the config above.
