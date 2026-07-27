# Online booking payments (Omise / Opn Payments — card + PromptPay) — setup notes

How the booking page's "Book Now" flow takes real online payments, and how
to bring it live. Payment is a **hybrid, per-booking choice**: a guest can
pay in person at check-in (cash, credit/debit card, or PromptPay QR at the
front desk — the default, and the only option while the steps below aren't
done yet), or pay online now by card or PromptPay via Omise. Code lives in
`backend/lib/omise.js`, `backend/routes/payments.js`,
`backend/routes/guestBookings.js` (email copy), and `assets/js/booking-payment.js`.

---

## Current state: built, not yet live

No Omise account exists yet. Until `OMISE_SECRET_KEY` is set,
`GET /api/v1/payments/config` returns `paymentEnabled: false` and the
booking page never shows the online-payment choice at all — every guest
sees exactly today's pay-at-checkin-only flow. **Nothing breaks by leaving
Omise unset**, and this doc's steps can be done at any pace without taking
the booking page down.

## 1. Create the Omise account

1. Sign up at <https://dashboard.omise.co> (Opn Payments) with the hotel's
   business details (this is a real KYC process — expect to provide business
   registration documents) and a Thai bank account for settlement.
2. Start in **Test mode** (top-left toggle) — the whole flow below can be
   built and verified before any real payment is ever taken.
3. Dashboard → **Keys** gives you:
   - `pkey_test_...` (public key — safe to expose to the browser; this is
     what card tokenization uses client-side)
   - `skey_test_...` (secret key — server-side only, never expose)

## 2. Set the environment variables

Local dev — add to `backend/.env` (see `backend/.env.example`):
```
OMISE_PUBLIC_KEY=pkey_test_...
OMISE_SECRET_KEY=skey_test_...
```

Production — Render dashboard → `jpark` service → **Environment**: add
`OMISE_PUBLIC_KEY` and `OMISE_SECRET_KEY` (already declared as `sync: false`
in `render.yaml`, so they must be pasted in manually — a blueprint sync
never carries secret values).

Optional: `OMISE_WEBHOOK_SECRET` — an extra shared-secret check on the
webhook URL (`?key=...`). Every webhook is re-verified against the Omise API
regardless of this, so it's a secondary guard, not the primary one — Omise
webhook bodies aren't cryptographically signed, so the server always
re-fetches the charge from Omise's own API before ever trusting it.

## 3. Register the webhook (for PromptPay confirmation)

Card charges resolve synchronously (no webhook needed), but PromptPay is
asynchronous — the guest scans *after* the booking is created, so a webhook
is what flips it from "pending" to "paid." Omise dashboard → **Webhooks** →
add:
```
https://jpark.onrender.com/api/v1/payments/webhook
```
(append `?key=<OMISE_WEBHOOK_SECRET>` if you set one). Without this, a
PromptPay payment never resolves — the guest's reservation stays confirmed,
but staff never see the payment_status flip to "paid" and the guest never
gets the payment-confirmed follow-up email.

## 4. Test end-to-end (Test mode — no real money moves)

Omise's Test mode provides:
- **Test card numbers** that simulate an approved or declined charge (see
  Omise's docs for the current test PAN list — these change occasionally).
- A **test PromptPay QR** that auto-completes after a short delay, so the
  whole scan → webhook → confirmed path can be verified without a real
  banking app.

Verify, for both a single-room and a multi-room ("group cart") booking:
- **Card, approved**: a row appears in `guest_bookings` with
  `payment_status = 'paid'`, `payment_provider = 'omise'`,
  `payment_method = 'card'`, and a real `payment_charge_id`. The guest
  confirmation email shows the green "paid online" banner (not a balance-due
  note), and the hotel notice shows `✓ PAID ONLINE` with the charge id.
- **Card, declined**: no row is written at all — the guest sees a decline
  message and can retry or switch to pay-at-check-in.
- **PromptPay**: the row is inserted `payment_status = 'pending'`
  immediately (the reservation is already confirmed regardless); the guest
  sees a QR + a live poll. Once the test QR auto-completes, the webhook
  fires, flips `payment_status` to `'paid'`, and sends the "payment
  confirmed" follow-up email to **both** the guest and the hotel
  (`jparkhotel1@gmail.com` by default) — this is what closes the loop for
  staff on a booking that started out "awaiting PromptPay confirmation."
- **Group cart** (2+ rooms): confirm all rooms in the group share the same
  `payment_charge_id` and flip to `paid` together — check this with a direct
  DB query, not just the UI, since the webhook's `UPDATE ... WHERE
  payment_charge_id = $1` is what makes this work.
- **Staff console**: `staff.html` → Guest Booking detail view shows the
  payment as a read-only "paid" summary (no manual mark-paid control) for an
  online-paid booking, and disambiguates it from a front-desk-recorded card
  payment with an "(online)" suffix.

## 5. Room inventory

`backend/lib/roomRates.js`'s `ROOM_INVENTORY` holds the real per-type room
counts the owner gave (2026-07-24) — online payment doesn't change anything
here; the availability guard already existed and just now enforces the
real numbers instead of the old 999-placeholder ceiling. See that file's
comments for the Single/Twin shared-pool and Executive/Grand Suite
combined-pool caveats.

Those numbers are now the FALLBACK only: staff edit the live counts in the
Site Editor ("How many rooms", Sections tab), stored in
`site_content.room_inventory` and merged over the fallback by
`rateOverrides.getEffectiveInventoryMap()`. Every guard — single booking,
multi-room cart, reopen-a-cancelled-booking, the Hotel Ads feed and the
booking page's availability sweep — reads the merged value, so a count
lowered at 3pm applies to the next booking attempt. A count is a whole
number 0–500; 0 means "sell none of this type".

## 6. Known limitation — 3-D Secure

This design assumes a card charge resolves as a plain synchronous
approve/decline from a token. If Omise or the guest's issuing bank requires
an offsite 3-D Secure challenge, the charge response instead carries an
`authorize_uri` the guest must be redirected to — **the current frontend
does not handle that redirect.** Check for this specifically during Test
Mode verification with a few different test cards before go-live; if it
turns out to trigger often for real Thai or international cards, that
redirect flow is the next thing to build (out of scope for this pass).

## 7. Go live

1. Flip the Omise dashboard from Test mode to Live, generate live keys
   (`pkey_...` / `skey_...`), and replace the env vars in Render.
2. Re-register the webhook URL under **Live mode** — test-mode and live-mode
   webhooks are separate in Omise's dashboard; the Test-mode registration
   from step 3 does not carry over.
3. Confirm Resend's sending domain is verified (see `docs/OTA_EMAIL_BRIDGE.md`
   / the running-costs notes) so guest confirmation and payment-confirmed
   emails actually reach guest inboxes and not just the Resend sandbox
   account owner.
4. Do one small real booking (a real card, or a real PromptPay scan for a
   nominal amount) before announcing this publicly, and confirm the charge
   appears correctly in the Omise dashboard's settlement/transaction view —
   this is also the reconciliation source of truth for accounting, matched
   against the "Omise charge: chrg_..." line in each hotel notice email.
