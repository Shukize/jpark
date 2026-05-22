/* ============================================================
   J Park Hotel — live chat widget
   Floating bubble with a scripted, multilingual assistant that
   answers common questions in the guest's language and can hand
   off to the real front desk (staff dashboard) in real time.
   ============================================================ */
(function () {
  "use strict";
  const S = window.JPark.store;
  const I = window.JPark.i18n;
  const U = window.JPark.util;
  const t = (k) => I.t(k);
  const gid = S.guestId();

  /* topic matching across all site languages */
  const TOPICS = [
    { id: "checkin", a: "chat.a.checkin", kw: ["check-in", "check in", "checkout", "check-out", "check out", "late check", "เช็คอิน", "เช็คเอาท์", "เลื่อนเช็ค", "チェックイン", "チェックアウト", "入住", "退房"] },
    { id: "wifi", a: "chat.a.wifi", kw: ["wifi", "wi-fi", "internet", "password", "network", "รหัสผ่าน", "อินเทอร์เน็ต", "ไวไฟ", "パスワード", "ネット", "无线", "网络", "密码", "無線", "網路", "密碼"] },
    { id: "pool", a: "chat.a.pool", kw: ["pool", "swim", "onsen", "spa", "สระ", "ว่ายน้ำ", "ออนเซ็น", "プール", "温泉", "泳池", "游泳", "溫泉"] },
    { id: "dining", a: "chat.a.dining", kw: ["dining", "restaurant", "eat", "food", "breakfast", "dinner", "tsubaki", "อาหาร", "ร้าน", "ทาน", "อาหารเช้า", "レストラン", "食事", "朝食", "餐", "吃", "用餐", "餐廳", "餐厅"] },
    { id: "coffee", a: "chat.a.coffee", kw: ["coffee", "cocktail", "bar", "midnight", "drink", "กาแฟ", "ค็อกเทล", "บาร์", "コーヒー", "カクテル", "咖啡", "鸡尾酒", "雞尾酒", "酒吧"] },
    { id: "parking", a: "chat.a.parking", kw: ["park", "parking", "car", "ที่จอด", "รถ", "駐車", "停车", "停車"] }
  ];
  const QUICK = ["checkin", "wifi", "pool", "dining", "coffee", "parking"];

  let panel, fab, body, badge, openState = false;

  /* ---------- conversation persistence ---------- */
  function getConv() {
    return S.list("chats").find((c) => c.id === gid) || null;
  }
  function saveConv(conv) {
    const all = S.list("chats");
    const i = all.findIndex((c) => c.id === gid);
    if (i >= 0) all[i] = conv; else all.push(conv);
    S.write("chats", all);
  }
  function ensureConv() {
    let conv = getConv();
    if (conv) return conv;
    const g = S.getSession("guest");
    conv = {
      id: gid,
      guestName: g ? g.name : "Guest",
      room: g ? g.room : "",
      lang: I.getLang(),
      escalated: false,
      unreadForStaff: 0,
      unreadForGuest: 0,
      lastMsg: "",
      lastAt: Date.now(),
      messages: [{ id: S.genId(), from: "bot", text: t("chat.greeting"), lang: I.getLang(), ts: Date.now() }]
    };
    saveConv(conv);
    return conv;
  }

  function pushMessage(from, text, opts) {
    const conv = ensureConv();
    const g = S.getSession("guest");
    if (g) { conv.guestName = g.name; conv.room = g.room; }
    conv.lang = I.getLang();
    conv.messages.push(Object.assign({ id: S.genId(), from: from, text: text, lang: I.getLang(), ts: Date.now() }, opts || {}));
    conv.lastMsg = text;
    conv.lastAt = Date.now();
    if (from === "guest") conv.unreadForStaff = (conv.unreadForStaff || 0) + 1;
    saveConv(conv);
  }

  /* ---------- bot ---------- */
  function botAnswer(text) {
    const lc = text.toLowerCase();
    for (const topic of TOPICS) {
      if (topic.kw.some((k) => lc.indexOf(k) >= 0)) return t(topic.a);
    }
    return t("chat.a.default");
  }

  function guestSend(text) {
    text = text.trim();
    if (!text) return;
    pushMessage("guest", text);
    render();
    const conv = getConv();
    if (conv && conv.escalated) return; // front desk handles free text now
    setTimeout(() => {
      pushMessage("bot", botAnswer(text));
      render();
    }, 650);
  }

  function quickTopic(id) {
    const topic = TOPICS.find((x) => x.id === id);
    pushMessage("guest", t("chat.quick." + id));
    render();
    setTimeout(() => { pushMessage("bot", t(topic.a)); render(); }, 500);
  }

  function escalate() {
    const conv = ensureConv();
    if (!conv.escalated) {
      conv.escalated = true;
      conv.unreadForStaff = (conv.unreadForStaff || 0) + 1;
      conv.messages.push({ id: S.genId(), from: "system", text: t("chat.connecting"), lang: I.getLang(), ts: Date.now() });
      conv.lastMsg = t("chat.connecting");
      conv.lastAt = Date.now();
      saveConv(conv);
    }
    render();
  }

  /* ---------- rendering ---------- */
  function fromLabel(from) {
    if (from === "guest") return t("chat.you");
    if (from === "staff") return t("chat.staff");
    return t("chat.bot");
  }

  function render() {
    const conv = getConv();
    body.innerHTML = '<p class="chat-langnote">' + U.escapeHtml(t("chat.langNote")) + "</p>";
    if (conv) {
      conv.messages.forEach((m) => {
        const div = document.createElement("div");
        div.className = "msg " + m.from;
        if (m.from === "system") {
          div.textContent = m.text;
        } else {
          div.innerHTML = '<span class="msg-from">' + U.escapeHtml(fromLabel(m.from)) + "</span>";
          const span = document.createElement("span");
          span.textContent = m.text;
          div.appendChild(span);
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
      b.type = "button";
      b.textContent = t("chat.quick." + id);
      b.addEventListener("click", () => quickTopic(id));
      q.appendChild(b);
    });
    const fd = document.createElement("button");
    fd.type = "button";
    fd.className = "cq-frontdesk";
    fd.textContent = t("chat.toFrontDesk");
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
    panel.classList.add("open");
    fab.style.display = "none";
    ensureConv();
    // clear guest unread
    const conv = getConv();
    if (conv && conv.unreadForGuest) { conv.unreadForGuest = 0; saveConv(conv); }
    setBadge(0);
    render();
    setTimeout(() => { const inp = panel.querySelector(".chat-input input"); if (inp) inp.focus(); }, 60);
  }
  function close() {
    openState = false;
    panel.classList.remove("open");
    fab.style.display = "grid";
  }

  /* ---------- build DOM ---------- */
  function build() {
    fab = document.createElement("button");
    fab.className = "chat-fab";
    fab.setAttribute("aria-label", t("chat.open"));
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
    const form = panel.querySelector(".chat-input");
    const input = form.querySelector("input");
    form.addEventListener("submit", (e) => { e.preventDefault(); guestSend(input.value); input.value = ""; });
  }

  function relabel() {
    if (!panel) return;
    panel.querySelector(".ch-title").textContent = t("chat.title");
    panel.querySelector(".ch-sub").textContent = t("chat.subtitle");
    const input = panel.querySelector(".chat-input input");
    input.placeholder = t("chat.placeholder");
    input.setAttribute("aria-label", t("chat.placeholder"));
    if (fab) fab.setAttribute("aria-label", t("chat.open"));
    render();
  }

  document.addEventListener("DOMContentLoaded", () => {
    build();

    // react to staff replies / other tabs
    S.on("chats", () => {
      const conv = getConv();
      if (!conv) return;
      if (openState) { render(); }
      else { setBadge(conv.unreadForGuest || 0); }
    });

    document.addEventListener("jpark:langchange", relabel);

    // show badge if a staff reply came in while away
    const conv = getConv();
    if (conv && conv.unreadForGuest) setBadge(conv.unreadForGuest);
  });

  /* expose for concierge "ask a question" */
  window.JPark.chat = {
    open: open,
    askAbout: function (title) {
      open();
      pushMessage("guest", title);
      render();
      escalate();
    }
  };
})();
