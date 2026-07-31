/* ============================================================
   J Park Hotel — public-site CMS layer
   Applies admin content overrides (hero text/image, hidden
   sections) and announcements to the live site, and shows the
   admin quick-edit bar when an administrator is signed in.
   ============================================================ */
(function () {
  "use strict";
  const S = window.JPark.store;
  const I = window.JPark.i18n;
  const U = window.JPark.util;
  const MED = window.JPark.media; // photo-set registry (media.js)

  const SECTIONS = ["coffee", "services", "about", "rooms", "facilities", "onsen", "dining", "concierge", "gallery"];

  const ADMIN_BAR = {
    en: { text: "You are signed in as Admin — you can edit this website.", link: "Open Site Editor" },
    th: { text: "คุณเข้าสู่ระบบในฐานะผู้ดูแล — คุณสามารถแก้ไขเว็บไซต์นี้ได้", link: "เปิดตัวแก้ไขเว็บไซต์" },
    ja: { text: "管理者としてサインイン中 — このサイトを編集できます。", link: "サイト編集を開く" },
    "zh-Hans": { text: "您已以管理员身份登录 — 可以编辑本网站。", link: "打开网站编辑器" },
    "zh-Hant": { text: "您已以管理員身分登入 — 可以編輯本網站。", link: "開啟網站編輯器" }
  };

  function content() { return S.read("content", {}) || {}; }

  /* Named, single-slot images the editor can swap. Each maps a content
     key to a CSS selector on the public page. */
  const IMAGE_SLOTS = {
    heroImg:   ".hero-media img",
    aboutMain: ".about-img-main",
    aboutSub:  ".about-img-sub"
  };

  /* Theme colours the editor can change -> CSS custom properties. */
  const THEME_VARS = {
    teal:       "--teal",
    terracotta: "--terracotta",
    gold:       "--gold"
  };

  /* ---------- apply images ---------- */
  function applyImages(c) {
    const imgs = c.images || {};
    // legacy: heroImg used to live at the top level of content
    const heroLegacy = c.heroImg;
    Object.keys(IMAGE_SLOTS).forEach((slot) => {
      const el = document.querySelector(IMAGE_SLOTS[slot]);
      if (!el) return;
      const src = imgs[slot] || (slot === "heroImg" ? heroLegacy : null);
      if (src) el.setAttribute("src", src);
    });
  }

  /* ---------- apply theme colours ---------- */
  function applyTheme(c) {
    const theme = c.theme || {};
    let style = document.getElementById("cmsTheme");
    const rules = Object.keys(THEME_VARS)
      .filter((k) => theme[k])
      .map((k) => THEME_VARS[k] + ":" + theme[k] + ";")
      .join("");
    if (!rules) { if (style) style.remove(); return; }
    if (!style) {
      style = document.createElement("style");
      style.id = "cmsTheme";
      document.head.appendChild(style);
    }
    style.textContent = ":root{" + rules + "}";
  }

  /* ---------- apply photo-set covers (media.js overrides) ----------
     When an admin reorders/replaces/removes photos in a set, the section's
     visible cover (room thumbnail, facility background, dining photo, hero,
     about) follows the set's first image. Galleries/lightboxes rebuild on
     reload (see applyAllText). Untouched sets are left exactly as the HTML
     ships them. */
  function firstImage(setId) {
    if (!MED) return null;
    const items = MED.items(setId);
    for (let i = 0; i < items.length; i++) { if (!items[i].video) return items[i].src; }
    return null;
  }
  function firstItem(setId) {
    if (!MED) return null;
    const items = MED.items(setId);
    return items && items.length ? items[0] : null;
  }
  function setImgSrc(sel, src) {
    const el = document.querySelector(sel);
    if (el && src) el.setAttribute("src", encodeURI(src));
  }
  function setBg(sel, src) {
    const el = document.querySelector(sel);
    if (el && src) el.style.backgroundImage = "url('" + encodeURI(src) + "')";
  }

  /* A cover can be a photo OR a video (Site Editor → "Set as cover"). When the
     chosen cover is a video we mount a muted, looping, autoplay clip filling the
     cover container and keep the first still as a poster behind it. */
  function coverVideoEl(src) {
    const v = document.createElement("video");
    v.className = "cover-video";
    v.src = encodeURI(src);
    v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.preload = "auto";
    v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
    const p = v.play && v.play(); if (p && p.catch) p.catch(() => {});
    return v;
  }
  function applyCover(container, setId, opts) {
    if (!container) return;
    opts = opts || {};
    const item = firstItem(setId);
    if (!item) return;
    const old = container.querySelector(".cover-video");
    if (old) old.remove();
    const still = firstImage(setId) || (item.video ? null : item.src);
    if (still) {
      if (opts.bg) container.style.backgroundImage = "url('" + encodeURI(still) + "')";
      else { const img = container.querySelector("img"); if (img) img.setAttribute("src", encodeURI(still)); }
    }
    if (item.video) {
      container.classList.add("has-cover-video");
      container.appendChild(coverVideoEl(item.src));
    } else {
      container.classList.remove("has-cover-video");
    }
  }

  function applyMediaCovers() {
    if (!MED) return;
    const ov = (id) => MED.isOverridden(id);
    // Hero + dining + rooms + onsen feature: photo-or-video covers
    if (ov("hero"))    applyCover(document.querySelector(".hero-media"), "hero");
    if (ov("pool"))    applyCover(document.querySelector('.fac-card[data-lb="fac-pool"]'), "pool", { bg: true });
    if (ov("gym"))     applyCover(document.querySelector('.fac-card[data-lb="fac-gym"]'), "gym", { bg: true });
    if (ov("tsubaki")) applyCover(document.querySelector('.dining-card[data-lb="dining-tsubaki"] .dining-img'), "tsubaki");
    if (ov("coffee"))  applyCover(document.querySelector('.dining-card[data-lb="dining-coffee"] .dining-img'), "coffee");
    if (ov("onsen")) {
      applyCover(document.querySelector(".fac-card[data-onsen]"), "onsen", { bg: true });
      applyCover(document.querySelector(".onsen-feature"), "onsen");
    }
    // Single-image slots / sections with their own scroll-video handling
    if (ov("aboutMain")) setImgSrc(".about-img-main", firstImage("aboutMain"));
    if (ov("aboutSub"))  setImgSrc(".about-img-sub", firstImage("aboutSub"));
    if (ov("banquet"))   setBg('.fac-card[data-video="banquet"]', firstImage("banquet"));
    if (ov("allday"))    setImgSrc('.dining-card[data-video="allday"] .dining-img img', firstImage("allday"));
    // Room thumbnails + photo counts. Driven off the cards, not the sets:
    // several room types have two cards (Corner Suite Single/Twin, the 1- and
    // 2-bedroom suites), so a set-first loop with querySelector repainted only
    // the first of them and left the other showing the shipped photo.
    document.querySelectorAll(".room-card[data-room]").forEach((card) => {
      const setId = "room:" + (card.dataset.media || card.dataset.room);
      if (!ov(setId)) return;
      applyCover(card.querySelector(".room-img"), setId);
      const badge = card.querySelector(".room-photos");
      if (badge) badge.textContent = "📷 " + MED.items(setId).length;
    });
  }

  /* ---------- apply hero / section overrides ---------- */
  function applyContent() {
    const c = content();

    applyImages(c);
    applyMediaCovers();
    applyTheme(c);

    const hidden = c.hidden || {};
    SECTIONS.forEach((id) => {
      const sec = document.getElementById(id);
      if (sec) sec.style.display = hidden[id] ? "none" : "";
      // keep nav links in sync
      document.querySelectorAll('a[href="#' + id + '"]').forEach((a) => {
        a.style.display = hidden[id] ? "none" : "";
      });
    });

    // Per-room-type availability (Site Editor "Room availability" toggle,
    // backend/routes/availability.js) — delisted rooms are hidden from the
    // homepage grid entirely, same mechanism as whole-section hiding above.
    const unavailable = c.unavailableRooms || [];
    document.querySelectorAll(".room-card[data-room]").forEach((card) => {
      card.style.display = unavailable.indexOf(card.dataset.room) !== -1 ? "none" : "";
    });
  }

  /* Re-paint every translated string after admin text edits, then
     re-apply the image / theme / section overrides on top. Text edits
     flow through the i18n layer (content.overrides), so we refresh it
     and re-run the current language. */
  let lastMediaJSON = JSON.stringify((content().media) || null);

  /* The reload below is the one thing on this page that can re-trigger itself:
     it fires on a media change, and the change arrives from a store write that
     the next page load will make again if it could not be persisted (a full
     localStorage, typically an inlined photo). Cap it per tab so a browser that
     cannot cache the new photo order degrades to "shows the old order" instead
     of reloading forever. */
  const RELOAD_KEY = "jpark.mediaReloads";
  const RELOAD_MAX = 2;
  function reloadOnce() {
    let n = 0;
    try { n = Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch (_) {}
    if (n >= RELOAD_MAX) return false;
    try { sessionStorage.setItem(RELOAD_KEY, String(n + 1)); } catch (_) {}
    location.reload();
    return true;
  }

  function applyAllText() {
    // Photo-set edits change galleries/carousels that are built once at load,
    // so the cleanest way to reflect them live (e.g. the admin editing in
    // another tab) is a one-time reload when the media subtree changes.
    const nowMedia = JSON.stringify((content().media) || null);
    if (nowMedia !== lastMediaJSON) {
      lastMediaJSON = nowMedia;
      if (reloadOnce()) return;
    }
    if (I.refreshOverrides) I.refreshOverrides();
    if (I.applyLang) I.applyLang(I.getLang()); // re-renders [data-i18n] + dynamic sections
    applyContent();
  }

  /* ---------- locate & highlight a piece of text ----------
     The Site Editor links to  index.html#hl=<i18n-key>  so an admin can jump
     from a text field straight to where it shows on the live site. We scroll
     the matching element into view and briefly highlight it. */
  function locateFromHash() {
    const m = (location.hash || "").match(/[#&]hl=([^&]+)/);
    if (!m) return;
    let key;
    try { key = decodeURIComponent(m[1]); } catch (_) { key = m[1]; }
    history.replaceState(null, "", location.pathname + location.search);
    const el = document.querySelector('[data-i18n="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]');
    if (!el) return;
    // reveal any collapsed/animated ancestors first
    setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("cms-locate-flash");
      setTimeout(() => el.classList.remove("cms-locate-flash"), 2600);
    }, 350);
  }

  /* ---------- announcements banner ---------- */
  function applyAnnouncements() {
    const banner = document.getElementById("annBanner");
    const textEl = document.getElementById("annText");
    if (!banner || !textEl) return;
    const active = (S.list("announcements")).filter((a) => a.active !== false);
    const latest = active.sort((a, b) => b.createdAt - a.createdAt)[0];
    const dismissed = sessionStorage.getItem("jpark.annDismissed");

    if (latest && dismissed !== latest.id) {
      textEl.textContent = latest.text;
      banner.classList.add("show");
      banner.dataset.annId = latest.id;
    } else {
      banner.classList.remove("show");
    }
  }

  /* ---------- admin quick-edit bar ---------- */
  function applyAdminBar() {
    const bar = document.getElementById("adminBar");
    if (!bar) return;
    let staff = null;
    try { staff = JSON.parse(localStorage.getItem("jpark.staff") || "null"); } catch (_) {}
    if (staff && staff.role === "admin") {
      const m = ADMIN_BAR[I.getLang()] || ADMIN_BAR.en;
      const txt = document.getElementById("adminBarText");
      if (txt) txt.textContent = m.text;
      const link = bar.querySelector("a");
      if (link) link.textContent = m.link;
      bar.classList.add("show");
    } else {
      bar.classList.remove("show");
    }
  }

  function applyAll() { applyContent(); applyAnnouncements(); applyAdminBar(); }

  /* Adopt whatever the admin has published (assets/js/content-sync.js), so
     edits made on any device — or by another tab — show up here. This used to
     be a hand-rolled merge that pointedly did NOT carry `media`, which is why
     reordering a room's photos in the Site Editor changed nothing for anyone
     but the admin who did it. The store write below wakes applyAllText(). */
  async function syncContentFromApi() {
    const CS = window.JPark && window.JPark.contentSync;
    if (!CS) return;
    const res = await CS.pull();
    // Landing on an already-current page proves the repaint loop is settled,
    // so give this tab its reload budget back for the admin's NEXT edit.
    if (res && !res.changed && !res.offline) {
      try { sessionStorage.removeItem(RELOAD_KEY); } catch (_) {}
    }
  }

  /* Fetch the delisted-room list from the API and merge into localStorage,
     same fetch-then-merge pattern as syncContentFromApi() above — kept as a
     separate call (not folded into the /api/content response) since
     availability is served by its own dedicated, validated route. */
  async function syncAvailabilityFromApi() {
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    const res = await API.get("/api/availability");
    if (res.error || res.offline) return;
    const local = S.read("content", {}) || {};
    S.write("content", Object.assign({}, local, { unavailableRooms: res.unavailable || [] }));
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyAll();
    locateFromHash();
    syncContentFromApi();
    syncAvailabilityFromApi();

    const close = document.getElementById("annClose");
    if (close) close.addEventListener("click", () => {
      const banner = document.getElementById("annBanner");
      if (banner && banner.dataset.annId) sessionStorage.setItem("jpark.annDismissed", banner.dataset.annId);
      banner.classList.remove("show");
    });

    // live updates from the admin (same browser, other tab)
    S.on("content", applyAllText);
    S.on("announcements", applyAnnouncements);
    window.addEventListener("storage", (e) => { if (e.key === "jpark.staff") applyAdminBar(); });

    // re-apply overrides after each language switch (i18n resets textContent)
    document.addEventListener("jpark:langchange", () => { applyContent(); applyAdminBar(); });
  });
})();
