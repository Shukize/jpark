// Unit test for the OTA email parser (no server / DB needed).
// Run: node test-ota-email.js
'use strict';

const { parseOtaEmail } = require('./lib/otaEmailParser');

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { passed++; console.log(`  ok   ${label}: ${JSON.stringify(actual)}`); }
  else { failed++; console.log(`  FAIL ${label}: got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`); }
}

// ── Booking.com (plain text) ────────────────────────────────────────────────
console.log('\n# Booking.com plain-text confirmation');
{
  const p = parseOtaEmail({
    from: 'Booking.com <noreply@booking.com>',
    subject: 'New reservation: 1234567890',
    text: [
      'You have a new booking!',
      'Booking number: 1234567890',
      'Guest name: Daniel Robinson',
      'Check-in: Monday, 2 June 2026',
      'Check-out: Thursday, 5 June 2026',
      'Room: Deluxe Twin',
      'Guests: 2 adults',
      'Total price: THB 5,400',
      'Guest email: daniel.robinson@gmail.com',
    ].join('\n'),
  });
  check('channel', p.channel, 'booking');
  check('ref', p.ref, '1234567890');
  check('guestName', p.guestName, 'Daniel Robinson');
  check('checkIn', p.checkIn, '2026-06-02');
  check('checkOut', p.checkOut, '2026-06-05');
  check('room', p.room, 'Deluxe Twin');
  check('adults', p.adults, 2);
  check('total', p.total, 5400);
  check('currency', p.currency, 'THB');
  check('guestEmail', p.guestEmail, 'daniel.robinson@gmail.com');
  check('status', p.status, 'confirmed');
}

// ── Agoda (HTML, dd/mm/yyyy, ฿ symbol) ──────────────────────────────────────
console.log('\n# Agoda HTML confirmation');
{
  const p = parseOtaEmail({
    from: 'Agoda <bookings@agoda.com>',
    subject: 'Your guest is confirmed',
    html: `<html><body>
      <table>
        <tr><td>Confirmation number</td><td>AGD-849217643</td></tr>
        <tr><td>Guest name</td><td>Yuki Miyamoto</td></tr>
        <tr><td>Check-in</td><td>02/06/2026</td></tr>
        <tr><td>Check-out</td><td>03/06/2026</td></tr>
        <tr><td>Room type</td><td>Grand Suite</td></tr>
        <tr><td>Total</td><td>&#3647;1,850</td></tr>
      </table></body></html>`,
  });
  check('channel', p.channel, 'agoda');
  check('ref', p.ref, 'AGD-849217643');
  check('guestName', p.guestName, 'Yuki Miyamoto');
  check('checkIn', p.checkIn, '2026-06-02');
  check('checkOut', p.checkOut, '2026-06-03');
  check('room', p.room, 'Grand Suite');
  check('total', p.total, 1850);
  check('currency', p.currency, 'THB');
}

// ── Airbnb (guest in subject, ISO dates) ────────────────────────────────────
console.log('\n# Airbnb reservation');
{
  const p = parseOtaEmail({
    from: 'Airbnb <automated@airbnb.com>',
    subject: 'Reservation confirmed - Sarah Chen arrives Jun 10',
    text: [
      'Sarah Chen arrives soon.',
      'Confirmation code: HMABCDEFG',
      'Check-in: 2026-06-10',
      'Checkout: 2026-06-14',
      'Guests: 3 adults',
      'Total (THB): 12,000',
    ].join('\n'),
  });
  check('channel', p.channel, 'airbnb');
  check('ref', p.ref, 'HMABCDEFG');
  check('guestName', p.guestName, 'Sarah Chen');
  check('checkIn', p.checkIn, '2026-06-10');
  check('checkOut', p.checkOut, '2026-06-14');
  check('adults', p.adults, 3);
  check('status', p.status, 'confirmed');
}

// ── Cancellation + unreadable dates → stable ref, cancelled, no dates ────────
console.log('\n# Cancellation with no parseable dates');
{
  const p = parseOtaEmail({
    from: 'Booking.com <noreply@booking.com>',
    subject: 'Reservation 9988776655 has been cancelled',
    text: 'The guest has cancelled. Booking number: 9988776655.',
  });
  check('channel', p.channel, 'booking');
  check('ref', p.ref, '9988776655');
  check('status', p.status, 'cancelled');
  check('checkIn-null', p.checkIn, null);
  check('confirmation-preserved', /cancelled/i.test(p.confirmation), true);
}

// ── No ref at all → deterministic fallback ref, idempotent on re-parse ───────
console.log('\n# Idempotent fallback ref when no OTA reference present');
{
  const email = {
    from: 'reservations@somechannel.com',
    subject: 'New stay booked',
    text: 'Check-in: 2026-07-01\nCheck-out: 2026-07-03\nGuest name: Alex Lee',
  };
  const a = parseOtaEmail(email);
  const b = parseOtaEmail(email);
  check('ref-stable', a.ref, b.ref);
  check('ref-nonempty', a.ref.length > 4, true);
  check('channel-other', a.channel, 'other');
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
