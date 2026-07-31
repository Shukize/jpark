/* ============================================================
   J Park Hotel — Site Editor content sync (client half of /api/content)

   For a long time every Site Editor tab except Rates / Live Chat / Room
   availability / Room counts wrote ONLY to the editing admin's own
   localStorage. Nothing ever issued PUT /api/content, and the public site
   only ever merged back `overrides/images/theme/hidden` — never `media`.
   The visible symptom was the photo manager: an admin would reorder a
   room's photos, the tile numbers would renumber, the set would be badged
   "edited"… and the website would still show the old order, because the
   new order existed nowhere but that one browser profile.

   This module is the missing round trip, used by all three pages:
     pull()  — public pages + the editor, on load: fetch the row and adopt it
     push()  — the editor, after every change: publish the whole row

   Ordering rules that matter:
   • The server row is authoritative on read. A guest's browser must never
     keep a stale local copy just because it has one.
   • pull() will not overwrite edits that have not been published yet (a
     push in flight or queued), so an admin editing offline doesn't lose
     work to their own background refresh.
   • pull() sends ?since=<cached updatedAt> so an unchanged row costs one
     timestamp instead of the whole CMS payload on every page view — this
     row is read on every single guest page load (see the 2026-07-13 Neon
     transfer outage).
   ============================================================ */
(function () {
  "use strict";
  const J = (window.JPark = window.JPark || {});

  // Where the last-seen server version is remembered. Kept outside the
  // `content` object so it never rides along in a PUT payload.
  const VERSION_KEY = "jpark.contentVersion";

  // Subtrees of `content` that belong to the server row. Anything else in
  // there (unavailableRooms, legacy heroTitle/heroLede, …) is owned by a
  // different route and must survive a pull untouched.
  const OWNED = ["overrides", "images", "theme", "hidden", "media", "editLog"];

  const PUSH_DEBOUNCE_MS = 700;

  function store() { return J.store || null; }
  function api() { return J.api || null; }

  function localVersion() {
    const n = Number(localStorage.getItem(VERSION_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function setLocalVersion(ms) {
    try {
      if (ms) localStorage.setItem(VERSION_KEY, String(ms));
      else localStorage.removeItem(VERSION_KEY);
    } catch (_) {}
  }

  /* `hidden` is a map ({rooms:true}) in the browser and a TEXT[] in Postgres —
     the column is shared with other readers, so the conversion lives here. */
  function hiddenToArray(map) {
    if (Array.isArray(map)) return map.slice();
    return Object.keys(map || {}).filter((k) => map[k]);
  }
  function hiddenToMap(arr) {
    const out = {};
    (Array.isArray(arr) ? arr : []).forEach((k) => { out[k] = true; });
    return out;
  }

  /* ---------------- pull ---------------- */

  let pullPromise = null;

  /* Fetches the published content and adopts it locally. Resolves with
     { changed, mediaChanged, offline } — `mediaChanged` matters to callers
     that built galleries from the old order and need to repaint. */
  function pull() {
    if (pullPromise) return pullPromise;
    const S = store(), API = api();
    if (!S || !API) return Promise.resolve({ changed: false });

    const since = localVersion();
    const path = "/api/content" + (since ? "?since=" + since : "");
    pullPromise = API.get(path).then((res) => {
      if (!res || res.error) return { changed: false, offline: !!res && !!res.offline };
      if (res.unchanged) {
        if (res.updatedAt) setLocalVersion(res.updatedAt);
        return { changed: false };
      }
      // Never let a background refresh undo edits this browser has made but
      // not yet published — the admin's unsaved work outranks the server.
      if (hasUnpublishedEdits()) return { changed: false };
      // Nothing has ever been published, but this browser holds edits: that is
      // the admin's own machine, carrying work made back when the editor saved
      // to localStorage and nothing else. Adopting the empty server row here
      // would silently delete it. Report it instead so the Site Editor can
      // publish it (see staff.js's syncSiteContent).
      if (isEmptyPayload(res) && hasLocalEdits()) {
        return { changed: false, localAhead: true };
      }
      return adopt(res);
    }).finally(() => { pullPromise = null; });
    return pullPromise;
  }

  function countKeys(o) { return o && typeof o === "object" ? Object.keys(o).length : 0; }

  /* True when the published row carries no admin edits at all (a database that
     has never been written to, or one reset back to the shipped site). */
  function isEmptyPayload(res) {
    return !countKeys(res.overrides) && !countKeys(res.images) && !countKeys(res.theme)
      && !countKeys(res.media) && !(res.hidden || []).length && !(res.announcements || []).length;
  }

  /* True when THIS browser holds Site Editor edits. */
  function hasLocalEdits() {
    const S = store();
    const c = S.read("content", {}) || {};
    return !!(countKeys(c.overrides) || countKeys(c.images) || countKeys(c.theme)
      || countKeys(c.media) || hiddenToArray(c.hidden).length || S.list("announcements").length);
  }

  function adopt(res) {
    const S = store();
    const local = S.read("content", {}) || {};
    const before = JSON.stringify(local.media || null);

    const next = Object.assign({}, local, {
      overrides: res.overrides || {},
      images:    res.images    || {},
      theme:     res.theme     || {},
      hidden:    hiddenToMap(res.hidden),
      media:     res.media     || {},
      editLog:   Array.isArray(res.editLog) ? res.editLog : [],
    });

    const mediaChanged = JSON.stringify(next.media || null) !== before;
    const stored = S.write("content", next);
    // A failed write is almost always the localStorage quota (an admin
    // inlined a large photo). Do NOT record the version in that case, or the
    // next pull would answer "unchanged" and this browser would sit on the
    // old content forever.
    if (stored) setLocalVersion(res.updatedAt || Date.now());

    if (Array.isArray(res.announcements)) {
      const cur = JSON.stringify(S.list("announcements"));
      if (cur !== JSON.stringify(res.announcements)) S.write("announcements", res.announcements);
    }
    return { changed: true, mediaChanged: mediaChanged, stored: stored };
  }

  /* ---------------- push ---------------- */

  let pushTimer = null;
  let pushInFlight = false;
  let pendingResolvers = [];
  let dirty = false;

  function hasUnpublishedEdits() { return dirty || pushInFlight || pushTimer !== null; }

  function payload() {
    const S = store();
    const c = S.read("content", {}) || {};
    return {
      overrides:     c.overrides || {},
      images:        c.images    || {},
      theme:         c.theme     || {},
      hidden:        hiddenToArray(c.hidden),
      media:         c.media     || {},
      announcements: S.list("announcements"),
      editLog:       Array.isArray(c.editLog) ? c.editLog : [],
    };
  }

  async function flush() {
    pushTimer = null;
    const API = api();
    if (!API) { settle({ error: "No API" }); return; }
    pushInFlight = true;
    dirty = false;
    const res = await API.put("/api/content", payload());
    pushInFlight = false;
    if (res && res.ok) {
      setLocalVersion(res.updatedAt || Date.now());
      settle({ ok: true, updatedAt: res.updatedAt });
      return;
    }
    // Failed: the local copy is still ahead of the server, so keep it flagged
    // as unpublished — a later pull must not silently roll it back.
    dirty = true;
    settle({
      error: (res && res.error) || "Save failed",
      code: res && res.code,
      offline: !!(res && res.offline),
    });
  }

  function settle(result) {
    const waiting = pendingResolvers;
    pendingResolvers = [];
    waiting.forEach((fn) => { try { fn(result); } catch (_) {} });
  }

  /* Publishes the current local content. Coalesces the burst of writes a
     single editor action produces (a photo move rewrites the set and appends
     an edit-log entry) into one PUT. Resolves with { ok } or { error }. */
  function push() {
    dirty = true;
    return new Promise((resolve) => {
      pendingResolvers.push(resolve);
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(flush, PUSH_DEBOUNCE_MS);
    });
  }

  /* Publishes immediately, skipping the debounce (used on page-hide so an
     edit made a moment before closing the tab still lands). */
  function pushNow() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    return new Promise((resolve) => { pendingResolvers.push(resolve); flush(); });
  }

  J.contentSync = {
    pull: pull,
    push: push,
    pushNow: pushNow,
    hasUnpublishedEdits: hasUnpublishedEdits,
    localVersion: localVersion,
    setLocalVersion: setLocalVersion,
  };
})();
