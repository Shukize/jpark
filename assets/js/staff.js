/* ============================================================
   J Park Hotel — staff & admin console
   Login (Staff / Admin roles), guest-request board, live chat
   replies, internal company messages, and admin-only site
   editing + staff moderation. Real-time across tabs.
   ============================================================ */
(function () {
  "use strict";
  const J = window.JPark;
  const S = window.JPark.store;
  const I = window.JPark.i18n;
  const U = window.JPark.util;
  const t = (k) => I.t(k);
  const esc = U.escapeHtml;

  const SESSION_KEY = "jpark.staff";
  const SECTIONS = [
    { id: "coffee", label: "nav.coffee" }, { id: "services", label: "nav.services" },
    { id: "about", label: "nav.about" }, { id: "rooms", label: "nav.rooms" },
    { id: "facilities", label: "nav.facilities" }, { id: "dining", label: "nav.dining" },
    { id: "concierge", label: "nav.concierge" }, { id: "gallery", label: "nav.gallery" }
  ];
  const REQ_FILTERS = ["all", "pending", "progress", "done"];

  /* ---- Site Editor configuration ----
     Groups every public-site translation key (by prefix) into friendly,
     collapsible sections so an admin can edit any words on the site. */
  const EDIT_GROUPS = [
    { title: "staff.site.grpBrand",    prefixes: ["brand.", "nav."] },
    { title: "staff.site.grpHero",     prefixes: ["hero."] },
    { title: "nav.about",              prefixes: ["about."] },
    { title: "nav.rooms",              prefixes: ["rooms."] },
    { title: "nav.facilities",         prefixes: ["fac."] },
    { title: "nav.dining",             prefixes: ["dining.", "menu."] },
    { title: "nav.coffee",             prefixes: ["coffee."] },
    { title: "nav.gallery",            prefixes: ["gallery."] },
    { title: "staff.site.grpServices", prefixes: ["services.", "matrix.", "rs.", "gate.", "track."] },
    { title: "nav.concierge",          prefixes: ["conc."] },
    { title: "nav.contact",            prefixes: ["contact."] },
    { title: "staff.site.grpFooter",   prefixes: ["footer."] }
  ];
  // Single-slot images the admin can replace (selectors live in cms.js).
  const IMAGE_SLOTS = [
    { key: "heroImg",   label: "staff.site.imgHero" },
    { key: "aboutMain", label: "staff.site.imgAboutMain" },
    { key: "aboutSub",  label: "staff.site.imgAboutSub" }
  ];
  // Brand colours -> CSS variables (defaults mirror style.css :root).
  const THEME_COLORS = [
    { key: "teal",       label: "staff.site.colPrimary", def: "#0c5b58" },
    { key: "terracotta", label: "staff.site.colAccent",  def: "#b8552e" },
    { key: "gold",       label: "staff.site.colGold",    def: "#c9a24b" }
  ];
  const GUIDE_HIDDEN_KEY = "jpark.guideHidden";

  let session = null;
  let panel = "requests";
  let reqFilter = "all";
  let edLang = null;     // which language the Site Editor is editing
  let edSearchQ = "";    // current Site Editor search filter
  let selectedThread = null;
  let seenReq = null;
  let seenBookings = null;
  let lastChatUnread = 0;

  // Messages state
  let msgView = "inbox";
  let msgDetailId = null;
  let msgDetailKind = "message"; // "message" | "booking"
  let msgPrevView = "inbox";
  let msgToRecipients = [];
  let msgToAllSelected = false;

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (_) { return null; }
  }
  function setSession(s) {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
    // notify other tabs (storage event doesn't fire in same tab)
    session = s;
  }
  function isAdmin() { return session && session.role === "admin"; }

  /* ====================  AUTH  ==================== */
  function validSession(s) {
    if (!s) return null;
    const u = S.list("staff").find((x) => x.id === s.id);
    return u && u.active ? s : null;
  }

  function login(username, password) {
    const u = S.list("staff").find((x) => x.username.toLowerCase() === username.trim().toLowerCase());
    if (!u || u.password !== password) return { error: t("staff.login.error") };
    if (!u.active) return { error: t("staff.login.disabled") };
    return { user: { id: u.id, name: u.name, role: u.role, username: u.username } };
  }

  function showLogin() {
    document.getElementById("loginView").style.display = "grid";
    document.getElementById("dashView").classList.remove("show");
  }

  function showDash() {
    document.getElementById("loginView").style.display = "none";
    document.getElementById("dashView").classList.add("show");

    document.querySelectorAll(".admin-only").forEach((el) => { el.style.display = isAdmin() ? "" : "none"; });
    document.getElementById("dsUserName").textContent = session.name;
    document.getElementById("dsUserRole").textContent = t(isAdmin() ? "staff.role.admin" : "staff.role.staff");
    document.getElementById("dsRoleLabel").textContent = t(isAdmin() ? "staff.role.admin" : "staff.role.staff");

    seenReq = new Set(S.list("requests").map((r) => r.id));
    seenBookings = new Set(S.list("guestBookings").map((b) => b.id));
    lastChatUnread = totalChatUnread();

    renderAvatarInSidebar();
    selectPanel(panel);
    updateBadges();
    requestNotifyPermission();
  }

  /* ====================  PANELS  ==================== */
  function selectPanel(name) {
    if ((name === "site" || name === "team") && !isAdmin()) name = "requests";
    if (name === "company") name = "messages"; // redirect legacy hash
    panel = name;
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.panel === name));
    document.querySelectorAll(".dash-panel").forEach((p) => p.classList.toggle("show", p.id === "panel-" + name));
    renderPanel();
  }

  function renderPanel() {
    if (panel === "requests") renderRequests();
    else if (panel === "chat") renderChat();
    else if (panel === "messages") renderMessages();
    else if (panel === "roster") renderRoster();
    else if (panel === "site") renderSite();
    else if (panel === "team") renderTeam();
  }

  /* Team Status & Shifts — modular card board (assets/js/employee-card.js).
     Visible to every signed-in user; the board itself gates edit controls on
     the admin permission carried in the bearer token. */
  function renderRoster() {
    const mountEl = document.getElementById("empBoardMount");
    if (mountEl && J.employeeCards) J.employeeCards.mount(mountEl);
  }

  /* ====================  REQUESTS  ==================== */
  function reqTitle(r) {
    if (r.kind === "order") {
      const names = (r.items || []).map((it) => it.qty + "× " + t(it.key)).join(", ");
      return t("staff.requests.order") + " — " + names;
    }
    return r.titleKey ? t(r.titleKey) : (r.title || "");
  }

  function renderFilters() {
    const wrap = document.getElementById("reqFilters");
    wrap.innerHTML = "";
    REQ_FILTERS.forEach((f) => {
      const b = document.createElement("button");
      b.className = (f === reqFilter ? "active" : "");
      b.textContent = f === "all" ? t("staff.requests.filterAll") : t("track.status." + f);
      b.addEventListener("click", () => { reqFilter = f; renderRequests(); });
      wrap.appendChild(b);
    });
  }

  function renderRequests() {
    renderFilters();
    const list = document.getElementById("reqList");
    let reqs = S.list("requests").filter((r) => r.status !== "cancelled");
    if (reqFilter !== "all") reqs = reqs.filter((r) => r.status === reqFilter);
    reqs.sort((a, b) => {
      const order = { pending: 0, progress: 1, done: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return b.createdAt - a.createdAt;
    });

    const lede = document.querySelector("#panel-requests .panel-lede");
    if (lede) lede.textContent = "";

    if (!reqs.length) {
      list.innerHTML = '<p class="track-empty">' + esc(t("staff.requests.empty")) + "</p>";
      return;
    }
    list.innerHTML = "";
    reqs.forEach((r) => {
      const card = document.createElement("div");
      card.className = "staff-req " + r.status;
      let detail = "";
      if (r.kind === "order") {
        detail += '<div class="sr-detail"><b>' + esc(t("staff.requests.items")) + ":</b> " +
          esc((r.items || []).map((it) => it.qty + "× " + t(it.key)).join(", ")) +
          " · " + U.money(r.total) + "</div>";
        if (r.deliverAt) detail += '<div class="sr-detail">' + esc(t("staff.requests.deliver")) + ": " +
          esc(r.deliverAt === "asap" ? t("rs.asap") : r.deliverAt) + "</div>";
      }
      if (r.note) detail += '<div class="sr-detail">' + esc(t("staff.requests.note")) + ": " + esc(r.note) + "</div>";

      let actions = "";
      if (r.status === "pending") actions = '<button class="act-start">' + esc(t("staff.requests.start")) + "</button>";
      else if (r.status === "progress") actions = '<button class="act-done">' + esc(t("staff.requests.done")) + "</button>";
      else if (r.status === "done") actions = '<button class="act-reopen">' + esc(t("staff.requests.reopen")) + "</button>";

      card.innerHTML =
        '<div class="sr-head">' +
          '<span class="sr-room">' + esc(t("staff.requests.room")) + " " + esc(r.room) + "</span>" +
          '<span class="sr-title">' + esc(reqTitle(r)) + "</span>" +
          (r.status === "pending" ? '<span class="sr-new">' + esc(t("track.status.pending").toUpperCase()) + "</span>" : "") +
          '<span class="sr-time">' + esc(U.timeAgo(r.createdAt)) + "</span>" +
        "</div>" + detail +
        '<div class="sr-actions">' + actions + "</div>";

      const startBtn = card.querySelector(".act-start");
      const doneBtn = card.querySelector(".act-done");
      const reopenBtn = card.querySelector(".act-reopen");
      if (startBtn) startBtn.addEventListener("click", () => S.update("requests", r.id, { status: "progress" }));
      if (doneBtn) doneBtn.addEventListener("click", () => S.update("requests", r.id, { status: "done" }));
      if (reopenBtn) reopenBtn.addEventListener("click", () => S.update("requests", r.id, { status: "progress" }));
      list.appendChild(card);
    });
  }

  /* ====================  LIVE CHAT  ==================== */
  function totalChatUnread() {
    return S.list("chats").reduce((s, c) => s + (c.unreadForStaff || 0), 0);
  }

  function renderChat() {
    const threadsEl = document.getElementById("chatThreads");
    const convEl = document.getElementById("chatConv");
    const chats = S.list("chats").slice().sort((a, b) => b.lastAt - a.lastAt);

    if (!chats.length) {
      threadsEl.innerHTML = '<div style="padding:18px" class="muted">' + esc(t("staff.chat.empty")) + "</div>";
    } else {
      threadsEl.innerHTML = "";
      chats.forEach((c) => {
        const div = document.createElement("div");
        div.className = "cc-thread" + (selectedThread === c.id ? " active" : "");
        div.innerHTML =
          '<div class="cct-name">' + (c.unreadForStaff ? '<span class="cct-unread"></span>' : "") +
            esc(c.guestName || "Guest") + (c.room ? " · " + esc(t("staff.requests.room")) + " " + esc(c.room) : "") + "</div>" +
          '<div class="cct-last">' + esc(c.lastMsg || "") + "</div>" +
          '<div class="cct-lang">' + esc((I.LANG_NAMES[c.lang] || c.lang || "")) +
            (c.escalated ? "" : " · " + esc(t("chat.bot"))) + "</div>";
        div.addEventListener("click", () => { selectedThread = c.id; markThreadRead(c.id); renderChat(); });
        threadsEl.appendChild(div);
      });
    }

    const conv = chats.find((c) => c.id === selectedThread);
    if (!conv) {
      convEl.innerHTML = '<div class="cc-conv-empty">' + esc(t("staff.chat.none")) + "</div>";
      return;
    }
    let html =
      '<div class="cc-conv-head"><span class="cch-name">' + esc(conv.guestName || "Guest") +
        (conv.room ? " · " + esc(t("staff.requests.room")) + " " + esc(conv.room) : "") + "</span>" +
        '<span class="cch-lang">' + esc(t("staff.chat.guestLang")) + ": " + esc(I.LANG_NAMES[conv.lang] || conv.lang || "") + "</span></div>" +
      '<div class="cc-conv-body" id="ccBody"></div>' +
      '<form class="cc-conv-input" id="ccForm"><input type="text" id="ccInput" placeholder="' + esc(t("staff.chat.placeholder")) + '" autocomplete="off" />' +
        '<button type="submit">' + esc(t("common.send")) + "</button></form>";
    convEl.innerHTML = html;

    const bodyEl = document.getElementById("ccBody");
    const cur = I.getLang();
    conv.messages.forEach((m) => {
      const div = document.createElement("div");
      div.className = "msg " + m.from;
      if (m.from === "system") { div.textContent = m.text; }
      else {
        div.innerHTML = '<span class="msg-from">' +
          esc(m.from === "guest" ? (conv.guestName || t("chat.you")) : m.from === "staff" ? (m.staffName || t("chat.staff")) : t("chat.bot")) + "</span>";
        const span = document.createElement("span"); div.appendChild(span);
        if (m.lang && m.lang === cur) span.textContent = m.text;
        else J.translate.fill(span, m.text, div);
      }
      bodyEl.appendChild(div);
    });
    bodyEl.scrollTop = bodyEl.scrollHeight;

    document.getElementById("ccForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const inp = document.getElementById("ccInput");
      const text = inp.value.trim();
      if (!text) return;
      staffReply(conv.id, text);
      inp.value = "";
    });
  }

  function markThreadRead(id) {
    const all = S.list("chats");
    const i = all.findIndex((c) => c.id === id);
    if (i >= 0 && all[i].unreadForStaff) { all[i].unreadForStaff = 0; S.write("chats", all); }
  }

  function staffReply(id, text) {
    const all = S.list("chats");
    const i = all.findIndex((c) => c.id === id);
    if (i < 0) return;
    const c = all[i];
    c.escalated = true;
    c.messages.push({ id: S.genId(), from: "staff", text: text, staffName: session.name, ts: Date.now() });
    c.lastMsg = text; c.lastAt = Date.now();
    c.unreadForStaff = 0;
    c.unreadForGuest = (c.unreadForGuest || 0) + 1;
    all[i] = c;
    S.write("chats", all);
  }

  /* ====================  PROFILE PICTURE  ==================== */
  function getAvatarDataUrl(userId) {
    return S.read("avatar_" + userId, null);
  }
  function setAvatarDataUrl(userId, dataUrl) {
    S.write("avatar_" + userId, dataUrl);
  }
  function renderAvatarInSidebar() {
    const el = document.getElementById("dsAvatar");
    if (!el || !session) return;
    const dataUrl = getAvatarDataUrl(session.id);
    if (dataUrl) {
      el.innerHTML = '<img src="' + esc(dataUrl) + '" alt="Profile photo" />';
    } else {
      el.textContent = (session.name || "?").charAt(0).toUpperCase();
    }
  }
  function makeAvatarHtml(name, userId) {
    const dataUrl = getAvatarDataUrl(userId);
    if (dataUrl) return '<img src="' + esc(dataUrl) + '" alt="' + esc(name) + '" />';
    return "<span>" + esc((name || "?").charAt(0).toUpperCase()) + "</span>";
  }

  /* ====================  MESSAGES  ==================== */
  function getAllMsgs() { return S.list("messages"); }
  function getInboxMsgs() {
    return getAllMsgs().filter((m) =>
      m.fromId !== session.id &&
      Array.isArray(m.to) && m.to.includes(session.id)
    ).sort((a, b) => b.createdAt - a.createdAt);
  }
  function getSentMsgs() {
    return getAllMsgs().filter((m) => m.fromId === session.id)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  function getAnnouncementMsgs() {
    return getAllMsgs().filter((m) => m.to === "all")
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  function isUnread(m) {
    return !m.readBy || !m.readBy.includes(session.id);
  }

  /* Guest bookings forwarded in from OTA channels (Agoda, Booking.com…).
     Every staff member and admin sees the same inbox; "read" is tracked
     per user via readBy, exactly like internal messages. */
  function getBookingMsgs() {
    return S.list("guestBookings").slice().sort((a, b) => b.createdAt - a.createdAt);
  }
  function isBookingUnread(b) {
    return !b.readBy || !session || !b.readBy.includes(session.id);
  }
  function getBookingUnreadCount() {
    return getBookingMsgs().filter(isBookingUnread).length;
  }
  function markBookingRead(id) {
    const all = S.list("guestBookings");
    const i = all.findIndex((b) => b.id === id);
    if (i < 0) return;
    const readBy = all[i].readBy ? all[i].readBy.slice() : [];
    if (!readBy.includes(session.id)) {
      readBy.push(session.id);
      all[i] = Object.assign({}, all[i], { readBy });
      S.write("guestBookings", all);
    }
  }

  function getMsgUnreadCount() {
    const inboxUnread = getInboxMsgs().filter(isUnread).length;
    const annUnread = getAnnouncementMsgs().filter((m) => m.fromId !== session.id && isUnread(m)).length;
    const bookingUnread = getBookingUnreadCount();
    return { inboxUnread, annUnread, bookingUnread, total: inboxUnread + annUnread + bookingUnread };
  }
  function markMsgRead(id) {
    const all = getAllMsgs();
    const i = all.findIndex((m) => m.id === id);
    if (i < 0) return;
    const readBy = all[i].readBy ? all[i].readBy.slice() : [];
    if (!readBy.includes(session.id)) {
      readBy.push(session.id);
      all[i] = Object.assign({}, all[i], { readBy });
      S.write("messages", all);
    }
  }
  function formatMsgTime(ts) {
    const now = new Date();
    const d = new Date(ts);
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    const days = Math.floor((now - d) / 86400000);
    if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  /* Silently translate `original` into the current UI language and drop it
     into `el` (no "translated from" note — used for compact list rows). */
  function maybeTranslateInto(el, original, srcLang) {
    if (!el || !original || !original.trim()) return;
    const cur = I.getLang();
    if (srcLang && srcLang === cur) return;
    J.translate.text(original, cur).then((res) => {
      if (!el.isConnected) return;
      if (res.src && res.src !== cur && res.text && res.text !== original) {
        el.textContent = res.text;
      }
    });
  }

  function setNavBadge(id, n) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = n || "";
    el.style.display = n ? "" : "none";
  }

  function renderMessages() {
    const counts = getMsgUnreadCount();
    setNavBadge("msgInboxBadge", counts.inboxUnread);
    setNavBadge("msgAnnBadge", counts.annUnread);
    setNavBadge("msgBookingBadge", counts.bookingUnread);

    // While viewing a detail, keep the list it came from highlighted.
    const activeView = msgView === "detail" ? msgPrevView : msgView;
    document.querySelectorAll("#msgSidebar .msg-nav-item").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === activeView);
    });
    const listArea = document.getElementById("msgListArea");
    const detailArea = document.getElementById("msgDetail");
    if (msgView === "detail" && msgDetailId) {
      listArea.classList.add("hidden");
      detailArea.classList.add("show");
      if (msgDetailKind === "booking") renderBookingDetail(msgDetailId);
      else renderMsgDetail(msgDetailId);
    } else {
      listArea.classList.remove("hidden");
      detailArea.classList.remove("show");
      detailArea.innerHTML = "";
      renderMsgList();
    }
  }

  const MSG_VIEW_META = {
    inbox:         { ico: "📥", header: "msg.inbox",         emptySub: "msg.empty.inbox" },
    bookings:      { ico: "🛎️", header: "msg.bookings",      emptySub: "msg.empty.bookings" },
    sent:          { ico: "📤", header: "msg.sent",          emptySub: "msg.empty.sent" },
    announcements: { ico: "📢", header: "msg.announcements", emptySub: "msg.empty.ann" }
  };

  function renderMsgList() {
    if (msgView === "bookings") { renderBookingList(); return; }

    const listArea = document.getElementById("msgListArea");
    const meta = MSG_VIEW_META[msgView] || MSG_VIEW_META.inbox;
    let msgs = [];
    if (msgView === "inbox") msgs = getInboxMsgs();
    else if (msgView === "sent") msgs = getSentMsgs();
    else if (msgView === "announcements") msgs = getAnnouncementMsgs();

    const countLabel = msgs.length ? '<span class="mlh-count">' + msgs.length + "</span>" : "";
    listArea.innerHTML = '<div class="msg-list-header">' + esc(t(meta.header)) + countLabel + "</div>";

    if (!msgs.length) {
      listArea.innerHTML +=
        '<div class="msg-empty">' +
        '<div class="me-ico">' + meta.ico + "</div>" +
        '<div class="me-title">' + esc(t("msg.empty.title")) + "</div>" +
        '<div class="me-sub">' + esc(t(meta.emptySub)) + "</div>" +
        "</div>";
      return;
    }

    msgs.forEach((m) => {
      const isSent = msgView === "sent";
      const isAnn = m.to === "all";
      const unread = !isSent && isUnread(m);
      const displayName = isSent
        ? (isAnn ? "Everyone" : (Array.isArray(m.toNames) ? m.toNames.join(", ") : (m.toNames || "—")))
        : m.fromName;
      const avatarUserId = isSent ? session.id : m.fromId;

      const row = document.createElement("div");
      row.className = "msg-row" + (unread ? " unread" : " read") + (isAnn ? " announcement" : "");
      row.dataset.id = m.id;
      row.innerHTML =
        '<div class="mr-avatar">' + makeAvatarHtml(displayName, avatarUserId) + "</div>" +
        '<div class="mr-sender">' + esc(displayName) + "</div>" +
        '<div class="mr-subject-preview">' +
          '<span class="mr-subject">' + esc(m.subject || "(no subject)") + "</span>" +
          '<span class="mr-sep">—</span>' +
          '<span class="mr-preview">' + esc((m.body || "").replace(/\n/g, " ").slice(0, 100)) + "</span>" +
        "</div>" +
        '<div class="mr-time">' + esc(formatMsgTime(m.createdAt)) + "</div>";
      maybeTranslateInto(row.querySelector(".mr-subject"), m.subject || "", m.lang);
      maybeTranslateInto(row.querySelector(".mr-preview"), (m.body || "").replace(/\n/g, " ").slice(0, 100), m.lang);
      row.addEventListener("click", () => {
        msgPrevView = msgView;
        msgDetailId = m.id;
        msgDetailKind = "message";
        msgView = "detail";
        markMsgRead(m.id);
        renderMessages();
      });
      listArea.appendChild(row);
    });
  }

  function renderMsgDetail(id) {
    const m = getAllMsgs().find((x) => x.id === id);
    const detailArea = document.getElementById("msgDetail");
    if (!m) { detailArea.innerHTML = ""; return; }

    const isAnn = m.to === "all";
    const toLabel = isAnn ? "All Staff" : (Array.isArray(m.toNames) ? m.toNames.join(", ") : (m.toNames || ""));
    const emailAlias = (m.fromName || "").toLowerCase().replace(/\s+/g, ".") + "@jpark.hotel";
    const avatarClass = isAnn ? "mda-avatar announcement-avatar" : "mda-avatar";

    detailArea.innerHTML =
      '<button class="msg-detail-back" id="msgDetailBack">← Back</button>' +
      '<div class="msg-detail-subject"></div>' +
      '<div class="msg-detail-meta">' +
        '<div class="' + avatarClass + '">' + makeAvatarHtml(m.fromName, m.fromId) + "</div>" +
        '<div class="mda-info">' +
          '<div class="mda-from">' + esc(m.fromName) +
            ' <span class="mda-email">&lt;' + esc(emailAlias) + "&gt;</span></div>" +
          '<div class="mda-to">to <b>' + esc(toLabel) + "</b></div>" +
        "</div>" +
        '<div class="mda-time">' + esc(new Date(m.createdAt).toLocaleString()) + "</div>" +
      "</div>" +
      '<div class="tr-note msg-tr-note" style="display:none"></div>' +
      '<div class="msg-detail-body"></div>';

    // Subject + body: show original immediately, then auto-translate to the
    // reader's language with a single "translated from X" note.
    const subjEl = detailArea.querySelector(".msg-detail-subject");
    const bodyEl = detailArea.querySelector(".msg-detail-body");
    const noteEl = detailArea.querySelector(".msg-tr-note");
    subjEl.textContent = m.subject || "(no subject)";
    bodyEl.textContent = m.body || "";
    const cur = I.getLang();
    if (!m.lang || m.lang !== cur) {
      J.translate.text(m.subject || "", cur).then((res) => {
        if (subjEl.isConnected && res.src && res.src !== cur && res.text && res.text !== (m.subject || "")) {
          subjEl.textContent = res.text;
        }
      });
      J.translate.text(m.body || "", cur).then((res) => {
        if (bodyEl.isConnected && res.src && res.src !== cur && res.text && res.text !== (m.body || "")) {
          bodyEl.textContent = res.text;
          noteEl.textContent = t("tr.from") + " " + J.translate.langName(res.src);
          noteEl.style.display = "";
        }
      });
    }

    document.getElementById("msgDetailBack").addEventListener("click", () => {
      msgView = msgPrevView;
      msgDetailId = null;
      renderMessages();
    });
  }

  /* ====================  GUEST BOOKINGS  ==================== */
  function bookingDateRange(b) {
    return (b.checkIn || "?") + " → " + (b.checkOut || "?");
  }
  function bkStatusLabel(s) {
    if (!s) return "";
    const k = "msg.bk.status." + s;
    const v = t(k);
    return v === k ? (s.charAt(0).toUpperCase() + s.slice(1)) : v;
  }

  function renderBookingList() {
    const listArea = document.getElementById("msgListArea");
    const bookings = getBookingMsgs();
    const countLabel = bookings.length ? '<span class="mlh-count">' + bookings.length + "</span>" : "";
    listArea.innerHTML = '<div class="msg-list-header">' + esc(t("msg.bookings")) + countLabel + "</div>";

    if (!bookings.length) {
      listArea.innerHTML +=
        '<div class="msg-empty">' +
        '<div class="me-ico">🛎️</div>' +
        '<div class="me-title">' + esc(t("msg.empty.title")) + "</div>" +
        '<div class="me-sub">' + esc(t("msg.empty.bookings")) + "</div>" +
        "</div>";
      return;
    }

    bookings.forEach((b) => {
      const unread = isBookingUnread(b);
      const row = document.createElement("div");
      row.className = "msg-row booking channel-" + b.channel + (unread ? " unread" : " read");
      row.dataset.id = b.id;
      const initial = (b.channelName || "?").charAt(0).toUpperCase();
      const preview = (b.room ? b.room + " · " : "") + bookingDateRange(b) + " · " + b.ref;
      row.innerHTML =
        '<div class="mr-avatar bk-avatar"><span>' + esc(initial) + "</span></div>" +
        '<div class="mr-sender">' + esc(b.channelName) + "</div>" +
        '<div class="mr-subject-preview">' +
          '<span class="mr-subject">' + esc(b.guestName) + "</span>" +
          '<span class="mr-sep">—</span>' +
          '<span class="mr-preview">' + esc(preview) + "</span>" +
        "</div>" +
        '<div class="mr-time">' + esc(formatMsgTime(b.createdAt)) + "</div>";
      row.addEventListener("click", () => {
        msgPrevView = "bookings";
        msgDetailId = b.id;
        msgDetailKind = "booking";
        msgView = "detail";
        markBookingRead(b.id);
        renderMessages();
      });
      listArea.appendChild(row);
    });
  }

  function bookingField(labelKey, value) {
    if (value == null || value === "") return "";
    return '<div class="bkd-row"><span class="bkd-label">' + esc(t(labelKey)) + "</span>" +
      '<span class="bkd-value">' + esc(value) + "</span></div>";
  }

  function renderBookingDetail(id) {
    const b = getBookingMsgs().find((x) => x.id === id);
    const detailArea = document.getElementById("msgDetail");
    if (!b) { detailArea.innerHTML = ""; return; }

    const totalStr = b.total != null ? (b.currency || "THB") + " " + Number(b.total).toLocaleString() : "";
    const initial = (b.channelName || "?").charAt(0).toUpperCase();
    const recipientName = session ? session.name : "";

    let fields = "";
    fields += bookingField("msg.bk.guest", b.guestName);
    fields += bookingField("msg.bk.email", b.guestEmail);
    fields += bookingField("msg.bk.phone", b.guestPhone);
    fields += bookingField("msg.bk.ref", b.ref);
    fields += bookingField("msg.bk.room", b.room);
    fields += bookingField("msg.bk.checkin", b.checkIn);
    fields += bookingField("msg.bk.checkout", b.checkOut);
    fields += bookingField("msg.bk.nights", b.nights);
    fields += bookingField("msg.bk.adults", b.adults);
    if (b.children) fields += bookingField("msg.bk.children", b.children);
    fields += bookingField("msg.bk.total", totalStr);
    fields += bookingField("msg.bk.statusLabel", bkStatusLabel(b.status));

    detailArea.innerHTML =
      '<button class="msg-detail-back" id="msgDetailBack">← ' + esc(t("msg.back")) + "</button>" +
      '<div class="msg-detail-subject">' + esc(t("msg.bk.subject") + " · " + b.channelName) + "</div>" +
      '<div class="msg-detail-meta">' +
        '<div class="mda-avatar bk-avatar channel-' + esc(b.channel) + '"><span>' + esc(initial) + "</span></div>" +
        '<div class="mda-info">' +
          '<div class="mda-from">' + esc(b.channelName) +
            ' <span class="mda-email">&lt;' + esc(b.channelEmail || "") + "&gt;</span></div>" +
          '<div class="mda-to">' + esc(t("msg.bk.to")) + " <b>" + esc(recipientName) + "</b></div>" +
        "</div>" +
        '<div class="mda-time">' + esc(new Date(b.createdAt).toLocaleString()) + "</div>" +
      "</div>" +
      '<div class="bk-detail-grid">' + fields + "</div>" +
      '<div class="bk-confirm-label">' + esc(t("msg.bk.confirmation")) + "</div>" +
      '<div class="tr-note msg-tr-note" style="display:none"></div>' +
      '<div class="msg-detail-body bk-confirm-body"></div>';

    // Confirmation body: show the original text, then auto-translate it into
    // the reader's language with a single "translated from X" note.
    const bodyEl = detailArea.querySelector(".bk-confirm-body");
    const noteEl = detailArea.querySelector(".msg-tr-note");
    bodyEl.textContent = b.confirmation || "";
    const cur = I.getLang();
    if (b.confirmation && (!b.lang || b.lang !== cur)) {
      J.translate.text(b.confirmation, cur).then((res) => {
        if (bodyEl.isConnected && res.src && res.src !== cur && res.text && res.text !== b.confirmation) {
          bodyEl.textContent = res.text;
          noteEl.textContent = t("tr.from") + " " + J.translate.langName(res.src);
          noteEl.style.display = "";
        }
      });
    }

    document.getElementById("msgDetailBack").addEventListener("click", () => {
      msgView = msgPrevView;
      msgDetailId = null;
      msgDetailKind = "message";
      renderMessages();
    });
  }

  /* ====================  COMPOSE  ==================== */
  function openCompose() {
    msgToRecipients = [];
    msgToAllSelected = false;
    const modal = document.getElementById("msgComposeModal");
    if (!modal) return;
    modal.classList.add("open");
    document.getElementById("msgToInput").value = "";
    document.getElementById("msgSubjectInput").value = "";
    document.getElementById("msgBodyInput").value = "";
    renderToTags();
    hideToDropdown();
    document.getElementById("msgToInput").focus();
  }
  function closeCompose() {
    const modal = document.getElementById("msgComposeModal");
    if (modal) modal.classList.remove("open");
    hideToDropdown();
  }
  function hideToDropdown() {
    const dd = document.getElementById("msgToDropdown");
    if (dd) dd.style.display = "none";
  }
  function renderToTags() {
    const wrap = document.getElementById("msgToTags");
    const input = document.getElementById("msgToInput");
    if (!wrap || !input) return;
    wrap.innerHTML = "";
    if (msgToAllSelected) {
      const tag = document.createElement("span");
      tag.className = "msg-to-tag everyone-tag";
      tag.innerHTML = "🌐 Everyone (All Staff) ";
      const rm = document.createElement("button");
      rm.type = "button"; rm.textContent = "✕";
      rm.addEventListener("click", () => { msgToAllSelected = false; renderToTags(); updateMsgLimit(); });
      tag.appendChild(rm);
      wrap.appendChild(tag);
    } else {
      msgToRecipients.forEach((r, i) => {
        const tag = document.createElement("span");
        tag.className = "msg-to-tag";
        const nm = document.createTextNode(r.name + " ");
        const rm = document.createElement("button");
        rm.type = "button"; rm.textContent = "✕";
        rm.addEventListener("click", () => { msgToRecipients.splice(i, 1); renderToTags(); updateMsgLimit(); });
        tag.appendChild(nm); tag.appendChild(rm);
        wrap.appendChild(tag);
      });
    }
    wrap.appendChild(input);
    updateMsgLimit();
  }
  function updateMsgLimit() {
    const el = document.getElementById("msgToLimit");
    if (!el) return;
    if (msgToAllSelected) {
      el.textContent = "Sending to all staff";
      el.className = "mf-limit";
    } else if (!isAdmin()) {
      const n = msgToRecipients.length;
      el.textContent = n + " / 10 recipients";
      el.className = "mf-limit" + (n >= 10 ? " over" : "");
    } else {
      el.textContent = msgToRecipients.length ? msgToRecipients.length + " recipients" : "";
      el.className = "mf-limit";
    }
  }
  function renderToDropdown(query) {
    const dd = document.getElementById("msgToDropdown");
    if (!dd) return;
    // "All Users" = staff table only — guests are never included
    let staffList = S.list("staff").filter((u) => u.active && u.id !== session.id);
    if (query) {
      const q = query.toLowerCase();
      staffList = staffList.filter((u) =>
        u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
      );
    }
    const selectedIds = msgToRecipients.map((r) => r.id);
    staffList = staffList.filter((u) => !selectedIds.includes(u.id));
    dd.innerHTML = "";
    let hasItems = false;
    if (isAdmin() && !msgToAllSelected && !query) {
      const item = document.createElement("div");
      item.className = "msg-to-dropdown-item";
      item.innerHTML =
        '<div class="mdi-avatar" style="background:linear-gradient(135deg,var(--gold),#e8a800);color:var(--teal-deep)">🌐</div>' +
        '<span class="mdi-name">Everyone</span>' +
        '<span class="mdi-role">All Staff</span>';
      item.addEventListener("click", () => {
        msgToAllSelected = true; msgToRecipients = [];
        document.getElementById("msgToInput").value = "";
        renderToTags(); hideToDropdown();
      });
      dd.appendChild(item); hasItems = true;
    }
    staffList.forEach((u) => {
      const item = document.createElement("div");
      item.className = "msg-to-dropdown-item";
      item.innerHTML =
        '<div class="mdi-avatar">' + makeAvatarHtml(u.name, u.id) + "</div>" +
        '<span class="mdi-name">' + esc(u.name) + "</span>" +
        '<span class="mdi-role">' + esc(u.role) + "</span>";
      item.addEventListener("click", () => {
        if (!isAdmin() && msgToRecipients.length >= 10) {
          U.toast("Maximum 10 recipients for staff.", "error"); return;
        }
        msgToRecipients.push({ id: u.id, name: u.name });
        document.getElementById("msgToInput").value = "";
        renderToTags(); hideToDropdown();
      });
      dd.appendChild(item); hasItems = true;
    });
    dd.style.display = hasItems ? "block" : "none";
  }
  function sendMessage() {
    const subject = document.getElementById("msgSubjectInput").value.trim();
    const body = document.getElementById("msgBodyInput").value.trim();
    if (!msgToAllSelected && msgToRecipients.length === 0) {
      U.toast("Please add at least one recipient.", "error"); return;
    }
    if (!subject) { U.toast("Please add a subject.", "error"); return; }
    if (!body) { U.toast("Please write a message.", "error"); return; }
    const msg = {
      fromId: session.id, fromName: session.name, fromRole: session.role,
      subject, body, lang: I.getLang(),
      to: msgToAllSelected ? "all" : msgToRecipients.map((r) => r.id),
      toNames: msgToAllSelected ? "Everyone" : msgToRecipients.map((r) => r.name),
      readBy: [session.id]
    };
    S.insert("messages", msg);
    closeCompose();
    U.toast("Message sent!", "success");
    if (panel === "messages") { msgView = "sent"; renderMessages(); }
  }

  /* ====================  SITE EDITOR (admin)  ==================== */
  function renderSite() {
    if (!isAdmin()) return;
    if (!edLang) edLang = I.getLang();
    renderGuideState();
    renderEditLang();
    renderContentGroups();
    renderImages();
    renderColors();
    renderAnnouncements();
    renderSectionToggles();
  }

  /* ---- tutorial guide show/hide (persisted) ---- */
  function renderGuideState() {
    const body = document.getElementById("guideBody");
    const btn = document.getElementById("guideToggle");
    if (!body || !btn) return;
    const hidden = localStorage.getItem(GUIDE_HIDDEN_KEY) === "1";
    body.style.display = hidden ? "none" : "";
    btn.textContent = t(hidden ? "staff.guide.show" : "staff.guide.hide");
  }
  function toggleGuide() {
    const hidden = localStorage.getItem(GUIDE_HIDDEN_KEY) === "1";
    localStorage.setItem(GUIDE_HIDDEN_KEY, hidden ? "0" : "1");
    renderGuideState();
  }

  /* ---- editing-language selector ---- */
  function renderEditLang() {
    const sel = document.getElementById("edLangSel");
    if (!sel) return;
    sel.innerHTML = "";
    I.SUPPORTED.forEach((l) => {
      const o = document.createElement("option");
      o.value = l;
      o.textContent = I.LANG_NAMES[l] || l;
      if (l === edLang) o.selected = true;
      sel.appendChild(o);
    });
  }

  /* ---- content overrides store helpers ---- */
  function getOverride(lang, key) {
    const c = S.read("content", {}) || {};
    return (c.overrides && c.overrides[lang] && c.overrides[lang][key] != null)
      ? c.overrides[lang][key] : null;
  }
  function setOverride(lang, key, val) {
    const c = S.read("content", {}) || {};
    c.overrides = c.overrides || {};
    c.overrides[lang] = c.overrides[lang] || {};
    const base = I.base(key, lang);
    if (val == null || val === "" || val === base) delete c.overrides[lang][key];
    else c.overrides[lang][key] = val;
    if (c.overrides[lang] && !Object.keys(c.overrides[lang]).length) delete c.overrides[lang];
    if (c.overrides && !Object.keys(c.overrides).length) delete c.overrides;
    S.write("content", c);
  }

  /* ---- the big grouped, searchable text editor ---- */
  function renderContentGroups() {
    const wrap = document.getElementById("edContentGroups");
    if (!wrap) return;
    wrap.innerHTML = "";
    const q = edSearchQ.trim().toLowerCase();
    const allKeys = I.allKeys();
    let anyShown = false;

    EDIT_GROUPS.forEach((group, gi) => {
      const keys = allKeys.filter((k) => group.prefixes.some((p) => k.indexOf(p) === 0));
      // build matching field rows for this group
      const rows = [];
      keys.forEach((key) => {
        const base = I.base(key, edLang);
        const ov = getOverride(edLang, key);
        const cur = ov != null ? ov : base;
        if (q && key.toLowerCase().indexOf(q) < 0 &&
            String(base).toLowerCase().indexOf(q) < 0 &&
            String(cur).toLowerCase().indexOf(q) < 0) return;
        rows.push({ key: key, base: base, cur: cur, overridden: ov != null });
      });
      if (!rows.length) return;
      anyShown = true;

      const det = document.createElement("details");
      det.className = "ed-group";
      if (q) det.open = true; // expand groups while searching
      const sum = document.createElement("summary");
      sum.innerHTML = '<span class="ed-grp-title"></span><span class="ed-grp-count">' + rows.length + "</span>";
      sum.querySelector(".ed-grp-title").textContent = t(group.title);
      det.appendChild(sum);

      rows.forEach((r) => det.appendChild(buildFieldRow(r)));
      wrap.appendChild(det);
    });

    const none = document.getElementById("edNoMatch");
    if (none) none.hidden = anyShown;
  }

  function buildFieldRow(r) {
    const row = document.createElement("div");
    row.className = "ed-field" + (r.overridden ? " is-edited" : "");

    const head = document.createElement("div");
    head.className = "ed-field-head";
    const keyEl = document.createElement("code");
    keyEl.className = "ed-field-key";
    keyEl.textContent = r.key;
    const status = document.createElement("span");
    status.className = "ed-field-status";
    head.appendChild(keyEl);
    head.appendChild(status);
    row.appendChild(head);

    const multiline = String(r.base).length > 70 || /\n/.test(String(r.base));
    const input = document.createElement(multiline ? "textarea" : "input");
    if (!multiline) input.type = "text";
    input.className = "ed-field-input";
    input.value = r.cur;
    if (multiline) input.rows = Math.min(6, Math.max(2, Math.ceil(String(r.cur).length / 60)));
    row.appendChild(input);

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "ed-field-reset";
    reset.textContent = t("staff.site.revert");
    reset.style.display = r.overridden ? "" : "none";
    row.appendChild(reset);

    function flashSaved() {
      status.textContent = t("staff.site.savedField");
      status.className = "ed-field-status saved";
      setTimeout(() => { status.textContent = ""; status.className = "ed-field-status"; }, 1600);
    }
    function commit(val) {
      setOverride(edLang, r.key, val);
      const nowOverridden = getOverride(edLang, r.key) != null;
      row.classList.toggle("is-edited", nowOverridden);
      reset.style.display = nowOverridden ? "" : "none";
      flashSaved();
    }
    input.addEventListener("change", () => commit(input.value));
    reset.addEventListener("click", () => {
      input.value = I.base(r.key, edLang);
      commit(input.value);
    });
    return row;
  }

  /* ---- image slots ---- */
  function setImage(key, val) {
    const c = S.read("content", {}) || {};
    c.images = c.images || {};
    if (val) c.images[key] = val; else delete c.images[key];
    if (key === "heroImg") delete c.heroImg; // supersede legacy field
    if (!Object.keys(c.images).length) delete c.images;
    S.write("content", c);
  }
  function currentImage(key) {
    const c = S.read("content", {}) || {};
    return (c.images && c.images[key]) || (key === "heroImg" ? c.heroImg : null) || null;
  }
  function renderImages() {
    const wrap = document.getElementById("edImages");
    if (!wrap) return;
    wrap.innerHTML = "";
    IMAGE_SLOTS.forEach((slot) => {
      const cur = currentImage(slot.key);
      const card = document.createElement("div");
      card.className = "ed-img";
      const thumb = document.createElement("div");
      thumb.className = "ed-img-thumb";
      if (cur) { const im = document.createElement("img"); im.src = cur; thumb.appendChild(im); }
      else thumb.classList.add("empty");

      const body = document.createElement("div");
      body.className = "ed-img-body";
      const lab = document.createElement("label");
      lab.className = "ed-img-label";
      lab.textContent = t(slot.label);
      body.appendChild(lab);

      const urlInput = document.createElement("input");
      urlInput.type = "text";
      urlInput.className = "ed-img-url";
      urlInput.placeholder = t("staff.site.urlPh");
      urlInput.value = cur && cur.indexOf("data:") !== 0 ? cur : "";
      urlInput.addEventListener("change", () => {
        setImage(slot.key, urlInput.value.trim());
        renderImages();
        U.toast(t("staff.site.saved"), "success");
      });

      const actions = document.createElement("div");
      actions.className = "ed-img-actions";
      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "btn btn-ghost dark ed-img-upload";
      upBtn.textContent = t("staff.site.upload");
      const file = document.createElement("input");
      file.type = "file"; file.accept = "image/*"; file.style.display = "none";
      upBtn.addEventListener("click", () => file.click());
      file.addEventListener("change", () => {
        const f = file.files[0];
        if (!f) return;
        if (f.size > 2 * 1024 * 1024) { U.toast(t("staff.site.imgTooBig"), "error"); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
          setImage(slot.key, e.target.result);
          renderImages();
          U.toast(t("staff.site.saved"), "success");
        };
        reader.readAsDataURL(f);
        file.value = "";
      });
      const rmBtn = document.createElement("button");
      rmBtn.type = "button";
      rmBtn.className = "ed-field-reset";
      rmBtn.textContent = t("staff.site.revert");
      rmBtn.style.display = cur ? "" : "none";
      rmBtn.addEventListener("click", () => { setImage(slot.key, null); renderImages(); });

      actions.appendChild(upBtn);
      actions.appendChild(rmBtn);
      body.appendChild(urlInput);
      body.appendChild(actions);
      body.appendChild(file);

      card.appendChild(thumb);
      card.appendChild(body);
      wrap.appendChild(card);
    });
  }

  /* ---- theme colours ---- */
  function renderColors() {
    const wrap = document.getElementById("edColors");
    if (!wrap) return;
    const c = S.read("content", {}) || {};
    const theme = c.theme || {};
    wrap.innerHTML = "";
    THEME_COLORS.forEach((col) => {
      const row = document.createElement("label");
      row.className = "ed-color";
      const swatch = document.createElement("input");
      swatch.type = "color";
      swatch.value = theme[col.key] || col.def;
      // "change" (not "input") fires once the colour is committed, so we don't
      // flood the store with writes while the user drags the picker.
      swatch.addEventListener("change", () => {
        const cc = S.read("content", {}) || {};
        cc.theme = cc.theme || {};
        cc.theme[col.key] = swatch.value;
        S.write("content", cc);
        U.toast(t("staff.site.saved"), "success");
      });
      const span = document.createElement("span");
      span.textContent = t(col.label);
      row.appendChild(swatch);
      row.appendChild(span);
      wrap.appendChild(row);
    });
  }
  function resetTheme() {
    const c = S.read("content", {}) || {};
    delete c.theme;
    S.write("content", c);
    renderColors();
    U.toast(t("staff.site.saved"), "success");
  }

  /* ---- announcements ---- */
  function renderAnnouncements() {
    const annList = document.getElementById("annEditList");
    if (!annList) return;
    const anns = S.list("announcements").slice().sort((a, b) => b.createdAt - a.createdAt);
    if (!anns.length) { annList.innerHTML = '<p class="muted">' + esc(t("staff.site.annEmpty")) + "</p>"; return; }
    annList.innerHTML = "";
    anns.forEach((a) => {
      const row = document.createElement("div");
      row.className = "ann-edit-row";
      row.innerHTML = '<span class="ae-text"></span><button type="button"></button>';
      row.querySelector(".ae-text").textContent = a.text;
      row.querySelector("button").textContent = t("common.delete");
      row.querySelector("button").addEventListener("click", () => { S.remove("announcements", a.id); renderAnnouncements(); });
      annList.appendChild(row);
    });
  }

  /* ---- show / hide sections ---- */
  function renderSectionToggles() {
    const togWrap = document.getElementById("sectionToggles");
    if (!togWrap) return;
    const c = S.read("content", {}) || {};
    const hidden = c.hidden || {};
    togWrap.innerHTML = "";
    SECTIONS.forEach((s) => {
      const id = "tog_" + s.id;
      const lab = document.createElement("label");
      lab.innerHTML = '<input type="checkbox" id="' + id + '"' + (hidden[s.id] ? "" : " checked") + " /> ";
      lab.appendChild(document.createTextNode(t(s.label)));
      lab.querySelector("input").addEventListener("change", (e) => {
        const cc = S.read("content", {}) || {};
        cc.hidden = cc.hidden || {};
        cc.hidden[s.id] = !e.target.checked;
        S.write("content", cc);
      });
      togWrap.appendChild(lab);
    });
  }

  /* ---- undo every content edit (keeps demo data) ---- */
  function resetEdits() {
    if (!confirm(t("staff.site.resetEditsConfirm"))) return;
    const c = S.read("content", {}) || {};
    delete c.overrides; delete c.images; delete c.theme;
    delete c.heroImg; delete c.heroTitle; delete c.heroLede;
    S.write("content", c);
    edSearchQ = "";
    const search = document.getElementById("edSearch");
    if (search) search.value = "";
    renderSite();
    U.toast(t("staff.site.resetEditsDone"), "success");
  }

  /* ====================  STAFF MANAGEMENT (admin)  ==================== */
  function renderTeam() {
    if (!isAdmin()) return;
    const wrap = document.getElementById("teamList");
    wrap.innerHTML = "";
    S.list("staff").forEach((u) => {
      const row = document.createElement("div");
      row.className = "team-row";
      const isMe = u.id === session.id;
      row.innerHTML =
        '<span class="tr-name">' + esc(u.name) + "</span>" +
        '<span class="tr-role ' + (u.role === "admin" ? "admin" : "staff") + '">' + esc(t(u.role === "admin" ? "staff.role.admin" : "staff.role.staff")) + "</span>" +
        '<span class="tr-status ' + (u.active ? "active" : "suspended") + '">' + esc(t(u.active ? "staff.team.active" : "staff.team.suspended")) + "</span>" +
        '<span class="tr-spacer"></span>';
      if (isMe) {
        row.innerHTML += '<span class="you-tag">(' + esc(t("staff.team.you")) + ")</span>";
      } else {
        const toggleLabel = u.active ? t("staff.team.suspend") : t("staff.team.activate");
        row.innerHTML +=
          '<button class="' + (u.active ? "" : "btn-activate") + '" data-act="toggle">' + esc(toggleLabel) + "</button>" +
          '<button data-act="remove">' + esc(t("staff.team.remove")) + "</button>";
      }
      const tg = row.querySelector('[data-act="toggle"]');
      const rm = row.querySelector('[data-act="remove"]');
      if (tg) tg.addEventListener("click", () => S.update("staff", u.id, { active: !u.active }));
      if (rm) rm.addEventListener("click", () => S.remove("staff", u.id));
      wrap.appendChild(row);
    });
  }

  function addStaff(e) {
    e.preventDefault();
    const err = document.getElementById("teamError");
    err.textContent = "";
    const name = document.getElementById("tmName").value.trim();
    const user = document.getElementById("tmUser").value.trim();
    const pass = document.getElementById("tmPass").value;
    const role = document.getElementById("tmRole").value;
    if (!name || !user || !pass) { err.textContent = "—"; return; }
    if (S.list("staff").some((x) => x.username.toLowerCase() === user.toLowerCase())) {
      err.textContent = t("staff.login.error"); return;
    }
    S.insert("staff", { name: name, username: user, password: pass, role: role, active: true });
    document.getElementById("teamForm").reset();
    U.toast(t("staff.site.saved"), "success");
  }

  /* ====================  BADGES + NOTIFICATIONS  ==================== */
  function updateBadges() {
    const pending = S.list("requests").filter((r) => r.status === "pending").length;
    const chatUnread = S.list("chats").filter((c) => c.unreadForStaff > 0).length;
    const msgUnread = session ? getMsgUnreadCount().total : 0;
    setCount("countRequests", pending);
    setCount("countChat", chatUnread);
    setCount("countMessages", msgUnread);
    const total = pending + chatUnread + msgUnread;
    document.title = (total ? "(" + total + ") " : "") + "Staff Console · J Park Hotel";
  }
  function setCount(id, n) {
    const el = document.getElementById(id);
    if (!el) return;
    if (n > 0) { el.textContent = n; el.classList.add("show"); } else el.classList.remove("show");
  }

  function requestNotifyPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      try { Notification.requestPermission(); } catch (_) {}
    }
  }
  function notify(msg) {
    U.toast(msg);
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification("J Park Hotel", { body: msg }); } catch (_) {}
    }
  }

  /* ====================  REAL-TIME WIRING  ==================== */
  function onRequestsChange() {
    if (seenReq) {
      S.list("requests").forEach((r) => {
        if (!seenReq.has(r.id)) {
          seenReq.add(r.id);
          if (r.status === "pending") {
            notify(t("staff.notif.request") + " · " + t("staff.requests.room") + " " + r.room + ": " + reqTitle(r));
          }
        }
      });
    }
    if (panel === "requests") renderRequests();
    updateBadges();
  }
  function onChatsChange() {
    const u = totalChatUnread();
    if (u > lastChatUnread) notify(t("staff.notif.chat"));
    lastChatUnread = u;
    if (panel === "chat") renderChat();
    updateBadges();
  }
  function onBookingsChange() {
    if (seenBookings) {
      S.list("guestBookings").forEach((b) => {
        if (!seenBookings.has(b.id)) {
          seenBookings.add(b.id);
          notify(t("staff.notif.booking") + " · " + (b.channelName || "") + " · " + (b.guestName || ""));
        }
      });
    }
    if (panel === "messages") renderMessages();
    updateBadges();
  }
  function onStaffChange() {
    // if our own account was suspended/removed elsewhere, log out
    if (!validSession(session)) { setSession(null); if (J.authToken) J.authToken.clear(); showLogin(); return; }
    if (panel === "team") renderTeam();
  }

  /* ====================  LANGUAGE  ==================== */
  function populateLangSelects() {
    [document.getElementById("staffLang"), document.getElementById("staffLangLogin")].forEach((sel) => {
      if (!sel) return;
      sel.innerHTML = "";
      I.SUPPORTED.forEach((l) => {
        const o = document.createElement("option");
        o.value = l; o.textContent = I.LANG_NAMES[l];
        sel.appendChild(o);
      });
      sel.value = I.getLang();
      sel.addEventListener("change", () => I.applyLang(sel.value));
    });
  }

  /* ====================  INIT  ==================== */
  document.addEventListener("DOMContentLoaded", () => {
    populateLangSelects();

    // login form
    document.getElementById("loginForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const err = document.getElementById("loginError");
      const res = login(document.getElementById("loginUser").value, document.getElementById("loginPass").value);
      if (res.error) { err.textContent = res.error; return; }
      err.textContent = "";
      setSession(res.user);
      // Mint the bearer token (carries the role + admin permission) before the
      // dashboard mounts any component that calls the API. Falls through even
      // if minting somehow fails so login is never blocked.
      Promise.resolve(J.authToken && J.authToken.mint(res.user)).catch(function () {}).then(showDash);
    });

    // nav
    document.querySelectorAll(".nav-item").forEach((b) =>
      b.addEventListener("click", () => selectPanel(b.dataset.panel)));

    document.getElementById("dsSignout").addEventListener("click", () => { setSession(null); if (J.authToken) J.authToken.clear(); showLogin(); });

    // avatar change
    const avatarWrap = document.getElementById("dsAvatarWrap");
    const avatarInput = document.getElementById("avatarInput");
    if (avatarWrap && avatarInput) {
      avatarWrap.addEventListener("click", () => avatarInput.click());
      avatarInput.addEventListener("change", () => {
        const file = avatarInput.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          U.toast("Image too large — please use a file under 2 MB.", "error");
          avatarInput.value = "";
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          avatarInput.value = "";
          try {
            setAvatarDataUrl(session.id, e.target.result);
          } catch (_) {
            U.toast("Could not save photo — storage full.", "error");
            return;
          }
          renderAvatarInSidebar();
          U.toast("Profile photo updated!", "success");
          if (panel === "messages") renderMessages();
        };
        reader.onerror = () => {
          avatarInput.value = "";
          U.toast("Failed to read image. Please try again.", "error");
        };
        reader.readAsDataURL(file);
      });
    }

    // messages compose
    document.getElementById("msgComposeBtn").addEventListener("click", openCompose);
    document.getElementById("msgComposeClose").addEventListener("click", closeCompose);
    document.getElementById("msgDiscardBtn").addEventListener("click", closeCompose);
    document.getElementById("msgSendBtn").addEventListener("click", sendMessage);

    // messages sidebar nav
    document.querySelectorAll("#msgSidebar .msg-nav-item").forEach((b) => {
      b.addEventListener("click", () => { msgView = b.dataset.view; msgDetailId = null; renderMessages(); });
    });

    // compose to: input
    const toInput = document.getElementById("msgToInput");
    if (toInput) {
      toInput.addEventListener("input", () => renderToDropdown(toInput.value));
      toInput.addEventListener("focus", () => renderToDropdown(toInput.value));
      toInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") hideToDropdown();
      });
    }
    document.addEventListener("click", (e) => {
      const dd = document.getElementById("msgToDropdown");
      const row = document.getElementById("msgToRow");
      if (dd && row && !row.contains(e.target)) hideToDropdown();
    });

    // site editor handlers
    document.getElementById("guideToggle").addEventListener("click", toggleGuide);
    document.getElementById("edLangSel").addEventListener("change", (e) => {
      edLang = e.target.value;
      renderContentGroups();
    });
    document.getElementById("edSearch").addEventListener("input", (e) => {
      edSearchQ = e.target.value;
      renderContentGroups();
    });
    document.getElementById("edResetTheme").addEventListener("click", resetTheme);
    document.getElementById("edResetEdits").addEventListener("click", resetEdits);
    document.getElementById("annForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const inp = document.getElementById("annInput");
      const text = inp.value.trim();
      if (!text) return;
      S.insert("announcements", { text: text, active: true });
      inp.value = "";
      renderAnnouncements();
    });
    document.getElementById("edResetAll").addEventListener("click", () => {
      if (!confirm("Reset all demo data? This clears requests, chats, messages and content.")) return;
      S.resetAll();
      if (!validSession(session)) { setSession(null); showLogin(); return; }
      seenReq = new Set(S.list("requests").map((r) => r.id));
      seenBookings = new Set(S.list("guestBookings").map((b) => b.id));
      renderPanel();
      updateBadges();
      U.toast(t("staff.site.saved"), "success");
    });

    // staff management
    document.getElementById("teamForm").addEventListener("submit", addStaff);

    // real-time subscriptions
    S.on("requests", onRequestsChange);
    S.on("chats", onChatsChange);
    S.on("messages", () => { updateBadges(); if (panel === "messages") renderMessages(); });
    S.on("guestBookings", onBookingsChange);
    S.on("staff", onStaffChange);
    S.on("announcements", () => { if (panel === "site") renderAnnouncements(); });
    // The editor saves overrides in place (keeps focus/scroll), so we don't
    // re-render the whole panel on every content write.

    // re-render on language change
    document.addEventListener("jpark:langchange", () => {
      [document.getElementById("staffLang"), document.getElementById("staffLangLogin")].forEach((s) => { if (s) s.value = I.getLang(); });
      if (session) {
        document.getElementById("dsUserRole").textContent = t(isAdmin() ? "staff.role.admin" : "staff.role.staff");
        document.getElementById("dsRoleLabel").textContent = t(isAdmin() ? "staff.role.admin" : "staff.role.staff");
        renderPanel();
        updateBadges();
        renderAvatarInSidebar();
      }
    });

    // open requested panel from hash (e.g. staff.html#site)
    const hash = (location.hash || "").replace("#", "");
    if (["requests", "chat", "messages", "company", "roster", "site", "team"].includes(hash)) {
      panel = hash === "company" ? "messages" : hash;
    }

    // boot
    session = validSession(getSession());
    if (session) {
      // Restore (or re-mint) the bearer token for an already-signed-in session.
      if (J.authToken && !J.authToken.get()) Promise.resolve(J.authToken.mint(session)).catch(function () {}).then(showDash);
      else showDash();
    } else showLogin();
  });
})();
