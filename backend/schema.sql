-- Run this once against your Render PostgreSQL database to initialise the schema.

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
  lang        VARCHAR(10),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_requests (
  id          SERIAL PRIMARY KEY,
  guest_id    VARCHAR(50)  NOT NULL,
  guest_name  VARCHAR(100) NOT NULL,
  room_number VARCHAR(10)  NOT NULL,
  type        VARCHAR(50)  NOT NULL,  -- e.g. 'room_service', 'housekeeping', 'maintenance'
  items       JSONB        NOT NULL DEFAULT '[]',
  status      VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | in_progress | done | cancelled
  notes       TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Physical rooms (the real inventory the front desk assigns guests to)
CREATE TABLE IF NOT EXISTS rooms (
  id          SERIAL PRIMARY KEY,
  room_number VARCHAR(10)  NOT NULL UNIQUE,
  room_type   VARCHAR(50)  NOT NULL,
  active      BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Reservations, whether direct or synced in from an OTA channel
CREATE TABLE IF NOT EXISTS bookings (
  id          SERIAL PRIMARY KEY,
  room_id     INTEGER      REFERENCES rooms(id),
  room_type   VARCHAR(50)  NOT NULL,
  guest_name  VARCHAR(100),
  check_in    DATE         NOT NULL,
  check_out   DATE         NOT NULL,
  source      VARCHAR(30)  NOT NULL DEFAULT 'direct',  -- direct | agoda | booking | airbnb | trip | expedia | other
  ota_ref     VARCHAR(100),  -- OTA reservation reference, used to de-duplicate webhook retries
  status      VARCHAR(20)  NOT NULL DEFAULT 'confirmed',  -- confirmed | cancelled
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Speeds up the date-overlap availability check in the OTA sync route
CREATE INDEX IF NOT EXISTS idx_bookings_room_dates
  ON bookings (room_id, check_in, check_out);

-- Makes OTA syncs idempotent: a given channel + reference can only be booked once
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_source_ref
  ON bookings (source, ota_ref) WHERE ota_ref IS NOT NULL;

-- Seed a little physical inventory so OTA sync has rooms to assign.
INSERT INTO rooms (room_number, room_type) VALUES
  ('201', 'Deluxe'), ('202', 'Deluxe'), ('203', 'Deluxe'), ('204', 'Deluxe'),
  ('301', 'Superior'), ('302', 'Superior'), ('303', 'Superior'),
  ('401', 'Suite'), ('402', 'Suite')
ON CONFLICT (room_number) DO NOTHING;

-- Team roster shown on the staff console's "Team Status" board.
-- role drives the colour-coded tag in the UI (admin | frontdesk | housekeeping).
CREATE TABLE IF NOT EXISTS employees (
  id          VARCHAR(50)  PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) NOT NULL,
  role        VARCHAR(30)  NOT NULL DEFAULT 'frontdesk',  -- admin | frontdesk | housekeeping
  status      VARCHAR(20)  NOT NULL DEFAULT 'off_shift',  -- on_shift | on_break | off_shift
  shift       VARCHAR(50),
  phone       VARCHAR(40),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed a representative team so the board is live on first run.
INSERT INTO employees (id, name, email, role, status, shift, phone) VALUES
  ('u_admin',  'Hotel Admin',       'hotel.admin@jpark.hotel',     'admin',        'on_shift',  '09:00–18:00', '+66 2 100 2000'),
  ('u_staff',  'Front Desk',        'front.desk@jpark.hotel',      'frontdesk',    'on_shift',  '07:00–15:00', '+66 2 100 2001'),
  ('e_ploy',   'Ploy Srisai',       'ploy.srisai@jpark.hotel',     'frontdesk',    'on_break',  '15:00–23:00', '+66 81 234 5678'),
  ('e_kenji',  'Kenji Watanabe',    'kenji.watanabe@jpark.hotel',  'frontdesk',    'off_shift', '23:00–07:00', '+66 81 234 5690'),
  ('e_malee',  'Malee Phongphan',   'malee.phongphan@jpark.hotel', 'housekeeping', 'on_shift',  '08:00–16:00', '+66 89 555 1212'),
  ('e_arun',   'Arun Chaiyaphum',   'arun.chaiyaphum@jpark.hotel', 'housekeeping', 'off_shift', '16:00–00:00', '+66 89 555 1234')
ON CONFLICT (id) DO NOTHING;

-- Keep updated_at current automatically
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_requests_updated_at ON service_requests;
CREATE TRIGGER trg_service_requests_updated_at
  BEFORE UPDATE ON service_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_employees_updated_at ON employees;
CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
