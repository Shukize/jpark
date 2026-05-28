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

INSERT INTO employees (id, name, email, role, status, shift, phone) VALUES
  ('u_admin',  'Hotel Admin',    'hadmin@jpark.hotel',    'admin',     'on_shift',  '09:00–18:00', '+66 2 100 2000'),
  ('u_staff',  'Front Desk',     'fdesk@jpark.hotel',     'frontdesk', 'on_shift',  '07:00–15:00', '+66 2 100 2001'),
  ('e_ploy',   'Ploy Srisai',    'psrisai@jpark.hotel',   'frontdesk', 'on_break',  '15:00–23:00', '+66 81 234 5678'),
  ('e_kenji',  'Kenji Watanabe', 'kwatanabe@jpark.hotel', 'frontdesk', 'off_shift', '23:00–07:00', '+66 81 234 5690')
ON CONFLICT (id) DO NOTHING;

-- Migrate existing seed emails to initiallastname format (idempotent)
UPDATE employees SET email = 'hadmin@jpark.hotel'    WHERE id = 'u_admin'  AND email IN ('hotel.admin@jpark.hotel', 'h.admin@jpark.hotel');
UPDATE employees SET email = 'fdesk@jpark.hotel'     WHERE id = 'u_staff'  AND email IN ('front.desk@jpark.hotel',  'f.desk@jpark.hotel');
UPDATE employees SET email = 'psrisai@jpark.hotel'   WHERE id = 'e_ploy'   AND email IN ('ploy.srisai@jpark.hotel', 'p.srisai@jpark.hotel');
UPDATE employees SET email = 'kwatanabe@jpark.hotel' WHERE id = 'e_kenji'  AND email IN ('kenji.watanabe@jpark.hotel', 'k.watanabe@jpark.hotel');

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

-- ── Chat messages (guest ↔ front-desk) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id           SERIAL       PRIMARY KEY,
  guest_id     VARCHAR(100) NOT NULL,
  guest_name   VARCHAR(100),
  room         VARCHAR(20),
  from_role    VARCHAR(20)  NOT NULL,  -- guest | bot | staff | system
  from_name    VARCHAR(100),
  body         TEXT         NOT NULL,
  lang         VARCHAR(10)  DEFAULT 'en',
  escalated    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

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
