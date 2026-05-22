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

  const SEED_CONCIERGE = [
    { id: "c1", key: "conc.item.bangsaen",  img: "images/c3ac1733-933b-49de-aa10-7185a21dbe5f.jpg" },
    { id: "c2", key: "conc.item.market",    img: "images/843e2617-637f-4337-8f46-69ff1e5b6979.jpg" },
    { id: "c3", key: "conc.item.temple",    img: "images/3d6be05f-7084-4d60-915c-e76e587675b3.jpg" },
    { id: "c4", key: "conc.item.spa",       img: "images/ea770736-fe38-4c3e-b072-4928f8a2fad9.jpg" },
    { id: "c5", key: "conc.item.golf",      img: "images/9f43d60e-e1b0-4ea0-b8b2-82792fbd44eb.jpg" },
    { id: "c6", key: "conc.item.airport",   img: "images/ce70057e-42f0-4b44-9f67-18598f22ff3a.jpg" }
  ];

  function seed() {
    if (read("seeded")) {
      // keep newly added seed tables in sync for older saves
      if (!read("menu")) write("menu", SEED_MENU);
      if (!read("concierge")) write("concierge", SEED_CONCIERGE);
      return;
    }
    write("bookings", SEED_BOOKINGS);
    write("staff", SEED_STAFF);
    write("menu", SEED_MENU);
    write("concierge", SEED_CONCIERGE);
    write("requests", []);
    write("orders", []);
    write("chats", []);
    write("company", [
      { id: "cm1", author: "Hotel Admin", role: "admin",
        text: "Welcome to the staff board. Post shift notes and guest follow-ups here.",
        createdAt: Date.now() - 86400000 }
    ]);
    write("announcements", []);
    write("content", {});
    write("seeded", true);
  }

  /* reset helper (used by admin "reset demo data") */
  function resetAll() {
    Object.keys(localStorage)
      .filter((k) => k.indexOf(NS) === 0)
      .forEach((k) => localStorage.removeItem(k));
    seed();
    ["bookings","staff","menu","concierge","requests","orders","chats","company","announcements","content"]
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
