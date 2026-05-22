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

    selectPanel(panel);
    updateBadges();
    requestNotifyPermission();
  }

  /* ====================  PANELS  ==================== */
  function selectPanel(name) {
    if ((name === "site" || name === "team") && !isAdmin()) name = "requests";
    panel = name;
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.panel === name));
    document.querySelectorAll(".dash-panel").forEach((p) => p.classList.toggle("show", p.id === "panel-" + name));
    renderPanel();
  }

  function renderPanel() {
    if (panel === "requests") renderRequests();
    else if (panel === "chat") renderChat();
    else if (panel === "company") renderCompany();
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

  /* ====================  COMPANY MESSAGES  ==================== */
  function renderCompany() {
    const feed = document.getElementById("companyFeed");
    const msgs = S.list("company").slice().sort((a, b) => a.createdAt - b.createdAt);
    if (!msgs.length) { feed.innerHTML = '<p class="muted">' + esc(t("staff.company.empty")) + "</p>"; return; }
    feed.innerHTML = "";
    msgs.forEach((m) => {
      const div = document.createElement("div");
      div.className = "company-msg";
      div.innerHTML =
        '<div class="cm-head"><span class="cm-author">' + esc(m.author) + "</span>" +
        '<span class="cm-role ' + (m.role === "admin" ? "admin" : "staff") + '">' + esc(t(m.role === "admin" ? "staff.role.admin" : "staff.role.staff")) + "</span>" +
        '<span class="cm-time">' + esc(U.timeAgo(m.createdAt)) + "</span></div>" +
        '<div class="cm-text"></div>';
      div.querySelector(".cm-text").textContent = m.text;
      feed.appendChild(div);
    });
    feed.scrollTop = feed.scrollHeight;
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
    setCount("countRequests", pending);
    setCount("countChat", chatUnread);
    const total = pending + chatUnread;
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

    // company compose
    document.getElementById("companyForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const inp = document.getElementById("companyInput");
      const text = inp.value.trim();
      if (!text) return;
      S.insert("company", { author: session.name, role: session.role, text: text });
      inp.value = "";
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
    S.on("company", () => { if (panel === "company") renderCompany(); });
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
      }
    });

    // open requested panel from hash (e.g. staff.html#site)
    const hash = (location.hash || "").replace("#", "");
    if (["requests", "chat", "company", "site", "team"].includes(hash)) panel = hash;

    // boot
    session = validSession(getSession());
    if (session) showDash(); else showLogin();
  });
})();
