# J Park Hotel Website

A multilingual static hotel website for **J Park Hotel · Chonburi, Thailand** — no build step, no server required. Open `index.html` directly in a browser.

---

## Features

- 5 languages: Thai · English · Japanese · Simplified Chinese · Traditional Chinese
- Guest portal: service requests, in-room dining, live request tracker
- Live chat (guest ↔ front desk, localStorage-based)
- Staff & admin console (`staff.html`)
- Admin site editor (announcements, hero content, show/hide sections)
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

## Architecture

- Pure HTML / CSS / JS — no framework, no build step
- All shared state lives in `localStorage` via `JPark.store` (`assets/js/store.js`)
- Real-time cross-tab sync uses the `storage` event
- i18n strings: `assets/js/i18n.js` (core) + `assets/js/i18n-app.js` (feature strings)
- Demo data is seeded once on first load; reset via Admin → "Reset all demo data"
