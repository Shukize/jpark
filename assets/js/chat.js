/* ============================================================
   J Park Hotel — live chat widget
   Floating bubble with a scripted, multilingual assistant.
   Messages are persisted to the backend API so staff can reply
   from any device. Falls back to localStorage when offline.
   ============================================================ */
(function () {
  "use strict";
  const S = window.JPark.store;
  const I = window.JPark.i18n;
  const U = window.JPark.util;
  const t = (k) => I.t(k);

  // Visitors who aren't signed in as staff/admin get a fresh chat box on every
  // visit: rotate their guestId and drop any stale cached conversation so the
  // widget opens clean. Staff/admin viewing the site keep their session intact.
  // "Visit" means once per browser session, NOT once per page load — rotating
  // on every load threw away a live conversation on a reload or a trip to the
  // booking page and back, leaving the front desk replying into a thread the
  // guest could no longer see (and, now, one labelled with their real name).
  //
  // A browser session is still far too short a life for a conversation. On a
  // phone, "session" ends when the tab is closed or the browser is evicted
  // from memory — so a guest who asked something at 20:00, locked their
  // phone, and came back at 20:05 landed on a BRAND NEW thread with an empty
  // history, while the front desk's reply sat in the thread they'd just been
  // rotated out of. (That is also why the console fills up with anonymous
  // duplicate "Guest" threads.) So a thread that is still warm is resumed
  // instead: only a conversation nobody has touched for RESUME_WINDOW_MS is
  // retired, which keeps the original point — the next person to pick up a
  // shared device doesn't inherit a stranger's chat.
  const RESUME_WINDOW_MS = 12 * 60 * 60 * 1000; // 12h
  let resumedThread = false;
  function hasStaffSession() {
    try { return !!JSON.parse(localStorage.getItem("jpark.staff") || "null"); }
    catch (_) { return false; }
  }
  const VISIT_FLAG = "jpark.chatVisit";
  function visitAlreadyStarted() {
    try { return !!sessionStorage.getItem(VISIT_FLAG); } catch (_) { return false; }
  }
  if (!hasStaffSession() && !visitAlreadyStarted()) {
    try {
      sessionStorage.setItem(VISIT_FLAG, String(Date.now()));
      const oldGid = localStorage.getItem("jpark.guestId");
      const prev = oldGid ? S.list("chats").find((c) => c.id === oldGid) : null;
      const stillWarm = !!prev && Date.now() - (prev.lastAt || 0) < RESUME_WINDOW_MS;
      if (stillWarm) {
        // Same guest, same conversation. Who they are is re-read from the
        // server on the first sync (adoptServerIdentity), so resuming doesn't
        // mean trusting a stale local label either.
        resumedThread = true;
      } else {
        localStorage.removeItem("jpark.guestId");
        if (oldGid) S.write("chats", S.list("chats").filter((c) => c.id !== oldGid));
        S.clearSession("chatIdentity"); // a new visit re-asks who's chatting
      }
    } catch (_) {}
  }
  const gid = S.guestId();

  const TOPICS = [
    { id: "checkin", a: "chat.a.checkin", kw: ["check-in","check in","checkout","check-out","check out","late check","เช็คอิน","เช็คเอาท์","เลื่อนเช็ค","チェックイン","チェックアウト","入住","退房"] },
    // Both point the guest at the SAME self-service forms the front desk
    // already asks for (Guest Services → Front Desk — see guest.js's
    // DETAIL_FORMS), rather than a dead-end "let me connect you" — most of
    // what used to need a human (where to, what time) is now a tap away.
    { id: "taxi",    a: "chat.a.taxi",    kw: ["taxi","cab","แท็กซี่","รถแท็กซี่","เรียกแท็กซี่","รับส่ง","タクシー","空港送迎","送迎","出租车","計程車","打车","叫車"] },
    { id: "wakeup",  a: "chat.a.wakeup",  kw: ["wake up call","wake-up call","wakeup call","wake up","morning call","alarm","ปลุก","โทรปลุก","บริการปลุก","モーニングコール","起こして","叫醒服务","叫醒电话","叫醒服務","喚醒"] },
    { id: "wifi",    a: "chat.a.wifi",    kw: ["wifi","wi-fi","internet","password","network","รหัสผ่าน","อินเทอร์เน็ต","ไวไฟ","パスワード","ネット","无线","网络","密码","無線","網路","密碼"] },
    { id: "pool",    a: "chat.a.pool",    kw: ["pool","swim","onsen","spa","สระ","ว่ายน้ำ","ออนเซ็น","プール","温泉","泳池","游泳","溫泉"] },
    // Halal is listed BEFORE dining so a query like "halal food" matches the
    // dietary answer rather than the general dining hours.
    { id: "halal",   a: "chat.a.halal",   kw: ["halal","non-pork","no pork","pork-free","pork free","pork","muslim","islam","ฮาลาล","ไม่ใส่หมู","ไม่มีหมู","ไม่กินหมู","มุสลิม","อิสลาม","ハラル","ハラール","豚肉","イスラム","ムスリム","清真","穆斯林","猪肉","豬肉"] },
    { id: "dining",  a: "chat.a.dining",  kw: ["dining","restaurant","eat","food","breakfast","dinner","tsubaki","อาหาร","ร้าน","ทาน","อาหารเช้า","レストラン","食事","朝食","餐","吃","用餐","餐廳","餐厅"] },
    { id: "coffee",  a: "chat.a.coffee",  kw: ["coffee","cocktail","bar","midnight","drink","กาแฟ","ค็อกเทล","บาร์","コーヒー","カクテル","咖啡","鸡尾酒","雞尾酒","酒吧"] },
    { id: "parking", a: "chat.a.parking", kw: ["park","parking","car","ที่จอด","รถ","駐車","停车","停車"] },
    { id: "rates",   a: "chat.a.rates",   kw: ["rate","rates","price","prices","cost","how much","nightly","per night","ราคา","เท่าไหร่","ค่าห้อง","料金","値段","价格","价钱","價格","價錢"] }
  ];
  const QUICK = ["checkin", "wifi", "pool", "dining", "coffee", "rates", "parking"];

  // Room rates are edited live in the Site Editor (staff.js "Rates" tab) and
  // stored server-side, so the bot fetches the current range instead of
  // keeping its own copy that would drift out of date.
  let ratesCache = null; // { min, max } nightly room-only THB, across all room types
  async function loadRates() {
    const API = window.JPark.api;
    if (!API) return;
    try {
      const res = await API.get("/api/rates");
      if (!res || !res.rooms) return;
      let min = Infinity, max = -Infinity;
      Object.values(res.rooms).forEach((room) => {
        (room.variants || []).forEach((v) => {
          if (typeof v.room !== "number") return;
          if (v.room < min) min = v.room;
          if (v.room > max) max = v.room;
        });
      });
      if (min <= max) ratesCache = { min, max };
    } catch (_) { /* keep previous cache / fallback text */ }
  }
  // Always re-fetches before answering, rather than trusting whatever
  // ratesCache happens to hold (which could be from page-load or from
  // whenever the panel was last opened) — a guest mid-conversation could
  // otherwise be quoted a range an admin has since changed via the Rates
  // tab. loadRates() only overwrites ratesCache on a successful response,
  // so a momentary network failure here still falls back to the last-good
  // cached range instead of showing nothing.
  async function ratesAnswer() {
    await loadRates();
    if (!ratesCache) return t("chat.a.ratesFallback");
    return t("chat.a.rates")
      .replace("{min}", ratesCache.min.toLocaleString())
      .replace("{max}", ratesCache.max.toLocaleString());
  }
  async function topicAnswer(topic) {
    return topic.id === "rates" ? await ratesAnswer() : t(topic.a);
  }

  let panel, fab, body, badge, idBox, openState = false;
  let pollTimer = null;  // full conversation sync, while the panel is open
  let watchTimer = null; // cheap "has the front desk answered?" while it isn't
  let lastMsgCount = 0; // for detecting new staff replies

  /* ─────────────── who's chatting ────────────────────────────────────────────
     The front desk used to see every thread as an anonymous "Guest" with no
     room, so they couldn't tell a guest in room 204 from someone pricing a
     room. Before the bot's first answer the widget now asks which one this is;
     the answer is verified server-side (POST /api/chat/identify) and it is the
     server, not this file, that decides whether a thread counts as a guest.
     identity: { kind:'guest'|'visitor', verified:bool, name, room, ref }      */
  let identity = null;
  let idView = null; // 'choose' | 'form' | null (chip / hidden)
  let idError = "";
  let idBusy = false;
  let pendingUnmatched = null; // { lastName, room, ref } awaiting "continue anyway"
  let pendingEscalate = false; // a hand-off was blocked waiting on an identity

  function loadIdentity() {
    identity = S.getSession("chatIdentity") || null;
  }
  /* A resumed conversation — or simply a second tab — has no identity in this
     tab's sessionStorage, but the SERVER still knows whose thread this is:
     /identify stamped it onto every row. Read it back instead of asking the
     guest to introduce themselves again halfway through a conversation the
     front desk is already answering. */
  function adoptServerIdentity(remote) {
    if (identity || !remote || !remote.guestKind) return;
    identity = {
      kind: remote.guestKind,
      verified: !!remote.guestVerified,
      name: remote.guestName || null,
      room: remote.room || null,
      ref: remote.bookingRef || null,
    };
    S.setSession("chatIdentity", identity);
    idView = null;
    renderIdentity();
  }
  function saveIdentity(next) {
    identity = next;
    S.setSession("chatIdentity", next);
    // Keep the local conversation label in step so the cached copy doesn't
    // contradict what the server now knows about this thread.
    const conv = getLocalConv();
    if (conv) {
      conv.guestName = next && next.kind === "guest" ? next.name : null;
      conv.room = next && next.kind === "guest" ? next.room : "";
      saveLocalConv(conv);
    }
  }

  // Which message a failed /identify call deserves: too many tries, no
  // connection, or a genuinely unmatched booking.
  function idErrorKey(res) {
    if (res && res.status === 429) return "chat.id.tooMany";
    if (!res || res.offline) return "chat.id.offline";
    return "chat.id.notFound";
  }

  async function apiIdentify(payload) {
    const API = window.JPark.api;
    if (!API) return { error: "offline", offline: true };
    return await API.post(
      "/api/chat/identify",
      Object.assign({ guestId: gid, lang: I.getLang() }, payload)
    );
  }

  // The localised template for the thread's confirmation line. {name}/{room}
  // are left in place deliberately — the server fills them from the booking it
  // actually resolved, so the line can't announce a room nobody verified.
  function identityLine(kind, verified) {
    if (kind === "visitor") return t("chat.id.sysVisitor");
    return t(verified ? "chat.id.sysVerified" : "chat.id.sysUnconfirmed");
  }

  /* Mirror the identity the server just recorded into the local message list,
     so the guest sees the same confirmation line staff do without waiting for
     the next poll. */
  function pushIdentityLine(res) {
    const text = identityLine(res.kind, res.verified)
      .replace("{name}", res.name || "")
      .replace("{room}", res.room || "");
    const conv = ensureLocalConv();
    conv.messages.push({ id: S.genId(), from: "system", text, lang: I.getLang(), ts: Date.now() });
    conv.lastMsg = text; conv.lastAt = Date.now();
    saveLocalConv(conv);
    lastMsgCount = 0; // force the next sync to re-read the thread from the API
  }

  async function chooseVisitor() {
    if (idBusy) return;
    idBusy = true; idError = ""; renderIdentity();
    const res = await apiIdentify({ kind: "visitor", systemText: t("chat.id.sysVisitor") });
    idBusy = false;
    if (!res || res.error) { idError = t(idErrorKey(res)); renderIdentity(); return; }
    saveIdentity({ kind: "visitor", verified: false, name: null, room: null, ref: null });
    idView = null;
    pushIdentityLine({ kind: "visitor" });
    renderIdentity(); render();
    resumeEscalate();
  }

  /* A hand-off that was waiting on "who are you?" picks up where it left off,
     so the guest doesn't have to ask for the front desk a second time. */
  function resumeEscalate() {
    if (!pendingEscalate) return;
    pendingEscalate = false;
    escalate();
  }

  /* Sign in as a staying guest. `unconfirmed` is the second pass, after the
     lookup found nothing and the guest chose to continue anyway — the honest
     path for OTA and walk-in guests, who never appear in the booking table. */
  async function submitGuest(lastName, room, ref, unconfirmed) {
    if (idBusy) return;
    if (!(ref && ref.trim()) && !(lastName.trim() && room.trim())) {
      idError = t("chat.id.needDetails"); renderIdentity(); return;
    }
    idBusy = true; idError = ""; renderIdentity();
    // A first attempt sends the VERIFIED template: the server only writes it
    // when the booking actually matched, and answers "not found" without
    // touching the thread otherwise. The retry sends the unconfirmed one.
    const res = await apiIdentify({
      kind: "guest", lastName, room, ref,
      unconfirmed: !!unconfirmed,
      systemText: identityLine("guest", !unconfirmed),
    });
    idBusy = false;

    // A failed REQUEST is not a failed lookup. Saying "we couldn't find that
    // booking" to someone who was merely rate-limited pushes a real guest down
    // the "continue anyway" path and lands unconfirmed work on the front desk.
    if (!res || res.error) { idError = t(idErrorKey(res)); renderIdentity(); return; }

    if (!res.matched && !unconfirmed) {
      // Nothing stamped server-side yet — offer to continue as an enquiry.
      pendingUnmatched = { lastName, room, ref };
      idError = t("chat.id.notFound");
      renderIdentity();
      return;
    }

    pendingUnmatched = null;
    saveIdentity({
      kind: "guest", verified: !!res.verified,
      name: res.name, room: res.room, ref: res.ref || null,
    });
    idView = null;
    pushIdentityLine(res);
    renderIdentity(); render();
    resumeEscalate();
  }

  /* If they already signed into the guest portal on this tab, don't ask again —
     re-check that booking server-side and adopt it silently. */
  async function adoptPortalSession() {
    if (identity) return;
    const g = S.getSession("guest");
    if (!g || !(g.ref || g.room)) return;
    const res = await apiIdentify({
      kind: "guest", ref: g.ref, lastName: g.name, room: g.room,
      systemText: identityLine("guest", true),
    });
    if (!res || res.error || !res.matched) return;
    saveIdentity({
      kind: "guest", verified: !!res.verified,
      name: res.name, room: res.room, ref: res.ref || null,
    });
    idView = null;
    pushIdentityLine(res);
    renderIdentity();
  }

  function chipText() {
    if (!identity) return "";
    if (identity.kind === "visitor") return t("chat.id.chipVisitor");
    const key = identity.verified ? "chat.id.chipGuest" : "chat.id.chipUnconfirmed";
    if (!identity.room) return identity.name || "";
    return t(key)
      .replace("{room}", identity.room)
      .replace("{name}", identity.name || "");
  }

  function renderIdentity() {
    if (!idBox) return;
    idBox.innerHTML = "";

    // Settled: a compact chip with a way back to change it.
    if (identity && !idView) {
      idBox.className = "chat-id settled" + (identity.verified ? " verified" : "");
      const chip = document.createElement("div");
      chip.className = "cid-chip";
      chip.innerHTML =
        '<span class="cid-mark" aria-hidden="true">' +
          (identity.kind === "visitor" ? "💬" : identity.verified ? "✅" : "🔶") + "</span>" +
        '<span class="cid-who"></span>';
      chip.querySelector(".cid-who").textContent = chipText();
      const change = document.createElement("button");
      change.type = "button"; change.className = "cid-change";
      change.textContent = t("chat.id.change");
      change.addEventListener("click", () => { idView = "choose"; idError = ""; renderIdentity(); });
      chip.appendChild(change);
      idBox.appendChild(chip);
      return;
    }

    if (!identity && !idView) idView = "choose";
    idBox.className = "chat-id open";

    if (idView === "choose") {
      const ask = document.createElement("p");
      ask.className = "cid-ask"; ask.textContent = t("chat.id.ask");
      idBox.appendChild(ask);
      const row = document.createElement("div");
      row.className = "cid-choices";
      const guestBtn = document.createElement("button");
      guestBtn.type = "button"; guestBtn.className = "cid-btn cid-guest";
      guestBtn.textContent = t("chat.id.guestBtn");
      guestBtn.addEventListener("click", () => {
        idView = "form"; idError = ""; pendingUnmatched = null; renderIdentity();
      });
      const visitorBtn = document.createElement("button");
      visitorBtn.type = "button"; visitorBtn.className = "cid-btn cid-visitor";
      visitorBtn.textContent = t("chat.id.visitorBtn");
      visitorBtn.disabled = idBusy;
      visitorBtn.addEventListener("click", chooseVisitor);
      row.appendChild(guestBtn); row.appendChild(visitorBtn);
      idBox.appendChild(row);
      if (idError) {
        const err = document.createElement("p");
        err.className = "cid-error"; err.textContent = idError;
        idBox.appendChild(err);
      }
      return;
    }

    // idView === 'form'
    const form = document.createElement("form");
    form.className = "cid-form";
    form.innerHTML =
      '<p class="cid-lede">' + U.escapeHtml(t("chat.id.signInLede")) + "</p>" +
      '<label class="cid-field"><span>' + U.escapeHtml(t("chat.id.lastName")) + "</span>" +
        '<input type="text" name="last" autocomplete="family-name" /></label>' +
      '<label class="cid-field"><span>' + U.escapeHtml(t("chat.id.roomNo")) + "</span>" +
        '<input type="text" name="room" inputmode="numeric" autocomplete="off" /></label>' +
      '<p class="cid-or">' + U.escapeHtml(t("chat.id.or")) + "</p>" +
      '<label class="cid-field"><span>' + U.escapeHtml(t("chat.id.ref")) + "</span>" +
        '<input type="text" name="ref" placeholder="' + U.escapeHtml(t("chat.id.refPh")) + '" autocomplete="off" /></label>' +
      // Sets expectations so a not-yet-checked-in guest reaches for their booking
      // reference instead of guessing a room number and hitting the "not found"
      // path — the confusion behind the "I typed a room number and nothing showed
      // up" report. The room number becomes matchable once the front desk assigns
      // it at check-in.
      '<p class="cid-hint">' + U.escapeHtml(t("chat.id.verifyHint")) + "</p>";

    if (idError) {
      const err = document.createElement("p");
      err.className = "cid-error"; err.textContent = idError;
      form.appendChild(err);
    }

    const actions = document.createElement("div");
    actions.className = "cid-actions";
    const submit = document.createElement("button");
    submit.type = "submit"; submit.className = "cid-btn cid-go";
    submit.disabled = idBusy;
    submit.textContent = idBusy ? t("chat.id.checking")
      : pendingUnmatched ? t("chat.id.continueAnyway") : t("chat.id.continue");
    const back = document.createElement("button");
    back.type = "button"; back.className = "cid-back";
    back.textContent = t("chat.id.back");
    back.addEventListener("click", () => {
      idView = "choose"; idError = ""; pendingUnmatched = null; renderIdentity();
    });
    actions.appendChild(submit); actions.appendChild(back);
    form.appendChild(actions);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const last = form.elements.last.value;
      const room = form.elements.room.value;
      const ref  = form.elements.ref.value;
      // Second press on an unmatched set of details = "continue anyway".
      const again = !!pendingUnmatched;
      submitGuest(last, room, ref, again);
    });
    idBox.appendChild(form);

    // Re-fill what they typed so a failed lookup doesn't wipe the form.
    if (pendingUnmatched) {
      form.elements.last.value = pendingUnmatched.lastName || "";
      form.elements.room.value = pendingUnmatched.room || "";
      form.elements.ref.value  = pendingUnmatched.ref || "";
    }
    const first = form.querySelector("input");
    if (first) setTimeout(() => first.focus(), 40);
  }

  function playChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.45);
    } catch (_) {}
  }
  function requestGuestNotifyPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      try { Notification.requestPermission(); } catch (_) {}
    }
  }

  /* ─────────────── local cache (localStorage fallback) ─────────────────── */
  function getLocalConv() {
    return S.list("chats").find((c) => c.id === gid) || null;
  }
  function saveLocalConv(conv) {
    const all = S.list("chats");
    const i = all.findIndex((c) => c.id === gid);
    if (i >= 0) all[i] = conv; else all.push(conv);
    S.write("chats", all);
  }
  function ensureLocalConv() {
    let conv = getLocalConv();
    if (conv) return conv;
    const g = S.getSession("guest");
    conv = {
      id: gid, guestName: g ? g.name : "Guest", room: g ? g.room : "",
      lang: I.getLang(), escalated: false,
      unreadForStaff: 0, unreadForGuest: 0, lastMsg: "", lastAt: Date.now(),
      messages: [{ id: S.genId(), from: "bot", text: t("chat.greeting"), lang: I.getLang(), ts: Date.now() }]
    };
    saveLocalConv(conv);
    return conv;
  }

  /* ─────────────── API helpers ───────────────────────────────────────────── */
  async function apiGetConv() {
    const API = window.JPark.api;
    if (!API) return null;
    const res = await API.get("/api/chat?guestId=" + encodeURIComponent(gid));
    if (res.error) return null;
    return res; // { id, guestName, room, messages, escalated, unreadForGuest, ... }
  }

  // Messages are posted strictly one after another. They used to go out
  // concurrently — the guest's message and the bot's follow-up 650ms later,
  // for instance — and two requests in flight at once can reach the database
  // in either order, which shuffles the transcript everyone reads afterwards.
  let postChain = Promise.resolve();

  function apiPostMessage(from, text, opts) {
    const API = window.JPark.api;
    if (!API) return Promise.resolve();
    // No guestName/room here: who the thread belongs to is set once, and
    // checked, by POST /api/chat/identify — the server ignores any name a
    // message tries to claim for itself.
    postChain = postChain.then(() => API.post("/api/chat", {
      guestId: gid,
      from: from,
      fromName: opts && opts.staffName ? opts.staffName : (from === "guest" ? null : "J Park"),
      text,
      lang: I.getLang(),
      escalated: !!(opts && opts.escalated),
      // When escalating, stamp the freshly picked Front Desk owner on the
      // row so the staff console can route notifications to that account.
      assignedStaffId: opts && opts.assignedStaffId ? opts.assignedStaffId : undefined,
      assignedStaffName: opts && opts.assignedStaffName ? opts.assignedStaffName : undefined,
      // Tags this row to one guest request (see schema.sql) so the Guest
      // Requests board can show it inline on that request's card — still the
      // SAME thread, just marked which request it's about.
      requestKind: opts && opts.requestKind ? opts.requestKind : undefined,
      requestId: opts && opts.requestId != null ? opts.requestId : undefined,
    })).catch(function () { /* offline — the local copy still shows */ });
    return postChain;
  }

  /* ─────────────── conversation helpers ─────────────────────────────────── */
  async function pushMessage(from, text, opts) {
    // Write to local cache first for instant display
    const conv = ensureLocalConv();
    const g = S.getSession("guest");
    if (g) { conv.guestName = g.name; conv.room = g.room; }
    conv.lang = I.getLang();
    const msg = Object.assign({ id: S.genId(), from, text, lang: I.getLang(), ts: Date.now() }, opts || {});
    conv.messages.push(msg);
    conv.lastMsg = text; conv.lastAt = Date.now();
    if (from === "guest") conv.unreadForStaff = (conv.unreadForStaff || 0) + 1;
    saveLocalConv(conv);
    // Persist to backend (fire-and-forget)
    apiPostMessage(from, text, opts);
  }

  /* Two markers, both server-clock (never Date.now(): a phone whose clock is
     a few minutes out would otherwise decide the front desk's reply had
     already been read):
       seenAt    — newest message the guest has actually had on screen.
       alertedAt — newest message we've already chimed/badged for, so the
                   watcher below doesn't re-announce the same reply every tick.
     Both live on the cached conversation, so they survive a page reload. */
  function markSeen(ts) {
    const conv = getLocalConv();
    if (!conv) return;
    const seen = Math.max(conv.seenAt || 0, ts || 0);
    // Written only when something actually moves: saving republishes the
    // conversation to every listener, and re-rendering the panel under a guest
    // every few seconds would yank them back to the bottom mid-read.
    if (seen === (conv.seenAt || 0)
        && seen <= (conv.alertedAt || 0)
        && !conv.unreadForGuest) return;
    conv.seenAt = seen;
    conv.alertedAt = Math.max(conv.alertedAt || 0, seen);
    conv.unreadForGuest = 0;
    saveLocalConv(conv);
  }

  async function syncFromApi() {
    const remote = await apiGetConv();
    if (!remote || !remote.messages) return;
    adoptServerIdentity(remote);
    const conv = ensureLocalConv();
    if (remote.messages.length !== lastMsgCount) {
      lastMsgCount = remote.messages.length;
      // Rebuild local conv from API truth
      const rebuilt = Object.assign({}, conv, {
        messages: remote.messages.map((m) => ({
          id: m.id, from: m.from, text: m.text,
          staffName: m.fromName, lang: m.lang, ts: m.ts,
        })),
        escalated: remote.escalated,
        lastMsg: remote.lastMsg || conv.lastMsg,
        lastAt: remote.lastAt || conv.lastAt,
      });
      saveLocalConv(rebuilt);
      if (openState) render();
    }
    // The panel is open, so everything in it counts as read.
    if (openState) markSeen(remote.lastAt || 0);
  }

  /* ─────────────── watching while the panel is closed ────────────────────
     The old widget only ever polled while the chat panel was OPEN, so a guest
     who asked a question and then carried on browsing — or simply closed the
     bubble — was never told the front desk had answered. No badge, no sound,
     nothing: the reply just sat there. That is exactly what the hotel saw
     when they tested it (three replies sent, the guest's phone showed no sign
     of any of them).
     The watcher is deliberately cheap: GET /api/chat/updates returns three
     numbers, not a transcript, and it stops entirely while the tab is hidden
     (see the visibilitychange wiring below) — a background tab must not sit
     there billing the database, which is what took the site down in July. */
  const WATCH_MS = 12000;
  async function watchTick() {
    if (openState || document.hidden) return;
    const API = window.JPark.api;
    if (!API) return;
    const conv = getLocalConv();
    // Only a conversation a person has actually been pulled into is worth
    // watching. Someone who asked the bot about the pool and closed the box is
    // not waiting on anybody, and the staff console never lists a thread that
    // hasn't been escalated — so polling for them would be pure cost.
    if (!conv || !conv.escalated) return;
    const since = Math.max(conv.alertedAt || 0, conv.seenAt || 0);
    const res = await API.get(
      "/api/chat/updates?guestId=" + encodeURIComponent(gid) + "&since=" + encodeURIComponent(since)
    );
    if (!res || res.error || !res.staffNew) return;
    announceStaffReply(res.staffNew, res.lastAt);
  }

  /* Tell the guest, in every way the browser allows, that a person answered:
     the bubble's unread badge, a chime, and — if they granted permission when
     they opened the chat — a real notification even when the site isn't the
     tab they're looking at. */
  function announceStaffReply(n, serverTs) {
    const conv = ensureLocalConv();
    conv.unreadForGuest = (conv.unreadForGuest || 0) + n;
    if (serverTs) conv.alertedAt = serverTs;
    saveLocalConv(conv);
    setBadge(conv.unreadForGuest);
    playChime();
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("J Park Hotel", {
          body: t("chat.notif.staffReply") || "New message from the front desk.",
          tag: "jpark-chat", // one replaced notice, never a stack of them
        });
      } catch (_) {}
    }
  }

  /* ─────────────── bot ───────────────────────────────────────────────────── */
  // Returns the scripted answer for a matched topic, or null when nothing
  // matches — the caller then hands the guest off to a real person rather than
  // replying with a dead-end "I didn't understand".
  async function botAnswer(text) {
    const lc = text.toLowerCase();
    for (const topic of TOPICS) {
      if (topic.kw.some((k) => lc.indexOf(k) >= 0)) return await topicAnswer(topic);
    }
    return null;
  }

  // Plain greeting / thank-you detection. Matches the WHOLE normalised message
  // exactly (not a substring), so a real question that merely contains "hi" —
  // e.g. "which room is quietest" — is never mistaken for a greeting. Only
  // consulted when no TOPIC matched, so a bare "hi"/"thanks" gets a friendly
  // reply instead of pulling a staff member into the thread.
  function smallTalkReply(text) {
    var norm = String(text).toLowerCase()
      .replace(/^[\s!.?,;:~()"'’\-]+|[\s!.?,;:~()"'’\-]+$/g, "");
    var GREET = ["hi","hello","hey","hiya","yo","howdy","hi there","hello there",
      "good morning","good afternoon","good evening","good day","greetings",
      "สวัสดี","สวัสดีครับ","สวัสดีค่ะ","หวัดดี",
      "こんにちは","こんばんは","おはよう","おはようございます","やあ",
      "你好","您好","早上好","下午好","晚上好","哈囉","哈罗","嗨"];
    var THANKS = ["thanks","thank you","thankyou","thx","ty","cheers","thank u",
      "much appreciated","appreciate it","thanks a lot","thank you so much",
      "ขอบคุณ","ขอบคุณครับ","ขอบคุณค่ะ","ขอบใจ",
      "ありがとう","ありがとうございます","どうも",
      "谢谢","謝謝","多谢","多謝","感谢","感謝","谢谢你","謝謝你"];
    if (GREET.indexOf(norm) >= 0) return t("chat.a.hello");
    if (THANKS.indexOf(norm) >= 0) return t("chat.a.thanks");
    return null;
  }

  async function guestSend(text) {
    text = text.trim(); if (!text) return;
    await pushMessage("guest", text);
    render();
    const conv = getLocalConv();
    if (conv && conv.escalated) return;
    const reply = await botAnswer(text);
    if (reply === null) {
      // Catch a plain greeting / thank-you first so "hi" or "thanks" gets a
      // friendly reply instead of escalating to a human.
      const small = smallTalkReply(text);
      if (small) {
        setTimeout(async () => { await pushMessage("bot", small); render(); }, 650);
        return;
      }
      // Genuinely no auto-response — say we're connecting them, then escalate to
      // an available front-desk staff member (escalate() posts the "connected
      // to {name}" / "reply as soon as available" system message and routes all
      // further guest messages to staff).
      setTimeout(async () => {
        await pushMessage("bot", t("chat.a.default"));
        render();
        await escalate();
      }, 650);
      return;
    }
    setTimeout(async () => {
      await pushMessage("bot", reply);
      render();
    }, 650);
  }

  async function quickTopic(id) {
    const topic = TOPICS.find((x) => x.id === id);
    await pushMessage("guest", t("chat.quick." + id));
    render();
    const reply = await topicAnswer(topic);
    setTimeout(async () => { await pushMessage("bot", reply); render(); }, 500);
  }

  async function fetchAvailableStaff() {
    const API = window.JPark.api;
    if (!API) return [];
    try {
      const res = await API.get("/api/chat/available-staff");
      return Array.isArray(res) ? res : [];
    } catch (_) { return []; }
  }

  async function escalate() {
    // Last gate before a real person is pulled in: the front desk should never
    // open a thread without knowing whether they're talking to someone in a
    // room or someone browsing. Anyone who skipped the chooser (or dismissed
    // it) gets it back here instead of a hand-off.
    if (!identity) {
      pendingEscalate = true;
      idView = idView || "choose";
      idError = t("chat.id.required");
      renderIdentity();
      if (idBox) idBox.scrollIntoView({ block: "nearest" });
      return;
    }
    pendingEscalate = false;
    const conv = ensureLocalConv();
    if (!conv.escalated) {
      conv.escalated = true;
      conv.unreadForStaff = (conv.unreadForStaff || 0) + 1;

      const staff = await fetchAvailableStaff();
      let msgText;
      let pickedId = null, pickedName = null;
      if (staff.length) {
        const pick = staff[Math.floor(Math.random() * staff.length)];
        conv.assignedStaff = pick.name;
        pickedId = pick.id;
        pickedName = pick.name;
        msgText = t("chat.connectedTo").replace("{name}", pick.name.trim().split(/\s+/)[0]);
      } else {
        msgText = t("chat.noStaffOnShift");
      }

      const msg = { id: S.genId(), from: "system", text: msgText, lang: I.getLang(), ts: Date.now() };
      conv.messages.push(msg); conv.lastMsg = msg.text; conv.lastAt = msg.ts;
      saveLocalConv(conv);
      apiPostMessage("system", msg.text, {
        escalated: true,
        assignedStaffId: pickedId, assignedStaffName: pickedName,
      });
    }
    render();
  }

  /* ─────────────── rendering ─────────────────────────────────────────────── */
  function fromLabel(from) {
    if (from === "guest")  return t("chat.you");
    if (from === "staff")  return t("chat.staff");
    return t("chat.bot");
  }

  /* Stamp a bubble with the time it was sent. Called for every message,
     including system notices, so a returning guest can see whether the front
     desk answered five minutes ago or yesterday evening. */
  function appendTime(host, ts) {
    if (!ts) return;
    const el = document.createElement("time");
    el.className = "msg-time";
    el.dateTime = new Date(ts).toISOString();
    el.textContent = U.messageTime(ts);
    host.appendChild(el);
  }

  function render() {
    const conv = getLocalConv();
    const cur  = I.getLang();
    body.innerHTML = '<p class="chat-langnote">' + U.escapeHtml(t("chat.langNote")) + "</p>";
    if (conv) {
      conv.messages.forEach((m) => {
        const div = document.createElement("div");
        div.className = "msg " + m.from;
        if (m.from === "system") {
          div.textContent = m.text;
        } else {
          div.innerHTML = '<span class="msg-from">' + U.escapeHtml(fromLabel(m.from)) + "</span>";
          const span = document.createElement("span"); div.appendChild(span);
          // "Translated from X" arrives later, asynchronously. Give it its own
          // host ABOVE the timestamp, or it lands underneath whenever a
          // translation happens to come back.
          const noteHost = document.createElement("span");
          noteHost.className = "msg-notes";
          div.appendChild(noteHost);
          // Don't trust the declared language alone: a message written in a
          // different script than it claims (e.g. Japanese typed on the Thai
          // site) still gets translated for the reader — see translate.js.
          if (JPark.translate.needsTranslation(m.text, m.lang, cur)) JPark.translate.fill(span, m.text, noteHost);
          else span.textContent = m.text;
        }
        // When the message was sent — always the last line of the bubble.
        appendTime(div, m.ts);
        body.appendChild(div);
      });
    }
    U.pinToBottom(body);
    renderQuick();
  }

  function renderQuick() {
    let q = panel.querySelector(".chat-quick");
    q.innerHTML = "";
    QUICK.forEach((id) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = t("chat.quick." + id);
      b.addEventListener("click", () => quickTopic(id));
      q.appendChild(b);
    });
    const fd = document.createElement("button");
    fd.type = "button"; fd.className = "cq-frontdesk"; fd.textContent = t("chat.toFrontDesk");
    fd.addEventListener("click", escalate);
    q.appendChild(fd);
  }

  function setBadge(n) {
    if (!badge) return;
    if (n > 0) {
      badge.textContent = n; badge.classList.add("show");
      if (fab) fab.classList.add("has-reply");
    } else {
      badge.classList.remove("show");
      if (fab) fab.classList.remove("has-reply");
    }
  }

  function open() {
    openState = true;
    stopWatch();
    panel.classList.add("open"); fab.style.display = "none";
    fab.classList.remove("has-reply");
    requestGuestNotifyPermission();
    loadRates(); // refresh in case an admin changed rates since page load
    ensureLocalConv();
    const conv = getLocalConv();
    if (conv && conv.unreadForGuest) { conv.unreadForGuest = 0; saveLocalConv(conv); }
    setBadge(0);
    render();
    renderIdentity();
    adoptPortalSession();
    // Pull the thread NOW rather than waiting out the first poll interval:
    // opening the bubble because it lit up, and then staring at a panel that
    // still doesn't show the reply for another five seconds, reads as broken.
    syncFromApi();
    startPoll();
    setTimeout(() => { const inp = panel.querySelector(".chat-input input"); if (inp) inp.focus(); }, 60);
  }
  function close() {
    openState = false;
    panel.classList.remove("open"); fab.style.display = "grid";
    stopPoll();
    startWatch();
  }

  function startPoll() {
    stopPoll();
    pollTimer = setInterval(syncFromApi, 5000);
  }
  function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }
  function startWatch() {
    stopWatch();
    if (document.hidden) return;
    watchTick();
    watchTimer = setInterval(watchTick, WATCH_MS);
  }
  function stopWatch() {
    if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
  }

  /* ─────────────── DOM ────────────────────────────────────────────────────── */
  function build() {
    fab = document.createElement("button");
    fab.className = "chat-fab"; fab.setAttribute("aria-label", t("chat.open"));
    fab.innerHTML = '<span aria-hidden="true">💬</span><span class="fab-badge" id="chatFabBadge"></span>';
    document.body.appendChild(fab);
    badge = fab.querySelector(".fab-badge");

    panel = document.createElement("div");
    panel.className = "chat-panel";
    panel.innerHTML =
      '<div class="chat-head">' +
        '<div class="ch-avatar">J</div>' +
        '<div><div class="ch-title">' + U.escapeHtml(t("chat.title")) + '</div>' +
        '<div class="ch-sub">' + U.escapeHtml(t("chat.subtitle")) + "</div></div>" +
        '<button class="ch-close" aria-label="' + U.escapeHtml(t("chat.close")) + '">&times;</button>' +
      "</div>" +
      '<div class="chat-body"></div>' +
      '<div class="chat-id"></div>' +
      '<div class="chat-quick"></div>' +
      '<form class="chat-input"><input type="text" placeholder="' + U.escapeHtml(t("chat.placeholder")) + '" aria-label="' + U.escapeHtml(t("chat.placeholder")) + '" /><button type="submit" aria-label="' + U.escapeHtml(t("chat.send")) + '">➤</button></form>';
    document.body.appendChild(panel);
    body = panel.querySelector(".chat-body");
    idBox = panel.querySelector(".chat-id");

    fab.addEventListener("click", open);
    panel.querySelector(".ch-close").addEventListener("click", close);
    const form  = panel.querySelector(".chat-input");
    const input = form.querySelector("input");
    form.addEventListener("submit", (e) => { e.preventDefault(); guestSend(input.value); input.value = ""; });
  }

  function relabel() {
    if (!panel) return;
    panel.querySelector(".ch-title").textContent = t("chat.title");
    panel.querySelector(".ch-sub").textContent   = t("chat.subtitle");
    const input = panel.querySelector(".chat-input input");
    input.placeholder = t("chat.placeholder");
    input.setAttribute("aria-label", t("chat.placeholder"));
    if (fab) fab.setAttribute("aria-label", t("chat.open"));
    render();
    renderIdentity();
  }

  document.addEventListener("DOMContentLoaded", () => {
    build();
    loadRates();
    loadIdentity();

    S.on("chats", () => {
      const conv = getLocalConv(); if (!conv) return;
      if (openState) render();
      else setBadge(conv.unreadForGuest || 0);
    });

    document.addEventListener("jpark:langchange", relabel);

    const conv = getLocalConv();
    if (conv && conv.unreadForGuest) setBadge(conv.unreadForGuest);

    // Pre-load the conversation so the badge is accurate, then keep watching
    // for replies in the background. A resumed thread also gets its identity
    // (and its history) back from the server here.
    apiGetConv().then((remote) => {
      if (remote && remote.messages) {
        lastMsgCount = remote.messages.length;
        adoptServerIdentity(remote);
        if (resumedThread && remote.messages.length) {
          const c = ensureLocalConv();
          c.messages = remote.messages.map((m) => ({
            id: m.id, from: m.from, text: m.text,
            staffName: m.fromName, lang: m.lang, ts: m.ts,
          }));
          c.escalated = remote.escalated;
          c.lastMsg = remote.lastMsg || c.lastMsg;
          c.lastAt = remote.lastAt || c.lastAt;
          saveLocalConv(c);
        }
      }
      startWatch();
    });

    // Watching costs a request every 12s, so it runs only while this tab is
    // actually on screen. Coming back to the tab checks immediately — that's
    // the moment a guest is most likely to be looking for an answer.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { stopWatch(); stopPoll(); }
      else if (openState) { syncFromApi(); startPoll(); }
      else startWatch();
    });
  });

  /* ─────────────── per-request remarks (Guest Requests board) ─────────────
     A guest filing "Arrange a taxi" or answering a follow-up question about
     it types into a small thread right on that request card — not into the
     floating bubble. It still has to land in the SAME conversation the front
     desk already watches (see schema.sql on request_kind/request_id), rather
     than a second inbox nobody checks, so this reuses pushMessage/escalate
     exactly as a normal hand-off would, just triggered from the request card
     instead of the chat panel. */

  /* Like adoptPortalSession() (used when the bubble opens), but also
     self-declares when the booking lookup finds nothing. The general chat
     widget only silently adopts a CONFIRMED match and otherwise leaves the
     "who are you?" chooser for the guest to answer explicitly; here that
     chooser would render inside a bubble the guest never opened. A guest
     typing on a request card has already cleared that bar once, at the
     portal gate (see guest.js — including the portal's own unconfirmed
     tier for OTA/walk-in guests), so it's answered the same way here. */
  async function adoptPortalIdentityForRequest() {
    if (identity) return;
    const g = S.getSession("guest");
    if (!g) return;
    const res = await apiIdentify({
      kind: "guest", ref: g.ref, lastName: g.name, room: g.room,
      unconfirmed: true,
      systemText: identityLine("guest", g.verified !== false),
    });
    if (!res || res.error) return;
    saveIdentity({
      kind: "guest", verified: !!res.verified,
      name: res.name, room: res.room, ref: res.ref || null,
    });
    idView = null;
    pushIdentityLine(res);
    renderIdentity();
  }

  async function sendForRequest(requestKind, requestId, text) {
    text = (text || "").trim();
    if (!text) return;
    if (!identity) await adoptPortalIdentityForRequest();
    await pushMessage("guest", text, { requestKind, requestId, escalated: true });
    render();
    const conv = getLocalConv();
    if (conv && !conv.escalated) await escalate();
  }

  /* Just the messages tagged to one request — not the whole account-wide
     conversation, so a request card shows only what it's about. */
  async function getRequestThread(requestKind, requestId) {
    const API = window.JPark.api;
    if (!API) return [];
    const res = await API.get(
      "/api/chat?guestId=" + encodeURIComponent(gid) +
      "&kind=" + encodeURIComponent(requestKind) +
      "&id=" + encodeURIComponent(requestId)
    );
    return (res && Array.isArray(res.messages)) ? res.messages : [];
  }

  window.JPark.chat = {
    open,
    askAbout: function (title) {
      open();
      pushMessage("guest", title).then(() => { render(); escalate(); });
    },
    sendForRequest,
    getRequestThread,
  };
})();
