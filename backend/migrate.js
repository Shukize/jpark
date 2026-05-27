const fs = require('fs');
const path = require('path');
const db = require('./db');

/* Seed demo staff passwords with bcrypt on first run or when missing. */
async function seedAuth() {
  let bcrypt;
  try { bcrypt = require('bcrypt'); } catch (_) { return; }

  const SEED = [
    { id: 'u_admin', username: 'admin', password: 'admin123', role: 'admin' },
    { id: 'u_staff', username: 'staff', password: 'staff123', role: 'frontdesk' },
  ];

  for (const s of SEED) {
    const { rows } = await db.query(
      'SELECT username, password_hash FROM employees WHERE id = $1',
      [s.id]
    );
    if (!rows.length || rows[0].password_hash) continue; // already hashed
    const hash = await bcrypt.hash(s.password, 10);
    await db.query(
      `UPDATE employees
          SET username = $1, password_hash = $2
        WHERE id = $3`,
      [s.username, hash, s.id]
    );
  }
}

/* Seed demo guest bookings (used for guest-portal login + OTA inbox). */
async function seedGuestBookings() {
  const SEED = [
    {
      ref: 'JP-1001', channel: 'direct', channel_name: 'Direct',
      guest_name: 'Daniel Robinson', guest_last_name: 'robinson',
      guest_email: 'd.robinson@gmail.com', guest_phone: '+44 7700 900812',
      room: '101', check_in: '2026-06-01', check_out: '2026-06-08',
      nights: 7, adults: 2, children: 0, total: 12950, currency: 'THB',
      status: 'confirmed', lang: 'en',
      confirmation: 'Dear J Park Hotel,\n\nDirect booking confirmed.\n\nGuest: Daniel Robinson\nRoom: 101 (Deluxe)\nCheck-in: 01 June 2026\nCheck-out: 08 June 2026\nGuests: 2 adults\nTotal: THB 12,950',
    },
    {
      ref: 'JP-1002', channel: 'direct', channel_name: 'Direct',
      guest_name: 'Yuki Miyamoto', guest_last_name: 'miyamoto',
      guest_email: 'yuki.miyamoto@example.jp', guest_phone: '+81 90-1234-5678',
      room: '204', check_in: '2026-06-05', check_out: '2026-06-08',
      nights: 3, adults: 2, children: 1, total: 7350, currency: 'THB',
      status: 'confirmed', lang: 'ja',
      confirmation: 'J Park Hotel 御中\n\n直接予約が確定しました。\n\nお客様: Yuki Miyamoto 様\n客室: 204 (スーペリア)\nチェックイン: 2026年6月5日\nチェックアウト: 2026年6月8日\n合計: THB 7,350',
    },
    {
      ref: 'JP-1003', channel: 'direct', channel_name: 'Direct',
      guest_name: 'Wei Chen', guest_last_name: 'chen',
      guest_email: 'wei.chen@example.com', guest_phone: '+86 138 0013 8000',
      room: '312', check_in: '2026-06-10', check_out: '2026-06-14',
      nights: 4, adults: 2, children: 0, total: 14200, currency: 'THB',
      status: 'confirmed', lang: 'zh-Hans',
      confirmation: '您好，J Park Hotel：\n\n直接预订已确认。\n\n房客: Wei Chen\n房型: 312 (套房)\n入住: 2026年6月10日\n退房: 2026年6月14日\n总额: THB 14,200',
    },
    {
      ref: 'JP-1004', channel: 'direct', channel_name: 'Direct',
      guest_name: 'Somchai Suksawat', guest_last_name: 'suksawat',
      guest_email: 'somchai.s@example.co.th', guest_phone: '+66 81 234 5678',
      room: '508', check_in: '2026-06-12', check_out: '2026-06-13',
      nights: 1, adults: 1, children: 0, total: 1490, currency: 'THB',
      status: 'confirmed', lang: 'th',
      confirmation: 'เรียน โรงแรม J Park\n\nการจองตรงได้รับการยืนยันแล้ว\n\nผู้เข้าพัก: สมชาย สุขสวัสดิ์\nห้อง: 508 (สวีท)\nเช็คอิน: 12 มิถุนายน 2026\nเช็คเอาท์: 13 มิถุนายน 2026\nยอดรวม: THB 1,490',
    },
    {
      ref: 'AGD-849217643', channel: 'agoda', channel_name: 'Agoda',
      channel_email: 'bookings@agoda.com',
      guest_name: 'Daniel Robinson', guest_last_name: 'robinson',
      guest_email: 'd.robinson@gmail.com', guest_phone: '+44 7700 900812',
      room: 'Deluxe Twin', check_in: '2026-06-02', check_out: '2026-06-03',
      nights: 1, adults: 2, children: 0, total: 1850, currency: 'THB',
      status: 'confirmed', lang: 'en',
      confirmation:
        "Dear J Park Hotel, a new reservation has been confirmed through Agoda.\n\n" +
        "Booking ID: 849217643\nGuest: Daniel Robinson\nRoom: Deluxe Twin (1 room)\n" +
        "Check-in: 02 June 2026 (from 14:00)\nCheck-out: 03 June 2026 (until 12:00)\n" +
        "Guests: 2 adults\nTotal paid by guest: THB 1,850 (prepaid online)\n\n" +
        "Guest note: Arriving late around 23:00, please hold the room.",
    },
    {
      ref: 'BDC-7741920358', channel: 'booking', channel_name: 'Booking.com',
      channel_email: 'noreply@booking.com',
      guest_name: 'Yuki Miyamoto', guest_last_name: 'miyamoto',
      guest_email: 'yuki.miyamoto@example.jp', guest_phone: '+81 90-1234-5678',
      room: 'Studio Double', check_in: '2026-06-05', check_out: '2026-06-08',
      nights: 3, adults: 2, children: 1, total: 7350, currency: 'THB',
      status: 'confirmed', lang: 'ja',
      confirmation:
        "J Park Hotel 御中\n\nBooking.com 経由で新しいご予約が確定しました。\n\n" +
        "予約番号: 7741920358\nお客様: Yuki Miyamoto 様\n客室: スタジオ ダブル（1室）\n" +
        "チェックイン: 2026年6月5日\nチェックアウト: 2026年6月8日\n" +
        "ご宿泊人数: 大人2名、子供1名\n合計: THB 7,350\n\n" +
        "ご要望: ベビーベッドを1台お願いします。静かなお部屋を希望します。",
    },
    {
      ref: 'ABNB-HMQT4E9XZ2', channel: 'airbnb', channel_name: 'Airbnb',
      channel_email: 'automated@airbnb.com',
      guest_name: 'Wei Chen', guest_last_name: 'chen',
      guest_email: 'wei.chen@example.com', guest_phone: '+86 138 0013 8000',
      room: 'Grand Suite', check_in: '2026-06-10', check_out: '2026-06-14',
      nights: 4, adults: 2, children: 0, total: 14200, currency: 'THB',
      status: 'confirmed', lang: 'zh-Hans',
      confirmation:
        "您好，J Park Hotel：\n\n您在 Airbnb 上收到一笔新的预订。\n\n" +
        "确认码: HMQT4E9XZ2\n房客: Wei Chen\n房型: 豪华套房（Grand Suite）\n" +
        "入住: 2026年6月10日\n退房: 2026年6月14日\n人数: 2位成人\n总额: THB 14,200\n\n" +
        "房客留言: 我们大约下午3点到达，希望能提前办理入住。需要机场接送服务。",
    },
    {
      ref: 'TRIP-7609475118', channel: 'trip', channel_name: 'Trip.com',
      channel_email: 'hotel@trip.com',
      guest_name: 'Somchai Suksawat', guest_last_name: 'suksawat',
      guest_email: 'somchai.s@example.co.th', guest_phone: '+66 81 234 5678',
      room: 'Superior Room', check_in: '2026-06-12', check_out: '2026-06-13',
      nights: 1, adults: 1, children: 0, total: 1490, currency: 'THB',
      status: 'confirmed', lang: 'th',
      confirmation:
        "เรียน โรงแรม J Park\n\nมีการจองใหม่ผ่าน Trip.com ได้รับการยืนยันแล้ว\n\n" +
        "หมายเลขการจอง: 7609475118\nผู้เข้าพัก: สมชาย สุขสวัสดิ์\nห้อง: ห้องซูพีเรียร์ (1 ห้อง)\n" +
        "เช็คอิน: 12 มิถุนายน 2569\nเช็คเอาท์: 13 มิถุนายน 2569\n" +
        "ยอดรวม: THB 1,490\n\nหมายเหตุจากผู้เข้าพัก: ขอเตียงเสริมและที่จอดรถครับ",
    },
  ];

  for (const b of SEED) {
    await db.query(
      `INSERT INTO guest_bookings
         (ref, channel, channel_name, channel_email, guest_name, guest_last_name,
          guest_email, guest_phone, room, check_in, check_out, nights, adults,
          children, total, currency, status, lang, confirmation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (ref) DO NOTHING`,
      [
        b.ref, b.channel, b.channel_name, b.channel_email || null,
        b.guest_name, b.guest_last_name, b.guest_email, b.guest_phone,
        b.room, b.check_in, b.check_out, b.nights, b.adults,
        b.children, b.total, b.currency, b.status, b.lang, b.confirmation,
      ]
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

async function migrate() {
  const sql = require('fs').readFileSync(require('path').join(__dirname, 'schema.sql'), 'utf8');
  await db.query(sql);
  console.log('[migrate] schema up to date');

  await seedAuth();
  console.log('[migrate] staff auth ready');

  await seedGuestBookings();
  console.log('[migrate] guest bookings seeded');

  await seedMessages();
  console.log('[migrate] messages seeded');
}

module.exports = migrate;
