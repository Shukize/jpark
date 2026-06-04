/* ============================================================
   J Park Hotel — interactions
   ============================================================ */
(function () {
  "use strict";

  const enc = encodeURI; // safely encode spaces in folder/file names
  const M = window.JPark && window.JPark.media; // photo-set registry (see media.js)

  // True on phones (or when the manual mobile-view toggle is on). Used to keep
  // cover videos off mobile — a still section image is shown instead.
  function onMobile() {
    return document.body.classList.contains("mobile-view") ||
      (window.matchMedia && window.matchMedia("(max-width: 767px)").matches);
  }

  /* ---------- Midnight Coffee Club auto-scrolling carousel ----------
     Images come from the "coffee" media set (editable in the Site Editor);
     videos in the set are skipped here since slides use a background image. */
  function initCoffeeCarousel() {
    const track = document.getElementById("coffeeCarousel");
    const dotsWrap = document.getElementById("carouselDots");
    if (!track) return;

    const COFFEE_IMAGES = M ? M.srcs("coffee") : [];
    COFFEE_IMAGES.forEach((src, i) => {
      const slide = document.createElement("div");
      slide.className = "slide" + (i === 0 ? " active" : "");
      slide.style.backgroundImage = `url('${enc(src)}')`;
      track.appendChild(slide);

      if (dotsWrap) {
        const dot = document.createElement("button");
        dot.setAttribute("aria-label", "Slide " + (i + 1));
        if (i === 0) dot.classList.add("active");
        dot.addEventListener("click", () => go(i, true));
        dotsWrap.appendChild(dot);
      }
    });

    const slides = Array.from(track.children);
    const dots = dotsWrap ? Array.from(dotsWrap.children) : [];
    let index = 0;
    let timer = null;
    const DELAY = 5000;

    function go(n, fromClick) {
      slides[index].classList.remove("active");
      if (dots[index]) dots[index].classList.remove("active");
      index = (n + slides.length) % slides.length;
      slides[index].classList.add("active");
      if (dots[index]) dots[index].classList.add("active");
      if (fromClick) restart();
    }
    function next() { go(index + 1); }
    function start() { if (!timer) timer = setInterval(next, DELAY); }
    function stop() { clearInterval(timer); timer = null; }
    function restart() { stop(); start(); }

    // pause when the section is off-screen to save resources
    const section = document.getElementById("coffee");
    if ("IntersectionObserver" in window && section) {
      new IntersectionObserver((entries) => {
        entries.forEach((e) => (e.isIntersecting ? start() : stop()));
      }, { threshold: 0.15 }).observe(section);
    } else {
      start();
    }

    // expose for dot clicks defined above
    window.__coffeeGo = go;
  }

  /* ---------- Gallery data + image sets ----------
     Every photo set is sourced from the media registry (assets/js/media.js)
     so the admin Site Editor can replace, reorder, add and remove any photo
     in any section. Six hand-picked previews show before the gallery opens. */
  function galleryPreview() { return M ? M.srcs("galleryPreview") : []; }

  // The full Gallery, grouped by section, built from the registry's
  // gallery-visible sets (in registry order). Items are { src, video }.
  function buildGalleryMedia() {
    const I = window.JPark && window.JPark.i18n;
    if (!M) return [];
    return M.sets().filter((s) => s.gallery).map((s) => {
      const key = s.galleryKey || s.labelKey;
      const title = (I && I.base) ? I.base(key, "en") : key;
      return { title: title, key: key, items: M.items(s.id) };
    });
  }
  const GALLERY_MEDIA = buildGalleryMedia();

  function roomImages(folder) { return M ? M.srcs("room:" + folder) : []; }

  // named image sets for facility / dining cards (lightbox entries)
  const LB_SETS = M ? {
    "fac-pool":  M.entries("pool"),
    "fac-onsen": M.entries("onsen"),
    "fac-gym":   M.entries("gym"),
    "dining-tsubaki": M.entries("tsubaki"),
    "dining-coffee":  M.entries("coffee")
  } : {};

  /* ---------- Shared lightbox: prev/next + directional zoom-fade ---------- */
  let LB = null;
  function buildLightbox() {
    if (LB) return;
    const box = document.createElement("div");
    box.className = "lightbox";
    box.innerHTML =
      '<button class="lightbox-close" aria-label="Close">&times;</button>' +
      '<button class="lb-nav lb-prev" aria-label="Previous image">&#8249;</button>' +
      '<div class="lb-stage"><img alt="" /><div class="lb-video"></div></div>' +
      '<button class="lb-nav lb-next" aria-label="Next image">&#8250;</button>' +
      '<div class="lb-counter" aria-hidden="true"></div>';
    document.body.appendChild(box);

    const img = box.querySelector("img");
    const vid = box.querySelector(".lb-video");
    const prevBtn = box.querySelector(".lb-prev");
    const nextBtn = box.querySelector(".lb-next");
    const closeBtn = box.querySelector(".lightbox-close");
    const counter = box.querySelector(".lb-counter");
    let items = [], idx = 0;

    // Keep decoded copies warm so prev/next swaps are instant (no load flash).
    const cache = {};
    function srcOf(it) { return typeof it === "string" ? it : (it && it.src); }
    function preload(it) {
      const s = srcOf(it);
      if (!s || it.localVideo || (it && it.video) || cache[s]) return;
      const im = new Image();
      im.src = enc(s);
      cache[s] = im;
    }
    function preloadAround(i) {
      preload(items[i]);
      preload(items[(i + 1) % items.length]);
      preload(items[(i + 2) % items.length]);
      preload(items[(i - 1 + items.length) % items.length]);
    }

    function show(dir) {
      const item = items[idx];
      vid.innerHTML = "";
      vid.classList.remove("is-portrait");
      vid.style.removeProperty("--ar");
      if (item && typeof item === "object" && item.localVideo) {
        img.style.display = "none";
        vid.style.display = "";
        const v = document.createElement("video");
        v.src = enc(item.localVideo);
        v.controls = true; v.autoplay = true; v.muted = true;
        v.playsInline = true; v.setAttribute("playsinline", "");
        v.addEventListener("loadedmetadata", () => {
          if (v.videoWidth && v.videoHeight) {
            vid.style.setProperty("--ar", v.videoWidth + " / " + v.videoHeight);
            vid.classList.toggle("is-portrait", v.videoHeight >= v.videoWidth);
          }
        });
        vid.appendChild(v);
        const p = v.play(); if (p && p.catch) p.catch(() => {});
      } else if (item && typeof item === "object" && item.video) {
        img.style.display = "none";
        vid.style.display = "";
        vid.appendChild(fbVideoFrame(item.video, { autoplay: true, mute: true }));
      } else {
        vid.style.display = "none";
        img.style.display = "";
        img.classList.remove("anim-next", "anim-prev");
        void img.offsetWidth; // reflow so the animation restarts
        img.src = enc(typeof item === "string" ? item : item.src);
        if (dir > 0) img.classList.add("anim-next");
        else if (dir < 0) img.classList.add("anim-prev");
      }
      preloadAround(idx);
      const multi = items.length > 1;
      prevBtn.hidden = nextBtn.hidden = !multi;
      counter.hidden = !multi;
      counter.textContent = multi ? (idx + 1) + " / " + items.length : "";
    }
    function go(d) { if (items.length < 2) return; idx = (idx + d + items.length) % items.length; show(d); }
    function close() { box.classList.remove("open"); document.body.classList.remove("lb-open"); vid.innerHTML = ""; }

    prevBtn.addEventListener("click", (e) => { e.stopPropagation(); go(-1); });
    nextBtn.addEventListener("click", (e) => { e.stopPropagation(); go(1); });
    closeBtn.addEventListener("click", close);
    box.addEventListener("click", (e) => {
      if (e.target === box || e.target.classList.contains("lb-stage")) close();
    });
    img.addEventListener("animationend", () => img.classList.remove("anim-next", "anim-prev"));
    document.addEventListener("keydown", (e) => {
      if (!box.classList.contains("open")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    });
    // swipe (mobile)
    let sx = null;
    box.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
    box.addEventListener("touchend", (e) => {
      if (sx == null) return;
      const dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1);
    }, { passive: true });

    LB = {
      open(list, start) {
        items = (list || []).slice();
        if (!items.length) return;
        idx = Math.min(Math.max(start || 0, 0), items.length - 1);
        // Eagerly preload the first 5 (current + 4 ahead) so initial swipes are instant.
        // Stagger the rest to avoid saturating bandwidth before visible images are ready.
        for (let i = 0; i < Math.min(5, items.length); i++) preload(items[(idx + i) % items.length]);
        setTimeout(() => items.forEach(preload), 500);
        box.classList.add("open");
        document.body.classList.add("lb-open");
        show(0);
      },
      close
    };
    window.__openLightbox = (src) => LB.open([src], 0);
  }

  // A quick "J Park Hotel" fade-in over drifting leaves, then fade out.
  function playLeafIntro(done) {
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ov = document.createElement("div");
    ov.className = "gintro";
    const leaves = document.createElement("div");
    leaves.className = "gintro-leaves";
    if (!reduce) {
      for (let i = 0; i < 9; i++) {
        const leaf = document.createElement("span");
        leaf.className = "leaf";
        const dur = (1.4 + Math.random() * 0.9).toFixed(2);
        const delay = (Math.random() * 0.4).toFixed(2);
        const top = (Math.random() * 78).toFixed(0);
        const size = (9 + Math.random() * 12).toFixed(0);
        leaf.style.cssText = "--dur:" + dur + "s;--delay:" + delay + "s;top:" + top + "%;width:" + size + "px;height:" + size + "px;";
        leaves.appendChild(leaf);
      }
    }
    ov.appendChild(leaves);
    const title = document.createElement("h2");
    title.className = "gintro-title";
    title.textContent = "J Park Hotel";
    ov.appendChild(title);
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add("show"));
    const hold = reduce ? 200 : 1000;
    setTimeout(() => {
      ov.classList.remove("show");
      if (typeof done === "function") done();
      setTimeout(() => ov.remove(), 600);
    }, hold);
  }

  // Map a media item ({src, video}) to a lightbox entry (string or {localVideo}).
  function lbEntry(it) { return it.video ? { localVideo: it.src } : it.src; }

  // Translate a gallery category title. Prefer an explicit key on the category,
  // then a known mapping, then the raw English title as a fallback.
  const GALLERY_TITLE_KEY = {
    "The Hotel": "gallery.cat.hotel",
    "Tropical Pool": "gallery.cat.pool",
    "Midnight Coffee Club": "gallery.cat.coffee",
    "Tsubaki · Japanese Restaurant": "gallery.cat.tsubaki",
    "All-Day Dining": "gallery.cat.allday",
    "Meeting & Banquet Rooms": "gallery.cat.banquet",
    "Fitness Centre": "gallery.cat.gym",
    "Studio": "rooms.studioName",
    "Studio B4": "rooms.studioB4Name",
    "Deluxe": "rooms.deluxeName",
    "Grand Deluxe": "rooms.grandDeluxeName",
    "Premiere": "rooms.premiereName",
    "Grand Premiere": "rooms.grandPremiereName",
    "Premiere Suite": "rooms.premiereSuiteName",
    "Executive Suite": "rooms.execSuiteName",
    "Grand Suite": "rooms.grandSuiteName",
    "Prestige": "rooms.prestigeName",
    "Corner Suite": "rooms.cornerName",
  };
  function catTitle(cat) {
    const I = window.JPark && window.JPark.i18n;
    const key = cat.key || GALLERY_TITLE_KEY[cat.title];
    if (I && key) { const t = I.t(key); if (t && t !== key) return t; }
    return cat.title;
  }

  function buildFullGallery(host) {
    GALLERY_MEDIA.forEach((cat, ci) => {
      const lbList = cat.items.map(lbEntry);
      const block = document.createElement("div");
      block.className = "gcat reveal in";
      block.id = "gcat-" + ci;
      const h = document.createElement("h3");
      h.className = "gcat-title";
      h.innerHTML = '<span class="gcat-name"></span> <span class="gcat-count">' + cat.items.length + "</span>";
      h.querySelector(".gcat-name").textContent = catTitle(cat);
      block.appendChild(h);
      const grid = document.createElement("div");
      grid.className = "gcat-grid";
      cat.items.forEach((it, i) => {
        const fig = document.createElement("figure");
        fig.className = "gthumb" + (it.video ? " is-video" : "");
        if (it.video) {
          const v = document.createElement("video");
          v.src = enc(it.src) + "#t=0.5";
          v.muted = true; v.preload = "metadata"; v.playsInline = true;
          v.setAttribute("playsinline", "");
          fig.appendChild(v);
          const badge = document.createElement("span");
          badge.className = "gthumb-play";
          badge.innerHTML = '<span class="play-tri"></span>';
          fig.appendChild(badge);
        } else {
          const img = document.createElement("img");
          img.src = enc(it.src);
          img.alt = catTitle(cat);
          img.loading = "lazy";
          fig.appendChild(img);
        }
        fig.addEventListener("click", () => LB.open(lbList, i));
        grid.appendChild(fig);
      });
      block.appendChild(grid);
      host.appendChild(block);
    });
  }

  function initGallery() {
    const grid = document.getElementById("galleryGrid");
    if (!grid) return;

    // initial six previews
    const PREVIEW = galleryPreview();
    PREVIEW.forEach((src, i) => {
      const fig = document.createElement("figure");
      const img = document.createElement("img");
      img.src = enc(src);
      img.alt = "J Park Hotel";
      img.loading = "lazy";
      fig.appendChild(img);
      fig.addEventListener("click", () => LB.open(PREVIEW, i));
      grid.appendChild(fig);
    });

    const I = window.JPark && window.JPark.i18n;
    const t = (k, fb) => (I ? I.t(k) : fb);

    const wrap = document.createElement("div");
    wrap.className = "gallery-more-wrap";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gallery-more";
    btn.setAttribute("data-i18n", "gallery.more");
    btn.textContent = t("gallery.more", "More pictures and videos…");
    wrap.appendChild(btn);

    // expanded-view toolbar: jump-to-section dropdown + compact toggle
    const tools = document.createElement("div");
    tools.className = "gallery-tools";
    const jump = document.createElement("select");
    jump.className = "gallery-jump";
    jump.setAttribute("aria-label", t("gallery.jump", "Jump to section"));
    const compact = document.createElement("button");
    compact.type = "button";
    compact.className = "gallery-collapse";
    compact.setAttribute("data-i18n", "gallery.collapse");
    compact.textContent = t("gallery.collapse", "Compact view");
    tools.appendChild(jump);
    tools.appendChild(compact);

    const full = document.createElement("div");
    full.className = "gallery-full";

    grid.parentNode.appendChild(wrap);
    grid.parentNode.appendChild(tools);
    grid.parentNode.appendChild(full);

    function syncLabels() {
      jump.options[0].textContent = t("gallery.jump", "Jump to section");
      GALLERY_MEDIA.forEach((cat, ci) => {
        if (jump.options[ci + 1]) jump.options[ci + 1].textContent = catTitle(cat);
        const name = full.querySelector("#gcat-" + ci + " .gcat-name");
        if (name) name.textContent = catTitle(cat);
        const block = document.getElementById("gcat-" + ci);
        if (block) block.querySelectorAll(".gthumb img").forEach((im) => { im.alt = catTitle(cat); });
      });
    }

    function buildJump() {
      jump.innerHTML = "";
      const lead = document.createElement("option");
      lead.value = "";
      lead.textContent = t("gallery.jump", "Jump to section");
      jump.appendChild(lead);
      GALLERY_MEDIA.forEach((cat, ci) => {
        const o = document.createElement("option");
        o.value = String(ci);
        o.textContent = catTitle(cat);
        jump.appendChild(o);
      });
      jump.selectedIndex = 0;
    }

    jump.addEventListener("change", () => {
      const target = document.getElementById("gcat-" + jump.value);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      jump.selectedIndex = 0;
    });

    let built = false;
    function expand() {
      grid.parentNode.classList.add("gallery-expanded");
      if (!built) {
        built = true;
        buildFullGallery(full);
        buildJump();
      }
      full.classList.add("show");
    }
    btn.addEventListener("click", () => {
      btn.disabled = true;
      playLeafIntro(() => { expand(); btn.disabled = false; });
    });
    compact.addEventListener("click", () => {
      grid.parentNode.classList.remove("gallery-expanded");
      full.classList.remove("show");
      grid.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    document.addEventListener("jpark:langchange", () => { if (built) syncLabels(); });
  }

  /* ---------- Clickable rooms + facility/dining galleries ---------- */
  function bindOpener(el, getList) {
    const open = () => { const l = getList(); if (l && l.length) LB.open(l, 0); };
    el.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return; // let real links/buttons work
      open();
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  }
  function initCardGalleries() {
    document.querySelectorAll(".room-card[data-room]").forEach((card) =>
      bindOpener(card, () => roomImages(card.dataset.room))
    );
    document.querySelectorAll("[data-lb]").forEach((card) =>
      bindOpener(card, () => LB_SETS[card.dataset.lb])
    );
  }

  /* On mobile the rooms grid is a horizontal snap-scroller; the hint pill
     invites a swipe and fades away once the guest scrolls or it's off-screen. */
  function initSwipeHint() {
    const grid = document.querySelector(".rooms .room-grid");
    const hint = document.querySelector(".rooms .swipe-hint");
    if (!grid || !hint) return;
    let done = false;
    function hide() {
      if (done) return;
      done = true;
      hint.classList.add("swipe-hint--hidden");
      grid.removeEventListener("scroll", hide);
    }
    grid.addEventListener("scroll", hide, { passive: true });
    // Also retire it after a while even if the guest never scrolls.
    setTimeout(hide, 9000);
  }

  /* ---------- Staff/Admin portal link in the nav (when signed in) ---------- */
  function initNavPortal() {
    const link = document.getElementById("navPortalLink");
    const signoutBtn = document.getElementById("navStaffSignout");
    if (!link) return;
    const I = window.JPark && window.JPark.i18n;
    function apply() {
      let staff = null;
      try { staff = JSON.parse(localStorage.getItem("jpark.staff") || "null"); } catch (_) {}
      if (staff && staff.role) {
        const key = staff.role === "admin" ? "nav.admin" : "nav.staff";
        link.setAttribute("data-i18n", key);
        link.textContent = I ? I.t(key) : (staff.role === "admin" ? "Admin" : "Staff");
        link.hidden = false;
        if (signoutBtn) signoutBtn.hidden = false;
      } else {
        link.hidden = true;
        if (signoutBtn) signoutBtn.hidden = true;
      }
    }
    if (signoutBtn) {
      signoutBtn.addEventListener("click", () => {
        localStorage.removeItem("jpark.staff");
        localStorage.removeItem("jpark.staff.token");
        apply();
      });
    }
    apply();
    window.addEventListener("storage", (e) => { if (e.key === "jpark.staff") apply(); });
    document.addEventListener("jpark:langchange", apply);
  }

  /* ---------- Facebook video embed (best-effort, graceful fallback) ----------
     The Meeting & Banquet reel is a Facebook share-link; the player may decline
     to embed reels, in which case the uploaded photos still display in the
     lightbox, so the section never looks broken. (All-Day Dining and the Coffee
     Club use local mp4s, which autoplay reliably.) */
  const FB_VIDEOS = {
    banquet: "https://www.facebook.com/share/r/1EcPQ5YsHc/"
  };

  function fbVideoFrame(href, opts) {
    opts = opts || {};
    const f = document.createElement("iframe");
    const qs = "href=" + encodeURIComponent(href) +
      "&show_text=false&width=560&height=314" +
      "&autoplay=" + (opts.autoplay === false ? "false" : "true") +
      "&mute=" + (opts.mute === false ? "0" : "1");
    f.src = "https://www.facebook.com/plugins/video.php?" + qs;
    f.className = "fb-vid-frame";
    f.setAttribute("frameborder", "0");
    f.setAttribute("scrolling", "no");
    f.setAttribute("title", "Facebook video");
    f.allow = "autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share; fullscreen";
    f.allowFullscreen = true;
    return f;
  }

  function onceInView(el, cb, threshold) {
    if (!("IntersectionObserver" in window)) { cb(); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { cb(); io.disconnect(); } });
    }, { threshold: threshold || 0.35 });
    io.observe(el);
  }

  // Meeting & Banquet Rooms: local clip plays as cover on scroll; click opens lightbox
  // with the video followed by the uploaded photos.
  const BANQUET_VIDEO_FILE =
    "images/Meeting and Banquet Rooms/AQM1GlMUG1VPn2W3_GoLJgXiKyz-GI7UgQOK_LlqgTjo1DDIoMkFYNqgC1lAFEUf0ysj7JGbiP_T-PB84vS-qiCCPTrRNOQeeZ0d2-jDjn1bIQ.mp4";
  function initBanquetVideo() {
    const card = document.querySelector('.fac-card[data-video="banquet"]');
    if (!card) return;
    let playing = false;
    function startCover() {
      if (playing || onMobile()) return; // mobile keeps the still cover image
      playing = true;
      const wrap = document.createElement("div");
      wrap.className = "card-video-wrap";
      const v = document.createElement("video");
      v.src = enc(BANQUET_VIDEO_FILE);
      v.muted = true; v.autoplay = true; v.loop = false; v.preload = "auto";
      v.playsInline = true; v.setAttribute("playsinline", "");
      wrap.appendChild(v);
      card.appendChild(wrap);
      card.classList.add("playing");
      // when the clip ends, swap the cover for the next section image
      const onEnded = () => {
        const stills = M ? M.srcs("banquet") : [];
        if (stills[0]) card.style.backgroundImage = "url('" + enc(stills[0]) + "')";
        wrap.remove();
        card.classList.remove("playing");
      };
      const onError = () => { wrap.remove(); card.classList.remove("playing"); playing = false; };
      v.addEventListener("ended", onEnded);
      v.addEventListener("error", onError);
      const p = v.play(); if (p && p.catch) p.catch(() => {});
    }
    onceInView(card, startCover, 0.4);
    bindOpener(card, () => (M ? M.entries("banquet") : [{ localVideo: BANQUET_VIDEO_FILE }]));
  }

  // All-Day Dining: the local clip replaces the cover when the card scrolls
  // into view; when the clip ends, the cover image returns. Click opens lightbox with both videos.
  const ALLDAY_VIDEO_FILE =
    "images/All-Day Dining/AQNCEA_f6EzQkXbwrB13jzd_QMJ4uE_ArgwVV0jb8eP8HtklQMgoYlGzdnKJONHWmf9VZnG8YqM8Ns1E1XjFRgw8BJaQMTIGqPYFLdzVf06rzQ.mp4";
  const ALLDAY_VIDEO_FILE_2 =
    "images/All-Day Dining/AQPkivRrWjvIibm-ObjYFA89UdoAliPhHGYELTbwWeI8TebF7soa_9BjgijiFFEoJG4YESEMEz468duj0wSBv77oBeIvhd42N9lzCGFFaIK8tQ.mp4";
  function initAllDayVideo() {
    const card = document.querySelector('.dining-card[data-video="allday"]');
    if (!card) return;
    const imgWrap = card.querySelector(".dining-img");
    if (!imgWrap) return;
    let playing = false;
    function startCover() {
      if (playing || onMobile()) return; // mobile keeps the still cover image
      playing = true;
      const wrap = document.createElement("div");
      wrap.className = "card-video-wrap";
      const v = document.createElement("video");
      v.src = enc(ALLDAY_VIDEO_FILE);
      v.muted = true; v.autoplay = true; v.loop = false; v.preload = "auto";
      v.playsInline = true; v.setAttribute("playsinline", "");
      wrap.appendChild(v);
      imgWrap.appendChild(wrap);
      card.classList.add("playing");
      const cleanup = () => { wrap.remove(); card.classList.remove("playing"); playing = false; };
      v.addEventListener("ended", cleanup);
      v.addEventListener("error", cleanup);
      const p = v.play(); if (p && p.catch) p.catch(() => {});
    }
    onceInView(card, startCover, 0.4);
    bindOpener(card, () => [
      { localVideo: ALLDAY_VIDEO_FILE },
      { localVideo: ALLDAY_VIDEO_FILE_2 }
    ]);
  }

  // Midnight Coffee Club: play the local clip for 8 seconds over the carousel.
  // A local mp4 is used here (reliable autoplay) rather than the reel embed.
  const COFFEE_VIDEO_FILE =
    "images/New Midnight Coffee Club/AQMO2Yp5iRyBptY78NauYmUhWpjBmJ505TFv58UgnadIpoKd2ArgatitpLERHy-KosjXlwOK-fxyCEI_RuvawqXBgFr4djH0nXBYt_xhgslo6Q.mp4";
  function initCoffeeVideo() {
    const section = document.getElementById("coffee");
    if (!section) return;
    let done = false;
    function start() {
      // On mobile the carousel images carry the section; the intro clip plays
      // only on larger screens (tap the section to watch it in the lightbox).
      if (done || onMobile()) return; done = true;
      const overlay = document.createElement("div");
      overlay.className = "coffee-video";
      const v = document.createElement("video");
      v.src = enc(COFFEE_VIDEO_FILE);
      v.muted = true; v.autoplay = true; v.loop = false; v.preload = "auto";
      v.playsInline = true; v.setAttribute("playsinline", "");
      overlay.appendChild(v);
      section.appendChild(overlay);
      const p = v.play(); if (p && p.catch) p.catch(() => {});
      requestAnimationFrame(() => overlay.classList.add("show"));
      setTimeout(() => {
        overlay.classList.remove("show");
        try { v.pause(); } catch (_) {}
        setTimeout(() => overlay.remove(), 1300);
      }, 8000);
    }
    onceInView(section, start, 0.35);
  }

  // Midnight Coffee Club: click the imagery to open the video + photos in the
  // shared lightbox (same prev/next experience as the other sections).
  function initCoffeeLightbox() {
    const section = document.getElementById("coffee");
    if (!section) return;
    const set = [{ localVideo: COFFEE_VIDEO_FILE }].concat(M ? M.srcs("coffee") : []);
    section.classList.add("coffee-clickable");
    section.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return; // let real controls work
      LB.open(set, 0);
    });
  }

  /* ---------- Header scroll state ---------- */
  function initHeader() {
    const header = document.getElementById("siteHeader");
    if (!header) return;
    const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Mobile menu ---------- */
  function initMenu() {
    const ham = document.getElementById("hamburger");
    const links = document.getElementById("navLinks");
    if (!ham || !links) return;
    ham.addEventListener("click", () => links.classList.toggle("open"));
    links.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => links.classList.remove("open"))
    );
  }

  /* ---------- Scroll reveal ---------- */
  function initReveal() {
    const els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- "View on site" highlight ----------
     The Site Editor opens the homepage with a hash describing what's being edited:
       #hl=<i18n-key>[&sec=<section>]  → flash that one text string (falls back to its section)
       #sec=<section>                  → glow the whole section
     We scroll there, pulse it, and float a banner so the admin instantly sees the spot. */
  function initHighlight() {
    const raw = (location.hash || "").replace(/^#/, "");
    if (!raw) return;
    const params = {};
    raw.split("&").forEach((p) => {
      const i = p.indexOf("=");
      if (i > 0) params[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
    });
    if (!params.hl && !params.sec) return;

    const I = window.JPark && window.JPark.i18n;

    // Resolve the target: prefer the exact text element, else the section.
    let el = null, mode = "text";
    if (params.hl) {
      el = document.querySelector("[data-i18n='" + CSS.escape(params.hl) + "']");
    }
    if (!el && params.sec) { el = document.getElementById(params.sec); mode = "section"; }
    if (!el) return;

    // Force any lazy-reveal wrappers (the target or its ancestors) to show first.
    const revealAncestor = el.closest(".reveal");
    if (revealAncestor) revealAncestor.classList.add("in");
    if (el.querySelectorAll) el.querySelectorAll(".reveal").forEach((r) => r.classList.add("in"));

    // Floating banner so it's obvious this came from the editor.
    const banner = document.createElement("div");
    banner.className = "edit-locator";
    banner.textContent = "✏️ " +
      (I ? I.t(mode === "section" ? "hl.editingSection" : "hl.editingText")
         : (mode === "section" ? "Here's the section you're editing" : "Here's the text you're editing"));
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add("show"));
    setTimeout(() => { banner.classList.remove("show"); setTimeout(() => banner.remove(), 450); }, 4200);

    if (mode === "section") {
      // Align the section's top under the fixed header so its heading is visible.
      const header = document.getElementById("siteHeader");
      const offset = (header ? header.offsetHeight : 0) + 16;
      const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // Short delay so the scroll settles before the flash starts
    setTimeout(() => {
      const cls = mode === "section" ? "site-hl-section" : "site-hl";
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 3200);
    }, 500);
  }

  /* ---------- Footer year ---------- */
  function initYear() {
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
  }

  /* ---------- Mobile / Desktop view toggle ---------- */
  function initViewToggle() {
    const btn = document.getElementById("viewToggle");
    if (!btn) return;

    const KEY = "jpark.view";
    const isMobileDevice = window.matchMedia("(max-width: 767px)").matches;
    const saved = localStorage.getItem(KEY);

    // default: mobile view on small screens, desktop on large
    let mobileView = saved !== null ? saved === "mobile" : isMobileDevice;

    function apply() {
      document.body.classList.toggle("mobile-view", mobileView);
      btn.textContent = mobileView ? "🖥 Desktop" : "📱 Mobile";
      btn.setAttribute("aria-label", mobileView ? "Switch to desktop view" : "Switch to mobile view");
      btn.title = btn.getAttribute("aria-label");
    }

    btn.addEventListener("click", () => {
      mobileView = !mobileView;
      localStorage.setItem(KEY, mobileView ? "mobile" : "desktop");
      apply();
    });

    apply();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initViewToggle(); // first, so onMobile() is correct before the cover videos init
    initHeader();
    initMenu();
    initCoffeeCarousel();
    buildLightbox();
    initGallery();
    initCardGalleries();
    initSwipeHint();
    initNavPortal();
    initBanquetVideo();
    initAllDayVideo();
    initCoffeeVideo();
    initCoffeeLightbox();
    initReveal();
    initYear();
    initHighlight();
  });
})();
