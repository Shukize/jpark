-- J Park Hotel — PostgreSQL schema
-- Idempotent: safe to re-run on every deploy.

-- ── Shared trigger function ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Internal staff messages ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          SERIAL PRIMARY KEY,
  from_id     VARCHAR(50)  NOT NULL,
  from_name   VARCHAR(100) NOT NULL,
  from_role   VARCHAR(20)  NOT NULL,
  subject     TEXT         NOT NULL,
  body        TEXT         NOT NULL,
  to_all      BOOLEAN      NOT NULL DEFAULT FALSE,
  to_ids      TEXT[]       NOT NULL DEFAULT '{}',
  to_names    TEXT[]       NOT NULL DEFAULT '{}',
  read_by     TEXT[]       NOT NULL DEFAULT '{}',
  reported_by TEXT[]       NOT NULL DEFAULT '{}',
  lang        VARCHAR(10),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS reported_by TEXT[] NOT NULL DEFAULT '{}';

-- ── Service requests (housekeeping, maintenance, dining, front-desk) ─────────
CREATE TABLE IF NOT EXISTS service_requests (
  id          SERIAL PRIMARY KEY,
  guest_id    VARCHAR(100) NOT NULL,
  guest_name  VARCHAR(100) NOT NULL DEFAULT 'Guest',
  room_number VARCHAR(10)  NOT NULL,
  type        VARCHAR(50)  NOT NULL,
  kind        VARCHAR(20)  NOT NULL DEFAULT 'service',  -- service | order | concierge
  title_key   VARCHAR(100),
  title       TEXT,
  items       JSONB        NOT NULL DEFAULT '[]',
  deliver_at  VARCHAR(20),
  total       NUMERIC(10,2),
  note        TEXT,
  lang        VARCHAR(10)  DEFAULT 'en',
  status      VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | progress | done | cancelled
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_service_requests_updated_at ON service_requests;
CREATE TRIGGER trg_service_requests_updated_at
  BEFORE UPDATE ON service_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Physical room inventory ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id          SERIAL PRIMARY KEY,
  room_number VARCHAR(10)  NOT NULL UNIQUE,
  room_type   VARCHAR(50)  NOT NULL,
  active      BOOLEAN      NOT NULL DEFAULT TRUE
);

INSERT INTO rooms (room_number, room_type) VALUES
  ('101', 'Deluxe'), ('102', 'Deluxe'), ('201', 'Deluxe'), ('202', 'Deluxe'),
  ('204', 'Superior'), ('301', 'Superior'), ('302', 'Superior'),
  ('312', 'Suite'), ('401', 'Suite'), ('402', 'Suite'), ('508', 'Suite')
ON CONFLICT (room_number) DO NOTHING;

-- ── OTA webhook bookings (channel-manager sync) ──────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id          SERIAL PRIMARY KEY,
  room_id     INTEGER      REFERENCES rooms(id),
  room_type   VARCHAR(50)  NOT NULL,
  guest_name  VARCHAR(100),
  check_in    DATE         NOT NULL,
  check_out   DATE         NOT NULL,
  source      VARCHAR(30)  NOT NULL DEFAULT 'direct',
  ota_ref     VARCHAR(100),
  status      VARCHAR(20)  NOT NULL DEFAULT 'confirmed',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_room_dates
  ON bookings (room_id, check_in, check_out);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_source_ref
  ON bookings (source, ota_ref) WHERE ota_ref IS NOT NULL;

-- ── Employee roster (auth + shift board) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id            VARCHAR(50)  PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150),
  role          VARCHAR(30)  NOT NULL DEFAULT 'frontdesk',
  status        VARCHAR(20)  NOT NULL DEFAULT 'off_shift',
  shift         VARCHAR(50),
  phone         VARCHAR(40),
  username      VARCHAR(50)  UNIQUE,
  password_hash TEXT,
  active        BOOLEAN      NOT NULL DEFAULT TRUE,
  avatar        TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Add columns that were introduced after the initial schema deploy.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS username             VARCHAR(50)  UNIQUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash        TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS active               BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar               TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar_updated_at    TIMESTAMPTZ;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

DROP TRIGGER IF EXISTS trg_employees_updated_at ON employees;
CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 'e_ploy'/'e_kenji' (Ploy Srisai / Kenji Watanabe) were demo roster rows,
-- retired permanently per owner request — see migrate.js's
-- removeHousekeeping(), which also deletes them on every boot so they can
-- never be silently re-seeded after being removed via the Staff panel.
INSERT INTO employees (id, name, email, role, status, shift, phone) VALUES
  ('u_admin',  'Hotel Admin',    'hadmin@jpark.hotel',    'admin',     'on_shift',  '09:00–18:00', '+66 2 100 2000'),
  ('u_staff',  'Front Desk',     'fdesk@jpark.hotel',     'frontdesk', 'on_shift',  '07:00–15:00', '+66 2 100 2001')
ON CONFLICT (id) DO NOTHING;

-- Migrate existing seed emails to initiallastname format (idempotent)
UPDATE employees SET email = 'hadmin@jpark.hotel'    WHERE id = 'u_admin'  AND email IN ('hotel.admin@jpark.hotel', 'h.admin@jpark.hotel');
UPDATE employees SET email = 'fdesk@jpark.hotel'     WHERE id = 'u_staff'  AND email IN ('front.desk@jpark.hotel',  'f.desk@jpark.hotel');

-- ── Guest bookings (OTA + direct; used for guest portal login) ───────────────
CREATE TABLE IF NOT EXISTS guest_bookings (
  id            TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  ref           TEXT         UNIQUE NOT NULL,
  channel       VARCHAR(30)  NOT NULL DEFAULT 'direct',
  channel_name  VARCHAR(100),
  channel_email VARCHAR(150),
  guest_name    VARCHAR(100) NOT NULL,
  guest_last_name VARCHAR(100),
  guest_email   VARCHAR(150),
  guest_phone   VARCHAR(50),
  room          VARCHAR(50),
  check_in      DATE         NOT NULL,
  check_out     DATE         NOT NULL,
  nights        INTEGER      NOT NULL DEFAULT 1,
  adults        INTEGER      NOT NULL DEFAULT 1,
  children      INTEGER      NOT NULL DEFAULT 0,
  total         NUMERIC(10,2),
  currency      VARCHAR(10)  DEFAULT 'THB',
  status        VARCHAR(30)  NOT NULL DEFAULT 'confirmed',
  lang          VARCHAR(10)  DEFAULT 'en',
  confirmation  TEXT,
  read_by       TEXT[]       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_guest_bookings_updated_at ON guest_bookings;
CREATE TRIGGER trg_guest_bookings_updated_at
  BEFORE UPDATE ON guest_bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Payment columns (online booking + Omise/Opn Payments). NULL / 'n/a' for
-- OTA and manual bookings, which never go through the site's own payment flow.
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS payment_provider  VARCHAR(20);
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS payment_method    VARCHAR(20);
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS payment_status    VARCHAR(20) NOT NULL DEFAULT 'n/a';
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS payment_charge_id VARCHAR(100);

-- Physical room number assigned by front-desk staff at check-in (distinct
-- from `room`, which is a room-TYPE string like "Deluxe"). NULL until staff
-- assign it via the staff console. Not a FK to the separate, unrelated
-- rooms/bookings tables above, which belong only to the OTA channel-manager
-- webhook (routes/otaSync.js) — guest_bookings never joins against those.
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS room_number VARCHAR(10);

-- Used by the availability check (payments.js) to count overlapping bookings
-- per room type for a date range.
CREATE INDEX IF NOT EXISTS idx_guest_bookings_room_dates
  ON guest_bookings (room, check_in, check_out);

-- Cancellation metadata (staff-mediated cancel; see routes/guestBookings.js
-- POST /:id/cancel and POST /:id/reopen). cancelled_by_id/name are NULL when
-- the cancellation was auto-detected from an inbound OTA email
-- (lib/otaEmailParser.js via ingestGuestBooking()'s ON CONFLICT path) rather
-- than performed by a signed-in staff member. previous_status lets reopen
-- restore the exact prior state (e.g. a day-use booking that was 'pending'
-- when cancelled reopens back to 'pending', not 'confirmed').
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS cancelled_at        TIMESTAMPTZ;
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS cancelled_by_id     VARCHAR(50);
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS cancelled_by_name   VARCHAR(100);
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS previous_status     VARCHAR(30);

-- Set by the OTA email-forwarding bridge (routes/otaEmail.js) when a
-- forwarded confirmation couldn't be confidently parsed (missing dates
-- and/or guest name) — surfaced in the staff console so a low-confidence
-- import is visibly flagged instead of silently blending in with clean
-- bookings (the raw email is always preserved in `confirmation` regardless).
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE;

-- Staff organization: a quick-access flag and a short private internal note,
-- both editable from the Guest Booking list/detail view (routes/guestBookings.js
-- PATCH /:id). Previously "starred" only existed as a client-side localStorage
-- field that the 6-second guest-bookings poll silently overwrote on every
-- refresh (S.write() fully replaces the table with the server's response) —
-- effectively non-functional. Persisting both server-side is what makes them
-- survive a poll, a reload, or a different staff member's browser.
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS starred      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS staff_label  VARCHAR(120);

-- Guest's smoking preference for the stay (routes/payments.js POST
-- /reservations). Front desk assigns the physical room accordingly — this
-- is not a separate bookable room type or its own inventory, just a
-- preference carried on the reservation like adults/children.
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS smoking_preference VARCHAR(20) NOT NULL DEFAULT 'non_smoking';

-- Whether the guest requested/selected breakfast for this stay (routes/
-- payments.js POST /reservations) — surfaced in the hotel-notice and
-- guest-confirmation emails and the staff console's booking detail view,
-- to reduce accounting errors around the room+breakfast rate actually
-- charged. Same shape/limitation as smoking_preference: only ever set by
-- the direct-website reservation flow, defaults FALSE (unknown) otherwise.
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS breakfast BOOLEAN NOT NULL DEFAULT FALSE;

-- Set whenever staff resend a confirmation email (routes/guestBookings.js
-- POST /:id/resend-confirmation) — lets the staff console flag the booking
-- as "Amended" (row pill + a dedicated "Resent" filter tab) and show the
-- resend banner in the detail view, without an extra query against
-- email_log just to know whether any resend has ever happened.
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS last_amended_at TIMESTAMPTZ;

-- Individual ages for each of the `children` count (routes/payments.js POST
-- /reservations, direct-website bookings only), so breakfast/extra-guest
-- surcharges can honor the advertised age tiers (free 0-4, ฿100 flat 5-8,
-- treated as an adult 9+ — see lib/rateOverrides.js's computeGuestSurcharge())
-- instead of charging every child the flat adult rate regardless of age.
-- `children` (the count) is untouched and stays the source of truth for
-- capacity checks and OTA/manual bookings that never collect ages — this
-- stays '[]' for those, and computeGuestSurcharge() falls back to its
-- pre-existing flat total-guest calculation whenever it's empty.
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS child_ages JSONB NOT NULL DEFAULT '[]';

-- Free-text special request the guest optionally types at booking time
-- (routes/payments.js POST /reservations and /dayuse-booking — the "Special
-- requests" field: late arrival, high floor, allergies…). Echoed verbatim in
-- the guest confirmation + hotel-notice emails and the staff console booking
-- detail so front desk actually sees it. Direct-website bookings only; stays
-- NULL for OTA/manual imports, which never collect it.
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS special_requests TEXT;

-- Multi-room ("booking group") linkage (routes/payments.js POST
-- /reservations/group, direct-website bookings only). A single guest
-- reservation that holds several rooms is stored as one guest_bookings ROW
-- PER ROOM — each row is priced independently by the same computeTotal() a
-- single-room booking uses, and each keeps its own room_number / payment /
-- cancel state — with all the rows tied together by a shared group_ref.
--   group_ref   the guest-facing confirmation number for the whole booking
--               (each row's own `ref` is group_ref || '-R' || group_index, so
--               the UNIQUE ref constraint still holds and the grouping is
--               visible in the ref itself). NULL for every single-room,
--               OTA and day-use booking — those behave exactly as before.
--   group_index 1-based position of this room within the group (Room 1, 2 …).
--   group_size  original room count in the group; stays fixed even if a room
--               is later cancelled, so "Room 2 of 3" stays accurate.
-- All nullable: existing rows and the untouched single-room path leave them
-- NULL, so no query behaves differently for a non-grouped booking.
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS group_ref   TEXT;
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS group_index INTEGER;
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS group_size  INTEGER;

-- Lets the staff console fetch every room of a group together, and the
-- group confirmation/cancellation emails gather their sibling rows cheaply.
CREATE INDEX IF NOT EXISTS idx_guest_bookings_group_ref
  ON guest_bookings (group_ref);

-- Opt-in physical extra bed / rollaway (routes/payments.js — the booking
-- modal's "Extra bed" toggle, direct-website bookings only). A flat per-night
-- surcharge (surcharges.extraBed) already baked into `total`; this boolean
-- records that the guest requested one so housekeeping sets it up and the
-- confirmation email / staff detail can itemise it. Distinct from the
-- age-tiered extra-bed charge the guest-count math applies for a 3rd+ adult —
-- this is the explicit toggle, offered only when that math bills no bed (e.g.
-- a young child). FALSE for OTA/manual/day-use and every pre-existing row.
ALTER TABLE guest_bookings ADD COLUMN IF NOT EXISTS extra_bed BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Chat messages (guest ↔ front-desk) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id                  SERIAL       PRIMARY KEY,
  guest_id            VARCHAR(100) NOT NULL,
  guest_name          VARCHAR(100),
  room                VARCHAR(20),
  from_role           VARCHAR(20)  NOT NULL,  -- guest | bot | staff | system
  from_name           VARCHAR(100),
  body                TEXT         NOT NULL,
  lang                VARCHAR(10)  DEFAULT 'en',
  escalated           BOOLEAN      NOT NULL DEFAULT FALSE,
  assigned_staff_id   VARCHAR(50),
  assigned_staff_name VARCHAR(100),
  pinned              BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Columns added after the initial schema deploy.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS assigned_staff_id   VARCHAR(50);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS assigned_staff_name VARCHAR(100);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS pinned              BOOLEAN NOT NULL DEFAULT FALSE;

-- Who the front desk is actually talking to (added 2026-07-21). Set ONLY by
-- POST /api/chat/identify, never from a plain message POST — the guest widget
-- used to pass guest_name/room as free text nobody had checked, so every thread
-- read "Guest" with no room. guest_kind 'guest' + guest_verified TRUE means the
-- last name + room number (or booking ref) matched a live guest_bookings row;
-- 'guest' + FALSE is a self-declared stay we couldn't match (OTA / walk-in —
-- those never reach guest_bookings, see HANDLE_OTA_BOOKINGS in
-- routes/guestBookings.js), which staff can vouch for via
-- PATCH /api/chat/:guestId/confirm-guest. 'visitor' is someone just asking.
-- The existing guest_name/room columns carry the last name + room number.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS guest_kind     VARCHAR(20);  -- guest | visitor
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS guest_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS booking_id     TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS booking_ref    TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS confirmed_by   VARCHAR(100); -- staff who vouched

CREATE INDEX IF NOT EXISTS idx_chat_guest
  ON chat_messages (guest_id, created_at);

-- ── In-room dining orders ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id          SERIAL       PRIMARY KEY,
  guest_id    VARCHAR(100) NOT NULL,
  guest_name  VARCHAR(100),
  room_number VARCHAR(20)  NOT NULL,
  items       JSONB        NOT NULL DEFAULT '[]',
  deliver_at  VARCHAR(20)  DEFAULT 'asap',
  notes       TEXT,
  total       NUMERIC(10,2),
  status      VARCHAR(20)  NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_guest
  ON orders (guest_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Site content (CMS — one row per property) ────────────────────────────────
CREATE TABLE IF NOT EXISTS site_content (
  id         INTEGER      PRIMARY KEY DEFAULT 1,
  overrides  JSONB        NOT NULL DEFAULT '{}',
  images     JSONB        NOT NULL DEFAULT '{}',
  theme      JSONB        NOT NULL DEFAULT '{}',
  hidden     TEXT[]       NOT NULL DEFAULT '{}',
  edit_log   JSONB        NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO site_content (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Site-wide maintenance mode: when TRUE, guest pages (index.html, booking.html)
-- redirect to maintenance.html. Toggled from the admin-only panel in staff.html.
ALTER TABLE site_content ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE;

-- Admin-editable room-rate overrides (room-only/breakfast prices per room +
-- variant), saved from the Site Editor's Rates tab. Shape:
--   { [roomName]: { [variantLabel]: { room: number, bf: number } } }
-- Sparse — a room/variant with no override simply doesn't appear. Only ever
-- overrides numbers for room/variant keys that already exist in
-- backend/lib/roomRates.js — never injects new room/variant keys, and never
-- touches maxGuests or inventory. See backend/lib/rateOverrides.js and
-- backend/routes/rates.js for the validation/merge rules.
ALTER TABLE site_content ADD COLUMN IF NOT EXISTS rates JSONB NOT NULL DEFAULT '{}';

-- Admin-editable flat surcharges (THB/night), applied on top of a room's
-- rate based on guest count beyond the base 2 a variant's room/bf rate
-- already covers: `extraBed` for a 3rd guest's rollaway bed (only charged
-- for rooms with extraBedAvailable), `extraBreakfastGuest` for each extra
-- guest's breakfast when breakfast is selected. Defaults mirror
-- backend/lib/roomRates.js's DEFAULT_SURCHARGES. See
-- backend/lib/rateOverrides.js's getEffectiveSurcharges()/computeGuestSurcharge().
ALTER TABLE site_content ADD COLUMN IF NOT EXISTS surcharges JSONB NOT NULL DEFAULT '{"extraBed":500,"extraBreakfastGuest":190}';

-- Admin-editable Day Use (3-hour short-stay) flat prices, saved from the
-- Site Editor's Rates tab. Shape: { [roomName]: number } — flat, like
-- `surcharges` above, not per-variant like `rates` (Day Use has no
-- room/breakfast split). Only ever overrides room keys that already exist
-- in backend/lib/roomRates.js's DAYUSE map. See backend/lib/rateOverrides.js's
-- getEffectiveDayUseRates()/getEffectiveDayUsePrice().
ALTER TABLE site_content ADD COLUMN IF NOT EXISTS day_use_rates JSONB NOT NULL DEFAULT '{}';

-- Admin-editable per-room-type availability (Site Editor). Sparse list of
-- room names currently delisted/unbookable — absence means available (the
-- default for all 13 catalog room types except Deluxe, which ships hidden
-- until staff turn it on). Mirrors `hidden`'s TEXT[] shape (whole-section
-- visibility) but is a distinct concept/column since room names and section
-- ids are different namespaces. Only ever contains keys that exist in
-- backend/lib/roomRates.js's ROOMS. See backend/routes/availability.js.
ALTER TABLE site_content ADD COLUMN IF NOT EXISTS unavailable_rooms TEXT[] NOT NULL DEFAULT '{"Deluxe"}';

-- ── Staff session tracking (sliding sessions, concurrency cap, audit log) ────
-- One row per staff device/browser login. `jti` is embedded in that login's
-- access token so middleware/auth.js can revoke a single session without
-- invalidating every other token signed with the same server secret.
-- `created_at` never changes for a session's lifetime — it anchors the
-- 7-day absolute cap (`absolute_expires_at`) that survives across every
-- silent /api/auth/refresh. See backend/lib/sessionCache.js for the
-- in-memory revoked/banned caches this table hydrates at boot.
CREATE TABLE IF NOT EXISTS staff_sessions (
  jti                 VARCHAR(40)  PRIMARY KEY,
  employee_id         VARCHAR(50)  NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  ip                  VARCHAR(64)  NOT NULL,
  user_agent          TEXT,
  device_summary      VARCHAR(160),
  city                VARCHAR(100),
  country             VARCHAR(100),
  country_code        VARCHAR(5),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_seen_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ  NOT NULL,
  absolute_expires_at TIMESTAMPTZ  NOT NULL,
  revoked_at          TIMESTAMPTZ,
  revoked_reason      VARCHAR(40),
  revoked_by_id       VARCHAR(50)  REFERENCES employees(id)
);

-- Concurrency-cap count (routes/auth.js login) and the Account Logs listing
-- both filter on "this employee's still-active sessions."
CREATE INDEX IF NOT EXISTS idx_staff_sessions_employee_active
  ON staff_sessions (employee_id, created_at) WHERE revoked_at IS NULL;

-- IP-ban cascade revoke and the Account Logs table's IP column both query by ip.
CREATE INDEX IF NOT EXISTS idx_staff_sessions_ip ON staff_sessions (ip);

-- ── Banned IPs (staff console login/session abuse) ───────────────────────────
-- Scoped to the staff console only (see backend/lib/sessionCache.js's
-- blockBannedIp middleware, mounted only on /api/auth and /api/sessions) —
-- deliberately does not touch guest-facing routes, so a shared/NAT'd IP
-- banned for a bad staff login attempt never blocks a real guest booking.
CREATE TABLE IF NOT EXISTS banned_ips (
  ip           VARCHAR(64)  PRIMARY KEY,
  banned_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  banned_by_id VARCHAR(50)  REFERENCES employees(id),
  reason       TEXT
);

-- ── Sent-email log (guest-facing emails only) ────────────────────────────────
-- Every guest confirmation, resend, cancellation notice, and day-use request
-- email actually handed to Resend gets one row here (see backend/mailer.js's
-- sendEmail(msg, meta) — logging only happens when the caller passes `meta`,
-- which the guest-facing call sites do; internal hotel-notice emails don't,
-- since this log exists so staff can see what a GUEST was told, not the
-- hotel's own inbox traffic). Logged regardless of outcome (sent/failed/
-- skipped) so a silently-failed send is visible in the Staff Console instead
-- of only ever reaching a server log line. booking_ref is denormalised
-- alongside booking_id so the row still reads sensibly if the booking is
-- ever deleted (ON DELETE SET NULL, not CASCADE — the email really was sent;
-- deleting the booking shouldn't erase that it happened).
CREATE TABLE IF NOT EXISTS email_log (
  id           SERIAL       PRIMARY KEY,
  booking_id   TEXT         REFERENCES guest_bookings(id) ON DELETE SET NULL,
  booking_ref  VARCHAR(50),
  to_address   VARCHAR(150) NOT NULL,
  subject      VARCHAR(255) NOT NULL,
  body         TEXT,
  kind         VARCHAR(30)  NOT NULL,
  status       VARCHAR(10)  NOT NULL,
  error        TEXT,
  sent_by_id   VARCHAR(50)  REFERENCES employees(id),
  sent_by_name VARCHAR(100),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_log_booking ON email_log (booking_id, created_at DESC);
