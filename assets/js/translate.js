/* ============================================================
   J Park Hotel — live translation helper
   Translates free-text (chat messages, internal email) into the
   guest's selected language using the keyless Google Translate
   web endpoint. Results are cached in memory and localStorage so
   a string is only ever fetched once per target language. If the
   network call fails the original text is shown unchanged.
   ============================================================ */
(function () {
  "use strict";
  const J = (window.JPark = window.JPark || {});
  const I = J.i18n;

  const ENDPOINT = "https://translate.googleapis.com/translate_a/single";
  const LS_KEY = "jpark.trcache";
  const MAX_ENTRIES = 800;

  const mem = {};
  let ls = {};
  try { ls = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (_) { ls = {}; }

  function key(text, target) { return target + "" + text; }

  function persist() {
    try {
      const keys = Object.keys(ls);
      if (keys.length > MAX_ENTRIES) {
        keys.slice(0, keys.length - MAX_ENTRIES).forEach((k) => delete ls[k]);
      }
      localStorage.setItem(LS_KEY, JSON.stringify(ls));
    } catch (_) { /* storage full — ignore */ }
  }

  /* Translate `text` into `target` language.
     Resolves to { text, src } where src is the detected source
     language code (or null when unknown / translation failed). */
  function translate(text, target) {
    text = (text || "").trim();
    target = target || (I ? I.getLang() : "en");
    if (!text) return Promise.resolve({ text: text, src: target });

    const k = key(text, target);
    if (mem[k]) return Promise.resolve(mem[k]);
    if (ls[k]) { mem[k] = ls[k]; return Promise.resolve(ls[k]); }

    const url = ENDPOINT + "?client=gtx&sl=auto&tl=" +
      encodeURIComponent(target) + "&dt=t&q=" + encodeURIComponent(text);

    return fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        let out = "";
        if (Array.isArray(data) && Array.isArray(data[0])) {
          data[0].forEach((seg) => { if (seg && seg[0]) out += seg[0]; });
        }
        const src = data && data[2] ? String(data[2]).split("-")[0] : null;
        const res = { text: out || text, src: src };
        mem[k] = res; ls[k] = res; persist();
        return res;
      })
      .catch(() => {
        const res = { text: text, src: null };
        mem[k] = res; // don't persist failures
        return res;
      });
  }

  /* Decide whether a message still needs translating for a viewer reading in
     `targetLang`. `declaredLang` is the language the SENDER's UI was in when
     they sent it — normally reliable, but not always: a guest can leave the
     site in one language and type in another (the reason a Japanese question
     from someone browsing the Thai site showed up untranslated on the Thai
     front desk). So when the declared language matches the viewer's, we still
     translate if the text is visibly in a different SCRIPT (Thai vs CJK), which
     is the case the declared language gets wrong. Latin / digits / punctuation
     are neutral ("wifi", "OK", a room number) and never force a translation, so
     a staff member's short Thai-UI "ok" is never re-translated. */
  function scriptFamily(lang) {
    lang = String(lang || "").toLowerCase();
    if (lang === "th") return "thai";
    if (lang === "ja" || lang === "ko" || lang.indexOf("zh") === 0) return "cjk";
    return "latin"; // en + anything Latin-scripted
  }
  function hasForeignScript(text, targetLang) {
    let thai = 0, cjk = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c >= 0x0e00 && c <= 0x0e7f) thai++;
      else if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x3400 && c <= 0x9fff) ||
               (c >= 0xac00 && c <= 0xd7af) || (c >= 0xf900 && c <= 0xfaff)) cjk++;
    }
    if (!thai && !cjk) return false; // neutral (Latin/digits) — trust the declared lang
    const dominant = thai >= cjk ? "thai" : "cjk";
    return dominant !== scriptFamily(targetLang);
  }
  function needsTranslation(text, declaredLang, targetLang) {
    text = (text || "").trim();
    if (!text) return false;
    if (declaredLang && declaredLang === targetLang) return hasForeignScript(text, targetLang);
    return true; // declared language differs from the viewer's — translate
  }

  /* Human-readable name of a language code, in the current UI language. */
  function langName(code) {
    if (!code) return "";
    if (I && I.LANG_NAMES && I.LANG_NAMES[code]) return I.LANG_NAMES[code];
    try {
      const dn = new Intl.DisplayNames([I ? I.getLang() : "en"], { type: "language" });
      return dn.of(code) || code;
    } catch (_) { return code; }
  }

  /* Convenience: render `original` into `textEl`, then translate it to the
     current language. If the detected source differs from the target, the
     translated text replaces the original and a small ".tr-note" element
     ("Translated from X") is appended to `noteHost` (defaults to textEl).
     A stale-guard skips the update if the element has been detached. */
  function fill(textEl, original, noteHost) {
    const target = I ? I.getLang() : "en";
    textEl.textContent = original || "";
    if (!original || !original.trim()) return;
    translate(original, target).then((res) => {
      if (!textEl.isConnected) return;
      if (res.src && res.src !== target && res.text && res.text !== original) {
        textEl.textContent = res.text;
        const note = document.createElement("span");
        note.className = "tr-note";
        note.textContent = (I ? I.t("tr.from") : "Translated from") + " " + langName(res.src);
        (noteHost || textEl).appendChild(note);
      }
    });
  }

  J.translate = { text: translate, langName: langName, fill: fill, needsTranslation: needsTranslation };
})();
