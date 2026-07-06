# Online booking payments (Omise / Opn Payments) — setup notes

How the booking page's "Book Now" flow takes real card and PromptPay
payments. Code lives in `backend/lib/omise.js`, `backend/lib/roomRates.js`,
`backend/lib/rateOverrides.js`, `backend/routes/payments.js`, and
`assets/js/booking-payment.js`.

---

## Current state: built, not yet live

No Omise account exists yet. Until `OMISE_PUBLIC_KEY` / `OMISE_SECRET_KEY`
are set, `GET /api/v1/payments/config` returns `publicKey: null` and the
booking page's "Book Now" button shows the hotel's static PromptPay QR
(`images/promptpay-qr.jpg`) with a cash-on-arrival option instead of the
card/Omise-PromptPay form (`assets/js/booking-payment.js`'s `renderManual()`).
Submitting it posts to `POST /api/v1/payments/manual-booking`
(`backend/routes/payments.js`) — no charge is taken; it records a `pending`
booking for staff to confirm by hand once payment is verified. Nothing
breaks by leaving Omise unset.

## 1. Create the Omise account

1. Sign up at <https://dashboard.omise.co> (Opn Payments) with the hotel's
   business details and a Thai bank account for settlement.
2. Start in **Test mode** (top-left toggle) — you can build and verify the
   whole flow before any real card is ever charged.
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

## 3. Register the webhook (for PromptPay + 3-D Secure card confirmations)

Omise dashboard → **Webhooks** → add:
```
https://jpark.onrender.com/api/v1/payments/webhook
```
(append `?key=<OMISE_WEBHOOK_SECRET>` if you set one). This is what flips a
PromptPay QR or a 3-D-Secure-challenged card from "pending" to "paid" —
without it, those two payment paths never resolve to a confirmed booking.
Card payments that don't require 3-D Secure settle instantly without the
webhook.

## 4. Test end-to-end (Test mode — no real money moves)

Omise's published test cards (<https://www.omise.co/api-testing-guide>):

| Card number | Result |
|---|---|
| `4242424242424242` | Succeeds immediately |
| `4111111111111111` | Requires 3-D Secure (redirects to a mock bank challenge, then back to `booking.html?omise_return=1&...`) |
| `4000000000000002` | Declined |

Any future expiry date and any 3-digit CVC work in Test mode.

For PromptPay in Test mode, the dashboard's test QR auto-completes after a
short delay so you can verify the whole polling → confirmation path without
a real banking app.

Verify after a test booking:
- A row appears in `guest_bookings` with `payment_status = 'paid'`.
- The guest-confirmation and hotel-notice emails both include the 200 THB
  key-card deposit line and, for direct bookings, a "Payment: Card — Paid"
  (or PromptPay) line.
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
