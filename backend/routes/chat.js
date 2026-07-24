/* ============================================================
   J Park Hotel — live chat routes
   GET  /api/chat?guestId=X       get conversation (guest or staff)
   GET  /api/chat/all             all conversations summary (staff)
   POST /api/chat                 post a message
   POST /api/chat/identify        guest says who they are (guest / visitor)
   PATCH /api/chat/:guestId/read  mark staff messages read (guest)
   PATCH /api/chat/:guestId/assign  switch which staff owns a chat
   PATCH /api/chat/:guestId/confirm-guest  staff vouch for a self-declared guest
   PATCH /api/chat/:guestId/rename  rename a chat thread
   PATCH /api/chat/message/:id/pin  toggle pin on a single message
   DELETE /api/chat/:guestId      remove a chat thread
   POST /api/chat/bulk-delete     remove several threads at once

   Who's talking: a thread carries an identity (guest_kind / guest_verified /
   booking_*) set ONLY by /identify and /confirm-guest. Every other write
   inherits it from the thread — a message POST can never name itself, which
   is what let the old free-text guestName field label anyone as anyone.
   ============================================================ */
const express = require('express');
const db = require('../db');
const { requireAuth, verifyToken } = require('../middleware/auth');
const { makeLimiter } = require('../lib/rateLimit');
const { findBooking, stayStatus } = require('../lib/guestLookup');

const router = express.Router();

// Public chat POST is unauthenticated by design (guests have no login), so
// guard it against flooding and cap message length. 30 posts/min per IP.
const chatPostRateLimited = makeLimiter(30, 60 * 1000);
// Identifying is a booking lookup, so it carries the same guest-enumeration
// risk as the guest-portal login — but it CANNOT use that route's tight
// per-IP budget: everyone chatting from the hotel's own Wi-Fi shares one
// public IP, so a 20/10min ceiling would lock out real guests on a busy
// evening after a handful of arrivals had signed in. Instead the per-IP
// ceiling is loose enough to absorb a whole floor of guests, and a second,
// tight per-thread budget stops any single widget grinding through guesses.
// (guestId is client-chosen, so the per-thread limit alone proves nothing —
// it just makes scripted retries from one chat box pointless.)
const identifyIpRateLimited = makeLimiter(60, 10 * 60 * 1000);
const identifyThreadRateLimited = makeLimiter(8, 10 * 60 * 1000);
const MAX_CHAT_TEXT = 2000;

// Identity columns, listed once — they're read back on nearly every query and
// an explicit projection keeps this table's egress down (a SELECT * on the
// staff poll is what suspended the database in July).
const IDENTITY_COLS =
  'guest_kind, guest_verified, booking_id, booking_ref, confirmed_by';

function row2msg(r) {
  return {
    id: r.id,
    from: r.from_role,
    fromName: r.from_name,
    text: r.body,
    lang: r.lang,
    escalated: r.escalated,
    pinned: !!r.pinned,
    requestKind: r.request_kind || null,
    requestId: r.request_id != null ? Number(r.request_id) : null,
    ts: new Date(r.created_at).getTime(),
  };
}

/* GET /api/chat/available-staff — on-shift Front Desk staff (public, for guest
   chat routing). Admins are deliberately excluded so guest chats only ever
   connect to a frontdesk teammate.
   The stored `status` column can be stale (it's only updated manually), so we
   validate each employee's shift string against the current ICT (UTC+7) time —
   the same logic the frontend employee board uses for live status display. */
router.get('/available-staff', async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, status, shift FROM employees
        WHERE role = 'frontdesk' AND active = TRUE
        ORDER BY name`
    );

    // ICT = UTC+7; minutes elapsed since local midnight.
    const ictNow = new Date(Date.now() + 7 * 3600 * 1000);
    const curMin = ictNow.getUTCHours() * 60 + ictNow.getUTCMinutes();

    function isActuallyOnShift(emp) {
      // Employees on a manual break are unavailable regardless of clock time.
      if (emp.status === 'on_break') return false;
      if (!emp.shift) return false;
      const m = emp.shift.match(/(\d{1,2}):(\d{2})\s*[–\-]\s*(\d{1,2}):(\d{2})/);
      if (!m) return false;
      const start = parseInt(m[1]) * 60 + parseInt(m[2]);
      const end   = parseInt(m[3]) * 60 + parseInt(m[4]);
      // Overnight shifts (e.g. 23:00–07:00) wrap past midnight.
      return start < end
        ? curMin >= start && curMin < end
        : curMin >= start || curMin < end;
    }

    res.json(rows.filter(isActuallyOnShift).map((r) => ({ id: r.id, name: r.name })));
  } catch (e) {
    console.error('[chat] available-staff', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /api/chat/identify — the guest says who they are, before the front desk
   is ever pulled in. Public (guests have no login); see the limiters above for
   why its abuse budget is shaped differently from the guest portal's.

   Body: { guestId, kind: 'guest'|'visitor', lastName?, room?, ref?,
           unconfirmed?, systemText?, lang }

   Three outcomes, which is what the staff console renders as its three tiers:
     • kind 'visitor'                → just asking; no name, no room.
     • kind 'guest' + booking found  → verified. Name/room/ref are taken from
       the BOOKING ROW, never from the request, so the badge means something.
     • kind 'guest' + no booking     → answered { verified: false } and nothing
       is stamped; the widget then offers "continue anyway", which comes back
       with unconfirmed:true and records the self-declared details. This is the
       route walk-in guests take, and any guest whose stay simply isn't on
       file, so they're recorded honestly as unconfirmed for staff to vouch
       for rather than being turned away. (OTA reservations ARE filed again as
       of 2026-07-23 — see STORE_OTA_BOOKINGS in routes/guestBookings.js — so
       an OTA guest whose confirmation reached us verifies normally.)

   The identity is stamped across every existing row AND written as a fresh
   system message. The message isn't cosmetic: the chooser usually fires before
   the guest has sent anything, so with no rows to update the identity would
   have nowhere to live. It doubles as the in-thread audit line staff read. */
router.post('/identify', async (req, res) => {
  const { guestId, kind, lastName, room, ref, unconfirmed, systemText, lang } = req.body || {};
  if (!guestId) return res.status(400).json({ error: 'guestId required' });
  if (identifyIpRateLimited(req.ip || 'unknown') || identifyThreadRateLimited(guestId)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again in a few minutes.' });
  }
  if (kind !== 'guest' && kind !== 'visitor') {
    return res.status(400).json({ error: "kind must be 'guest' or 'visitor'" });
  }

  try {
    let identity = {
      guest_kind: 'visitor',
      guest_verified: false,
      guest_name: null,
      room: null,
      booking_id: null,
      booking_ref: null,
    };
    let booking = null;

    if (kind === 'guest') {
      booking = await findBooking({ ref, lastName, room });
      if (booking) {
        identity = {
          guest_kind: 'guest',
          guest_verified: true,
          guest_name: booking.guest_last_name || booking.guest_name,
          room: booking.room_number || booking.room,
          booking_id: booking.id,
          booking_ref: booking.ref,
        };
      } else if (unconfirmed) {
        // Self-declared. Capped like any other guest-supplied string.
        identity = {
          guest_kind: 'guest',
          guest_verified: false,
          guest_name: lastName ? String(lastName).trim().slice(0, 100) : null,
          room: room ? String(room).trim().slice(0, 20) : null,
          booking_id: null,
          booking_ref: null,
        };
      } else {
        // Nothing matched and they haven't chosen to continue anyway — say so
        // without touching the thread, so a typo doesn't strand them mid-tier.
        return res.json({ ok: true, verified: false, matched: false });
      }
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE chat_messages
            SET guest_kind = $1, guest_verified = $2, guest_name = $3, room = $4,
                booking_id = $5, booking_ref = $6, confirmed_by = NULL
          WHERE guest_id = $7`,
        [
          identity.guest_kind, identity.guest_verified, identity.guest_name,
          identity.room, identity.booking_id, identity.booking_ref, guestId,
        ]
      );
      if (systemText) {
        // The widget sends its already-localised line as a template; the name
        // and room are filled in HERE, from whatever was actually resolved, so
        // the confirmation the guest reads can't claim a room nobody checked.
        const line = String(systemText)
          .replace('{name}', identity.guest_name || '')
          .replace('{room}', identity.room || '')
          .slice(0, 500);
        await client.query(
          `INSERT INTO chat_messages
             (guest_id, guest_name, room, from_role, body, lang,
              guest_kind, guest_verified, booking_id, booking_ref)
           VALUES ($1,$2,$3,'system',$4,$5,$6,$7,$8,$9)`,
          [
            guestId, identity.guest_name, identity.room,
            line, lang || 'en',
            identity.guest_kind, identity.guest_verified,
            identity.booking_id, identity.booking_ref,
          ]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({
      ok: true,
      matched: !!booking,
      kind: identity.guest_kind,
      verified: identity.guest_verified,
      name: identity.guest_name,
      room: identity.room,
      ref: identity.booking_ref,
      checkIn: booking ? booking.check_in : null,
      checkOut: booking ? booking.check_out : null,
      stayStatus: stayStatus(booking),
    });
  } catch (e) {
    console.error('[chat] identify', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* GET /api/chat/all — all conversations grouped by guest (staff only).
   Includes the currently assigned staff so every console can show who owns
   each thread (and only that account's badge ticks). */
router.get('/all', requireAuth, async (_req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT DISTINCT ON (guest_id)
        guest_id, guest_name, room,
        body AS last_msg,
        lang,
        escalated,
        assigned_staff_id,
        assigned_staff_name,
        guest_kind, guest_verified, booking_id, booking_ref, confirmed_by,
        created_at AS last_at,
        -- Guest messages since the last time a HUMAN answered. Only 'staff'
        -- counts as an answer: this used to include 'system', but every
        -- escalation posts a system notice ("our front desk will reply here…")
        -- immediately AFTER the question that triggered it — so a brand-new
        -- guest chat arrived at the console reading zero unread, and the
        -- badge, the chime and the notification all stayed silent on the one
        -- event they exist for. 'bot' is excluded for the same reason: the
        -- assistant failing to answer is precisely when a person is needed.
        (SELECT COUNT(*) FROM chat_messages cm2
          WHERE cm2.guest_id = cm.guest_id
            AND cm2.from_role = 'guest'
            AND cm2.created_at > GREATEST(
              COALESCE(
                (SELECT created_at FROM chat_messages
                  WHERE guest_id = cm.guest_id AND from_role = 'staff'
                  ORDER BY created_at DESC LIMIT 1),
                '1970-01-01'::timestamptz
              ),
              -- ...or the last time a staff member OPENED this thread (see
              -- chat_reads). Without this, unread only ever cleared by REPLYING:
              -- reading zeroed the badge locally and the next poll lit it back up.
              COALESCE(
                (SELECT last_read_at FROM chat_reads
                  WHERE guest_id = cm.guest_id AND scope = 'chat' AND role = 'staff'),
                '1970-01-01'::timestamptz
              )
            )
        ) AS unread_for_staff
      FROM chat_messages cm
      ORDER BY guest_id, created_at DESC
    `);

    const convos = rows.map((r) => ({
      id: r.guest_id,
      guestName: r.guest_name,
      room: r.room,
      lastMsg: r.last_msg,
      lang: r.lang,
      escalated: r.escalated,
      assignedStaffId: r.assigned_staff_id,
      assignedStaffName: r.assigned_staff_name,
      guestKind: r.guest_kind,
      guestVerified: !!r.guest_verified,
      bookingId: r.booking_id,
      bookingRef: r.booking_ref,
      confirmedBy: r.confirmed_by,
      lastAt: new Date(r.last_at).getTime(),
      unreadForStaff: Number(r.unread_for_staff),
    }));
    res.json(convos);
  } catch (e) {
    console.error('[chat] all', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* GET /api/chat/updates?guestId=X&since=<epoch ms> — "has the front desk
   answered?", in a few bytes.

   The widget needs to keep watching while the guest has the chat panel CLOSED
   (that is the whole point of the bubble's unread badge), and it cannot do
   that by re-fetching the full conversation every few seconds: pulling every
   message body of every open thread on a timer is precisely the egress
   pattern that suspended the database in July. This returns three numbers and
   never a message body, so a closed panel costs almost nothing to keep live.

   staffNew counts only from_role='staff' — real replies from a human. Not
   'system': the widget posts its own escalation notice, and counting that
   would have the guest badged for their own message. */
router.get('/updates', async (req, res) => {
  const { guestId } = req.query;
  if (!guestId) return res.status(400).json({ error: 'guestId required' });
  const since = Number(req.query.since) || 0;
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(MAX(EXTRACT(EPOCH FROM created_at) * 1000), 0) AS last_at,
              COUNT(*) FILTER (
                WHERE from_role = 'staff' AND created_at > to_timestamp($2 / 1000.0)
              )::int AS staff_new
         FROM chat_messages
        WHERE guest_id = $1`,
      [guestId, since]
    );
    const r = rows[0] || {};
    res.json({
      count: Number(r.count) || 0,
      lastAt: Number(r.last_at) || 0,
      staffNew: Number(r.staff_new) || 0,
    });
  } catch (e) {
    console.error('[chat] updates', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* GET /api/chat/request-summary?guestId=X   — the guest's own request tags
   GET /api/chat/request-summary              — every open request's tags (staff)

   Cheap per-request counts so the Guest Requests board (and the guest's own
   tracker) can show "💬 2" on a card without each card fetching its own full
   thread. Mirrors GET /api/chat/all's unread subquery, just grouped by
   request instead of by guest. Bounded to the last 7 days for the staff
   (all-requests) path — same guardrail as the board itself (see
   routes/serviceRequests.js) — an unbounded GROUP BY on a 10s poll is the
   same egress mistake that suspended the database in July. */
router.get('/request-summary', async (req, res) => {
  const { guestId } = req.query;

  if (guestId) {
    try {
      const { rows } = await db.query(
        `SELECT request_kind, request_id,
                COUNT(*)::int AS count,
                MAX(created_at) AS last_at,
                COUNT(*) FILTER (
                  WHERE from_role = 'staff' AND created_at > GREATEST(
                    COALESCE(
                      (SELECT created_at FROM chat_messages cm2
                        WHERE cm2.request_kind = cm.request_kind AND cm2.request_id = cm.request_id
                          AND cm2.guest_id = cm.guest_id AND cm2.from_role = 'guest'
                        ORDER BY created_at DESC LIMIT 1),
                      '1970-01-01'::timestamptz
                    ),
                    COALESCE(
                      (SELECT last_read_at FROM chat_reads
                        WHERE guest_id = cm.guest_id
                          AND scope = 'req:' || cm.request_kind || ':' || cm.request_id
                          AND role = 'guest'),
                      '1970-01-01'::timestamptz
                    )
                  )
                )::int AS unread_for_guest
           FROM chat_messages cm
          WHERE guest_id = $1 AND request_kind IS NOT NULL
          GROUP BY request_kind, request_id`,
        [guestId]
      );
      res.json(rows.map((r) => ({
        requestKind: r.request_kind,
        requestId: Number(r.request_id),
        count: r.count,
        lastAt: new Date(r.last_at).getTime(),
        unreadForGuest: r.unread_for_guest,
      })));
    } catch (e) {
      console.error('[chat] request-summary (guest)', e);
      res.status(500).json({ error: 'Database error' });
    }
    return;
  }

  return requireAuth(req, res, async () => {
    try {
      const { rows } = await db.query(
        `SELECT request_kind, request_id,
                COUNT(*)::int AS count,
                MAX(created_at) AS last_at,
                COUNT(*) FILTER (
                  WHERE from_role = 'guest' AND created_at > GREATEST(
                    COALESCE(
                      (SELECT created_at FROM chat_messages cm2
                        WHERE cm2.request_kind = cm.request_kind AND cm2.request_id = cm.request_id
                          AND cm2.guest_id = cm.guest_id AND cm2.from_role = 'staff'
                        ORDER BY created_at DESC LIMIT 1),
                      '1970-01-01'::timestamptz
                    ),
                    COALESCE(
                      (SELECT last_read_at FROM chat_reads
                        WHERE guest_id = cm.guest_id
                          AND scope = 'req:' || cm.request_kind || ':' || cm.request_id
                          AND role = 'staff'),
                      '1970-01-01'::timestamptz
                    )
                  )
                )::int AS unread_for_staff
           FROM chat_messages cm
          WHERE request_kind IS NOT NULL AND created_at > NOW() - INTERVAL '7 days'
          GROUP BY request_kind, request_id`
      );
      res.json(rows.map((r) => ({
        requestKind: r.request_kind,
        requestId: Number(r.request_id),
        count: r.count,
        lastAt: new Date(r.last_at).getTime(),
        unreadForStaff: r.unread_for_staff,
      })));
    } catch (e) {
      console.error('[chat] request-summary (staff)', e);
      res.status(500).json({ error: 'Database error' });
    }
  });
});

/* GET /api/chat?guestId=X                       — full conversation for one guest
   GET /api/chat?guestId=X&kind=service&id=42     — only the messages tagged to
                                                      that one request (still the
                                                      SAME thread — see schema.sql
                                                      on request_kind/request_id)
   The board and the guest's request tracker use the filtered form so a
   request card can show its own remarks inline without pulling (or the guest
   reading) the whole account-wide conversation. */
router.get('/', async (req, res) => {
  const { guestId, kind, id } = req.query;
  if (!guestId) return res.status(400).json({ error: 'guestId required' });
  const reqId = id != null ? parseInt(id, 10) : null;
  const filterByRequest = (kind === 'service' || kind === 'order') && Number.isInteger(reqId);
  try {
    const { rows } = await db.query(
      filterByRequest
        ? `SELECT id, guest_name, room, from_role, from_name, body, lang, escalated,
                  assigned_staff_id, assigned_staff_name, pinned, created_at,
                  request_kind, request_id, ${IDENTITY_COLS}
             FROM chat_messages
            WHERE guest_id = $1 AND request_kind = $2 AND request_id = $3
            ORDER BY created_at ASC, id ASC`
        : `SELECT id, guest_name, room, from_role, from_name, body, lang, escalated,
                  assigned_staff_id, assigned_staff_name, pinned, created_at,
                  request_kind, request_id, ${IDENTITY_COLS}
             FROM chat_messages WHERE guest_id = $1 ORDER BY created_at ASC, id ASC`,
      filterByRequest ? [guestId, kind, reqId] : [guestId]
    );
    const messages = rows.map(row2msg);
    const last = rows[rows.length - 1];
    const escalated = rows.some((r) => r.escalated);
    const unreadForGuest = rows.filter(
      (r) => r.from_role !== 'guest' && r.from_role !== 'bot'
    ).length;
    // Latest non-null assignment wins so reassigning is reflected even on
    // older rows that still carry the previous owner.
    let assignedStaffId = null;
    let assignedStaffName = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].assigned_staff_id || rows[i].assigned_staff_name) {
        assignedStaffId = rows[i].assigned_staff_id;
        assignedStaffName = rows[i].assigned_staff_name;
        break;
      }
    }

    res.json({
      id: guestId,
      guestName: last ? last.guest_name : null,
      room: last ? last.room : null,
      lang: last ? last.lang : 'en',
      escalated,
      assignedStaffId,
      assignedStaffName,
      guestKind: last ? last.guest_kind : null,
      guestVerified: last ? !!last.guest_verified : false,
      bookingId: last ? last.booking_id : null,
      bookingRef: last ? last.booking_ref : null,
      confirmedBy: last ? last.confirmed_by : null,
      unreadForGuest,
      lastMsg: last ? last.body : '',
      lastAt: last ? new Date(last.created_at).getTime() : null,
      messages,
    });
  } catch (e) {
    console.error('[chat] get', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* Resolve who a thread belongs to. /identify stamps every row of the thread,
   so the newest row is authoritative; threads that predate /identify (or where
   the guest never signed in) simply carry a null kind and whatever guest_name
   they already had, which is why this reads those two back too rather than
   letting a message POST re-supply them. */
async function currentIdentity(guestId) {
  const { rows } = await db.query(
    `SELECT guest_name, room, ${IDENTITY_COLS}
       FROM chat_messages
      WHERE guest_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [guestId]
  );
  return rows[0] || null;
}

/* Resolve the current assignment for a guest_id (latest non-null pair). */
async function currentAssignment(guestId) {
  const { rows } = await db.query(
    `SELECT assigned_staff_id, assigned_staff_name
       FROM chat_messages
      WHERE guest_id = $1
        AND (assigned_staff_id IS NOT NULL OR assigned_staff_name IS NOT NULL)
      ORDER BY created_at DESC
      LIMIT 1`,
    [guestId]
  );
  return rows[0] || { assigned_staff_id: null, assigned_staff_name: null };
}

/* POST /api/chat — post a message. Carries the current assignment forward
   so per-row queries (and the all-threads summary) can read who owns the
   thread without joining a separate table. The escalation system message
   may supply a fresh assignment in assignedStaffId/assignedStaffName. */
router.post('/', async (req, res) => {
  if (chatPostRateLimited(req.ip || 'unknown')) {
    return res.status(429).json({ error: 'Too many messages. Please slow down.' });
  }
  // guestName/room are deliberately NOT read from the body: who a thread
  // belongs to comes from the thread itself (POST /identify), so a message
  // can't quietly relabel itself as a guest in room 204.
  const {
    guestId, from, fromName, text, lang, escalated,
    assignedStaffId, assignedStaffName, requestKind, requestId,
  } = req.body || {};
  if (!guestId || !text) return res.status(400).json({ error: 'guestId and text required' });

  // Tagging this message to one request is optional (plain chat sends
  // neither field) and, when present, must name a real request kind — a
  // malformed tag would silently vanish from that request's card forever.
  const reqKind = (requestKind === 'service' || requestKind === 'order') ? requestKind : null;
  const reqIdNum = reqKind && Number.isInteger(Number(requestId)) ? Number(requestId) : null;
  if (requestKind && !reqKind) return res.status(400).json({ error: "requestKind must be 'service' or 'order'" });
  if (reqKind && reqIdNum == null) return res.status(400).json({ error: 'requestId must be an integer' });

  // Only a VERIFIED staff token may post as 'staff' — impersonating a human
  // front-desk agent is the real phishing vector. 'bot' and 'system' are the
  // guest widget's OWN scripted assistant answers + escalation notices, posted
  // unauthenticated by design (the guest has no login); forcing those to
  // 'guest' made the bot's replies re-render as the guest's own messages after
  // a sync. Anything else falls back to a plain 'guest' message. (Staff replies
  // carry the bearer token automatically — see assets/js/api.js.)
  const authHeader = req.get('authorization') || '';
  const authed = authHeader.startsWith('Bearer ') ? verifyToken(authHeader.slice(7).trim()) : null;
  let role;
  if (from === 'staff') role = authed ? 'staff' : 'guest';
  else if (from === 'bot' || from === 'system') role = from;
  else role = 'guest';
  // from_name is the per-message sender label for non-guest bubbles; a guest
  // message is attributed via the thread's guest_name, so an anonymous poster
  // can never supply a staff-looking sender name.
  const senderName = (role !== 'guest' && fromName) ? String(fromName).slice(0, 100) : null;
  const bodyText = String(text).slice(0, MAX_CHAT_TEXT);

  try {
    let assignId = assignedStaffId || null;
    let assignName = assignedStaffName || null;
    if (!assignId && !assignName) {
      const cur = await currentAssignment(guestId);
      assignId = cur.assigned_staff_id;
      assignName = cur.assigned_staff_name;
    }

    // Carry the escalation flag forward. /api/chat/all reads escalated from
    // the latest row per thread, so without this every guest follow-up after
    // hand-off would reset the flag and the thread would drop off the staff
    // console mid-conversation.
    let escFlag = !!escalated;
    if (!escFlag) {
      const { rows: prior } = await db.query(
        `SELECT 1 FROM chat_messages WHERE guest_id = $1 AND escalated = TRUE LIMIT 1`,
        [guestId]
      );
      if (prior.length) escFlag = true;
    }

    // Inherit the thread's identity so every row answers "who is this?" on its
    // own — the staff console's summary reads the latest row per thread.
    const id = (await currentIdentity(guestId)) || {};

    const { rows } = await db.query(
      `INSERT INTO chat_messages
         (guest_id, guest_name, room, from_role, from_name, body, lang, escalated,
          assigned_staff_id, assigned_staff_name,
          guest_kind, guest_verified, booking_id, booking_ref, confirmed_by,
          request_kind, request_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id, from_role, from_name, body, lang, escalated, pinned, created_at,
                 request_kind, request_id`,
      [
        guestId,
        id.guest_name || null,
        id.room || null,
        role,
        senderName,
        bodyText,
        lang || 'en',
        escFlag,
        assignId,
        assignName,
        id.guest_kind || null,
        !!id.guest_verified,
        id.booking_id || null,
        id.booking_ref || null,
        id.confirmed_by || null,
        reqKind,
        reqIdNum,
      ]
    );
    res.status(201).json(row2msg(rows[0]));
  } catch (e) {
    console.error('[chat] post', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── Durable read markers (chat_reads) ──────────────────────────────────────
   Opening a thread records "read up to now" so the unread subqueries above
   stop counting everything before it. Reading clears the badge for good; only
   a genuinely newer message from the other side re-lights it. Scope 'chat' is
   the main thread; 'req:<kind>:<id>' is one request's remark thread — the SAME
   string the unread subqueries build with `'req:' || request_kind || ':' ||
   request_id`, so they must stay in sync. */
const READ_KINDS = new Set(['service', 'order']);
function reqScope(kind, id) { return 'req:' + kind + ':' + id; }
async function stampRead(guestId, scope, role) {
  await db.query(
    `INSERT INTO chat_reads (guest_id, scope, role, last_read_at)
       VALUES ($1, $2, $3, NOW())
     ON CONFLICT (guest_id, scope, role)
       DO UPDATE SET last_read_at = NOW()`,
    [String(guestId), scope, role]
  );
}

/* PATCH /api/chat/:guestId/read — guest opened their own main thread. */
router.patch('/:guestId/read', async (req, res) => {
  try {
    await stampRead(req.params.guestId, 'chat', 'guest');
    res.json({ ok: true });
  } catch (e) {
    console.error('[chat] read (guest)', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /api/chat/:guestId/read — staff opened this guest's main thread (auth).
   Distinct HTTP method from the guest PATCH above so the two never collide. */
router.post('/:guestId/read', requireAuth, async (req, res) => {
  try {
    await stampRead(req.params.guestId, 'chat', 'staff');
    res.json({ ok: true });
  } catch (e) {
    console.error('[chat] read (staff)', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /api/chat/request-read — guest opened a request's remark thread.
   Body: { guestId, kind, id }. No auth (guest-facing). */
router.post('/request-read', async (req, res) => {
  const { guestId, kind } = req.body || {};
  const id = Number(req.body && req.body.id);
  if (!guestId || !READ_KINDS.has(kind) || !Number.isInteger(id)) {
    return res.status(400).json({ error: 'guestId, kind (service|order) and integer id required' });
  }
  try {
    await stampRead(guestId, reqScope(kind, id), 'guest');
    res.json({ ok: true });
  } catch (e) {
    console.error('[chat] request-read (guest)', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /api/chat/request-read-staff — staff opened a request's remark thread (auth).
   Body: { guestId, kind, id }. */
router.post('/request-read-staff', requireAuth, async (req, res) => {
  const { guestId, kind } = req.body || {};
  const id = Number(req.body && req.body.id);
  if (!guestId || !READ_KINDS.has(kind) || !Number.isInteger(id)) {
    return res.status(400).json({ error: 'guestId, kind (service|order) and integer id required' });
  }
  try {
    await stampRead(guestId, reqScope(kind, id), 'staff');
    res.json({ ok: true });
  } catch (e) {
    console.error('[chat] request-read (staff)', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* PATCH /api/chat/:guestId/assign — staff takes over a chat from whoever
   was previously assigned. Body: { staffId, staffName }. Stamps every row
   in the thread with the new owner so subsequent polls reflect the switch
   immediately, and inserts a system message announcing the change. */
router.patch('/:guestId/assign', requireAuth, async (req, res) => {
  const { staffId, staffName, systemText, lang } = req.body || {};
  if (!staffId || !staffName) {
    return res.status(400).json({ error: 'staffId and staffName required' });
  }
  try {
    const { rowCount } = await db.query(
      `UPDATE chat_messages
          SET assigned_staff_id = $1, assigned_staff_name = $2
        WHERE guest_id = $3`,
      [String(staffId), String(staffName).slice(0, 100), req.params.guestId]
    );
    if (!rowCount) return res.status(404).json({ error: 'thread not found' });

    if (systemText) {
      // Carry the identity onto this row like any other insert — it becomes
      // the thread's newest row, and currentIdentity() reads the newest row.
      const id = (await currentIdentity(req.params.guestId)) || {};
      await db.query(
        `INSERT INTO chat_messages
           (guest_id, guest_name, room, from_role, body, lang, escalated,
            assigned_staff_id, assigned_staff_name,
            guest_kind, guest_verified, booking_id, booking_ref, confirmed_by)
         VALUES ($1, $2, $3, 'system', $4, $5, TRUE, $6, $7, $8, $9, $10, $11, $12)`,
        [
          req.params.guestId,
          id.guest_name || null,
          id.room || null,
          String(systemText).slice(0, 500),
          lang || 'en',
          String(staffId),
          String(staffName).slice(0, 100),
          id.guest_kind || null,
          !!id.guest_verified,
          id.booking_id || null,
          id.booking_ref || null,
          id.confirmed_by || null,
        ]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[chat] assign', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* PATCH /api/chat/:guestId/confirm-guest — the front desk vouches for a guest
   the system couldn't match (OTA, walk-in, booking not in yet): staff check the
   register, then flip the thread from "says they're in room 204" to confirmed.
   Body: { bookingId?, bookingRef?, room?, name? } — all optional; pass them to
   attach a booking staff located by hand. Update-only: deliberately no system
   message, since this is an internal check the guest shouldn't watch happen. */
router.patch('/:guestId/confirm-guest', requireAuth, async (req, res) => {
  const { bookingId, bookingRef, room, name } = req.body || {};
  try {
    // A supplied reference must be a REAL one. The ✅ badge is the front desk
    // saying "I checked the register"; without this it only said "somebody
    // typed something", so one transposed character (JP-1O01 for JP-1001) put
    // a confident green badge on a guest nobody had actually matched. Same
    // rule, and the same verifyGuest() call, that lib/requestPatch.js applies
    // when staff link a reservation to a request. Vouching with no reference
    // at all stays allowed: that is a human vouching by name and room.
    let confirmedRef = bookingRef ? String(bookingRef).trim() : null;
    let confirmedRoom = room ? String(room).trim().slice(0, 20) : null;
    if (confirmedRef) {
      const bk = await findBooking({ ref: confirmedRef });
      if (!bk) {
        return res.status(400).json({ error: 'No booking matches that reference' });
      }
      confirmedRef = bk.ref;
      // Prefer the room the booking actually names over anything typed.
      if (bk.room_number) confirmedRoom = String(bk.room_number).slice(0, 20);
    }
    const { rowCount } = await db.query(
      `UPDATE chat_messages
          SET guest_kind = 'guest',
              guest_verified = TRUE,
              confirmed_by = $1,
              booking_id  = COALESCE($2, booking_id),
              booking_ref = COALESCE($3, booking_ref),
              room        = COALESCE($4, room),
              guest_name  = COALESCE($5, guest_name)
        WHERE guest_id = $6`,
      [
        String(req.user.name || '').slice(0, 100),
        bookingId ? String(bookingId) : null,
        confirmedRef,
        confirmedRoom,
        name ? String(name).trim().slice(0, 100) : null,
        req.params.guestId,
      ]
    );
    if (!rowCount) return res.status(404).json({ error: 'thread not found' });
    res.json({ ok: true, confirmedBy: req.user.name });
  } catch (e) {
    console.error('[chat] confirm-guest', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* PATCH /api/chat/:guestId/rename — staff renames a guest chat thread.
   Rewrites guest_name across every message in the thread so the staff
   console picks it up on the next poll. */
router.patch('/:guestId/rename', requireAuth, async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  try {
    const { rowCount } = await db.query(
      'UPDATE chat_messages SET guest_name = $1 WHERE guest_id = $2',
      [name.trim().slice(0, 100), req.params.guestId]
    );
    res.json({ ok: true, updated: rowCount });
  } catch (e) {
    console.error('[chat] rename', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* PATCH /api/chat/message/:id/pin — toggle the pinned flag on a single
   message. Body: { pinned: bool }. Any signed-in staff member can pin so
   the assigned account isn't the only one who can flag things to remember. */
router.patch('/message/:id/pin', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  const pinned = !!(req.body && req.body.pinned);
  try {
    const { rowCount } = await db.query(
      'UPDATE chat_messages SET pinned = $1 WHERE id = $2',
      [pinned, id]
    );
    if (!rowCount) return res.status(404).json({ error: 'message not found' });
    res.json({ ok: true, pinned });
  } catch (e) {
    console.error('[chat] pin', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* DELETE /api/chat/:guestId — staff deletes a single guest chat thread. */
router.delete('/:guestId', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM chat_messages WHERE guest_id = $1',
      [req.params.guestId]
    );
    res.json({ ok: true, deleted: rowCount });
  } catch (e) {
    console.error('[chat] delete', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* POST /api/chat/bulk-delete — staff deletes many guest chat threads at once.
   Body: { guestIds: ["g_xxx", ...] }. Idempotent: missing ids are ignored. */
router.post('/bulk-delete', requireAuth, async (req, res) => {
  const { guestIds } = req.body || {};
  if (!Array.isArray(guestIds) || !guestIds.length) {
    return res.status(400).json({ error: 'guestIds[] required' });
  }
  try {
    const { rowCount } = await db.query(
      'DELETE FROM chat_messages WHERE guest_id = ANY($1::text[])',
      [guestIds.map(String)]
    );
    res.json({ ok: true, deleted: rowCount });
  } catch (e) {
    console.error('[chat] bulk-delete', e);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
