/* ============================================================
   J Park Hotel — OTA confirmation-email parser
   ------------------------------------------------------------
   Turns a forwarded OTA reservation email (Agoda, Booking.com,
   Airbnb, Trip.com, Expedia …) into the booking payload shape
   that guestBookings.ingestGuestBooking() understands.

   Design notes / philosophy:
   - OTA email templates change often and differ wildly, so field
     extraction is deliberately BEST-EFFORT. The route that uses
     this parser ALWAYS stores the full raw email as the booking's
     `confirmation` body, so the front desk never loses a booking
     even when a field can't be read — they can read the original
     and correct any blanks in the console.
   - A deterministic fallback `ref` is derived from the email when
     the OTA reference can't be found, so the same email forwarded
     twice de-duplicates instead of creating a second booking.
   - Pure / dependency-free (only Node's crypto) so it is unit
     testable without a database or network — see test-ota-email.js.
   ============================================================ */
'use strict';

const crypto = require('crypto');

const CHANNEL_META = {
  agoda:     { name: 'Agoda',         email: 'bookings@agoda.com' },
  booking:   { name: 'Booking.com',   email: 'noreply@booking.com' },
  airbnb:    { name: 'Airbnb',        email: 'automated@airbnb.com' },
  trip:      { name: 'Trip.com',      email: 'hotel@trip.com' },
  expedia:   { name: 'Expedia',       email: 'hotel@expedia.com' },
  traveloka: { name: 'Traveloka',     email: 'noreply@traveloka.com' },
  hotelscom: { name: 'Hotels.com',    email: 'noreply@hotels.com' },
  other:     { name: 'Other channel', email: 'noreply@booking-channel.com' },
};

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/* Collapse an HTML email body to readable, line-broken plain text. */
function htmlToText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<\s*(br|\/p|\/div|\/tr|\/li|\/h[1-6]|\/td)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* Decide which OTA an email came from, by sender then subject/body. */
function detectChannel(from, subject, body) {
  const s = `${from || ''} ${subject || ''} ${body || ''}`.toLowerCase();
  if (s.includes('agoda')) return 'agoda';
  if (s.includes('airbnb')) return 'airbnb';
  if (s.includes('expedia')) return 'expedia';
  if (s.includes('trip.com') || s.includes('ctrip')) return 'trip';
  if (s.includes('booking.com') || s.includes('@booking.com') || /\bbooking number\b/i.test(s))
    return 'booking';
  if (s.includes('traveloka')) return 'traveloka';
  if (s.includes('hotels.com')) return 'hotelscom';
  return 'other';
}

function toISO(d) {
  if (!d || isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* Parse the many date shapes OTAs use into YYYY-MM-DD, or null.
   Handles: 2026-06-02 · 2 Jun 2026 · Mon, 2 June 2026 · June 2, 2026
   · 02/06/2026 (day-first when unambiguous). */
function parseDateLoose(str) {
  if (!str) return null;
  const s = String(str).trim();

  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // "2 Jun 2026" / "2 June 2026"
  m = s.match(/(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon != null) return toISO(new Date(+m[3], mon, +m[1]));
  }
  // "June 2, 2026" / "Jun 2 2026"
  m = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mon != null) return toISO(new Date(+m[3], mon, +m[2]));
  }
  // "02/06/2026" or "02-06-2026" — assume day-first (OTA/intl default),
  // but if the first field is > 12 it can only be a day, so trust it.
  m = s.match(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (m) {
    let [, d1, d2, y] = m;
    d1 = +d1; d2 = +d2; y = +y < 100 ? 2000 + +y : +y;
    const day = d1 > 12 ? d1 : d1;       // day-first
    const mon = d1 > 12 ? d2 - 1 : d2 - 1;
    const iso = toISO(new Date(y, mon, day));
    if (iso) return iso;
  }
  const d = new Date(s);
  return toISO(d);
}

/* Find a value sitting after a label, on the same line or — for the
   table-style layouts that HTML→text produces — on a following line.
   Labels are tried in PRIORITY order across the whole body: a strong
   label ("Check-in") on a late line beats a weak one ("Arrive", which
   also matches "arrives") on an early line. */
function valueNear(body, labels) {
  const lines = body.split('\n');
  for (const lab of labels) {
    const labLo = lab.toLowerCase();
    for (let i = 0; i < lines.length; i++) {
      const idx = lines[i].toLowerCase().indexOf(labLo);
      if (idx < 0) continue;
      const rest = lines[i].slice(idx + lab.length).replace(/^[\s:•\-–—|>]+/, '').trim();
      if (rest) return rest;
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        if (lines[j].trim()) return lines[j].trim();
      }
    }
  }
  return null;
}

/* Adults / children counts, by pattern rather than label so "2 adults"
   and "Adults: 2" both work without colliding with the word "Guest". */
function findGuests(body) {
  let adults = null;
  let children = null;
  let m = body.match(/(\d+)\s*adults?/i) || body.match(/adults?\s*[:\-]?\s*(\d+)/i);
  if (m) adults = +m[1];
  m = body.match(/(\d+)\s*child(?:ren)?/i) || body.match(/child(?:ren)?\s*[:\-]?\s*(\d+)/i);
  if (m) children = +m[1];
  if (adults == null) {
    m = body.match(/(?:guests?|occupancy|no\.?\s*of\s*guests)\s*[:\-]?\s*(\d+)/i)
      || body.match(/(\d+)\s*guests?/i);
    if (m) adults = +m[1];
  }
  return { adults, children };
}

const CUR_SYMBOL = { '฿': 'THB', $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };

function parseMoney(str) {
  if (!str) return { total: null, currency: null };
  const symMatch = str.match(/[฿$€£¥]/);
  const codeMatch = str.match(/\b(THB|USD|EUR|GBP|JPY|SGD|AUD|CNY|RMB|HKD|MYR|KRW)\b/i);
  const numMatch = str.match(/\d[\d,]*(?:\.\d+)?/);
  let currency = null;
  if (codeMatch) currency = codeMatch[1].toUpperCase();
  else if (symMatch) currency = CUR_SYMBOL[symMatch[0]] || null;
  if (currency === 'RMB') currency = 'CNY';
  const total = numMatch ? parseFloat(numMatch[0].replace(/,/g, '')) : null;
  return { total: Number.isFinite(total) ? total : null, currency };
}

/* Pull the most plausible OTA confirmation/booking reference. */
function findRef(body, subject) {
  const hay = `${subject || ''}\n${body || ''}`;
  const patterns = [
    /(?:confirmation|booking|reservation|itinerary)\s*(?:number|no\.?|id|code|reference|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9.\- ]{4,30}?)(?=\s|$)/i,
    /(?:confirmation|reference)\s*[:#]\s*([A-Z0-9][A-Z0-9.\-]{4,30})/i,
    /\bRef(?:erence)?\.?\s*[:#]\s*([A-Z0-9][A-Z0-9.\-]{4,30})/i,
  ];
  for (const re of patterns) {
    const m = hay.match(re);
    if (m && m[1]) {
      const cleaned = m[1].replace(/[.\s]+$/, '').replace(/\s{2,}.*$/, '').trim();
      if (cleaned.length >= 5) return cleaned;
    }
  }
  return null;
}

/* A stable short hash so re-forwarding the same email is idempotent
   even when no OTA reference could be extracted. */
function shortHash(str) {
  return crypto.createHash('sha1').update(String(str)).digest('hex').slice(0, 10).toUpperCase();
}

function findEmail(body, channel) {
  const matches = body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [];
  for (const e of matches) {
    const lo = e.toLowerCase();
    // skip the OTA's own / no-reply addresses; we want the guest's.
    if (/(agoda|booking\.com|airbnb|trip\.com|expedia|noreply|no-reply|notification|automated|jpark)/i.test(lo))
      continue;
    return e;
  }
  return null;
}

function findPhone(body) {
  const m = body.match(/(?:\+?\d[\d\s().\-]{7,}\d)/);
  if (!m) return null;
  const digits = m[0].replace(/[^\d+]/g, '');
  return digits.length >= 8 ? m[0].trim() : null;
}

/* Best-effort guest name: OTA-specific subject patterns first (Airbnb
   puts the guest in the subject), then explicit in-body labels. Labels
   use a trailing colon ("Guest:") so they don't match the plural
   "Guests:" header that precedes an occupancy count. */
function findGuestName(body, subject, channel) {
  if (channel === 'airbnb' && subject) {
    let m = subject.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+arrives/);
    if (m) return m[1].trim();
    m = subject.match(/reservation confirmed\s*[-:]?\s*(?:for\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (m) return m[1].trim();
  }
  const labelled = valueNear(body, [
    'Guest name', 'Name of guest', 'Lead guest', 'Booker name', 'Guest:', 'Name:',
    'Traveler name', 'Traveller name', 'Customer name', 'Booked by',
    'Contact name', 'Reservation holder',
  ]);
  if (labelled && /^[A-Za-z]/.test(labelled) && labelled.length <= 60 && !/@/.test(labelled)) {
    const name = labelled.replace(/\s{2,}.*$/, '').replace(/\s*\d.*$/, '').trim();
    if (name && /[A-Za-z]{2,}/.test(name)) return name;
  }
  return null;
}

/**
 * Parse a forwarded OTA email into a booking payload.
 * @param {{subject?:string, from?:string, text?:string, html?:string}} email
 * @returns {object} payload for guestBookings.ingestGuestBooking()
 */
function parseOtaEmail(email) {
  const e = email || {};
  const subject = e.subject || '';
  const from = e.from || '';
  const rawText = e.text && e.text.trim() ? e.text : htmlToText(e.html);
  const body = (rawText || '').replace(/\r/g, '');

  const channel = detectChannel(from, subject, body);
  const meta = CHANNEL_META[channel];

  const cancelled = /\b(cancell?ed|cancellation)\b/i.test(`${subject}\n${body}`);

  const checkIn = parseDateLoose(
    valueNear(body, ['Check-in', 'Check in', 'Checkin', 'Arrival', 'Arrive'])
  );
  const checkOut = parseDateLoose(
    valueNear(body, ['Check-out', 'Check out', 'Checkout', 'Departure', 'Depart'])
  );

  const room = (() => {
    const r = valueNear(body, ['Room type', 'Room Type', 'Accommodation type', 'Unit type', 'Room', 'Accommodation']);
    return r ? r.replace(/\s{2,}.*$/, '').slice(0, 50).trim() : null;
  })();

  const ref = findRef(body, subject)
    || `${channel.toUpperCase()}-${shortHash(`${channel}|${subject}|${checkIn}|${checkOut}|${body.slice(0, 200)}`)}`;

  const { adults, children } = findGuests(body);
  const money = parseMoney(valueNear(body, ['Total price', 'Total amount', 'Grand total', 'Total', 'Amount', 'Price']));

  const guestName = findGuestName(body, subject, channel);
  const guestEmail = findEmail(body, channel);
  const guestPhone = findPhone(body);

  return {
    channel,
    channelName: meta.name,
    channelEmail: meta.email,
    ref,
    guestName: guestName || null,
    guestEmail: guestEmail || null,
    guestPhone: guestPhone || null,
    room: room || null,
    checkIn: checkIn || null,
    checkOut: checkOut || null,
    adults: adults != null ? adults : null,
    children: children != null ? children : null,
    total: money.total,
    currency: money.currency || null,
    status: cancelled ? 'cancelled' : 'confirmed',
    lang: 'en',
    // The full email is always preserved so staff can read the original.
    confirmation: body.slice(0, 8000),
  };
}

module.exports = {
  parseOtaEmail,
  detectChannel,
  parseDateLoose,
  parseMoney,
  htmlToText,
  CHANNEL_META,
};
