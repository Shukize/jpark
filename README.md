# J Park Hotel Website

A multilingual static hotel website for **J Park Hotel · Chonburi, Thailand** — no build step, no server required. Open `index.html` directly in a browser.

---

## Features

- 5 languages: Thai · English · Japanese · Simplified Chinese · Traditional Chinese
- Guest portal: service requests, in-room dining, live request tracker
- Live chat (guest ↔ front desk, localStorage-based)
- Staff & admin console (`staff.html`)
- Admin site editor (announcements, hero content, show/hide sections)
- **Guest Booking inbox** — OTA reservations (Agoda, Booking.com, Airbnb, Trip.com…) land in Messages, auto-translated
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

When a guest books on **Agoda, Booking.com, Airbnb, Trip.com, Expedia** (or any
other channel), the confirmation — guest details + the booking email — shows up
under **Messages → Guest Booking** for both Admin and Staff. The confirmation
body is auto-translated into whatever language the reader has selected, exactly
like internal messages and live chat.

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

- Pure HTML / CSS / JS — no framework, no build step
- All shared state lives in `localStorage` via `JPark.store` (`assets/js/store.js`)
- Real-time cross-tab sync uses the `storage` event
- i18n strings: `assets/js/i18n.js` (core) + `assets/js/i18n-app.js` (feature strings)
- OTA booking intake seam: `assets/js/bookings.js` → `JPark.bookings.ingest()`, stored in the `guestBookings` table
- Free-text translation (chat, internal mail, booking confirmations): `assets/js/translate.js`
- Demo data is seeded once on first load; reset via Admin → "Reset all demo data"
