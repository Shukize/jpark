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
      { key: "req.breakfast", ico: "🍳" }
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
      // Read off the booking (lib/buildings.js). Null when we don't know —
      // never guessed from the room number.
      roomType: info.roomType || null,
      building: info.building || null,
    };
    S.setSession("guest", guest);
  }

  function showPortal() {
    if (!els.gate) return;
    els.gate.style.display = guest ? "none" : "block";
    els.portal.classList.toggle("show", !!guest);
    if (guest) {
      els.pbName.textContent = guest.name;
      // "407 · Building 4 · Studio B4" — the guest sees exactly what the front
      // desk sees on their request, so there's no confusion over which room or
      // which building is being talked about. Parts we don't know are omitted.
      els.pbRoom.textContent = [
        guest.room,
        guest.building ? t("building.n").replace("{n}", guest.building) : "",
        guest.roomType || "",
      ].filter(Boolean).join(" · ");
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
  // Three matrix items used to fire on one tap with no way to say the one
  // thing that actually mattered: "Arrange a taxi" with no destination or
  // time, "Wake-up call" with no time, "Late checkout" with no time (and no
  // word about the fee that applies past 15:00). The front desk saw a bare
  // "pending" card and had to track the guest down to ask. These three open
  // a short inline form instead of sending immediately; everything else on
  // the matrix stays one tap — 5-star service means asking only when the
  // answer actually changes what happens.
  const DETAIL_FORMS = {
    "req.taxi": {
      askKey: "req.taxi.ask", destination: true,
      timeLabelKey: "req.taxi.time", sendKey: "req.taxi.send", timeField: "select",
    },
    "req.wakeup": {
      askKey: "req.wakeup.ask",
      timeLabelKey: "req.wakeup.time", sendKey: "req.wakeup.send",
      timeField: "time", timeDefault: "07:00",
    },
    "req.checkout": {
      askKey: "req.checkout.ask", feeNote: true,
      timeLabelKey: "req.checkout.time", sendKey: "req.checkout.send",
      timeField: "time", timeDefault: "15:00",
    },
  };

  // The fee tier is computed from the chosen time rather than frozen into
  // text at submission, so it always reads correctly in whichever language
  // the viewer — guest or staff, and they may differ — currently has active.
  function feeTierLine(time) {
    const tier = U.checkoutFeeTier(time);
    return tier ? t("req.checkout.tier." + tier) : "";
  }

  function buildDetailForm(key, cfg) {
    const form = document.createElement("form");
    form.className = "detail-form";
    form.hidden = true;

    let html = '<p class="detail-ask">' + U.escapeHtml(t(cfg.askKey)) + "</p>";
    if (cfg.feeNote) html += '<p class="detail-feenote">' + U.escapeHtml(t("req.checkout.feeNote")) + "</p>";
    if (cfg.destination) {
      html += '<div class="field"><label>' + U.escapeHtml(t("req.taxi.destination")) + "</label>" +
        '<input type="text" class="detail-dest" placeholder="' + U.escapeHtml(t("req.taxi.destinationPh")) + '" /></div>';
    }
    html += '<div class="field"><label>' + U.escapeHtml(t(cfg.timeLabelKey)) + "</label>" +
      (cfg.timeField === "select"
        ? '<select class="detail-time">' + deliveryOptions() + "</select>"
        : '<input type="time" class="detail-time" value="' + (cfg.timeDefault || "") + '" />') +
      "</div>";
    if (cfg.feeNote) html += '<p class="detail-tier"></p>';
    html += '<p class="form-error detail-error"></p>' +
      '<div class="detail-form-actions">' +
        '<button type="button" class="btn-ghost detail-cancel">' + U.escapeHtml(t("common.cancel")) + "</button>" +
        '<button type="submit" class="btn btn-solid gold">' + U.escapeHtml(t(cfg.sendKey)) + "</button>" +
      "</div>";
    form.innerHTML = html;

    const timeInput = form.querySelector(".detail-time");
    const tierEl = form.querySelector(".detail-tier");
    if (tierEl) {
      const updateTier = () => { tierEl.textContent = feeTierLine(timeInput.value); };
      timeInput.addEventListener("input", updateTier);
      updateTier();
    }

    const err = form.querySelector(".detail-error");
    form.querySelector(".detail-cancel").addEventListener("click", () => {
      form.hidden = true; form.reset(); err.textContent = "";
      if (tierEl) tierEl.textContent = feeTierLine(timeInput.value);
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      let dest = "";
      if (cfg.destination) {
        dest = form.querySelector(".detail-dest").value.trim();
        if (!dest) { err.textContent = t("req.taxi.validation"); return; }
      }
      const time = timeInput.value;
      if (!time) { err.textContent = t("req.detail.timeRequired"); return; }
      err.textContent = "";
      const extra = { deliverAt: time };
      if (cfg.destination) extra.note = dest;
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      await submitService("frontdesk", key, extra);
      submitBtn.disabled = false;
      form.hidden = true; form.reset();
      if (tierEl) tierEl.textContent = feeTierLine(timeInput.value);
    });

    return form;
  }

  /* ── In-room breakfast ──────────────────────────────────────────────────
     Breakfast is a proper little order, not a one-tap request: the kitchen
     serves it only 05:30–09:30 (orders in by 09:00), the dishes rotate daily
     between Japanese, Thai and American, and the one thing they must know is
     the guest's dietary need. So the button opens a short form — dietary
     choice, delivery time within service hours, allergies, and the room —
     rather than filing a bare "Breakfast, pending" the desk can't act on. */
  const DIET_OPTIONS = [
    { key: "general",    label: "req.breakfast.diet.general",    ico: "🍽️" },
    { key: "halal",      label: "req.breakfast.diet.halal",      ico: "🕌" },
    { key: "vegetarian", label: "req.breakfast.diet.vegetarian", ico: "🥗" },
  ];
  // Fixed service window, not the rolling "next 8 half-hours" the room-service
  // menu uses: breakfast can only be delivered 05:30–09:30.
  const BREAKFAST_SLOTS = ["05:30","06:00","06:30","07:00","07:30","08:00","08:30","09:00","09:30"];
  const BREAKFAST_DEFAULT = "07:30";
  function breakfastTimeOptions() {
    return BREAKFAST_SLOTS
      .map((s) => '<option value="' + s + '"' + (s === BREAKFAST_DEFAULT ? " selected" : "") + ">" + s + "</option>")
      .join("");
  }
  // Orders close at 09:00. On-site guests are on ICT, the same clock as the
  // kitchen, so the device's own hour is the right thing to check.
  function breakfastPastCutoff() {
    return new Date().getHours() >= 9;
  }

  function buildBreakfastForm() {
    const form = document.createElement("form");
    form.className = "detail-form breakfast-form";
    form.hidden = true;
    let selectedDiet = DIET_OPTIONS[0].key;

    form.innerHTML =
      '<p class="detail-ask">' + U.escapeHtml(t("req.breakfast.ask")) + "</p>" +
      '<p class="detail-feenote">' + U.escapeHtml(t("req.breakfast.info")) + "</p>" +
      (breakfastPastCutoff()
        ? '<p class="detail-cutoff">' + U.escapeHtml(t("req.breakfast.cutoff")) + "</p>" : "") +
      '<div class="field"><label>' + U.escapeHtml(t("req.breakfast.diet")) + "</label>" +
        '<div class="bf-diet" role="radiogroup" aria-label="' + U.escapeHtml(t("req.breakfast.diet")) + '">' +
          DIET_OPTIONS.map((d, i) =>
            '<button type="button" class="bf-diet-chip' + (i === 0 ? " active" : "") + '" ' +
              'data-diet="' + d.key + '" role="radio" aria-checked="' + (i === 0 ? "true" : "false") + '">' +
              d.ico + " " + U.escapeHtml(t(d.label)) + "</button>").join("") +
        "</div></div>" +
      '<div class="field"><label>' + U.escapeHtml(t("req.breakfast.time")) + "</label>" +
        '<select class="bf-time">' + breakfastTimeOptions() + "</select></div>" +
      '<div class="field"><label>' + U.escapeHtml(t("req.breakfast.allergies")) + "</label>" +
        '<input type="text" class="bf-allergies" placeholder="' + U.escapeHtml(t("req.breakfast.allergiesPh")) + '" /></div>' +
      '<div class="field"><label>' + U.escapeHtml(t("req.breakfast.room")) + "</label>" +
        '<input type="text" class="bf-room" inputmode="numeric" value="' + U.escapeHtml(guest.room || "") + '" /></div>' +
      '<p class="form-error detail-error"></p>' +
      '<div class="detail-form-actions">' +
        '<button type="button" class="btn-ghost detail-cancel">' + U.escapeHtml(t("common.cancel")) + "</button>" +
        '<button type="submit" class="btn btn-solid gold">' + U.escapeHtml(t("req.breakfast.send")) + "</button>" +
      "</div>";

    const chips = form.querySelectorAll(".bf-diet-chip");
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        selectedDiet = chip.dataset.diet;
        chips.forEach((c) => {
          const on = c === chip;
          c.classList.toggle("active", on);
          c.setAttribute("aria-checked", on ? "true" : "false");
        });
      });
    });

    const err = form.querySelector(".detail-error");
    const resetChips = () => {
      selectedDiet = DIET_OPTIONS[0].key;
      chips.forEach((c, i) => {
        c.classList.toggle("active", i === 0);
        c.setAttribute("aria-checked", i === 0 ? "true" : "false");
      });
    };
    form.querySelector(".detail-cancel").addEventListener("click", () => {
      form.hidden = true; form.reset(); err.textContent = ""; resetChips();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const room = form.querySelector(".bf-room").value.trim();
      if (!room) { err.textContent = t("req.breakfast.roomRequired"); return; }
      err.textContent = "";
      const time = form.querySelector(".bf-time").value;
      const allergies = form.querySelector(".bf-allergies").value.trim();
      const extra = {
        roomNumber: room,
        deliverAt: time,
        // The dietary choice is stored as a stable i18n KEY, not translated
        // text, so the front desk reads it in THEIR language while the guest
        // chose it in theirs. Allergies are free text and live in `note`.
        items: [{ key: "req.breakfast.diet." + selectedDiet }],
      };
      if (allergies) extra.note = allergies;
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      await submitService("dining", "req.breakfast", extra);
      submitBtn.disabled = false;
      form.hidden = true; form.reset(); resetChips();
    });

    return form;
  }

  // Which matrix items open a form instead of firing on one tap.
  function itemHasForm(key) { return key === "req.breakfast" || !!DETAIL_FORMS[key]; }
  function buildFormFor(key) {
    return key === "req.breakfast" ? buildBreakfastForm() : buildDetailForm(key, DETAIL_FORMS[key]);
  }

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
      const detailForms = {};
      group.items.forEach((it) => {
        const b = document.createElement("button");
        b.className = "req-btn";
        b.type = "button";
        b.innerHTML = '<span class="rb-ico">' + it.ico + "</span><span>" +
          U.escapeHtml(t(it.key)) + "</span>";
        b.addEventListener("click", () => {
          if (itemHasForm(it.key)) {
            const form = detailForms[it.key];
            if (!form) return;
            form.hidden = !form.hidden;
            if (!form.hidden) {
              const first = form.querySelector(".detail-dest, .bf-time, .detail-time");
              if (first) setTimeout(() => first.focus(), 30);
            }
            return;
          }
          submitService(group.cat, it.key);
          b.classList.add("sent");
          setTimeout(() => b.classList.remove("sent"), 1200);
        });
        btns.appendChild(b);
      });
      g.appendChild(btns);
      group.items.forEach((it) => {
        if (!itemHasForm(it.key)) return;
        const form = buildFormFor(it.key);
        detailForms[it.key] = form;
        g.appendChild(form);
      });
      wrap.appendChild(g);
    });
  }

  async function submitService(category, titleKey, extra) {
    const guestId = S.guestId();
    const payload = Object.assign({
      guestId,
      guestName: guest.name,
      roomNumber: guest.room,
      type: category,
      kind: "service",
      titleKey,
      title: t(titleKey),
      lang: I.getLang(),
      bookingRef: guest.ref || null, // server re-checks this to set the verified flag
    }, extra || {});

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

  // The one answer that actually matters, shown right on the card instead of
  // buried in a note: a taxi's destination and pickup time, a wake-up call's
  // time, or a late checkout's time together with which fee tier it falls
  // into (see U.checkoutFeeTier — computed fresh here, in whichever language
  // is currently active, rather than frozen into text at submission).
  function requestDetailLine(r) {
    if (r.titleKey === "req.breakfast") {
      const parts = [];
      const diet = (r.items || [])[0];
      if (diet && diet.key) parts.push(t(diet.key));
      if (r.deliverAt) parts.push(t("req.breakfast.time") + " " + r.deliverAt);
      return parts.join(" · ");
    }
    if (r.kind === "order") {
      return r.deliverAt ? t("rs.deliveryTime") + " " + (r.deliverAt === "asap" ? t("rs.asap") : r.deliverAt) : "";
    }
    if (!r.deliverAt) return "";
    if (r.titleKey === "req.taxi") return t("req.taxi.time") + " " + (r.deliverAt === "asap" ? t("rs.asap") : r.deliverAt);
    if (r.titleKey === "req.wakeup") return t("req.wakeup.time") + " " + r.deliverAt;
    if (r.titleKey === "req.checkout") {
      const tier = U.checkoutFeeTier(r.deliverAt);
      return t("req.checkout.time") + " " + r.deliverAt + (tier ? " · " + t("req.checkout.tier." + tier) : "");
    }
    return "";
  }

  function normaliseStatus(s) {
    return s === "in_progress" ? "progress" : (s || "pending");
  }

  /* ────────────────────────── PER-REQUEST REMARKS ──────────────────────────
     Two-way messages about ONE request. These ride in the guest's EXISTING
     live chat thread, just tagged with which request they're about (see
     window.JPark.chat.sendForRequest / getRequestThread in chat.js, and
     request_kind/request_id in schema.sql) — not a second inbox the guest
     would have to learn on top of the chat bubble they already know. */
  function threadKey(r) { return r.reqKind + ":" + r.reqId; }

  async function fetchThreadSummary(guestId) {
    const API = window.JPark.api;
    if (!API) return {};
    const res = await API.get("/api/chat/request-summary?guestId=" + encodeURIComponent(guestId));
    const map = {};
    if (Array.isArray(res)) res.forEach((s) => { map[s.requestKind + ":" + s.requestId] = s; });
    return map;
  }

  const threadCache = {};        // key -> last-loaded messages, so a re-render can redraw instantly
  const expandedThreads = new Set();

  async function loadThread(r) {
    const chat = window.JPark.chat;
    const messages = chat ? await chat.getRequestThread(r.reqKind, r.reqId) : [];
    threadCache[threadKey(r)] = messages;
    return messages;
  }

  function renderThreadMessages(bodyEl, messages) {
    bodyEl.innerHTML = "";
    const visible = messages.filter((m) => m.from !== "system");
    if (!visible.length) {
      bodyEl.innerHTML = '<p class="thread-empty">' + U.escapeHtml(t("req.remarks.empty")) + "</p>";
      return;
    }
    const cur = I.getLang();
    visible.forEach((m) => {
      const div = document.createElement("div");
      div.className = "msg " + (m.from === "staff" ? "staff" : "guest");
      div.innerHTML = '<span class="msg-from">' +
        U.escapeHtml(m.from === "staff" ? (m.fromName || t("chat.staff")) : t("chat.you")) + "</span>";
      const span = document.createElement("span");
      const noteHost = document.createElement("span");
      noteHost.className = "msg-notes";
      // A front-desk reply may be typed in Thai; the guest reads their own
      // language — auto-translate it just like the live-chat bubbles do.
      if (m.lang && m.lang === cur) span.textContent = m.text;
      else if (window.JPark.translate) window.JPark.translate.fill(span, m.text, noteHost);
      else span.textContent = m.text;
      div.appendChild(span);
      div.appendChild(noteHost);
      const time = document.createElement("time");
      time.className = "msg-time";
      time.dateTime = new Date(m.ts).toISOString();
      time.textContent = U.messageTime(m.ts);
      div.appendChild(time);
      bodyEl.appendChild(div);
    });
    U.pinToBottom(bodyEl);
  }

  async function toggleThread(r, card) {
    const key = threadKey(r);
    const section = card.querySelector(".ti-thread");
    if (!section) return;
    if (expandedThreads.has(key)) {
      expandedThreads.delete(key);
      section.hidden = true;
      return;
    }
    expandedThreads.add(key);
    section.hidden = false;
    // Opening the thread is the guest saying "I've read it". This used to clear
    // NOTHING — the 💬 badge only ever went away when the guest REPLIED. Clear
    // it now (optimistic) and record a durable server marker so the next 8s poll
    // doesn't bring it back.
    markThreadReadGuest(r, card);
    const bodyEl = section.querySelector(".thread-body");
    const cached = threadCache[key];
    if (cached) renderThreadMessages(bodyEl, cached);
    const messages = await loadThread(r);
    renderThreadMessages(bodyEl, messages);
    const input = section.querySelector(".thread-input");
    if (input) setTimeout(() => input.focus(), 30);
  }

  // Clears a request's remark-thread unread: the local 💬 badge immediately, and
  // the durable server marker (chat_reads) so a poll can't re-light it. Also
  // primes lastSeenUnread so notifyNewThreadReplies won't toast for messages the
  // guest just read.
  function markThreadReadGuest(r, card) {
    const key = threadKey(r);
    lastSeenUnread[key] = 0;
    if (card) {
      const btn = card.querySelector(".link-thread");
      if (btn) btn.classList.remove("has-unread");
      const badge = card.querySelector(".thread-badge");
      if (badge) badge.remove();
    }
    const API = window.JPark.api;
    if (API && r.reqKind && r.reqId != null) {
      API.post("/api/chat/request-read", { guestId: S.guestId(), kind: r.reqKind, id: r.reqId }).catch(function () {});
    }
  }

  async function sendThreadMessage(r, text, section) {
    const chat = window.JPark.chat;
    if (!chat) { U.toast(t("req.remarks.failed"), "error"); return; }
    try {
      await chat.sendForRequest(r.reqKind, r.reqId, text);
    } catch (_) {
      U.toast(t("req.remarks.failed"), "error");
      return;
    }
    const messages = await loadThread(r);
    const bodyEl = section.querySelector(".thread-body");
    if (bodyEl) renderThreadMessages(bodyEl, messages);
  }

  // The tracker list is fully rebuilt every 8s poll (see startTrackerPoll) —
  // without this, a guest mid-reply on a taxi's destination would watch their
  // own typing vanish out from under them the moment the next poll landed.
  function captureThreadDrafts() {
    const drafts = {};
    document.querySelectorAll("#trackList .thread-input").forEach((inp) => {
      if (inp.value) drafts[inp.dataset.key] = inp.value;
    });
    return drafts;
  }

  // Toasts once per NEW staff reply (not on every poll while it's still
  // unread), and never for a thread the guest already has open — they're
  // already looking right at it. The first pass only primes the counts, so a
  // guest returning to a request that was already answered isn't toasted for
  // a reply they've likely seen.
  let lastSeenUnread = {};
  let threadNotifyPrimed = false;
  function notifyNewThreadReplies(items) {
    if (!items) return;
    let announced = false;
    items.forEach((r) => {
      if (!r.reqKind) return;
      const key = threadKey(r);
      const prev = lastSeenUnread[key] || 0;
      const now = r.msgUnread || 0;
      if (threadNotifyPrimed && now > prev && !expandedThreads.has(key) && !announced) {
        U.toast(t("chat.notif.staffReply"), "success");
        announced = true; // one toast per poll, however many threads changed
      }
      lastSeenUnread[key] = now;
    });
    threadNotifyPrimed = true;
  }

  /* Merge service-requests and orders from API into one flat list. */
  async function fetchTrackerItems() {
    const guestId = S.guestId();
    const API     = window.JPark.api;
    if (!API) return null;

    const [srRes, ordRes, summaryMap] = await Promise.all([
      API.get("/api/service-requests?guestId=" + encodeURIComponent(guestId)),
      API.get("/api/orders?guestId="           + encodeURIComponent(guestId)),
      fetchThreadSummary(guestId),
    ]);

    if (srRes.offline) return null; // fall back to localStorage

    const srs  = (Array.isArray(srRes) ? srRes : []).map((r) => {
      const summary = summaryMap["service:" + r.id];
      return {
        id: r.id, kind: r.kind || "service",
        reqKind: "service", reqId: r.id,
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
        msgCount: summary ? summary.count : 0,
        msgUnread: summary ? summary.unreadForGuest : 0,
      };
    });

    const ords = (Array.isArray(ordRes) ? ordRes : []).map((r) => {
      const summary = summaryMap["order:" + r.id];
      return {
        id: "ord-" + r.id, kind: "order",
        reqKind: "order", reqId: r.id,
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
        msgCount: summary ? summary.count : 0,
        msgUnread: summary ? summary.unreadForGuest : 0,
      };
    });

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
    const drafts = captureThreadDrafts();
    wrap.innerHTML = "";
    mine.forEach((r) => {
      const normStatus = normaliseStatus(r.status);
      const item = document.createElement("div");
      item.className = "track-item";
      const canCancel = normStatus === "pending";
      let meta = U.timeAgo(r.createdAt);
      const detailLine = requestDetailLine(r);
      if (detailLine) meta += " · " + detailLine;

      const hasThread = r.reqKind != null;
      const key = hasThread ? threadKey(r) : null;
      const expanded = hasThread && expandedThreads.has(key);
      const unread = r.msgUnread || 0;

      item.innerHTML =
        '<div class="ti-head"><span class="ti-title">' + U.escapeHtml(reqTitle(r)) + "</span>" +
        '<span class="badge ' + normStatus + '">' + U.escapeHtml(t("track.status." + normStatus)) + "</span></div>" +
        statusRail(normStatus) +
        '<div class="ti-meta">' + U.escapeHtml(meta) + "</div>" +
        // A breakfast note is the guest's allergy line — label it as such;
        // any other request's note is their own free-text words, quoted.
        (r.note
          ? '<div class="ti-note">' + (r.titleKey === "req.breakfast"
              ? U.escapeHtml(t("req.breakfast.allergies") + ": " + r.note)
              : '"' + U.escapeHtml(r.note) + '"') + "</div>"
          : "") +
        '<div class="ti-actions">' +
          (hasThread
            ? '<button type="button" class="link-thread' + (unread ? " has-unread" : "") + '">💬 ' +
                U.escapeHtml(t("req.remarks.toggle")) +
                (unread ? ' <span class="thread-badge">' + unread + "</span>" : "") + "</button>"
            : "") +
          (canCancel ? '<button class="link-cancel" type="button">' + U.escapeHtml(t("track.cancel")) + "</button>" : "") +
        "</div>" +
        (hasThread
          ? '<div class="ti-thread"' + (expanded ? "" : " hidden") + ">" +
              '<div class="thread-body"></div>' +
              '<form class="thread-form">' +
                '<input type="text" class="thread-input" data-key="' + U.escapeHtml(key) + '" placeholder="' +
                  U.escapeHtml(t("chat.placeholder")) + '" autocomplete="off" />' +
                '<button type="submit">' + U.escapeHtml(t("common.send")) + "</button>" +
              "</form>" +
            "</div>"
          : "");

      if (canCancel) {
        item.querySelector(".link-cancel").addEventListener("click", () => cancelItem(r));
      }
      if (hasThread) {
        item.querySelector(".link-thread").addEventListener("click", () => toggleThread(r, item));
        const form = item.querySelector(".thread-form");
        const input = item.querySelector(".thread-input");
        if (drafts[key]) input.value = drafts[key];
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const text = input.value.trim();
          if (!text) return;
          input.value = "";
          sendThreadMessage(r, text, item.querySelector(".ti-thread"));
        });
        if (expanded) {
          const bodyEl = item.querySelector(".thread-body");
          const cached = threadCache[key];
          if (cached) renderThreadMessages(bodyEl, cached);
          loadThread(r).then((messages) => renderThreadMessages(bodyEl, messages));
        }
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
    if (items) notifyNewThreadReplies(items);
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
