# OTA → website email bridge (setup notes)

How real OTA bookings (Agoda / Booking.com / Airbnb / Trip.com / Expedia) flow
into the staff **Guest Booking inbox** automatically. Keep this for reference;
the two receiver scripts in [`../tools/`](../tools/) are copy-paste ready.

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

## Which receiver? (cost comparison)

The endpoint needs *something* always-on to forward the OTA email to it.

| Receiver | Cost | Needs a domain? | Latency | Notes |
|----------|------|-----------------|---------|-------|
| **Cloudflare Email Routing + Worker** | **Free** | Yes (domain on Cloudflare) | Instant | **Chosen** for `jparkhotel.com`. Routing free; Workers 100k req/day free. |
| Google Apps Script on the reservations Gmail | Free | No | ~5 min (polls) | Best for **today**, before the domain is live. No new account. |
| Make.com mailhook → HTTP | Free tier (1k ops/mo) | No | Instant | Needs a Make account + Gmail-forward verification. |
| Zapier Email Parser | Not free end-to-end | No | Instant | Webhook action is a paid (Premium) feature. |

**Bottom line:** Cloudflare is the cheapest (free) once `jparkhotel.com` is on
Cloudflare. Until then, run the Gmail Apps Script so OTA intake works today.

---

## Option A — Gmail Apps Script (use today)

Script: [`../tools/ota-gmail-forwarder.gs`](../tools/ota-gmail-forwarder.gs)

1. **script.google.com** → New project → paste the script.
2. Set `CONFIG.SECRET` = your `OTA_WEBHOOK_SECRET` (same value as in Render).
   Adjust the senders in `CONFIG.QUERY` to match your OTA mail.
3. Run **`installTrigger`** once → approve the Gmail + external-request prompt.
4. Test with **`runOnce`**, then check staff console → Messages → Guest Booking.

Runs every 5 min on whichever Gmail receives the OTA confirmations. Safe to
re-run (label-based dedupe + endpoint dedupe).

---

## Option B — Cloudflare Email Routing + Worker (final, for jparkhotel.com)

Worker: [`../tools/ota-cloudflare-email-worker.js`](../tools/ota-cloudflare-email-worker.js)

**One-time setup**
1. Add **jparkhotel.com** to Cloudflare (point the registrar's nameservers at
   Cloudflare). Required for Email Routing.
2. Cloudflare dashboard → **Email → Email Routing → Enable**. Cloudflare adds the
   MX + SPF records for you.
3. Create the Worker:
   - `npm create cloudflare@latest ota-email-worker` (or paste the worker file in
     the dashboard editor), add the dependency: `npm i postal-mime`.
   - Paste `tools/ota-cloudflare-email-worker.js` as the Worker code, deploy.
4. Add the secret to the Worker: dashboard → Worker → **Settings → Variables →
   add `OTA_WEBHOOK_SECRET`** (encrypted) = the Render value. *(Or
   `wrangler secret put OTA_WEBHOOK_SECRET`.)*
5. **Email Routing → Routes**: send a custom address — e.g.
   **`ota@jparkhotel.com`** — to the Worker (Action: *Send to a Worker*).
6. Forward OTA mail to it:
   - **Best:** if the OTAs already email an `@jparkhotel.com` address (e.g.
     `reservations@jparkhotel.com`), route *that* address to the Worker — no
     forwarding needed.
   - **Otherwise:** add an auto-forward rule on the current reservations inbox
     (e.g. `jparkhotel1@gmail.com`) → `ota@jparkhotel.com`.

That's the whole pipeline: **OTA → @jparkhotel.com → Worker → website Guest
Booking inbox + notice email.** No polling, instant, free.

---

## Operator to-dos (not code)

- 🔴 **Rotate the `admin/admin123` password** — it currently logs into the live
  staff console from anywhere. Do this before taking real bookings.
- 🟡 **Verify a sending domain in Resend**, then set `EMAIL_FROM` to e.g.
  `J Park Hotel <noreply@jparkhotel.com>`. Until then mail only delivers to the
  Resend account owner; the booking still lands in the inbox regardless.
- ⚙️ **Domain cutover:** when the site goes live on `jparkhotel.com`, the API base
  in [`../assets/js/config.js`](../assets/js/config.js) currently points
  `jparkhotel.com` → `https://api.jparkhotel.com` (which doesn't exist yet).
  Either change it to `https://jpark.onrender.com`, or add `api.jparkhotel.com`
  as a Render custom domain + CNAME. (CORS already allows `jparkhotel.com` in
  `render.yaml`.)
