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

  /* ---------- Gallery (curated property shots) + lightbox ---------- */
  const GALLERY_IMAGES = [
    { src: "images/c917232b-159a-4fdc-bc20-12e806f5304b.jpg", tall: true },
    { src: "images/45c09cb7-8ba5-4ba0-bc3c-42837ef10bf2.jpg" },
    { src: "images/ffcc842a-2003-4239-ae74-0e6c0b10f883.jpg" },
    { src: "images/New Midnight Coffee Club/9fc27bb2-ce97-4825-84b4-e3c2152c5628.jpg" },
    { src: "images/ea770736-fe38-4c3e-b072-4928f8a2fad9.jpg", tall: true },
    { src: "images/843e2617-637f-4337-8f46-69ff1e5b6979.jpg" },
    { src: "images/Grand Deluxe/9fa48cad-503d-4bf9-8296-7a90ce34bbd2.jpg" },
    { src: "images/9f43d60e-e1b0-4ea0-b8b2-82792fbd44eb.jpg" },
    { src: "images/New Midnight Coffee Club/587f2a86-cbf1-4cac-9e69-9279d2478323.jpg", tall: true },
    { src: "images/ce70057e-42f0-4b44-9f67-18598f22ff3a.jpg" },
    { src: "images/c3ac1733-933b-49de-aa10-7185a21dbe5f.jpg" },
    { src: "images/Studio/0f2b3d73-e4ac-4a7c-93fb-6743b4e91cce.jpg" }
  ];

  function initGallery() {
    const grid = document.getElementById("galleryGrid");
    if (!grid) return;

    GALLERY_IMAGES.forEach((item) => {
      const fig = document.createElement("figure");
      if (item.tall) fig.classList.add("tall");
      const img = document.createElement("img");
      img.src = enc(item.src);
      img.alt = "J Park Hotel";
      img.loading = "lazy";
      fig.appendChild(img);
      fig.addEventListener("click", () => openLightbox(enc(item.src)));
      grid.appendChild(fig);
    });

    // lightbox element
    const box = document.createElement("div");
    box.className = "lightbox";
    box.innerHTML = '<button class="lightbox-close" aria-label="Close">&times;</button><img alt="" />';
    document.body.appendChild(box);
    const boxImg = box.querySelector("img");
    const closeBtn = box.querySelector(".lightbox-close");

    function close() { box.classList.remove("open"); }
    closeBtn.addEventListener("click", close);
    box.addEventListener("click", (e) => { if (e.target === box) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    window.__openLightbox = function (src) { boxImg.src = src; box.classList.add("open"); };
  }
  function openLightbox(src) { if (window.__openLightbox) window.__openLightbox(src); }

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

  document.addEventListener("DOMContentLoaded", () => {
    initHeader();
    initMenu();
    initCoffeeCarousel();
    initGallery();
    initReveal();
    initYear();
  });
})();
