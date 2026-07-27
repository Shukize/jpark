/* ============================================================
   J Park Hotel — Help & Guide panel
   ------------------------------------------------------------
   Turns assets/js/help-content.js into the "Help & Guide" page
   of the staff console.

   • Role-aware: an admin sees every section (the admin-only ones
     badged); a staff account never sees the admin sections at
     all, so the staff guide is exactly the staff's job.
   • Follows the console's language switch — the whole guide
     repaints on jpark:langchange, no reload.
   • Read-aloud uses the browser's own speech synthesis. No audio
     files to host, nothing to re-record when a button is renamed,
     and it speaks whichever language is on screen.
   • Every panel's <h2> gets a "?" that jumps straight to the
     matching section, which is the hand-holding that actually
     gets used — nobody reads a manual front to back.
   ============================================================ */
(function () {
  "use strict";
  const J = (window.JPark = window.JPark || {});
  const HELP = window.JPARK_HELP;
  if (!HELP) { console.error("[help] help-content.js not loaded first"); return; }

  const esc = (J.util && J.util.escapeHtml) ? J.util.escapeHtml : function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  /* Which panel each guide section explains, for the "?" buttons.
     Team Status is left out on purpose: its heading is redrawn by
     employee-card.js on every poll, so a button planted in it would
     flicker in and out — and it is the one board nobody needs help
     reading. */
  const PANEL_SECTION = {
    requests: "requests",
    chat: "chat",
    messages: "messages",
    site: "site",
    team: "team",
    maintenance: "maintenance",
    accountLogs: "logs"
  };

  /* Voice for read-aloud. The site's language codes aren't BCP-47
     region codes, and a voice picked by prefix alone would read Thai
     with an English voice (i.e. nonsense), so we match deliberately. */
  const SPEECH_LANG = {
    th: "th-TH", en: "en-GB", ja: "ja-JP",
    "zh-Hans": "zh-CN", "zh-Hant": "zh-TW"
  };

  /* The guide is read aloud in a calm female voice, per the hotel's
     choice. The Web Speech API exposes no gender field, so the voice
     has to be recognised by name. These are the shipped voices on
     Windows (SAPI + Edge "Natural"), macOS and Chrome for the five
     site languages; anything unlisted falls back to the generic
     "female" marker Android and Chrome use. */
  const FEMALE_VOICES = [
    // Thai
    "premwadee", "achara", "kanya",
    // Japanese
    "nanami", "haruka", "ayumi", "sayaka", "mizuki", "kyoko", "o-ren",
    // Chinese (Simplified)
    "xiaoxiao", "xiaoyi", "xiaohan", "xiaomo", "huihui", "yaoyao", "ting-ting", "tingting",
    // Chinese (Traditional)
    "hsiaochen", "hsiaoyu", "hanhan", "yating", "mei-jia", "meijia",
    // English
    "sonia", "libby", "maisie", "hazel", "susan", "serena", "kate", "stephanie",
    "samantha", "zira", "jenny", "aria", "michelle", "ava", "emma"
  ];
  const MALE_VOICES = [
    "pattara", "niwat",
    "keita", "ichiro", "otoya", "daichi", "naoki",
    "yunxi", "yunyang", "yunjian", "kangkang", "li-mu",
    "yunjhe", "zhiwei",
    "ryan", "george", "daniel", "guy", "david", "mark", "thomas", "alex", "fred", "oliver"
  ];
  // "female" contains "male", so the female test must always win first.
  const FEMALE_RE = /\bfemale\b|\bwoman\b/i;
  const MALE_RE = /\bmale\b|\bman\b/i;

  function voiceGender(name) {
    const n = String(name || "").toLowerCase();
    if (FEMALE_RE.test(n)) return "f";
    if (FEMALE_VOICES.some(function (x) { return n.indexOf(x) >= 0; })) return "f";
    if (MALE_RE.test(n)) return "m";
    if (MALE_VOICES.some(function (x) { return n.indexOf(x) >= 0; })) return "m";
    return "?";
  }

  let search = "";
  let mounted = false;

  function lang() { return (J.i18n && J.i18n.getLang && J.i18n.getLang()) || "th"; }
  function pack() { return HELP[lang()] || HELP.en; }
  function ui(k) { return (pack().ui && pack().ui[k]) || (HELP.en.ui[k] || k); }

  function isAdmin() {
    try {
      const s = JSON.parse(localStorage.getItem("jpark.staff") || "null");
      return !!s && s.role === "admin";
    } catch (_) { return false; }
  }

  function sections() {
    const admin = isAdmin();
    return pack().sections.filter(function (s) { return admin || !s.admin; });
  }

  /* Every word of a section, for search and for read-aloud. */
  function sectionLines(s) {
    const out = [s.title, s.intro];
    (s.steps || []).forEach(function (st) { out.push(st.t + ". " + st.d); });
    (s.tips || []).forEach(function (x) { out.push(x); });
    if (s.warn) out.push(ui("warnTitle") + ": " + s.warn);
    return out.filter(Boolean);
  }
  function sectionText(s) { return sectionLines(s).join(" ").toLowerCase(); }

  /* Rough minutes-to-read. Thai and CJK don't put spaces between words,
     so words are not a usable unit for them — count characters, at a
     per-script rate. A single rate would tell a Thai reader the same
     guide takes twice as long as it tells an English one. */
  const READ_RATE = { th: 950, ja: 500, "zh-Hans": 360, "zh-Hant": 360 }; // chars/min
  function readingMinutes(list) {
    const text = list.map(sectionText).join(" ");
    const rate = READ_RATE[lang()];
    const n = rate ? text.length / rate : text.split(/\s+/).length / 190;
    return Math.max(1, Math.round(n));
  }

  /* ---------------- read aloud ---------------- */
  const synth = window.speechSynthesis || null;
  let speakingId = null;

  /* Score every installed voice and take the best: right language first
     (a wrong-language voice reads the text as gibberish), then female,
     then a neural/"Natural" voice, which is markedly calmer than the
     old robotic desktop ones. A male voice is only ever used when the
     machine has nothing else for that language — silence would be
     worse than the wrong voice. */
  function pickVoice() {
    if (!synth) return null;
    const want = (SPEECH_LANG[lang()] || "en-GB").toLowerCase();
    const base = want.split("-")[0];
    const voices = synth.getVoices() || [];
    let best = null, bestScore = -Infinity;

    voices.forEach(function (v) {
      const vlang = String(v.lang || "").replace("_", "-").toLowerCase();
      let score;
      if (vlang === want) score = 100;
      else if (vlang.indexOf(base) === 0) score = 60;
      else return;                      // wrong language — never usable

      const g = voiceGender(v.name);
      if (g === "f") score += 30;
      else if (g === "m") score -= 25;

      if (/natural|neural|online/i.test(v.name)) score += 8;
      if (/google/i.test(v.name)) score += 4;   // Google's are the smoother ones
      if (/compact|espeak/i.test(v.name)) score -= 10;

      if (score > bestScore) { bestScore = score; best = v; }
    });
    return best;
  }

  function stopSpeaking() {
    if (synth) { try { synth.cancel(); } catch (_) {} }
    speakingId = null;
    paintSpeakButtons();
  }

  /* Long utterances get truncated by some browsers, so a section is
     queued one line at a time rather than as a single wall of text. */
  function speakSection(s) {
    if (!synth) { toast(ui("noVoice")); return; }
    if (speakingId === s.id) { stopSpeaking(); return; }
    stopSpeaking();
    const voice = pickVoice();
    if (!voice) { toast(ui("noVoice")); return; }

    speakingId = s.id;
    paintSpeakButtons();
    const lines = sectionLines(s);
    lines.forEach(function (line, i) {
      // The whole utterance is built inside the try: assigning .voice
      // throws outright in Chrome if the browser has meanwhile dropped
      // that voice (a Bluetooth headset disconnecting is enough), and
      // an exception here would leave the button stuck on "Stop".
      try {
        const u = new SpeechSynthesisUtterance(line);
        u.voice = voice;
        u.lang = voice.lang;
        // Unhurried and even — this is read while someone is trying to
        // follow along on the screen, not a podcast.
        u.rate = 0.88;
        u.pitch = 1.0;
        u.volume = 0.9;
        if (i === lines.length - 1) {
          u.onend = function () { if (speakingId === s.id) { speakingId = null; paintSpeakButtons(); } };
        }
        synth.speak(u);
      } catch (_) {}
    });
  }

  function paintSpeakButtons() {
    document.querySelectorAll(".help-speak").forEach(function (b) {
      const on = b.dataset.sec === speakingId;
      b.classList.toggle("is-speaking", on);
      b.textContent = (on ? "⏹ " + ui("stop") : "🔊 " + ui("listen"));
    });
  }

  // Chrome fills the voice list asynchronously; re-check once it does.
  if (synth && typeof synth.addEventListener === "function") {
    synth.addEventListener("voiceschanged", function () { /* list warmed */ });
  }

  function toast(msg) {
    if (J.util && J.util.toast) J.util.toast(msg);
    else alert(msg);
  }

  /* ---------------- rendering ---------------- */
  function render() {
    const mount = document.getElementById("helpMount");
    if (!mount) return;
    stopSpeaking();

    const all = sections();
    const q = search.trim().toLowerCase();
    const shown = q ? all.filter(function (s) { return sectionText(s).indexOf(q) >= 0; }) : all;

    let html =
      '<div class="help-head">' +
        "<h2>" + esc(ui("title")) + "</h2>" +
        '<p class="panel-lede">' + esc(isAdmin() ? ui("subAdmin") : ui("subStaff")) +
          ' <span class="help-mins">· ' + esc(ui("readingTime").replace("{n}", readingMinutes(all))) + "</span></p>" +
        '<div class="help-tools">' +
          '<div class="help-search"><span aria-hidden="true">🔍</span>' +
            '<input type="search" id="helpSearch" autocomplete="off" placeholder="' + esc(ui("searchPh")) + '" ' +
              'aria-label="' + esc(ui("searchPh")) + '" value="' + esc(search) + '" /></div>' +
          '<button type="button" class="help-btn" id="helpPrint">🖨 ' + esc(ui("print")) + "</button>" +
        "</div>" +
      "</div>";

    html += '<div class="help-shell">';

    // Table of contents
    html += '<nav class="help-toc" aria-label="' + esc(ui("toc")) + '"><h3>' + esc(ui("toc")) + "</h3><ol>";
    shown.forEach(function (s) {
      html += '<li><a href="#help-sec-' + esc(s.id) + '" data-goto="' + esc(s.id) + '">' +
        '<span class="ht-ico" aria-hidden="true">' + s.ico + "</span>" +
        '<span class="ht-label">' + esc(s.title) + "</span>" +
        (s.admin ? '<span class="ht-admin">' + esc(ui("adminBadge")) + "</span>" : "") +
        "</a></li>";
    });
    html += "</ol></nav>";

    // Sections
    html += '<div class="help-content">';
    if (!shown.length) {
      html += '<p class="help-nomatch">' + esc(ui("noMatch")) + "</p>";
    }
    shown.forEach(function (s) {
      html += '<section class="help-sec' + (s.admin ? " is-admin" : "") + '" id="help-sec-' + esc(s.id) + '">' +
        '<div class="help-sec-head">' +
          '<h3><span class="hs-ico" aria-hidden="true">' + s.ico + "</span>" + esc(s.title) + "</h3>" +
          (s.admin ? '<span class="hs-admin">' + esc(ui("adminBadge")) + "</span>" : "") +
          '<button type="button" class="help-speak" data-sec="' + esc(s.id) + '">🔊 ' + esc(ui("listen")) + "</button>" +
        "</div>" +
        '<p class="help-intro">' + esc(s.intro) + "</p>" +
        '<ol class="help-steps">';
      (s.steps || []).forEach(function (st) {
        html += "<li><b>" + esc(st.t) + "</b><span>" + esc(st.d) + "</span></li>";
      });
      html += "</ol>";
      if (s.tips && s.tips.length) {
        html += '<div class="help-tip"><b>' + esc(ui("tipTitle")) + "</b><ul>";
        s.tips.forEach(function (x) { html += "<li>" + esc(x) + "</li>"; });
        html += "</ul></div>";
      }
      if (s.warn) {
        html += '<div class="help-warn"><b>⚠ ' + esc(ui("warnTitle")) + "</b><p>" + esc(s.warn) + "</p></div>";
      }
      html += '<a class="help-top" href="#helpMount" data-top="1">↑ ' + esc(ui("top")) + "</a>";
      html += "</section>";
    });
    html += "</div></div>";

    mount.innerHTML = html;
    wire(mount);
  }

  function wire(mount) {
    const input = mount.querySelector("#helpSearch");
    if (input) {
      input.addEventListener("input", function () {
        search = input.value;
        render();
        // Rebuilding the list steals focus back to the top of the page;
        // put the caret back where the user is still typing.
        const again = document.getElementById("helpSearch");
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      });
    }
    const print = mount.querySelector("#helpPrint");
    if (print) print.addEventListener("click", function () {
      // Print the whole guide, not just what a search left on screen.
      if (search) { search = ""; render(); }
      setTimeout(function () { window.print(); }, 60);
    });

    mount.querySelectorAll("[data-goto]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        scrollToSection(a.dataset.goto);
      });
    });
    mount.querySelectorAll("[data-top]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        mount.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    mount.querySelectorAll(".help-speak").forEach(function (b) {
      b.addEventListener("click", function () {
        const s = sections().find(function (x) { return x.id === b.dataset.sec; });
        if (s) speakSection(s);
      });
    });
  }

  function scrollToSection(id) {
    const el = document.getElementById("help-sec-" + id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("help-flash");
    setTimeout(function () { el.classList.remove("help-flash"); }, 1400);
  }

  /* ---------------- opening ---------------- */
  function open(sectionId) {
    const nav = document.querySelector('.nav-item[data-panel="help"]');
    if (nav) nav.click();          // reuses the console's own panel switching
    markSeen();
    render();
    if (sectionId) setTimeout(function () { scrollToSection(sectionId); }, 60);
  }

  const SEEN_KEY = "jpark.help.seen";
  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch (_) {}
    const nav = document.querySelector('.nav-item[data-panel="help"]');
    if (nav) nav.classList.remove("is-new");
  }
  function paintNewBadge() {
    const nav = document.querySelector('.nav-item[data-panel="help"]');
    if (!nav) return;
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch (_) {}
    nav.classList.toggle("is-new", !seen);
    const b = nav.querySelector(".ni-new");
    if (b) b.textContent = ui("newBadge");
  }

  /* A "?" beside each panel's title, opening this guide at the section
     that explains that very panel. Panels are rendered at different
     times, so this is re-run whenever the user moves around. */
  function injectPanelButtons() {
    Object.keys(PANEL_SECTION).forEach(function (panel) {
      const wrap = document.getElementById("panel-" + panel);
      if (!wrap || wrap.querySelector(".help-hint")) return;
      const h2 = wrap.querySelector(":scope > h2");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.title = ui("openHint");
      btn.setAttribute("aria-label", ui("openHint"));
      btn.addEventListener("click", function () { open(PANEL_SECTION[panel]); });
      if (h2) {
        // Inside the title, as a quiet "?" the eye can skip.
        btn.className = "help-hint";
        btn.textContent = "?";
        h2.appendChild(btn);
      } else {
        // A panel with no heading of its own (Messages) gets a labelled
        // pill above it instead — a lone "?" floating there reads as a bug.
        btn.className = "help-hint help-hint-pill";
        btn.textContent = "? " + ui("nav");
        const row = document.createElement("div");
        row.className = "help-hint-row";
        row.appendChild(btn);
        wrap.insertBefore(row, wrap.firstChild);
      }
    });
  }

  function refreshPanelButtonLabels() {
    document.querySelectorAll(".help-hint").forEach(function (b) {
      b.title = ui("openHint");
      b.setAttribute("aria-label", ui("openHint"));
      if (b.classList.contains("help-hint-pill")) b.textContent = "? " + ui("nav");
    });
  }

  /* ---------------- boot ---------------- */
  document.addEventListener("DOMContentLoaded", function () {
    const nav = document.querySelector('.nav-item[data-panel="help"]');
    if (nav) {
      nav.addEventListener("click", function () {
        // Role can only be known after sign-in, and the label follows the
        // language, so the guide is (re)built each time it's opened.
        markSeen();
        render();
        mounted = true;
      });
    }
    injectPanelButtons();
    paintNewBadge();

    // Leaving the guide should not keep talking at whoever is now trying
    // to answer a chat.
    document.querySelectorAll('.nav-item:not([data-panel="help"])').forEach(function (b) {
      b.addEventListener("click", function () { stopSpeaking(); injectPanelButtons(); });
    });

    document.addEventListener("jpark:langchange", function () {
      const navLabel = document.querySelector('.nav-item[data-panel="help"] .ni-label');
      if (navLabel) navLabel.textContent = ui("nav");
      refreshPanelButtonLabels();
      paintNewBadge();
      if (mounted) render();
    });

    const navLabel = document.querySelector('.nav-item[data-panel="help"] .ni-label');
    if (navLabel) navLabel.textContent = ui("nav");
  });

  J.help = { open: open, render: render, stop: stopSpeaking };
})();
