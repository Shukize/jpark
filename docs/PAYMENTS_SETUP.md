# Online booking payments (Omise / Opn Payments) — setup + go-live runbook

How the booking page takes real online payments (credit/debit card and
PromptPay QR), and exactly what has to happen to switch it on.

Payment is a **hybrid, per-booking choice**: a guest can pay in person at
check-in (cash, card, or PromptPay QR at the front desk — the default, and
the only option until the keys below are set), or pay online now.

**Omise is the hotel's approved acquirer and the only one in use.** GB Prime
Pay's adapter is still in the tree as a tested fallback — the acquirer changed
twice in one day while Omise's application was stalled — but it has no keys,
and `PAYMENT_PROVIDER=omise` is pinned in `render.yaml`, so it cannot activate
by accident.

Code: `backend/lib/payments/` (gateway adapters), `backend/routes/payments.js`
(booking + webhook + diagnostics routes), `backend/paymentReconciler.js` (the
safety net under the webhook), `backend/routes/guestBookings.js` (email copy),
`assets/js/booking-payment.js` (the booking page).
Tests: `node backend/test-payments.js` — 107 checks, no account or database
needed. Also runs as part of `npm test`, which is the Render build gate.

---

## Go-live: paste two values into Render

Render dashboard → **`jpark` service → Environment**:

```
OMISE_PUBLIC_KEY   = pkey_test_...
OMISE_SECRET_KEY   = skey_test_...
```

Save. Render restarts the service and online payment is live. Specifically,
you do *not* need to redeploy, change code, or touch the public site — the
booking page reads `GET /api/v1/payments/config` at load and adapts on its own.

Start with the **Test mode** keys (`pkey_test_…` / `skey_test_…`) so no real
money moves. When you're happy, replace them with the live pair
(`pkey_…` / `skey_…`) — same two boxes.

> **Nothing breaks while the keys are blank.**
> `GET /api/v1/payments/config` returns `paymentEnabled: false`, the booking
> page never shows the online-payment choice, and every guest sees exactly
> today's pay-at-check-in flow.

### You will know which mode you are in

Test and live keys are identical in every way except one prefix segment — same
API host, same code path, same "paid" banner, same confirmation email. A
deployment can therefore sit on test keys for weeks while looking, to a guest,
exactly like one taking real money. Three things now make that impossible to
miss:

- the API logs it at startup: `[payments] Omise / Opn Payments is LIVE` or
  `… is in TEST MODE — no real money will move`;
- `GET /api/v1/payments/config` reports `testMode`;
- the booking page shows an orange **"Test mode — no payment will be taken"**
  banner above the payment choice, in all five languages.

If a guest ever reports seeing that banner, the live keys are not in Render.

### Two things to set in the Omise dashboard

**1. Register the webhook** — Omise dashboard → **Webhooks**:

```
https://jpark.onrender.com/api/v1/payments/webhook
```

If `PAYMENT_WEBHOOK_SECRET` is set in Render, append `?key=<that value>`.

Test-mode and live-mode webhooks are **separate** in Omise's dashboard — when
you switch to live keys, register it again under Live.

You can also let the API register it for you:

```
POST https://jpark.onrender.com/api/v1/payments/diagnostics/register-webhook?key=<PAYMENT_WEBHOOK_SECRET>
```

That writes the account's `webhook_uri` via Omise's Account API. It overwrites
whatever is registered, which is why it is never automatic.

**2. Copy the webhook signing secret** (optional but recommended) from the
same Webhooks page into Render as `OMISE_WEBHOOK_SIGNING_SECRET`. Every
delivery's `Omise-Signature` header is then verified (HMAC-SHA256 over
`<timestamp>.<raw body>`, with the base64 secret decoded first) before
anything else happens, so a forged post is rejected without costing an API
call. Test and live have **different** signing secrets.

### Check it actually worked

```
GET https://jpark.onrender.com/api/v1/payments/diagnostics?key=<PAYMENT_WEBHOOK_SECRET>
```

(Or open it while signed in as an admin.) It asks Omise directly and answers,
in one place, every question that otherwise only surfaces when a guest pays:

- are the keys accepted, and is the account in **live** or **test** mode
- does the key's mode match the account's own `livemode`
- is the account's currency THB and country TH
- **is a webhook registered, and does it point at this API**
- is `PUBLIC_SITE_URL` set (without it, a guest cannot be returned to the
  booking page after a 3-D Secure challenge)
- is signature checking on

An unregistered or mistyped webhook is the single most likely reason a real
payment silently never reaches the booking board, and it is invisible until it
happens. This is how you check without spending a real payment to find out.

---

## The webhook is not a guarantee — and that is designed for

**Omise does not retry failed webhook deliveries.** From its own docs: *"Omise
does not currently guarantee automatic retries for failed deliveries"*, with
polling given as the recommended fallback.

That matters more than it sounds. If one delivery is missed — a Render deploy
restarting the process mid-payment, a Neon cold start timing out the write, a
brief network fault, a webhook that was never registered — then nothing would
ever learn that the guest paid. The failure is silent and lands the wrong way
round: the money is gone, Omise shows the charge as successful, and the
hotel's own booking board still says *awaiting payment*, so the front desk
charges the guest a second time at check-in.

So every asynchronous payment is watched from two directions
(`backend/paymentReconciler.js`):

| | |
| --- | --- |
| **Webhook** (fast) | Usually lands within seconds. |
| **Reconciler** (sure) | Re-asks Omise directly at 1, 3, 8, 20, 45 and 90 minutes after the charge, until it settles. |

Whichever gets there first wins. The loser is a harmless no-op — the flip to
paid is one atomic `UPDATE … WHERE payment_status != 'paid'`, so only one of
them can ever match a row and send an email. Postgres does the arbitration.

Two backstops sit under that, for the case where the process restarted and
lost its in-memory timers:

- a **sweep at startup**, 30 seconds after boot;
- a **scheduled sweep**, `POST /api/v1/payments/reconcile`, called by
  `.github/workflows/health-check.yml` on its 4×/day schedule.

The scheduled sweep deliberately rides the same schedule as the `/health/db`
check, which already wakes Neon — so it costs no extra database compute. (It
is *not* on a short interval for exactly that reason: a once-a-minute poll
would hold Neon's compute awake permanently and burn the monthly allowance on
an idle hotel, which is a mistake this project has already made once.)

**If that workflow ever warns that it recovered a payment, the webhook is not
working** — check the diagnostics endpoint above. Recovery is meant to be the
exception, not the mechanism.

---

## Getting the Omise account

Sign up at <https://dashboard.omise.co> with the hotel's business details
(a real KYC process — business registration documents) and a Thai bank account
for settlement. Dashboard → **Keys** gives the public/secret pair, separately
for Test and Live mode.

### The merchant website checklist

Omise requires the website itself to carry certain things before the account
is approved to take live transactions. All seven are in place:

| Requirement | Where |
| --- | --- |
| Contact name, address, phone, email | `index.html` → **Contact** section, and `policies.html` |
| Product / service details | `index.html` → Rooms, Facilities, Dining, Onsen |
| **Price in Thai Baht** | "from ฿X,XXX / night" on every room card — `assets/js/room-prices.js` |
| Shopping cart / checkout | `booking.html` (multi-room cart + checkout modal) |
| HTTPS | GitHub Pages with `jparkhotel.com`; keep *Enforce HTTPS* on |
| **Business policy (cancellation, refunds)** | `policies.html#booking-policy` |
| **Privacy policy** | `policies.html#privacy-policy` |

The last three of those were added for this: the room lineup previously showed
no price anywhere on the public site (prices lived only inside the booking
modal, behind a date search), and neither policy existed at all.

`policies.html` is linked from the homepage footer and the booking page
footer, and is written in all five site languages. **Its wording describes what
the system actually does** — the 200 THB key-card deposit, the 14:00/12:00
times, "contact the hotel to change or cancel" (there is no self-service
cancel), and the non-refundable prepay case — so keep it in step with the code
if any of that changes.

Two numbers in it are commercial choices rather than facts read out of the
code, and are worth confirming against how the front desk really works:
**free cancellation up to 24 hours before check-in**, and **refunds started
within 7 business days**. Both are single strings in
`assets/js/i18n-policies.js` (`pol.book.changeP`, `pol.book.refundP`).

> **Stripe is not an option**, so it does not get re-litigated: in Thailand
> *"Hotels, tour operators and transportation services"* are on
> [Stripe's Restricted Businesses list](https://stripe.com/en-th/legal/restricted-businesses)
> — reviewed case by case, never guaranteed — and Stripe Thailand is
> Visa/Mastercard only (no JCB, Amex or UnionPay).

---

## What happens on a payment

A charge resolves one of three ways, and the booking page handles all three
through one code path:

1. **Settled immediately** — a normal card approval. `payment_status = 'paid'`
   before the booking row is even written. A decline writes **no row at all**;
   the guest can retry or switch to pay-at-check-in.
2. **PromptPay QR** — the row is inserted `payment_status = 'pending'` (the
   reservation is confirmed either way), the guest scans, and the webhook (or
   the reconciler) flips it to paid.
3. **3-D Secure redirect** — the guest's bank wants to authenticate them, so
   Omise returns an `authorize_uri`. The guest is redirected, comes back via
   `/api/v1/payments/return`, and the webhook confirms.

A charge that expires or fails without being paid is closed out as
`payment_status = 'failed'` rather than left pending forever — the reservation
stays confirmed, and the desk collects at check-in.

A multi-room group booking is charged **once** for the cart's grand total, and
every room shares one `payment_charge_id`, so one webhook flips them all.

## Verifying in Test mode

```
node backend/test-payments.js     # 107 checks, offline
```

That covers the wire contract (satang conversion, `return_uri`, charge-event
filtering), signature verification, the charge-state mapping, the whole
booking → 3-D Secure → webhook → paid path against a mock Omise, and the
reconciler recovering a payment whose webhook never arrived.

With real Test-mode keys, then confirm end to end:

- **Card approved** → row has `payment_status = 'paid'`,
  `payment_provider = 'omise'`, a real `chrg_…` id. Guest email shows the
  green "paid online" banner; the hotel notice shows `✓ PAID ONLINE`.
- **Card declined** → no row written; guest sees a decline message.
- **PromptPay** → **test charges do not complete on their own.** Create the
  charge, then mark it successful from the Omise dashboard's **Actions**
  button on that charge. Then confirm the booking page's poll flips to paid
  and the payment-confirmed email reaches guest and hotel.
- **3-D Secure** → test cards that trigger 3DS only work on a **3DS-enabled
  test account**; email support@omise.co to have it switched on. Then confirm
  the redirect out and back, and that the booking flips to paid.
- **The reconciler** → the honest test of the safety net: pay a PromptPay test
  charge with the webhook URL *unregistered*, and confirm the booking still
  flips to paid on its own within a couple of minutes.
- **Group cart (2+ rooms)** → confirm every room shares one
  `payment_charge_id` and flips together. Check with a direct DB query, not
  just the UI — the webhook's `UPDATE … WHERE payment_charge_id = $1` is
  what makes it work.
- **Staff console** → the Guest Booking detail shows a read-only "paid"
  summary with an "(online)" qualifier, distinguishing it from a front-desk
  card payment.

## Going live

1. Flip the Omise dashboard to Live, generate live keys, replace the two
   values in Render.
2. Re-register the webhook under **Live mode** (the Test registration does
   not carry over), and swap `OMISE_WEBHOOK_SIGNING_SECRET` for the live one.
3. Open the diagnostics endpoint and confirm every check passes, in
   particular `livemode: true` and the registered webhook URL.
4. Confirm the booking page no longer shows the test-mode banner.
5. Confirm the Resend sending domain is verified so guest emails deliver.
6. Do one small real payment and confirm it appears in Omise's
   settlement/transaction view — that view is the reconciliation source of
   truth, matched against the "Gateway ref:" line in each hotel notice email.

---

## Notes that matter later

- **Refunds are manual**, by design. A cancelled booking that was genuinely
  paid online says so in the cancellation email and asks the guest to contact
  the hotel — refund it from the Omise dashboard. Nothing in
  `lib/payments/` has a refund call.
- **The prepayment switch stays inert until this is live.** The staff "require
  prepayment for busy periods" toggle only takes effect while a gateway is
  configured, so it can never block a booking nobody can pay for.
- **Booking ids are UUIDs, not integers.** `GET /payments/status/:id` matches
  `id`, `payment_charge_id`, `ref` and `group_ref` in one query for that
  reason. It used to branch on `/^\d+$/` to tell a booking id from a payment
  reference, which meant every real id fell through to the reference branch
  and 404'd — so after paying by PromptPay or clearing 3-D Secure, the guest's
  page polled a 404 and never showed "paid". The test suite's fake database
  handed out integer ids and never caught it; it now uses UUIDs.
- **Room inventory is unaffected** — see `backend/lib/roomRates.js` and the
  Site Editor's "How many rooms".
