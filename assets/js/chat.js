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
  const gid = S.guestId();

  const TOPICS = [
    { id: "checkin", a: "chat.a.checkin", kw: ["check-in","check in","checkout","check-out","check out","late check","เช็คอิน","เช็คเอาท์","เลื่อนเช็ค","チェックイン","チェックアウト","入住","退房"] },
    { id: "wifi",    a: "chat.a.wifi",    kw: ["wifi","wi-fi","internet","password","network","รหัสผ่าน","อินเทอร์เน็ต","ไวไฟ","パスワード","ネット","无线","网络","密码","無線","網路","密碼"] },
    { id: "pool",    a: "chat.a.pool",    kw: ["pool","swim","onsen","spa","สระ","ว่ายน้ำ","ออนเซ็น","プール","温泉","泳池","游泳","溫泉"] },
    { id: "dining",  a: "chat.a.dining",  kw: ["dining","restaurant","eat","food","breakfast","dinner","tsubaki","อาหาร","ร้าน","ทาน","อาหารเช้า","レストラン","食事","朝食","餐","吃","用餐","餐廳","餐厅"] },
    { id: "coffee",  a: "chat.a.coffee",  kw: ["coffee","cocktail","bar","midnight","drink","กาแฟ","ค็อกเทล","บาร์","コーヒー","カクテル","咖啡","鸡尾酒","雞尾酒","酒吧"] },
    { id: "parking", a: "chat.a.parking", kw: ["park","parking","car","ที่จอด","รถ","駐車","停车","停車"] }
  ];
  const QUICK = ["checkin", "wifi", "pool", "dining", "coffee", "parking"];

  let panel, fab, body, badge, openState = false;
  let pollTimer = null;
  let lastMsgCount = 0; // for detecting new staff replies

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

  async function apiPostMessage(from, text, opts) {
    const API = window.JPark.api;
    if (!API) return;
    const g = S.getSession("guest");
    await API.post("/api/chat", {
      guestId: gid,
      guestName: g ? g.name : (getLocalConv() || {}).guestName || "Guest",
      room: g ? g.room : (getLocalConv() || {}).room || "",
      from: from,
      fromName: opts && opts.staffName ? opts.staffName : (from === "guest" ? null : "J Park"),
      text,
      lang: I.getLang(),
      escalated: !!(opts && opts.escalated),
    });
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

  async function syncFromApi() {
    const remote = await apiGetConv();
    if (!remote || !remote.messages) return;
    const conv = ensureLocalConv();
    if (remote.messages.length > lastMsgCount) {
      // New messages arrived — check for new staff replies
      const newMsgs = remote.messages.slice(lastMsgCount);
      const hasStaffReply = newMsgs.some((m) => m.from === "staff");
      lastMsgCount = remote.messages.length;
      // Rebuild local conv from API truth
      const rebuilt = Object.assign({}, conv, {
        messages: remote.messages.map((m) => ({
          id: m.id, from: m.from, text: m.text,
          staffName: m.fromName, lang: m.lang, ts: m.ts,
        })),
        escalated: remote.escalated,
        unreadForGuest: remote.unreadForGuest || 0,
        lastMsg: remote.lastMsg || conv.lastMsg,
        lastAt: remote.lastAt || conv.lastAt,
      });
      saveLocalConv(rebuilt);
      if (openState) { render(); }
      else if (hasStaffReply) {
        rebuilt.unreadForGuest = (rebuilt.unreadForGuest || 0) + newMsgs.filter((m) => m.from === "staff").length;
        setBadge(rebuilt.unreadForGuest);
      }
    }
  }

  /* ─────────────── bot ───────────────────────────────────────────────────── */
  function botAnswer(text) {
    const lc = text.toLowerCase();
    for (const topic of TOPICS) {
      if (topic.kw.some((k) => lc.indexOf(k) >= 0)) return t(topic.a);
    }
    return t("chat.a.default");
  }

  async function guestSend(text) {
    text = text.trim(); if (!text) return;
    await pushMessage("guest", text);
    render();
    const conv = getLocalConv();
    if (conv && conv.escalated) return;
    setTimeout(async () => {
      await pushMessage("bot", botAnswer(text));
      render();
    }, 650);
  }

  async function quickTopic(id) {
    const topic = TOPICS.find((x) => x.id === id);
    await pushMessage("guest", t("chat.quick." + id));
    render();
    setTimeout(async () => { await pushMessage("bot", t(topic.a)); render(); }, 500);
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
    const conv = ensureLocalConv();
    if (!conv.escalated) {
      conv.escalated = true;
      conv.unreadForStaff = (conv.unreadForStaff || 0) + 1;

      const staff = await fetchAvailableStaff();
      let msgText;
      if (staff.length) {
        const pick = staff[Math.floor(Math.random() * staff.length)];
        conv.assignedStaff = pick.name;
        msgText = t("chat.connectedTo").replace("{name}", pick.name);
      } else {
        msgText = t("chat.noStaffOnShift");
      }

      const msg = { id: S.genId(), from: "system", text: msgText, lang: I.getLang(), ts: Date.now() };
      conv.messages.push(msg); conv.lastMsg = msg.text; conv.lastAt = msg.ts;
      saveLocalConv(conv);
      apiPostMessage("system", msg.text, { escalated: true });
    }
    render();
  }

  /* ─────────────── rendering ─────────────────────────────────────────────── */
  function fromLabel(from) {
    if (from === "guest")  return t("chat.you");
    if (from === "staff")  return t("chat.staff");
    return t("chat.bot");
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
          if (m.lang && m.lang === cur) span.textContent = m.text;
          else JPark.translate.fill(span, m.text, div);
        }
        body.appendChild(div);
      });
    }
    body.scrollTop = body.scrollHeight;
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
    if (n > 0) { badge.textContent = n; badge.classList.add("show"); }
    else badge.classList.remove("show");
  }

  function open() {
    openState = true;
    panel.classList.add("open"); fab.style.display = "none";
    ensureLocalConv();
    const conv = getLocalConv();
    if (conv && conv.unreadForGuest) { conv.unreadForGuest = 0; saveLocalConv(conv); }
    setBadge(0);
    render();
    startPoll();
    setTimeout(() => { const inp = panel.querySelector(".chat-input input"); if (inp) inp.focus(); }, 60);
  }
  function close() {
    openState = false;
    panel.classList.remove("open"); fab.style.display = "grid";
    stopPoll();
  }

  function startPoll() {
    stopPoll();
    pollTimer = setInterval(syncFromApi, 5000);
  }
  function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
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
      '<div class="chat-quick"></div>' +
      '<form class="chat-input"><input type="text" placeholder="' + U.escapeHtml(t("chat.placeholder")) + '" aria-label="' + U.escapeHtml(t("chat.placeholder")) + '" /><button type="submit" aria-label="' + U.escapeHtml(t("chat.send")) + '">➤</button></form>';
    document.body.appendChild(panel);
    body = panel.querySelector(".chat-body");

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
  }

  document.addEventListener("DOMContentLoaded", () => {
    build();

    S.on("chats", () => {
      const conv = getLocalConv(); if (!conv) return;
      if (openState) render();
      else setBadge(conv.unreadForGuest || 0);
    });

    document.addEventListener("jpark:langchange", relabel);

    const conv = getLocalConv();
    if (conv && conv.unreadForGuest) setBadge(conv.unreadForGuest);

    // Pre-load API conversation count so badge is accurate
    apiGetConv().then((remote) => {
      if (remote && remote.messages) lastMsgCount = remote.messages.length;
    });
  });

  window.JPark.chat = {
    open,
    askAbout: function (title) {
      open();
      pushMessage("guest", title).then(() => { render(); escalate(); });
    },
  };
})();
