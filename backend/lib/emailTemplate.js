/* ============================================================
   J Park Hotel — the shared look of every email the system sends.

   Guest confirmations, hotel notices, payment receipts and cancellations all
   used to build their own HTML by hand, as one long string of <div>s. That
   produced two separate problems, and this file exists to end both.

   ── 1. It did not look like a hotel ─────────────────────────────────────
   A bare <div> stretches to the full width of a desktop mail window, so a
   confirmation rendered as a line of text several hundred characters wide.
   Outlook (which renders with Word's engine) ignores much of the CSS those
   templates relied on, and `font-size:0.85rem` — used in the old copy — is
   simply dropped by several major clients, because rem units are not
   supported. The result was legible but plainly homemade, which is not what a
   guest should get after paying for a stay.

   Everything here is therefore built the way HTML email actually has to be
   built, rather than the way a web page would be:

     • tables for layout, not divs — the only thing Outlook lays out reliably
     • px for every size — never rem, never em
     • inline styles on the elements themselves — <style> blocks are stripped
       by Gmail's web client and others
     • a fixed 600px content column, centred, on a tinted page background
     • a preheader line, so the inbox preview says something useful instead of
       repeating the subject or leaking the first table cell
     • width="100%" and max-width, so it still reads on a phone

   ── 2. It injected guest input into staff mailboxes ─────────────────────
   The old templates interpolated the guest's own name, email and phone
   straight into HTML. Those fields come from the public booking form, and
   `cleanField()` (routes/payments.js) only strips control characters — angle
   brackets pass through untouched. Anyone could therefore book under a name
   containing markup and have it rendered as live HTML inside the hotel's own
   notification email: a convincing place to put a link, since the message
   genuinely came from the hotel's system.

   So escaping here is not a convention to remember, it is the only way the
   API can be called. `row()`, `notice()`, `paragraph()` and `heading()` all
   escape their arguments. Where a caller genuinely needs markup — a <br>
   between two lines, an <a> to the policy page — it must say so explicitly
   with `raw()`, which is greppable and reviewable precisely because it is
   rare. There is no way to pass an unescaped string by accident.
   ============================================================ */

const BRAND = {
  teal: '#0c5b58',
  tealText: '#0f766e',
  gold: '#b8912f',
  ink: '#1f2426',
  inkSoft: '#5c6668',
  hairline: '#e4e8e8',
  page: '#f4f6f6',
  card: '#ffffff',
};

// The palette for the coloured callout boxes. Each is a plain background /
// border / text triple, because gradients and box-shadows do not survive.
const NOTICE_KINDS = {
  paid:     { bg: '#e9f6ec', border: '#a9d8b5', text: '#1a7f37' },
  pending:  { bg: '#eef2ff', border: '#b9c5f0', text: '#33408a' },
  due:      { bg: '#eef6f4', border: '#a9d6cb', text: '#0f4a3e' },
  warn:     { bg: '#fff4e5', border: '#f0c07a', text: '#8a5a00' },
  alert:    { bg: '#fdecea', border: '#f0b7b1', text: '#8a2a1a' },
  info:     { bg: '#f4f6f6', border: '#e0e5e5', text: '#41494b' },
};

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* An explicit, auditable escape hatch.

   Wrapping a string in raw() is the ONLY way to get unescaped markup into an
   email body. It is deliberately awkward and deliberately easy to grep for:
   every use is a place where someone decided markup was safe, and can be
   checked. Never wrap anything that came from a guest, an OTA email, or the
   database in it. */
function raw(html) {
  return { __raw: String(html == null ? '' : html) };
}

function render(value) {
  if (value && typeof value === 'object' && typeof value.__raw === 'string') return value.__raw;
  return escapeHtml(value);
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

function heading(text) {
  return `<h1 style="margin:0 0 6px;font-family:${SERIF};font-size:23px;line-height:1.3;` +
    `font-weight:normal;color:${BRAND.teal}">${render(text)}</h1>`;
}

function paragraph(text, opts) {
  const o = opts || {};
  const size = o.small ? 13 : 15;
  const color = o.muted ? BRAND.inkSoft : BRAND.ink;
  return `<p style="margin:0 0 14px;font-family:${FONT};font-size:${size}px;` +
    `line-height:1.6;color:${color}">${render(text)}</p>`;
}

/* A label/value pair in the details table.

   Labels sit in a fixed-width left column so the values line up down the
   message; on a narrow phone the table still collapses gracefully because
   neither column is given a hard pixel width. */
function row(label, value, opts) {
  const o = opts || {};
  const weight = o.strong ? '600' : 'normal';
  return `<tr>` +
    `<td style="padding:7px 16px 7px 0;font-family:${FONT};font-size:13px;` +
      `line-height:1.5;color:${BRAND.inkSoft};vertical-align:top;white-space:nowrap">${render(label)}</td>` +
    `<td style="padding:7px 0;font-family:${FONT};font-size:14px;line-height:1.5;` +
      `color:${BRAND.ink};font-weight:${weight};vertical-align:top">${render(value)}</td>` +
    `</tr>`;
}

function table(rowsHtml) {
  if (!rowsHtml) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;border-collapse:collapse;margin:4px 0 18px">${rowsHtml}</table>`;
}

/* A coloured callout — "paid online", "balance due at check-in", the
   non-refundable warning. Built as a single-cell table because a <div> with a
   border and padding is one of the things Outlook renders least reliably. */
function notice(kind, text, opts) {
  const c = NOTICE_KINDS[kind] || NOTICE_KINDS.info;
  const o = opts || {};
  const weight = o.strong ? '600' : 'normal';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 14px">` +
    `<tr><td style="background:${c.bg};border:1px solid ${c.border};border-radius:8px;` +
    `padding:12px 15px;font-family:${FONT};font-size:14px;line-height:1.55;` +
    `color:${c.text};font-weight:${weight}">${render(text)}</td></tr></table>`;
}

// A horizontal rule that survives Outlook, which ignores <hr> styling.
function divider() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:20px 0">` +
    `<tr><td style="border-top:1px solid ${BRAND.hairline};font-size:0;line-height:0">&nbsp;</td></tr></table>`;
}

/* The confirmation number, shown the way a guest actually uses it: large
   enough to read aloud over the phone, and set apart from the prose so it is
   findable by scrolling rather than by reading. */
function refBlock(label, ref) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 20px">` +
    `<tr><td style="background:${BRAND.page};border:1px solid ${BRAND.hairline};border-radius:10px;padding:14px 18px">` +
    `<div style="font-family:${FONT};font-size:11px;letter-spacing:.08em;text-transform:uppercase;` +
      `color:${BRAND.inkSoft};margin-bottom:4px">${render(label)}</div>` +
    `<div style="font-family:${FONT};font-size:22px;font-weight:700;letter-spacing:.02em;` +
      `color:${BRAND.teal}">${render(ref)}</div>` +
    `</td></tr></table>`;
}

/* Wraps a finished body in the page chrome: masthead, content card, footer.

   `preheader` is the line inboxes show next to the subject. Without one, mail
   clients grab whatever text comes first — which for the old templates meant
   the greeting, so every message previewed as "Dear ..." and told the reader
   nothing. It is hidden in the body itself by the usual zero-size span. */
function wrap({ preheader, body, accent, footer }) {
  const bar = accent || BRAND.teal;
  return `<!DOCTYPE html><html lang="en"><head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light only">` +
    `<meta name="supported-color-schemes" content="light only">` +
    `</head>` +
    `<body style="margin:0;padding:0;background:${BRAND.page};-webkit-text-size-adjust:100%">` +
    (preheader
      ? `<span style="display:none;font-size:1px;color:${BRAND.page};max-height:0;max-width:0;` +
        `opacity:0;overflow:hidden">${escapeHtml(preheader)}</span>`
      : '') +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${BRAND.page}">` +
    `<tr><td align="center" style="padding:24px 12px">` +

    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" ` +
      `style="width:600px;max-width:100%;background:${BRAND.card};border:1px solid ${BRAND.hairline};` +
      `border-radius:14px;overflow:hidden">` +

    // Masthead. Text, not an image: blocked images are the norm, and a hotel
    // name rendered as a broken-image icon is worse than no logo at all.
    `<tr><td style="background:${BRAND.teal};padding:22px 28px">` +
      `<div style="font-family:${SERIF};font-size:21px;letter-spacing:.06em;color:#ffffff">J PARK HOTEL</div>` +
      `<div style="font-family:${FONT};font-size:11px;letter-spacing:.16em;text-transform:uppercase;` +
        `color:#a9cfcb;margin-top:3px">Chonburi &middot; Thailand</div>` +
    `</td></tr>` +
    `<tr><td style="height:3px;background:${bar};font-size:0;line-height:0">&nbsp;</td></tr>` +

    `<tr><td style="padding:28px">${body}</td></tr>` +

    `</table>` +
    (footer ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" ` +
      `style="width:600px;max-width:100%"><tr><td style="padding:18px 28px 4px;text-align:center">${footer}</td></tr></table>` : '') +

    `</td></tr></table></body></html>`;
}

/* The address block under every message. Plain text and links only — the old
   version led with a remote logo image, which most clients block by default,
   so the footer commonly rendered as a broken image above the address. */
function footerBlock({ address, phones, email, site }) {
  const tel = (phones || []).map((n) =>
    `<a href="tel:${escapeHtml(String(n).replace(/[^\d+]/g, ''))}" style="color:${BRAND.tealText};text-decoration:none">${escapeHtml(n)}</a>`
  ).join(' &nbsp;/&nbsp; ');
  return `<div style="font-family:${FONT};font-size:12px;line-height:1.7;color:${BRAND.inkSoft}">` +
    `<div style="font-weight:600;color:${BRAND.ink}">J Park Hotel, Chonburi</div>` +
    `<div>${escapeHtml(address)}</div>` +
    `<div>${tel}${email ? ` &nbsp;&middot;&nbsp; <a href="mailto:${escapeHtml(email)}" style="color:${BRAND.tealText};text-decoration:none">${escapeHtml(email)}</a>` : ''}</div>` +
    (site ? `<div style="margin-top:6px"><a href="${escapeHtml(site)}" style="color:${BRAND.tealText};text-decoration:none">${escapeHtml(String(site).replace(/^https?:\/\//, ''))}</a></div>` : '') +
    `</div>`;
}

module.exports = {
  BRAND, FONT, SERIF,
  escapeHtml, raw, render,
  heading, paragraph, row, table, notice, divider, refBlock,
  wrap, footerBlock,
};
