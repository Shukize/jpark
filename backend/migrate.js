const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { detectCancellation } = require('./lib/otaEmailParser');

/* Seed staff accounts on first run, and rotate them off the well-known
   default password (admin123 / staff123 — public in this source file) if
   they're still on it. A fresh random temp password is generated, hashed,
   and logged once to stdout (Render → Logs) so the owner can log in once
   and set a real password via the existing must_change_password flow —
   the same mechanism the admin "reset password" feature already uses. */
async function seedAuth() {
  let bcrypt;
  try { bcrypt = require('bcrypt'); } catch (_) { return; }

  const SEED = [
    { id: 'u_admin', username: 'admin', defaultPassword: 'admin123', role: 'admin' },
    { id: 'u_staff', username: 'staff', defaultPassword: 'staff123', role: 'frontdesk' },
  ];

  for (const s of SEED) {
    const { rows } = await db.query(
      'SELECT username, password_hash FROM employees WHERE id = $1',
      [s.id]
    );
    if (!rows.length) continue;

    const existingHash = rows[0].password_hash;
    const stillOnDefault = existingHash
      ? await bcrypt.compare(s.defaultPassword, existingHash)
      : true; // no hash yet — first boot
    if (existingHash && !stillOnDefault) continue; // owner already rotated it

    const tempPassword = crypto.randomBytes(9).toString('base64url');
    const hash = await bcrypt.hash(tempPassword, 10);
    await db.query(
      `UPDATE employees
          SET username = $1, password_hash = $2, must_change_password = TRUE
        WHERE id = $3`,
      [s.username, hash, s.id]
    );
    console.log(
      `[migrate] SECURITY: "${s.username}" was still on its default password — ` +
      `rotated to a one-time temporary password: ${tempPassword} ` +
      `(must be changed on first login)`
    );
  }
}

/* Seed welcome message in internal messaging if table is empty. */
async function seedMessages() {
  const { rows } = await db.query('SELECT id FROM messages LIMIT 1');
  if (rows.length) return;
  await db.query(
    `INSERT INTO messages (from_id, from_name, from_role, subject, body, to_all)
     VALUES ($1, $2, $3, $4, $5, TRUE)`,
    [
      'u_admin', 'Hotel Admin', 'admin',
      'Welcome to J Park Messaging',
      'Welcome to the internal messaging system. Use this space for private team communications and company-wide announcements.\n\nAll staff can send private messages to up to 10 colleagues at a time. Administrators can also broadcast announcements to everyone.\n\nBest regards,\nHotel Administration',
    ]
  );
}

async function removeHousekeeping() {
  await db.query(`DELETE FROM employees WHERE id IN ('e_malee', 'e_arun', 'e_ploy', 'e_kenji')`);
}

/* Normalise every employee's email + username to the initiallastname format
   so the system stays on a single convention even for accounts that pre-date
   the rule. Idempotent: only writes when the value differs. */
function nameToAlias(name) {
  const parts = String(name || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return parts.length > 1 ? parts[0][0] + parts[parts.length - 1] : parts[0];
}

async function normaliseEmployeeEmails() {
  const { rows } = await db.query('SELECT id, name, email, username FROM employees');
  for (const r of rows) {
    const alias = nameToAlias(r.name);
    if (!alias) continue;
    const desiredEmail = alias + '@jpark.hotel';
    const patches = [];
    const vals = [];
    if (r.email !== desiredEmail) { patches.push(`email = $${patches.length + 1}`); vals.push(desiredEmail); }
    // Only auto-rename the username if it's still the placeholder employee id
    // (e.g. "e_ploy") — never overwrite an alias a person has been using.
    if (!r.username || r.username === r.id) {
      // Skip if another row already owns the desired username.
      const { rows: clash } = await db.query(
        'SELECT id FROM employees WHERE username = $1 AND id <> $2',
        [alias, r.id]
      );
      if (!clash.length) {
        patches.push(`username = $${patches.length + 1}`); vals.push(alias);
      }
    }
    if (!patches.length) continue;
    vals.push(r.id);
    await db.query(
      `UPDATE employees SET ${patches.join(', ')} WHERE id = $${vals.length}`,
      vals
    );
  }
}

/* One-time (naturally idempotent) correction for the 2026-07-09 false-positive
   cancellation bug: the OTA parser used to flag a booking 'cancelled' if the
   word "cancellation" appeared anywhere in the email, including routine
   "free cancellation until [date]" policy boilerplate present in nearly every
   real confirmation email (see lib/otaEmailParser.js detectCancellation).
   Re-runs the FIXED detector against each auto-cancelled booking's stored raw
   email; restores ones that no longer read as a genuine cancellation, and
   posts a staff broadcast per restoration so it's an audited correction, not
   a silent one. Never touches staff-initiated cancellations
   (cancelled_by_id IS NOT NULL) — those were a deliberate human action, not
   the parser. RETIRED — no longer called on boot (see the note at migrate()'s
   end): with only the body persisted it can't see the subject-line cancellation
   signal, so it wrongly un-cancelled genuine cancellations. Kept for reference /
   one-off manual use. */
async function restoreFalsePositiveCancellations() {
  const { rows } = await db.query(
    `SELECT id, ref, channel, channel_name, guest_name, room, check_in, check_out, confirmation
       FROM guest_bookings
      WHERE status = 'cancelled' AND cancelled_by_id IS NULL`
  );
  let restored = 0;
  for (const r of rows) {
    // The original email subject line isn't persisted separately from the
    // raw body, so this re-check only has the stored `confirmation` text to
    // work with. Still catches the policy-boilerplate false positive this
    // migration exists to fix, since genuine cancellation emails restate the
    // cancellation in the body too (verified against real per-channel
    // phrasing in test-ota-email.js).
    if (detectCancellation('', r.confirmation || '')) continue; // still reads as a real cancellation

    await db.query(
      `UPDATE guest_bookings
          SET status = 'confirmed', cancelled_at = NULL, previous_status = NULL
        WHERE id = $1`,
      [r.id]
    );
    // Announce the correction once. The restore itself runs every boot as
    // needed, but re-running this audit on each redeploy must NOT re-broadcast
    // the same "auto-restored" notice — that (plus the OTA flip-flop) is what
    // flooded the staff announcements with hundreds of duplicates. Idempotent
    // by subject, matching guestBookings.js broadcastStaffMessage().
    const subject = `✅ Booking auto-restored — ${r.channel_name || r.channel || 'Direct'} (${r.ref})`;
    const already = await db.query(
      `SELECT 1 FROM messages WHERE to_all = TRUE AND from_role = 'system' AND subject = $1 LIMIT 1`,
      [subject]
    );
    if (!already.rows.length) {
      await db.query(
        `INSERT INTO messages (from_id, from_name, from_role, subject, body, to_all)
         VALUES ('system', 'Booking System', 'system', $1, $2, TRUE)`,
        [
          subject,
          [
            'Previously flagged cancelled by a parser bug (matched routine cancellation-policy text, not a real cancellation) — restored to confirmed.',
            `Guest: ${r.guest_name || '—'}`,
            `Room: ${r.room || '—'}`,
            `Check-in: ${r.check_in}`,
            `Check-out: ${r.check_out}`,
            `Ref: ${r.ref}`,
            'Please verify with the guest if there is any doubt.',
          ].join('\n'),
        ]
      );
    }
    restored++;
  }
  if (rows.length) {
    console.log(`[migrate] cancellation re-audit: ${restored} of ${rows.length} auto-cancelled bookings restored to confirmed`);
  }
}

async function migrate() {
  const sql = require('fs').readFileSync(require('path').join(__dirname, 'schema.sql'), 'utf8');
  await db.query(sql);
  console.log('[migrate] schema up to date');

  await removeHousekeeping();
  console.log('[migrate] housekeeping employees removed');

  await seedAuth();
  console.log('[migrate] staff auth ready');

  await normaliseEmployeeEmails();
  console.log('[migrate] employee emails normalised');

  await seedMessages();
  console.log('[migrate] messages seeded');

  // restoreFalsePositiveCancellations() is intentionally NOT called on boot.
  // It was a one-time correction for the 2026-07-09 false-positive cancellation
  // bug (since fixed in lib/otaEmailParser.js). The stored `confirmation` is the
  // email BODY only — the subject is not persisted (see parseOtaEmail) — so the
  // re-audit runs detectCancellation('', body) and can't see the subject-line
  // signal that ingestion relies on. Run every boot it therefore UN-cancelled
  // genuine OTA cancellations whose body didn't restate the cancellation,
  // flip-flopping bookings between cancelled/confirmed (and flooding the staff
  // announcements). The fixed parser self-corrects any real false positive on
  // re-ingestion, so this boot-time pass is retired. The function is kept below
  // for reference / deliberate one-off manual use only.
}

module.exports = migrate;
module.exports.restoreFalsePositiveCancellations = restoreFalsePositiveCancellations;
