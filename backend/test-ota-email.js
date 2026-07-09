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

// ── Confirmation with cancellation-POLICY boilerplate must NOT flip to
//    'cancelled' — this is the false-positive bug fixed 2026-07-09: a bare
//    keyword match on "cancellation" misfired on this exact kind of routine
//    policy text present in nearly every real OTA confirmation email. ──────
console.log('\n# Confirmation email with cancellation-policy boilerplate (must stay confirmed)');
{
  const p = parseOtaEmail({
    from: 'Agoda <bookings@agoda.com>',
    subject: 'Your booking is confirmed - AGD-11223344',
    text: [
      'Booking confirmed!',
      'Confirmation number: AGD-11223344',
      'Guest name: Somchai Lee',
      'Check-in: 2026-08-10',
      'Check-out: 2026-08-12',
      'Cancellation Policy: Free cancellation until 3 days before check-in.',
      'Cancel before 2026-08-07 to avoid a charge. After this date the booking becomes non-refundable.',
    ].join('\n'),
  });
  check('status-stays-confirmed', p.status, 'confirmed');
  check('ref', p.ref, 'AGD-11223344');
}

console.log('\n# Confirmation with "flexible cancellation" boilerplate (must stay confirmed)');
{
  const p = parseOtaEmail({
    from: 'Booking.com <noreply@booking.com>',
    subject: 'New reservation: 5544332211',
    text: [
      'You have a new booking!',
      'Booking number: 5544332211',
      'Guest name: Maria Santos',
      'Check-in: 2026-09-01',
      'Check-out: 2026-09-03',
      'This booking has flexible cancellation.',
    ].join('\n'),
  });
  check('status-stays-confirmed-2', p.status, 'confirmed');
}

// ── Real-world-shaped genuine cancellation emails, per channel ─────────────
console.log('\n# Booking.com genuine cancellation (explicit statement)');
{
  const p = parseOtaEmail({
    from: 'Booking.com <noreply@booking.com>',
    subject: 'Booking cancelled: 9988776600',
    text: 'Your reservation has been cancelled by the guest. Booking number: 9988776600.',
  });
  check('bkcom-cancel-status', p.status, 'cancelled');
}

console.log('\n# Agoda genuine cancellation (explicit statement)');
{
  const p = parseOtaEmail({
    from: 'Agoda <bookings@agoda.com>',
    subject: 'Reservation Cancelled - AGD-99887766',
    text: 'This is to confirm that reservation AGD-99887766 has been cancelled.',
  });
  check('agoda-cancel-status', p.status, 'cancelled');
}

console.log('\n# Trip.com genuine cancellation ("order" phrasing)');
{
  const p = parseOtaEmail({
    from: 'Trip.com <hotel@trip.com>',
    subject: 'Your order has been cancelled',
    text: 'Order 445566778 has been cancelled. Guest: Wei Zhang.',
  });
  check('trip-cancel-status', p.status, 'cancelled');
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

// ── Traveloka, recognized channel + a broadened guest-name label ────────────
console.log('\n# Traveloka confirmation with "Traveler name" label');
{
  const p = parseOtaEmail({
    from: 'Traveloka <noreply@traveloka.com>',
    subject: 'Booking confirmed',
    text: [
      'Your stay is confirmed.',
      'Booking ID: TRVK-5566778',
      'Traveler name: Nattapong Srisuk',
      'Check-in: 2026-08-01',
      'Check-out: 2026-08-03',
    ].join('\n'),
  });
  check('channel', p.channel, 'traveloka');
  check('guestName', p.guestName, 'Nattapong Srisuk');
  check('checkIn', p.checkIn, '2026-08-01');
  check('checkOut', p.checkOut, '2026-08-03');
}

// ── Unrecognized channel + "Booked by" label still resolves a guest name ────
console.log('\n# Unrecognized channel with "Booked by" label');
{
  const p = parseOtaEmail({
    from: 'reservations@somechannel.com',
    subject: 'New reservation',
    text: 'Booked by: Priya Sharma\nCheck-in: 2026-09-01\nCheck-out: 2026-09-04',
  });
  check('channel-other', p.channel, 'other');
  check('guestName', p.guestName, 'Priya Sharma');
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
