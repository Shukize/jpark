/* ============================================================
   J Park Hotel — client-side data store
   A small localStorage-backed "database" with collection
   helpers, demo seed data, and real-time pub/sub that syncs
   across open browser tabs (guest tab <-> front-desk tab).
   ============================================================ */
(function () {
  "use strict";

  const NS = "jpark.db.";
  const listeners = Object.create(null); // table -> Set<callback>

  const keyFor = (table) => NS + table;

  function read(table, fallback) {
    try {
      const raw = localStorage.getItem(keyFor(table));
      if (raw == null) return fallback === undefined ? null : fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback === undefined ? null : fallback;
    }
  }

  function write(table, value) {
    localStorage.setItem(keyFor(table), JSON.stringify(value));
    emit(table, value);
  }

  function emit(table, value) {
    const set = listeners[table];
    if (!set) return;
    set.forEach((cb) => {
      try { cb(value); } catch (e) { console.error("[store] listener error", e); }
    });
  }

  function on(table, cb) {
    (listeners[table] = listeners[table] || new Set()).add(cb);
    return () => listeners[table] && listeners[table].delete(cb);
  }

  // Cross-tab: localStorage writes in OTHER tabs fire a storage event here.
  window.addEventListener("storage", (e) => {
    if (!e.key || e.key.indexOf(NS) !== 0) return;
    const table = e.key.slice(NS.length);
    let value = null;
    try { value = e.newValue ? JSON.parse(e.newValue) : null; } catch (_) {}
    emit(table, value);
  });

  /* ---------- collection helpers (tables that hold arrays) ---------- */
  function list(table) {
    const v = read(table, []);
    return Array.isArray(v) ? v : [];
  }
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function insert(table, record) {
    const arr = list(table);
    if (!record.id) record.id = genId();
    if (!record.createdAt) record.createdAt = Date.now();
    arr.push(record);
    write(table, arr);
    return record;
  }
  function update(table, id, patch) {
    const arr = list(table);
    const i = arr.findIndex((r) => r.id === id);
    if (i < 0) return null;
    arr[i] = Object.assign({}, arr[i], patch, { updatedAt: Date.now() });
    write(table, arr);
    return arr[i];
  }
  function remove(table, id) {
    write(table, list(table).filter((r) => r.id !== id));
  }
  function find(table, id) {
    return list(table).find((r) => r.id === id) || null;
  }

  /* ---------- per-tab/device session ---------- */
  const SESS = "jpark.session.";
  function setSession(name, val) {
    try { sessionStorage.setItem(SESS + name, JSON.stringify(val)); } catch (_) {}
  }
  function getSession(name) {
    try {
      const r = sessionStorage.getItem(SESS + name);
      return r ? JSON.parse(r) : null;
    } catch (_) { return null; }
  }
  function clearSession(name) {
    try { sessionStorage.removeItem(SESS + name); } catch (_) {}
  }

  /* a persistent anonymous id for the guest chat (survives reloads) */
  function guestId() {
    let id = localStorage.getItem("jpark.guestId");
    if (!id) { id = "g_" + genId(); localStorage.setItem("jpark.guestId", id); }
    return id;
  }

  /* ============================================================
     Demo seed data
     ============================================================ */
  const SEED_BOOKINGS = [
    { id: "bk1", ref: "JP-1001", lastName: "robinson",  room: "101" },
    { id: "bk2", ref: "JP-1002", lastName: "miyamoto",  room: "204" },
    { id: "bk3", ref: "JP-1003", lastName: "chen",      room: "312" },
    { id: "bk4", ref: "JP-1004", lastName: "suksawat",  room: "508" }
  ];

  // NOTE: This is a front-end demo. In a real deployment passwords would be
  // hashed and verified on a server — never stored in the browser.
  const SEED_STAFF = [
    { id: "u_admin", username: "admin", password: "admin123", name: "Hotel Admin", role: "admin", active: true },
    { id: "u_staff", username: "staff", password: "staff123", name: "Front Desk",  role: "staff", active: true }
  ];

  const SEED_MENU = [
    { id: "m1", cat: "breakfast", key: "menu.item.congee",   price: 180 },
    { id: "m2", cat: "breakfast", key: "menu.item.eggs",     price: 220 },
    { id: "m3", cat: "breakfast", key: "menu.item.pancakes", price: 240 },
    { id: "m4", cat: "main",      key: "menu.item.padthai",  price: 260 },
    { id: "m5", cat: "main",      key: "menu.item.ramen",    price: 320 },
    { id: "m6", cat: "main",      key: "menu.item.burger",   price: 350 },
    { id: "m7", cat: "main",      key: "menu.item.salad",    price: 240 },
    { id: "m8", cat: "drink",     key: "menu.item.coffee",   price: 120 },
    { id: "m9", cat: "drink",     key: "menu.item.juice",    price: 140 },
    { id: "m10", cat: "drink",    key: "menu.item.wine",     price: 420 },
    { id: "m11", cat: "dessert",  key: "menu.item.mango",    price: 200 },
    { id: "m12", cat: "dessert",  key: "menu.item.cake",     price: 220 }
  ];

  /* Guest bookings arriving from external OTA channels (Agoda, Booking.com,
     Airbnb, Trip.com …). On a real deployment these are pushed in by a small
     bridge — an email-forwarding rule or channel-manager webhook — that calls
     JPark.bookings.ingest(). These seeds make the "Guest Booking" inbox live
     for the demo. `confirmation` is the free-text body that gets auto-
     translated into each staff member's language; `lang` marks its source. */
  const SEED_GUEST_BOOKINGS = [
    {
      id: "gb1", ref: "AGD-849217643", channel: "agoda", channelName: "Agoda",
      guestName: "Daniel Robinson", guestEmail: "d.robinson@gmail.com", guestPhone: "+44 7700 900812",
      room: "Deluxe Twin", checkIn: "2026-06-02", checkOut: "2026-06-03", nights: 1,
      adults: 2, children: 0, total: 1850, currency: "THB", status: "confirmed", lang: "en",
      confirmation:
        "Dear J Park Hotel, a new reservation has been confirmed through Agoda.\n\n" +
        "Booking ID: 849217643\nGuest: Daniel Robinson\nRoom: Deluxe Twin (1 room)\n" +
        "Check-in: 02 June 2026 (from 14:00)\nCheck-out: 03 June 2026 (until 12:00)\n" +
        "Guests: 2 adults\nTotal paid by guest: THB 1,850 (prepaid online)\n\n" +
        "Guest note: Arriving late around 23:00, please hold the room. A high floor would be appreciated.",
      readBy: [], createdAt: Date.now() - 1000 * 60 * 26
    },
    {
      id: "gb2", ref: "BDC-7741920358", channel: "booking", channelName: "Booking.com",
      guestName: "Yuki Miyamoto", guestEmail: "yuki.miyamoto@example.jp", guestPhone: "+81 90-1234-5678",
      room: "Studio Double", checkIn: "2026-06-05", checkOut: "2026-06-08", nights: 3,
      adults: 2, children: 1, total: 7350, currency: "THB", status: "confirmed", lang: "ja",
      confirmation:
        "J Park Hotel 御中\n\nBooking.com 経由で新しいご予約が確定しました。\n\n" +
        "予約番号: 7741920358\nお客様: Yuki Miyamoto 様\n客室: スタジオ ダブル（1室）\n" +
        "チェックイン: 2026年6月5日\nチェックアウト: 2026年6月8日\n" +
        "ご宿泊人数: 大人2名、子供1名\n合計: THB 7,350\n\n" +
        "ご要望: ベビーベッドを1台お願いします。静かなお部屋を希望します。",
      readBy: [], createdAt: Date.now() - 1000 * 60 * 60 * 3
    },
    {
      id: "gb3", ref: "ABNB-HMQT4E9XZ2", channel: "airbnb", channelName: "Airbnb",
      guestName: "Wei Chen", guestEmail: "wei.chen@example.com", guestPhone: "+86 138 0013 8000",
      room: "Grand Suite", checkIn: "2026-06-10", checkOut: "2026-06-14", nights: 4,
      adults: 2, children: 0, total: 14200, currency: "THB", status: "confirmed", lang: "zh-Hans",
      confirmation:
        "您好，J Park Hotel：\n\n您在 Airbnb 上收到一笔新的预订。\n\n" +
        "确认码: HMQT4E9XZ2\n房客: Wei Chen\n房型: 豪华套房（Grand Suite）\n" +
        "入住: 2026年6月10日\n退房: 2026年6月14日\n人数: 2位成人\n总额: THB 14,200\n\n" +
        "房客留言: 我们大约下午3点到达，希望能提前办理入住。需要机场接送服务。",
      readBy: [], createdAt: Date.now() - 1000 * 60 * 60 * 20
    },
    {
      id: "gb4", ref: "TRIP-7609475118", channel: "trip", channelName: "Trip.com",
      guestName: "Somchai Suksawat", guestEmail: "somchai.s@example.co.th", guestPhone: "+66 81 234 5678",
      room: "Superior Room", checkIn: "2026-06-12", checkOut: "2026-06-13", nights: 1,
      adults: 1, children: 0, total: 1490, currency: "THB", status: "confirmed", lang: "th",
      confirmation:
        "เรียน โรงแรม J Park\n\nมีการจองใหม่ผ่าน Trip.com ได้รับการยืนยันแล้ว\n\n" +
        "หมายเลขการจอง: 7609475118\nผู้เข้าพัก: สมชาย สุขสวัสดิ์\nห้อง: ห้องซูพีเรียร์ (1 ห้อง)\n" +
        "เช็คอิน: 12 มิถุนายน 2569\nเช็คเอาท์: 13 มิถุนายน 2569\nจำนวน: ผู้ใหญ่ 1 ท่าน\n" +
        "ยอดรวม: THB 1,490\n\nหมายเหตุจากผู้เข้าพัก: ขอเตียงเสริมและที่จอดรถครับ",
      readBy: [], createdAt: Date.now() - 1000 * 60 * 60 * 30
    }
  ];

  const SEED_CONCIERGE = [
    { id: "c1", key: "conc.item.bangsaen",  img: "images/Tropical Pool/c3ac1733-933b-49de-aa10-7185a21dbe5f.jpg" },
    { id: "c2", key: "conc.item.market",    img: "images/843e2617-637f-4337-8f46-69ff1e5b6979.jpg" },
    { id: "c3", key: "conc.item.temple",    img: "images/3d6be05f-7084-4d60-915c-e76e587675b3.jpg" },
    { id: "c4", key: "conc.item.spa",       img: "images/ea770736-fe38-4c3e-b072-4928f8a2fad9.jpg" },
    { id: "c5", key: "conc.item.golf",      img: "images/9f43d60e-e1b0-4ea0-b8b2-82792fbd44eb.jpg" },
    { id: "c6", key: "conc.item.airport",   img: "images/Tropical Pool/ce70057e-42f0-4b44-9f67-18598f22ff3a.jpg" }
  ];

  function seed() {
    if (read("seeded")) {
      // keep newly added seed tables in sync for older saves
      if (!read("menu")) write("menu", SEED_MENU);
      if (!read("concierge")) write("concierge", SEED_CONCIERGE);
      if (!read("messages")) write("messages", []);
      if (!read("resetRequests")) write("resetRequests", []);
      if (!read("guestBookings")) write("guestBookings", SEED_GUEST_BOOKINGS);
      // sync seed bookings so renames/updates to seed data take effect
      var bks = list("bookings"); var dirty = false;
      SEED_BOOKINGS.forEach(function(sb) {
        var i = bks.findIndex(function(b) { return b.id === sb.id; });
        if (i < 0) { bks.push(sb); dirty = true; }
        else if (JSON.stringify(bks[i]) !== JSON.stringify(sb)) { bks[i] = sb; dirty = true; }
      });
      if (dirty) write("bookings", bks);
      return;
    }
    write("bookings", SEED_BOOKINGS);
    write("staff", SEED_STAFF);
    write("menu", SEED_MENU);
    write("concierge", SEED_CONCIERGE);
    write("guestBookings", SEED_GUEST_BOOKINGS);
    write("requests", []);
    write("orders", []);
    write("chats", []);
    write("company", [
      { id: "cm1", author: "Hotel Admin", role: "admin",
        text: "Welcome to the staff board. Post shift notes and guest follow-ups here.",
        createdAt: Date.now() - 86400000 }
    ]);
    write("messages", [
      { id: "ms1", fromId: "u_admin", fromName: "Hotel Admin", fromRole: "admin",
        subject: "Welcome to J Park Messaging",
        body: "Welcome to the new internal messaging system. Use this space for private team communications and company-wide announcements.\n\nAll staff can send private messages to up to 10 colleagues at a time. Administrators can also broadcast announcements to everyone.\n\nBest regards,\nHotel Administration",
        to: "all", toNames: "Everyone", createdAt: Date.now() - 86400000 * 2, readBy: [] },
      { id: "ms2", fromId: "u_admin", fromName: "Hotel Admin", fromRole: "admin",
        subject: "Holiday Coverage — Please Confirm Availability",
        body: "Good morning team,\n\nPlease confirm your availability for the upcoming Songkran holiday period (April 13–15).\n\nReply to this message with your preferred shifts. We will post the final schedule at least one week in advance.\n\nThank you for your continued dedication.\n\nHotel Administration",
        to: ["u_staff"], toNames: ["Front Desk"], createdAt: Date.now() - 3600000 * 3, readBy: [] }
    ]);
    write("announcements", []);
    write("resetRequests", []);
    write("content", {});
    write("seeded", true);
  }

  /* reset helper (used by admin "reset demo data") */
  function resetAll() {
    Object.keys(localStorage)
      .filter((k) => k.indexOf(NS) === 0)
      .forEach((k) => localStorage.removeItem(k));
    seed();
    ["bookings","staff","menu","concierge","requests","orders","chats","company","messages","announcements","content","guestBookings","resetRequests"]
      .forEach((t) => emit(t, read(t)));
  }

  window.JPark = window.JPark || {};
  window.JPark.store = {
    read, write, on, list, insert, update, remove, find,
    setSession, getSession, clearSession, guestId, genId,
    seed, resetAll
  };

  seed();
})();
