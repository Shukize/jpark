# OTA → website email bridge (setup notes)

How real OTA bookings (Agoda / Booking.com / Airbnb / Trip.com / Expedia) flow
into the staff **Guest Booking inbox** automatically. Keep this for reference;
the receiver script in [`../tools/`](../tools/) is copy-paste ready.

---

## The endpoint (already built & live)

```
POST  https://jpark.onrender.com/api/v1/ota-email
Auth:  X-API-Key: <OTA_WEBHOOK_SECRET>        (or ?key=<secret> on the URL)
Body:  { "subject": "...", "from": "...", "to": "...", "text": "...", "html": "..." }
```

It auto-detects the channel and best-effort extracts guest, reference, dates,
room, occupancy and total. **The full raw email is always stored**, so a parse
miss never drops a booking (it's flagged *needs review* instead). Re-sending the
same email is idempotent (de-duped on the OTA reference, or a stable hash).

Code: `backend/routes/otaEmail.js` + `backend/lib/otaEmailParser.js`.
Tests: `cd backend && node test-ota-email.js` (34 assertions).

### Verified live 2026-06-15
- `OTA_WEBHOOK_SECRET` — **set & enforced** (keyless POST → 401).
- `RESEND_API_KEY` — **set & active** (`/api/email/status` → `{configured:true}`).
- `/api/v1/ota-email` — **deployed** (returns 401, not 404).
- Render service was renamed to **`jpark-api`** but keeps the **`jpark.onrender.com`** URL.

---

## Receiver: Gmail Apps Script (permanent)

`jparkhotel.com`'s DNS stays on Porkbun (not Cloudflare), so Cloudflare Email
Routing isn't an option here — the Gmail Apps Script is the permanent receiver,
not a stopgap.

Script: [`../tools/ota-gmail-forwarder.gs`](../tools/ota-gmail-forwarder.gs)

1. **script.google.com** → New project → paste the script.
2. Set `CONFIG.SECRET` = your `OTA_WEBHOOK_SECRET` (same value as in Render).
   Adjust the senders in `CONFIG.QUERY` to match your OTA mail.
3. Run **`installTrigger`** once → approve the Gmail + external-request prompt.
4. Test with **`runOnce`**, then check staff console → Messages → Guest Booking.

Runs every 5 min on whichever Gmail receives the OTA confirmations. Safe to
re-run (label-based dedupe + endpoint dedupe).

---

## Operator to-dos (not code)

- 🔴 **Rotate the `admin/admin123` password** — it currently logs into the live
  staff console from anywhere. Do this before taking real bookings.
- 🟡 **Verify a sending domain in Resend**, then set `EMAIL_FROM` to e.g.
  `J Park Hotel <noreply@jparkhotel.com>`. Until then mail only delivers to the
  Resend account owner; the booking still lands in the inbox regardless.
