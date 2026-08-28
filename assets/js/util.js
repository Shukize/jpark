/* ============================================================
   J Park Hotel — shared UI helpers (toast, escaping, format)
   ============================================================ */
(function () {
  "use strict";

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toast(msg, type) {
    let wrap = document.getElementById("toastWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "toast-wrap";
      wrap.id = "toastWrap";
      document.body.appendChild(wrap);
    }
    const el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .4s, transform .4s";
      el.style.opacity = "0";
      el.style.transform = "translateY(10px)";
      setTimeout(() => el.remove(), 400);
    }, 3200);
  }

  function timeAgo(ts) {
    const lang = (window.JPark && window.JPark.i18n) ? window.JPark.i18n.getLang() : "en";
    const d = new Date(ts);
    try {
      return d.toLocaleString(lang === "th" ? "th-TH" : lang, {
        hour: "2-digit", minute: "2-digit", day: "numeric", month: "short"
      });
    } catch (_) {
      return d.toLocaleString();
    }
  }

  function money(n) {
    return "฿" + Number(n || 0).toLocaleString();
  }

  // Locale per site language, so a date's month name/calendar/digit style
  // (e.g. Thai month abbreviations + Buddhist year, not "Jul 2026") follows
  // whatever language the guest has selected, not a hardcoded en-GB format.
  var DATE_LOCALE = { th: "th-TH", en: "en-GB", ja: "ja-JP", "zh-Hans": "zh-CN", "zh-Hant": "zh-TW" };
  // `lang` overrides the site language. Only the receipt passes it — it may be
  // rendering a guest's copy in a language the logged-in staff member is not
  // using — and every other caller omits it and behaves exactly as before.
  function formatDate(iso, lang) {
    lang = lang || ((window.JPark && window.JPark.i18n) ? window.JPark.i18n.getLang() : "en");
    const locale = DATE_LOCALE[lang] || "en-GB";
    const d = new Date(iso + "T12:00:00");
    try {
      return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
    } catch (_) {
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }
  }

  // Clock time for a single chat message. A thread is read top-to-bottom, so
  // same-day messages only need HH:MM; anything older carries its date too, so
  // the front desk can tell "asked 10 minutes ago" from "asked on Tuesday"
  // without opening anything. Locale-aware, like formatDate above.
  function messageTime(ts) {
    if (!ts) return "";
    const lang = (window.JPark && window.JPark.i18n) ? window.JPark.i18n.getLang() : "en";
    const locale = DATE_LOCALE[lang] || "en-GB";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const sameDay = d.getDate() === now.getDate()
      && d.getMonth() === now.getMonth()
      && d.getFullYear() === now.getFullYear();
    const opts = sameDay
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
    try {
      return d.toLocaleString(locale, opts);
    } catch (_) {
      return d.toLocaleString();
    }
  }

  /* Keep a message list showing its newest message.
     A one-off `el.scrollTop = el.scrollHeight` after rendering isn't enough
     here: chat bubbles are laid out first and TRANSLATED afterwards (see
     translate.fill), so every bubble grows a line or two a moment later and
     the list ends up parked short of the bottom — the reply someone opened
     the chat to read sits just below the fold. So re-pin over the next second
     and a half, and stop the moment the reader scrolls up to look at
     something earlier. */
  function pinToBottom(el) {
    if (!el) return;
    if (!el._pinBound) {
      el._pinBound = true;
      el.addEventListener("scroll", function () {
        const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
        el._pinned = gap < 40; // still reading the newest? keep following it
      });
    }
    el._pinned = true;
    const stick = function () { if (el._pinned) el.scrollTop = el.scrollHeight; };
    stick();
    [60, 250, 700, 1500].forEach(function (ms) { setTimeout(stick, ms); });
  }

  // Late-checkout pricing tiers, shared by the guest portal's request form
  // and the staff board's request card so both always agree on which tier a
  // chosen time falls into — computed from the stored time rather than
  // frozen into text at submission, so it always reads correctly in
  // whichever language the viewer currently has selected. 12:00 is the
  // standard checkout time site-wide (see chat.a.checkin in i18n-app.js);
  // this only ever runs on a LATE checkout request, so a time at or before
  // it isn't a real input, but resolves to the free tier rather than null.
  function checkoutFeeTier(time) {
    if (!time || typeof time !== "string") return null;
    const m = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const mins = Number(m[1]) * 60 + Number(m[2]);
    if (mins >= 18 * 60) return "extraNight";
    if (mins >= 15 * 60) return "fee500";
    return "free";
  }

  window.JPark = window.JPark || {};
  window.JPark.util = {
    escapeHtml, toast, timeAgo, money, formatDate, messageTime, pinToBottom,
    checkoutFeeTier,
  };
})();
