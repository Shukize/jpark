/* ============================================================
   J Park Hotel — guest portal
   Access gate, quick service matrix, in-room dining,
   live request tracker, and concierge wiring.
   ============================================================ */
(function () {
  "use strict";
  const S = window.JPark.store;
  const I = window.JPark.i18n;
  const U = window.JPark.util;
  const t = (k) => I.t(k);

  /* ---------- service request matrix definition ---------- */
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
  let guest = null;       // { bookingId, name, room }
  let cart = {};          // itemId -> qty

  /* ====================  AUTH GATE  ==================== */
  function normalize(s) { return (s || "").trim().toLowerCase(); }

  function tryLogin(last, room, ref) {
    const bookings = S.list("bookings");
    last = normalize(last); room = normalize(room); ref = normalize(ref);
    let bk = null;
    if (ref) {
      bk = bookings.find((b) => normalize(b.ref) === ref);
    }
    if (!bk && last && room) {
      bk = bookings.find((b) => normalize(b.lastName) === last && normalize(b.room) === room);
    }
    return bk;
  }

  function setGuest(bk) {
    const name = bk.lastName.charAt(0).toUpperCase() + bk.lastName.slice(1);
    guest = { bookingId: bk.id, name: name, room: bk.room };
    S.setSession("guest", guest);
  }

  function showPortal() {
    if (!els.gate) return;
    els.gate.style.display = guest ? "none" : "block";
    els.portal.classList.toggle("show", !!guest);
    if (guest) {
      els.pbName.textContent = guest.name;
      els.pbRoom.textContent = guest.room;
      renderMatrix();
      renderMenu();
      renderCart();
      renderTracker();
    }
  }

  function initGate() {
    els.gate = document.getElementById("svcGate");
    els.portal = document.getElementById("svcPortal");
    if (!els.gate) return;
    els.pbName = document.getElementById("pbName");
    els.pbRoom = document.getElementById("pbRoom");
    const form = document.getElementById("gateForm");
    const err = document.getElementById("gateError");

    guest = S.getSession("guest");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      err.textContent = "";
      const bk = tryLogin(
        document.getElementById("gateLast").value,
        document.getElementById("gateRoom").value,
        document.getElementById("gateRef").value
      );
      if (!bk) { err.textContent = t("gate.error"); return; }
      setGuest(bk);
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

  /* ====================  SERVICE MATRIX  ==================== */
  function renderMatrix() {
    const wrap = document.getElementById("matrixGroups");
    if (!wrap) return;
    wrap.innerHTML = "";
    MATRIX.forEach((group) => {
      const g = document.createElement("div");
      g.className = "matrix-group";
      g.innerHTML =
        '<h4><span class="mg-ico">' + group.ico + '</span>' +
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

  function submitService(category, titleKey) {
    S.insert("requests", {
      kind: "service",
      category: category,
      titleKey: titleKey,
      title: t(titleKey),
      room: guest.room,
      guestName: guest.name,
      guestId: S.guestId(),
      lang: I.getLang(),
      status: "pending"
    });
    U.toast(t("matrix.sent"), "success");
  }

  /* ====================  IN-ROOM DINING  ==================== */
  const RS_CATS = ["breakfast", "main", "drink", "dessert"];
  let activeCat = "breakfast";

  function renderMenu() {
    const catWrap = document.getElementById("rsCats");
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
        cart[m.id] = (cart[m.id] || 0) + 1;
        renderCart();
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
    const menu = S.list("menu");
    const lines = Object.keys(cart).filter((id) => cart[id] > 0);

    let html = "<h4>" + U.escapeHtml(t("rs.cart")) + "</h4>";
    if (!lines.length) {
      html += '<p class="cart-empty">' + U.escapeHtml(t("rs.cartEmpty")) + "</p>";
      wrap.innerHTML = html;
      return;
    }
    let total = 0;
    lines.forEach((id) => {
      const m = menu.find((x) => x.id === id);
      if (!m) return;
      const sub = m.price * cart[id];
      total += sub;
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

  function placeOrder() {
    const menu = S.list("menu");
    const items = Object.keys(cart).filter((id) => cart[id] > 0).map((id) => {
      const m = menu.find((x) => x.id === id);
      return { key: m.key, name: t(m.key), qty: cart[id], price: m.price };
    });
    if (!items.length) return;
    const deliver = (document.getElementById("rsDeliver") || {}).value || "asap";
    const note = (document.getElementById("rsNotes") || {}).value || "";
    const total = items.reduce((s, it) => s + it.price * it.qty, 0);

    S.insert("requests", {
      kind: "order",
      category: "dining",
      titleKey: "staff.requests.order",
      title: t("staff.requests.order"),
      room: guest.room,
      guestName: guest.name,
      guestId: S.guestId(),
      lang: I.getLang(),
      items: items,
      deliverAt: deliver,
      note: note,
      total: total,
      status: "pending"
    });
    cart = {};
    renderCart();
    U.toast(t("rs.placed"), "success");
    renderTracker();
  }

  /* ====================  STATUS TRACKER  ==================== */
  const STATUS_ORDER = ["pending", "progress", "done"];

  function statusRail(status) {
    if (status === "cancelled") return "";
    const idx = STATUS_ORDER.indexOf(status);
    let html = '<div class="ti-rail">';
    STATUS_ORDER.forEach((s, i) => {
      html += '<span class="dot' + (i <= idx ? " on" : "") + '"></span>';
      if (i < STATUS_ORDER.length - 1) html += '<span class="step' + (i < idx ? " on" : "") + '"></span>';
    });
    return html + "</div>";
  }

  function reqTitle(r) {
    if (r.kind === "order") {
      const names = (r.items || []).map((it) => (it.qty + "× " + t(it.key))).join(", ");
      return t("staff.requests.order") + " — " + names;
    }
    return r.titleKey ? t(r.titleKey) : (r.title || "");
  }

  function renderTracker() {
    const wrap = document.getElementById("trackList");
    if (!wrap || !guest) return;
    const mine = S.list("requests")
      .filter((r) => r.room === guest.room)
      .sort((a, b) => b.createdAt - a.createdAt);

    if (!mine.length) {
      wrap.innerHTML = '<p class="track-empty">' + U.escapeHtml(t("track.empty")) + "</p>";
      return;
    }
    wrap.innerHTML = "";
    mine.forEach((r) => {
      const item = document.createElement("div");
      item.className = "track-item";
      const canCancel = r.status === "pending";
      let meta = U.timeAgo(r.createdAt);
      if (r.kind === "order" && r.deliverAt) {
        meta += " · " + t("rs.deliveryTime") + " " + (r.deliverAt === "asap" ? t("rs.asap") : r.deliverAt);
      }
      item.innerHTML =
        '<div class="ti-head"><span class="ti-title">' + U.escapeHtml(reqTitle(r)) + "</span>" +
        '<span class="badge ' + r.status + '">' + U.escapeHtml(t("track.status." + r.status)) + "</span></div>" +
        statusRail(r.status) +
        '<div class="ti-meta">' + U.escapeHtml(meta) + "</div>" +
        (r.note ? '<div class="ti-note">“' + U.escapeHtml(r.note) + '”</div>' : "") +
        (canCancel ? '<button class="link-cancel" type="button">' + U.escapeHtml(t("track.cancel")) + "</button>" : "");
      if (canCancel) {
        item.querySelector(".link-cancel").addEventListener("click", () => {
          S.update("requests", r.id, { status: "cancelled" });
        });
      }
      wrap.appendChild(item);
    });
  }

  /* ====================  CONCIERGE  ==================== */
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
        const title = t(c.key + ".t");
        if (window.JPark.chat) window.JPark.chat.askAbout(title);
      });
      card.querySelector(".cc-book").addEventListener("click", () => {
        S.insert("requests", {
          kind: "concierge",
          category: "frontdesk",
          titleKey: c.key + ".t",
          title: t(c.key + ".t"),
          room: guest ? guest.room : "—",
          guestName: guest ? guest.name : "Guest",
          guestId: S.guestId(),
          lang: I.getLang(),
          status: "pending"
        });
        U.toast(t("conc.booked"), "success");
        if (guest) renderTracker();
      });
      grid.appendChild(card);
    });
  }

  /* ====================  WIRING  ==================== */
  document.addEventListener("DOMContentLoaded", () => {
    initGate();
    renderConcierge();

    // live updates from staff / other tabs
    S.on("requests", () => { if (guest) renderTracker(); });
    S.on("menu", () => { if (guest) { renderMenu(); renderCart(); } });
    S.on("concierge", renderConcierge);

    // re-render everything on language change
    document.addEventListener("jpark:langchange", () => {
      renderConcierge();
      if (guest) { renderMatrix(); renderMenu(); renderCart(); renderTracker(); }
    });
  });
})();
