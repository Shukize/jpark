# Hosting invoices → the client's accounts inbox

Goal: the client's accounts inbox sees what the site costs to run each month,
without anyone remembering to forward anything.

---

## Why this isn't just a setting in Render

Render sends billing email (through Stripe) to **one** address — the workspace
owner's account email. There is no "also send invoices to…" field.

**Verified in the dashboard 2026-09-15:** Workspace Settings → Billing contains
Payment Method, Billing Information (company name / address / VAT only) and
Monthly Included Usage. **No email field of any kind.** The invoice's "Bill to"
address is the account email, which is the whole reason this page exists — don't
go hunting for the setting again.

The only built-in way to add a second recipient is to invite a member with the
**Billing** role, and that role exists on the **Scale** plan only. The hotel's
workspace is **Hobby**, which is capped at a single member. Upgrading purely to
CC an invoice would cost several times the thing being invoiced. So we forward
from the mailbox instead.

The client also can't be given a Render login to check the dashboard themselves,
for the same single-member reason — the forwarded invoice is their only channel.

---

## ⚠️ Prerequisite: the billed mailbox must be Gmail

Apps Script's `GmailApp` can only read the Gmail account the script runs as. It
cannot reach Yahoo, Outlook or anything else.

**This bit the project on 2026-09-15:** the Render account email was a **Yahoo**
address, so the forwarder could not see the invoices at all. Both escape hatches
you would reach for are closed:

- **Yahoo auto-forwarding is a paid feature.** Free accounts lost it on
  2021-01-15; it needs Yahoo Mail Plus/Pro.
- **Gmail's "Check mail from other accounts" (POP fetch) is being retired.**
  Google stopped new configurations after Q1 2026 and switches it off entirely
  in January 2027, so Yahoo → Gmail can't even be set up now.

**Resolved 2026-09-15: the Render account email was moved to a Gmail the owner
controls** (Render Dashboard → *Account Settings* → email — look there for the
current address rather than hard-coding it here), and the Apps Script runs in
that account. It was deliberately *not* pointed straight at the client's
address: Render sends deploy alerts, security notices and password resets to
the account email too, and those aren't the client's business.

**Consequence: `forwardPastInvoices` will find nothing.** Every invoice issued
before the switch is sitting in the Yahoo mailbox, where the script can't see
it. If the client wants the back catalogue, download those invoices from Render
→ Billing and send them across once, by hand. From the next billing date on,
it's automatic.

**Render login here is GitHub OAuth**, so the account email was seeded from the
GitHub primary email. Render's documented "can't change your
account email" restriction applies only to workspaces that *enforce* Google
login, which this one doesn't — so the field should be editable in Account
Settings, and it was. If it is ever locked, the fallbacks are to change the GitHub
primary email (GitHub → Settings → Emails) or to ask support@render.com to
change the account email directly.

---

## Scope: Render only

Decided 2026-09-15 — the forwarder covers **Render and nothing else**. That's
the API (`jpark-api`, Starter plan): **$7/mo**, plus usage overage if bandwidth
or build minutes run over.

Worth knowing this isn't the site's entire running cost — the `jparkhotel.com`
domain renews annually through Porkbun, and Neon bills for the database — but
neither was wanted here. Both were built and deliberately removed. To bring one
back later, add an entry to `CONFIG.VENDORS`:

```js
{ label: 'Porkbun', from: 'porkbun.com', everyDays: 365 },
{ label: 'Neon', from: 'neon.tech', stripeName: 'neon', everyDays: 30 },
```

`everyDays` is that vendor's billing cycle, and it's what stops an annual
renewal from tripping the stale check eleven months a year. `stripeName` is
required for anything billed through Stripe — see the guard below.

---

## Option A — Apps Script forwarder (set up here; no action from the client)

Script: [`../tools/render-invoice-forwarder.gs`](../tools/render-invoice-forwarder.gs)

Same pattern as the OTA bridge in [`OTA_EMAIL_BRIDGE.md`](OTA_EMAIL_BRIDGE.md).
It forwards each invoice with **body and attachments intact**, so the PDF the
bookkeeper needs arrives as-is.

Run it **on the Gmail account the vendors bill** — the Render login email, not
the client's.

1. **script.google.com** → *New project* → paste the script in → Save.
2. Run **`listBillingSenders`** → open *Execution log*. It prints every distinct
   vendor/Stripe sender + subject from the last two years, tagged with which
   vendor the script thinks it is. Confirm a real invoice from each vendor is
   tagged correctly, and fix `CONFIG.VENDORS` if not.
3. Run **`previewMatches`** → logs exactly what *would* be forwarded, and sends
   nothing. Every `[WOULD SEND]` line should be a hotel bill. **Read this list
   properly** — see the privacy note below.
4. Run **`installTrigger`** → approve the Gmail permission prompt. From here it
   checks hourly, forever.
5. Optional: run **`forwardPastInvoices`** once to send the back catalogue
   (widens the search to 2 years for that single run).

**`FORWARD_TO` ships blank.** This repo is public and served at
`jparkhotel.com/tools/`, and the address belongs to the client, so it lives
only in the Apps Script project. Fill it in at the top of the file after
pasting — every entry point refuses to run while it's still the placeholder,
so a fresh paste can never silently forward to nowhere.

### ⚠️ The one thing to get right: the Stripe guard

Render bills **through Stripe**, so its receipts arrive from
`stripe.com`. But so does every other Stripe merchant on earth — if the owner
has ever bought anything billed through Stripe, those receipts sit in the same
mailbox and match the same sender.

Forwarding on `from:stripe.com` alone would mail the owner's **personal
purchases to a third party's purchasing inbox.**

The script therefore only accepts Stripe mail that **names one of our vendors**
in the subject or body, and re-checks this per message rather than per thread.
`previewMatches` and `listBillingSenders` both print the vendor they matched
(or `not ours`) so you can confirm the guard is holding before switching it on.

### Other things it handles that a naive forwarder gets wrong

- **The client sees a subject that says whose bill it is.** `Fwd: Your Render
  receipt` is ambiguous landing in a purchasing inbox, so the forward goes out
  as `J Park Hotel — Render invoice — Your Render receipt`
  (`CONFIG.FORWARD_SUBJECT`, blank it for Gmail's plain `Fwd:`). Only the
  subject line is restyled — the body and the PDF are passed through untouched,
  which matters because the PDF is the accounting document.
- **Dedupe is per message, not per thread.** Gmail groups consecutive
  same-subject receipts into one thread; a thread-level "done" marker would
  forward January and silently swallow every month after it.
- **Non-billing mail stays out.** Deploy notices and service alerts come from
  the same senders — the accounts inbox only ever sees money.
- **It notices per vendor when it breaks,** on that vendor's own cycle. If
  Render changes its subject line and drops out, nothing visibly fails — the
  client just stops hearing about the bill and assumes it's still $7. After a
  vendor misses its billing cycle plus 15 days' grace, the script emails the
  mailbox owner naming that vendor.

### Testing it before a real invoice exists

A freshly-switched mailbox has no Render history, so `previewMatches` comes back
empty and there is nothing to rehearse on. Run **`selfTest`** instead: it plants
a message that mimics a Render invoice, runs it through the real subject gate,
forwards it to **your own address** (never the client's — `TEST_FORWARD_TO` is
blank by default), and bins the plant afterwards.

That proves the OAuth scopes, the search, the subject gate and actual delivery.
It cannot prove the **sender** match, because the plant comes from your mailbox
rather than Render. Only a genuine invoice settles that — so on the day after
the next billing date, run `previewMatches` and confirm the real invoice is
tagged `Render`.

---

## Option B — plain Gmail filter (simpler, needs one click from the client)

No script. On the mailbox the vendors bill:

1. Gmail → *Settings* → **Forwarding and POP/IMAP** → *Add a forwarding address*
   → the accounts address.
2. Google emails that address a confirmation link. **The client must click it** —
   forwarding does not start until they do.
3. Settings → *Filters and Blocked Addresses* → *Create a new filter*:
   - **From:** `render.com`
   - **Has the words:** `subject:(receipt OR invoice OR payment OR billing)`
   - → *Create filter* → tick **Forward it to** the accounts address.

Note this deliberately leaves out `stripe.com`: a Gmail filter can't express
"only Stripe mail that mentions Render", so including it would leak personal
receipts. The cost is that Stripe-relayed invoices won't forward at all — which
may be most of them. Trade-offs vs Option A: needs the client's confirmation
click, only applies to mail arriving **after** it's switched on, and fails
silently if a vendor changes their wording.

---

## Worth doing at the same time (2 minutes, in Render)

Render Dashboard → **Workspace Settings → Billing** → the button to add billing
information. Anything entered there (company name, address, tax ID) is printed
on every future invoice. For a Thai company that's usually what turns a receipt
into something accounting will actually accept — worth filling in before the
next invoice, since it doesn't apply retroactively.

Past invoices stay downloadable from that same Billing page, so the owner can
always pull one the forwarder missed.

---

## If the client stops receiving them

1. Apps Script project → *Executions* tab. Failures are listed there, and Google
   also emails the script owner on repeated failure.
2. Run `listBillingSenders` — the usual cause is a vendor changing their sender
   or subject so `CONFIG.VENDORS` no longer matches.
3. Check the hourly trigger still exists (*Triggers* tab). Re-run
   `installTrigger` if not; it clears and re-creates its own trigger, so running
   it twice is safe.
4. Check the owner's mailbox still receives them at all — if a vendor's email
   bounced or an account email changed, there's nothing to forward.
