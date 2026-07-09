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
  function formatDate(iso) {
    const lang = (window.JPark && window.JPark.i18n) ? window.JPark.i18n.getLang() : "en";
    const locale = DATE_LOCALE[lang] || "en-GB";
    const d = new Date(iso + "T12:00:00");
    try {
      return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
    } catch (_) {
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }
  }

  window.JPark = window.JPark || {};
  window.JPark.util = { escapeHtml, toast, timeAgo, money, formatDate };
})();
