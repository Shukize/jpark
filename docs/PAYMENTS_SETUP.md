# Online booking payments (Omise / Opn Payments — PromptPay only) — setup notes

How the booking page's "Book Now" flow takes real PromptPay payments online.
**Card and cash are handled in person at check-in, not online** — PromptPay
QR is the only online payment method, by permanent owner decision. This is
not a temporary state while Omise is unconfigured; it stays true even after
a live Omise account is set up. Code lives in `backend/lib/omise.js`,
`backend/lib/roomRates.js`, `backend/lib/rateOverrides.js`,
`backend/routes/payments.js`, and `assets/js/booking-payment.js`.

---

## Current state: built, not yet live

No Omise account exists yet. Until `OMISE_PUBLIC_KEY` / `OMISE_SECRET_KEY`
are set, `GET /api/v1/payments/config` returns `publicKey: null` and the
booking page's "Book Now" button shows the hotel's static PromptPay QR
(`images/promptpay-qr.jpg`) instead of the live Omise-PromptPay form
(`assets/js/booking-payment.js`'s `renderManual()`). Submitting it posts to
`POST /api/v1/payments/manual-booking` (`backend/routes/payments.js`) — no
charge is taken; it records a `pending` booking for staff to confirm by
hand once payment is verified. Nothing breaks by leaving Omise unset.

## 1. Create the Omise account

1. Sign up at <https://dashboard.omise.co> (Opn Payments) with the hotel's
   business details and a Thai bank account for settlement.
2. Start in **Test mode** (top-left toggle) — you can build and verify the
   whole flow before any real payment is ever taken.
3. Dashboard → **Keys** gives you:
   - `pkey_test_...` (public key — safe to expose to the browser)
   - `skey_test_...` (secret key — server-side only, never expose)

## 2. Set the environment variables

Local dev — add to `backend/.env` (see `backend/.env.example`):
```
OMISE_PUBLIC_KEY=pkey_test_...
OMISE_SECRET_KEY=skey_test_...
```

Production — Render dashboard → `jpark-api` service → **Environment**:
add `OMISE_PUBLIC_KEY` and `OMISE_SECRET_KEY` (already declared as
`sync: false` in `render.yaml`, so they must be pasted in manually).

Optional: `OMISE_WEBHOOK_SECRET` — an extra shared-secret check on the
webhook URL (`?key=...`). Every webhook is re-verified against the Omise
API regardless, so this is a secondary guard, not the primary one.

## 3. Register the webhook (for PromptPay confirmation)

Omise dashboard → **Webhooks** → add:
```
https://jpark.onrender.com/api/v1/payments/webhook
```
(append `?key=<OMISE_WEBHOOK_SECRET>` if you set one). This is what flips a
PromptPay QR from "pending" to "paid" — without it, that payment never
resolves to a confirmed booking.

## 4. Test end-to-end (Test mode — no real money moves)

In Test mode, Omise's dashboard test QR auto-completes after a short delay
so you can verify the whole polling → confirmation path without a real
banking app.

Verify after a test booking:
- A row appears in `guest_bookings` with `payment_status = 'paid'`.
- The guest-confirmation and hotel-notice emails both include the 200 THB
  key-card deposit line and, for direct bookings, a "PromptPay — Paid" line.
- The booking shows up in staff.html → Messages → Guest Booking, with the
  same payment line visible in the detail view.

## 5. Room inventory counts

`backend/lib/roomRates.js`'s `ROOM_INVENTORY` map feeds the overbooking
guard. The owner has said overbooking isn't a real concern for this
property, so every room type is set to a high placeholder (999) — the guard
stays wired up (so nothing has to change in the payment code) but never
realistically blocks a booking. If that changes, replace the 999s with the
real physical room counts per type.

## 6. Go live

1. Flip the Omise dashboard from Test mode to Live, generate live keys
   (`pkey_...` / `skey_...`), and replace the env vars in Render.
2. Re-register the webhook URL under Live mode (test-mode and live-mode
   webhooks are separate in Omise's dashboard).
3. Confirm Resend's sending domain is verified (see `docs/OTA_EMAIL_BRIDGE.md`
   / the running-costs notes) so guest confirmation emails actually reach
   guest inboxes and not just the Resend sandbox account owner.
