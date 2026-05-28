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
  const MED = window.JPark.media;
  const t = (k) => I.t(k);
  const esc = U.escapeHtml;

  const SESSION_KEY = "jpark.staff";
  const DEFAULT_STAFF_PASSWORD = "jparkhotel";
  let nsUserId = null; // staff id mid-way through first-time password setup
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
  // Each group also names the public section it lives in (for "View on site")
  // and a media set whose first photo is shown as the group's thumbnail.
  const EDIT_GROUPS = [
    { title: "staff.site.grpBrand",    prefixes: ["brand.", "nav."],                          section: "home",       thumb: "hero" },
    { title: "staff.site.grpHero",     prefixes: ["hero."],                                    section: "home",       thumb: "hero" },
    { title: "nav.about",              prefixes: ["about."],                                   section: "about",      thumb: "aboutMain" },
    { title: "nav.rooms",              prefixes: ["rooms."],                                   section: "rooms",      thumb: "room:Standard Single" },
    { title: "nav.facilities",         prefixes: ["fac."],                                     section: "facilities", thumb: "pool" },
    { title: "nav.dining",             prefixes: ["dining.", "menu."],                         section: "dining",     thumb: "tsubaki" },
    { title: "nav.coffee",             prefixes: ["coffee."],                                  section: "coffee",     thumb: "coffee" },
    { title: "nav.gallery",            prefixes: ["gallery."],                                 section: "gallery",    thumb: "hotel" },
    { title: "staff.site.grpServices", prefixes: ["services.", "matrix.", "rs.", "gate.", "track."], section: "services", thumb: "hotel" },
    { title: "nav.concierge",          prefixes: ["conc."],                                    section: "concierge",  thumb: "hotel" },
    { title: "nav.contact",            prefixes: ["contact."],                                 section: "contact",    thumb: "hotel" },
    { title: "staff.site.grpFooter",   prefixes: ["footer."],                                  section: "contact",    thumb: "hotel" }
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
  let edTab = "text";    // active Site Editor tab
  let selectedThread = null;
  // Live-chat thread bulk-select state
  let chatMultiSelect = false;
  let selectedChatIds = new Set();
  let seenReq = null;
  let seenBookings = null;
  let lastChatUnread = 0;
  let lastSeenChatMsg = {};  // { [guestId]: lastMsg } — tracks what we've already notified/seen per thread

  // Messages state
  let msgView = "inbox";
  let msgDetailId = null;
  let msgDetailKind = "message"; // "message" | "booking"
  let msgPrevView = "inbox";
  let msgToRecipients = [];
  let msgToAllSelected = false;
  let msgMultiSelect = false;
  let selectedMsgIds = new Set();
  let trashPurgedThisSession = false;

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

  /* Local (localStorage) credential check — used as fallback when the API is offline. */
  function loginLocal(username, password) {
    const u = S.list("staff").find((x) => x.username.toLowerCase() === username.trim().toLowerCase());
    if (!u || u.password !== password) return { error: t("staff.login.error") };
    if (!u.active) return { error: t("staff.login.disabled") };
    return { user: { id: u.id, name: u.name, role: u.role, username: u.username }, mustChange: !!u.mustChange, staffId: u.id };
  }

  /* Server-first login: verifies bcrypt password on the backend, which issues a
     signed JWT. Falls back to loginLocal() when the API is unreachable. */
  async function login(username, password) {
    const API = window.JPark && window.JPark.api;
    if (API) {
      const res = await API.post("/api/auth/login", { username, password });
      if (!res.error) {
        // Backend issued a proper JWT — store it and build user from the payload.
        try { localStorage.setItem("jpark.staff.token", res.token); } catch (_) {}
        if (res.must_change_password) {
          return { mustChange: true, staffId: res.user.id, user: res.user };
        }
        return { user: res.user };
      }
      // 404 = auth route not deployed yet; 5xx = server error — fall through to localStorage.
      if (!res.offline && res.status !== 404 && res.status < 500) {
        return { error: res.error || t("staff.login.error") };
      }
    }
    // API offline or auth route unavailable — fall back to localStorage credentials.
    return loginLocal(username, password);
  }

  /* ---- login sub-views (sign in / new staff / forgot password|username) ---- */
  function showAuthView(name) {
    document.querySelectorAll(".auth-card").forEach((c) =>
      c.classList.toggle("show", c.dataset.auth === name));
    document.querySelectorAll(".form-error").forEach((p) => { p.textContent = ""; });
    if (name !== "newStaff") nsUserId = null;
  }
  function nsShowStep(n) {
    const form = document.getElementById("newStaffForm");
    if (!form) return;
    form.querySelectorAll(".auth-step").forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
  }
  // Drop a logged-in user into the first-time "set a new password" step.
  function startPasswordSetup(staffId) {
    nsUserId = staffId;
    showAuthView("newStaff");
    nsShowStep(2);
    const n1 = document.getElementById("nsNew1"), n2 = document.getElementById("nsNew2");
    if (n1) n1.value = ""; if (n2) n2.value = "";
  }
  function completeLogin(userObj) {
    setSession(userObj);
    // If the token was already stored by the server-login path, use it.
    // Otherwise mint a client-side token (offline / legacy flow).
    if (J.authToken && !J.authToken.get()) {
      Promise.resolve(J.authToken.mint(userObj)).catch(function () {}).then(showDash);
    } else {
      showDash();
    }
  }

  /* ── API polling: pull live data from the backend every N seconds ─────── */
  let _pollTimer = null;

  function startApiPolling() {
    stopApiPolling();
    _pollRequests(); _pollChats(); _pollGuestBookings(); _pollMessages();
    _syncStaffList();
    _pollTimer = setInterval(function () {
      _pollRequests(); _pollChats(); _pollGuestBookings(); _pollMessages();
      _syncStaffList();
    }, 6000);
  }
  function stopApiPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  async function _pollRequests() {
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    const data = await API.get("/api/service-requests");
    if (!Array.isArray(data)) return;
    const reqs = data.map(function (r) {
      return {
        id: String(r.id),
        kind: r.kind || "service",
        category: r.type || r.kind,
        titleKey: r.title_key || r.titleKey,
        title: r.title,
        room: r.room_number,
        guestName: r.guest_name || r.guestName,
        guestId: r.guest_id || r.guestId,
        items: r.items || [],
        deliverAt: r.deliver_at || r.deliverAt,
        note: r.note || r.notes,
        total: r.total,
        lang: r.lang || "en",
        status: r.status === "in_progress" ? "progress" : (r.status || "pending"),
        createdAt: r.created_at ? new Date(r.created_at).getTime() : (r.createdAt || 0),
      };
    });
    S.write("requests", reqs);
  }

  async function _pollChats() {
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    const data = await API.get("/api/chat/all");
    if (!Array.isArray(data)) return;
    const local = S.list("chats");
    let dirty = false;
    let reloadSelected = false;
    data.forEach(function (remote) {
      const idx = local.findIndex(function (c) { return c.id === remote.id; });
      if (idx < 0) {
        local.push({
          id: remote.id, guestName: remote.guestName, room: remote.room,
          lang: remote.lang, escalated: remote.escalated,
          assignedStaffId: remote.assignedStaffId,
          assignedStaffName: remote.assignedStaffName,
          unreadForStaff: remote.unreadForStaff, lastMsg: remote.lastMsg,
          lastAt: remote.lastAt, messages: [],
        });
        dirty = true;
      } else if (local[idx].unreadForStaff !== remote.unreadForStaff
              || local[idx].lastMsg !== remote.lastMsg
              || local[idx].assignedStaffId !== remote.assignedStaffId) {
        if (remote.id === selectedThread && local[idx].lastMsg !== remote.lastMsg) {
          reloadSelected = true;
        }
        local[idx] = Object.assign({}, local[idx], {
          unreadForStaff: remote.unreadForStaff, lastMsg: remote.lastMsg,
          lastAt: remote.lastAt, escalated: remote.escalated,
          assignedStaffId: remote.assignedStaffId,
          assignedStaffName: remote.assignedStaffName,
        });
        dirty = true;
      }
    });
    if (dirty) S.write("chats", local);
    if (reloadSelected) _loadThreadMessages(selectedThread);
  }

  async function _pollGuestBookings() {
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    const data = await API.get("/api/guest-bookings");
    if (!Array.isArray(data)) return;
    S.write("guestBookings", data);
  }

  /* ── Internal messages: pull every visible message from the server and
     merge them into the local cache. Per-user UI state (starred, trashedBy,
     trashedAt) is local-only and preserved across syncs; canonical fields
     (subject, body, readBy, reportedBy, recipients) come from the server.
     Server rows live under id = "srv_<serial>"; locally-only rows (seed
     welcome, offline sends) keep their original ids so we don't drop them. */
  function _mapServerMsg(r) {
    return {
      id: "srv_" + r.id,
      fromId: r.from_id,
      fromName: r.from_name,
      fromRole: r.from_role,
      subject: r.subject,
      body: r.body,
      lang: r.lang,
      to: r.to_all ? "all" : (r.to_ids || []),
      toNames: r.to_all ? "Everyone" : (r.to_names || []),
      readBy: r.read_by || [],
      reportedBy: r.reported_by || [],
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    };
  }

  async function _pollMessages() {
    if (!session) return;
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    const data = await API.get("/api/messages");
    if (!Array.isArray(data)) return;
    const local = S.list("messages");
    const personal = new Map();
    local.forEach(function (m) {
      if (typeof m.id === "string" && m.id.indexOf("srv_") === 0) {
        personal.set(m.id, {
          starred: m.starred,
          trashedBy: m.trashedBy,
          trashedAt: m.trashedAt,
        });
      }
    });
    // Server messages the user perma-deleted from their own view stay hidden
    // forever (server doesn't know — delete-forever is a per-user UI action).
    const hidden = new Set(S.list("messages_deleted"));
    const remote = data
      .map(_mapServerMsg)
      .filter(function (m) { return !hidden.has(m.id); })
      .map(function (m) {
        const p = personal.get(m.id);
        return p ? Object.assign({}, m, {
          starred: p.starred,
          trashedBy: p.trashedBy,
          trashedAt: p.trashedAt,
        }) : m;
      });
    const localOnly = local.filter(function (m) {
      return typeof m.id !== "string" || m.id.indexOf("srv_") !== 0;
    });
    const merged = remote.concat(localOnly);
    if (JSON.stringify(merged) !== JSON.stringify(local)) {
      S.write("messages", merged);
    }
  }

  /* Track perma-deleted server ids so the next poll doesn't bring them back. */
  function permaForgetMsg(id) {
    if (typeof id !== "string" || id.indexOf("srv_") !== 0) return;
    const arr = S.list("messages_deleted");
    if (arr.indexOf(id) >= 0) return;
    arr.push(id);
    S.write("messages_deleted", arr);
  }

  /* Lazy-load peer avatars. We only fetch when the local cached version
     doesn't match the directory's `avatar_updated_at`, so the staff list
     stays small and bandwidth is bounded. */
  async function _syncAvatars(staff) {
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    for (let i = 0; i < staff.length; i++) {
      const u = staff[i];
      const remoteV = u.avatar_updated_at || null;
      const localV = S.read("avatar_v_" + u.id, null);
      if (!remoteV) continue;            // no server-side photo set
      if (localV === remoteV) continue;  // already in sync
      try {
        const res = await API.get("/api/auth/avatar/" + encodeURIComponent(u.id));
        if (res && !res.error) {
          if (res.avatar) S.write("avatar_" + u.id, res.avatar);
          else { try { localStorage.removeItem("jpark.db.avatar_" + u.id); } catch (_) {} }
          S.write("avatar_v_" + u.id, remoteV);
        }
      } catch (_) { /* network blip — retry next tick */ }
    }
    // Re-render UI surfaces that show avatars.
    if (session) renderAvatarInSidebar();
    if (panel === "messages") renderMessages();
  }

  /* Load full message list for a chat thread from the API. */
  async function _loadThreadMessages(guestId) {
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    const res = await API.get("/api/chat?guestId=" + encodeURIComponent(guestId));
    if (res.error) return;
    const all = S.list("chats");
    const i = all.findIndex(function (c) { return c.id === guestId; });
    if (i < 0) return;
    all[i] = Object.assign({}, all[i], {
      messages: (res.messages || []).map(function (m) {
        return { id: m.id, from: m.from, text: m.text, staffName: m.fromName, lang: m.lang, ts: m.ts, pinned: !!m.pinned };
      }),
      escalated: res.escalated,
      assignedStaffId: res.assignedStaffId,
      assignedStaffName: res.assignedStaffName,
    });
    S.write("chats", all);
  }

  function showLogin() {
    document.getElementById("loginView").style.display = "grid";
    document.getElementById("dashView").classList.remove("show");
    nsShowStep(1);
    showAuthView("signin");
  }

  function showDash() {
    document.getElementById("loginView").style.display = "none";
    document.getElementById("dashView").classList.add("show");

    document.querySelectorAll(".admin-only").forEach((el) => { el.style.display = isAdmin() ? "" : "none"; });
    // Front-Desk-only surfaces (currently: Live Chat) — admins never see them.
    document.querySelectorAll(".staff-only").forEach((el) => { el.style.display = isAdmin() ? "none" : ""; });
    document.getElementById("dsUserName").textContent = session.name;
    document.getElementById("dsUserRole").textContent = t(isAdmin() ? "staff.role.admin" : "staff.role.staff");
    document.getElementById("dsRoleLabel").textContent = t(isAdmin() ? "staff.role.admin" : "staff.role.staff");

    seenReq = new Set(S.list("requests").map((r) => r.id));
    seenBookings = new Set(S.list("guestBookings").map((b) => b.id));
    lastChatUnread = totalChatUnread();
    lastSeenChatMsg = {};
    myAssignedChats().forEach(function (c) { lastSeenChatMsg[c.id] = c.lastMsg; });

    renderAvatarInSidebar();
    selectPanel(panel);
    updateBadges();
    requestNotifyPermission();
    startApiPolling();
  }

  /* ====================  PANELS  ==================== */
  function selectPanel(name) {
    if ((name === "site" || name === "team") && !isAdmin()) name = "requests";
    if (name === "company") name = "messages"; // redirect legacy hash
    panel = name;
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.panel === name));
    document.querySelectorAll(".dash-panel").forEach((p) => p.classList.toggle("show", p.id === "panel-" + name));
    renderPanel();
    // Opening the messages panel triggers a fresh pull so the user sees any
    // server-side activity that landed since the last 6s poll tick.
    if (name === "messages") _pollMessages();
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
      if (startBtn) startBtn.addEventListener("click", () => updateReqStatus(r.id, "progress"));
      if (doneBtn) doneBtn.addEventListener("click", () => updateReqStatus(r.id, "done"));
      if (reopenBtn) reopenBtn.addEventListener("click", () => updateReqStatus(r.id, "progress"));
      list.appendChild(card);
    });
  }

  function updateReqStatus(id, status) {
    S.update("requests", id, { status: status });
    const API = window.JPark && window.JPark.api;
    if (API) {
      const apiStatus = status === "progress" ? "in_progress" : status;
      API.patch("/api/service-requests/" + id, { status: apiStatus }).catch(function () {});
    }
  }

  /* ====================  LIVE CHAT  ==================== */
  // Per-user unread: only chats currently assigned to the signed-in account
  // contribute to the badge/chime, so admins and other Front-Desk users don't
  // get pinged about threads they aren't handling.
  function myAssignedChats() {
    if (!session) return [];
    return S.list("chats").filter((c) => c.escalated && c.assignedStaffId === session.id);
  }
  function totalChatUnread() {
    return myAssignedChats().reduce((s, c) => s + (c.unreadForStaff || 0), 0);
  }

  function renderChat() {
    const threadsEl = document.getElementById("chatThreads");
    const convEl = document.getElementById("chatConv");
    const chats = S.list("chats").filter((c) => c.escalated).slice().sort((a, b) => b.lastAt - a.lastAt);

    // Prune selectedChatIds against the current visible thread list so a
    // deleted thread doesn't keep its checkbox state.
    const visibleIds = new Set(chats.map((c) => c.id));
    selectedChatIds.forEach((id) => { if (!visibleIds.has(id)) selectedChatIds.delete(id); });

    threadsEl.innerHTML = "";

    // Toolbar: multi-select toggle + bulk-delete (only useful when items exist).
    if (chats.length) {
      const bar = document.createElement("div");
      bar.className = "cc-threads-bar";
      const selBtn = document.createElement("button");
      selBtn.type = "button";
      selBtn.className = "cc-btn" + (chatMultiSelect ? " active" : "");
      selBtn.textContent = chatMultiSelect ? t("staff.chat.cancelSelect") : t("staff.chat.select");
      selBtn.addEventListener("click", () => {
        chatMultiSelect = !chatMultiSelect;
        if (!chatMultiSelect) selectedChatIds.clear();
        renderChat();
      });
      bar.appendChild(selBtn);
      if (chatMultiSelect) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "cc-btn cc-btn-danger";
        delBtn.disabled = !selectedChatIds.size;
        delBtn.textContent = t("staff.chat.deleteSelected") + (selectedChatIds.size ? " (" + selectedChatIds.size + ")" : "");
        delBtn.addEventListener("click", bulkDeleteChats);
        bar.appendChild(delBtn);
      }
      threadsEl.appendChild(bar);
    }

    if (!chats.length) {
      const empty = document.createElement("div");
      empty.style.padding = "18px";
      empty.className = "muted";
      empty.textContent = t("staff.chat.empty");
      threadsEl.appendChild(empty);
    } else {
      chats.forEach((c) => {
        const div = document.createElement("div");
        div.className = "cc-thread" + (selectedThread === c.id ? " active" : "");

        let inner = "";
        if (chatMultiSelect) {
          inner += '<input type="checkbox" class="cct-check"' +
            (selectedChatIds.has(c.id) ? " checked" : "") + ' aria-label="Select thread" />';
        }
        // Show which staff member owns the chat right in the list so anyone
        // browsing knows who's currently responsible — only that account's
        // unread dot lights up (it's filtered by myAssignedChats() above).
        const mine = c.assignedStaffId && session && c.assignedStaffId === session.id;
        const assignedLabel = c.assignedStaffName
          ? (mine ? t("staff.chat.assignedYou") : t("staff.chat.assignedTo").replace("{name}", c.assignedStaffName))
          : t("staff.chat.unassigned");
        inner +=
          '<div class="cct-body">' +
            '<div class="cct-name">' + (mine && c.unreadForStaff ? '<span class="cct-unread"></span>' : "") +
              esc(c.guestName || "Guest") + (c.room ? " · " + esc(t("staff.requests.room")) + " " + esc(c.room) : "") + "</div>" +
            '<div class="cct-last">' + esc(c.lastMsg || "") + "</div>" +
            '<div class="cct-assigned' + (mine ? " mine" : "") + '">' + esc(assignedLabel) + "</div>" +
            '<div class="cct-lang">' + esc((I.LANG_NAMES[c.lang] || c.lang || "")) +
              (c.escalated ? "" : " · " + esc(t("chat.bot"))) + "</div>" +
          "</div>" +
          '<div class="cct-actions">' +
            '<button type="button" class="cct-act cct-rename" title="' + esc(t("staff.chat.rename")) + '" aria-label="' + esc(t("staff.chat.rename")) + '">✎</button>' +
            '<button type="button" class="cct-act cct-delete" title="' + esc(t("staff.chat.delete")) + '" aria-label="' + esc(t("staff.chat.delete")) + '">🗑️</button>' +
          "</div>";
        div.innerHTML = inner;

        // Per-thread action handlers — stopPropagation so they don't open the thread.
        const renameBtn = div.querySelector(".cct-rename");
        const deleteBtn = div.querySelector(".cct-delete");
        if (renameBtn) renameBtn.addEventListener("click", (e) => { e.stopPropagation(); renameChatThread(c); });
        if (deleteBtn) deleteBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteChatThread(c); });

        const checkbox = div.querySelector(".cct-check");
        if (checkbox) {
          checkbox.addEventListener("click", (e) => e.stopPropagation());
          checkbox.addEventListener("change", () => {
            if (checkbox.checked) selectedChatIds.add(c.id); else selectedChatIds.delete(c.id);
            renderChat();
          });
        }

        div.addEventListener("click", () => {
          if (chatMultiSelect) {
            if (selectedChatIds.has(c.id)) selectedChatIds.delete(c.id); else selectedChatIds.add(c.id);
            renderChat();
            return;
          }
          lastSeenChatMsg[c.id] = c.lastMsg;
          selectedThread = c.id; markThreadRead(c.id);
          _loadThreadMessages(c.id).then(() => renderChat());
        });
        threadsEl.appendChild(div);
      });
    }

    const conv = chats.find((c) => c.id === selectedThread);
    if (!conv) {
      convEl.innerHTML = '<div class="cc-conv-empty">' + esc(t("staff.chat.none")) + "</div>";
      return;
    }
    // Only the assigned account can reply. Anyone else sees a read-only
    // banner with "Take over chat" so they can grab the thread when the
    // assignee is on break / off shift.
    const mineConv = conv.assignedStaffId && session && conv.assignedStaffId === session.id;
    const ownerLabel = conv.assignedStaffName
      ? (mineConv ? t("staff.chat.assignedYou") : t("staff.chat.assignedTo").replace("{name}", conv.assignedStaffName))
      : t("staff.chat.unassigned");
    let html =
      '<div class="cc-conv-head"><span class="cch-name">' + esc(conv.guestName || "Guest") +
        (conv.room ? " · " + esc(t("staff.requests.room")) + " " + esc(conv.room) : "") + "</span>" +
        '<span class="cch-owner' + (mineConv ? " mine" : "") + '">' + esc(ownerLabel) + "</span>" +
        '<span class="cch-lang">' + esc(t("staff.chat.guestLang")) + ": " + esc(I.LANG_NAMES[conv.lang] || conv.lang || "") + "</span></div>" +
      '<div class="cc-conv-body" id="ccBody"></div>';
    if (mineConv) {
      html +=
        '<form class="cc-conv-input" id="ccForm"><input type="text" id="ccInput" placeholder="' + esc(t("staff.chat.placeholder")) + '" autocomplete="off" />' +
          '<button type="submit">' + esc(t("common.send")) + "</button></form>";
    } else {
      html +=
        '<div class="cc-conv-takeover">' +
          '<span class="cct-readonly">' + esc(t("staff.chat.readOnly")) + "</span>" +
          '<button type="button" class="cc-takeover-btn" id="ccTakeover">' + esc(t("staff.chat.takeOver")) + "</button>" +
        "</div>";
    }
    convEl.innerHTML = html;

    const bodyEl = document.getElementById("ccBody");
    const cur = I.getLang();
    conv.messages.forEach((m) => {
      const div = document.createElement("div");
      div.className = "msg " + m.from + (m.pinned ? " pinned" : "");
      if (m.from === "system") {
        div.textContent = m.text;
      } else {
        const label = m.from === "guest" ? (conv.guestName || t("chat.you"))
                    : m.from === "staff" ? (m.staffName || t("chat.staff"))
                    : m.from === "bot"   ? t("chat.bot")
                    : t("chat.staff");
        div.innerHTML = '<span class="msg-from">' + esc(label) + "</span>";
        const span = document.createElement("span"); div.appendChild(span);
        if (m.lang && m.lang === cur) span.textContent = m.text;
        else J.translate.fill(span, m.text, div);
      }
      // Pin toggle is available on every persisted message (skip ephemeral
      // ids that never made it to the server — they don't have a numeric id).
      if (typeof m.id === "number" || (typeof m.id === "string" && /^\d+$/.test(m.id))) {
        const pinBtn = document.createElement("button");
        pinBtn.type = "button";
        pinBtn.className = "msg-pin" + (m.pinned ? " is-pinned" : "");
        pinBtn.title = t(m.pinned ? "staff.chat.unpin" : "staff.chat.pin");
        pinBtn.setAttribute("aria-label", pinBtn.title);
        pinBtn.textContent = "📌";
        pinBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          togglePinMessage(conv.id, m.id, !m.pinned);
        });
        div.appendChild(pinBtn);
      }
      bodyEl.appendChild(div);
    });
    bodyEl.scrollTop = bodyEl.scrollHeight;

    const ccForm = document.getElementById("ccForm");
    if (ccForm) {
      ccForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const inp = document.getElementById("ccInput");
        const text = inp.value.trim();
        if (!text) return;
        staffReply(conv.id, text);
        inp.value = "";
      });
    }
    const takeBtn = document.getElementById("ccTakeover");
    if (takeBtn) takeBtn.addEventListener("click", () => takeOverChat(conv));
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
    // Only the assigned account is allowed to type into this thread. If the
    // current user isn't the owner, send them down the take-over path first.
    if (c.assignedStaffId && c.assignedStaffId !== session.id) {
      U.toast(t("staff.chat.notAssigned"), "error");
      return;
    }
    c.escalated = true;
    c.messages.push({ id: S.genId(), from: "staff", text: text, staffName: session.name, ts: Date.now() });
    c.lastMsg = text; c.lastAt = Date.now();
    c.unreadForStaff = 0;
    c.unreadForGuest = (c.unreadForGuest || 0) + 1;
    all[i] = c;
    S.write("chats", all);
    // Persist reply to backend
    const API = window.JPark && window.JPark.api;
    if (API) {
      API.post("/api/chat", {
        guestId: id, guestName: c.guestName, room: c.room,
        from: "staff", fromName: session.name, text: text,
        lang: I.getLang(), escalated: true,
        assignedStaffId: session.id, assignedStaffName: session.name,
      }).catch(function () {});
    }
  }

  /* Reassign a guest chat to the signed-in user (e.g. when the original
     owner is on break). Posts a system message so the guest knows who's
     replying now, then refreshes the thread. */
  async function takeOverChat(conv) {
    if (!conv || !session) return;
    if (conv.assignedStaffId === session.id) return;
    if (!confirm(t("staff.chat.takeOverConfirm").replace("{name}", conv.guestName || "Guest"))) return;
    const API = window.JPark && window.JPark.api;
    if (API) {
      const systemText = t("chat.connectedTo").replace("{name}", session.name);
      const res = await API.patch("/api/chat/" + encodeURIComponent(conv.id) + "/assign", {
        staffId: session.id, staffName: session.name,
        systemText, lang: I.getLang(),
      });
      if (res && res.error && !res.offline) {
        U.toast(t("staff.chat.takeOverFailed") + ": " + res.error, "error");
        return;
      }
    }
    const all = S.list("chats");
    const i = all.findIndex((c) => c.id === conv.id);
    if (i >= 0) {
      all[i] = Object.assign({}, all[i], {
        assignedStaffId: session.id, assignedStaffName: session.name,
      });
      S.write("chats", all);
    }
    U.toast(t("staff.chat.takenOver"), "success");
    await _loadThreadMessages(conv.id);
    renderChat();
  }

  /* Toggle the pin flag on a single chat message. Optimistically updates the
     local cache so the icon flips immediately, then writes the change to the
     server. The next poll tick re-reads the canonical state. */
  async function togglePinMessage(guestId, msgId, pinned) {
    const all = S.list("chats");
    const i = all.findIndex((c) => c.id === guestId);
    if (i < 0) return;
    const msgs = all[i].messages || [];
    const j = msgs.findIndex((m) => String(m.id) === String(msgId));
    if (j < 0) return;
    msgs[j] = Object.assign({}, msgs[j], { pinned });
    all[i] = Object.assign({}, all[i], { messages: msgs });
    S.write("chats", all);
    if (selectedThread === guestId) renderChat();
    const API = window.JPark && window.JPark.api;
    if (API) {
      const res = await API.patch("/api/chat/message/" + encodeURIComponent(msgId) + "/pin", { pinned });
      if (res && res.error && !res.offline) {
        U.toast(t("staff.chat.pinFailed") + ": " + res.error, "error");
      }
    }
  }

  /* Remove a single guest chat thread, locally + on the server. */
  async function deleteChatThread(c) {
    if (!c || !c.id) return;
    if (!confirm(t("staff.chat.confirmDelete").replace("{name}", c.guestName || "Guest"))) return;
    const API = window.JPark && window.JPark.api;
    if (API) {
      const res = await API.del("/api/chat/" + encodeURIComponent(c.id));
      if (res && res.error && !res.offline) {
        U.toast(t("staff.chat.deleteFailed") + ": " + res.error, "error");
        return;
      }
    }
    S.write("chats", S.list("chats").filter((x) => x.id !== c.id));
    selectedChatIds.delete(c.id);
    if (selectedThread === c.id) selectedThread = null;
    U.toast(t("staff.chat.deleted"), "success");
    renderChat();
  }

  /* Rename a guest chat thread. Stamps the new name on every server-side
     message so the next poll picks it up too. */
  async function renameChatThread(c) {
    if (!c || !c.id) return;
    const next = prompt(t("staff.chat.renamePrompt"), c.guestName || "");
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === (c.guestName || "")) return;
    const API = window.JPark && window.JPark.api;
    if (API) {
      const res = await API.patch("/api/chat/" + encodeURIComponent(c.id) + "/rename", { name: trimmed });
      if (res && res.error && !res.offline) {
        U.toast(t("staff.chat.renameFailed") + ": " + res.error, "error");
        return;
      }
    }
    const all = S.list("chats");
    const i = all.findIndex((x) => x.id === c.id);
    if (i >= 0) { all[i] = Object.assign({}, all[i], { guestName: trimmed }); S.write("chats", all); }
    U.toast(t("staff.chat.renamed"), "success");
    renderChat();
  }

  async function bulkDeleteChats() {
    if (!selectedChatIds.size) return;
    const ids = Array.from(selectedChatIds);
    if (!confirm(t("staff.chat.confirmBulkDelete").replace("{n}", ids.length))) return;
    const API = window.JPark && window.JPark.api;
    if (API) {
      const res = await API.post("/api/chat/bulk-delete", { guestIds: ids });
      if (res && res.error && !res.offline) {
        U.toast(t("staff.chat.deleteFailed") + ": " + res.error, "error");
        return;
      }
    }
    const drop = new Set(ids);
    S.write("chats", S.list("chats").filter((x) => !drop.has(x.id)));
    if (selectedThread && drop.has(selectedThread)) selectedThread = null;
    selectedChatIds.clear();
    chatMultiSelect = false;
    U.toast(t("staff.chat.bulkDeleted").replace("{n}", ids.length), "success");
    renderChat();
  }

  /* ====================  PROFILE PICTURE  ==================== */
  function getAvatarDataUrl(userId) {
    return S.read("avatar_" + userId, null);
  }
  // Writes to local cache first for instant feedback, then syncs to the
  // server so every other device / teammate sees it. Returns the API result
  // (or null on local-only write) so callers can show errors.
  async function setAvatarDataUrl(userId, dataUrl) {
    S.write("avatar_" + userId, dataUrl);
    if (!session || userId !== session.id) return null;
    const API = window.JPark && window.JPark.api;
    if (!API) return null;
    const res = await API.post("/api/auth/avatar", { avatar: dataUrl });
    if (res && !res.error && res.avatar_updated_at) {
      S.write("avatar_v_" + userId, res.avatar_updated_at);
    }
    return res;
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
  function getActiveMsgs() {
    if (!session) return [];
    return S.list("messages").filter(function(m) {
      return !(m.trashedBy && m.trashedBy.includes(session.id));
    });
  }
  function getInboxMsgs() {
    return getActiveMsgs().filter((m) =>
      m.fromId !== session.id &&
      Array.isArray(m.to) && m.to.includes(session.id)
    ).sort((a, b) => b.createdAt - a.createdAt);
  }
  function getSentMsgs() {
    return getActiveMsgs().filter((m) => m.fromId === session.id)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  function getAnnouncementMsgs() {
    return getActiveMsgs().filter((m) => m.to === "all")
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
    // Sync to backend
    const API = window.JPark && window.JPark.api;
    if (API) API.patch("/api/guest-bookings/" + id, { userId: session.id }).catch(function () {});
  }

  /* Password / username reset requests filed from the login page. Admin-only. */
  function getResetRequests() {
    return S.list("resetRequests").slice().sort((a, b) => b.createdAt - a.createdAt);
  }
  function getResetUnreadCount() {
    if (!isAdmin()) return 0;
    return getResetRequests().filter((r) => !r.handled).length;
  }

  function getMsgUnreadCount() {
    const inboxUnread = getInboxMsgs().filter(isUnread).length;
    const annUnread = getAnnouncementMsgs().filter((m) => m.fromId !== session.id && isUnread(m)).length;
    const bookingUnread = getBookingUnreadCount();
    const resetUnread = getResetUnreadCount();
    return { inboxUnread, annUnread, bookingUnread, resetUnread, total: inboxUnread + annUnread + bookingUnread + resetUnread };
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
    // Propagate to server so other devices the same user is signed in on,
    // and the sender's "read by" view, stay in sync.
    if (typeof id === "string" && id.indexOf("srv_") === 0) {
      const API = window.JPark && window.JPark.api;
      if (API) API.patch("/api/messages/" + id.slice(4) + "/read", {}).catch(function () {});
    }
  }
  function getTrashedMsgs() {
    if (!session) return [];
    return S.list("messages").filter(function(m) {
      return m.trashedBy && m.trashedBy.includes(session.id);
    }).sort(function(a, b) {
      var atA = (a.trashedAt || {})[session.id] || 0;
      var atB = (b.trashedAt || {})[session.id] || 0;
      return atB - atA;
    });
  }
  function trashMsg(id) {
    var all = S.list("messages");
    var i = all.findIndex(function(m) { return m.id === id; });
    if (i < 0) return;
    var trashedBy = (all[i].trashedBy || []).filter(function(x) { return x !== session.id; });
    trashedBy.push(session.id);
    var trashedAt = Object.assign({}, all[i].trashedAt || {});
    trashedAt[session.id] = Date.now();
    all[i] = Object.assign({}, all[i], { trashedBy: trashedBy, trashedAt: trashedAt });
    S.write("messages", all);
  }
  function restoreMsg(id) {
    var all = S.list("messages");
    var i = all.findIndex(function(m) { return m.id === id; });
    if (i < 0) return;
    var trashedBy = (all[i].trashedBy || []).filter(function(uid) { return uid !== session.id; });
    var trashedAt = Object.assign({}, all[i].trashedAt || {});
    delete trashedAt[session.id];
    all[i] = Object.assign({}, all[i], { trashedBy: trashedBy, trashedAt: trashedAt });
    S.write("messages", all);
  }
  function purgeExpiredTrash() {
    var THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    var now = Date.now();
    var all = S.list("messages");
    var changed = false;
    var result = all.reduce(function(acc, m) {
      if (!m.trashedBy || !m.trashedBy.length) { acc.push(m); return acc; }
      var trashedAt = m.trashedAt || {};
      var freshBy = m.trashedBy.filter(function(uid) { return now - (trashedAt[uid] || 0) < THIRTY_DAYS; });
      if (freshBy.length === 0) {
        // Auto-purge after 30 days — same as "Delete forever" so it doesn't
        // come back on the next server poll.
        permaForgetMsg(m.id);
        changed = true;
        return acc;
      }
      if (freshBy.length < m.trashedBy.length) {
        var freshAt = {};
        freshBy.forEach(function(uid) { freshAt[uid] = trashedAt[uid]; });
        acc.push(Object.assign({}, m, { trashedBy: freshBy, trashedAt: freshAt }));
        changed = true;
      } else {
        acc.push(m);
      }
      return acc;
    }, []);
    if (changed) S.write("messages", result);
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
    if (!trashPurgedThisSession) { purgeExpiredTrash(); trashPurgedThisSession = true; }
    const counts = getMsgUnreadCount();
    setNavBadge("msgInboxBadge", counts.inboxUnread);
    setNavBadge("msgAnnBadge", counts.annUnread);
    setNavBadge("msgBookingBadge", counts.bookingUnread);
    setNavBadge("msgResetBadge", counts.resetUnread);
    const { msgs: sm, bookings: sb } = getStarredMsgs();
    setNavBadge("msgStarredBadge", sm.length + sb.length);

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
    announcements: { ico: "📢", header: "msg.announcements", emptySub: "msg.empty.ann" },
    starred:       { ico: "⭐", header: "msg.starred",       emptySub: "msg.empty.starred" },
    trash:         { ico: "🗑️", header: "msg.trash",         emptySub: "msg.empty.trash" }
  };

  function getStarredMsgs() {
    const msgs = getActiveMsgs().filter((m) => m.starred).sort((a, b) => b.createdAt - a.createdAt);
    const bookings = S.list("guestBookings").filter((b) => b.starred).sort((a, b) => b.createdAt - a.createdAt);
    return { msgs, bookings };
  }

  function renderStarredList() {
    const listArea = document.getElementById("msgListArea");
    const { msgs, bookings } = getStarredMsgs();
    const total = msgs.length + bookings.length;
    const countLabel = total ? '<span class="mlh-count">' + total + "</span>" : "";
    listArea.innerHTML = '<div class="msg-list-header">' + esc(t("msg.starred")) + countLabel + "</div>";

    if (!total) {
      listArea.innerHTML +=
        '<div class="msg-empty"><div class="me-ico">⭐</div>' +
        '<div class="me-title">' + esc(t("msg.empty.title")) + "</div>" +
        '<div class="me-sub">' + esc(t("msg.empty.starred")) + "</div></div>";
      return;
    }

    const combined = [
      ...msgs.map((m) => ({ item: m, kind: "message" })),
      ...bookings.map((b) => ({ item: b, kind: "booking" }))
    ].sort((a, b) => b.item.createdAt - a.item.createdAt);

    combined.forEach(({ item: m, kind }) => {
      const row = document.createElement("div");
      if (kind === "booking") {
        const unread = isBookingUnread(m);
        row.className = "msg-row booking channel-" + m.channel + (unread ? " unread" : " read");
        row.innerHTML =
          '<div class="mr-avatar bk-avatar"><span>' + esc((m.channelName || "?").charAt(0).toUpperCase()) + "</span></div>" +
          '<div class="mr-sender">' + esc(m.channelName) + "</div>" +
          '<div class="mr-subject-preview"><span class="mr-subject">' + esc(m.guestName) + "</span>" +
          '<span class="mr-sep">—</span><span class="mr-preview">' + esc((m.room ? m.room + " · " : "") + bookingDateRange(m) + " · " + m.ref) + "</span></div>" +
          '<div class="mr-time">' + esc(formatMsgTime(m.createdAt)) + "</div>";
        row.addEventListener("click", () => {
          msgPrevView = "starred"; msgDetailId = m.id; msgDetailKind = "booking";
          msgView = "detail"; markBookingRead(m.id); renderMessages();
        });
      } else {
        const isSent = m.fromId === session.id;
        const unread = !isSent && isUnread(m);
        const displayName = isSent
          ? (m.to === "all" ? "Everyone" : (Array.isArray(m.toNames) ? m.toNames.join(", ") : (m.toNames || "—")))
          : m.fromName;
        row.className = "msg-row" + (unread ? " unread" : " read") + (m.to === "all" ? " announcement" : "");
        row.innerHTML =
          '<div class="mr-avatar">' + makeAvatarHtml(displayName, isSent ? session.id : m.fromId) + "</div>" +
          '<div class="mr-sender">' + esc(displayName) + "</div>" +
          '<div class="mr-subject-preview"><span class="mr-subject">' + esc(m.subject || "(no subject)") + "</span>" +
          '<span class="mr-sep">—</span><span class="mr-preview">' + esc((m.body || "").replace(/\n/g, " ").slice(0, 100)) + "</span></div>" +
          '<div class="mr-time">' + esc(formatMsgTime(m.createdAt)) + "</div>";
        row.addEventListener("click", () => {
          msgPrevView = "starred"; msgDetailId = m.id; msgDetailKind = "message";
          msgView = "detail"; markMsgRead(m.id); renderMessages();
        });
      }
      listArea.appendChild(row);
    });
  }

  function renderMsgList() {
    if (msgView === "bookings") { renderBookingList(); return; }
    if (msgView === "resets") { renderResetList(); return; }
    if (msgView === "starred") { renderStarredList(); return; }
    if (msgView === "trash") { renderTrashList(); return; }

    const listArea = document.getElementById("msgListArea");
    const meta = MSG_VIEW_META[msgView] || MSG_VIEW_META.inbox;
    let msgs = [];
    if (msgView === "inbox") msgs = getInboxMsgs();
    else if (msgView === "sent") msgs = getSentMsgs();
    else if (msgView === "announcements") msgs = getAnnouncementMsgs();

    // Keep only IDs still in this list when in multi-select mode
    if (msgMultiSelect) {
      const currentIds = new Set(msgs.map((m) => m.id));
      selectedMsgIds = new Set([...selectedMsgIds].filter((id) => currentIds.has(id)));
    }

    const countLabel = msgs.length ? '<span class="mlh-count">' + msgs.length + "</span>" : "";
    const selectBtnHtml = msgs.length
      ? (msgMultiSelect
        ? '<button class="mlh-select-btn active" id="msgSelectToggle">✕ ' + esc(t("msg.deselect.all")) + "</button>"
        : '<button class="mlh-select-btn" id="msgSelectToggle">' + esc(t("msg.select")) + "</button>")
      : "";
    listArea.innerHTML = '<div class="msg-list-header">' + esc(t(meta.header)) + countLabel + selectBtnHtml + "</div>";

    // Bulk action bar
    if (msgMultiSelect && msgs.length) {
      const n = selectedMsgIds.size;
      const allSelected = n === msgs.length;
      const bulkBar = document.createElement("div");
      bulkBar.className = "msg-bulk-bar";
      bulkBar.innerHTML =
        '<span class="mbb-count">' + n + " " + esc(t("msg.select")) + "ed</span>" +
        '<button class="mbb-btn" id="mbbSelectAll">' + esc(t(allSelected ? "msg.deselect.all" : "msg.select.all")) + "</button>" +
        '<button class="mbb-btn mbb-delete" id="mbbDelete"' + (n === 0 ? " disabled" : "") + ">🗑 " + esc(t("msg.bulk.delete")) + "</button>" +
        '<button class="mbb-btn mbb-star" id="mbbStar"' + (n === 0 ? " disabled" : "") + ">☆ " + esc(t("msg.bulk.star")) + "</button>" +
        '<button class="mbb-btn mbb-report" id="mbbReport"' + (n === 0 ? " disabled" : "") + ">⚑ " + esc(t("msg.bulk.report")) + "</button>";
      listArea.appendChild(bulkBar);
    }

    if (!msgs.length) {
      listArea.innerHTML +=
        '<div class="msg-empty">' +
        '<div class="me-ico">' + meta.ico + "</div>" +
        '<div class="me-title">' + esc(t("msg.empty.title")) + "</div>" +
        '<div class="me-sub">' + esc(t(meta.emptySub)) + "</div>" +
        "</div>";
    } else {
      msgs.forEach((m) => {
        const isSent = msgView === "sent";
        const isAnn = m.to === "all";
        const unread = !isSent && isUnread(m);
        const displayName = isSent
          ? (isAnn ? "Everyone" : (Array.isArray(m.toNames) ? m.toNames.join(", ") : (m.toNames || "—")))
          : m.fromName;
        const avatarUserId = isSent ? session.id : m.fromId;
        const isSelected = selectedMsgIds.has(m.id);

        const row = document.createElement("div");
        const isReported = isAdmin() && Array.isArray(m.reportedBy) && m.reportedBy.length > 0;
        row.className = "msg-row" + (unread ? " unread" : " read") + (isAnn ? " announcement" : "") +
          (isReported ? " reported" : "") + (isSelected ? " selected" : "") + (msgMultiSelect ? " selectable" : "");
        row.dataset.id = m.id;

        const firstCol = msgMultiSelect
          ? '<div class="mr-check"><input type="checkbox" class="mr-checkbox" tabindex="-1"' + (isSelected ? " checked" : "") + "></div>"
          : '<div class="mr-avatar">' + makeAvatarHtml(displayName, avatarUserId) + "</div>";

        row.innerHTML =
          firstCol +
          '<div class="mr-sender">' + esc(displayName) + "</div>" +
          '<div class="mr-subject-preview">' +
            '<span class="mr-subject">' + esc(m.subject || "(no subject)") + "</span>" +
            '<span class="mr-sep">—</span>' +
            '<span class="mr-preview">' + esc((m.body || "").replace(/\n/g, " ").slice(0, 100)) + "</span>" +
          "</div>" +
          '<div class="mr-time">' + (isReported ? '<span class="mr-flag" title="Reported">⚑ </span>' : "") + esc(formatMsgTime(m.createdAt)) + "</div>";

        if (!msgMultiSelect) {
          maybeTranslateInto(row.querySelector(".mr-subject"), m.subject || "", m.lang);
          maybeTranslateInto(row.querySelector(".mr-preview"), (m.body || "").replace(/\n/g, " ").slice(0, 100), m.lang);
        }

        row.addEventListener("click", () => {
          if (msgMultiSelect) {
            if (selectedMsgIds.has(m.id)) selectedMsgIds.delete(m.id);
            else selectedMsgIds.add(m.id);
            renderMessages();
            return;
          }
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

    // Wire up select-toggle and bulk-bar buttons
    const selectToggle = document.getElementById("msgSelectToggle");
    if (selectToggle) {
      selectToggle.addEventListener("click", () => {
        msgMultiSelect = !msgMultiSelect;
        if (!msgMultiSelect) selectedMsgIds.clear();
        renderMessages();
      });
    }
    if (msgMultiSelect) {
      const mbbSelectAll = document.getElementById("mbbSelectAll");
      if (mbbSelectAll) {
        mbbSelectAll.addEventListener("click", () => {
          if (selectedMsgIds.size === msgs.length) selectedMsgIds.clear();
          else msgs.forEach((m) => selectedMsgIds.add(m.id));
          renderMessages();
        });
      }
      const mbbDelete = document.getElementById("mbbDelete");
      if (mbbDelete) {
        mbbDelete.addEventListener("click", () => {
          if (!selectedMsgIds.size) return;
          if (!confirm(t("msg.delete.confirm"))) return;
          selectedMsgIds.forEach((id) => trashMsg(id));
          selectedMsgIds.clear();
          msgMultiSelect = false;
          renderMessages();
        });
      }
      const mbbStar = document.getElementById("mbbStar");
      if (mbbStar) {
        mbbStar.addEventListener("click", () => {
          if (!selectedMsgIds.size) return;
          selectedMsgIds.forEach((id) => toggleStar(id, "message"));
          renderMessages();
        });
      }
      const mbbReport = document.getElementById("mbbReport");
      if (mbbReport) {
        mbbReport.addEventListener("click", () => {
          if (!selectedMsgIds.size) return;
          if (!confirm(t("msg.report.confirm"))) return;
          const all = S.list("messages");
          const API = window.JPark && window.JPark.api;
          selectedMsgIds.forEach((id) => {
            const i = all.findIndex((x) => x.id === id);
            if (i < 0 || all[i].fromId === session.id) return;
            const already = (all[i].reportedBy || []).includes(session.id);
            if (!already) all[i] = Object.assign({}, all[i], { reportedBy: (all[i].reportedBy || []).concat([session.id]) });
            if (API && typeof id === "string" && id.indexOf("srv_") === 0) {
              API.patch("/api/messages/" + id.slice(4) + "/report", {}).catch(function () {});
            }
          });
          S.write("messages", all);
          selectedMsgIds.clear();
          msgMultiSelect = false;
          renderMessages();
        });
      }
    }
  }

  function renderTrashList() {
    const listArea = document.getElementById("msgListArea");
    const msgs = getTrashedMsgs();

    // Keep only IDs still in trash when in multi-select mode
    if (msgMultiSelect) {
      const currentIds = new Set(msgs.map((m) => m.id));
      selectedMsgIds = new Set([...selectedMsgIds].filter((id) => currentIds.has(id)));
    }

    const countLabel = msgs.length ? '<span class="mlh-count">' + msgs.length + "</span>" : "";
    const selectBtnHtml = msgs.length
      ? (msgMultiSelect
        ? '<button class="mlh-select-btn active" id="msgSelectToggle">✕ ' + esc(t("msg.deselect.all")) + "</button>"
        : '<button class="mlh-select-btn" id="msgSelectToggle">' + esc(t("msg.select")) + "</button>")
      : "";
    listArea.innerHTML = '<div class="msg-list-header">🗑️ ' + esc(t("msg.trash")) + countLabel + selectBtnHtml + "</div>";

    // Bulk action bar (trash-specific)
    if (msgMultiSelect && msgs.length) {
      const n = selectedMsgIds.size;
      const allSelected = n === msgs.length;
      const bulkBar = document.createElement("div");
      bulkBar.className = "msg-bulk-bar";
      bulkBar.innerHTML =
        '<span class="mbb-count">' + n + " " + esc(t("msg.select")) + "ed</span>" +
        '<button class="mbb-btn" id="mbbSelectAll">' + esc(t(allSelected ? "msg.deselect.all" : "msg.select.all")) + "</button>" +
        '<button class="mbb-btn mbb-restore" id="mbbRestore"' + (n === 0 ? " disabled" : "") + ">↩ " + esc(t("msg.bulk.restore")) + "</button>" +
        '<button class="mbb-btn mbb-delete" id="mbbDeleteForever"' + (n === 0 ? " disabled" : "") + ">🗑 " + esc(t("msg.bulk.delete.forever")) + "</button>";
      listArea.appendChild(bulkBar);
    }

    // Trash info line
    const infoBar = document.createElement("div");
    infoBar.className = "msg-trash-info";
    infoBar.textContent = t("msg.trash.info");
    listArea.appendChild(infoBar);

    if (!msgs.length) {
      const empty = document.createElement("div");
      empty.className = "msg-empty";
      empty.innerHTML =
        '<div class="me-ico">🗑️</div>' +
        '<div class="me-title">' + esc(t("msg.empty.title")) + "</div>" +
        '<div class="me-sub">' + esc(t("msg.empty.trash")) + "</div>";
      listArea.appendChild(empty);
    } else {
      msgs.forEach((m) => {
        const isSent = m.fromId === session.id;
        const displayName = isSent
          ? (m.to === "all" ? "Everyone" : (Array.isArray(m.toNames) ? m.toNames.join(", ") : (m.toNames || "—")))
          : m.fromName;
        const avatarUserId = isSent ? session.id : m.fromId;
        const isSelected = selectedMsgIds.has(m.id);
        const trashedWhen = (m.trashedAt || {})[session.id] || 0;
        const daysLeft = Math.max(0, 30 - Math.floor((Date.now() - trashedWhen) / 86400000));

        const row = document.createElement("div");
        row.className = "msg-row read trash-row" + (isSelected ? " selected" : "") + (msgMultiSelect ? " selectable" : "");
        row.dataset.id = m.id;

        const firstCol = msgMultiSelect
          ? '<div class="mr-check"><input type="checkbox" class="mr-checkbox" tabindex="-1"' + (isSelected ? " checked" : "") + "></div>"
          : '<div class="mr-avatar">' + makeAvatarHtml(displayName, avatarUserId) + "</div>";

        row.innerHTML =
          firstCol +
          '<div class="mr-sender">' + esc(displayName) + "</div>" +
          '<div class="mr-subject-preview">' +
            '<span class="mr-subject">' + esc(m.subject || "(no subject)") + "</span>" +
            '<span class="mr-sep">—</span>' +
            '<span class="mr-preview">' + esc((m.body || "").replace(/\n/g, " ").slice(0, 100)) + "</span>" +
          "</div>" +
          '<div class="mr-time mr-days-left">' + daysLeft + "d</div>";

        row.addEventListener("click", () => {
          if (msgMultiSelect) {
            if (selectedMsgIds.has(m.id)) selectedMsgIds.delete(m.id);
            else selectedMsgIds.add(m.id);
            renderMessages();
            return;
          }
          msgPrevView = "trash";
          msgDetailId = m.id;
          msgDetailKind = "message";
          msgView = "detail";
          renderMessages();
        });
        listArea.appendChild(row);
      });
    }

    // Wire up buttons
    const selectToggle = document.getElementById("msgSelectToggle");
    if (selectToggle) {
      selectToggle.addEventListener("click", () => {
        msgMultiSelect = !msgMultiSelect;
        if (!msgMultiSelect) selectedMsgIds.clear();
        renderMessages();
      });
    }
    if (msgMultiSelect) {
      const mbbSelectAll = document.getElementById("mbbSelectAll");
      if (mbbSelectAll) {
        mbbSelectAll.addEventListener("click", () => {
          if (selectedMsgIds.size === msgs.length) selectedMsgIds.clear();
          else msgs.forEach((m) => selectedMsgIds.add(m.id));
          renderMessages();
        });
      }
      const mbbRestore = document.getElementById("mbbRestore");
      if (mbbRestore) {
        mbbRestore.addEventListener("click", () => {
          if (!selectedMsgIds.size) return;
          selectedMsgIds.forEach((id) => restoreMsg(id));
          selectedMsgIds.clear();
          msgMultiSelect = false;
          renderMessages();
        });
      }
      const mbbDeleteForever = document.getElementById("mbbDeleteForever");
      if (mbbDeleteForever) {
        mbbDeleteForever.addEventListener("click", () => {
          if (!selectedMsgIds.size) return;
          if (!confirm(t("msg.delete.forever.confirm"))) return;
          selectedMsgIds.forEach((id) => { permaForgetMsg(id); S.remove("messages", id); });
          selectedMsgIds.clear();
          msgMultiSelect = false;
          renderMessages();
        });
      }
    }
  }

  function renderMsgDetail(id) {
    const m = getAllMsgs().find((x) => x.id === id);
    const detailArea = document.getElementById("msgDetail");
    if (!m) { detailArea.innerHTML = ""; return; }

    const isAnn = m.to === "all";
    const toLabel = isAnn ? "All Staff" : (Array.isArray(m.toNames) ? m.toNames.join(", ") : (m.toNames || ""));
    const _nameParts = (m.fromName || "").toLowerCase().trim().split(/\s+/);
    const emailAlias = (_nameParts.length > 1 ? _nameParts[0][0] + _nameParts[_nameParts.length - 1] : (_nameParts[0] || "staff")) + "@jpark.hotel";
    const avatarClass = isAnn ? "mda-avatar announcement-avatar" : "mda-avatar";

    const canReply = !!(m.fromId && m.fromId !== session.id);
    const isStarred = !!m.starred;
    const isInTrash = msgPrevView === "trash";
    const alreadyReported = Array.isArray(m.reportedBy) && m.reportedBy.includes(session.id);
    const canReport = !isInTrash && m.fromId !== session.id;

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
      '<div class="msg-detail-body"></div>' +
      '<div class="msg-detail-actions">' +
        (isInTrash
          ? ('<button class="mda-action-btn mda-restore-btn" id="mdaRestore">↩ ' + esc(t("msg.restore")) + "</button>" +
             '<button class="mda-action-btn mda-delete-btn" id="mdaDeleteForever">🗑 ' + esc(t("msg.delete.forever")) + "</button>")
          : ((!canReply ? "" : '<button class="mda-action-btn" id="mdaReply">↩ ' + esc(t("msg.reply")) + "</button>") +
             '<button class="mda-action-btn" id="mdaForward">↪ ' + esc(t("msg.forward")) + "</button>" +
             '<button class="mda-action-btn mda-star-btn' + (isStarred ? " starred" : "") + '" id="mdaStar">' +
               (isStarred ? "★ " + esc(t("msg.unstar")) : "☆ " + esc(t("msg.star"))) +
             "</button>" +
             (canReport ? '<button class="mda-action-btn mda-report-btn' + (alreadyReported ? " reported" : "") + '" id="mdaReport">' +
               (alreadyReported ? "⚠ " + esc(t("msg.report.already")) : "⚑ " + esc(t("msg.report"))) + "</button>" : "") +
             '<button class="mda-action-btn mda-delete-btn" id="mdaDelete">🗑 ' + esc(t("msg.delete")) + "</button>")) +
      "</div>";

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

    const replyBtn = detailArea.querySelector("#mdaReply");
    if (replyBtn) replyBtn.addEventListener("click", () => openReply(m));
    const fwdBtn = detailArea.querySelector("#mdaForward");
    if (fwdBtn) fwdBtn.addEventListener("click", () => openForwardMsg(m));
    const starBtn = detailArea.querySelector("#mdaStar");
    if (starBtn) {
      starBtn.addEventListener("click", () => {
        const nowStarred = toggleStar(m.id, "message");
        starBtn.className = "mda-action-btn mda-star-btn" + (nowStarred ? " starred" : "");
        starBtn.textContent = (nowStarred ? "★ " : "☆ ") + t(nowStarred ? "msg.unstar" : "msg.star");
        updateBadges();
      });
    }

    const reportBtn = detailArea.querySelector("#mdaReport");
    if (reportBtn) {
      reportBtn.addEventListener("click", () => {
        if (!confirm(t("msg.report.confirm"))) return;
        const cur = getAllMsgs().find((x) => x.id === m.id);
        const reportedBy = cur ? (cur.reportedBy || []).concat([session.id]) : [session.id];
        S.update("messages", m.id, { reportedBy });
        reportBtn.className = "mda-action-btn mda-report-btn reported";
        reportBtn.textContent = "⚠ " + t("msg.report.done");
        reportBtn.disabled = true;
        if (typeof m.id === "string" && m.id.indexOf("srv_") === 0) {
          const API = window.JPark && window.JPark.api;
          if (API) API.patch("/api/messages/" + m.id.slice(4) + "/report", {}).catch(function () {});
        }
      });
    }

    const restoreBtn = detailArea.querySelector("#mdaRestore");
    if (restoreBtn) {
      restoreBtn.addEventListener("click", () => {
        restoreMsg(m.id);
        msgView = "inbox";
        msgDetailId = null;
        renderMessages();
      });
    }

    const deleteForeverBtn = detailArea.querySelector("#mdaDeleteForever");
    if (deleteForeverBtn) {
      deleteForeverBtn.addEventListener("click", () => {
        if (!confirm(t("msg.delete.forever.confirm"))) return;
        permaForgetMsg(m.id);
        S.remove("messages", m.id);
        msgView = "trash";
        msgDetailId = null;
        renderMessages();
      });
    }

    const deleteBtn = detailArea.querySelector("#mdaDelete");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        if (!confirm(t("msg.delete.confirm"))) return;
        trashMsg(m.id);
        msgView = msgPrevView;
        msgDetailId = null;
        renderMessages();
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
    const bkIsStarred = !!b.starred;

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
      '<div class="msg-detail-body bk-confirm-body"></div>' +
      '<div class="msg-detail-actions">' +
        '<button class="mda-action-btn" id="mdaBkForward">↪ ' + esc(t("msg.forward")) + "</button>" +
        '<button class="mda-action-btn mda-star-btn' + (bkIsStarred ? " starred" : "") + '" id="mdaBkStar">' +
          (bkIsStarred ? "★ " + esc(t("msg.unstar")) : "☆ " + esc(t("msg.star"))) +
        "</button>" +
        (isAdmin() ? '<button class="mda-action-btn mda-delete-btn" id="mdaBkDelete">🗑 ' + esc(t("msg.delete")) + "</button>" : "") +
      "</div>";

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

    detailArea.querySelector("#mdaBkForward").addEventListener("click", () => openForwardBooking(b));
    detailArea.querySelector("#mdaBkStar").addEventListener("click", () => {
      const nowStarred = toggleStar(b.id, "booking");
      const btn = detailArea.querySelector("#mdaBkStar");
      if (btn) {
        btn.className = "mda-action-btn mda-star-btn" + (nowStarred ? " starred" : "");
        btn.textContent = (nowStarred ? "★ " : "☆ ") + t(nowStarred ? "msg.unstar" : "msg.star");
      }
      updateBadges();
    });

    const bkDeleteBtn = detailArea.querySelector("#mdaBkDelete");
    if (bkDeleteBtn) {
      bkDeleteBtn.addEventListener("click", () => {
        if (!confirm(t("msg.delete.confirm"))) return;
        S.remove("guestBookings", b.id);
        msgView = msgPrevView;
        msgDetailId = null;
        msgDetailKind = "message";
        renderMessages();
      });
    }

    document.getElementById("msgDetailBack").addEventListener("click", () => {
      msgView = msgPrevView;
      msgDetailId = null;
      msgDetailKind = "message";
      renderMessages();
    });
  }

  /* ====================  PASSWORD RESET REQUESTS (admin)  ==================== */
  function renderResetList() {
    const listArea = document.getElementById("msgListArea");
    if (!isAdmin()) { listArea.innerHTML = ""; return; }
    const reqs = getResetRequests();
    const countLabel = reqs.length ? '<span class="mlh-count">' + reqs.length + "</span>" : "";
    listArea.innerHTML = '<div class="msg-list-header">' + esc(t("msg.resets")) + countLabel + "</div>";

    if (!reqs.length) {
      listArea.innerHTML +=
        '<div class="msg-empty">' +
        '<div class="me-ico">🔑</div>' +
        '<div class="me-title">' + esc(t("msg.empty.title")) + "</div>" +
        '<div class="me-sub">' + esc(t("msg.empty.resets")) + "</div>" +
        "</div>";
      return;
    }

    reqs.forEach((r) => {
      const isPass = r.kind === "password";
      const who = isPass ? (r.username || "") : (r.name || "");
      const meta = isPass ? (r.note || "") : (r.contact || "");
      const row = document.createElement("div");
      row.className = "reset-row" + (r.handled ? " handled" : "");
      row.innerHTML =
        '<div class="rr-ico">' + (isPass ? "🔑" : "👤") + "</div>" +
        '<div class="rr-main">' +
          '<div class="rr-title"></div>' +
          '<div class="rr-who"></div>' +
          (meta ? '<div class="rr-meta"></div>' : "") +
        "</div>" +
        '<div class="rr-time"></div>' +
        '<div class="rr-actions"></div>';
      row.querySelector(".rr-title").textContent = t(isPass ? "msg.reset.passReq" : "msg.reset.userReq") + (r.handled ? " · " + t("msg.reset.done") : "");
      row.querySelector(".rr-who").textContent = who;
      if (meta) row.querySelector(".rr-meta").textContent = meta;
      row.querySelector(".rr-time").textContent = formatMsgTime(r.createdAt);

      const actions = row.querySelector(".rr-actions");
      if (isPass && !r.handled) {
        const resetBtn = document.createElement("button");
        resetBtn.className = "btn-activate";
        resetBtn.textContent = t("msg.reset.toDefault");
        resetBtn.addEventListener("click", () => {
          const u = S.list("staff").find((x) => x.username.toLowerCase() === (r.username || "").toLowerCase());
          if (!u) { U.toast(t("msg.reset.noUser"), "error"); return; }
          S.update("staff", u.id, { password: DEFAULT_STAFF_PASSWORD, mustChange: true });
          S.update("resetRequests", r.id, { handled: true });
          U.toast(t("msg.reset.didReset"), "success");
          renderMessages();
        });
        actions.appendChild(resetBtn);
      }
      if (!r.handled) {
        const doneBtn = document.createElement("button");
        doneBtn.textContent = t("msg.reset.markDone");
        doneBtn.addEventListener("click", () => { S.update("resetRequests", r.id, { handled: true }); renderMessages(); });
        actions.appendChild(doneBtn);
      }
      const delBtn = document.createElement("button");
      delBtn.className = "rr-del";
      delBtn.textContent = t("common.delete");
      delBtn.addEventListener("click", () => { S.remove("resetRequests", r.id); renderMessages(); });
      actions.appendChild(delBtn);

      listArea.appendChild(row);
    });
  }

  /* ====================  COMPOSE  ==================== */
  function openCompose(opts) {
    msgToRecipients = (opts && opts.to) ? opts.to : [];
    msgToAllSelected = false;
    const modal = document.getElementById("msgComposeModal");
    if (!modal) return;
    modal.classList.add("open");
    document.getElementById("msgToInput").value = "";
    document.getElementById("msgSubjectInput").value = (opts && opts.subject) || "";
    document.getElementById("msgBodyInput").value = (opts && opts.body) || "";
    renderToTags();
    hideToDropdown();
    // Pull a fresh directory so accounts created since the last poll tick show
    // up in autocomplete immediately. Fire-and-forget — the input listener will
    // re-render the dropdown whenever the user types.
    _syncStaffList();
    if (opts && opts.to && opts.to.length) document.getElementById("msgSubjectInput").focus();
    else document.getElementById("msgToInput").focus();
  }

  function openReply(m) {
    if (!m || !m.fromId || m.fromId === session.id) return;
    const pfx = t("msg.replyPrefix");
    const subj = (m.subject || "").startsWith(pfx) ? (m.subject || "") : pfx + " " + (m.subject || "");
    openCompose({ to: [{ id: m.fromId, name: m.fromName }], subject: subj });
  }

  function openForwardMsg(m) {
    const pfx = t("msg.fwdPrefix");
    const subj = (m.subject || "").startsWith(pfx) ? (m.subject || "") : pfx + " " + (m.subject || "");
    const sep = t("msg.fwdBody");
    const body = "\n\n" + sep + "\nFrom: " + (m.fromName || "") +
      "\nDate: " + new Date(m.createdAt).toLocaleString() +
      "\nSubject: " + (m.subject || "") + "\n\n" + (m.body || "");
    openCompose({ subject: subj, body });
  }

  function openForwardBooking(b) {
    const pfx = t("msg.fwdPrefix");
    const subj = pfx + " " + t("msg.bk.subject") + " · " + (b.channelName || "") + " · " + (b.guestName || "");
    const sep = t("msg.fwdBody");
    const info = "Channel: " + (b.channelName || "") +
      "\nGuest: " + (b.guestName || "") + "\nRef: " + (b.ref || "") +
      "\nRoom: " + (b.room || "") + "\nCheck-in: " + (b.checkIn || "") +
      "\nCheck-out: " + (b.checkOut || "") +
      "\nTotal: " + ((b.currency || "THB") + " " + (b.total || ""));
    const body = "\n\n" + sep + "\n" + info + "\n\n" + (b.confirmation || "");
    openCompose({ subject: subj, body });
  }

  function toggleStar(id, kind) {
    if (kind === "booking") {
      const all = S.list("guestBookings");
      const i = all.findIndex((b) => b.id === id);
      if (i < 0) return false;
      const starred = !all[i].starred;
      all[i] = Object.assign({}, all[i], { starred });
      S.write("guestBookings", all);
      return starred;
    }
    const all = getAllMsgs();
    const i = all.findIndex((m) => m.id === id);
    if (i < 0) return false;
    const starred = !all[i].starred;
    all[i] = Object.assign({}, all[i], { starred });
    S.write("messages", all);
    return starred;
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
  async function sendMessage() {
    const subject = document.getElementById("msgSubjectInput").value.trim();
    const body = document.getElementById("msgBodyInput").value.trim();
    if (!msgToAllSelected && msgToRecipients.length === 0) {
      U.toast("Please add at least one recipient.", "error"); return;
    }
    if (!subject) { U.toast("Please add a subject.", "error"); return; }
    if (!body) { U.toast("Please write a message.", "error"); return; }

    const toAll = msgToAllSelected;
    const toIds = toAll ? [] : msgToRecipients.map((r) => r.id);
    const toNames = toAll ? [] : msgToRecipients.map((r) => r.name);

    // Sync path: POST to the server so the recipient sees it on their next
    // poll tick (~6s). The server stamps the canonical id and createdAt,
    // and we mirror the row locally for instant UI feedback.
    const API = window.JPark && window.JPark.api;
    if (API) {
      const res = await API.post("/api/messages", {
        subject, body, lang: I.getLang(), toAll, toIds, toNames,
      });
      if (res && !res.error) {
        const all = S.list("messages");
        all.push(_mapServerMsg(res));
        S.write("messages", all);
        closeCompose();
        U.toast("Message sent!", "success");
        if (panel === "messages") { msgView = "sent"; renderMessages(); }
        return;
      }
      if (res && res.error && !res.offline) {
        U.toast("Could not send: " + res.error, "error");
        return;
      }
      // Fall through on offline — store locally so it isn't lost.
    }

    // Offline / no API fallback — local-only insert. (Survives until the
    // server comes back; not auto-replayed today.)
    S.insert("messages", {
      fromId: session.id, fromName: session.name, fromRole: session.role,
      subject, body, lang: I.getLang(),
      to: toAll ? "all" : toIds,
      toNames: toAll ? "Everyone" : toNames,
      readBy: [session.id],
    });
    closeCompose();
    U.toast("Message saved offline — will send when reconnected.", "success");
    if (panel === "messages") { msgView = "sent"; renderMessages(); }
  }

  /* ====================  SITE EDITOR (admin)  ==================== */
  function renderSite() {
    if (!isAdmin()) return;
    if (!edLang) edLang = I.getLang();
    renderGuideState();
    renderEditTabs();
    renderEditLang();
    renderContentGroups();
    renderMediaSets();
    renderColors();
    renderAnnouncements();
    renderSectionToggles();
    renderHistory();
  }

  function renderEditTabs() {
    document.querySelectorAll("#edTabs .ed-tab").forEach((b) =>
      b.classList.toggle("active", b.dataset.edtab === edTab));
    document.querySelectorAll("#panel-site .ed-tabpane").forEach((p) =>
      p.classList.toggle("show", p.dataset.edpane === edTab));
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

  /* ---- edit history (audit log) ---- */
  const EDIT_LOG_MAX = 250;
  function logEdit(entry) {
    const c = S.read("content", {}) || {};
    c.editLog = Array.isArray(c.editLog) ? c.editLog : [];
    c.editLog.push(Object.assign({
      ts: Date.now(),
      userId: session ? session.id : null,
      userName: session ? session.name : "—"
    }, entry));
    if (c.editLog.length > EDIT_LOG_MAX) c.editLog = c.editLog.slice(c.editLog.length - EDIT_LOG_MAX);
    S.write("content", c);
  }

  /* Translate a freshly edited string into the other four languages so every
     language stays in sync. Best-effort: if the service is unavailable the
     other languages keep whatever they had. Resetting (empty / back to the
     original) clears the matching override in every language too. */
  function autoTranslateField(key, srcLang, val, statusEl) {
    const targets = I.SUPPORTED.filter((l) => l !== srcLang);
    const isReset = !val || val === I.base(key, srcLang);
    if (isReset) {
      targets.forEach((l) => setOverride(l, key, ""));
      return;
    }
    if (statusEl) { statusEl.textContent = t("staff.site.translating"); statusEl.className = "ed-field-status translating"; }
    Promise.all(targets.map((l) =>
      J.translate.text(val, l).then((res) => {
        const out = (res && res.text) ? res.text : val;
        setOverride(l, key, out);
        return true;
      }).catch(() => false)
    )).then(() => {
      if (statusEl) {
        statusEl.textContent = t("staff.site.translatedAll");
        statusEl.className = "ed-field-status saved";
        setTimeout(() => { statusEl.textContent = ""; statusEl.className = "ed-field-status"; }, 2200);
      }
    });
  }

  // Open the public site at a section, optionally highlighting one text key.
  function siteUrl(section, key) {
    let url = "index.html";
    if (key) url += "#hl=" + encodeURIComponent(key);
    else if (section) url += "#" + section;
    return url;
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
      const thumbSrc = MED && group.thumb ? MED.cover(group.thumb) : null;
      sum.innerHTML =
        '<span class="ed-grp-thumb"></span>' +
        '<span class="ed-grp-title"></span>' +
        '<span class="ed-grp-count">' + rows.length + "</span>";
      const thumbEl = sum.querySelector(".ed-grp-thumb");
      if (thumbSrc) {
        const im = document.createElement("img");
        im.src = encodeURI(thumbSrc);
        im.alt = "";
        im.loading = "lazy";
        im.title = t("staff.site.viewOnSite");
        im.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          window.open(siteUrl(group.section, null), "_blank", "noopener");
        });
        thumbEl.appendChild(im);
      } else {
        thumbEl.classList.add("empty");
      }
      sum.querySelector(".ed-grp-title").textContent = t(group.title);
      det.appendChild(sum);

      rows.forEach((r) => det.appendChild(buildFieldRow(r, group)));
      wrap.appendChild(det);
    });

    const none = document.getElementById("edNoMatch");
    if (none) none.hidden = anyShown;
  }

  function buildFieldRow(r, group) {
    const row = document.createElement("div");
    row.className = "ed-field" + (r.overridden ? " is-edited" : "");

    const head = document.createElement("div");
    head.className = "ed-field-head";
    const keyEl = document.createElement("code");
    keyEl.className = "ed-field-key";
    keyEl.textContent = r.key;
    const status = document.createElement("span");
    status.className = "ed-field-status";
    const view = document.createElement("a");
    view.className = "ed-field-view";
    view.href = siteUrl(group ? group.section : null, r.key);
    view.target = "_blank";
    view.rel = "noopener";
    view.textContent = t("staff.site.viewOnSite") + " ↗";
    head.appendChild(keyEl);
    head.appendChild(status);
    head.appendChild(view);
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
      setTimeout(() => { if (status.classList.contains("saved")) { status.textContent = ""; status.className = "ed-field-status"; } }, 1600);
    }
    function commit(val, fromReset) {
      const before = getOverride(edLang, r.key);
      const oldEffective = before != null ? before : I.base(r.key, edLang);
      setOverride(edLang, r.key, val);
      const nowOverridden = getOverride(edLang, r.key) != null;
      row.classList.toggle("is-edited", nowOverridden);
      reset.style.display = nowOverridden ? "" : "none";
      if (String(oldEffective) !== String(val)) {
        logEdit({ type: "text", key: r.key, lang: edLang, from: String(oldEffective), to: String(val) });
      }
      flashSaved();
      // keep every language in sync
      autoTranslateField(r.key, edLang, val, status);
    }
    input.addEventListener("change", () => commit(input.value, false));
    reset.addEventListener("click", () => {
      input.value = I.base(r.key, edLang);
      commit(input.value, true);
    });
    return row;
  }

  /* ---- photo manager (every section's photo set) ---- */
  function isVideoUrl(u) { return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u || ""); }

  function pickImageFile(cb) {
    const file = document.createElement("input");
    file.type = "file"; file.accept = "image/*"; file.style.display = "none";
    document.body.appendChild(file);
    file.addEventListener("change", () => {
      const f = file.files[0];
      file.remove();
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) { U.toast(t("staff.site.imgTooBig"), "error"); return; }
      const reader = new FileReader();
      reader.onload = (e) => cb({ src: e.target.result, video: false });
      reader.onerror = () => U.toast(t("staff.site.imgTooBig"), "error");
      reader.readAsDataURL(f);
    });
    file.click();
  }

  function commitMedia(det, s, newItems) {
    MED.setItems(s.id, newItems);
    logEdit({ type: "photo", setId: s.id, label: s.labelKey, count: newItems.length });
    fillSet(det, s);
    U.toast(t("staff.site.saved"), "success");
  }

  function buildTile(det, s, items, idx) {
    const it = items[idx];
    const tile = document.createElement("div");
    tile.className = "ed-tile" + (it.video ? " is-video" : "");
    const media = document.createElement(it.video ? "video" : "img");
    media.src = encodeURI(it.src);
    if (it.video) { media.muted = true; media.setAttribute("playsinline", ""); media.setAttribute("preload", "metadata"); }
    else { media.loading = "lazy"; media.alt = ""; }
    tile.appendChild(media);
    tile.appendChild((function () {
      const n = document.createElement("span");
      n.className = "ed-tile-num"; n.textContent = (idx + 1);
      return n;
    })());

    const bar = document.createElement("div");
    bar.className = "ed-tile-bar";
    function btn(txt, title, fn, cls) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ed-tile-btn" + (cls ? " " + cls : "");
      b.textContent = txt; b.title = title; b.setAttribute("aria-label", title);
      b.addEventListener("click", fn);
      return b;
    }
    const left = btn("◀", t("staff.site.moveLeft"), () => {
      if (idx === 0) return;
      const arr = items.slice(); const tmp = arr[idx - 1]; arr[idx - 1] = arr[idx]; arr[idx] = tmp;
      commitMedia(det, s, arr);
    });
    const right = btn("▶", t("staff.site.moveRight"), () => {
      if (idx >= items.length - 1) return;
      const arr = items.slice(); const tmp = arr[idx + 1]; arr[idx + 1] = arr[idx]; arr[idx] = tmp;
      commitMedia(det, s, arr);
    });
    const rep = btn("⟳", t("staff.site.replace"), () => {
      pickImageFile((item) => { const arr = items.slice(); arr[idx] = item; commitMedia(det, s, arr); });
    });
    const rem = btn("✕", t("staff.site.remove"), () => {
      const arr = items.slice(); arr.splice(idx, 1); commitMedia(det, s, arr);
    }, "danger");
    if (idx === 0) left.disabled = true;
    if (idx === items.length - 1) right.disabled = true;
    bar.appendChild(left); bar.appendChild(right); bar.appendChild(rep); bar.appendChild(rem);
    tile.appendChild(bar);
    return tile;
  }

  function buildAddTile(det, s) {
    const tile = document.createElement("div");
    tile.className = "ed-tile ed-tile-add";
    const up = document.createElement("button");
    up.type = "button"; up.className = "ed-add-up";
    up.textContent = "＋ " + t("staff.site.upload");
    up.addEventListener("click", () => {
      pickImageFile((item) => { const arr = MED.items(s.id); arr.push(item); commitMedia(det, s, arr); });
    });
    const urlForm = document.createElement("form");
    urlForm.className = "ed-add-url";
    const urlInput = document.createElement("input");
    urlInput.type = "text"; urlInput.placeholder = t("staff.site.addUrlPh");
    urlForm.appendChild(urlInput);
    urlForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = urlInput.value.trim();
      if (!v) return;
      const arr = MED.items(s.id);
      arr.push({ src: v, video: isVideoUrl(v) });
      commitMedia(det, s, arr);
    });
    tile.appendChild(up);
    tile.appendChild(urlForm);
    return tile;
  }

  function fillSet(det, s) {
    const open = det.open;
    det.innerHTML = "";
    det.className = "ed-mset" + (MED.isOverridden(s.id) ? " is-edited" : "");
    det.open = open;
    const items = MED.items(s.id);

    const sum = document.createElement("summary");
    sum.innerHTML =
      '<span class="ed-mset-thumb"></span>' +
      '<span class="ed-mset-title"></span>' +
      '<span class="ed-mset-count"></span>';
    const th = sum.querySelector(".ed-mset-thumb");
    if (items[0]) {
      const im = document.createElement(items[0].video ? "video" : "img");
      im.src = encodeURI(items[0].src);
      if (items[0].video) im.muted = true; else im.loading = "lazy";
      th.appendChild(im);
    } else th.classList.add("empty");
    sum.querySelector(".ed-mset-title").textContent = t(s.labelKey);
    sum.querySelector(".ed-mset-count").textContent =
      items.length + (MED.isOverridden(s.id) ? " · " + t("staff.site.edited") : "");
    det.appendChild(sum);

    const body = document.createElement("div");
    body.className = "ed-mset-body";

    const toolbar = document.createElement("div");
    toolbar.className = "ed-mset-toolbar";
    const viewLink = document.createElement("a");
    viewLink.className = "ed-field-view";
    viewLink.href = siteUrl(s.section, null);
    viewLink.target = "_blank"; viewLink.rel = "noopener";
    viewLink.textContent = t("staff.site.viewOnSite") + " ↗";
    toolbar.appendChild(viewLink);
    if (MED.isOverridden(s.id)) {
      const rs = document.createElement("button");
      rs.type = "button"; rs.className = "ed-field-reset";
      rs.textContent = t("staff.site.resetSet");
      rs.addEventListener("click", () => {
        if (!confirm(t("staff.site.resetSetConfirm"))) return;
        MED.reset(s.id);
        logEdit({ type: "photoReset", setId: s.id, label: s.labelKey });
        fillSet(det, s);
        U.toast(t("staff.site.saved"), "success");
      });
      toolbar.appendChild(rs);
    }
    body.appendChild(toolbar);

    const grid = document.createElement("div");
    grid.className = "ed-tiles";
    items.forEach((it, idx) => grid.appendChild(buildTile(det, s, items, idx)));
    grid.appendChild(buildAddTile(det, s));
    body.appendChild(grid);
    det.appendChild(body);
  }

  function renderMediaSets() {
    const wrap = document.getElementById("edMediaSets");
    if (!wrap || !MED) return;
    wrap.innerHTML = "";
    MED.sets().forEach((s) => {
      const det = document.createElement("details");
      det.className = "ed-mset";
      wrap.appendChild(det);
      fillSet(det, s);
    });
  }

  /* ---- previous edits (history) ---- */
  function renderHistory() {
    const wrap = document.getElementById("edHistory");
    if (!wrap) return;
    const c = S.read("content", {}) || {};
    const log = Array.isArray(c.editLog) ? c.editLog.slice().reverse() : [];
    if (!log.length) { wrap.innerHTML = '<p class="muted">' + esc(t("staff.site.historyEmpty")) + "</p>"; return; }
    wrap.innerHTML = "";
    log.forEach((e) => {
      const row = document.createElement("div");
      row.className = "ed-hist-row";
      let desc = "";
      if (e.type === "text") {
        desc = t("staff.site.histText").replace("{key}", e.key).replace("{lang}", I.LANG_NAMES[e.lang] || e.lang);
      } else if (e.type === "photo") {
        desc = t("staff.site.histPhoto").replace("{set}", t(e.label)).replace("{n}", e.count);
      } else if (e.type === "photoReset") {
        desc = t("staff.site.histPhotoReset").replace("{set}", t(e.label));
      } else if (e.type === "reset") {
        desc = t("staff.site.histReset");
      } else { desc = e.type; }

      row.innerHTML =
        '<div class="eh-head"><span class="eh-who"></span><span class="eh-time"></span></div>' +
        '<div class="eh-desc"></div>';
      row.querySelector(".eh-who").textContent = e.userName || "—";
      row.querySelector(".eh-time").textContent = new Date(e.ts).toLocaleString();
      row.querySelector(".eh-desc").textContent = desc;
      if (e.type === "text") {
        const diff = document.createElement("div");
        diff.className = "eh-diff";
        diff.innerHTML = '<span class="eh-from"></span><span class="eh-arrow">→</span><span class="eh-to"></span>';
        diff.querySelector(".eh-from").textContent = (e.from || "").slice(0, 90) || "—";
        diff.querySelector(".eh-to").textContent = (e.to || "").slice(0, 90) || "—";
        row.appendChild(diff);
      }
      wrap.appendChild(row);
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
    delete c.overrides; delete c.images; delete c.theme; delete c.media;
    delete c.heroImg; delete c.heroTitle; delete c.heroLede;
    S.write("content", c);
    logEdit({ type: "reset" });
    edSearchQ = "";
    const search = document.getElementById("edSearch");
    if (search) search.value = "";
    renderSite();
    U.toast(t("staff.site.resetEditsDone"), "success");
  }

  /* ====================  STAFF MANAGEMENT (admin)  ==================== */
  // Username convention: first letter of first name + last name, lowercased.
  // Matches the email alias format (initiallastname@jpark.hotel) used everywhere.
  function autoUsername(name) {
    const parts = (name || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    return parts.length > 1 ? parts[0][0] + parts[parts.length - 1] : parts[0];
  }

  // Pending staff edits: { [id]: { active?, deleted? } }. Applied to the
  // server (and the local store) only when the admin clicks "Save changes".
  let pendingTeamChanges = {};

  function hasPendingTeam() {
    return Object.keys(pendingTeamChanges).length > 0;
  }

  function teamRowEffective(u) {
    const p = pendingTeamChanges[u.id] || {};
    return {
      id: u.id, name: u.name, role: u.role, username: u.username,
      active: p.active !== undefined ? p.active : u.active,
      deleted: !!p.deleted,
    };
  }

  function updateTeamActionsBar() {
    const bar = document.getElementById("teamActions");
    const hint = document.getElementById("teamPendingHint");
    const saveBtn = document.getElementById("teamSaveBtn");
    const undoBtn = document.getElementById("teamUndoBtn");
    if (!bar) return;
    const count = Object.keys(pendingTeamChanges).length;
    bar.hidden = count === 0;
    if (saveBtn) saveBtn.disabled = count === 0;
    if (undoBtn) undoBtn.disabled = count === 0;
    if (hint) hint.textContent = count ? (t("staff.team.pendingHint") + " (" + count + ")") : "";
  }

  function renderTeam() {
    if (!isAdmin()) return;
    const wrap = document.getElementById("teamList");
    wrap.innerHTML = "";
    const live = S.list("staff");
    const liveIds = new Set(live.map((u) => u.id));
    Object.keys(pendingTeamChanges).forEach((id) => {
      if (!liveIds.has(id)) delete pendingTeamChanges[id];
    });
    live.forEach((u) => {
      const eff = teamRowEffective(u);
      const row = document.createElement("div");
      row.className = "team-row" + (eff.deleted ? " pending-remove" : "") +
        (pendingTeamChanges[u.id] ? " pending" : "");
      const isMe = u.id === session.id;
      row.innerHTML =
        '<span class="tr-name">' + esc(eff.name) +
          (eff.deleted ? ' <em class="tr-tag">(' + esc(t("staff.team.pendingRemove")) + ")</em>" : "") +
        "</span>" +
        '<span class="tr-role ' + (eff.role === "admin" ? "admin" : "staff") + '">' + esc(t(eff.role === "admin" ? "staff.role.admin" : "staff.role.staff")) + "</span>" +
        '<span class="tr-status ' + (eff.active ? "active" : "suspended") + '">' + esc(t(eff.active ? "staff.team.active" : "staff.team.suspended")) + "</span>" +
        '<span class="tr-spacer"></span>';
      if (isMe) {
        row.innerHTML += '<span class="you-tag">(' + esc(t("staff.team.you")) + ")</span>";
      } else if (eff.deleted) {
        row.innerHTML +=
          '<button class="btn-activate" data-act="restore">' + esc(t("staff.team.restore")) + "</button>";
      } else {
        const toggleLabel = eff.active ? t("staff.team.suspend") : t("staff.team.activate");
        row.innerHTML +=
          '<button class="' + (eff.active ? "" : "btn-activate") + '" data-act="toggle">' + esc(toggleLabel) + "</button>" +
          '<button data-act="remove">' + esc(t("staff.team.remove")) + "</button>";
      }
      const tg = row.querySelector('[data-act="toggle"]');
      const rm = row.querySelector('[data-act="remove"]');
      const rs = row.querySelector('[data-act="restore"]');
      if (tg) tg.addEventListener("click", () => {
        const cur = teamRowEffective(u);
        const next = !cur.active;
        const p = Object.assign({}, pendingTeamChanges[u.id] || {});
        if (next === u.active) delete p.active; else p.active = next;
        if (Object.keys(p).length === 0) delete pendingTeamChanges[u.id];
        else pendingTeamChanges[u.id] = p;
        renderTeam();
      });
      if (rm) rm.addEventListener("click", () => {
        pendingTeamChanges[u.id] = Object.assign({}, pendingTeamChanges[u.id] || {}, { deleted: true });
        renderTeam();
      });
      if (rs) rs.addEventListener("click", () => {
        const p = Object.assign({}, pendingTeamChanges[u.id] || {});
        delete p.deleted;
        if (Object.keys(p).length === 0) delete pendingTeamChanges[u.id];
        else pendingTeamChanges[u.id] = p;
        renderTeam();
      });
      wrap.appendChild(row);
    });
    updateTeamActionsBar();
  }

  async function saveTeamChanges() {
    if (!hasPendingTeam()) return;
    const API = window.JPark && window.JPark.api;
    const ids = Object.keys(pendingTeamChanges);
    let failed = 0;
    for (const id of ids) {
      const p = pendingTeamChanges[id];
      if (p.deleted) {
        if (API) {
          const res = await API.del("/api/auth/staff/" + encodeURIComponent(id));
          if (res && res.error && !res.offline) { failed++; continue; }
        }
        S.remove("staff", id);
        // Also strip from cached Team Status (employees board) so the user
        // disappears immediately on this tab even before the next API fetch.
        try {
          const edits = JSON.parse(localStorage.getItem("jpark.employeeEdits") || "{}") || {};
          if (edits[id]) { delete edits[id]; localStorage.setItem("jpark.employeeEdits", JSON.stringify(edits)); }
        } catch (_) {}
        try { localStorage.removeItem("jpark.db.avatar_" + id); } catch (_) {}
      } else if (p.active !== undefined) {
        if (API) {
          const res = await API.patch("/api/auth/staff/" + encodeURIComponent(id), { active: !!p.active });
          if (res && res.error && !res.offline) { failed++; continue; }
        }
        S.update("staff", id, { active: !!p.active });
      }
    }
    pendingTeamChanges = {};
    await _syncStaffList();
    // Re-fetch Team Status board if it's mounted, so removed users disappear
    // from the shift board immediately (server rows are gone; cache is purged).
    const board = document.getElementById("empBoardMount");
    if (board && board._empBoard) board._empBoard.load();
    renderTeam();
    if (failed) U.toast(t("staff.team.saveErr"), "error");
    else U.toast(t("staff.team.saved"), "success");
  }

  function undoTeamChanges() {
    if (!hasPendingTeam()) return;
    pendingTeamChanges = {};
    renderTeam();
    U.toast(t("staff.team.undone"), "success");
  }

  function refreshUsernamePreview() {
    const nameInput = document.getElementById("tmName");
    const preview = document.getElementById("tmUserPreview");
    if (!nameInput || !preview) return;
    preview.value = autoUsername(nameInput.value) || "";
  }

  async function addStaff(e) {
    e.preventDefault();
    const err = document.getElementById("teamError");
    err.textContent = "";
    const name = document.getElementById("tmName").value.trim();
    const role = document.getElementById("tmRole").value;
    if (!name) { err.textContent = t("staff.team.needName"); return; }
    const user = autoUsername(name);
    if (!user) { err.textContent = t("staff.team.needName"); return; }

    const API = window.JPark && window.JPark.api;
    if (API) {
      const res = await API.post("/api/auth/register", {
        username: user, password: DEFAULT_STAFF_PASSWORD, name: name, role: role,
      });
      if (res.error && !res.offline) {
        err.textContent = res.status === 409 ? t("staff.team.userTaken") : res.error;
        return;
      }
      if (!res.offline) {
        document.getElementById("teamForm").reset();
        refreshUsernamePreview();
        U.toast(t("staff.team.added"), "success");
        await _syncStaffList();
        renderTeam();
        return;
      }
    }
    // Offline fallback — localStorage only
    if (S.list("staff").some((x) => (x.username || "").toLowerCase() === user.toLowerCase())) {
      err.textContent = t("staff.team.userTaken"); return;
    }
    S.insert("staff", { name: name, username: user, password: DEFAULT_STAFF_PASSWORD, role: role, active: true, mustChange: true });
    document.getElementById("teamForm").reset();
    refreshUsernamePreview();
    U.toast(t("staff.team.added"), "success");
  }

  async function _syncStaffList() {
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    const data = await API.get("/api/auth/staff");
    if (!Array.isArray(data)) return;
    const staff = data.map(function (e) {
      return {
        id: e.id, name: e.name, username: e.username || e.id,
        role: e.role === "admin" ? "admin" : "staff",
        active: e.active !== false, email: e.email,
        avatar_updated_at: e.avatar_updated_at || null,
      };
    });
    S.write("staff", staff);
    _syncAvatars(staff);
  }

  /* ====================  BADGES + NOTIFICATIONS  ==================== */
  function updateBadges() {
    const pending = S.list("requests").filter((r) => r.status === "pending").length;
    // Live-chat badge is per-user: count only threads assigned to me that
    // still have unread guest messages. That's why a 1/2 only ever shows on
    // the account the guest is currently connected to.
    const chatUnread = myAssignedChats().filter((c) => c.unreadForStaff > 0).length;
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
  function playChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.45);
    } catch (_) {}
  }
  function notify(msg) {
    // Show the in-page toast when the console is visible, fall back to the
    // OS-level Notification only when it isn't — otherwise the assigned
    // staff sees the same ping twice (toast + system popup) for one event.
    const visible = typeof document.hidden === "boolean" ? !document.hidden : true;
    if (visible) {
      U.toast(msg);
    } else if ("Notification" in window && Notification.permission === "granted") {
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
    // Fire sound/notification only when a thread has a genuinely new lastMsg
    // that we haven't seen yet, and only for threads the staff isn't currently
    // viewing. This prevents re-notifying every time the poll restores the
    // server's unread count for the active thread.
    let shouldNotify = false;
    myAssignedChats().forEach(function (c) {
      if (c.id === selectedThread) {
        lastSeenChatMsg[c.id] = c.lastMsg;  // viewing — mark seen, no ping
      } else if ((c.unreadForStaff || 0) > 0 && c.lastMsg !== lastSeenChatMsg[c.id]) {
        shouldNotify = true;
        lastSeenChatMsg[c.id] = c.lastMsg;
      }
    });
    if (shouldNotify) { notify(t("staff.notif.chat")); playChime(); }
    lastChatUnread = totalChatUnread();
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

  /* ====================  PROFILE MODAL  ==================== */
  function openProfileModal() {
    const modal = document.getElementById("profileModal");
    if (!modal || !session) return;
    const pmPhoto = document.getElementById("pmPhoto");
    const dataUrl = getAvatarDataUrl(session.id);
    if (dataUrl) {
      pmPhoto.innerHTML = '<img src="' + esc(dataUrl) + '" alt="Profile photo" />';
    } else {
      pmPhoto.textContent = (session.name || "?").charAt(0).toUpperCase();
    }
    const pmDisplayName = document.getElementById("pmDisplayName");
    if (pmDisplayName) pmDisplayName.textContent = session.name || "";
    const pmDisplayEmail = document.getElementById("pmDisplayEmail");
    if (pmDisplayEmail) {
      const tok = J.authToken && J.authToken.decode();
      pmDisplayEmail.textContent = (tok && tok.email) || "";
    }
    ["pmOldPass", "pmNewPass", "pmConfirmPass"].forEach((id) => {
      const el = document.getElementById(id); if (el) el.value = "";
    });
    document.getElementById("pmPassError").textContent = "";
    modal.hidden = false;
  }

  function closeProfileModal() {
    const modal = document.getElementById("profileModal");
    if (modal) modal.hidden = true;
  }

  async function submitProfilePassword() {
    const err = document.getElementById("pmPassError"); err.textContent = "";
    const oldPass = document.getElementById("pmOldPass").value;
    const p1     = document.getElementById("pmNewPass").value;
    const p2     = document.getElementById("pmConfirmPass").value;
    if (!oldPass) { err.textContent = t("profile.enterOld"); return; }
    if (p1.length < 6) { err.textContent = t("staff.login.passTooShort"); return; }
    if (p1 !== p2)     { err.textContent = t("staff.login.passMismatch"); return; }
    const API = window.JPark && window.JPark.api;
    if (API) {
      const res = await API.post("/api/auth/change-password", { currentPassword: oldPass, newPassword: p1 });
      if (res.error && !res.offline) { err.textContent = res.error; return; }
      if (!res.offline) { U.toast(t("profile.passUpdated"), "success"); closeProfileModal(); return; }
    }
    const u = S.find("staff", session.id);
    if (!u) { err.textContent = t("staff.login.error"); return; }
    if (u.password && u.password !== oldPass) { err.textContent = t("profile.oldIncorrect"); return; }
    S.update("staff", session.id, { password: p1 });
    U.toast(t("profile.passUpdated"), "success");
    closeProfileModal();
  }

  function profileForgotPass() {
    if (!session) return;
    S.insert("resetRequests", {
      kind: "password", username: session.username || session.name,
      note: "Requested from profile page.", handled: false
    });
    U.toast(t("staff.login.requestSent"), "success");
    closeProfileModal();
  }

  /* ====================  INIT  ==================== */
  document.addEventListener("DOMContentLoaded", () => {
    populateLangSelects();

    // login form — async so we can call the server-side auth API
    document.getElementById("loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = document.getElementById("loginError");
      const btn = document.getElementById("loginForm").querySelector('[type="submit"]');
      if (btn) btn.disabled = true;
      const res = await login(
        document.getElementById("loginUser").value,
        document.getElementById("loginPass").value
      );
      if (btn) btn.disabled = false;
      if (res.error) { err.textContent = res.error; return; }
      err.textContent = "";
      if (res.mustChange) { startPasswordSetup(res.staffId); return; }
      completeLogin(res.user);
    });

    // login self-service: switch between sign in / new staff / forgot views
    document.querySelectorAll("[data-auth-go]").forEach((b) =>
      b.addEventListener("click", () => showAuthView(b.dataset.authGo)));

    // New Staff Account — step 1: verify username + temporary password
    const nsContinue = document.getElementById("nsContinue");
    if (nsContinue) nsContinue.addEventListener("click", () => {
      const err = document.getElementById("nsError"); err.textContent = "";
      const user = document.getElementById("nsUser").value.trim();
      const pass = document.getElementById("nsPass").value;
      const u = S.list("staff").find((x) => x.username.toLowerCase() === user.toLowerCase());
      if (!u) { err.textContent = t("staff.login.noAccount"); return; }
      if (!u.active) { err.textContent = t("staff.login.disabled"); return; }
      if (!u.mustChange) { err.textContent = t("staff.login.alreadySetup"); return; }
      if (pass !== DEFAULT_STAFF_PASSWORD) { err.textContent = t("staff.login.badTempPass"); return; }
      nsUserId = u.id;
      nsShowStep(2);
    });

    // New Staff Account — step 2: set the new password and sign in
    document.getElementById("newStaffForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!nsUserId) return; // step 1 not completed yet
      const err = document.getElementById("nsError2"); err.textContent = "";
      const p1 = document.getElementById("nsNew1").value;
      const p2 = document.getElementById("nsNew2").value;
      if (p1.length < 6) { err.textContent = t("staff.login.passTooShort"); return; }
      if (p1 !== p2) { err.textContent = t("staff.login.passMismatch"); return; }
      const u = S.find("staff", nsUserId);
      if (!u && !nsUserId) { err.textContent = t("staff.login.error"); showAuthView("signin"); return; }
      // Persist to backend — JWT already stored from the login step above.
      const API = window.JPark && window.JPark.api;
      if (API) {
        const res = await API.post("/api/auth/change-password", { newPassword: p1 });
        if (res.error && !res.offline) { err.textContent = res.error; return; }
      }
      if (u) S.update("staff", nsUserId, { password: p1, mustChange: false });
      const userObj = u
        ? { id: u.id, name: u.name, role: u.role, username: u.username }
        : { id: nsUserId, name: "", role: "frontdesk", username: "" };
      nsUserId = null;
      completeLogin(userObj);
    });

    // Forgot Password — file a request to the admin Password Reset Requests inbox
    document.getElementById("forgotPassForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const err = document.getElementById("fpError"); err.textContent = "";
      const user = document.getElementById("fpUser").value.trim();
      if (!user) { err.textContent = t("staff.login.enterUser"); return; }
      S.insert("resetRequests", {
        kind: "password", username: user,
        note: document.getElementById("fpNote").value.trim(), handled: false
      });
      document.getElementById("forgotPassForm").reset();
      U.toast(t("staff.login.requestSent"), "success");
      showAuthView("signin");
    });

    // Forgot Username — file a request to the admin Password Reset Requests inbox
    document.getElementById("forgotUserForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const err = document.getElementById("fuError"); err.textContent = "";
      const name = document.getElementById("fuName").value.trim();
      if (!name) { err.textContent = t("staff.login.enterName"); return; }
      S.insert("resetRequests", {
        kind: "username", name: name,
        contact: document.getElementById("fuContact").value.trim(), handled: false
      });
      document.getElementById("forgotUserForm").reset();
      U.toast(t("staff.login.requestSent"), "success");
      showAuthView("signin");
    });

    // nav
    document.querySelectorAll(".nav-item").forEach((b) =>
      b.addEventListener("click", () => selectPanel(b.dataset.panel)));

    document.getElementById("dsSignout").addEventListener("click", () => { stopApiPolling(); setSession(null); if (J.authToken) J.authToken.clear(); showLogin(); });

    // avatar / profile
    const avatarWrap = document.getElementById("dsAvatarWrap");
    const avatarInput = document.getElementById("avatarInput");
    if (avatarWrap) {
      avatarWrap.title = "";
      avatarWrap.addEventListener("click", openProfileModal);
    }
    if (avatarInput) {
      avatarInput.addEventListener("change", () => {
        const file = avatarInput.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          U.toast("Image too large — please use a file under 5 MB.", "error");
          avatarInput.value = "";
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          avatarInput.value = "";
          if (!session) { U.toast("Not signed in — photo not saved.", "error"); return; }
          // Downscale to ~256px square JPEG (~20–30KB) before storing, so the
          // server row stays small and teammates can pull it cheaply.
          const img = new Image();
          img.onload = async () => {
            const MAX = 256;
            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const c = document.createElement("canvas");
            c.width = w; c.height = h;
            const ctx = c.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = c.toDataURL("image/jpeg", 0.82);
            let res;
            try {
              res = await setAvatarDataUrl(session.id, dataUrl);
            } catch (_) {
              U.toast("Could not save photo — storage full.", "error");
              return;
            }
            renderAvatarInSidebar();
            const pmPhoto = document.getElementById("pmPhoto");
            const modal = document.getElementById("profileModal");
            if (pmPhoto && modal && !modal.hidden) {
              pmPhoto.innerHTML = '<img src="' + esc(dataUrl) + '" alt="Profile photo" />';
            }
            if (res && res.error && !res.offline) {
              U.toast("Photo saved locally but server upload failed: " + res.error, "error");
            } else if (res && res.offline) {
              U.toast("Photo saved locally — will sync when back online.", "success");
            } else {
              U.toast("Profile photo updated!", "success");
            }
            if (panel === "messages") renderMessages();
          };
          img.onerror = () => { U.toast("Failed to read image. Please try again.", "error"); };
          img.src = e.target.result;
        };
        reader.onerror = () => {
          avatarInput.value = "";
          U.toast("Failed to read image. Please try again.", "error");
        };
        reader.readAsDataURL(file);
      });
    }

    // profile modal
    document.getElementById("profileModalClose").addEventListener("click", closeProfileModal);
    document.getElementById("profileModal").addEventListener("click", (e) => {
      if (e.target === document.getElementById("profileModal")) closeProfileModal();
    });
    document.getElementById("pmChangePhoto").addEventListener("click", () => { if (avatarInput) avatarInput.click(); });
    document.getElementById("pmSavePass").addEventListener("click", submitProfilePassword);
    document.getElementById("pmForgotPass").addEventListener("click", profileForgotPass);

    // messages compose
    document.getElementById("msgComposeBtn").addEventListener("click", openCompose);
    document.getElementById("msgComposeClose").addEventListener("click", closeCompose);
    document.getElementById("msgDiscardBtn").addEventListener("click", closeCompose);
    document.getElementById("msgSendBtn").addEventListener("click", sendMessage);

    // messages sidebar nav
    document.querySelectorAll("#msgSidebar .msg-nav-item").forEach((b) => {
      b.addEventListener("click", () => {
        msgView = b.dataset.view;
        msgDetailId = null;
        msgMultiSelect = false;
        selectedMsgIds.clear();
        renderMessages();
      });
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
    document.querySelectorAll("#edTabs .ed-tab").forEach((b) => {
      b.addEventListener("click", () => {
        edTab = b.dataset.edtab;
        renderEditTabs();
        if (edTab === "history") renderHistory();
      });
    });
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
    const tmName = document.getElementById("tmName");
    if (tmName) tmName.addEventListener("input", refreshUsernamePreview);
    const teamSaveBtn = document.getElementById("teamSaveBtn");
    if (teamSaveBtn) teamSaveBtn.addEventListener("click", saveTeamChanges);
    const teamUndoBtn = document.getElementById("teamUndoBtn");
    if (teamUndoBtn) teamUndoBtn.addEventListener("click", undoTeamChanges);

    // real-time subscriptions
    S.on("requests", onRequestsChange);
    S.on("chats", onChatsChange);
    S.on("messages", () => { updateBadges(); if (panel === "messages") renderMessages(); });
    S.on("guestBookings", onBookingsChange);
    S.on("resetRequests", () => { updateBadges(); if (panel === "messages") renderMessages(); });
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
