/* ============================================================
   J Park Hotel — staff & admin console
   Login (Staff / Admin roles), guest-request board, live chat
   replies, internal company messages, and admin-only site
   editing + staff moderation. Real-time across tabs.
   ============================================================ */
(function () {
  "use strict";
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

  let session = null;
  let panel = "requests";
  let reqFilter = "all";
  let selectedThread = null;
  let seenReq = null;
  let lastChatUnread = 0;

  // Messages state
  let msgView = "inbox";
  let msgDetailId = null;
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
    else if (panel === "site") renderSite();
    else if (panel === "team") renderTeam();
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
    conv.messages.forEach((m) => {
      const div = document.createElement("div");
      div.className = "msg " + m.from;
      if (m.from === "system") { div.textContent = m.text; }
      else {
        div.innerHTML = '<span class="msg-from">' +
          esc(m.from === "guest" ? (conv.guestName || t("chat.you")) : m.from === "staff" ? (m.staffName || t("chat.staff")) : t("chat.bot")) + "</span>";
        const span = document.createElement("span"); span.textContent = m.text; div.appendChild(span);
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
  function getMsgUnreadCount() {
    const inboxUnread = getInboxMsgs().filter(isUnread).length;
    const annUnread = getAnnouncementMsgs().filter((m) => m.fromId !== session.id && isUnread(m)).length;
    return { inboxUnread, annUnread, total: inboxUnread + annUnread };
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

  function renderMessages() {
    const counts = getMsgUnreadCount();
    const inboxBadge = document.getElementById("msgInboxBadge");
    const annBadge = document.getElementById("msgAnnBadge");
    if (inboxBadge) {
      inboxBadge.textContent = counts.inboxUnread || "";
      inboxBadge.style.display = counts.inboxUnread ? "" : "none";
    }
    if (annBadge) {
      annBadge.textContent = counts.annUnread || "";
      annBadge.style.display = counts.annUnread ? "" : "none";
    }
    document.querySelectorAll("#msgSidebar .msg-nav-item").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === msgView);
    });
    const listArea = document.getElementById("msgListArea");
    const detailArea = document.getElementById("msgDetail");
    if (msgView === "detail" && msgDetailId) {
      listArea.classList.add("hidden");
      detailArea.classList.add("show");
      renderMsgDetail(msgDetailId);
    } else {
      listArea.classList.remove("hidden");
      detailArea.classList.remove("show");
      detailArea.innerHTML = "";
      renderMsgList();
    }
  }

  function renderMsgList() {
    const listArea = document.getElementById("msgListArea");
    let msgs = [];
    let headerText = "Inbox";
    if (msgView === "inbox") { msgs = getInboxMsgs(); headerText = "Inbox"; }
    else if (msgView === "sent") { msgs = getSentMsgs(); headerText = "Sent"; }
    else if (msgView === "announcements") { msgs = getAnnouncementMsgs(); headerText = "Announcements"; }

    const countLabel = msgs.length ? '<span class="mlh-count">' + msgs.length + "</span>" : "";
    listArea.innerHTML = '<div class="msg-list-header">' + esc(headerText) + countLabel + "</div>";

    if (!msgs.length) {
      const icons = { inbox: "📥", sent: "📤", announcements: "📢" };
      listArea.innerHTML +=
        '<div class="msg-empty">' +
        '<div class="me-ico">' + (icons[msgView] || "✉️") + "</div>" +
        '<div class="me-title">Nothing here yet</div>' +
        '<div class="me-sub">' + (msgView === "inbox" ? "Messages sent to you will appear here." :
          msgView === "sent" ? "Your sent messages will appear here." :
          "Company announcements from administrators will appear here.") + "</div>" +
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
      row.addEventListener("click", () => {
        msgPrevView = msgView;
        msgDetailId = m.id;
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
      '<div class="msg-detail-subject">' + esc(m.subject || "(no subject)") + "</div>" +
      '<div class="msg-detail-meta">' +
        '<div class="' + avatarClass + '">' + makeAvatarHtml(m.fromName, m.fromId) + "</div>" +
        '<div class="mda-info">' +
          '<div class="mda-from">' + esc(m.fromName) +
            ' <span class="mda-email">&lt;' + esc(emailAlias) + "&gt;</span></div>" +
          '<div class="mda-to">to <b>' + esc(toLabel) + "</b></div>" +
        "</div>" +
        '<div class="mda-time">' + esc(new Date(m.createdAt).toLocaleString()) + "</div>" +
      "</div>" +
      '<div class="msg-detail-body">' + esc(m.body || "") + "</div>";

    document.getElementById("msgDetailBack").addEventListener("click", () => {
      msgView = msgPrevView;
      msgDetailId = null;
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
      subject, body,
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
    const c = S.read("content", {}) || {};
    document.getElementById("edHeroTitle").value = c.heroTitle || "";
    document.getElementById("edHeroLede").value = c.heroLede || "";
    document.getElementById("edHeroImg").value = c.heroImg || "";

    // announcements
    const annList = document.getElementById("annEditList");
    const anns = S.list("announcements").slice().sort((a, b) => b.createdAt - a.createdAt);
    if (!anns.length) annList.innerHTML = '<p class="muted">' + esc(t("staff.site.annEmpty")) + "</p>";
    else {
      annList.innerHTML = "";
      anns.forEach((a) => {
        const row = document.createElement("div");
        row.className = "ann-edit-row";
        row.innerHTML = '<span class="ae-text"></span><button type="button" data-i18n="common.delete">Delete</button>';
        row.querySelector(".ae-text").textContent = a.text;
        row.querySelector("button").textContent = t("common.delete");
        row.querySelector("button").addEventListener("click", () => { S.remove("announcements", a.id); renderSite(); });
        annList.appendChild(row);
      });
    }

    // section toggles
    const togWrap = document.getElementById("sectionToggles");
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

  function saveHero() {
    const c = S.read("content", {}) || {};
    const tt = document.getElementById("edHeroTitle").value.trim();
    const ll = document.getElementById("edHeroLede").value.trim();
    const ii = document.getElementById("edHeroImg").value.trim();
    if (tt) c.heroTitle = tt; else delete c.heroTitle;
    if (ll) c.heroLede = ll; else delete c.heroLede;
    if (ii) c.heroImg = ii; else delete c.heroImg;
    S.write("content", c);
    U.toast(t("staff.site.saved"), "success");
  }

  function resetHero() {
    const c = S.read("content", {}) || {};
    delete c.heroTitle; delete c.heroLede; delete c.heroImg;
    S.write("content", c);
    renderSite();
    U.toast(t("staff.site.saved"), "success");
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
  function onStaffChange() {
    // if our own account was suspended/removed elsewhere, log out
    if (!validSession(session)) { setSession(null); showLogin(); return; }
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
      showDash();
    });

    // nav
    document.querySelectorAll(".nav-item").forEach((b) =>
      b.addEventListener("click", () => selectPanel(b.dataset.panel)));

    document.getElementById("dsSignout").addEventListener("click", () => { setSession(null); showLogin(); });

    // avatar change
    const avatarWrap = document.getElementById("dsAvatarWrap");
    const avatarInput = document.getElementById("avatarInput");
    if (avatarWrap && avatarInput) {
      avatarWrap.addEventListener("click", () => avatarInput.click());
      avatarInput.addEventListener("change", () => {
        const file = avatarInput.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          U.toast("Image too large — please use a file under 2 MB.", "error"); return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          setAvatarDataUrl(session.id, e.target.result);
          renderAvatarInSidebar();
          U.toast("Profile photo updated!", "success");
          if (panel === "messages") renderMessages();
        };
        reader.readAsDataURL(file);
        avatarInput.value = "";
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
    document.getElementById("edSaveHero").addEventListener("click", saveHero);
    document.getElementById("edResetHero").addEventListener("click", resetHero);
    document.getElementById("annForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const inp = document.getElementById("annInput");
      const text = inp.value.trim();
      if (!text) return;
      S.insert("announcements", { text: text, active: true });
      inp.value = "";
      renderSite();
    });
    document.getElementById("edResetAll").addEventListener("click", () => {
      if (!confirm("Reset all demo data? This clears requests, chats, messages and content.")) return;
      S.resetAll();
      if (!validSession(session)) { setSession(null); showLogin(); return; }
      seenReq = new Set(S.list("requests").map((r) => r.id));
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
    S.on("staff", onStaffChange);
    S.on("announcements", () => { if (panel === "site") renderSite(); });
    S.on("content", () => { if (panel === "site") renderSite(); });

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
    if (["requests", "chat", "messages", "company", "site", "team"].includes(hash)) {
      panel = hash === "company" ? "messages" : hash;
    }

    // boot
    session = validSession(getSession());
    if (session) showDash(); else showLogin();
  });
})();
