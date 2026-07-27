# J Park Hotel Website

A multilingual hotel website for **J Park Hotel · Chonburi, Thailand**. The public
site is static (no build step — `index.html` opens straight in a browser); a small
Node/Express + Postgres API backs the staff console, guest portal and OTA intake.

---

## Project status (current stage)

**Live in production.** The public site is served by **GitHub Pages**
(`https://jparkhotel.com`, custom domain; `https://shukize.github.io/jpark/` also
resolves); the API runs on **Render Starter** (`https://jpark.onrender.com`)
against a **Neon** Postgres database, with transactional email through
**Resend**. Auth is a real server-side trust boundary (HS256 JWT; the server
rejects forged/`alg:none` tokens). Every frontend module is **API-first with a
localStorage fallback**, so the site keeps working offline.

| Area | State |
|------|-------|
| Public website (5 languages, rooms, dining, facilities, gallery) | ✅ Live |
| Guest portal, live chat, staff/admin console, internal messaging | ✅ Live |
| Site Editor (admin CMS: text, photos, colours, sections) | ✅ Live |
| Photos | ✅ Original curated marketing set — one folder per room/area under `images/` |
| OTA booking intake → Guest Booking inbox + hotel-notice email | ✅ Built (channel webhook, email-forwarding bridge, browser API) |
| **In-site online booking** (pay at check-in, or online now by card/PromptPay) | ✅ Live, see [Online booking & payments](#online-booking--payments) |
| Transactional email delivery | ✅ `RESEND_API_KEY` set, sending domain verified, `EMAIL_FROM` on `jparkhotel.com` |
| Custom domain `jparkhotel.com` | ✅ DNS live at Porkbun, GitHub Pages custom domain + HTTPS active |

**Operator to-dos that are not code:** confirm the DNS/HTTPS cutover has fully
propagated everywhere (`nslookup jparkhotel.com`, or [whatsmydns.net](https://www.whatsmydns.net)
from a network/device that doesn't already resolve it), and confirm any retired
Render services (the old `jpark-site` static mirror, the free `jpark-db`) are
actually deleted in the Render dashboard.
Default staff credentials no longer need manual rotation — see
[Staff accounts & passwords](#staff-accounts--passwords). See also
[OTA email forwarding](#-ota-email-forwarding-make-real-bookings-flow-in) below.

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
- **Online booking, no online payment** (`booking.html`) — guests pick a room and enter their details; the reservation is confirmed immediately and emailed with a balance due. **No payment is ever collected online** — the guest pays in person at check-in by cash, credit/debit card, or PromptPay QR at the front desk, where staff also assign the guest's physical room number. A 200 THB key-card deposit (cash only, at check-in) is stated up front and in the confirmation email — see [Online booking & payments](#online-booking--payments)
- **Guest Booking inbox** — OTA reservations (Agoda, Booking.com, Airbnb, Trip.com…) *and* direct website bookings land in Messages, auto-translated, with a payment status badge on direct bookings
- **Password Reset Requests** inbox for admins
- **Account Logs (admin)** — a full staff login audit trail: IP, device, geolocated city/country, and a live "online" indicator per session, with per-session sign-out and IP ban/unban/report — see [Session security](#session-security-account-logs-sliding-sessions-ip-bans)
- **Message actions** — Reply, Forward, Star, **Delete** and **Report** on every internal message; Star, Forward and **Delete** (admin) on booking confirmations; a **Starred** folder (⭐) collects starred items across both inboxes; reported messages are flagged for admin review
- **Auto shift status** — each employee's on-shift / off-shift state updates automatically from their shift field and the current ICT clock (no manual toggling needed); `on_break` remains a manual state
- **Daily demo refresh** — guest booking timestamps reset at **04:00 AM ICT** every day so the demo inbox always shows relative times ("26 min ago", "3 hr ago") rather than stale dates
- Mobile / Desktop view toggle

---

## Guest portal login

Guests sign in at `index.html → Guest Services` with the last name + room number
(or booking reference) from their real reservation. Sample seed bookings used
during development are not published here.

### Staff console (`staff.html`)

Credentials are managed under **Staff console → Staff** and rotated per deployment —
no default password is published here. See
[Staff accounts & passwords](#staff-accounts--passwords) below.

---

## Staff accounts & passwords

Admins manage accounts under **Staff console → Staff**.

1. **Admin adds a member** — enter a full name + username and pick a role. No password is set by the admin; new accounts start on the shared temporary password **`jparkhotel`** and are flagged "must change password".
2. **The new member activates their account** — on the login page they choose **New Staff Account**, enter the username the admin gave them and the temporary password `jparkhotel`, then set their own password. They're signed in immediately. (If someone signs in normally while still on the temporary password, they're sent to set a new one too.)
3. **Forgot Password / Forgot Username** — links under the Sign in button file a request that appears in **Messages → Password Reset Requests** (admin-only). For a password request the admin can click **Reset to default password**, which puts the account back on `jparkhotel` and re-flags "must change"; the member then re-runs the New Staff Account flow.

**The two original seed accounts (`admin`, `staff`) self-rotate.** `backend/migrate.js` runs on every server boot and checks whether either account's stored password hash still matches the well-known bootstrap default (published in this repo's source, so it can never be treated as a real secret). If it does, the account is automatically rotated to a fresh random one-time password, flagged "must change password", and the new temporary password is logged **once** to the server's stdout (visible under Render → Logs) — nowhere else. There is no admin UI for this first rotation; it only runs the one time a seed account is still on its bootstrap default.

> Passwords are hashed server-side (bcrypt) in the `employees` table and verified
> by the API on every login — see [Backend](#backend-backend). The browser only
> ever holds a signed JWT, never a password.

---

## Session security (Account Logs, sliding sessions, IP bans)

**Why this exists.** The staff login token used to have a flat 12-hour lifetime, and
when it expired, the browser's only "recovery" was to locally re-sign a new token with
a public placeholder secret — which the hardened production server always rejected
(it only ever trusted tokens signed with the real, server-only `AUTH_TOKEN_SECRET`).
That silent mismatch meant every background poll (bookings, messages, chat — the whole
staff console's live-update loop) started failing with 401s the moment the token
expired, and just quietly stopped syncing — with nothing in the UI to say so — until
whoever was signed in happened to log out and back in. This was caught live: the
Guest Booking inbox stopped reflecting new OTA/direct bookings for two days with no
error shown anywhere, traced back to exactly this.

**What replaced it — a real session model, not just a longer token:**

- **Sliding sessions.** The access token is now short-lived (**15 minutes**) and
  silently refreshes itself via a genuine server round-trip, `POST
  /api/auth/refresh` (`backend/routes/auth.js`), as long as the underlying session is
  still valid — an active shift is never interrupted. Every session still carries a
  hard **7-day absolute cap** from its original login (embedded in the token as
  `absExp`, so no database lookup is needed just to check it); past that, even an
  actively-used session is forced to a real re-login. Crucially, if a refresh is ever
  *rejected* (revoked, banned, or past the cap), the client now drops straight back to
  the login screen instead of failing silently forever — see `assets/js/api.js`'s
  `refreshToken()` and the `jpark:force-logout` event it fires on denial.
- **20 concurrent sessions per staff account.** A 21st simultaneous login (same
  employee, any device) automatically signs the *oldest* still-active session out
  (FIFO), tracked in a new `staff_sessions` table (one row per login: IP, parsed
  device/browser, geolocated city/country, timestamps, and revocation state).
  Sized for shared department accounts signed in on every phone and terminal on
  the floor; override with `MAX_SESSIONS_PER_EMPLOYEE`.
- **Up to 100 staff accounts** (`MAX_STAFF_ACCOUNTS`, enforced on
  `POST /api/auth/register`). Suspended accounts still occupy a place — only
  **Remove** frees one — and the Staff panel shows "*n* of 100 in use" above the
  add form, so hitting the ceiling is a clear message rather than a silent
  failure.
- **Sign-in throttling counts failures, not sign-ins.** The whole property leaves
  through one public IP, so the previous flat "10 login attempts per IP per 10
  minutes" locked the front desk out of its own console partway through a shift
  change. A correct password now costs nothing; wrong ones are budgeted per
  IP+username (10 / 15 min) with a wider per-IP sweep ceiling, so grinding at one
  account from outside can never lock out the staff who actually use it.
- **Account Logs** (staff console → **Account Logs**, admin only) is the audit trail
  for all of the above: every login ever made, a live **blinking green dot** for any
  session that's polled within the last 20 seconds, and dimmed rows for revoked/expired
  sessions showing who revoked them and why (`admin_revoke`, `ip_ban`,
  `concurrency_cap`, or `absolute_expiry`). An admin can:
  - **Sign out** any individual session directly — including their own current one,
    which is flagged "This is you" so it's not an accidental click, but not blocked
    (this is exactly what the existing Sign Out button already does to yourself).
  - **Ban an IP**, which immediately cascade-signs-out every active session from that
    IP and blocks it from logging in again. Bans are deliberately scoped to **the
    staff console only** (`/api/auth`, `/api/sessions`) — never guest-facing routes —
    so a shared/NAT'd IP (hotel WiFi, an office network, a VPN exit node) banned for
    one bad staff-login attempt can never also block a real guest from booking a room
    or using guest chat.
  - **Unban** an IP, or **Report** it — a one-click link-out to
    [AbuseIPDB](https://www.abuseipdb.com)'s report page. There's no real "report an
    IP to Google" API for this, so this points at a real, purpose-built
    abuse-reporting service instead of faking an integration that doesn't exist.
- **Geolocation and device parsing happen server-side, at login only** — a free
  IP-geolocation lookup (`backend/lib/geoIp.js`, `ip-api.com`'s free JSON endpoint,
  2-second timeout, never blocks a login on failure) and a small hand-rolled
  User-Agent parser (`backend/lib/deviceInfo.js`) produce the city/country and
  "Chrome on Windows"-style device summary stored on the session row. No new
  third-party dependency was added for either — both match this backend's existing
  zero-heavy-dependency style (native `fetch`, same as `backend/mailer.js`).
- **Revocation/ban checks are in-memory, not a database query on every request** —
  two small `Set`s (`backend/lib/sessionCache.js`) mirror "which sessions are
  revoked" and "which IPs are banned," updated synchronously in the very request that
  revokes a session or bans an IP (so there's no propagation delay), and rehydrated
  from the database once at server boot (so a restart can never silently "forget" a
  revocation or a ban).

**What this actually protects against, in plain terms:** a stolen access token is
only useful for 15 minutes, not indefinitely. A lost or compromised staff device can
be remotely signed out the moment it's noticed, without needing to rotate every other
staff member's session. A brute-force or abusive login IP can be banned without any
risk of also locking out real hotel guests. And the specific silent-freeze failure
mode that caused the original incident — an expired session just quietly stopping all
syncing, with no indication anywhere — can't happen anymore: a dead session now always
surfaces as a real "please sign in again" screen.

---

## Site Editor (admin)

Open **Staff console → Site Editor**. Everything updates the live public site immediately (text/colour edits apply instantly across open tabs; photo/gallery changes apply on the public page's next load). Tabs:

| Tab | What it does |
|-----|--------------|
| **Website text** | Pick the editing language, search or browse grouped sections, and edit any string. Each field is labelled with its **plain-language location** ("📍 Rooms › Grand Suite Name") and keeps the raw key as a tooltip, so you always know what you're editing. Saving **auto-translates** the change into the other four languages via the live translation service so all languages match (you can still hand-edit any language). Click a group thumbnail, or a field's **View on site ↗**, to open that spot on the live site — the brand intro is skipped and the text (or the whole section) is highlighted with a banner so you see it instantly. |
| **Photos & videos** | Open any section to **add / replace / reorder / remove** its photos. Uploads (≤ 4 MB, stored as data URLs) or pasted image/video links. The current photos are shown so you always see what's live. |
| **Colours** | Recolour the whole site (primary / accent / gold). |
| **Rates** | Edit room-only and room-with-breakfast prices per room type and bed configuration, the 3rd-guest surcharges, and **Day Use (3-hour stay) prices**. Unlike every other tab, this is **not** cosmetic: Save writes straight to the database (`GET`/`PUT /api/rates`) and is used immediately to compute real guest charges (`backend/routes/payments.js` via `backend/lib/rateOverrides.js`). There is no "Undo all my edits" for rates — check a number before saving. |
| **Sections** | Show/hide whole sections, toggle **per-room-type availability** (see below), post an announcement banner, "Undo all my edits", and "Reset all demo data". |
| **Previous edits** | Audit log of every change — who, what and when (newest first). |

Website text, photo/gallery and colour edits are stored in the `content` table in `localStorage`: text in `content.overrides[lang][key]`, photos in `content.media[setId]`, plus `content.theme`, `content.hidden` and `content.editLog`. **Undo all my edits** clears them and restores the shipped defaults for those tabs. Auto-translation needs an internet connection; if it's unavailable the other languages keep their current text and can be edited by hand.

**Room rates and room availability are the two exceptions.** Rates live in a dedicated `rates` column on the server's `site_content` table, not in `localStorage` — edits are saved via `PUT /api/rates` (admin-only, validated against the known room/variant list and a sane price range) and read back via `GET /api/rates`, which both `booking.html` and the Rates tab use so the displayed price always matches what a guest is actually charged. Room availability works the same way, in its own `unavailable_rooms` column: the **Sections** tab's "Room availability" card shows one checkbox per room type (source of truth: `GET /api/availability`'s `rooms` list, not a hardcoded copy) and saves each toggle immediately via `PUT /api/availability` — no batch "Save" button, matching the Rates tab's real-time-save UX. A delisted room is removed from both the homepage grid (`assets/js/cms.js`) and booking search results (`assets/js/booking-page.js`, which also drops just the Single or Twin side of a merged bed-type card if only one is delisted) — not merely hidden with CSS, a guest can't find or book it via any path. Both are unaffected by "Undo all my edits."

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

> 📒 **The permanent receiver is a ready-to-use Gmail Apps Script**, saved in
> [`docs/OTA_EMAIL_BRIDGE.md`](docs/OTA_EMAIL_BRIDGE.md) and
> [`tools/ota-gmail-forwarder.gs`](tools/ota-gmail-forwarder.gs) — installed and
> verified live on `jparkhotel1@gmail.com` (a 5-minute trigger scans for new OTA
> mail and POSTs each one here). A Cloudflare Email Worker was considered
> instead, but `jparkhotel.com`'s DNS stays at Porkbun (not Cloudflare) by
> choice, so the Gmail script is the permanent receiver, not an interim one.

**To wire it up, pick one always-on receiver that forwards the OTA email here** —
all free or low-cost:

1. **Gmail auto-forward + Apps Script** *(what this site actually runs)* — see above.
2. **Email Parser by Zapier / Make / Mailparser** — no code: forward OTA mail to the
   parser address, map fields, POST to the endpoint.
3. **SendGrid / Mailgun Inbound Parse** — point an MX subdomain at the service and it
   POSTs each inbound email to the endpoint.

Then add a **Gmail/Outlook auto-forward rule** on the reservations inbox
(`jparkhotel1@gmail.com`) so every Agoda/Booking.com/Airbnb confirmation is forwarded
to that receiver. That's the whole pipeline: **OTA → hotel inbox → receiver → website
Guest Booking inbox + notice email.**

> **Both are already set in production**: `RESEND_API_KEY` (email delivery — the
> Resend sending domain is verified, so mail delivers to real recipients, not just
> the account owner) and `OTA_WEBHOOK_SECRET` (the server now refuses to boot in
> production without it, since it gates this endpoint and `/api/guest-bookings`
> against unauthenticated requests).

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

## Online booking & payments

`booking.html` is a full, streamlined booking flow, not just a rate browser:
guest picks dates/room on the page → taps **Book Now** → enters guest details
→ chooses how to pay → gets an instant on-screen + emailed confirmation. The
reservation is confirmed immediately regardless of payment choice (it holds
the room-type inventory the same way any booking would). Payment is a
**hybrid, per-booking choice**: the guest settles the balance in person at
check-in by **cash, credit/debit card, or PromptPay QR** at the front desk
(the default, and the only option until the hotel's Omise account is live —
see `docs/PAYMENTS_SETUP.md`), or pays online now by **card or PromptPay QR**
via Omise/Opn Payments. A **200 THB key-card deposit — cash, or (Thai guests
only) a national ID card or driving license left instead — collected at
check-in and refunded/returned at check-out**, is called out in the
confirmation step (with its own required acknowledgement checkbox) and in
every booking-confirmation email (OTA and direct alike); it's a separate,
unrelated line item from the room balance, still owed in person even when
the room total was paid online.

- The server, never the browser, computes the authoritative price
  (`backend/lib/rateOverrides.js`, merging the static base rates in
  `backend/lib/roomRates.js` with any live admin edits from the Site
  Editor's **Rates** tab) — the client only says which room/dates it wants.
- **3rd-guest surcharges**: every room's `room`/`bf` rate covers its base
  occupancy (1 guest for a Single/1-Bedroom variant, 2 for a Twin/Double/
  2-Bedroom variant). A 3rd guest adds a flat **+190 THB/night** breakfast
  surcharge when breakfast is selected, and — for rooms that can physically
  fit one (`extraBedAvailable: true`) — a flat **+500 THB/night** rollaway
  bed surcharge. Corner Suite and both Prestige rooms can't fit an extra bed
  (`extraBedAvailable: false`) but can still take a 3rd guest for the
  breakfast surcharge only. Both amounts are admin-editable in the Site
  Editor's Rates tab ("3rd guest surcharges") and applied identically on the
  server (`backend/lib/rateOverrides.js`'s `computeGuestSurcharge()`) and the
  client display (`window.JPark.pricing` in `assets/js/booking-page.js`).
- An **overbooking guard**: a room count per type is checked against confirmed
  + in-progress bookings for the requested dates. The count is admin-editable
  in the Site Editor's Sections tab ("How many rooms") — stored in
  `site_content.room_inventory`, written by `routes/availability.js` and merged
  over the static fallback (`ROOM_INVENTORY` in `roomRates.js`, the real counts
  the owner gave on 2026-07-24) by `rateOverrides.getEffectiveInventoryMap()`,
  which every guard reads. Nobody adjusts it as guests come and go: the count
  is the hotel's TOTAL, and availability is derived per date from the bookings
  themselves, so a stay occupies a room only for the nights it spans and
  releases it on check-out or cancellation. Two room families need a pooled
  count rather than a plain
  per-key one: Studio/Prestige/Premium's Single vs. Twin labels are a bed-
  configuration choice sharing ONE physical pool of rooms (see
  `getInventoryPoolRooms()`/`getInventoryPoolKey()` in `roomRates.js`, used
  by every availability check and advisory lock so a Single and a Twin
  booking for the same dates correctly draw from the same pool); Executive
  Suite and Grand Suite's 1-bedroom vs. 2-bedroom layouts share one room key
  with two variants, so their per-layout counts are combined into a single
  pool sized at the sum (the guard can't yet reserve one layout's count
  separately from the other's).
- Submitting the reservation form (`assets/js/booking-payment.js`) posts to
  `POST /api/v1/reservations`, which holds the room (overlap/inventory
  guard), then either charges the guest online (Omise — see below) or
  inserts an already-`confirmed` row with `payment_provider: 'in_person'` /
  `payment_method: 'pay_at_checkin'` / `payment_status: 'pending'`, and
  immediately emails both the front desk and the guest — the guest email
  shows whichever payment outcome actually applies (balance due at
  check-in, paid online, or PromptPay awaiting confirmation). Confirmed
  bookings land in the same `guest_bookings` table and the same staff
  **Guest Booking** inbox as OTA reservations, with a `channel: "direct"`
  and a payment status badge (e.g. "Pay at check-in — Awaiting payment", or
  "✓ PAID ONLINE — Card — 4,500 THB" for an online charge).
- **The inbox is a worklist, not just a log.** The filter tabs carry live counts
  (`All (7) · Needs action (4) · Confirmed (5) · Cancelled (1) · Resent (0)`), and
  **Needs action** collects what a shift actually has to finish: a room still to
  assign for someone arriving today or tomorrow, a payment not recorded once the
  guest is due, an online payment the guest never completed, a day-use request
  awaiting confirmation, or a booking flagged *Needs review*. Soonest arrival
  sorts first. The ordinary pay-at-check-in balance is deliberately **not** a
  reason — this property takes payment at check-in by default, so counting it
  would put nearly every future booking in the tab and make it worthless.
  It replaced a raw *Pending* status tab which, because every website room
  booking is written straight to `confirmed`, only ever held day-use requests and
  so read as permanently broken. Each row shows the same state as pills (`✓ ROOM`,
  `— PAID`, `⏳ CONFIRM`), red once the item is actually due.
  See `bookingActionReasons()` in `assets/js/staff.js`.
- **Front-desk check-in, in the staff console:** opening a direct booking in
  the Guest Booking inbox shows a room-number field (staff type in the
  physical room assigned). For a pay-at-checkin booking, a payment-method
  selector (Cash / Card / PromptPay in person) with a "Mark payment
  received" button records it — both PATCH `/api/guest-bookings/:id`
  (`assets/js/staff.js`). A booking already paid online instead shows a
  read-only paid summary (with an "(online)" qualifier to distinguish it
  from a front-desk-recorded card payment) — there's nothing left to record.
- **Online payment (Omise/Opn Payments — card + PromptPay QR):** optional,
  hybrid alongside pay-at-checkin, and only appears once
  `GET /api/v1/payments/config` reports it's configured (i.e. the hotel has
  a live Omise account — see `docs/PAYMENTS_SETUP.md`). The server always
  computes the amount charged (`computeTotal()`/`validateAndPriceRoom()` in
  `backend/routes/payments.js`) — never a client-supplied figure. A card
  charge is tokenized client-side via Omise.js (the raw card number never
  reaches this server) and resolves synchronously — declined means no
  booking row is ever written. A PromptPay charge stays asynchronous: the
  booking is inserted `payment_status: 'pending'` immediately (it's
  confirmed either way), the guest sees a QR + a live poll, and
  `POST /api/v1/payments/webhook` flips it to `'paid'` once Omise confirms
  the scan — re-verifying the charge against Omise's own API first, since
  webhook bodies aren't signed. A multi-room group booking is charged
  **once** for the whole cart's grand total, sharing one `payment_charge_id`
  across every room in the group, so the webhook updates all of them
  together. Both the guest and the hotel (`jparkhotel1@gmail.com`) get a
  follow-up "payment confirmed" email once a pending PromptPay charge
  resolves, so nobody has to notice the status change themselves.
- **Day-use (3-hour) stays are bookable, not just informational.** A gold
  banner near the top of `booking.html` ("Only need a few hours?") links
  down to the Day Use Rates section, and each rate row has its own **Book**
  button (`assets/js/booking-page.js`'s `renderDayUse()`). It opens a small,
  dedicated flow (`assets/js/booking-payment.js`'s `openDayUse()`) — a
  preferred date + free-text preferred time and guest details — that posts
  to `POST /api/v1/payments/dayuse-booking`. This always stays `pending`
  (regardless of the reservation flow above) since a day-use slot always
  needs front-desk confirmation of the exact time; it deliberately skips the
  overlap/inventory guard for the same reason. Payment is likewise in person
  once the time slot is confirmed. Day-use prices are admin-editable in the
  Site Editor's **Rates** tab, the same way overnight rates are
  (`backend/lib/rateOverrides.js`'s `getEffectiveDayUsePrice()`).

### Online payment go-live status

The online-payment code above shipped 2026-07-24, restoring and extending an
earlier Omise/Opn integration (PromptPay-only) that had been fully removed
15 days prior at the owner's request, then reinstated once the client asked
for online payment back — this time also adding card support and the
multi-room group-cart charging the original version never had to handle.
**The hotel does not yet have a live Omise/Opn account** — see
`docs/PAYMENTS_SETUP.md` for the signup walkthrough (business KYC + Thai
bank settlement), Test Mode verification steps, and the go-live cutover
checklist. Until that account exists and its keys are set (`OMISE_PUBLIC_KEY`
/ `OMISE_SECRET_KEY` in the Render dashboard, per `render.yaml`), the booking
page shows pay-at-checkin only, with zero visible change to guests.

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
  overrides:        { en: { "hero.title": "…" }, th: {…}, … },  // text, per language
  media:            { "room:Superior Room": [ {src,video}, … ], … },  // photo sets
  theme:            { teal, terracotta, gold },
  hidden:           { rooms: true, … },                    // hidden sections
  editLog:          [ { ts, userName, type, … } ],         // Previous edits
  unavailableRooms: [ "Deluxe", … ]                        // read-only cache of GET /api/availability
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

**Security hardening (2026-07-07):** the server now fails closed at boot in
production if either `AUTH_TOKEN_SECRET` or `OTA_WEBHOOK_SECRET` is unset —
both gate real trust boundaries (forging staff tokens / spamming the OTA
booking-ingest endpoints). Request bodies are capped per route
(`backend/server.js`) instead of one blanket 4MB limit — 4MB only for the
Site Editor's image uploads, smaller caps everywhere else. `POST
/api/guest-bookings` and `POST /api/v1/ota-email` are rate-limited (120
req/10min per IP — generous enough for the Gmail-forwarder bridge's backlog
bursts) via the shared `backend/lib/rateLimit.js`, matching the existing
payments rate limiter. The Neon Postgres connection (`backend/db.js`) now
verifies its TLS certificate (`rejectUnauthorized: true`) instead of
accepting any certificate. `render.yaml`'s `buildCommand` now runs
`npm test` (the self-contained `backend/test-ota-email.js` parser suite)
before deploying, and `.github/workflows/deploy.yml` runs `node --check` on
every file in `assets/js/` before publishing to Pages — so a syntax error or
a broken OTA parser can no longer reach production.

**Session security overhaul (follow-on release):** replaced the flat 12-hour staff
login token with a real session model — short-lived (15-minute) access tokens that
silently refresh via `POST /api/auth/refresh`, a hard 7-day absolute cap per session, a
concurrent-sessions-per-account limit (oldest evicted first; 20 as of the
capacity release below), server-side IP
geolocation + device parsing at login, an in-memory revocation/ban cache
(`backend/lib/sessionCache.js`), and the new admin-only **Account Logs** panel/API
(`backend/routes/sessions.js`) for session sign-out and IP ban/unban. Full writeup in
[Session security](#session-security-account-logs-sliding-sessions-ip-bans) above —
this closed a real incident where an expired token silently froze the entire staff
console (no visible error) until someone happened to log back in.

| Route | Purpose |
|-------|---------|
| `POST /api/auth/login` | Staff/admin login — creates a session row (IP/device/geo) and returns a signed, short-lived (15 min) JWT |
| `POST /api/auth/refresh` | Silently renews the current session's access token (same session, new 15 min token) — rejected with `forceLogout:true` if the session is revoked, banned, or past its 7-day cap |
| `POST /api/auth/register` | New staff account self-activation |
| `GET /api/sessions` | Admin only — every staff login (Account Logs), with a live "online" flag |
| `POST /api/sessions/:jti/revoke` | Admin only — sign out one specific session |
| `GET /api/sessions/banned-ips` | Admin only — list currently banned IPs |
| `POST /api/sessions/ban` \| `/unban` | Admin only — ban/unban an IP (ban cascade-revokes its active sessions); scoped to `/api/auth` + `/api/sessions` only, never guest-facing routes |
| `GET/POST /api/service-requests` | Guest service requests |
| `GET/POST /api/chat` | Live chat messages |
| `GET/POST /api/orders` | In-room dining orders |
| `GET/POST /api/guest-bookings` | OTA booking inbox |
| `GET/POST /api/messages` | Internal staff messages |
| `PATCH /api/messages/:id/report` | Flag a message as reported by a user |
| `DELETE /api/messages/:id` | Delete a message (admin only) |
| `GET/POST /api/employees` | Staff roster management |
| `GET/PUT /api/content` | Site Editor overrides (text, media, theme) |
| `GET/PUT /api/rates` | Site Editor **Rates** tab — live room-rate, surcharge and Day Use overrides; `GET` is public (read by `booking.html` too), `PUT` is admin-only and validated (see [`backend/routes/rates.js`](backend/routes/rates.js)) |
| `GET/PUT /api/availability` | Site Editor **Sections → Room availability** — the list of delisted room types; `GET` is public (read by `index.html`/`booking.html`/the Site Editor, returns `{unavailable, rooms}`), `PUT` is admin-only and validated against the known room list (see [`backend/routes/availability.js`](backend/routes/availability.js)) |
| `POST /api/v1/reservations` | Creates an immediately-*confirmed* direct booking — holds the room-type inventory, and either takes an online payment (Omise) or records pay-at-checkin, whichever the guest chose (see [Online booking & payments](#online-booking--payments)) |
| `POST /api/v1/reservations/group` | Same as above for a multi-room booking — one guest, several rooms, one `group_ref`, charged once for the whole cart's grand total when paid online |
| `GET /api/v1/payments/config` | Tells the booking page whether online payment is currently available (`{ publicKey, paymentEnabled }`) |
| `GET /api/v1/payments/status/:id` | Polled by the booking page while a PromptPay charge is awaiting the guest's scan |
| `POST /api/v1/payments/webhook` | Omise event receiver — confirms a PromptPay charge once paid (re-verified against Omise's own API, never trusting the webhook body) |
| `POST /api/v1/payments/dayuse-booking` | Requests a 3-hour day-use session (flat rate) — records a *pending* booking; never runs the overlap/inventory guard since a day-use slot is always confirmed by staff; payment stays in-person only |
| `POST /api/v1/ota-sync` | OTA / channel-manager webhook intake (structured JSON, assigns a room) |
| `POST /api/v1/ota-email` | OTA **email-forwarding** bridge — parses a forwarded confirmation email into the Guest Booking inbox |
| `GET /api/v1/booking-availability` | Remaining room count per type for a date range (overbooking guard) |
| `PATCH /api/guest-bookings/:id` | Staff-only: mark read, assign a physical room number, or record in-person payment (cash/card/PromptPay) received at check-in |
| `POST /api/email` | Send transactional email (Resend); `GET /api/email/status` reports if configured |
| `GET /health` | Liveness probe |

**Running locally:**

```bash
cd backend
DATABASE_URL=postgres://... node server.js
```

`migrate.js` runs automatically on startup — it creates all tables, seeds two
staff accounts (`admin`, `staff`) and 8 demo guest bookings. The two seed
accounts do **not** stay on a fixed default password: on first boot (or
whenever the stored hash still matches the bootstrap default), `migrate.js`
rotates each to a fresh random one-time password, forces "must change
password", and logs the new temporary password once to stdout — see
[Staff accounts & passwords](#staff-accounts--passwords).

**Every frontend module is API-first with localStorage fallback** — the public
website, guest portal, staff console, Site Editor, and OTA inbox all work
offline/locally without the backend; they sync to Postgres when the API is
reachable.

---

## Maintenance mode

[`maintenance.html`](maintenance.html) is a small, fully self-contained
"we'll be back shortly" placeholder (logo, phone, email, address; no
dependency on any other file in the repo) for planned downtime.

**Never unpublish GitHub Pages to take the site down** — if Pages itself is
disabled/unpublished, GitHub serves its own generic 404 for the whole domain
and no repo file (including `maintenance.html`) can override that. Pages
should always stay published.

Instead, maintenance mode is a live toggle, stored in the `site_content`
table and flipped from the admin-only **Maintenance** panel in the staff
console (`staff.html`, admin login required):

- `GET /api/maintenance` — public; `index.html` and `booking.html` call this
  on load and redirect to `maintenance.html` when `enabled` is true.
- `PUT /api/maintenance` — admin only; flips the flag (see
  [`backend/routes/maintenance.js`](backend/routes/maintenance.js)).

`staff.html` itself is never gated, so staff/admins can always sign in —
including to turn maintenance mode back off — regardless of its state.
`maintenance.html` has a small "Admin Login" link (top-right) straight to
the staff console for this reason.

---

## Custom domain — live

The site runs on **`jparkhotel.com`** (transferred to Porkbun; DNS stays at
Porkbun, not Cloudflare):

- [`assets/js/config.js`](assets/js/config.js) routes the apex and `www` of the
  domain to the Render API (`https://jpark.onrender.com`).
- [`render.yaml`](render.yaml) lists `https://jparkhotel.com` and
  `https://www.jparkhotel.com` in the `FRONTEND_ORIGIN` CORS allowlist.
- DNS at Porkbun: four apex `A` records → `185.199.108.153`, `185.199.109.153`,
  `185.199.110.153`, `185.199.111.153`, plus a `www` `CNAME` → `shukize.github.io`.
- GitHub Pages custom domain is set to `jparkhotel.com` with **Enforce HTTPS**
  enabled (Let's Encrypt cert via GitHub).
- Resend sending domain is verified; `EMAIL_FROM` is
  `J Park Hotel <noreply@jparkhotel.com>`.

If the site is unreachable on a particular network shortly after a DNS change,
that's local resolver caching (ISP/carrier), not a config problem — check with
`nslookup jparkhotel.com` against a public resolver (`8.8.8.8` / `1.1.1.1`) or
[whatsmydns.net](https://www.whatsmydns.net) to confirm global state before
assuming something is broken.
