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

  const SECTIONS = ["coffee", "services", "about", "rooms", "facilities", "dining", "concierge", "gallery"];

  const ADMIN_BAR = {
    en: { text: "You are signed in as Admin — you can edit this website.", link: "Open Site Editor" },
    th: { text: "คุณเข้าสู่ระบบในฐานะผู้ดูแล — คุณสามารถแก้ไขเว็บไซต์นี้ได้", link: "เปิดตัวแก้ไขเว็บไซต์" },
    ja: { text: "管理者としてサインイン中 — このサイトを編集できます。", link: "サイト編集を開く" },
    "zh-Hans": { text: "您已以管理员身份登录 — 可以编辑本网站。", link: "打开网站编辑器" },
    "zh-Hant": { text: "您已以管理員身分登入 — 可以編輯本網站。", link: "開啟網站編輯器" }
  };

  function content() { return S.read("content", {}) || {}; }

  /* ---------- apply hero / section overrides ---------- */
  function applyContent() {
    const c = content();

    const heroTitle = document.querySelector(".hero-title");
    const heroLede = document.querySelector(".hero-lede");
    const heroImg = document.querySelector(".hero-media img");

    if (heroTitle && c.heroTitle) heroTitle.textContent = c.heroTitle;
    if (heroLede && c.heroLede) heroLede.textContent = c.heroLede;
    if (heroImg && c.heroImg) heroImg.setAttribute("src", c.heroImg);

    const hidden = c.hidden || {};
    SECTIONS.forEach((id) => {
      const sec = document.getElementById(id);
      if (sec) sec.style.display = hidden[id] ? "none" : "";
      // keep nav links in sync
      document.querySelectorAll('a[href="#' + id + '"]').forEach((a) => {
        a.style.display = hidden[id] ? "none" : "";
      });
    });
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

  document.addEventListener("DOMContentLoaded", () => {
    applyAll();

    const close = document.getElementById("annClose");
    if (close) close.addEventListener("click", () => {
      const banner = document.getElementById("annBanner");
      if (banner && banner.dataset.annId) sessionStorage.setItem("jpark.annDismissed", banner.dataset.annId);
      banner.classList.remove("show");
    });

    // live updates from the admin (same browser, other tab)
    S.on("content", applyContent);
    S.on("announcements", applyAnnouncements);
    window.addEventListener("storage", (e) => { if (e.key === "jpark.staff") applyAdminBar(); });

    // re-apply overrides after each language switch (i18n resets textContent)
    document.addEventListener("jpark:langchange", () => { applyContent(); applyAdminBar(); });
  });
})();
