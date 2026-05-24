/* ============================================================
   J Park Hotel — interactions
   ============================================================ */
(function () {
  "use strict";

  const enc = encodeURI; // safely encode spaces in folder/file names

  /* ---------- Midnight Coffee Club auto-scrolling carousel ---------- */
  const COFFEE_IMAGES = [
    "images/New Midnight Coffee Club/587f2a86-cbf1-4cac-9e69-9279d2478323.jpg",
    "images/New Midnight Coffee Club/533e41e3-da93-4733-b004-9d2ea6f73b93.jpg",
    "images/New Midnight Coffee Club/e46b8210-aa80-4e70-9752-ebc89b40d507.jpg",
    "images/New Midnight Coffee Club/71ef2776-f865-424b-9c49-8b8d6408996a.jpg",
    "images/New Midnight Coffee Club/9fc27bb2-ce97-4825-84b4-e3c2152c5628.jpg",
    "images/New Midnight Coffee Club/f930c440-b85d-46c2-a6d5-fea5ee506ac9.jpg",
    "images/New Midnight Coffee Club/3f2b3f47-b2ab-42ef-aae2-03638f1d26da.jpg",
    "images/New Midnight Coffee Club/b85f1406-83f2-4969-84c6-11299dfdb391.jpg"
  ];

  function initCoffeeCarousel() {
    const track = document.getElementById("coffeeCarousel");
    const dotsWrap = document.getElementById("carouselDots");
    if (!track) return;

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

  /* ---------- Gallery data + image sets ---------- */
  // Six hand-picked previews shown before the gallery is expanded.
  const GALLERY_PREVIEW = [
    "images/Tropical Pool/c917232b-159a-4fdc-bc20-12e806f5304b.jpg",
    "images/45c09cb7-8ba5-4ba0-bc3c-42837ef10bf2.jpg",
    "images/New Midnight Coffee Club/587f2a86-cbf1-4cac-9e69-9279d2478323.jpg",
    "images/ea770736-fe38-4c3e-b072-4928f8a2fad9.jpg",
    "images/Grand Deluxe/9fa48cad-503d-4bf9-8296-7a90ce34bbd2.jpg",
    "images/Tropical Pool/ce70057e-42f0-4b44-9f67-18598f22ff3a.jpg"
  ];

  // Every image/video in /images, grouped by the folder it belongs to.
  // Built only when the guest expands the gallery, so mobile data is saved.
  const GALLERY_MEDIA = [{"title":"The Hotel","items":[{"src":"images/383fb6a3-fc47-4029-bfe5-2bd90e2f9345.jpg","video":false},{"src":"images/3d6be05f-7084-4d60-915c-e76e587675b3.jpg","video":false},{"src":"images/45c09cb7-8ba5-4ba0-bc3c-42837ef10bf2.jpg","video":false},{"src":"images/843e2617-637f-4337-8f46-69ff1e5b6979.jpg","video":false},{"src":"images/99bc74a1-d4e8-452e-ae2c-e8988164daff.jpg","video":false},{"src":"images/9f43d60e-e1b0-4ea0-b8b2-82792fbd44eb.jpg","video":false},{"src":"images/a5606bc9-316e-4fde-b5d6-7fb06163a540.jpg","video":false},{"src":"images/ea770736-fe38-4c3e-b072-4928f8a2fad9.jpg","video":false},{"src":"images/ef6ec731-7bc6-4d8c-a10d-dcb7131d7470.jpg","video":false}]},{"title":"Tropical Pool","items":[{"src":"images/Tropical Pool/1b23ab2d-a3d1-474c-8944-4c7159f6d91b.jpg","video":false},{"src":"images/Tropical Pool/48cd9718-cece-4c80-adcd-dd637ed35d00.jpg","video":false},{"src":"images/Tropical Pool/c3ac1733-933b-49de-aa10-7185a21dbe5f.jpg","video":false},{"src":"images/Tropical Pool/c917232b-159a-4fdc-bc20-12e806f5304b.jpg","video":false},{"src":"images/Tropical Pool/ce70057e-42f0-4b44-9f67-18598f22ff3a.jpg","video":false},{"src":"images/Tropical Pool/ffcc842a-2003-4239-ae74-0e6c0b10f883.jpg","video":false}]},{"title":"Midnight Coffee Club","items":[{"src":"images/New Midnight Coffee Club/1f9bc02c-f503-4ff5-a257-6257bad9dbb4.jpg","video":false},{"src":"images/New Midnight Coffee Club/3f2b3f47-b2ab-42ef-aae2-03638f1d26da.jpg","video":false},{"src":"images/New Midnight Coffee Club/509915eb-4ebd-4367-9df2-ca4a1920edb1.jpg","video":false},{"src":"images/New Midnight Coffee Club/533e41e3-da93-4733-b004-9d2ea6f73b93.jpg","video":false},{"src":"images/New Midnight Coffee Club/587f2a86-cbf1-4cac-9e69-9279d2478323.jpg","video":false},{"src":"images/New Midnight Coffee Club/71ef2776-f865-424b-9c49-8b8d6408996a.jpg","video":false},{"src":"images/New Midnight Coffee Club/7e5103f1-38cf-450e-b738-a600fe093b33.jpg","video":false},{"src":"images/New Midnight Coffee Club/9fc27bb2-ce97-4825-84b4-e3c2152c5628.jpg","video":false},{"src":"images/New Midnight Coffee Club/AQMO2Yp5iRyBptY78NauYmUhWpjBmJ505TFv58UgnadIpoKd2ArgatitpLERHy-KosjXlwOK-fxyCEI_RuvawqXBgFr4djH0nXBYt_xhgslo6Q.mp4","video":true},{"src":"images/New Midnight Coffee Club/b85f1406-83f2-4969-84c6-11299dfdb391.jpg","video":false},{"src":"images/New Midnight Coffee Club/c8bd675b-dd6b-43d6-bd81-6ea00f044752.jpg","video":false},{"src":"images/New Midnight Coffee Club/e46b8210-aa80-4e70-9752-ebc89b40d507.jpg","video":false},{"src":"images/New Midnight Coffee Club/f930c440-b85d-46c2-a6d5-fea5ee506ac9.jpg","video":false},{"src":"images/New Midnight Coffee Club/fa048e34-5d56-40df-b74b-09ddae38e76c.jpg","video":false},{"src":"images/New Midnight Coffee Club/fb6f70a5-a689-40b7-941f-acd406adebe4.jpg","video":false}]},{"title":"All-Day Dining","items":[{"src":"images/All-Day Dining/AQNCEA_f6EzQkXbwrB13jzd_QMJ4uE_ArgwVV0jb8eP8HtklQMgoYlGzdnKJONHWmf9VZnG8YqM8Ns1E1XjFRgw8BJaQMTIGqPYFLdzVf06rzQ.mp4","video":true},{"src":"images/All-Day Dining/AQPkivRrWjvIibm-ObjYFA89UdoAliPhHGYELTbwWeI8TebF7soa_9BjgijiFFEoJG4YESEMEz468duj0wSBv77oBeIvhd42N9lzCGFFaIK8tQ.mp4","video":true}]},{"title":"Meeting & Banquet Rooms","items":[{"src":"images/Meeting and Banquet Rooms/494571715_1234993728633902_7937100202759146009_n.jpg","video":false},{"src":"images/Meeting and Banquet Rooms/494917326_1234993825300559_3003474501674880900_n.jpg","video":false},{"src":"images/Meeting and Banquet Rooms/494918097_1244121301054478_8305459958581942758_n.jpg","video":false},{"src":"images/Meeting and Banquet Rooms/495059787_1234993685300573_808848194837634403_n.jpg","video":false},{"src":"images/Meeting and Banquet Rooms/495071384_1244122731054335_7597308853160764089_n.jpg","video":false},{"src":"images/Meeting and Banquet Rooms/496253973_1244252684374673_7569938748860271089_n.jpg","video":false},{"src":"images/Meeting and Banquet Rooms/497496305_1244252934374648_7353825412616371042_n.jpg","video":false},{"src":"images/Meeting and Banquet Rooms/588040708_1422177456582194_470984224392519007_n.jpg","video":false},{"src":"images/Meeting and Banquet Rooms/683901474_1558444972955441_2309987664278666191_n.jpg","video":false},{"src":"images/Meeting and Banquet Rooms/687469820_1558444129622192_160825424360902258_n.jpg","video":false},{"src":"images/Meeting and Banquet Rooms/687999904_1558427726290499_7320805987719867448_n.jpg","video":false},{"src":"images/Meeting and Banquet Rooms/AQM1GlMUG1VPn2W3_GoLJgXiKyz-GI7UgQOK_LlqgTjo1DDIoMkFYNqgC1lAFEUf0ysj7JGbiP_T-PB84vS-qiCCPTrRNOQeeZ0d2-jDjn1bIQ.mp4","video":true}]},{"title":"Fitness Centre","items":[{"src":"images/Gym/0c3d1ad4-6fd3-4082-8cbd-a08f1a11dc0e.jpg","video":false},{"src":"images/Gym/43e19389-7794-4262-a062-ef37f608b52a.jpg","video":false},{"src":"images/Gym/b111922d-8527-4860-b485-2ab4cee5f3a9.jpg","video":false},{"src":"images/Gym/e2bb66fc-6cac-45ec-8316-ae1e71d90a0a.jpg","video":false}]},{"title":"Standard Single","items":[{"src":"images/Standard Single/room_01.jpg","video":false},{"src":"images/Standard Single/room_02.jpg","video":false},{"src":"images/Standard Single/room_03.jpg","video":false},{"src":"images/Standard Single/room_04.jpg","video":false},{"src":"images/Standard Single/room_05.jpg","video":false},{"src":"images/Standard Single/room_06.jpg","video":false},{"src":"images/Standard Single/room_07.jpg","video":false},{"src":"images/Standard Single/room_08.jpg","video":false},{"src":"images/Standard Single/room_09.jpg","video":false}]},{"title":"Superior Room","items":[{"src":"images/Superior Room/room_01.jpg","video":false},{"src":"images/Superior Room/room_02.jpg","video":false},{"src":"images/Superior Room/room_03.jpg","video":false},{"src":"images/Superior Room/room_04.jpg","video":false},{"src":"images/Superior Room/room_05.jpg","video":false},{"src":"images/Superior Room/room_06.jpg","video":false},{"src":"images/Superior Room/room_07.jpg","video":false},{"src":"images/Superior Room/room_08.jpg","video":false},{"src":"images/Superior Room/room_09.jpg","video":false},{"src":"images/Superior Room/room_10.jpg","video":false},{"src":"images/Superior Room/room_11.jpg","video":false},{"src":"images/Superior Room/room_12.jpg","video":false},{"src":"images/Superior Room/room_13.jpg","video":false},{"src":"images/Superior Room/room_14.jpg","video":false},{"src":"images/Superior Room/room_15.jpg","video":false},{"src":"images/Superior Room/room_16.jpg","video":false},{"src":"images/Superior Room/room_17.jpg","video":false}]},{"title":"Prestige Twin Room","items":[{"src":"images/Prestige Twin Room/room_01.jpg","video":false},{"src":"images/Prestige Twin Room/room_02.jpg","video":false},{"src":"images/Prestige Twin Room/room_03.jpg","video":false},{"src":"images/Prestige Twin Room/room_04.jpg","video":false},{"src":"images/Prestige Twin Room/room_05.jpg","video":false},{"src":"images/Prestige Twin Room/room_06.jpg","video":false},{"src":"images/Prestige Twin Room/room_07.jpg","video":false},{"src":"images/Prestige Twin Room/room_08.jpg","video":false},{"src":"images/Prestige Twin Room/room_09.jpg","video":false}]},{"title":"Studio Room","items":[{"src":"images/Studio Room/room_01.jpg","video":false},{"src":"images/Studio Room/room_02.jpg","video":false},{"src":"images/Studio Room/room_03.jpg","video":false},{"src":"images/Studio Room/room_04.jpg","video":false},{"src":"images/Studio Room/room_05.jpg","video":false},{"src":"images/Studio Room/room_06.jpg","video":false},{"src":"images/Studio Room/room_07.jpg","video":false},{"src":"images/Studio Room/room_08.jpg","video":false},{"src":"images/Studio Room/room_09.jpg","video":false},{"src":"images/Studio Room/room_10.jpg","video":false},{"src":"images/Studio Room/room_11.jpg","video":false},{"src":"images/Studio Room/room_12.jpg","video":false},{"src":"images/Studio Room/room_13.jpg","video":false}]},{"title":"Studio Double Room","items":[{"src":"images/Studio Double Room/room_01.jpg","video":false},{"src":"images/Studio Double Room/room_02.jpg","video":false},{"src":"images/Studio Double Room/room_03.jpg","video":false},{"src":"images/Studio Double Room/room_04.jpg","video":false},{"src":"images/Studio Double Room/room_05.jpg","video":false},{"src":"images/Studio Double Room/room_06.jpg","video":false},{"src":"images/Studio Double Room/room_07.jpg","video":false},{"src":"images/Studio Double Room/room_08.jpg","video":false},{"src":"images/Studio Double Room/room_09.jpg","video":false},{"src":"images/Studio Double Room/room_10.jpg","video":false},{"src":"images/Studio Double Room/room_11.jpg","video":false}]},{"title":"Corner Suite","items":[{"src":"images/Corner Suite/room_01.jpg","video":false},{"src":"images/Corner Suite/room_02.jpg","video":false},{"src":"images/Corner Suite/room_03.jpg","video":false},{"src":"images/Corner Suite/room_04.jpg","video":false},{"src":"images/Corner Suite/room_05.jpg","video":false},{"src":"images/Corner Suite/room_06.jpg","video":false},{"src":"images/Corner Suite/room_07.jpg","video":false},{"src":"images/Corner Suite/room_08.jpg","video":false},{"src":"images/Corner Suite/room_09.jpg","video":false},{"src":"images/Corner Suite/room_10.jpg","video":false},{"src":"images/Corner Suite/room_11.jpg","video":false}]},{"title":"Grand Suite","items":[{"src":"images/Grand Suite Room/room_01.jpg","video":false},{"src":"images/Grand Suite Room/room_02.jpg","video":false},{"src":"images/Grand Suite Room/room_03.jpg","video":false},{"src":"images/Grand Suite Room/room_04.jpg","video":false},{"src":"images/Grand Suite Room/room_05.jpg","video":false},{"src":"images/Grand Suite Room/room_06.jpg","video":false},{"src":"images/Grand Suite Room/room_07.jpg","video":false},{"src":"images/Grand Suite Room/room_08.jpg","video":false},{"src":"images/Grand Suite Room/room_09.jpg","video":false},{"src":"images/Grand Suite Room/room_10.jpg","video":false},{"src":"images/Grand Suite Room/room_11.jpg","video":false},{"src":"images/Grand Suite Room/room_12.jpg","video":false},{"src":"images/Grand Suite Room/room_13.jpg","video":false},{"src":"images/Grand Suite Room/room_14.jpg","video":false},{"src":"images/Grand Suite Room/room_15.jpg","video":false},{"src":"images/Grand Suite Room/room_16.jpg","video":false},{"src":"images/Grand Suite Room/room_17.jpg","video":false},{"src":"images/Grand Suite Room/room_18.jpg","video":false}]},{"title":"Grand Suite · Two Bedrooms","items":[{"src":"images/Grand Suite Two Bedrooms/room_01.jpg","video":false},{"src":"images/Grand Suite Two Bedrooms/room_02.jpg","video":false},{"src":"images/Grand Suite Two Bedrooms/room_03.jpg","video":false},{"src":"images/Grand Suite Two Bedrooms/room_04.jpg","video":false},{"src":"images/Grand Suite Two Bedrooms/room_05.jpg","video":false},{"src":"images/Grand Suite Two Bedrooms/room_06.jpg","video":false},{"src":"images/Grand Suite Two Bedrooms/room_07.jpg","video":false},{"src":"images/Grand Suite Two Bedrooms/room_08.jpg","video":false},{"src":"images/Grand Suite Two Bedrooms/room_09.jpg","video":false},{"src":"images/Grand Suite Two Bedrooms/room_10.jpg","video":false},{"src":"images/Grand Suite Two Bedrooms/room_11.jpg","video":false},{"src":"images/Grand Suite Two Bedrooms/room_12.jpg","video":false},{"src":"images/Grand Suite Two Bedrooms/room_13.jpg","video":false},{"src":"images/Grand Suite Two Bedrooms/room_14.jpg","video":false},{"src":"images/Grand Suite Two Bedrooms/room_15.jpg","video":false},{"src":"images/Grand Suite Two Bedrooms/room_16.jpg","video":false},{"src":"images/Grand Suite Two Bedrooms/room_17.jpg","video":false}]},{"title":"Grand Deluxe","items":[{"src":"images/Grand Deluxe/3681be26-a5d5-4925-9971-d67732ffda4a.jpg","video":false},{"src":"images/Grand Deluxe/47e0d242-3c99-4ed0-b48a-91e3c4e711ba.jpg","video":false},{"src":"images/Grand Deluxe/4a573607-d6c4-45ed-bb23-e83cf4ad6359.jpg","video":false},{"src":"images/Grand Deluxe/9fa48cad-503d-4bf9-8296-7a90ce34bbd2.jpg","video":false},{"src":"images/Grand Deluxe/c67619ac-3646-462b-8dc7-58e1e6bf73b5.jpg","video":false},{"src":"images/Grand Deluxe/fab7da35-ac57-4ebd-b0a4-ae2981d17c9d.jpg","video":false}]},{"title":"Studio","items":[{"src":"images/Studio/0f2b3d73-e4ac-4a7c-93fb-6743b4e91cce.jpg","video":false},{"src":"images/Studio/8033675f-22d4-40d5-8629-566ef499612f.jpg","video":false}]},{"title":"Deluxe Twin Room","items":[{"src":"images/Deluxe Twin Room/room_01.jpg","video":false},{"src":"images/Deluxe Twin Room/room_02.jpg","video":false},{"src":"images/Deluxe Twin Room/room_03.jpg","video":false},{"src":"images/Deluxe Twin Room/room_04.jpg","video":false},{"src":"images/Deluxe Twin Room/room_05.jpg","video":false},{"src":"images/Deluxe Twin Room/room_06.jpg","video":false},{"src":"images/Deluxe Twin Room/room_07.jpg","video":false},{"src":"images/Deluxe Twin Room/room_08.jpg","video":false},{"src":"images/Deluxe Twin Room/room_09.jpg","video":false},{"src":"images/Deluxe Twin Room/room_10.jpg","video":false},{"src":"images/Deluxe Twin Room/room_11.jpg","video":false}]}];

  // room folder -> photo count (files are room_01.jpg … room_NN.jpg)
  const ROOM_COUNTS = {
    "Standard Single": 9, "Superior Room": 17, "Prestige Twin Room": 9,
    "Studio Room": 13, "Studio Double Room": 11, "Corner Suite": 11,
    "Grand Suite Room": 18, "Grand Suite Two Bedrooms": 17
  };
  function roomImages(folder) {
    const n = ROOM_COUNTS[folder] || 1, out = [];
    for (let i = 1; i <= n; i++) {
      out.push("images/" + folder + "/room_" + (i < 10 ? "0" + i : i) + ".jpg");
    }
    return out;
  }

  const GYM_IMAGES = [
    "images/Gym/0c3d1ad4-6fd3-4082-8cbd-a08f1a11dc0e.jpg",
    "images/Gym/43e19389-7794-4262-a062-ef37f608b52a.jpg",
    "images/Gym/b111922d-8527-4860-b485-2ab4cee5f3a9.jpg",
    "images/Gym/e2bb66fc-6cac-45ec-8316-ae1e71d90a0a.jpg"
  ];

  const TROPICAL_POOL_IMAGES = [
    "images/Tropical Pool/c917232b-159a-4fdc-bc20-12e806f5304b.jpg",
    "images/Tropical Pool/c3ac1733-933b-49de-aa10-7185a21dbe5f.jpg",
    "images/Tropical Pool/48cd9718-cece-4c80-adcd-dd637ed35d00.jpg",
    "images/Tropical Pool/1b23ab2d-a3d1-474c-8944-4c7159f6d91b.jpg",
    "images/Tropical Pool/ce70057e-42f0-4b44-9f67-18598f22ff3a.jpg",
    "images/Tropical Pool/ffcc842a-2003-4239-ae74-0e6c0b10f883.jpg"
  ];

  // named image sets for facility / dining cards
  const LB_SETS = {
    "fac-pool":  TROPICAL_POOL_IMAGES,
    "fac-onsen": ["images/ea770736-fe38-4c3e-b072-4928f8a2fad9.jpg"],
    "fac-gym":   GYM_IMAGES,
    "dining-tsubaki": ["images/ef6ec731-7bc6-4d8c-a10d-dcb7131d7470.jpg"],
    "dining-coffee":  COFFEE_IMAGES
  };

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

    function show(dir) {
      const item = items[idx];
      vid.innerHTML = "";
      if (item && typeof item === "object" && item.localVideo) {
        img.style.display = "none";
        vid.style.display = "";
        const v = document.createElement("video");
        v.src = enc(item.localVideo);
        v.controls = true; v.autoplay = true; v.muted = true;
        v.playsInline = true; v.setAttribute("playsinline", "");
        v.style.cssText = "width:100%;height:100%;object-fit:contain;background:#000;";
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

  function buildFullGallery(host) {
    GALLERY_MEDIA.forEach((cat) => {
      const lbList = cat.items.map(lbEntry);
      const block = document.createElement("div");
      block.className = "gcat reveal in";
      const h = document.createElement("h3");
      h.className = "gcat-title";
      h.innerHTML = cat.title + ' <span class="gcat-count">' + cat.items.length + "</span>";
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
          img.alt = cat.title;
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
    GALLERY_PREVIEW.forEach((src, i) => {
      const fig = document.createElement("figure");
      const img = document.createElement("img");
      img.src = enc(src);
      img.alt = "J Park Hotel";
      img.loading = "lazy";
      fig.appendChild(img);
      fig.addEventListener("click", () => LB.open(GALLERY_PREVIEW, i));
      grid.appendChild(fig);
    });

    const I = window.JPark && window.JPark.i18n;
    const wrap = document.createElement("div");
    wrap.className = "gallery-more-wrap";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gallery-more";
    btn.setAttribute("data-i18n", "gallery.more");
    btn.textContent = I ? I.t("gallery.more") : "More pictures and videos…";
    wrap.appendChild(btn);

    const full = document.createElement("div");
    full.className = "gallery-full";

    grid.parentNode.appendChild(wrap);
    grid.parentNode.appendChild(full);

    let built = false;
    btn.addEventListener("click", () => {
      if (built) return;
      built = true;
      btn.disabled = true;
      playLeafIntro(() => {
        buildFullGallery(full);
        full.classList.add("show");
        wrap.remove();
      });
    });
  }

  /* ---------- Clickable rooms + facility/dining galleries ---------- */
  function bindOpener(el, getList) {
    const open = () => { const l = getList(); if (l && l.length) LB.open(l, 0); };
    el.addEventListener("click", open);
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

  /* ---------- Staff/Admin portal link in the nav (when signed in) ---------- */
  function initNavPortal() {
    const link = document.getElementById("navPortalLink");
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
      } else {
        link.hidden = true;
      }
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

  // Meeting & Banquet Rooms uploaded photos.
  const BANQUET_IMAGES = [
    "images/Meeting and Banquet Rooms/494571715_1234993728633902_7937100202759146009_n.jpg",
    "images/Meeting and Banquet Rooms/494917326_1234993825300559_3003474501674880900_n.jpg",
    "images/Meeting and Banquet Rooms/494918097_1244121301054478_8305459958581942758_n.jpg",
    "images/Meeting and Banquet Rooms/495059787_1234993685300573_808848194837634403_n.jpg",
    "images/Meeting and Banquet Rooms/495071384_1244122731054335_7597308853160764089_n.jpg",
    "images/Meeting and Banquet Rooms/496253973_1244252684374673_7569938748860271089_n.jpg",
    "images/Meeting and Banquet Rooms/497496305_1244252934374648_7353825412616371042_n.jpg",
    "images/Meeting and Banquet Rooms/588040708_1422177456582194_470984224392519007_n.jpg",
    "images/Meeting and Banquet Rooms/683901474_1558444972955441_2309987664278666191_n.jpg",
    "images/Meeting and Banquet Rooms/687469820_1558444129622192_160825424360902258_n.jpg",
    "images/Meeting and Banquet Rooms/687999904_1558427726290499_7320805987719867448_n.jpg"
  ];

  // Meeting & Banquet Rooms: local clip plays as cover on scroll; click opens lightbox
  // with the video followed by the uploaded photos.
  const BANQUET_VIDEO_FILE =
    "images/Meeting and Banquet Rooms/AQM1GlMUG1VPn2W3_GoLJgXiKyz-GI7UgQOK_LlqgTjo1DDIoMkFYNqgC1lAFEUf0ysj7JGbiP_T-PB84vS-qiCCPTrRNOQeeZ0d2-jDjn1bIQ.mp4";
  function initBanquetVideo() {
    const card = document.querySelector('.fac-card[data-video="banquet"]');
    if (!card) return;
    let playing = false;
    function startCover() {
      if (playing) return;
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
        card.style.backgroundImage = "url('" + enc(BANQUET_IMAGES[0]) + "')";
        wrap.remove();
        card.classList.remove("playing");
      };
      const onError = () => { wrap.remove(); card.classList.remove("playing"); playing = false; };
      v.addEventListener("ended", onEnded);
      v.addEventListener("error", onError);
      const p = v.play(); if (p && p.catch) p.catch(() => {});
    }
    onceInView(card, startCover, 0.4);
    bindOpener(card, () => [{ localVideo: BANQUET_VIDEO_FILE }].concat(BANQUET_IMAGES));
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
      if (playing) return;
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
      if (done) return; done = true;
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
        setTimeout(() => overlay.remove(), 700);
      }, 8000);
    }
    onceInView(section, start, 0.35);
  }

  // Midnight Coffee Club: click the imagery to open the video + photos in the
  // shared lightbox (same prev/next experience as the other sections).
  function initCoffeeLightbox() {
    const section = document.getElementById("coffee");
    if (!section) return;
    const set = [{ localVideo: COFFEE_VIDEO_FILE }].concat(COFFEE_IMAGES);
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
    initHeader();
    initMenu();
    initCoffeeCarousel();
    buildLightbox();
    initGallery();
    initCardGalleries();
    initNavPortal();
    initBanquetVideo();
    initAllDayVideo();
    initCoffeeVideo();
    initCoffeeLightbox();
    initReveal();
    initYear();
    initViewToggle();
  });
})();
