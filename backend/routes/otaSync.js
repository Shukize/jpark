const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const router = express.Router();

// Timing-safe comparison of the inbound API key against OTA_WEBHOOK_SECRET.
function validKey(provided) {
  const expected = process.env.OTA_WEBHOOK_SECRET || '';
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Map a channel manager's free-text channel name onto our internal source enum
// (matches the front-end: agoda | booking | airbnb | trip | expedia | other).
function normalizeChannel(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s.includes('booking')) return 'booking';
  if (s.includes('agoda')) return 'agoda';
  if (s.includes('airbnb')) return 'airbnb';
  if (s.includes('trip')) return 'trip';
  if (s.includes('expedia')) return 'expedia';
  return 'other';
}

const label = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Drops a notification into the internal messages table (to_all) so it surfaces
// in the staff console exactly like any other broadcast message.
async function alertStaff(runner, subject, body) {
  await runner.query(
    `INSERT INTO messages (from_id, from_name, from_role, subject, body, to_all)
     VALUES ('system', 'OTA Sync', 'system', $1, $2, TRUE)`,
    [subject, body]
  );
}

// POST /api/v1/ota-sync
// Header: X-API-Key: <OTA_WEBHOOK_SECRET>
// Body:   { event, hotel_room_type, check_in, check_out, ota_channel }
router.post('/', async (req, res) => {
  if (!validKey(req.get('x-api-key'))) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }

  const { event, hotel_room_type, check_in, check_out, ota_channel } = req.body || {};

  // Acknowledge unknown event types immediately so the channel manager stops retrying them.
  if (event !== 'booking_created' && event !== 'booking_cancelled') {
    return res.status(202).json({ status: 'ignored', event: event || null });
  }

  if (!ota_channel) {
    return res.status(400).json({ error: 'ota_channel is required' });
  }

  const source = normalizeChannel(ota_channel);
  // Channel managers vary in what they name the reservation reference; accept the common ones.
  const otaRef =
    req.body.ota_ref || req.body.reservation_id || req.body.booking_id || req.body.ref || null;
  const guestName = req.body.guest_name || null;

  // ── booking_cancelled ──────────────────────────────────────────────────────
  if (event === 'booking_cancelled') {
    if (!otaRef) {
      return res.status(400).json({
        error: 'A reservation reference (ota_ref / reservation_id) is required to cancel a booking',
      });
    }
    const { rows: found } = await db.query(
      'SELECT * FROM bookings WHERE source = $1 AND ota_ref = $2 LIMIT 1',
      [source, otaRef]
    );
    if (!found.length) {
      console.log(`[ota-sync] cancel for unknown ref ${otaRef} (${source}) — no-op`);
      return res.status(200).json({ status: 'not_found' });
    }
    const booking = found[0];
    if (booking.status === 'cancelled') {
      return res.status(200).json({ status: 'already_cancelled', booking });
    }
    const { rows: updated } = await db.query(
      `UPDATE bookings SET status = 'cancelled' WHERE id = $1 RETURNING *`,
      [booking.id]
    );
    await alertStaff(
      db,
      `${label(source)} booking cancelled — ${booking.room_type} (Ref: ${otaRef})`,
      `${label(source)} cancelled a reservation.\n` +
        (booking.guest_name ? `Guest: ${booking.guest_name}\n` : '') +
        `Room type: ${booking.room_type}\n` +
        `Check-in: ${booking.check_in}\nCheck-out: ${booking.check_out}\nRef: ${otaRef}`
    );
    console.log(`[ota-sync] ${source} cancelled booking id=${booking.id} (ref=${otaRef})`);
    return res.status(200).json({ status: 'cancelled', booking: updated[0] });
  }

  // ── booking_created (continues below) ─────────────────────────────────────
  if (!hotel_room_type || !check_in || !check_out) {
    return res.status(400).json({
      error: 'hotel_room_type, check_in and check_out are required for booking_created',
    });
  }

  const ci = Date.parse(check_in);
  const co = Date.parse(check_out);
  if (Number.isNaN(ci) || Number.isNaN(co) || co <= ci) {
    return res.status(400).json({
      error: 'check_in/check_out must be valid dates with check_out after check_in',
    });
  }

  // Idempotency: webhooks retry. If we've already recorded this channel + ref, ack the existing booking.
  if (otaRef) {
    const { rows: dup } = await db.query(
      'SELECT * FROM bookings WHERE source = $1 AND ota_ref = $2 LIMIT 1',
      [source, otaRef]
    );
    if (dup.length) {
      return res.status(200).json({ status: 'duplicate', booking: dup[0] });
    }
  }

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Find one physical room of the requested type with no overlapping booking.
    // SKIP LOCKED + row lock prevents two concurrent webhooks grabbing the same room.
    const { rows: free } = await client.query(
      `SELECT id, room_number FROM rooms
        WHERE room_type = $1 AND active = TRUE
          AND NOT EXISTS (
            SELECT 1 FROM bookings b
             WHERE b.room_id = rooms.id
               AND b.status <> 'cancelled'
               AND b.check_in < $3
               AND b.check_out > $2
          )
        ORDER BY room_number
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
      [hotel_room_type, check_in, check_out]
    );

    if (!free.length) {
      await client.query('ROLLBACK');
      await alertStaff(
        db,
        `OTA booking needs attention — no ${hotel_room_type} free`,
        `${label(source)} sent a ${hotel_room_type} reservation for ${check_in} → ${check_out}, ` +
          `but no physical room of that type is available. Please resolve manually.`
      );
      return res.status(409).json({
        error: 'No available room for the requested type and dates',
        roomType: hotel_room_type,
      });
    }

    const room = free[0];
    const { rows: inserted } = await client.query(
      `INSERT INTO bookings (room_id, room_type, guest_name, check_in, check_out, source, ota_ref, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed')
       ON CONFLICT (source, ota_ref) WHERE ota_ref IS NOT NULL DO NOTHING
       RETURNING *`,
      [room.id, hotel_room_type, guestName, check_in, check_out, source, otaRef]
    );

    // A concurrent retry slipped in between the dedup check and this insert.
    if (!inserted.length) {
      await client.query('ROLLBACK');
      const { rows: existing } = await db.query(
        'SELECT * FROM bookings WHERE source = $1 AND ota_ref = $2 LIMIT 1',
        [source, otaRef]
      );
      return res.status(200).json({ status: 'duplicate', booking: existing[0] || null });
    }

    await alertStaff(
      client,
      `New ${label(source)} booking — ${hotel_room_type} (Room ${room.room_number})`,
      `An automated ${label(source)} reservation was just synced.\n` +
        (guestName ? `Guest: ${guestName}\n` : '') +
        `Room ${room.room_number} (${hotel_room_type})\n` +
        `Check-in: ${check_in}\nCheck-out: ${check_out}` +
        (otaRef ? `\nRef: ${otaRef}` : '')
    );

    await client.query('COMMIT');
    console.log(`[ota-sync] ${source} booking -> room ${room.room_number} (${check_in}..${check_out})`);

    res.status(201).json({
      status: 'created',
      booking: inserted[0],
      assignedRoom: room.room_number,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ota-sync]', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

module.exports = router;
