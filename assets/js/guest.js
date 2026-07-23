/* ============================================================
   J Park Hotel — guest portal
   Access gate, quick service matrix, in-room dining,
   live request tracker, and concierge wiring.
   API-first: all writes go to the backend; localStorage is
   the fallback when the API is unreachable (offline / dev).
   ============================================================ */
(function () {
  "use strict";
  const S = window.JPark.store;
  const I = window.JPark.i18n;
  const U = window.JPark.util;
  const t = (k) => I.t(k);

  const MATRIX = [
    { cat: "housekeeping", ico: "🧺", items: [
      { key: "req.towels", ico: "🛁" }, { key: "req.toiletries", ico: "🧴" },
      { key: "req.cleaning", ico: "🧹" }, { key: "req.linens", ico: "🛏️" },
      { key: "req.water", ico: "💧" }, { key: "req.coffeeRefill", ico: "☕" }
    ]},
    { cat: "maintenance", ico: "🔧", items: [
      { key: "req.ac", ico: "❄️" }, { key: "req.wifi", ico: "📶" },
      { key: "req.tv", ico: "📺" }, { key: "req.plumbing", ico: "🚿" },
      { key: "req.lightbulb", ico: "💡" }
    ]},
    { cat: "dining", ico: "🍽️", items: [
      { key: "req.breakfast", ico: "🍳" }, { key: "req.ice", ico: "🧊" }
    ]},
    { cat: "frontdesk", ico: "🛎️", items: [
      { key: "req.checkout", ico: "🕛" }, { key: "req.luggage", ico: "🧳" },
      { key: "req.taxi", ico: "🚕" }, { key: "req.wakeup", ico: "⏰" }
    ]}
  ];

  const els = {};
  let guest = null;
  let cart = {};
  let pollTimer = null;

  /* ──────────────────────────────── AUTH GATE ─────────────────────────────── */
  function normalize(s) { return (s || "").trim().toLowerCase(); }

  /* Try the API first; fall back to localStorage bookings on network failure. */
  async function tryLogin(last, room, ref) {
    const API = window.JPark.api;
    if (API) {
      // guestId rides along so the server can rate-limit per device instead of
      // per IP — the whole hotel shares one Wi-Fi address (see auth.js).
      const body = ref
        ? { ref: ref.trim(), guestId: S.guestId() }
        : { lastName: last.trim(), room: room.trim(), guestId: S.guestId() };
      const res = await API.post("/api/auth/guest-login", body);
      if (!res.error) return res; // { bookingId, name, lastName, room, ref }
      // 404 = auth route not deployed yet; 5xx = server error — fall through to localStorage.
      if (!res.offline && res.status !== 404 && res.status < 500) return null;
    }
    // Offline fallback
    const bookings = S.list("bookings");
    last = normalize(last); room = normalize(room); ref = normalize(ref);
    let bk = ref ? bookings.find((b) => normalize(b.ref) === ref) : null;
    if (!bk && last && room)
      bk = bookings.find((b) => normalize(b.lastName) === last && normalize(b.room) === room);
    if (!bk) return null;
    return {
      bookingId: bk.id,
      name: bk.lastName.charAt(0).toUpperCase() + bk.lastName.slice(1),
      lastName: bk.lastName,
      room: bk.room,
      ref: bk.ref,
    };
  }

  // `roomNumber` is the physical room the front desk assigns at check-in;
  // `room` is the room TYPE ("deluxe"). Prefer the number — it's what the guest
  // and the staff console both mean by "room" — and keep `ref` so the live-chat
  // widget can identify this guest without asking them all over again.
  function setGuest(info) {
    guest = {
      bookingId: info.bookingId,
      ref: info.ref,
      name: info.name,
      room: info.roomNumber || info.room,
      // false for an OTA / walk-in guest we couldn't match to a booking. They
      // get the full portal either way; the flag rides along so the front desk
      // can check the register (see routes/serviceRequests.js verifyGuest).
      verified: info.verified !== false,
    };
    S.setSession("guest", guest);
  }

  function showPortal() {
    if (!els.gate) return;
    els.gate.style.display = guest ? "none" : "block";
    els.portal.classList.toggle("show", !!guest);
    if (guest) {
      els.pbName.textContent = guest.name;
      els.pbRoom.textContent = guest.room;
      renderUnconfirmedNote();
      renderMatrix();
      renderMenu();
      renderCart();
      renderTracker();
      startTrackerPoll();
    } else {
      stopTrackerPoll();
    }
  }

  /* A guest we couldn't match to a booking still gets the whole portal — they
     just get told, once, that the front desk will confirm who they are. Kept
     out of the way (a quiet strip, not an error) because for an OTA or
     walk-in guest this is the normal, expected path, not a mistake. */
  function renderUnconfirmedNote() {
    const bar = document.querySelector("#svcPortal .portal-bar");
    if (!bar) return;
    let note = document.getElementById("pbUnconfirmed");
    if (guest && guest.verified === false) {
      if (!note) {
        note = document.createElement("p");
        note.id = "pbUnconfirmed";
        note.className = "pb-unconfirmed";
        bar.insertAdjacentElement("afterend", note);
      }
      note.textContent = t("gate.unconfirmed");
    } else if (note) {
      note.remove();
    }
  }

  function initGate() {
    els.gate   = document.getElementById("svcGate");
    els.portal = document.getElementById("svcPortal");
    if (!els.gate) return;
    els.pbName = document.getElementById("pbName");
    els.pbRoom = document.getElementById("pbRoom");
    const form = document.getElementById("gateForm");
    const err  = document.getElementById("gateError");

    guest = S.getSession("guest");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      const last = document.getElementById("gateLast").value;
      const room = document.getElementById("gateRoom").value;
      const ref  = document.getElementById("gateRef").value;
      const info = await tryLogin(last, room, ref);
      if (!info) { err.textContent = t("gate.error"); return; }
      setGuest(info);
      showPortal();
      U.toast(t("gate.welcome") + ", " + guest.name, "success");
      els.portal.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    document.getElementById("pbSignout").addEventListener("click", () => {
      guest = null; cart = {};
      S.clearSession("guest");
      showPortal();
    });

    showPortal();
  }

  /* ─────────────────────────────── SERVICE MATRIX ─────────────────────────── */
  function renderMatrix() {
    const wrap = document.getElementById("matrixGroups");
    if (!wrap) return;
    wrap.innerHTML = "";
    MATRIX.forEach((group) => {
      const g = document.createElement("div");
      g.className = "matrix-group";
      g.innerHTML =
        '<h4><span class="mg-ico">' + group.ico + "</span>" +
        U.escapeHtml(t("matrix.cat." + group.cat)) + "</h4>";
      const btns = document.createElement("div");
      btns.className = "matrix-buttons";
      group.items.forEach((it) => {
        const b = document.createElement("button");
        b.className = "req-btn";
        b.type = "button";
        b.innerHTML = '<span class="rb-ico">' + it.ico + "</span><span>" +
          U.escapeHtml(t(it.key)) + "</span>";
        b.addEventListener("click", () => {
          submitService(group.cat, it.key);
          b.classList.add("sent");
          setTimeout(() => b.classList.remove("sent"), 1200);
        });
        btns.appendChild(b);
      });
      g.appendChild(btns);
      wrap.appendChild(g);
    });
  }

  async function submitService(category, titleKey) {
    const guestId = S.guestId();
    const payload = {
      guestId,
      guestName: guest.name,
      roomNumber: guest.room,
      type: category,
      kind: "service",
      titleKey,
      title: t(titleKey),
      lang: I.getLang(),
      bookingRef: guest.ref || null, // server re-checks this to set the verified flag
    };

    const API = window.JPark.api;
    if (API) {
      const res = await API.post("/api/service-requests", payload);
      if (!res.error) {
        U.toast(t("matrix.sent"), "success");
        renderTracker();
        return;
      }
      // A server-side rejection used to be reported to the guest as "Request
      // sent!" — so when every POST started 500ing, guests kept tapping and
      // waiting for towels that no one had been told about. Only a genuinely
      // unreachable API (offline) falls through to the local queue; a server
      // that answered and said no is told to the guest, plainly.
      if (!res.offline) {
        console.error("[guest] service request failed:", res.error);
        U.toast(t("matrix.failed"), "error");
        return;
      }
    }
    // Offline fallback
    S.insert("requests", Object.assign(payload, { room: guest.room, status: "pending" }));
    U.toast(t("matrix.sent"), "success");
  }

  /* ─────────────────────────────── IN-ROOM DINING ─────────────────────────── */
  const RS_CATS = ["breakfast", "main", "drink", "dessert"];
  let activeCat = "breakfast";

  function renderMenu() {
    const catWrap  = document.getElementById("rsCats");
    const menuWrap = document.getElementById("rsMenu");
    if (!catWrap || !menuWrap) return;
    catWrap.innerHTML = "";
    RS_CATS.forEach((c) => {
      const b = document.createElement("button");
      b.className = "rs-cat-btn" + (c === activeCat ? " active" : "");
      b.type = "button";
      b.textContent = t("rs.cat." + c);
      b.addEventListener("click", () => { activeCat = c; renderMenu(); });
      catWrap.appendChild(b);
    });
    menuWrap.innerHTML = "";
    S.list("menu").filter((m) => m.cat === activeCat).forEach((m) => {
      const item = document.createElement("div");
      item.className = "rs-item";
      item.innerHTML =
        '<div><div class="rs-name">' + U.escapeHtml(t(m.key)) + "</div>" +
        '<div class="rs-price">' + U.money(m.price) + "</div></div>" +
        '<button class="rs-add" type="button" aria-label="' + U.escapeHtml(t("rs.add")) + '">+</button>';
      item.querySelector(".rs-add").addEventListener("click", () => {
        cart[m.id] = (cart[m.id] || 0) + 1; renderCart();
      });
      menuWrap.appendChild(item);
    });
  }

  function deliveryOptions() {
    const opts = ['<option value="asap">' + U.escapeHtml(t("rs.asap")) + "</option>"];
    const now = new Date();
    for (let i = 1; i <= 8; i++) {
      const d = new Date(now.getTime() + i * 30 * 60000);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(Math.floor(d.getMinutes() / 5) * 5).padStart(2, "0");
      const label = hh + ":" + mm;
      opts.push('<option value="' + label + '">' + label + "</option>");
    }
    return opts.join("");
  }

  function renderCart() {
    const wrap = document.getElementById("rsCart");
    if (!wrap) return;
    const menu  = S.list("menu");
    const lines = Object.keys(cart).filter((id) => cart[id] > 0);
    let html = "<h4>" + U.escapeHtml(t("rs.cart")) + "</h4>";
    if (!lines.length) {
      html += '<p class="cart-empty">' + U.escapeHtml(t("rs.cartEmpty")) + "</p>";
      wrap.innerHTML = html; return;
    }
    let total = 0;
    lines.forEach((id) => {
      const m = menu.find((x) => x.id === id); if (!m) return;
      const sub = m.price * cart[id]; total += sub;
      html +=
        '<div class="cart-line" data-id="' + id + '">' +
        '<span class="cl-name">' + U.escapeHtml(t(m.key)) + "</span>" +
        '<span class="cl-qty"><button type="button" data-act="dec">−</button>' +
        "<b>" + cart[id] + "</b>" +
        '<button type="button" data-act="inc">+</button></span>' +
        '<span class="cl-price">' + U.money(sub) + "</span></div>";
    });
    html +=
      '<div class="cart-total"><span>' + U.escapeHtml(t("rs.total")) + "</span><span>" + U.money(total) + "</span></div>" +
      '<div class="field"><label>' + U.escapeHtml(t("rs.deliveryTime")) + '</label><select id="rsDeliver">' + deliveryOptions() + "</select></div>" +
      '<div class="field"><label>' + U.escapeHtml(t("rs.notes")) + '</label><textarea id="rsNotes" placeholder="' + U.escapeHtml(t("rs.notesPh")) + '"></textarea></div>' +
      '<button class="btn btn-solid gold" id="rsPlace" type="button">' + U.escapeHtml(t("rs.place")) + "</button>";
    wrap.innerHTML = html;
    wrap.querySelectorAll(".cart-line").forEach((line) => {
      const id = line.getAttribute("data-id");
      line.querySelector('[data-act="inc"]').addEventListener("click", () => { cart[id]++; renderCart(); });
      line.querySelector('[data-act="dec"]').addEventListener("click", () => {
        cart[id]--; if (cart[id] <= 0) delete cart[id]; renderCart();
      });
    });
    wrap.querySelector("#rsPlace").addEventListener("click", placeOrder);
  }

  async function placeOrder() {
    const menu  = S.list("menu");
    const items = Object.keys(cart).filter((id) => cart[id] > 0).map((id) => {
      const m = menu.find((x) => x.id === id);
      return { key: m.key, name: t(m.key), qty: cart[id], price: m.price };
    });
    if (!items.length) return;
    const deliver = (document.getElementById("rsDeliver") || {}).value || "asap";
    const note    = (document.getElementById("rsNotes")   || {}).value || "";
    const total   = items.reduce((s, it) => s + it.price * it.qty, 0);
    const guestId = S.guestId();

    const payload = {
      guestId, guestName: guest.name, room: guest.room,
      items, deliverAt: deliver, notes: note, total,
      bookingRef: guest.ref || null,
    };

    const API = window.JPark.api;
    if (API) {
      const res = await API.post("/api/orders", payload);
      if (!res.error) {
        cart = {}; renderCart();
        U.toast(t("rs.placed"), "success");
        renderTracker();
        return;
      }
      // Same rule as submitService(): a rejected order is never reported as
      // placed. Keep the cart intact so the guest can retry rather than
      // re-picking every dish.
      if (!res.offline) {
        console.error("[guest] order failed:", res.error);
        U.toast(t("matrix.failed"), "error");
        return;
      }
    }
    // Offline fallback
    S.insert("requests", Object.assign({
      kind: "order", category: "dining",
      titleKey: "staff.requests.order", title: t("staff.requests.order"),
      room: guest.room, guestName: guest.name, guestId,
      lang: I.getLang(), deliverAt: deliver, note, status: "pending",
    }, { items, total }));
    cart = {}; renderCart();
    U.toast(t("rs.placed"), "success");
    renderTracker();
  }

  /* ─────────────────────────────── STATUS TRACKER ─────────────────────────── */
  const STATUS_ORDER = ["pending", "progress", "done"];

  function statusRail(status) {
    if (status === "cancelled") return "";
    const map = { pending: "pending", in_progress: "progress", progress: "progress", done: "done" };
    const s   = map[status] || status;
    const idx = STATUS_ORDER.indexOf(s);
    let html  = '<div class="ti-rail">';
    STATUS_ORDER.forEach((step, i) => {
      html += '<span class="dot' + (i <= idx ? " on" : "") + '"></span>';
      if (i < STATUS_ORDER.length - 1) html += '<span class="step' + (i < idx ? " on" : "") + '"></span>';
    });
    return html + "</div>";
  }

  function reqTitle(r) {
    if (r.kind === "order" || r.titleKey === "staff.requests.order") {
      const names = (r.items || []).map((it) => it.qty + "× " + t(it.key || "")).join(", ");
      return t("staff.requests.order") + (names ? " — " + names : "");
    }
    return r.titleKey ? t(r.titleKey) : (r.title || "");
  }

  function normaliseStatus(s) {
    return s === "in_progress" ? "progress" : (s || "pending");
  }

  /* Merge service-requests and orders from API into one flat list. */
  async function fetchTrackerItems() {
    const guestId = S.guestId();
    const API     = window.JPark.api;
    if (!API) return null;

    const [srRes, ordRes] = await Promise.all([
      API.get("/api/service-requests?guestId=" + encodeURIComponent(guestId)),
      API.get("/api/orders?guestId="           + encodeURIComponent(guestId)),
    ]);

    if (srRes.offline) return null; // fall back to localStorage

    const srs  = (Array.isArray(srRes) ? srRes : []).map((r) => ({
      id: r.id, kind: r.kind || "service",
      titleKey: r.titleKey || r.title_key,
      title: r.title, category: r.type,
      room: r.roomNumber || r.room_number,
      guestName: r.guestName || r.guest_name,
      items: r.items || [],
      deliverAt: r.deliverAt || r.deliver_at,
      note: r.note || r.notes,
      total: r.total,
      status: normaliseStatus(r.status),
      createdAt: r.createdAt || (r.created_at ? new Date(r.created_at).getTime() : 0),
    }));

    const ords = (Array.isArray(ordRes) ? ordRes : []).map((r) => ({
      id: "ord-" + r.id, kind: "order",
      titleKey: "staff.requests.order", title: t("staff.requests.order"),
      category: "dining",
      room: r.room || r.room_number,
      guestName: r.guestName || r.guest_name,
      items: r.items || [],
      deliverAt: r.deliverAt || r.deliver_at,
      note: r.note || r.notes,
      total: r.total,
      status: normaliseStatus(r.status),
      createdAt: r.createdAt || (r.created_at ? new Date(r.created_at).getTime() : 0),
    }));

    return [...srs, ...ords];
  }

  function renderTrackerItems(mine) {
    const wrap = document.getElementById("trackList");
    if (!wrap || !guest) return;
    mine = mine || S.list("requests").filter((r) => r.room === guest.room);
    mine = mine.sort((a, b) => b.createdAt - a.createdAt);

    if (!mine.length) {
      wrap.innerHTML = '<p class="track-empty">' + U.escapeHtml(t("track.empty")) + "</p>"; return;
    }
    wrap.innerHTML = "";
    mine.forEach((r) => {
      const normStatus = normaliseStatus(r.status);
      const item = document.createElement("div");
      item.className = "track-item";
      const canCancel = normStatus === "pending";
      let meta = U.timeAgo(r.createdAt);
      if ((r.kind === "order") && r.deliverAt)
        meta += " · " + t("rs.deliveryTime") + " " + (r.deliverAt === "asap" ? t("rs.asap") : r.deliverAt);
      item.innerHTML =
        '<div class="ti-head"><span class="ti-title">' + U.escapeHtml(reqTitle(r)) + "</span>" +
        '<span class="badge ' + normStatus + '">' + U.escapeHtml(t("track.status." + normStatus)) + "</span></div>" +
        statusRail(normStatus) +
        '<div class="ti-meta">' + U.escapeHtml(meta) + "</div>" +
        (r.note ? '<div class="ti-note">"' + U.escapeHtml(r.note) + '"</div>' : "") +
        (canCancel ? '<button class="link-cancel" type="button">' + U.escapeHtml(t("track.cancel")) + "</button>" : "");
      if (canCancel) {
        item.querySelector(".link-cancel").addEventListener("click", () => cancelItem(r));
      }
      wrap.appendChild(item);
    });
  }

  async function cancelItem(r) {
    const API = window.JPark.api;
    // The guest has no login, so the cancel is authorised by the guestId they
    // were issued — the server scopes the UPDATE to that guest's own pending
    // rows. Without it these calls came back 401 and the item just sat there.
    const guestId = S.guestId();
    let res = null;
    if (API && String(r.id).startsWith("ord-")) {
      res = await API.patch("/api/orders/" + r.id.replace("ord-", ""), { status: "cancelled", guestId });
    } else if (API && r.id != null) {
      res = await API.patch("/api/service-requests/" + r.id, { status: "cancelled", guestId });
    }
    if (!res || (res.error && res.offline)) {
      S.update("requests", r.id, { status: "cancelled" });
    } else if (res.error) {
      U.toast(t("matrix.failed"), "error");
    }
    renderTracker();
  }

  async function renderTracker() {
    const items = await fetchTrackerItems();
    renderTrackerItems(items || undefined);
  }

  function startTrackerPoll() {
    stopTrackerPoll();
    pollTimer = setInterval(renderTracker, 8000);
  }
  function stopTrackerPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  /* ─────────────────────────────── CONCIERGE ──────────────────────────────── */
  function renderConcierge() {
    const grid = document.getElementById("concGrid");
    if (!grid) return;
    grid.innerHTML = "";
    S.list("concierge").forEach((c) => {
      const card = document.createElement("article");
      card.className = "conc-card";
      card.innerHTML =
        '<div class="cc-img"><img loading="lazy" src="' + encodeURI(c.img) + '" alt="' + U.escapeHtml(t(c.key + ".t")) + '" /></div>' +
        '<div class="cc-body"><h3>' + U.escapeHtml(t(c.key + ".t")) + "</h3>" +
        "<p>" + U.escapeHtml(t(c.key + ".d")) + "</p>" +
        '<div class="cc-actions">' +
        '<button class="cc-ask" type="button">' + U.escapeHtml(t("conc.ask")) + "</button>" +
        '<button class="cc-book" type="button">' + U.escapeHtml(t("conc.book")) + "</button>" +
        "</div></div>";
      card.querySelector(".cc-ask").addEventListener("click", () => {
        if (window.JPark.chat) window.JPark.chat.askAbout(t(c.key + ".t"));
      });
      card.querySelector(".cc-book").addEventListener("click", () => {
        submitService("frontdesk", c.key + ".t");
        U.toast(t("conc.booked"), "success");
        if (guest) renderTracker();
      });
      grid.appendChild(card);
    });
  }

  /* ─────────────────────────────── WIRING ─────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", () => {
    initGate();
    renderConcierge();

    S.on("requests", () => { if (guest) renderTracker(); });
    S.on("menu",     () => { if (guest) { renderMenu(); renderCart(); } });
    S.on("concierge", renderConcierge);

    document.addEventListener("jpark:langchange", () => {
      renderConcierge();
      if (guest) { renderMatrix(); renderMenu(); renderCart(); renderTracker(); }
    });
  });
})();
