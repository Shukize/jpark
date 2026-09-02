/* ============================================================
   J Park Hotel — staff & admin console
   Login (Staff / Admin roles), guest-request board, live chat
   replies, internal company messages, and admin-only site
   editing + staff moderation. Real-time across tabs.
   ============================================================ */
(function () {
  "use strict";
  const J = window.JPark;
  const S = window.JPark.store;
  const I = window.JPark.i18n;
  const U = window.JPark.util;
  const MED = window.JPark.media;
  const t = (k) => I.t(k);
  /* Translate into a SPECIFIC language rather than the console's.

     i18n.js's t(key, lang) has always taken a language; the wrapper above
     drops it, so every t("x", "th") written anywhere in this file silently
     returned the console's language instead — a failure with no error and no
     visible symptom until somebody reads the output in the wrong language.
     Anything that renders for a reader who is not the logged-in user — the
     guest's copy of a receipt, above all — must use this instead. */
  const tl = (k, lang) => I.t(k, lang || I.getLang());
  const esc = U.escapeHtml;

  /* Resolve a media-set's display name. If its translation key is missing
     (t() returns the key unchanged), fall back to a readable name derived
     from the set id (e.g. "room:Studio Single" -> "Studio Single") so the
     editor never shows a raw "rooms.xxxName" key. */
  function setLabel(s) {
    const key = s.labelKey || "";
    const v = t(key);
    if (v && v !== key) return v;
    const id = s.id || "";
    if (id.indexOf(":") >= 0) return id.slice(id.indexOf(":") + 1);
    return v || id;
  }

  const SESSION_KEY = "jpark.staff";
  const DEFAULT_STAFF_PASSWORD = "jparkhotel";
  let nsUserId = null; // staff id mid-way through first-time password setup
  // The password that account just authenticated with (its temporary one).
  // POST /api/auth/change-password will not replace an existing password
  // without it — holding a token is not proof you know the password you're
  // replacing — so the forced first-login setup carries it through this one
  // step and drops it the moment the change succeeds. Never persisted.
  let nsCurrentPass = "";
  const SECTIONS = [
    { id: "coffee", label: "nav.coffee" }, { id: "services", label: "nav.services" },
    { id: "about", label: "nav.about" }, { id: "rooms", label: "nav.rooms" },
    { id: "facilities", label: "nav.facilities" }, { id: "onsen", label: "nav.onsen" },
    { id: "dining", label: "nav.dining" },
    { id: "concierge", label: "nav.concierge" }, { id: "gallery", label: "nav.gallery" }
  ];
  // "dismissed" is status 'cancelled' — the tab exists so a request a staff
  // member cleared off the board can still be found and put back. (Permanent
  // deletion is admin-only and leaves nothing behind, by design.)
  const REQ_FILTERS = ["all", "pending", "progress", "done", "dismissed"];
  // Two of these are synthetic filters rather than values of b.status, and are
  // special-cased in filterBookings(): "resent" reads b.lastAmendedAt, and
  // "attention" asks bookingActionReasons() what still needs doing.
  //
  // "attention" replaced a raw "pending" status tab. b.status is only ever
  // 'pending' on a day-use request — every room booking taken on the website
  // is written straight to 'confirmed' — so that tab sat empty essentially
  // forever while the actual front-desk work (a booking with no room number
  // on it, an online payment the guest never completed, an arrival whose money
  // was never recorded) had nowhere to be seen. Grouping by "what is still
  // outstanding" is what a desk actually works from.
  /* "ready" is the front desk's own view: everything that is settled and
     has a physical room against it, so the only bookings left in the other
     tabs are the ones still needing something done. Placed after
     "attention" because the two are opposites — one is the worklist, the
     other is what has left it. */
  const BK_FILTERS = ["all", "attention", "ready", "confirmed", "cancelled", "resent"];

  /* ---- Site Editor configuration ----
     Groups every public-site translation key (by prefix) into friendly,
     collapsible sections so an admin can edit any words on the site. */
  // Each group also names the public section it lives in (for "View on site")
  // and a media set whose first photo is shown as the group's thumbnail.
  const EDIT_GROUPS = [
    { title: "staff.site.grpBrand",    prefixes: ["brand.", "nav."],                          section: "home",       thumb: "hero" },
    { title: "staff.site.grpHero",     prefixes: ["hero.", "hb."],                             section: "home",       thumb: "hero" },
    { title: "nav.about",              prefixes: ["about."],                                   section: "about",      thumb: "aboutMain" },
    { title: "nav.rooms",              prefixes: ["rooms."],                                   section: "rooms",      thumb: "room:Studio Single" },
    { title: "nav.facilities",         prefixes: ["fac."],                                     section: "facilities", thumb: "pool" },
    { title: "nav.onsen",              prefixes: ["onsen."],                                   section: "onsen",      thumb: "onsenMen" },
    { title: "nav.dining",             prefixes: ["dining.", "menu."],                         section: "dining",     thumb: "tsubaki" },
    { title: "nav.coffee",             prefixes: ["coffee."],                                  section: "coffee",     thumb: "coffee" },
    { title: "staff.site.grpChat",     prefixes: ["chat."],                                    section: "coffee",     thumb: "coffee" },
    { title: "nav.gallery",            prefixes: ["gallery."],                                 section: "gallery",    thumb: "hotel" },
    { title: "staff.site.grpServices", prefixes: ["services.", "matrix.", "rs.", "gate.", "track."], section: "services", thumb: "hotel" },
    { title: "nav.concierge",          prefixes: ["conc."],                                    section: "concierge",  thumb: "hotel" },
    { title: "nav.contact",            prefixes: ["contact."],                                 section: "contact",    thumb: "hotel" },
    { title: "staff.site.grpFooter",   prefixes: ["footer."],                                  section: "contact",    thumb: "hotel" }
  ];
  // Brand colours -> CSS variables (defaults mirror style.css :root).
  const THEME_COLORS = [
    { key: "teal",       label: "staff.site.colPrimary", def: "#0c5b58" },
    { key: "terracotta", label: "staff.site.colAccent",  def: "#b8552e" },
    { key: "gold",       label: "staff.site.colGold",    def: "#c9a24b" }
  ];
  const GUIDE_HIDDEN_KEY = "jpark.guideHidden";
  const BK_SECTIONS_KEY = "jpark.bkSections";
  // Guest Booking archival: which "age bucket" a booking's row belongs to,
  // measured from check-out date (not when the record was created/imported —
  // a booking created today for a stay 8 months out is still "recent"; one
  // whose stay ended 8 months ago is not). 60/180-day thresholds approximate
  // 2/6 calendar months without the edge cases of exact month arithmetic.
  const BK_AGE_OLDER2_DAYS = 60;
  const BK_AGE_OLDER6_DAYS = 180;

  let session = null;
  let panel = "requests";
  let reqFilter = "all";
  // Guest Requests board state. The board is a working queue, so it carries
  // the same controls a paper one would: which department, a search, and a
  // separate view for requests filed while testing the portal (which are kept
  // but never counted — see isLiveRequest()).
  let reqDept = "all";
  let reqSearch = "";
  let reqShowTest = false;
  let reqMultiSelect = false;
  let selectedReqIds = new Set();
  let reqAgeTimer = null;
  // Which guest the slide-over panel is showing, so a poll can refresh it in
  // place instead of closing it under the reader.
  let guestPanelCtx = null;
  let bkFilter = "all";
  let bkSearchQuery = "";
  // Booking id whose "Resend confirmation" edit panel is currently open, or
  // null. onBookingsChange() (fired by the 6s guest-bookings poll) skips its
  // destructive full re-render while this is set — otherwise a poll tick
  // mid-edit replaces the whole detail pane's innerHTML and the open editor
  // (and anything the staff member had already typed into it) vanishes out
  // from under them a few seconds after they open it.
  let bkResendEditingId = null;
  // Booking id whose "Sent Emails" history panel is currently open, or null.
  // Same poll-clobber problem as bkResendEditingId above: the 6s guest-
  // bookings poll used to always rebuild the whole detail pane, which reset
  // the panel back to hidden and the email log's own "already loaded" flag
  // back to false a few seconds after staff opened it.
  let bkEmailLogOpenId = null;
  let bkMultiSelect = false;
  let selectedBookingIds = new Set();
  let bkSectionPrefs = loadBkSectionPrefs(); // { labels:{older2,older6}, collapsed:{older2,older6} }
  let edLang = null;     // which language the Site Editor is editing
  let edSearchQ = "";    // current Site Editor search filter
  let edTab = "text";    // active Site Editor tab
  let selectedThread = null;
  // Live-chat thread bulk-select state
  let chatMultiSelect = false;
  // Live-chat thread filter: all | guests | visitors
  let chatFilter = "all";
  let selectedChatIds = new Set();
  let seenReq = null;
  let seenBookings = null;
  let lastChatUnread = 0;
  let lastSeenChatMsg = {};  // { [guestId]: lastMsg } — tracks what we've already notified/seen per thread

  /* ---- Guest requests: unread state ---------------------------------------
     A guest asking for towels is a job someone has to physically do, so it
     can't rely on whoever happens to be looking at the right panel at the
     right second. A request stays UNREAD — blinking "!" on the nav item and
     on its own card, plus a chime — until a person actually looks at the
     Guest Requests panel. The acknowledged ids live in localStorage, so
     reloading the page (or the browser restarting overnight) does NOT quietly
     clear the alert the way the in-memory seenReq set does. */
  const REQ_ACK_KEY = "jpark.requestsAcked";
  const REQ_ACK_MAX = 400;          // keep the stored list from growing forever
  const REQ_READ_DWELL_MS = 4000;   // panel must stay open this long to count as "read"
  const REQ_RECHIME_MS = 120000;    // nag again every 2 min while something is unread
  let reqAcked = loadReqAcked();
  let reqReadTimer = null;
  let reqBlinkTimer = null;
  let lastReqChimeAt = 0;

  function loadReqAcked() {
    try {
      const raw = JSON.parse(localStorage.getItem(REQ_ACK_KEY) || "[]");
      return new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch (_) { return new Set(); }
  }
  function saveReqAcked() {
    try {
      let ids = Array.from(reqAcked);
      if (ids.length > REQ_ACK_MAX) ids = ids.slice(ids.length - REQ_ACK_MAX);
      reqAcked = new Set(ids);
      localStorage.setItem(REQ_ACK_KEY, JSON.stringify(ids));
    } catch (_) { /* storage full / private mode — degrade to in-memory only */ }
  }
  // Open work the front desk hasn't looked at yet. A request marked as a test
  // filing is deliberately not open work — otherwise every trial tap the owner
  // makes while checking the portal keeps blinking and chiming at the desk.
  function unreadRequests() {
    return S.list("requests").filter(function (r) {
      return isLiveRequest(r) && r.status === "pending" && !reqAcked.has(String(r.id));
    });
  }

  // Messages state
  let msgView = "inbox";
  let msgDetailId = null;
  let msgDetailKind = "message"; // "message" | "booking"
  let msgPrevView = "inbox";
  let msgToRecipients = [];
  let msgToAllSelected = false;
  let msgMultiSelect = false;
  let selectedMsgIds = new Set();
  let trashPurgedThisSession = false;
  let dragSrc = null; // { det, s, idx } — active drag tile for the photo reorder

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (_) { return null; }
  }
  function setSession(s) {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
    // notify other tabs (storage event doesn't fire in same tab)
    session = s;
  }
  function isAdmin() { return session && session.role === "admin"; }

  /* ====================  AUTH  ==================== */
  function validSession(s) {
    if (!s) return null;
    const u = S.list("staff").find((x) => x.id === s.id);
    return u && u.active ? s : null;
  }

  /* Server-only login. The backend verifies a bcrypt hash and issues a signed
     JWT; nothing else may admit anyone.

     There used to be a loginLocal() fallback that checked the typed password
     against the localStorage store whenever the API was unreachable, returned
     404, or returned any 5xx. That store is seeded by assets/js/store.js with
     admin/admin123 and staff/staff123 — both readable in the page source of
     the public site. So during any backend outage (Render cold-start failure,
     the Neon suspension of 2026-07-13, or simply a browser put into offline
     mode) anyone who opened /staff.html could sign in as admin with a password
     printed in our own JavaScript. Offline the console has no real data to
     show anyway, so the fallback bought nothing and cost the front door. */
  async function login(username, password) {
    const API = window.JPark && window.JPark.api;
    if (!API) return { error: t("staff.login.offline") };
    const res = await API.post("/api/auth/login", { username, password });
    if (!res.error) {
      // Backend issued a proper JWT — store it and build user from the payload.
      try { localStorage.setItem("jpark.staff.token", res.token); } catch (_) {}
      if (res.must_change_password) {
        return { mustChange: true, staffId: res.user.id, user: res.user };
      }
      return { user: res.user };
    }
    // The server could not be reached (or could not answer): say so plainly
    // rather than letting anyone in.
    if (res.offline || res.status === 404 || res.status >= 500) {
      return { error: t("staff.login.offline") };
    }
    return { error: res.error || t("staff.login.error") };
  }

  /* ---- login sub-views (sign in / new staff / forgot password|username) ---- */
  function showAuthView(name) {
    document.querySelectorAll(".auth-card").forEach((c) =>
      c.classList.toggle("show", c.dataset.auth === name));
    document.querySelectorAll(".form-error").forEach((p) => { p.textContent = ""; });
    if (name !== "newStaff") { nsUserId = null; nsCurrentPass = ""; }
  }
  function nsShowStep(n) {
    const form = document.getElementById("newStaffForm");
    if (!form) return;
    form.querySelectorAll(".auth-step").forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
  }
  // Drop a logged-in user into the first-time "set a new password" step.
  // `currentPass` is the temporary password they just signed in with; the
  // backend requires it to authorise the replacement (see nsCurrentPass).
  function startPasswordSetup(staffId, currentPass) {
    nsUserId = staffId;
    nsCurrentPass = currentPass || "";
    showAuthView("newStaff");
    nsShowStep(2);
    const n1 = document.getElementById("nsNew1"), n2 = document.getElementById("nsNew2");
    if (n1) n1.value = ""; if (n2) n2.value = "";
  }
  function completeLogin(userObj) {
    setSession(userObj);
    // If the token was already stored by the server-login path, use it.
    // Otherwise mint a client-side token (offline / legacy / expired flow).
    if (J.authToken && !J.authToken.isValid()) {
      Promise.resolve(J.authToken.mint(userObj)).catch(function () {}).then(showDash);
    } else {
      showDash();
    }
  }

  /* ── API polling: pull live data from the backend every N seconds ─────── */
  let _pollTimer = null;
  // Conditional-fetch state for the bookings list: `_bookingsFp` is the last
  // version fingerprint the server gave us; we send it back so an unchanged
  // list costs almost nothing (see backend/routes/guestBookings.js). Every
  // RECONCILE_EVERY polls we drop it to force one full refresh, as a cheap
  // self-heal against any missed change.
  let _bookingsFp = "";
  let _bookingsPollCount = 0;
  // Same conditional-fetch state for internal messages (see _pollMessages).
  let _messagesFp = "";
  let _messagesPollCount = 0;
  const RECONCILE_EVERY = 30; // ~5 min at the 10s interval

  function _pollAll() {
    _pollRequests(); _pollChats(); _pollGuestBookings(); _pollMessages();
    _syncStaffList();
    if (isAdmin()) _pollSessions();
  }

  function startApiPolling() {
    stopApiPolling();
    _pollAll();
    // Poll on an interval, but SKIP ticks while the tab is hidden. A front-desk
    // browser is routinely left open (and backgrounded behind the PMS) for whole
    // shifts, and every tick fans out to several full-list endpoints. Polling a
    // hidden tab spends database network transfer no one is looking at — that,
    // multiplied across every open tab 24/7, is what ran the Neon free-tier
    // transfer cap up until the whole API went down (2026-07-13). We refresh
    // immediately on visibilitychange below, so returning to the tab is instant.
    _pollTimer = setInterval(function () {
      if (document.visibilityState === "hidden") return;
      _pollAll();
    }, 10000);
    // Waiting times tick on their own clock, not the poll's: a card that has
    // been open 9 minutes must turn amber at 10 even if nothing changed
    // server-side. Only the age chips are touched (refreshRequestAges), never
    // the whole board — re-rendering would fight the search box for focus.
    if (!reqAgeTimer) reqAgeTimer = setInterval(refreshRequestAges, 30000);
  }
  function stopApiPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    if (reqAgeTimer) { clearInterval(reqAgeTimer); reqAgeTimer = null; }
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (_pollTimer) _pollAll();
    // Coming back to a backgrounded console only counts as reading the
    // requests once the panel is actually on screen again.
    if (panel === "requests") markRequestsRead();
  });

  // One row of the Guest Requests board, from either source table. Reads both
  // the camelCase the API sends today and the raw snake_case an older server
  // would return, so a half-rolled-out deploy still renders. `msgSummary`
  // (kind:id -> {count, unreadForStaff}) comes from /api/chat/request-summary
  // — see _pollRequests — so a card can show "💬 2" without every card
  // fetching its own thread.
  function _reqRow(r, idPrefix, msgSummary) {
    const reqKind = idPrefix === "ord-" ? "order" : "service";
    const summary = msgSummary ? msgSummary[reqKind + ":" + r.id] : null;
    return {
      id: (idPrefix || "") + String(r.id),
      reqKind: reqKind, reqId: r.id,
      msgCount: summary ? summary.count : 0,
      msgUnread: summary ? summary.unreadForStaff : 0,
      kind: r.kind || "service",
      category: r.category || r.type || r.kind,
      titleKey: r.titleKey || r.title_key,
      title: r.title,
      room: r.room || r.roomNumber || r.room_number,
      guestName: r.guestName || r.guest_name,
      guestId: r.guestId || r.guest_id,
      items: r.items || [],
      deliverAt: r.deliverAt || r.deliver_at,
      note: r.note || r.notes,
      total: r.total,
      lang: r.lang || "en",
      // Set server-side from the booking ref (lib/guestLookup.js verifyGuest)
      // — an OTA or walk-in guest comes through as false, not missing.
      guestVerified: r.guestVerified === true || r.guest_verified === true,
      bookingRef: r.bookingRef || r.booking_ref || null,
      building: r.building != null ? Number(r.building) : null,
      roomType: r.roomType || r.room_type || null,
      // Board state: who's handling it, the desk's own note, whether it was
      // filed while testing, and who vouched for an unmatched guest.
      isTest: r.isTest === true || r.is_test === true,
      assignedStaffId: r.assignedStaffId || r.assigned_staff_id || null,
      assignedStaffName: r.assignedStaffName || r.assigned_staff_name || null,
      staffNote: r.staffNote || r.staff_note || null,
      confirmedBy: r.confirmedBy || r.confirmed_by || null,
      status: r.status === "in_progress" ? "progress"
            : r.status === "preparing"   ? "progress"
            : r.status === "delivered"   ? "done"
            : (r.status || "pending"),
      createdAt: r.createdAt || (r.created_at ? new Date(r.created_at).getTime() : 0),
    };
  }

  // In-room dining orders live in their own table and were never polled here,
  // so a guest could place an order, see it in their tracker, and no one at
  // the front desk would ever know. Both sources feed the one board; order
  // ids are prefixed "ord-" so status updates route back to the right table
  // (see updateReqStatus).
  async function _pollRequests() {
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    const [srData, ordData, summaryData] = await Promise.all([
      API.get("/api/service-requests"),
      API.get("/api/orders"),
      API.get("/api/chat/request-summary"),
    ]);
    // A failed fetch must not be mistaken for "no requests" and wipe the board.
    if (!Array.isArray(srData)) {
      if (srData && !srData.offline) console.error("[staff] service requests poll failed:", srData.error);
      return;
    }
    const msgSummary = {};
    if (Array.isArray(summaryData)) {
      summaryData.forEach(function (s) { msgSummary[s.requestKind + ":" + s.requestId] = s; });
    }
    const reqs = srData.map(function (r) { return _reqRow(r, "", msgSummary); });
    if (Array.isArray(ordData)) {
      ordData.forEach(function (o) { reqs.push(_reqRow(o, "ord-", msgSummary)); });
    } else if (ordData && !ordData.offline) {
      console.error("[staff] orders poll failed:", ordData.error);
    }
    reqs.sort(function (a, b) { return b.createdAt - a.createdAt; });
    S.write("requests", reqs);
  }

  async function _pollChats() {
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    const data = await API.get("/api/chat/all");
    if (!Array.isArray(data)) return;
    const local = S.list("chats");
    let dirty = false;
    let reloadSelected = false;
    data.forEach(function (remote) {
      const idx = local.findIndex(function (c) { return c.id === remote.id; });
      if (idx < 0) {
        local.push({
          id: remote.id, guestName: remote.guestName, room: remote.room,
          lang: remote.lang, escalated: remote.escalated,
          assignedStaffId: remote.assignedStaffId,
          assignedStaffName: remote.assignedStaffName,
          guestKind: remote.guestKind, guestVerified: remote.guestVerified,
          bookingId: remote.bookingId, bookingRef: remote.bookingRef,
          confirmedBy: remote.confirmedBy,
          unreadForStaff: remote.unreadForStaff, lastMsg: remote.lastMsg,
          lastAt: remote.lastAt, messages: [],
        });
        dirty = true;
      } else if (local[idx].unreadForStaff !== remote.unreadForStaff
              || local[idx].lastMsg !== remote.lastMsg
              || local[idx].assignedStaffId !== remote.assignedStaffId
              // Identity changes on its own (a guest signs in mid-chat, another
              // console confirms a guest) with no new message to notice it by.
              || local[idx].guestKind !== remote.guestKind
              || local[idx].guestVerified !== remote.guestVerified
              || local[idx].guestName !== remote.guestName
              || local[idx].room !== remote.room) {
        if (remote.id === selectedThread && local[idx].lastMsg !== remote.lastMsg) {
          reloadSelected = true;
        }
        local[idx] = Object.assign({}, local[idx], {
          unreadForStaff: remote.unreadForStaff, lastMsg: remote.lastMsg,
          lastAt: remote.lastAt, escalated: remote.escalated,
          assignedStaffId: remote.assignedStaffId,
          assignedStaffName: remote.assignedStaffName,
          guestName: remote.guestName, room: remote.room,
          guestKind: remote.guestKind, guestVerified: remote.guestVerified,
          bookingId: remote.bookingId, bookingRef: remote.bookingRef,
          confirmedBy: remote.confirmedBy,
        });
        // If the staff member is looking at this exact thread right now, a poll
        // that lands mid-conversation must not re-light its badge — stamp it
        // read and keep the local count at 0.
        if (panel === "chat" && remote.id === selectedThread && remote.unreadForStaff) {
          local[idx].unreadForStaff = 0;
          stampChatRead(remote.id);
        }
        dirty = true;
      }
    });
    if (dirty) S.write("chats", local);
    if (reloadSelected) _loadThreadMessages(selectedThread);
  }

  async function _pollGuestBookings() {
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    // Periodically drop the fingerprint to force a full reconciliation.
    if (_bookingsPollCount++ % RECONCILE_EVERY === 0) _bookingsFp = "";
    const data = await API.get("/api/guest-bookings?v=" + encodeURIComponent(_bookingsFp));
    if (!data || data.error) {
      // A real fetch failure (401/500/offline) used to look identical to "no
      // bookings yet" in the UI, with nothing in the console to explain it.
      if (!data || !data.offline) console.error("[staff] guest bookings poll failed:", data && data.error);
      return;
    }
    if (data.unchanged) { if (data.v) _bookingsFp = data.v; return; } // nothing changed since last poll
    // Accept both the conditional envelope {v,bookings} and, during a rollout
    // window, a legacy bare array from an older server.
    let list;
    if (Array.isArray(data)) list = data;
    else if (Array.isArray(data.bookings)) { list = data.bookings; _bookingsFp = data.v || ""; }
    else return; // unexpected shape — keep whatever we already have
    S.write("guestBookings", list);
  }

  // Admin-only (the endpoint 403s for non-admins, see startApiPolling()'s
  // isAdmin() guard). Only re-renders the Account Logs list rows when that
  // panel is actually open, to avoid DOM churn every 6s while an admin is
  // looking at a different panel — mirrors how _pollChats() only reloads
  // the open thread's messages when that specific thread changed.
  async function _pollSessions() {
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    const data = await API.get("/api/sessions");
    if (!Array.isArray(data)) return;
    S.write("acctSessions", data);
    if (panel === "accountLogs") renderSessionRows();
  }

  /* ── Internal messages: pull every visible message from the server and
     merge them into the local cache. Per-user UI state (starred, trashedBy,
     trashedAt) is local-only and preserved across syncs; canonical fields
     (subject, body, readBy, reportedBy, recipients) come from the server.
     Server rows live under id = "srv_<serial>"; locally-only rows (seed
     welcome, offline sends) keep their original ids so we don't drop them. */
  function _mapServerMsg(r) {
    return {
      id: "srv_" + r.id,
      fromId: r.from_id,
      fromName: r.from_name,
      fromRole: r.from_role,
      subject: r.subject,
      body: r.body,
      lang: r.lang,
      to: r.to_all ? "all" : (r.to_ids || []),
      toNames: r.to_all ? t("staff.compose.everyone") : (r.to_names || []),
      readBy: r.read_by || [],
      reportedBy: r.reported_by || [],
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    };
  }

  async function _pollMessages() {
    if (!session) return;
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    // Conditional fetch: send back the last fingerprint so an unchanged inbox
    // costs a few bytes instead of every memo, and drop it periodically to
    // force one full reconcile. Mirrors _pollGuestBookings.
    if (_messagesPollCount++ % RECONCILE_EVERY === 0) _messagesFp = "";
    const res = await API.get("/api/messages?v=" + encodeURIComponent(_messagesFp));
    if (!res || res.error) {
      if (!res || !res.offline) console.error("[staff] messages poll failed:", res && res.error);
      return;
    }
    if (res.unchanged) { if (res.v) _messagesFp = res.v; return; }
    // Accept both the conditional envelope and, during a rollout window, a
    // legacy bare array from an older server (which is never truncated).
    let data, truncated;
    if (Array.isArray(res)) { data = res; truncated = false; }
    else if (Array.isArray(res.messages)) {
      data = res.messages;
      truncated = !!res.truncated;
      _messagesFp = res.v || "";
    } else return; // unexpected shape — keep what we already have
    const local = S.list("messages");
    const personal = new Map();
    local.forEach(function (m) {
      if (typeof m.id === "string" && m.id.indexOf("srv_") === 0) {
        personal.set(m.id, {
          starred: m.starred,
          trashedBy: m.trashedBy,
          trashedAt: m.trashedAt,
        });
      }
    });
    // Server messages the user perma-deleted from their own view stay hidden
    // forever (server doesn't know — delete-forever is a per-user UI action).
    const hidden = new Set(S.list("messages_deleted"));
    const remote = data
      .map(_mapServerMsg)
      .filter(function (m) { return !hidden.has(m.id); })
      .map(function (m) {
        const p = personal.get(m.id);
        return p ? Object.assign({}, m, {
          starred: p.starred,
          trashedBy: p.trashedBy,
          trashedAt: p.trashedAt,
        }) : m;
      });
    const localOnly = local.filter(function (m) {
      return typeof m.id !== "string" || m.id.indexOf("srv_") !== 0;
    });
    // Server rows that have aged out of the newest-N window the API carries
    // (see MESSAGES_LIST_LIMIT in backend/routes/messages.js). They are kept
    // from the local cache so the inbox doesn't silently shrink as the hotel
    // accumulates history. Only rows OLDER than the oldest one the server just
    // sent qualify, and only when the server says its page was truncated — so
    // when the list is complete it stays canonical and an admin's delete still
    // removes the message here.
    let aged = [];
    if (truncated && remote.length) {
      let oldest = Infinity;
      remote.forEach(function (m) { if (m.createdAt < oldest) oldest = m.createdAt; });
      const remoteIds = new Set(remote.map(function (m) { return m.id; }));
      aged = local.filter(function (m) {
        return typeof m.id === "string" && m.id.indexOf("srv_") === 0
          && !remoteIds.has(m.id) && !hidden.has(m.id) && m.createdAt < oldest;
      });
    }
    const merged = remote.concat(aged, localOnly);
    if (JSON.stringify(merged) !== JSON.stringify(local)) {
      S.write("messages", merged);
    }
  }

  /* Track perma-deleted server ids so the next poll doesn't bring them back. */
  function permaForgetMsg(id) {
    if (typeof id !== "string" || id.indexOf("srv_") !== 0) return;
    const arr = S.list("messages_deleted");
    if (arr.indexOf(id) >= 0) return;
    arr.push(id);
    S.write("messages_deleted", arr);
  }

  /* Lazy-load peer avatars. We only fetch when the local cached version
     doesn't match the directory's `avatar_updated_at`, so the staff list
     stays small and bandwidth is bounded.

     Fetches are also capped per pass. The loop is sequential, so on a
     100-account property the first sign-in of a new browser would otherwise
     issue up to a hundred back-to-back photo requests before the console
     settled — each one a separate round trip carrying a few hundred KB.
     Ten per pass catches up over the following polls instead, and the
     current user goes first so your own photo is never the one still
     waiting behind ninety-nine colleagues. */
  const AVATAR_FETCHES_PER_PASS = 10;

  async function _syncAvatars(staff) {
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    // Drop cached photos for people who have left the directory, so the cache
    // tracks the team's size rather than growing with everyone who ever worked here.
    _pruneAvatarCache(staff);

    const stale = staff.filter((u) => {
      const remoteV = u.avatar_updated_at || null;
      if (!remoteV) return false;                              // no server-side photo set
      return S.read("avatar_v_" + u.id, null) !== remoteV;     // not already in sync
    });
    const selfId = session ? session.id : null;
    stale.sort((a, b) => (a.id === selfId ? -1 : 0) - (b.id === selfId ? -1 : 0));

    let fetched = 0;
    for (let i = 0; i < stale.length && fetched < AVATAR_FETCHES_PER_PASS; i++) {
      const u = stale[i];
      const remoteV = u.avatar_updated_at || null;
      try {
        const res = await API.get("/api/auth/avatar/" + encodeURIComponent(u.id));
        fetched++;
        if (res && !res.error) {
          if (res.avatar) S.write("avatar_" + u.id, res.avatar);
          else { try { localStorage.removeItem("jpark.db.avatar_" + u.id); } catch (_) {} }
          // Stamped even if the photo itself could not be cached (storage
          // full — see S.write): the version is what stops us re-requesting
          // the same unchanged photo on every single poll.
          S.write("avatar_v_" + u.id, remoteV);
        }
      } catch (_) { /* network blip — retry next tick */ }
    }
    // Re-render UI surfaces that show avatars.
    if (session) renderAvatarInSidebar();
    if (panel === "messages") renderMessages();
  }

  function _pruneAvatarCache(staff) {
    const live = new Set(staff.map((u) => u.id));
    if (session) live.add(session.id);
    try {
      Object.keys(localStorage).forEach(function (k) {
        const m = /^jpark\.db\.avatar_(?:v_)?(.+)$/.exec(k);
        if (m && !live.has(m[1])) localStorage.removeItem(k);
      });
    } catch (_) {}
  }

  /* Load full message list for a chat thread from the API. */
  async function _loadThreadMessages(guestId) {
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    const res = await API.get("/api/chat?guestId=" + encodeURIComponent(guestId));
    if (res.error) return;
    const all = S.list("chats");
    const i = all.findIndex(function (c) { return c.id === guestId; });
    if (i < 0) return;
    all[i] = Object.assign({}, all[i], {
      messages: (res.messages || []).map(function (m) {
        return { id: m.id, from: m.from, text: m.text, staffName: m.fromName, lang: m.lang, ts: m.ts, pinned: !!m.pinned };
      }),
      escalated: res.escalated,
      assignedStaffId: res.assignedStaffId,
      assignedStaffName: res.assignedStaffName,
    });
    S.write("chats", all);
  }

  function showLogin() {
    document.getElementById("loginView").style.display = "grid";
    document.getElementById("dashView").classList.remove("show");
    nsShowStep(1);
    showAuthView("signin");
  }

  // Shared by the manual "Sign out" button and a genuinely dead session
  // (revoked, banned, or past its 7-day absolute cap) detected by
  // api.js's failed POST /api/auth/refresh — see the "jpark:force-logout"
  // window event listener wired below, next to the "Sign out" button's
  // own click handler. This is the fix for the old bug where an expired
  // session just silently stopped syncing forever: now it drops the user
  // back to a real login screen instead.
  function forceLogout() {
    stopApiPolling();
    setSession(null);
    if (J.authToken) J.authToken.clear();
    showLogin();
  }

  function showDash() {
    document.getElementById("loginView").style.display = "none";
    document.getElementById("dashView").classList.add("show");

    document.querySelectorAll(".admin-only").forEach((el) => { el.style.display = isAdmin() ? "" : "none"; });
    // Front-Desk-only surfaces (currently: the Team Status nav item) — admins
    // never see them.
    document.querySelectorAll(".staff-only").forEach((el) => { el.style.display = isAdmin() ? "none" : ""; });
    // An administrator reads the shift board and edits the accounts behind it
    // in the same breath, so for them the board moves out of its own panel and
    // into the top of Staff. One mount element, relocated — mounting a second
    // board would give the page two of everything, each polling the roster.
    if (isAdmin()) {
      const board = document.getElementById("empBoardMount");
      const slot = document.getElementById("teamRosterSlot");
      if (board && slot && board.parentElement !== slot) slot.appendChild(board);
    }
    document.getElementById("dsUserName").textContent = session.name;
    document.getElementById("dsUserRole").textContent = t(isAdmin() ? "staff.role.admin" : "staff.role.staff");
    document.getElementById("dsRoleLabel").textContent = t(isAdmin() ? "staff.role.admin" : "staff.role.staff");

    seenReq = new Set(S.list("requests").map((r) => r.id));
    seenBookings = new Set(S.list("guestBookings").map((b) => b.id));
    lastChatUnread = totalChatUnread();
    lastSeenChatMsg = {};
    myAssignedChats().forEach(function (c) { lastSeenChatMsg[c.id] = c.lastMsg; });

    renderAvatarInSidebar();
    selectPanel(panel);
    updateRequestAlert();
    updateBadges();
    requestNotifyPermission();
    startApiPolling();
    // Admins edit the public site from here; make sure this browser is looking
    // at what is actually published before it can overwrite it.
    if (isAdmin()) syncSiteContent();
  }

  /* ====================  PANELS  ==================== */
  function selectPanel(name) {
    if ((name === "site" || name === "team" || name === "maintenance" || name === "accountLogs") && !isAdmin()) name = "requests";
    // Admins have no Team Status panel of their own — the board lives in Staff.
    if (name === "roster" && isAdmin()) name = "team";
    if (name === "company") name = "messages"; // redirect legacy hash
    // The guest panel belongs to whichever board opened it; leaving that board
    // (including via its own "open this guest's chat" button) closes it.
    if (panel !== name) closeGuestPanel();
    panel = name;
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.panel === name));
    document.querySelectorAll(".dash-panel").forEach((p) => p.classList.toggle("show", p.id === "panel-" + name));
    renderPanel();
    // Opening Guest Requests starts the "has anyone actually looked at this?"
    // dwell timer; leaving it cancels any timer still running.
    if (name === "requests") markRequestsRead();
    else if (reqReadTimer) { clearTimeout(reqReadTimer); reqReadTimer = null; }
    // Opening the messages panel triggers a fresh pull so the user sees any
    // server-side activity that landed since the last 6s poll tick.
    if (name === "messages") _pollMessages();
  }

  function renderPanel() {
    if (panel === "requests") renderRequests();
    else if (panel === "chat") renderChat();
    else if (panel === "messages") renderMessages();
    else if (panel === "roster") renderRoster();
    else if (panel === "site") renderSite();
    // For an admin the shift board sits at the top of this panel, so it has to
    // be (re)mounted with it — nothing else opens it for them.
    else if (panel === "team") { if (isAdmin()) renderRoster(); renderTeam(); }
    else if (panel === "maintenance") { renderMaintenance(); renderPrepay(); }
    else if (panel === "accountLogs") renderAccountLogs();
  }

  /* ---- maintenance mode (admin) ---- */
  let maintToggleWired = false;
  async function renderMaintenance() {
    if (!isAdmin()) return;
    const statusEl = document.getElementById("maintStatus");
    const toggleEl = document.getElementById("maintToggle");
    if (!statusEl || !toggleEl) return;

    function paintStatus(enabled) {
      statusEl.textContent = t(enabled ? "staff.maint.status.on" : "staff.maint.status.off");
      toggleEl.checked = enabled;
    }

    const res = await J.api.get("/api/maintenance");
    paintStatus(!J.api.isOffline(res) && res.enabled);

    if (!maintToggleWired) {
      maintToggleWired = true;
      toggleEl.addEventListener("change", async (e) => {
        const enabled = e.target.checked;
        const confirmMsg = t(enabled ? "staff.maint.confirmOn" : "staff.maint.confirmOff");
        if (!confirm(confirmMsg)) { e.target.checked = !enabled; return; }
        toggleEl.disabled = true;
        const res2 = await J.api.put("/api/maintenance", { enabled });
        toggleEl.disabled = false;
        if (J.api.isOffline(res2) || res2.error) {
          U.toast(t("staff.maint.error"), "error");
          e.target.checked = !enabled;
          return;
        }
        paintStatus(res2.enabled);
        U.toast(t("staff.maint.saved"), "success");
      });
    }
  }

  /* ---- require prepayment for busy/holiday periods (admin) ----
     Same shape as maintenance mode, against /api/booking-policy. Also surfaces
     whether it can actually take effect: prepay only bites while online payment
     (the payment gateway) is live — until then the switch saves but has no guest-facing effect,
     so we show a note rather than pretend it's working. */
  let prepayToggleWired = false;
  async function renderPrepay() {
    if (!isAdmin()) return;
    const statusEl = document.getElementById("prepayStatus");
    const toggleEl = document.getElementById("prepayToggle");
    const warnEl = document.getElementById("prepayOmiseWarn");
    if (!statusEl || !toggleEl) return;

    function paintStatus(enabled) {
      statusEl.textContent = t(enabled ? "staff.prepay.status.on" : "staff.prepay.status.off");
      toggleEl.checked = enabled;
    }

    const res = await J.api.get("/api/booking-policy");
    paintStatus(!J.api.isOffline(res) && !!res.requirePrepayment);

    if (warnEl) {
      const cfg = await J.api.get("/api/v1/payments/config");
      const paymentLive = !J.api.isOffline(cfg) && !!cfg.paymentEnabled;
      warnEl.hidden = paymentLive;
    }

    if (!prepayToggleWired) {
      prepayToggleWired = true;
      toggleEl.addEventListener("change", async (e) => {
        const enabled = e.target.checked;
        const confirmMsg = t(enabled ? "staff.prepay.confirmOn" : "staff.prepay.confirmOff");
        if (!confirm(confirmMsg)) { e.target.checked = !enabled; return; }
        toggleEl.disabled = true;
        const res2 = await J.api.put("/api/booking-policy", { requirePrepayment: enabled });
        toggleEl.disabled = false;
        if (J.api.isOffline(res2) || res2.error) {
          U.toast(t("staff.prepay.error"), "error");
          e.target.checked = !enabled;
          return;
        }
        paintStatus(res2.requirePrepayment);
        U.toast(t("staff.prepay.saved"), "success");
      });
    }
  }

  /* ====================  ACCOUNT LOGS  ====================
     Admin-only session audit trail: every staff login (IP, device,
     location, live "online" status) plus banned IPs. Backed by
     backend/routes/sessions.js. renderAccountLogs() does the initial
     fetch-and-render when the panel is opened; _pollSessions() (see
     startApiPolling()) keeps the sessions half live on the existing 6s
     tick while this panel stays open. */
  function renderAccountLogs() {
    if (!isAdmin()) return;
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    API.get("/api/sessions").then((data) => {
      if (Array.isArray(data)) { S.write("acctSessions", data); renderSessionRows(); }
    });
    API.get("/api/sessions/banned-ips").then((data) => {
      if (Array.isArray(data)) { S.write("acctBanned", data); renderBannedRows(); }
    });
  }

  function acctLocationText(s) {
    if (s.city && s.country) return s.city + ", " + s.country;
    if (s.country) return s.country;
    return t("staff.acctLogs.unknownLocation");
  }

  // One session's row — shared by the flat list and each grouped IP's
  // expanded detail list below.
  function buildSessionRow(s) {
    const row = document.createElement("div");
    row.className = "acct-row" + (s.revokedAt ? " acct-row-revoked" : "");

    const dotClass = "session-dot" + (s.online ? " live" : "");
    const statusLabel = s.online ? t("staff.acctLogs.online") : t("staff.acctLogs.offline");
    const youBadge = s.isCurrent
      ? '<span class="bk-row-pill">' + esc(t("staff.acctLogs.youBadge")) + "</span>" : "";
    const revokedNote = s.revokedAt
      ? '<div class="acct-row-note">' +
          esc(t("staff.acctLogs.revokedBy").replace("{name}", s.revokedByName || t("staff.acctLogs.systemRevoked"))) +
        "</div>"
      : "";

    row.innerHTML =
      '<div class="acct-row-main">' +
        '<div class="acct-row-head">' +
          "<b>" + esc(s.employeeName) + "</b> — " + esc(s.deviceSummary || "—") + youBadge +
        "</div>" +
        '<div class="acct-row-meta">' +
          esc(s.ip) + " · " + esc(acctLocationText(s)) + " · " +
          esc(t("staff.acctLogs.colSignedIn")) + " " + esc(formatMsgTime(s.createdAt)) + " · " +
          esc(t("staff.acctLogs.colLastActive")) + " " + esc(formatMsgTime(s.lastSeenAt)) +
        "</div>" +
        revokedNote +
      "</div>" +
      '<div class="acct-row-status"><i class="' + dotClass + '"></i>' + esc(statusLabel) + "</div>" +
      '<div class="rr-actions"></div>';

    const actions = row.querySelector(".rr-actions");
    if (!s.revokedAt) {
      const signOutBtn = document.createElement("button");
      signOutBtn.textContent = t("staff.acctLogs.signOut");
      signOutBtn.addEventListener("click", () => {
        if (!confirm(t("staff.acctLogs.confirmSignOut"))) return;
        API_post("/api/sessions/" + encodeURIComponent(s.jti) + "/revoke", {}).then(() => renderAccountLogs());
      });
      actions.appendChild(signOutBtn);

      const banBtn = document.createElement("button");
      banBtn.className = "rr-del";
      banBtn.textContent = t("staff.acctLogs.banIp");
      banBtn.addEventListener("click", () => {
        if (!confirm(t("staff.acctLogs.confirmBanIp"))) return;
        API_post("/api/sessions/ban", { ip: s.ip }).then(() => renderAccountLogs());
      });
      actions.appendChild(banBtn);
    }

    return row;
  }

  // Repeated sign-ins from the same IP (a session renewing past the sliding
  // window, a second tab, etc.) used to each get their own full row, making
  // one device look like several devices at a glance. Same-IP sessions now
  // collapse into a single summary row, expandable to the individual
  // sign-ins — "Ban IP" already acts at IP granularity, so this matches
  // what the actions actually operate on.
  function buildSessionGroup(ip, sessions) {
    sessions = sessions.slice().sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    const latest = sessions[0];
    const active = sessions.filter((s) => !s.revokedAt);
    const anyOnline = active.some((s) => s.online);

    const details = document.createElement("details");
    details.className = "acct-group" + (active.length ? "" : " acct-row-revoked");

    const summary = document.createElement("summary");
    const dotClass = "session-dot" + (anyOnline ? " live" : "");
    const statusLabel = anyOnline ? t("staff.acctLogs.online") : t("staff.acctLogs.offline");
    const youBadge = sessions.some((s) => s.isCurrent)
      ? '<span class="bk-row-pill">' + esc(t("staff.acctLogs.youBadge")) + "</span>" : "";
    const oldestCreated = Math.min.apply(null, sessions.map((s) => s.createdAt));
    summary.innerHTML =
      '<div class="acct-row-main">' +
        '<div class="acct-row-head">' +
          "<b>" + esc(latest.employeeName) + "</b> — " + esc(latest.deviceSummary || "—") + youBadge +
          ' <span class="bk-row-pill">' + esc(t("staff.acctLogs.sessionCount").replace("{n}", sessions.length)) + "</span>" +
        "</div>" +
        '<div class="acct-row-meta">' +
          esc(ip) + " · " + esc(acctLocationText(latest)) + " · " +
          esc(t("staff.acctLogs.colSignedIn")) + " " + esc(formatMsgTime(oldestCreated)) + " · " +
          esc(t("staff.acctLogs.colLastActive")) + " " + esc(formatMsgTime(latest.lastSeenAt)) +
        "</div>" +
      "</div>" +
      '<div class="acct-row-status"><i class="' + dotClass + '"></i>' + esc(statusLabel) + "</div>";
    details.appendChild(summary);

    if (active.length) {
      const groupActions = document.createElement("div");
      groupActions.className = "acct-group-actions";

      const signOutAllBtn = document.createElement("button");
      signOutAllBtn.textContent = t("staff.acctLogs.signOutAll").replace("{n}", active.length);
      signOutAllBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (!confirm(t("staff.acctLogs.confirmSignOutAll").replace("{n}", active.length))) return;
        Promise.all(active.map((s) => API_post("/api/sessions/" + encodeURIComponent(s.jti) + "/revoke", {})))
          .then(() => renderAccountLogs());
      });
      groupActions.appendChild(signOutAllBtn);

      const banBtn = document.createElement("button");
      banBtn.className = "rr-del";
      banBtn.textContent = t("staff.acctLogs.banIp");
      banBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (!confirm(t("staff.acctLogs.confirmBanIp"))) return;
        API_post("/api/sessions/ban", { ip }).then(() => renderAccountLogs());
      });
      groupActions.appendChild(banBtn);

      details.appendChild(groupActions);
    }

    const list = document.createElement("div");
    list.className = "acct-group-list";
    sessions.forEach((s) => list.appendChild(buildSessionRow(s)));
    details.appendChild(list);

    return details;
  }

  function renderSessionRows() {
    const area = document.getElementById("acctSessionsList");
    if (!area) return;
    const sessions = S.list("acctSessions");
    if (!sessions.length) {
      area.innerHTML = '<p class="track-empty">' + esc(t("staff.acctLogs.emptySessions")) + "</p>";
      return;
    }
    area.innerHTML = "";

    const byIp = new Map();
    const order = [];
    sessions.forEach((s) => {
      if (!byIp.has(s.ip)) { byIp.set(s.ip, []); order.push(s.ip); }
      byIp.get(s.ip).push(s);
    });

    order.forEach((ip) => {
      const group = byIp.get(ip);
      area.appendChild(group.length > 1 ? buildSessionGroup(ip, group) : buildSessionRow(group[0]));
    });
  }

  function renderBannedRows() {
    const area = document.getElementById("acctBannedList");
    if (!area) return;
    const banned = S.list("acctBanned");
    if (!banned.length) {
      area.innerHTML = '<p class="track-empty">' + esc(t("staff.acctLogs.emptyBanned")) + "</p>";
      return;
    }
    area.innerHTML = "";
    banned.forEach((b) => {
      const row = document.createElement("div");
      row.className = "acct-row";
      row.innerHTML =
        '<div class="acct-row-main">' +
          '<div class="acct-row-head"><b>' + esc(b.ip) + "</b></div>" +
          '<div class="acct-row-meta">' +
            esc(b.reason || t("staff.acctLogs.noReason")) + " · " +
            esc(t("staff.acctLogs.bannedByOn")
              .replace("{name}", b.bannedByName || t("staff.acctLogs.systemRevoked"))
              .replace("{date}", formatMsgTime(b.bannedAt))) +
          "</div>" +
        "</div>" +
        '<div class="rr-actions"></div>';

      const actions = row.querySelector(".rr-actions");
      const unbanBtn = document.createElement("button");
      unbanBtn.textContent = t("staff.acctLogs.unban");
      unbanBtn.addEventListener("click", () => {
        if (!confirm(t("staff.acctLogs.confirmUnban"))) return;
        API_post("/api/sessions/unban", { ip: b.ip }).then(() => renderAccountLogs());
      });
      actions.appendChild(unbanBtn);

      const reportBtn = document.createElement("button");
      reportBtn.className = "rr-del";
      reportBtn.textContent = t("staff.acctLogs.report");
      reportBtn.addEventListener("click", () => {
        window.open("https://www.abuseipdb.com/check/" + encodeURIComponent(b.ip), "_blank", "noopener");
      });
      actions.appendChild(reportBtn);

      area.appendChild(row);
    });
  }

  // Tiny helper so the click handlers above read as one line each — every
  // other admin action in this file calls window.JPark.api.post directly,
  // but that's a bit more verbose repeated 3x above for one panel.
  function API_post(path, body) {
    const API = window.JPark && window.JPark.api;
    return API ? API.post(path, body) : Promise.resolve({ error: "offline" });
  }

  /* Team Status & Shifts — modular card board (assets/js/employee-card.js).
     Visible to every signed-in user; the board itself gates edit controls on
     the admin permission carried in the bearer token. */
  function renderRoster() {
    const mountEl = document.getElementById("empBoardMount");
    if (mountEl && J.employeeCards) J.employeeCards.mount(mountEl);
  }

  /* ====================  REQUESTS  ==================== */
  function reqTitle(r) {
    if (r.kind === "order") {
      const names = (r.items || []).map((it) => it.qty + "× " + t(it.key)).join(", ");
      return t("staff.requests.order") + " — " + names;
    }
    // t() returns the key itself when it isn't in the dictionary, so a key
    // that is ever renamed or retired would print raw ("req.towels") on the
    // card for every request already filed under it. The row also carries the
    // plain-text title the guest saw, so fall back to that.
    if (r.titleKey) {
      const label = t(r.titleKey);
      if (label && label !== r.titleKey) return label;
    }
    return r.title || "";
  }

  /* Which of the four service departments a request belongs to. The categories
     are the guest portal's own (see MATRIX in assets/js/guest.js); orders come
     through as "dining". Anything unrecognised falls to the front desk, which
     is who picks up an unclassified job in practice. */
  const REQ_DEPTS = [
    { id: "housekeeping", ico: "🧺", labelKey: "matrix.cat.housekeeping" },
    { id: "maintenance",  ico: "🔧", labelKey: "matrix.cat.maintenance" },
    { id: "dining",       ico: "🍽️", labelKey: "matrix.cat.dining" },
    { id: "frontdesk",    ico: "🛎️", labelKey: "matrix.cat.frontdesk" },
  ];
  function reqDeptOf(r) {
    const c = (r && r.category) || "";
    return REQ_DEPTS.some((d) => d.id === c) ? c : "frontdesk";
  }
  function reqDeptIco(r) {
    const d = REQ_DEPTS.find((x) => x.id === reqDeptOf(r));
    return d ? d.ico : "🛎️";
  }

  /* How long a job has been waiting, and how bad that is. A guest who asked
     for towels 25 minutes ago and one who asked 25 seconds ago rendered
     identically before, so the oldest job was the easiest to miss. Only OPEN
     work ages — a completed request is a log entry, not a clock. */
  const REQ_WARN_MS = 10 * 60 * 1000;
  const REQ_LATE_MS = 20 * 60 * 1000;
  function reqAgeLevel(r) {
    if (!r || (r.status !== "pending" && r.status !== "progress")) return null;
    const ms = Date.now() - (r.createdAt || 0);
    return ms >= REQ_LATE_MS ? "late" : ms >= REQ_WARN_MS ? "warn" : "ok";
  }
  function reqElapsed(createdAt) {
    const mins = Math.max(0, Math.floor((Date.now() - (createdAt || 0)) / 60000));
    if (mins < 60) return t("staff.requests.waitMin").replace("{m}", mins);
    const h = Math.floor(mins / 60);
    return t("staff.requests.waitHour").replace("{h}", h).replace("{m}", mins % 60);
  }

  /* Real work in front of the front desk: not a test filing, not dismissed.
     Everything that counts — the nav badge, the unread "!", the chime — is
     measured on this, so marking something as a test genuinely silences it. */
  function isLiveRequest(r) {
    return !!r && !r.isTest && r.status !== "cancelled";
  }

  // Everything a search box should be able to find a card by.
  function reqSearchText(r) {
    return [
      r.room, r.guestName, r.bookingRef, r.roomType, reqTitle(r),
      r.building ? t("building.n").replace("{n}", r.building) : "",
      r.assignedStaffName, r.note, r.staffNote,
    ].filter(Boolean).join(" ").toLowerCase();
  }

  /* The rows the board is currently showing, in the order the desk works them:
     pending first and OLDEST first (longest-waiting guest served first), then
     in-progress the same way, then finished newest-first as a log. */
  function boardRequests() {
    const q = reqSearch.trim().toLowerCase();
    return S.list("requests").filter(function (r) {
      // The test board is a separate view, not an extra row on the real one.
      if (reqShowTest !== !!r.isTest) return false;
      if (reqFilter === "dismissed") {
        if (r.status !== "cancelled") return false;
      } else {
        if (r.status === "cancelled") return false;
        if (reqFilter !== "all" && r.status !== reqFilter) return false;
      }
      if (reqDept !== "all" && reqDeptOf(r) !== reqDept) return false;
      if (q && reqSearchText(r).indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      const rank = { pending: 0, progress: 1, done: 2, cancelled: 3 };
      const ra = rank[a.status] != null ? rank[a.status] : 9;
      const rb = rank[b.status] != null ? rank[b.status] : 9;
      if (ra !== rb) return ra - rb;
      return ra <= 1 ? a.createdAt - b.createdAt : b.createdAt - a.createdAt;
    });
  }

  // Counts for the status chips — same test/department/search context as the
  // board itself, so a chip never promises rows the filter won't show.
  function reqStatusCounts() {
    const q = reqSearch.trim().toLowerCase();
    const pool = S.list("requests").filter(function (r) {
      if (reqShowTest !== !!r.isTest) return false;
      if (reqDept !== "all" && reqDeptOf(r) !== reqDept) return false;
      if (q && reqSearchText(r).indexOf(q) < 0) return false;
      return true;
    });
    const counts = { all: 0, pending: 0, progress: 0, done: 0, dismissed: 0 };
    pool.forEach(function (r) {
      if (r.status === "cancelled") { counts.dismissed++; return; }
      counts.all++;
      if (counts[r.status] != null) counts[r.status]++;
    });
    return counts;
  }

  /* The toolbar is built ONCE and then only relabelled. Rebuilding it every
     render — and the board re-renders on every 10s poll — would blow away the
     search box's focus and half-typed text under the user's fingers. */
  function renderReqToolbar() {
    const wrap = document.getElementById("reqToolbar");
    if (!wrap) return;
    if (!wrap.firstChild) {
      wrap.innerHTML =
        '<div class="rt-search"><span class="rt-search-ico" aria-hidden="true">🔍</span>' +
          '<input type="search" id="reqSearch" autocomplete="off" /></div>' +
        '<button type="button" class="rt-btn" id="reqTestToggle"></button>' +
        '<button type="button" class="rt-btn" id="reqSelectToggle"></button>';
      const input = wrap.querySelector("#reqSearch");
      input.addEventListener("input", function () {
        reqSearch = input.value;
        renderRequests();
      });
      wrap.querySelector("#reqTestToggle").addEventListener("click", function () {
        reqShowTest = !reqShowTest;
        selectedReqIds.clear();
        renderRequests();
      });
      wrap.querySelector("#reqSelectToggle").addEventListener("click", function () {
        reqMultiSelect = !reqMultiSelect;
        if (!reqMultiSelect) selectedReqIds.clear();
        renderRequests();
      });
    }
    const input = wrap.querySelector("#reqSearch");
    input.placeholder = t("staff.requests.searchPh");
    input.setAttribute("aria-label", t("staff.requests.searchPh"));
    if (input.value !== reqSearch) input.value = reqSearch;

    const testBtn = wrap.querySelector("#reqTestToggle");
    testBtn.className = "rt-btn rt-test" + (reqShowTest ? " active" : "");
    testBtn.textContent = "🧪 " + t(reqShowTest ? "staff.requests.testHide" : "staff.requests.testShow");

    const selBtn = wrap.querySelector("#reqSelectToggle");
    selBtn.className = "rt-btn" + (reqMultiSelect ? " active" : "");
    selBtn.textContent = t(reqMultiSelect ? "staff.chat.cancelSelect" : "staff.chat.select");
  }

  function renderFilters() {
    const counts = reqStatusCounts();
    const wrap = document.getElementById("reqFilters");
    wrap.innerHTML = "";
    REQ_FILTERS.forEach((f) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = (f === reqFilter ? "active" : "");
      const label = f === "all" ? t("staff.requests.filterAll")
                  : f === "dismissed" ? t("staff.requests.filterDismissed")
                  : t("track.status." + f);
      b.textContent = label;
      const n = counts[f] || 0;
      if (n) {
        const chip = document.createElement("span");
        chip.className = "rf-count";
        chip.textContent = n;
        b.appendChild(chip);
      }
      b.addEventListener("click", () => { reqFilter = f; renderRequests(); });
      wrap.appendChild(b);
    });

    // Department chips: housekeeping doesn't want to read the maintenance
    // queue at 7am, and vice versa.
    const dept = document.getElementById("reqDepts");
    if (dept) {
      dept.innerHTML = "";
      [{ id: "all", ico: "", labelKey: "staff.requests.deptAll" }].concat(REQ_DEPTS).forEach((d) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = (d.id === reqDept ? "active" : "");
        b.textContent = (d.ico ? d.ico + " " : "") + t(d.labelKey);
        b.addEventListener("click", () => { reqDept = d.id; renderRequests(); });
        dept.appendChild(b);
      });
    }
  }

  /* Bulk bar — only while multi-select is on. Delete is admin-only: staff
     dismiss instead, which keeps the row (see the routes' DELETE guards). */
  function renderReqBulkBar() {
    const bar = document.getElementById("reqBulkBar");
    if (!bar) return;
    bar.innerHTML = "";
    bar.hidden = !reqMultiSelect;
    if (!reqMultiSelect) return;
    const n = selectedReqIds.size;
    const label = document.createElement("span");
    label.className = "rbb-count";
    label.textContent = t("staff.requests.selected").replace("{n}", n);
    bar.appendChild(label);

    function addBtn(labelText, cls, handler) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cc-btn " + (cls || "");
      b.disabled = !n;
      b.textContent = labelText;
      b.addEventListener("click", handler);
      bar.appendChild(b);
    }
    addBtn(t("staff.requests.done"), "", () => bulkRequests("done"));
    addBtn("🧪 " + t(reqShowTest ? "staff.requests.unmarkTest" : "staff.requests.markTest"), "", () => bulkRequests("test"));
    addBtn(t("staff.requests.dismiss"), "", () => bulkRequests("dismiss"));
    if (isAdmin()) addBtn("🗑 " + t("msg.delete"), "cc-btn-danger", () => bulkRequests("delete"));
  }

  function renderRequests() {
    renderReqToolbar();
    renderFilters();
    renderReqBulkBar();
    const list = document.getElementById("reqList");
    const reqs = boardRequests();

    // Drop selections for rows the current filter no longer shows, so a bulk
    // action can never touch a card the user can't see.
    const visible = new Set(reqs.map((r) => String(r.id)));
    Array.from(selectedReqIds).forEach((id) => { if (!visible.has(id)) selectedReqIds.delete(id); });

    const lede = document.querySelector("#panel-requests .panel-lede");
    if (lede) lede.textContent = "";

    if (!reqs.length) {
      const emptyKey = reqSearch.trim() ? "staff.requests.noMatch"
                     : reqShowTest ? "staff.requests.noTest"
                     : "staff.requests.empty";
      list.innerHTML = '<p class="track-empty">' + esc(t(emptyKey)) + "</p>";
      return;
    }
    // The board re-renders on every 10s poll (onRequestsChange), which rebuilds
    // every card — so a half-typed remark would vanish out from under whoever
    // was writing it. Capture any in-progress remark drafts first and put them
    // back after the rebuild, keyed by request id.
    const reqDrafts = captureReqThreadDrafts();
    list.innerHTML = "";
    reqs.forEach((r) => {
      const card = document.createElement("div");
      const unread = r.status === "pending" && !r.isTest && !reqAcked.has(String(r.id));
      const age = reqAgeLevel(r);
      card.className = "staff-req " + r.status +
        (unread ? " unread-req" : "") +
        (r.isTest ? " test-req" : "") +
        (age ? " age-" + age : "");
      card.dataset.reqId = String(r.id);

      let detail = "";
      if (r.kind === "order") {
        detail += '<div class="sr-detail"><b>' + esc(t("staff.requests.items")) + ":</b> " +
          esc((r.items || []).map((it) => it.qty + "× " + t(it.key)).join(", ")) +
          " · " + U.money(r.total) + "</div>";
        if (r.deliverAt) detail += '<div class="sr-detail">' + esc(t("staff.requests.deliver")) + ": " +
          esc(r.deliverAt === "asap" ? t("rs.asap") : r.deliverAt) + "</div>";
      }
      // The answer the guest already gave when filing — a taxi's destination
      // (below, via the shared note line) and pickup time, a wake-up call's
      // time, or a late checkout's time with which fee tier it falls into
      // (see U.checkoutFeeTier — computed fresh here so it always reads in
      // whichever language the viewer currently has active). Filed this way
      // instead of "pending" with nothing else to go on.
      if (r.titleKey === "req.taxi" && r.deliverAt) {
        detail += '<div class="sr-detail sr-reqtime">🚕 ' + esc(t("req.taxi.time")) + ": " +
          esc(r.deliverAt === "asap" ? t("rs.asap") : r.deliverAt) + "</div>";
      } else if (r.titleKey === "req.wakeup" && r.deliverAt) {
        detail += '<div class="sr-detail sr-reqtime">⏰ ' + esc(t("req.wakeup.time")) + ": " + esc(r.deliverAt) + "</div>";
      } else if (r.titleKey === "req.checkout" && r.deliverAt) {
        const tier = U.checkoutFeeTier(r.deliverAt);
        detail += '<div class="sr-detail sr-reqtime' + (tier === "extraNight" ? " sr-fee-high" : tier === "fee500" ? " sr-fee-mid" : "") + '">🕛 ' +
          esc(t("req.checkout.time")) + ": " + esc(r.deliverAt) +
          (tier ? " · " + esc(t("req.checkout.tier." + tier)) : "") + "</div>";
      }
      // The guest's own words and the desk's note are kept visibly apart —
      // one is a request, the other is a record of what was done about it.
      if (r.note) {
        detail += '<div class="sr-detail">' +
          esc(t("staff.requests.note")) + ": " + esc(r.note) + "</div>";
      }
      if (r.staffNote) detail += '<div class="sr-detail sr-staffnote">📝 ' + esc(r.staffNote) + "</div>";

      // Who filed it. A request from someone whose name+room didn't match a
      // booking (OTA guest, walk-in, or a wrong room number) is still actioned
      // — it's just flagged so the desk can check the register first, and the
      // name opens the guest's booking rather than being a dead end.
      const tier = r.guestVerified ? "verified" : "unconfirmed";
      const guestRow =
        '<div class="sr-guestrow">' +
          '<button type="button" class="sr-guest-btn" title="' + esc(t("staff.guest.openHint")) + '">' +
            '<span class="sr-tier">' + TIER_MARK[tier] + "</span>" +
            esc(r.guestName || t("staff.chat.tier.unknown")) +
          "</button>" +
          (r.lang && r.lang !== "en"
            ? '<span class="sr-lang">' + esc(I.LANG_NAMES[r.lang] || r.lang) + "</span>" : "") +
          (r.guestVerified === false
            ? '<span class="sr-unverified" title="' + esc(t("staff.requests.unverifiedHint")) + '">🔶 ' +
              esc(t("staff.chat.tier.unconfirmed")) + "</span>"
            : "") +
          (r.confirmedBy
            ? '<span class="sr-confirmed">' + esc(t("staff.chat.confirmedBy").replace("{name}", r.confirmedBy)) + "</span>"
            : "") +
        "</div>";

      // Ownership, so two people don't walk to the same room.
      const mine = r.assignedStaffId && session && r.assignedStaffId === session.id;
      const assignLabel = r.assignedStaffName
        ? (mine ? t("staff.requests.takenByYou") : t("staff.requests.takenBy").replace("{name}", r.assignedStaffName))
        : t("staff.requests.unassigned");
      const assignBtn = r.status === "done" || r.status === "cancelled" ? ""
        : mine ? '<button type="button" class="sr-ghost act-release">' + esc(t("staff.requests.release")) + "</button>"
        : '<button type="button" class="sr-ghost act-take">' +
            esc(t(r.assignedStaffId ? "staff.requests.takeOver" : "staff.requests.take")) + "</button>";

      let actions = "";
      if (r.status === "pending") actions = '<button class="act-start">' + esc(t("staff.requests.start")) + "</button>";
      else if (r.status === "progress") actions = '<button class="act-done">' + esc(t("staff.requests.done")) + "</button>";
      else if (r.status === "done") actions = '<button class="act-reopen">' + esc(t("staff.requests.reopen")) + "</button>";
      else if (r.status === "cancelled") actions = '<button class="act-restore">' + esc(t("staff.requests.restore")) + "</button>";

      // Remarks: a two-way thread about THIS request, riding in the guest's
      // existing live chat (see request_kind/request_id in schema.sql) so it
      // shows up right on the card instead of the desk having to remember to
      // go check the general Chat panel for it.
      const threadKey = reqThreadKey(r);
      const threadExpanded = reqExpandedThreads.has(threadKey);
      const threadUnread = r.msgUnread || 0;
      // Physical room number (from the live booking, assigned at check-in) AND
      // room type, so the desk sees exactly where the guest is — e.g. "Room 407"
      // + "Deluxe" — and never a room type mislabelled as "Room Deluxe".
      const rb = roomBits(bookingForRequest(r), r.room, r.roomType);

      card.innerHTML =
        (reqMultiSelect
          ? '<input type="checkbox" class="sr-check"' + (selectedReqIds.has(String(r.id)) ? " checked" : "") +
            ' aria-label="' + esc(t("staff.chat.select")) + '" />'
          : "") +
        '<div class="sr-head">' +
          // The physical room number (only when the front desk has actually
          // assigned one), then which of the five buildings, then the room type
          // — read off the guest's LIVE booking (lib/buildings.js). Housekeeping
          // can't act on a room number alone across a five-building site, and a
          // number the desk hasn't assigned yet would just be a guess.
          (rb.number ? '<span class="sr-room">' + esc(t("staff.requests.room")) + " " + esc(rb.number) + "</span>" : "") +
          (r.building ? '<span class="sr-building">' + esc(t("building.n").replace("{n}", r.building)) + "</span>" : "") +
          (rb.type ? '<span class="sr-roomtype">' + esc(rb.type) + "</span>" : "") +
          '<span class="sr-title"><span class="sr-dept" aria-hidden="true">' + reqDeptIco(r) + "</span>" +
            esc(reqTitle(r)) + "</span>" +
          (unread ? '<span class="sr-bang" aria-hidden="true">!</span>' : "") +
          (r.isTest ? '<span class="sr-test">' + esc(t("staff.requests.test")) + "</span>" : "") +
          (r.status === "pending" ? '<span class="sr-new">' + esc(t("track.status.pending").toUpperCase()) + "</span>" : "") +
          (age ? '<span class="sr-age ' + age + '">' + esc(reqElapsed(r.createdAt)) + "</span>" : "") +
          '<span class="sr-time">' + esc(U.timeAgo(r.createdAt)) + "</span>" +
        "</div>" +
        guestRow + detail +
        '<div class="sr-assign' + (mine ? " mine" : "") + '"><span>' + esc(assignLabel) + "</span>" + assignBtn + "</div>" +
        '<div class="sr-actions">' + actions +
          '<button type="button" class="sr-ghost act-note">' + esc(t("staff.requests.addNote")) + "</button>" +
          '<button type="button" class="sr-ghost act-remarks' + (threadUnread ? " has-unread" : "") + '">💬 ' +
            esc(t("staff.requests.remarks")) +
            (threadUnread ? ' <span class="sr-msg-badge">' + threadUnread + "</span>" : "") + "</button>" +
          '<button type="button" class="sr-ghost act-chat">' + esc(t("staff.requests.openChat")) + "</button>" +
          '<button type="button" class="sr-ghost act-test">🧪 ' +
            esc(t(r.isTest ? "staff.requests.unmarkTest" : "staff.requests.markTest")) + "</button>" +
          (r.status === "cancelled" ? ""
            : '<button type="button" class="sr-ghost act-dismiss">' + esc(t("staff.requests.dismiss")) + "</button>") +
          (isAdmin() ? '<button type="button" class="sr-ghost sr-danger act-delete">🗑</button>' : "") +
        "</div>" +
        '<div class="sr-thread"' + (threadExpanded ? "" : " hidden") + '>' +
          '<div class="thread-body"></div>' +
          '<form class="thread-form">' +
            '<input type="text" class="thread-input" placeholder="' + esc(t("staff.chat.placeholder")) + '" autocomplete="off" />' +
            '<button type="submit">' + esc(t("common.send")) + "</button>" +
          "</form>" +
        "</div>";

      const on = (sel, fn) => {
        const el = card.querySelector(sel);
        if (el) el.addEventListener("click", fn);
      };
      on(".act-start", () => updateReqStatus(r.id, "progress"));
      on(".act-done", () => updateReqStatus(r.id, "done"));
      on(".act-reopen", () => updateReqStatus(r.id, "progress"));
      on(".act-restore", () => updateReqStatus(r.id, "pending"));
      on(".sr-guest-btn", () => openGuestPanel({ request: r }));
      on(".act-take", () => assignRequest(r, session));
      on(".act-release", () => assignRequest(r, null));
      on(".act-note", () => editRequestNote(r));
      on(".act-remarks", () => toggleReqThread(r, card));
      on(".act-chat", () => openRequestChat(r));
      on(".act-test", () => toggleRequestTest(r));
      on(".act-dismiss", () => dismissRequest(r));
      on(".act-delete", () => deleteRequest(r));

      // Remarks thread: wire the reply form on every render (so a draft
      // survives the poll), and reload the messages if this thread is open.
      const rform = card.querySelector(".sr-thread .thread-form");
      const rinput = card.querySelector(".sr-thread .thread-input");
      if (rform && rinput) {
        if (reqDrafts[threadKey]) rinput.value = reqDrafts[threadKey];
        rform.addEventListener("submit", (e) => {
          e.preventDefault();
          const text = rinput.value.trim();
          if (!text) return;
          rinput.value = "";
          sendReqRemark(r, text, card.querySelector(".sr-thread .thread-body"));
        });
      }
      if (threadExpanded) {
        loadReqThread(r, card.querySelector(".sr-thread .thread-body"));
      }

      const check = card.querySelector(".sr-check");
      if (check) {
        check.addEventListener("change", () => {
          if (check.checked) selectedReqIds.add(String(r.id));
          else selectedReqIds.delete(String(r.id));
          renderReqBulkBar();
        });
      }
      list.appendChild(card);
    });
  }

  /* ── Per-request remarks (staff side) ─────────────────────────────────────
     The guest's messages about ONE request, shown inline on its card. They
     live in the guest's existing live-chat thread, tagged with this request
     (see request_kind/request_id in schema.sql and sendForRequest in
     chat.js) — so replying here reaches the very same conversation the guest
     is watching, without the desk having to hunt for their chat thread. */
  const reqExpandedThreads = new Set();
  function reqThreadKey(r) { return r.reqKind + ":" + r.reqId; }

  function captureReqThreadDrafts() {
    const drafts = {};
    document.querySelectorAll("#reqList .staff-req").forEach((card) => {
      const input = card.querySelector(".sr-thread .thread-input");
      if (input && input.value) {
        const id = card.dataset.reqId;
        const row = S.list("requests").find((x) => String(x.id) === String(id));
        if (row && row.reqKind != null) drafts[reqThreadKey(row)] = input.value;
      }
    });
    return drafts;
  }

  function renderReqThreadMessages(bodyEl, messages, guestName) {
    if (!bodyEl) return;
    bodyEl.innerHTML = "";
    const visible = (messages || []).filter((m) => m.from !== "system");
    if (!visible.length) {
      bodyEl.innerHTML = '<p class="thread-empty">' + esc(t("staff.requests.remarksEmpty")) + "</p>";
      return;
    }
    const cur = I.getLang();
    visible.forEach((m) => {
      const div = document.createElement("div");
      div.className = "msg " + (m.from === "staff" ? "staff" : "guest");
      const label = m.from === "staff" ? (m.fromName || t("chat.staff")) : (guestName || t("staff.chat.tier.unknown"));
      div.innerHTML = '<span class="msg-from">' + esc(label) + "</span>";
      const span = document.createElement("span"); div.appendChild(span);
      const noteHost = document.createElement("span"); noteHost.className = "msg-notes"; div.appendChild(noteHost);
      // Script-aware: translate when the text isn't actually in the viewer's
      // language, even if it was declared as such (see translate.js).
      if (J.translate.needsTranslation(m.text, m.lang, cur)) J.translate.fill(span, m.text, noteHost);
      else span.textContent = m.text;
      if (m.ts) {
        const time = document.createElement("time");
        time.className = "msg-time";
        time.dateTime = new Date(m.ts).toISOString();
        time.textContent = U.messageTime(m.ts);
        div.appendChild(time);
      }
      bodyEl.appendChild(div);
    });
    U.pinToBottom(bodyEl);
  }

  async function loadReqThread(r, bodyEl) {
    if (!bodyEl) return;
    const API = window.JPark && window.JPark.api;
    if (!API || !r.guestId) { renderReqThreadMessages(bodyEl, [], r.guestName); return; }
    const res = await API.get(
      "/api/chat?guestId=" + encodeURIComponent(r.guestId) +
      "&kind=" + encodeURIComponent(r.reqKind) +
      "&id=" + encodeURIComponent(r.reqId)
    );
    const msgs = (res && Array.isArray(res.messages)) ? res.messages : [];
    renderReqThreadMessages(bodyEl, msgs, r.guestName);
  }

  function toggleReqThread(r, card) {
    const key = reqThreadKey(r);
    const section = card.querySelector(".sr-thread");
    if (!section) return;
    if (reqExpandedThreads.has(key)) {
      reqExpandedThreads.delete(key);
      section.hidden = true;
      return;
    }
    reqExpandedThreads.add(key);
    section.hidden = false;
    // Opening a thread is the strongest "I've seen it" — clear the request's
    // unread badge locally so it doesn't keep flagging what's on screen.
    markReqRemarksRead(r);
    loadReqThread(r, section.querySelector(".thread-body"));
    const input = section.querySelector(".thread-input");
    if (input) setTimeout(() => input.focus(), 30);
  }

  function markReqRemarksRead(r) {
    const all = S.list("requests");
    const i = all.findIndex((x) => String(x.id) === String(r.id));
    if (i >= 0 && all[i].msgUnread) { all[i].msgUnread = 0; S.write("requests", all); }
    // Durable read marker so the next _pollRequests summary doesn't re-light the
    // "💬 N" badge on a remark thread the desk already opened (chat_reads).
    const API = window.JPark && window.JPark.api;
    if (API && r.guestId && r.reqKind && r.reqId != null) {
      API.post("/api/chat/request-read-staff", { guestId: r.guestId, kind: r.reqKind, id: r.reqId }).catch(function () {});
    }
  }

  async function sendReqRemark(r, text, bodyEl) {
    if (!r.guestId) { U.toast(t("staff.requests.remarksNoGuest"), "error"); return; }
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    const res = await API.post("/api/chat", {
      guestId: r.guestId,
      from: "staff",
      fromName: session ? session.name : undefined,
      text: text,
      lang: I.getLang(),
      escalated: true,
      requestKind: r.reqKind,
      requestId: r.reqId,
      assignedStaffId: session ? session.id : undefined,
      assignedStaffName: session ? session.name : undefined,
    });
    if (res && res.error && !res.offline) {
      U.toast(t("staff.requests.remarksFailed") + ": " + res.error, "error");
      return;
    }
    loadReqThread(r, bodyEl);
  }

  /* Keep the waiting times honest without re-rendering the whole board every
     half minute (which would fight the poll and reset the search box). Only
     the age chips are touched, in place. */
  function refreshRequestAges() {
    if (panel !== "requests") return;
    const rows = S.list("requests");
    document.querySelectorAll("#reqList .staff-req").forEach(function (card) {
      const chip = card.querySelector(".sr-age");
      if (!chip) return;
      const r = rows.find((x) => String(x.id) === card.dataset.reqId);
      const level = reqAgeLevel(r);
      if (!level) return;
      chip.textContent = reqElapsed(r.createdAt);
      chip.className = "sr-age " + level;
      card.classList.remove("age-ok", "age-warn", "age-late");
      card.classList.add("age-" + level);
    });
  }

  // "ord-" ids come from the orders table (see _pollRequests), and route back
  // to it; everything else is a service request.
  function reqApiPath(id) {
    return String(id).indexOf("ord-") === 0
      ? "/api/orders/" + String(id).slice(4)
      : "/api/service-requests/" + id;
  }

  /* Every board action: apply locally for an instant response, then write it
     server-side and put the card back the way the server sees it if that
     fails. `patch` is sent as-is to the API; `local` is what the optimistic
     row should look like (they differ where the server derives fields). */
  function patchRequest(id, patch, local) {
    // Ids reach here as numbers (straight off the API) AND as strings (out of
    // the bulk-selection set), while the store matches on ===. Resolve the
    // row's own id first, or the optimistic update silently misses and the
    // card sits unchanged until the next poll.
    const row = S.list("requests").find((r) => String(r.id) === String(id));
    const rowId = row ? row.id : id;
    S.update("requests", rowId, local || patch);
    markRequestsRead(true); // acting on the board is the strongest "I've seen it"
    const API = window.JPark && window.JPark.api;
    if (!API) return Promise.resolve(null);
    return API.patch(reqApiPath(rowId), patch).then(function (res) {
      if (res && res.error && !res.offline) {
        console.error("[staff] request update failed:", res.error);
        U.toast(t("staff.requests.updateFailed"), "error");
        _pollRequests();
      }
      return res;
    }).catch(function () { return null; });
  }

  function updateReqStatus(id, status) {
    patchRequest(id, { status: status });
  }

  /* Take / take over / release. The staff member's name rides along so every
     other console can show who has it without a second lookup — same shape as
     live-chat thread assignment. */
  function assignRequest(r, who) {
    if (who && r.assignedStaffId && r.assignedStaffId !== who.id
        && !confirm(t("staff.requests.takeOverConfirm").replace("{name}", r.assignedStaffName || ""))) return;
    patchRequest(r.id, {
      assignedStaffId: who ? who.id : null,
      assignedStaffName: who ? who.name : null,
    });
  }

  function editRequestNote(r) {
    const next = prompt(t("staff.requests.notePrompt"), r.staffNote || "");
    if (next == null) return;
    patchRequest(r.id, { staffNote: next.trim() });
  }

  function toggleRequestTest(r) {
    const next = !r.isTest;
    if (next && !confirm(t("staff.requests.markTestConfirm"))) return;
    // The API field is `test`, the row's field is `isTest` — pass the local
    // shape explicitly or the card sits there unchanged until the next poll.
    patchRequest(r.id, { test: next }, { isTest: next });
    U.toast(t(next ? "staff.requests.markedTest" : "staff.requests.unmarkedTest"), "success");
  }

  /* Dismiss keeps the row — it stays under the Dismissed tab and can be put
     back. That's the difference from Delete, which only an admin can do. */
  function dismissRequest(r) {
    if (!confirm(t("staff.requests.dismissConfirm"))) return;
    updateReqStatus(r.id, "cancelled");
  }

  async function deleteRequest(r) {
    if (!isAdmin()) return;
    if (!confirm(t("staff.requests.deleteConfirm"))) return;
    const API = window.JPark && window.JPark.api;
    if (API) {
      const res = await API.del(reqApiPath(r.id));
      if (res && res.error && !res.offline) {
        U.toast(t("staff.requests.deleteFailed") + ": " + res.error, "error");
        return;
      }
    }
    S.write("requests", S.list("requests").filter((x) => String(x.id) !== String(r.id)));
    selectedReqIds.delete(String(r.id));
    U.toast(t("staff.requests.deleted"), "success");
    renderRequests();
  }

  /* Jump from a request straight into that guest's live chat. */
  function openRequestChat(r) {
    const chat = chatForGuest(r);
    if (!chat) { U.toast(t("staff.requests.noChat")); return; }
    closeGuestPanel();
    selectedThread = chat.id;
    chatFilter = "all";
    selectPanel("chat");
    markThreadRead(chat.id);
    _loadThreadMessages(chat.id).then(() => renderChat());
  }

  /* Bulk actions over the checked cards. Delete is one call per table rather
     than one per card (see each route's POST /bulk-delete). */
  async function bulkRequests(action) {
    const ids = Array.from(selectedReqIds);
    if (!ids.length) return;
    if (action === "delete") {
      if (!isAdmin()) return;
      if (!confirm(t("staff.requests.bulkDeleteConfirm").replace("{n}", ids.length))) return;
      const API = window.JPark && window.JPark.api;
      if (API) {
        const orderIds = ids.filter((id) => id.indexOf("ord-") === 0).map((id) => Number(id.slice(4)));
        const reqIds = ids.filter((id) => id.indexOf("ord-") !== 0).map(Number);
        const calls = [];
        if (reqIds.length) calls.push(API.post("/api/service-requests/bulk-delete", { ids: reqIds }));
        if (orderIds.length) calls.push(API.post("/api/orders/bulk-delete", { ids: orderIds }));
        const results = await Promise.all(calls);
        const failed = results.find((res) => res && res.error && !res.offline);
        if (failed) { U.toast(t("staff.requests.deleteFailed") + ": " + failed.error, "error"); return; }
      }
      const drop = new Set(ids);
      S.write("requests", S.list("requests").filter((x) => !drop.has(String(x.id))));
      U.toast(t("staff.requests.bulkDeleted").replace("{n}", ids.length), "success");
    } else if (action === "test") {
      const next = !reqShowTest; // the test board un-marks; the real board marks
      ids.forEach((id) => patchRequest(id, { test: next }, { isTest: next }));
      U.toast(t(next ? "staff.requests.markedTest" : "staff.requests.unmarkedTest"), "success");
    } else if (action === "dismiss") {
      if (!confirm(t("staff.requests.dismissConfirm"))) return;
      ids.forEach((id) => updateReqStatus(id, "cancelled"));
    } else if (action === "done") {
      ids.forEach((id) => updateReqStatus(id, "done"));
    }
    selectedReqIds.clear();
    reqMultiSelect = false;
    renderRequests();
  }

  /* ====================  GUEST PANEL  ====================
     "Who is this, and where are they?" — one slide-over shared by the Guest
     Requests board and the live-chat header, so both answer the question the
     same way. Everything it shows is already in the console's polled tables
     (requests, chats, guestBookings): opening it costs no extra request, which
     matters on a board that polls every 10 seconds.

     It is also where an unmatched guest gets fixed. An OTA or walk-in guest
     never matches a booking automatically (see verifyGuest in
     backend/lib/guestLookup.js), so their card has no building — and on a
     five-building property that means nobody knows where to walk. Staff check
     the register, link the booking here, and the request gains the building,
     room type and verified badge from the booking itself.                    */

  // The guest's chat thread, seen from a request. Both come from S.guestId(),
  // so the ids match within one visit — but assets/js/chat.js rotates a
  // visitor's guestId once per browser session, so a guest who asked for
  // towels yesterday and is chatting today has a different thread id. Hence
  // the booking-ref and room+name fallbacks.
  function chatForGuest(r) {
    if (!r) return null;
    const chats = S.list("chats");
    let hit = r.guestId ? chats.find((c) => c.id === r.guestId) : null;
    if (!hit && r.bookingRef) hit = chats.find((c) => c.bookingRef === r.bookingRef);
    if (!hit && r.room && r.guestName) {
      const name = String(r.guestName).toLowerCase();
      hit = chats.find((c) => c.room === r.room && String(c.guestName || "").toLowerCase() === name);
    }
    return hit || null;
  }

  // The booking behind a request. Reads the RAW booking list, not
  // visibleBookings() — that one hides non-direct channels, which an OTA
  // guest's own reservation legitimately is (same reasoning as chatBooking()).
  function bookingForRequest(r) {
    if (!r || !r.bookingRef) return null;
    return S.list("guestBookings").find((b) => b.ref === r.bookingRef) || null;
  }

  // The room a guest is in, for the desk to read at a glance: the physical room
  // NUMBER the front desk assigned plus the room TYPE. The number is taken from
  // the LIVE booking first (so a room typed at check-in shows on this guest's
  // requests and chats immediately), and when that booking carries no assigned
  // number yet we fall back to the number the guest was already on when they
  // filed — `guest.room` is the physical number when one exists (guest.js
  // setGuest), and it rides onto the request/chat, so a linked-but-unnumbered
  // booking must not throw it away. The self-declared value is only trusted as a
  // number when it actually looks like one (has a digit): `guest.room` degrades
  // to the room TYPE when no physical room was assigned at login, and rendering
  // "Room Studio Twin" — a room TYPE mislabelled as a number — is the exact
  // "Room Deluxe" confusion we're avoiding. `booking.room` is the room TYPE,
  // `room_number` the physical room (see the two-"room"-fields trap noted
  // throughout the backend).
  function roomBits(booking, selfRoom, selfType) {
    let number = (booking && booking.roomNumber) || null;
    if (!number && selfRoom && /\d/.test(String(selfRoom))) number = selfRoom;
    const type = (booking && booking.room) || selfType || null;
    return { number: number, type: type };
  }
  // "Room 407 · Deluxe", or just the part we have when the other is missing.
  function roomLabel(booking, selfRoom, selfType) {
    const b = roomBits(booking, selfRoom, selfType);
    const parts = [];
    if (b.number) parts.push(t("staff.requests.room") + " " + b.number);
    if (b.type)   parts.push(b.type);
    return parts.join(" · ");
  }

  /* Resolve the panel's subject freshly from the store on every render, so a
     poll landing while it's open updates it in place instead of showing a
     snapshot from when it was opened. */
  function guestPanelSubject(ctx) {
    if (!ctx) return null;
    if (ctx.kind === "request") {
      const r = S.list("requests").find((x) => String(x.id) === String(ctx.id));
      if (!r) return null;
      const booking = bookingForRequest(r);
      return {
        kind: "request", request: r, chat: chatForGuest(r), booking: booking,
        name: r.guestName, room: roomBits(booking, r.room, r.roomType).number,
        building: r.building || (booking ? booking.building : null),
        roomType: r.roomType || (booking ? booking.room : null),
        lang: r.lang, tier: r.guestVerified ? "verified" : "unconfirmed",
        bookingRef: r.bookingRef, confirmedBy: r.confirmedBy,
      };
    }
    const c = S.list("chats").find((x) => x.id === ctx.id);
    if (!c) return null;
    const booking = chatBooking(c);
    return {
      kind: "chat", chat: c, request: null, booking: booking,
      name: c.guestName, room: roomBits(booking, c.room, null).number,
      building: booking ? booking.building : null,
      roomType: booking ? booking.room : null,
      lang: c.lang, tier: chatTier(c),
      bookingRef: c.bookingRef, confirmedBy: c.confirmedBy,
    };
  }

  // Everything else this guest currently has open, so the desk can carry the
  // towels and the extra pillow in one trip.
  function otherRequestsFor(subj) {
    const cur = subj.request ? String(subj.request.id) : null;
    const name = String(subj.name || "").toLowerCase();
    return S.list("requests").filter(function (r) {
      if (String(r.id) === cur || r.isTest || r.status === "cancelled") return false;
      if (subj.bookingRef && r.bookingRef === subj.bookingRef) return true;
      if (subj.request && subj.request.guestId && r.guestId === subj.request.guestId) return true;
      return !!(subj.room && r.room === subj.room && name && String(r.guestName || "").toLowerCase() === name);
    }).sort((a, b) => b.createdAt - a.createdAt);
  }

  function openGuestPanel(opts) {
    guestPanelCtx = opts.request
      ? { kind: "request", id: String(opts.request.id) }
      : { kind: "chat", id: opts.chat.id };
    document.getElementById("guestPanelOverlay").hidden = false;
    document.getElementById("guestPanel").hidden = false;
    renderGuestPanel();
  }

  function closeGuestPanel() {
    guestPanelCtx = null;
    const p = document.getElementById("guestPanel");
    const o = document.getElementById("guestPanelOverlay");
    if (p) p.hidden = true;
    if (o) o.hidden = true;
  }

  function renderGuestPanel() {
    if (!guestPanelCtx) return;
    const panelEl = document.getElementById("guestPanel");
    const bodyEl = document.getElementById("guestPanelBody");
    if (!panelEl || panelEl.hidden) return;
    const subj = guestPanelSubject(guestPanelCtx);
    if (!subj) { closeGuestPanel(); return; }

    // A poll re-renders this panel while it's open, so anything the user is
    // part-way through typing has to survive the rebuild — otherwise a booking
    // search resets itself every few seconds under their fingers.
    const prevSearch = bodyEl.querySelector("#gpLinkSearch");
    const keptQuery = prevSearch ? prevSearch.value : null;
    const keptFocus = prevSearch && document.activeElement === prevSearch;

    document.getElementById("gpTier").textContent = TIER_MARK[subj.tier] || "•";
    document.getElementById("gpTier").title = t(TIER_KEY[subj.tier] || "staff.chat.tier.unknown");
    document.getElementById("gpName").textContent = subj.name || t("staff.chat.tier.unknown");

    const b = subj.booking;
    // Where they are, in the words housekeeping uses on the radio.
    const where = [
      subj.room ? t("staff.requests.room") + " " + subj.room : "",
      subj.building ? t("building.n").replace("{n}", subj.building) : "",
      subj.roomType || "",
    ].filter(Boolean).join(" · ");

    let html =
      '<div class="gp-tierline ' + subj.tier + '">' + esc(t(TIER_KEY[subj.tier] || "staff.chat.tier.unknown")) +
        (subj.confirmedBy ? " · " + esc(t("staff.chat.confirmedBy").replace("{name}", subj.confirmedBy)) : "") +
      "</div>" +
      (where ? '<div class="gp-where">' + esc(where) + "</div>" : "") +
      (subj.lang ? '<div class="gp-lang">' + esc(t("staff.chat.guestLang")) + ": " +
        esc(I.LANG_NAMES[subj.lang] || subj.lang) + "</div>" : "");

    if (b) {
      const stay = bookingStayStatus(b);
      let fields = "";
      fields += bookingField("msg.bk.ref", b.ref);
      fields += bookingField("staff.guest.channel", b.channelName);
      fields += bookingField("msg.bk.checkin", b.checkIn ? U.formatDate(String(b.checkIn).slice(0, 10)) : "");
      fields += bookingField("msg.bk.checkout", b.checkOut ? U.formatDate(String(b.checkOut).slice(0, 10)) : "");
      fields += bookingField("msg.bk.nights", b.nights);
      fields += bookingField("msg.bk.room", b.room);
      fields += bookingField("msg.bk.roomNumber", b.roomNumber);
      fields += bookingField("msg.bk.adults", b.adults);
      if (b.children) fields += bookingField("msg.bk.children", b.children);
      fields += bookingField("msg.bk.breakfast", t(b.breakfast ? "msg.bk.breakfast.yes" : "msg.bk.breakfast.no"));
      fields += bookingField("msg.bk.smokingPref", t("msg.bk.smokingPref." + (b.smokingPreference || "non_smoking")));
      if (b.extraBed) fields += bookingField("msg.bk.extraBed", t("msg.bk.breakfast.yes"));
      if (b.nonRefundable) fields += bookingField("msg.bk.nonRefundable", t("msg.bk.breakfast.yes"));
      fields += bookingField("msg.bk.phone", b.guestPhone);
      fields += bookingField("msg.bk.email", b.guestEmail);
      if (b.total != null) fields += bookingField("msg.bk.total", (b.currency || "THB") + " " + Number(b.total).toLocaleString());
      fields += bookingField("msg.bk.statusLabel", bkStatusLabel(b.status));
      html +=
        '<div class="gp-section">' +
          '<div class="gp-section-title">' + esc(t("staff.guest.booking")) +
            (stay ? ' <b class="cci-stay ' + stay + '">' + esc(t("staff.chat.stay." + stay)) + "</b>" : "") +
          "</div>" +
          '<div class="bk-detail-grid">' + fields + "</div>" +
          (b.specialRequests
            ? '<div class="gp-special">✱ ' + esc(b.specialRequests) + "</div>" : "") +
        "</div>";
    } else {
      // No booking on file. This is the normal path for a walk-in, so it reads
      // as a next step rather than an error.
      html +=
        '<div class="gp-section gp-nobooking">' +
          '<div class="gp-section-title">' + esc(t("staff.guest.noBooking")) + "</div>" +
          '<p class="gp-hint">' + esc(t("staff.guest.noBookingHint")) + "</p>" +
          '<div class="gp-link-search">' +
            '<input type="search" id="gpLinkSearch" placeholder="' + esc(t("staff.guest.searchPh")) + '" autocomplete="off" />' +
          "</div>" +
          '<div class="gp-link-results" id="gpLinkResults"></div>' +
        "</div>";
    }

    // Manual building, for a guest with no booking anywhere on file. Never
    // guessed from the room number — this is a human reading the key-card
    // sleeve (see backend/lib/buildings.js).
    if (subj.kind === "request") {
      let opts = '<option value="">' + esc(t("staff.guest.buildingUnknown")) + "</option>";
      for (let i = 1; i <= 5; i++) {
        opts += '<option value="' + i + '"' + (Number(subj.building) === i ? " selected" : "") + ">" +
          esc(t("building.n").replace("{n}", i)) + "</option>";
      }
      html +=
        '<div class="gp-section">' +
          '<div class="gp-section-title">' + esc(t("staff.guest.buildingTitle")) + "</div>" +
          '<select id="gpBuilding" class="gp-select">' + opts + "</select>" +
        "</div>";
    }

    const others = otherRequestsFor(subj);
    if (others.length) {
      html +=
        '<div class="gp-section">' +
          '<div class="gp-section-title">' + esc(t("staff.guest.otherRequests")) + "</div>" +
          '<ul class="gp-others">' +
            others.map(function (o) {
              return '<li><span class="gp-other-status ' + esc(o.status) + '">' +
                esc(t("track.status." + o.status)) + "</span>" + esc(reqTitle(o)) +
                '<span class="gp-other-time">' + esc(U.timeAgo(o.createdAt)) + "</span></li>";
            }).join("") +
          "</ul>" +
        "</div>";
    }

    // Actions. "Open booking" only appears when the booking is actually
    // reachable in Messages — the Guest Booking inbox is Direct-only
    // (SHOW_OTA_BOOKINGS), so offering it for an OTA row would dead-end.
    html += '<div class="gp-actions">';
    if (subj.chat) html += '<button type="button" class="gp-btn" id="gpOpenChat">💬 ' + esc(t("staff.requests.openChat")) + "</button>";
    if (b && isDirectBooking(b)) html += '<button type="button" class="gp-btn" id="gpOpenBooking">📄 ' + esc(t("staff.guest.openBooking")) + "</button>";
    if (subj.kind === "chat" && subj.tier === "unconfirmed") {
      html += '<button type="button" class="gp-btn gp-btn-gold" id="gpConfirmChat">' + esc(t("staff.chat.confirmGuest")) + "</button>";
    }
    html += "</div>";

    bodyEl.innerHTML = html;

    const linkInput = bodyEl.querySelector("#gpLinkSearch");
    if (linkInput) {
      const results = bodyEl.querySelector("#gpLinkResults");
      const run = function () { renderBookingMatches(results, linkInput.value, subj); };
      linkInput.addEventListener("input", run);
      // Seed with the guest's own details — most of the time the booking is
      // right there under their surname and staff need type nothing.
      linkInput.value = keptQuery != null ? keptQuery : (subj.name || subj.room || "");
      run();
      if (keptFocus) linkInput.focus();
    }

    const buildingSel = bodyEl.querySelector("#gpBuilding");
    if (buildingSel) {
      buildingSel.addEventListener("change", function () {
        const v = buildingSel.value ? Number(buildingSel.value) : null;
        patchRequest(subj.request.id, { building: v }, { building: v });
        U.toast(t("staff.guest.buildingSaved"), "success");
      });
    }

    const openChatBtn = bodyEl.querySelector("#gpOpenChat");
    if (openChatBtn) openChatBtn.addEventListener("click", function () {
      const target = subj.chat;
      closeGuestPanel();
      selectedThread = target.id;
      chatFilter = "all";
      selectPanel("chat");
      markThreadRead(target.id);
      _loadThreadMessages(target.id).then(() => renderChat());
    });

    const openBkBtn = bodyEl.querySelector("#gpOpenBooking");
    if (openBkBtn) openBkBtn.addEventListener("click", function () {
      closeGuestPanel();
      msgPrevView = "inbox";
      msgDetailId = b.id;
      msgDetailKind = "booking";
      msgView = "detail";
      markBookingRead(b.id);
      selectPanel("messages");
      renderMessages();
    });

    const confirmBtn = bodyEl.querySelector("#gpConfirmChat");
    if (confirmBtn) confirmBtn.addEventListener("click", function () { confirmChatGuest(subj.chat); });
  }

  /* Booking search for the "link this guest to a booking" flow. Filters the
     bookings the console has already polled — no query, no extra egress — on
     the three things a front-desk agent has in front of them: the surname, the
     room number, or the reference on the guest's phone. */
  function renderBookingMatches(container, query, subj) {
    if (!container) return;
    const q = String(query || "").trim().toLowerCase();
    if (q.length < 2) {
      container.innerHTML = '<p class="gp-hint">' + esc(t("staff.guest.searchHint")) + "</p>";
      return;
    }
    const matches = S.list("guestBookings").filter(function (bk) {
      if (bk.status === "cancelled") return false;
      return [bk.ref, bk.guestName, bk.lastName, bk.roomNumber, bk.room, bk.guestEmail]
        .filter(Boolean).join(" ").toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, c) {
      // The stay covering today first — a returning guest is here on this one.
      const rank = (x) => (bookingStayStatus(x) === "in_house" ? 0 : bookingStayStatus(x) === "upcoming" ? 1 : 2);
      return rank(a) - rank(c) || c.createdAt - a.createdAt;
    }).slice(0, 6);

    if (!matches.length) {
      container.innerHTML = '<p class="gp-hint">' + esc(t("staff.guest.searchNone")) + "</p>";
      return;
    }
    container.innerHTML = "";
    matches.forEach(function (bk) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "gp-match";
      const stay = bookingStayStatus(bk);
      row.innerHTML =
        '<span class="gp-match-name">' + esc(bk.guestName || bk.lastName || "—") + "</span>" +
        '<span class="gp-match-meta">' + esc([
          bk.ref,
          bk.roomNumber ? t("staff.requests.room") + " " + bk.roomNumber : bk.room,
          bk.building ? t("building.n").replace("{n}", bk.building) : "",
          bk.checkIn ? U.formatDate(String(bk.checkIn).slice(0, 10)) : "",
        ].filter(Boolean).join(" · ")) + "</span>" +
        (stay ? '<span class="cci-stay ' + stay + '">' + esc(t("staff.chat.stay." + stay)) + "</span>" : "");
      row.addEventListener("click", function () { linkGuestToBooking(subj, bk); });
      container.appendChild(row);
    });
  }

  /* Staff have checked the register and found the reservation. The server
     re-reads the booking from the ref (it will not take the verified flag or
     the building from the browser), so a hand-linked request ends up in
     exactly the state an automatically-matched one would. */
  async function linkGuestToBooking(subj, bk) {
    if (subj.kind === "request") {
      const res = await patchRequest(subj.request.id, { bookingRef: bk.ref }, {
        bookingRef: bk.ref,
        guestVerified: true,
        building: bk.building || subj.request.building || null,
        roomType: bk.room || subj.request.roomType || null,
        confirmedBy: session ? session.name : null,
      });
      if (res && res.error && !res.offline) return;
      U.toast(t("staff.guest.linked"), "success");
    }
    // A chat thread the same guest has open is vouched for at the same time,
    // so the front desk doesn't have to confirm the same person twice.
    const chat = subj.chat;
    if (chat && !chat.guestVerified) {
      const API = window.JPark && window.JPark.api;
      if (API) {
        const res = await API.patch("/api/chat/" + encodeURIComponent(chat.id) + "/confirm-guest", {
          bookingId: bk.id, bookingRef: bk.ref,
          room: bk.roomNumber || null, name: bk.lastName || bk.guestName || null,
        });
        if (res && res.error && !res.offline) {
          U.toast(t("staff.chat.confirmFailed") + ": " + res.error, "error");
        } else {
          const all = S.list("chats");
          const i = all.findIndex((x) => x.id === chat.id);
          if (i >= 0) {
            all[i] = Object.assign({}, all[i], {
              guestKind: "guest", guestVerified: true, bookingId: bk.id, bookingRef: bk.ref,
              room: bk.roomNumber || all[i].room,
              confirmedBy: session ? session.name : null,
            });
            S.write("chats", all);
          }
          if (subj.kind === "chat") U.toast(t("staff.chat.confirmed"), "success");
        }
      }
    }
    renderGuestPanel();
    if (panel === "requests") renderRequests();
    if (panel === "chat") renderChat();
  }

  /* ====================  LIVE CHAT  ==================== */
  // Per-user unread: chats assigned to the signed-in account contribute to the
  // badge/chime, so Front-Desk users don't get pinged about threads a
  // colleague is already handling.
  //
  // UNASSIGNED threads ping everyone, because they are nobody's yet and were
  // therefore nobody's problem: the widget only names an owner when a Front
  // Desk employee is on shift at that moment (GET /api/chat/available-staff
  // deliberately excludes admins), so every guest who chatted outside shift
  // hours — evenings, exactly when the hotel tested this — arrived in silence.
  // No badge, no chime, no notification, on any console.
  function myAssignedChats() {
    if (!session) return [];
    return S.list("chats").filter(
      (c) => c.escalated && (!c.assignedStaffId || c.assignedStaffId === session.id)
    );
  }
  function totalChatUnread() {
    return myAssignedChats().reduce((s, c) => s + (c.unreadForStaff || 0), 0);
  }

  /* ---- who am I talking to? ----------------------------------------------
     Every thread used to read "Guest" with no room, so there was no way to
     tell a guest in 204 from someone pricing a room. A thread now carries the
     identity the guest gave at POST /api/chat/identify, in three tiers:
       verified    — last name + room (or booking ref) matched a live booking
       unconfirmed — says they're staying but nothing matched. OTA and walk-in
                     guests land here by definition (neither reaches
                     guest_bookings), so it's a prompt to check the register
                     and hit "Confirm guest", not a reason to distrust them
       visitor     — told us up front they're only asking a question
     unknown covers threads that predate this and never identified.           */
  function chatTier(c) {
    if (c.guestKind === "guest") return c.guestVerified ? "verified" : "unconfirmed";
    if (c.guestKind === "visitor") return "visitor";
    return "unknown";
  }
  const TIER_MARK = { verified: "✅", unconfirmed: "🔶", visitor: "⚪", unknown: "•" };
  const TIER_KEY = {
    verified: "staff.chat.tier.guest",
    unconfirmed: "staff.chat.tier.unconfirmed",
    visitor: "staff.chat.tier.visitor",
    unknown: "staff.chat.tier.unknown",
  };
  function chatDisplayName(c) {
    if (chatTier(c) === "visitor") return t("staff.chat.tier.visitor");
    if (c.guestName) {
      // Prefer the physical room number the desk assigned (live booking) over
      // the self-declared one frozen at sign-in; the room type rides in the
      // identity strip below the header.
      const rb = roomBits(chatBooking(c), c.room, null);
      return c.guestName + (rb.number ? " · " + t("staff.requests.room") + " " + rb.number : "");
    }
    return t("staff.chat.tier.unknown");
  }
  function chatMatchesFilter(c) {
    if (chatFilter === "guests") return c.guestKind === "guest";
    if (chatFilter === "visitors") return c.guestKind !== "guest";
    return true;
  }

  /* The booking behind a verified thread. The console already polls every
     booking into the "guestBookings" table, so this needs no extra request —
     and it reads the RAW list rather than visibleBookings(), which hides
     non-direct channels the chat sign-in still legitimately matches. */
  function chatBooking(c) {
    if (!c || (!c.bookingId && !c.bookingRef)) return null;
    return S.list("guestBookings").find(
      (b) => (c.bookingId && b.id === c.bookingId) || (c.bookingRef && b.ref === c.bookingRef)
    ) || null;
  }

  /* The band under the conversation header: the guest's booking when we have
     one (the context the hotel asked to see next to the chat), or the prompt
     to vouch for a guest we couldn't match. Nothing at all for a visitor. */
  function chatIdentityStrip(c, tier) {
    if (tier === "visitor" || tier === "unknown") return "";

    const bits = [];
    if (tier === "verified") {
      const b = chatBooking(c);
      if (c.bookingRef) bits.push(esc(t("msg.bk.ref")) + " " + esc(c.bookingRef));
      if (b) {
        // Which of the five buildings — the same thing the requests board
        // shows, so a chat about a broken air-conditioner can be walked to
        // without looking the guest up somewhere else.
        if (b.building) bits.push(esc(t("building.n").replace("{n}", b.building)));
        // Physical room number (once the front desk has assigned it at check-in)
        // AND the room type — so a chat about a broken air-conditioner shows both
        // "Room 407" and "Deluxe", not just the type. `b.room` is the TYPE.
        if (b.roomNumber) bits.push(esc(t("staff.requests.room")) + " " + esc(b.roomNumber));
        if (b.room) bits.push(esc(b.room));
        if (b.checkIn && b.checkOut) {
          // The API hands dates back as full timestamps; formatDate wants a
          // bare YYYY-MM-DD and renders it in the reader's own language.
          bits.push(esc(U.formatDate(String(b.checkIn).slice(0, 10))) +
                    " → " + esc(U.formatDate(String(b.checkOut).slice(0, 10))));
        }
        if (b.nights) bits.push(esc(t("msg.bk.nights")) + " " + esc(b.nights));
        if (b.channelName) bits.push(esc(b.channelName));
        const stay = bookingStayStatus(b);
        if (stay) bits.push('<b class="cci-stay ' + stay + '">' + esc(t("staff.chat.stay." + stay)) + "</b>");
      }
      if (c.confirmedBy) {
        bits.push(esc(t("staff.chat.confirmedBy").replace("{name}", c.confirmedBy)));
      }
      if (!bits.length) return "";
      return '<div class="cc-conv-id verified">' + bits.join('<span class="cci-sep">·</span>') + "</div>";
    }

    // Unconfirmed: everything here came from the guest, so say so plainly and
    // give the front desk the one-tap way to vouch for them.
    return '<div class="cc-conv-id unconfirmed">' +
      '<span class="cci-note">' + esc(t("staff.chat.noBooking")) + "</span>" +
      '<button type="button" class="cc-confirm-btn" id="ccConfirm">' +
        esc(t("staff.chat.confirmGuest")) + "</button>" +
    "</div>";
  }

  /* Where a booking sits relative to today, in ICT — mirrors stayStatus() in
     backend/lib/guestLookup.js so the console and the sign-in agree. */
  function bookingStayStatus(b) {
    if (!b || !b.checkIn || !b.checkOut) return null;
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const ci = String(b.checkIn).slice(0, 10);
    const co = String(b.checkOut).slice(0, 10);
    if (today < ci) return "upcoming";
    if (today > co) return "past";
    return "in_house";
  }

  /* Front desk vouches for a guest the lookup couldn't match — an OTA or
     walk-in arrival, or one whose booking isn't in the system. Optimistic
     locally, then written server-side so every console sees it. */
  async function confirmChatGuest(c) {
    if (!confirm(t("staff.chat.confirmGuestPrompt"))) return;
    const API = window.JPark && window.JPark.api;
    if (API) {
      const res = await API.patch(
        "/api/chat/" + encodeURIComponent(c.id) + "/confirm-guest", {}
      );
      if (res && res.error) {
        U.toast(t("staff.chat.confirmFailed") + ": " + res.error, "error");
        return;
      }
    }
    const all = S.list("chats");
    const i = all.findIndex((x) => x.id === c.id);
    if (i >= 0) {
      all[i] = Object.assign({}, all[i], {
        guestVerified: true,
        confirmedBy: session ? session.name : null,
      });
      S.write("chats", all);
    }
    U.toast(t("staff.chat.confirmed"), "success");
    renderChat();
  }

  function renderChat() {
    const threadsEl = document.getElementById("chatThreads");
    const convEl = document.getElementById("chatConv");
    const allChats = S.list("chats").filter((c) => c.escalated);
    const chats = allChats.filter(chatMatchesFilter).slice().sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return b.lastAt - a.lastAt;
    });

    // Prune selectedChatIds against the current visible thread list so a
    // deleted thread doesn't keep its checkbox state.
    const visibleIds = new Set(chats.map((c) => c.id));
    selectedChatIds.forEach((id) => { if (!visibleIds.has(id)) selectedChatIds.delete(id); });
    // Drop the open conversation when the filter hides it, or the reply box
    // stays pinned to a thread that's no longer in the list.
    if (selectedThread && !visibleIds.has(selectedThread)) selectedThread = null;

    threadsEl.innerHTML = "";

    // Guests / visitors filter — the whole point of the identity step is being
    // able to look at just one group.
    if (allChats.length) {
      const filters = document.createElement("div");
      filters.className = "req-filters cc-filters";
      [
        ["all", "staff.chat.filterAll"],
        ["guests", "staff.chat.filterGuests"],
        ["visitors", "staff.chat.filterVisitors"],
      ].forEach(([key, label]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = chatFilter === key ? "active" : "";
        b.textContent = t(label);
        b.addEventListener("click", () => { chatFilter = key; renderChat(); });
        filters.appendChild(b);
      });
      threadsEl.appendChild(filters);
    }

    // Toolbar: multi-select toggle + bulk-delete (only useful when items exist).
    if (chats.length) {
      const bar = document.createElement("div");
      bar.className = "cc-threads-bar";
      const selBtn = document.createElement("button");
      selBtn.type = "button";
      selBtn.className = "cc-btn" + (chatMultiSelect ? " active" : "");
      selBtn.textContent = chatMultiSelect ? t("staff.chat.cancelSelect") : t("staff.chat.select");
      selBtn.addEventListener("click", () => {
        chatMultiSelect = !chatMultiSelect;
        if (!chatMultiSelect) selectedChatIds.clear();
        renderChat();
      });
      bar.appendChild(selBtn);
      if (chatMultiSelect) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "cc-btn cc-btn-danger";
        delBtn.disabled = !selectedChatIds.size;
        delBtn.textContent = t("staff.chat.deleteSelected") + (selectedChatIds.size ? " (" + selectedChatIds.size + ")" : "");
        delBtn.addEventListener("click", bulkDeleteChats);
        bar.appendChild(delBtn);
      }
      threadsEl.appendChild(bar);
    }

    if (!chats.length) {
      const empty = document.createElement("div");
      empty.style.padding = "18px";
      empty.className = "muted";
      empty.textContent = t("staff.chat.empty");
      threadsEl.appendChild(empty);
    } else {
      chats.forEach((c) => {
        const div = document.createElement("div");
        div.className = "cc-thread" + (selectedThread === c.id ? " active" : "") + (c.pinned ? " pinned-thread" : "");

        let inner = "";
        if (chatMultiSelect) {
          inner += '<input type="checkbox" class="cct-check"' +
            (selectedChatIds.has(c.id) ? " checked" : "") + ' aria-label="Select thread" />';
        }
        // Show which staff member owns the chat right in the list so anyone
        // browsing knows who's currently responsible — only that account's
        // unread dot lights up (it's filtered by myAssignedChats() above).
        // Unassigned threads count as everyone's (see myAssignedChats).
        const mine = !!session && (!c.assignedStaffId || c.assignedStaffId === session.id);
        const assignedLabel = c.assignedStaffName
          ? (mine ? t("staff.chat.assignedYou") : t("staff.chat.assignedTo").replace("{name}", c.assignedStaffName))
          : t("staff.chat.unassigned");
        const tier = chatTier(c);
        inner +=
          '<div class="cct-body">' +
            '<div class="cct-name">' + (c.pinned ? '<span class="cct-pinned">📌</span>' : "") + (mine && c.unreadForStaff ? '<span class="cct-unread"></span>' : "") +
              '<span class="cct-mark" title="' + esc(t(TIER_KEY[tier])) + '">' + TIER_MARK[tier] + "</span>" +
              esc(chatDisplayName(c)) + "</div>" +
            (tier === "unconfirmed"
              ? '<div class="cct-tier unconfirmed">' + esc(t("staff.chat.tier.unconfirmed")) + "</div>" : "") +
            '<div class="cct-last">' + esc(c.lastMsg || "") + "</div>" +
            '<div class="cct-assigned' + (mine ? " mine" : "") + '">' + esc(assignedLabel) + "</div>" +
            '<div class="cct-lang">' + esc((I.LANG_NAMES[c.lang] || c.lang || "")) +
              (c.escalated ? "" : " · " + esc(t("chat.bot"))) + "</div>" +
          "</div>" +
          '<div class="cct-actions">' +
            '<button type="button" class="cct-act cct-pin' + (c.pinned ? " is-pinned" : "") + '" title="' + esc(t(c.pinned ? "staff.chat.unpinThread" : "staff.chat.pinThread")) + '" aria-label="' + esc(t(c.pinned ? "staff.chat.unpinThread" : "staff.chat.pinThread")) + '">📌</button>' +
            '<button type="button" class="cct-act cct-rename" title="' + esc(t("staff.chat.rename")) + '" aria-label="' + esc(t("staff.chat.rename")) + '">✎</button>' +
            '<button type="button" class="cct-act cct-delete" title="' + esc(t("staff.chat.delete")) + '" aria-label="' + esc(t("staff.chat.delete")) + '">🗑️</button>' +
          "</div>";
        div.innerHTML = inner;

        // Per-thread action handlers — stopPropagation so they don't open the thread.
        const pinBtn = div.querySelector(".cct-pin");
        const renameBtn = div.querySelector(".cct-rename");
        const deleteBtn = div.querySelector(".cct-delete");
        if (pinBtn) pinBtn.addEventListener("click", (e) => { e.stopPropagation(); pinChatThread(c); });
        if (renameBtn) renameBtn.addEventListener("click", (e) => { e.stopPropagation(); renameChatThread(c); });
        if (deleteBtn) deleteBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteChatThread(c); });

        const checkbox = div.querySelector(".cct-check");
        if (checkbox) {
          checkbox.addEventListener("click", (e) => e.stopPropagation());
          checkbox.addEventListener("change", () => {
            if (checkbox.checked) selectedChatIds.add(c.id); else selectedChatIds.delete(c.id);
            renderChat();
          });
        }

        div.addEventListener("click", () => {
          if (chatMultiSelect) {
            if (selectedChatIds.has(c.id)) selectedChatIds.delete(c.id); else selectedChatIds.add(c.id);
            renderChat();
            return;
          }
          lastSeenChatMsg[c.id] = c.lastMsg;
          selectedThread = c.id; markThreadRead(c.id);
          _loadThreadMessages(c.id).then(() => renderChat());
        });
        threadsEl.appendChild(div);
      });
    }

    const conv = chats.find((c) => c.id === selectedThread);
    if (!conv) {
      convEl.innerHTML = '<div class="cc-conv-empty">' + esc(t("staff.chat.none")) + "</div>";
      return;
    }
    // Only the assigned account can reply. Anyone else sees a read-only
    // banner with "Take over chat" so they can grab the thread when the
    // assignee is on break / off shift.
    //
    // A thread with NO owner is answerable by anyone, and answering it claims
    // it. It used to show the same read-only banner as a colleague's thread,
    // which meant every guest who chatted outside Front Desk shift hours (the
    // widget can only name an owner who is on shift) hit a console where the
    // reply box was hidden behind a "take over from Guest?" confirmation.
    const mineConv = !!session && (!conv.assignedStaffId || conv.assignedStaffId === session.id);
    const ownerLabel = conv.assignedStaffName
      ? (mineConv ? t("staff.chat.assignedYou") : t("staff.chat.assignedTo").replace("{name}", conv.assignedStaffName))
      : t("staff.chat.unassigned");
    const convTier = chatTier(conv);
    // "Guest's language" must name the language the GUEST writes in — the last
    // message FROM them, not the last message overall (which flips to the
    // staff's language the moment they reply, mislabelling the thread). The
    // declared language is only a first guess; it's refined below to the
    // DETECTED language of that message, since a guest can leave the site in
    // one language and type in another (a Japanese question on the Thai site
    // was showing up labelled "Thai").
    const lastGuestMsg = (conv.messages || []).filter((m) => m.from === "guest").slice(-1)[0];
    const guestLangGuess = (lastGuestMsg && lastGuestMsg.lang) || conv.lang || "";
    let html =
      '<div class="cc-conv-head">' +
        // The name is a button: same slide-over the Guest Requests board opens,
        // so "who am I talking to, and what's their booking" is one click from
        // either surface.
        '<button type="button" class="cch-name cch-name-btn" title="' + esc(t("staff.guest.openHint")) + '">' +
        '<span class="cch-mark" title="' + esc(t(TIER_KEY[convTier])) + '">' + TIER_MARK[convTier] + "</span>" +
        esc(chatDisplayName(conv)) + "</button>" +
        '<span class="cch-owner' + (mineConv ? " mine" : "") + '">' + esc(ownerLabel) + "</span>" +
        '<span class="cch-lang">' + esc(t("staff.chat.guestLang")) + ": " + esc(I.LANG_NAMES[guestLangGuess] || guestLangGuess || "") + "</span></div>" +
      chatIdentityStrip(conv, convTier) +
      '<div class="cc-conv-body" id="ccBody"></div>';
    if (mineConv) {
      html +=
        '<form class="cc-conv-input" id="ccForm"><input type="text" id="ccInput" placeholder="' + esc(t("staff.chat.placeholder")) + '" autocomplete="off" />' +
          '<button type="submit">' + esc(t("common.send")) + "</button></form>";
    } else {
      html +=
        '<div class="cc-conv-takeover">' +
          '<span class="cct-readonly">' + esc(t("staff.chat.readOnly")) + "</span>" +
          '<button type="button" class="cc-takeover-btn" id="ccTakeover">' + esc(t("staff.chat.takeOver")) + "</button>" +
        "</div>";
    }
    convEl.innerHTML = html;

    const bodyEl = document.getElementById("ccBody");
    const cur = I.getLang();

    // Refine the "Guest's language" label to the DETECTED language of the
    // guest's last message (the declared one can be wrong — see above). The
    // translation is the same one the message bubble requests, so this
    // resolves from cache and costs nothing extra.
    if (lastGuestMsg && lastGuestMsg.text) {
      J.translate.text(lastGuestMsg.text, cur).then((res) => {
        if (!res || !res.src) return;
        const langEl = convEl.querySelector(".cch-lang");
        if (!langEl || convEl.dataset.thread !== conv.id) return; // thread switched away
        langEl.textContent = t("staff.chat.guestLang") + ": " +
          (I.LANG_NAMES[res.src] || J.translate.langName(res.src) || res.src);
      });
    }
    convEl.dataset.thread = conv.id;
    conv.messages.forEach((m) => {
      const div = document.createElement("div");
      div.className = "msg " + m.from + (m.pinned ? " pinned" : "");
      if (m.from === "system") {
        div.textContent = m.text;
      } else {
        const label = m.from === "guest" ? (conv.guestName || t(TIER_KEY[convTier]))
                    : m.from === "staff" ? (m.staffName || t("chat.staff"))
                    : m.from === "bot"   ? t("chat.bot")
                    : t("chat.staff");
        div.innerHTML = '<span class="msg-from">' + esc(label) + "</span>";
        const span = document.createElement("span"); div.appendChild(span);
        // The "translated from X" note resolves asynchronously — give it a
        // host above the timestamp so it can't land below it.
        const noteHost = document.createElement("span");
        noteHost.className = "msg-notes";
        div.appendChild(noteHost);
        // Script-aware: translate a message that isn't really in the viewer's
        // language even if it claims to be (see translate.js needsTranslation).
        if (J.translate.needsTranslation(m.text, m.lang, cur)) J.translate.fill(span, m.text, noteHost);
        else span.textContent = m.text;
      }
      // Every message carries the time it was sent. Without it the front desk
      // couldn't tell a question asked a minute ago from one left overnight.
      if (m.ts) {
        const time = document.createElement("time");
        time.className = "msg-time";
        time.dateTime = new Date(m.ts).toISOString();
        time.textContent = U.messageTime(m.ts);
        div.appendChild(time);
      }
      // Pin toggle is available on every persisted message (skip ephemeral
      // ids that never made it to the server — they don't have a numeric id).
      if (typeof m.id === "number" || (typeof m.id === "string" && /^\d+$/.test(m.id))) {
        const pinBtn = document.createElement("button");
        pinBtn.type = "button";
        pinBtn.className = "msg-pin" + (m.pinned ? " is-pinned" : "");
        pinBtn.title = t(m.pinned ? "staff.chat.unpin" : "staff.chat.pin");
        pinBtn.setAttribute("aria-label", pinBtn.title);
        pinBtn.textContent = "📌";
        pinBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          togglePinMessage(conv.id, m.id, !m.pinned);
        });
        div.appendChild(pinBtn);
      }
      bodyEl.appendChild(div);
    });
    U.pinToBottom(bodyEl);

    const ccForm = document.getElementById("ccForm");
    if (ccForm) {
      ccForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const inp = document.getElementById("ccInput");
        const text = inp.value.trim();
        if (!text) return;
        staffReply(conv.id, text);
        inp.value = "";
      });
    }
    const takeBtn = document.getElementById("ccTakeover");
    if (takeBtn) takeBtn.addEventListener("click", () => takeOverChat(conv));
    const confirmBtn = document.getElementById("ccConfirm");
    if (confirmBtn) confirmBtn.addEventListener("click", () => confirmChatGuest(conv));
    const nameBtn = convEl.querySelector(".cch-name-btn");
    if (nameBtn) nameBtn.addEventListener("click", () => openGuestPanel({ chat: conv }));
  }

  // Tell the server we've read this thread up to now (chat_reads). Without a
  // durable marker, unread was recomputed from "messages since our last reply"
  // on every poll, so reading zeroed the badge locally and the next poll lit it
  // right back up — the "I read it and it won't go away" report. Fire-and-forget.
  function stampChatRead(id) {
    const API = window.JPark && window.JPark.api;
    if (API && id) API.post("/api/chat/" + encodeURIComponent(id) + "/read", {}).catch(function () {});
  }

  function markThreadRead(id) {
    const all = S.list("chats");
    const i = all.findIndex((c) => c.id === id);
    if (i >= 0 && all[i].unreadForStaff) { all[i].unreadForStaff = 0; S.write("chats", all); }
    stampChatRead(id);
  }

  // Replies are sent one at a time. Fired concurrently, two messages typed a
  // few seconds apart can reach the database in either order — which is how a
  // "สวัสดีค่ะ" ends up sitting between two questions that were asked after
  // it, in the guest's transcript as well as ours.
  let chatSendChain = Promise.resolve();

  function staffReply(id, text) {
    const all = S.list("chats");
    const i = all.findIndex((c) => c.id === id);
    if (i < 0) return;
    const c = all[i];
    // Only the assigned account is allowed to type into this thread. If the
    // current user isn't the owner, send them down the take-over path first.
    // An unowned thread is fair game, and replying to it takes ownership.
    if (c.assignedStaffId && c.assignedStaffId !== session.id) {
      U.toast(t("staff.chat.notAssigned"), "error");
      return;
    }
    c.escalated = true;
    c.assignedStaffId = session.id;
    c.assignedStaffName = session.name;
    c.messages.push({ id: S.genId(), from: "staff", text: text, staffName: session.name, ts: Date.now() });
    c.lastMsg = text; c.lastAt = Date.now();
    c.unreadForStaff = 0;
    c.unreadForGuest = (c.unreadForGuest || 0) + 1;
    all[i] = c;
    S.write("chats", all);
    // Persist reply to backend
    const API = window.JPark && window.JPark.api;
    if (API) {
      chatSendChain = chatSendChain.then(function () {
        return API.post("/api/chat", {
          guestId: id, guestName: c.guestName, room: c.room,
          from: "staff", fromName: session.name, text: text,
          lang: I.getLang(), escalated: true,
          assignedStaffId: session.id, assignedStaffName: session.name,
        });
      }).catch(function () {});
    }
  }

  /* Reassign a guest chat to the signed-in user (e.g. when the original
     owner is on break). Posts a system message so the guest knows who's
     replying now, then refreshes the thread. */
  async function takeOverChat(conv) {
    if (!conv || !session) return;
    if (conv.assignedStaffId === session.id) return;
    if (!confirm(t("staff.chat.takeOverConfirm").replace("{name}", conv.guestName || "Guest"))) return;
    const API = window.JPark && window.JPark.api;
    if (API) {
      const systemText = t("chat.connectedTo").replace("{name}", session.name.trim().split(/\s+/)[0]);
      const res = await API.patch("/api/chat/" + encodeURIComponent(conv.id) + "/assign", {
        staffId: session.id, staffName: session.name,
        systemText, lang: I.getLang(),
      });
      if (res && res.error && !res.offline) {
        U.toast(t("staff.chat.takeOverFailed") + ": " + res.error, "error");
        return;
      }
    }
    const all = S.list("chats");
    const i = all.findIndex((c) => c.id === conv.id);
    if (i >= 0) {
      all[i] = Object.assign({}, all[i], {
        assignedStaffId: session.id, assignedStaffName: session.name,
      });
      S.write("chats", all);
    }
    U.toast(t("staff.chat.takenOver"), "success");
    await _loadThreadMessages(conv.id);
    renderChat();
  }

  /* Toggle the pin flag on a single chat message. Optimistically updates the
     local cache so the icon flips immediately, then writes the change to the
     server. The next poll tick re-reads the canonical state. */
  async function togglePinMessage(guestId, msgId, pinned) {
    const all = S.list("chats");
    const i = all.findIndex((c) => c.id === guestId);
    if (i < 0) return;
    const msgs = all[i].messages || [];
    const j = msgs.findIndex((m) => String(m.id) === String(msgId));
    if (j < 0) return;
    msgs[j] = Object.assign({}, msgs[j], { pinned });
    all[i] = Object.assign({}, all[i], { messages: msgs });
    S.write("chats", all);
    if (selectedThread === guestId) renderChat();
    const API = window.JPark && window.JPark.api;
    if (API) {
      const res = await API.patch("/api/chat/message/" + encodeURIComponent(msgId) + "/pin", { pinned });
      if (res && res.error && !res.offline) {
        U.toast(t("staff.chat.pinFailed") + ": " + res.error, "error");
      }
    }
  }

  /* Toggle the pinned flag on a chat thread. Pinned threads float to the top
     of the list. State is local-only — no server call needed. */
  function pinChatThread(c) {
    const all = S.list("chats");
    const i = all.findIndex((x) => x.id === c.id);
    if (i < 0) return;
    all[i] = Object.assign({}, all[i], { pinned: !c.pinned });
    S.write("chats", all);
    renderChat();
  }

  /* Remove a single guest chat thread, locally + on the server. */
  async function deleteChatThread(c) {
    if (!c || !c.id) return;
    if (!confirm(t("staff.chat.confirmDelete").replace("{name}", c.guestName || "Guest"))) return;
    const API = window.JPark && window.JPark.api;
    if (API) {
      const res = await API.del("/api/chat/" + encodeURIComponent(c.id));
      if (res && res.error && !res.offline) {
        U.toast(t("staff.chat.deleteFailed") + ": " + res.error, "error");
        return;
      }
    }
    S.write("chats", S.list("chats").filter((x) => x.id !== c.id));
    selectedChatIds.delete(c.id);
    if (selectedThread === c.id) selectedThread = null;
    U.toast(t("staff.chat.deleted"), "success");
    renderChat();
  }

  /* Rename a guest chat thread. Stamps the new name on every server-side
     message so the next poll picks it up too. */
  async function renameChatThread(c) {
    if (!c || !c.id) return;
    const next = prompt(t("staff.chat.renamePrompt"), c.guestName || "");
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === (c.guestName || "")) return;
    const API = window.JPark && window.JPark.api;
    if (API) {
      const res = await API.patch("/api/chat/" + encodeURIComponent(c.id) + "/rename", { name: trimmed });
      if (res && res.error && !res.offline) {
        U.toast(t("staff.chat.renameFailed") + ": " + res.error, "error");
        return;
      }
    }
    const all = S.list("chats");
    const i = all.findIndex((x) => x.id === c.id);
    if (i >= 0) { all[i] = Object.assign({}, all[i], { guestName: trimmed }); S.write("chats", all); }
    U.toast(t("staff.chat.renamed"), "success");
    renderChat();
  }

  async function bulkDeleteChats() {
    if (!selectedChatIds.size) return;
    const ids = Array.from(selectedChatIds);
    if (!confirm(t("staff.chat.confirmBulkDelete").replace("{n}", ids.length))) return;
    const API = window.JPark && window.JPark.api;
    if (API) {
      const res = await API.post("/api/chat/bulk-delete", { guestIds: ids });
      if (res && res.error && !res.offline) {
        U.toast(t("staff.chat.deleteFailed") + ": " + res.error, "error");
        return;
      }
    }
    const drop = new Set(ids);
    S.write("chats", S.list("chats").filter((x) => !drop.has(x.id)));
    if (selectedThread && drop.has(selectedThread)) selectedThread = null;
    selectedChatIds.clear();
    chatMultiSelect = false;
    U.toast(t("staff.chat.bulkDeleted").replace("{n}", ids.length), "success");
    renderChat();
  }

  /* ====================  PROFILE PICTURE  ==================== */
  function getAvatarDataUrl(userId) {
    return S.read("avatar_" + userId, null);
  }
  // Writes to local cache first for instant feedback, then syncs to the
  // server so every other device / teammate sees it. Returns the API result
  // (or null on local-only write) so callers can show errors.
  async function setAvatarDataUrl(userId, dataUrl) {
    S.write("avatar_" + userId, dataUrl);
    if (!session || userId !== session.id) return null;
    const API = window.JPark && window.JPark.api;
    if (!API) return null;
    const res = await API.post("/api/auth/avatar", { avatar: dataUrl });
    if (res && !res.error && res.avatar_updated_at) {
      S.write("avatar_v_" + userId, res.avatar_updated_at);
    }
    return res;
  }
  function renderAvatarInSidebar() {
    const el = document.getElementById("dsAvatar");
    if (!el || !session) return;
    const dataUrl = getAvatarDataUrl(session.id);
    if (dataUrl) {
      el.innerHTML = '<img src="' + esc(dataUrl) + '" alt="Profile photo" />';
    } else {
      el.textContent = (session.name || "?").charAt(0).toUpperCase();
    }
  }
  function makeAvatarHtml(name, userId) {
    const dataUrl = getAvatarDataUrl(userId);
    if (dataUrl) return '<img src="' + esc(dataUrl) + '" alt="' + esc(name) + '" />';
    return "<span>" + esc((name || "?").charAt(0).toUpperCase()) + "</span>";
  }

  /* ====================  MESSAGES  ==================== */
  function getAllMsgs() { return S.list("messages"); }
  function getActiveMsgs() {
    if (!session) return [];
    return S.list("messages").filter(function(m) {
      return !(m.trashedBy && m.trashedBy.includes(session.id));
    });
  }
  function getInboxMsgs() {
    return getActiveMsgs().filter((m) =>
      m.fromId !== session.id &&
      Array.isArray(m.to) && m.to.includes(session.id)
    ).sort((a, b) => b.createdAt - a.createdAt);
  }
  function getSentMsgs() {
    return getActiveMsgs().filter((m) => m.fromId === session.id)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  function getAnnouncementMsgs() {
    return getActiveMsgs().filter((m) => m.to === "all")
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  function isUnread(m) {
    return !m.readBy || !m.readBy.includes(session.id);
  }

  /* Guest bookings forwarded in from OTA channels (Agoda, Booking.com…).
     Every staff member and admin sees the same inbox; "read" is tracked
     per user via readBy, exactly like internal messages. */

  // Direct-only Guest Booking inbox ----------------------------------------
  // The client asked that only Direct (Website) bookings appear in Guest
  // Booking; OTA reservations (Agoda, Booking.com, Airbnb, Trip.com, Expedia,
  // Traveloka, Hotels.com, "other"…) are hidden from every staff-facing view.
  // Nothing about OTA routing is removed: the email bridge, parser, ingest
  // API and stored rows are all left intact, so the bookings still arrive and
  // persist in the background. Flip SHOW_OTA_BOOKINGS back to true to restore
  // the combined OTA+Direct inbox exactly as before.
  //
  // We match on channel_name, not channel: the backend's normChannel() folds
  // any unrecognized OTA (Traveloka, Hotels.com, generic "other", or a parse
  // miss) down to channel "direct", so channel alone would leak those OTA
  // rows into this view. Only genuine website bookings — inserted by
  // payments.js — carry channel_name "Direct (Website)".
  const SHOW_OTA_BOOKINGS = false;
  const DIRECT_CHANNEL_NAME = "Direct (Website)";
  function isDirectBooking(b) {
    return !!b && b.channelName === DIRECT_CHANNEL_NAME;
  }
  function visibleBookings(list) {
    return list.filter((b) => SHOW_OTA_BOOKINGS || isDirectBooking(b));
  }

  function getBookingMsgs() {
    return visibleBookings(S.list("guestBookings")).sort((a, b) => b.createdAt - a.createdAt);
  }
  function isBookingUnread(b) {
    return !b.readBy || !session || !b.readBy.includes(session.id);
  }
  function getBookingUnreadCount() {
    return getBookingMsgs().filter(isBookingUnread).length;
  }
  function markBookingRead(id) {
    const all = S.list("guestBookings");
    const i = all.findIndex((b) => b.id === id);
    if (i < 0) return;
    const readBy = all[i].readBy ? all[i].readBy.slice() : [];
    if (!readBy.includes(session.id)) {
      readBy.push(session.id);
      all[i] = Object.assign({}, all[i], { readBy });
      S.write("guestBookings", all);
    }
    // Sync to backend
    const API = window.JPark && window.JPark.api;
    if (API) API.patch("/api/guest-bookings/" + id, { userId: session.id }).catch(function () {});
  }

  /* Password / username reset requests filed from the login page. Admin-only. */
  function getResetRequests() {
    return S.list("resetRequests").slice().sort((a, b) => b.createdAt - a.createdAt);
  }
  function getResetUnreadCount() {
    if (!isAdmin()) return 0;
    return getResetRequests().filter((r) => !r.handled).length;
  }

  function getMsgUnreadCount() {
    const inboxUnread = getInboxMsgs().filter(isUnread).length;
    const annUnread = getAnnouncementMsgs().filter((m) => m.fromId !== session.id && isUnread(m)).length;
    const bookingUnread = getBookingUnreadCount();
    const resetUnread = getResetUnreadCount();
    return { inboxUnread, annUnread, bookingUnread, resetUnread, total: inboxUnread + annUnread + bookingUnread + resetUnread };
  }
  function markMsgRead(id) {
    const all = getAllMsgs();
    const i = all.findIndex((m) => m.id === id);
    if (i < 0) return;
    const readBy = all[i].readBy ? all[i].readBy.slice() : [];
    if (!readBy.includes(session.id)) {
      readBy.push(session.id);
      all[i] = Object.assign({}, all[i], { readBy });
      S.write("messages", all);
    }
    // Propagate to server so other devices the same user is signed in on,
    // and the sender's "read by" view, stay in sync.
    if (typeof id === "string" && id.indexOf("srv_") === 0) {
      const API = window.JPark && window.JPark.api;
      if (API) API.patch("/api/messages/" + id.slice(4) + "/read", {}).catch(function () {});
    }
  }
  function getTrashedMsgs() {
    if (!session) return [];
    return S.list("messages").filter(function(m) {
      return m.trashedBy && m.trashedBy.includes(session.id);
    }).sort(function(a, b) {
      var atA = (a.trashedAt || {})[session.id] || 0;
      var atB = (b.trashedAt || {})[session.id] || 0;
      return atB - atA;
    });
  }
  function trashMsg(id) {
    var all = S.list("messages");
    var i = all.findIndex(function(m) { return m.id === id; });
    if (i < 0) return;
    var trashedBy = (all[i].trashedBy || []).filter(function(x) { return x !== session.id; });
    trashedBy.push(session.id);
    var trashedAt = Object.assign({}, all[i].trashedAt || {});
    trashedAt[session.id] = Date.now();
    all[i] = Object.assign({}, all[i], { trashedBy: trashedBy, trashedAt: trashedAt });
    S.write("messages", all);
  }
  function restoreMsg(id) {
    var all = S.list("messages");
    var i = all.findIndex(function(m) { return m.id === id; });
    if (i < 0) return;
    var trashedBy = (all[i].trashedBy || []).filter(function(uid) { return uid !== session.id; });
    var trashedAt = Object.assign({}, all[i].trashedAt || {});
    delete trashedAt[session.id];
    all[i] = Object.assign({}, all[i], { trashedBy: trashedBy, trashedAt: trashedAt });
    S.write("messages", all);
  }
  function purgeExpiredTrash() {
    var THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    var now = Date.now();
    var all = S.list("messages");
    var changed = false;
    var result = all.reduce(function(acc, m) {
      if (!m.trashedBy || !m.trashedBy.length) { acc.push(m); return acc; }
      var trashedAt = m.trashedAt || {};
      var freshBy = m.trashedBy.filter(function(uid) { return now - (trashedAt[uid] || 0) < THIRTY_DAYS; });
      if (freshBy.length === 0) {
        // Auto-purge after 30 days — same as "Delete forever" so it doesn't
        // come back on the next server poll.
        permaForgetMsg(m.id);
        changed = true;
        return acc;
      }
      if (freshBy.length < m.trashedBy.length) {
        var freshAt = {};
        freshBy.forEach(function(uid) { freshAt[uid] = trashedAt[uid]; });
        acc.push(Object.assign({}, m, { trashedBy: freshBy, trashedAt: freshAt }));
        changed = true;
      } else {
        acc.push(m);
      }
      return acc;
    }, []);
    if (changed) S.write("messages", result);
  }
  function formatMsgTime(ts) {
    const now = new Date();
    const d = new Date(ts);
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    const days = Math.floor((now - d) / 86400000);
    if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  /* Silently translate `original` into the current UI language and drop it
     into `el` (no "translated from" note — used for compact list rows). */
  function maybeTranslateInto(el, original, srcLang) {
    if (!el || !original || !original.trim()) return;
    const cur = I.getLang();
    if (srcLang && srcLang === cur) return;
    J.translate.text(original, cur).then((res) => {
      if (!el.isConnected) return;
      if (res.src && res.src !== cur && res.text && res.text !== original) {
        el.textContent = res.text;
      }
    });
  }

  function setNavBadge(id, n) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = n || "";
    el.style.display = n ? "" : "none";
  }

  function renderMessages() {
    if (!trashPurgedThisSession) { purgeExpiredTrash(); trashPurgedThisSession = true; }
    const counts = getMsgUnreadCount();
    setNavBadge("msgInboxBadge", counts.inboxUnread);
    setNavBadge("msgAnnBadge", counts.annUnread);
    setNavBadge("msgBookingBadge", counts.bookingUnread);
    setNavBadge("msgResetBadge", counts.resetUnread);
    const { msgs: sm, bookings: sb } = getStarredMsgs();
    setNavBadge("msgStarredBadge", sm.length + sb.length);

    // While viewing a detail, keep the list it came from highlighted.
    const activeView = msgView === "detail" ? msgPrevView : msgView;
    document.querySelectorAll("#msgSidebar .msg-nav-item").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === activeView);
    });
    const listArea = document.getElementById("msgListArea");
    const detailArea = document.getElementById("msgDetail");
    if (msgView === "detail" && msgDetailId) {
      listArea.classList.add("hidden");
      detailArea.classList.add("show");
      // Every poll (guestBookings, messages, resetRequests — see startApiPolling())
      // fires S.write() unconditionally on each tick regardless of whether
      // the data actually changed, which routes through here. Rebuilding
      // the booking detail pane while a "Resend confirmation" edit is open
      // (bkResendEditingId) would wipe out the open editor and whatever the
      // staff member had typed — skip just that rebuild, not the badge/nav
      // updates above, which are harmless.
      if (msgDetailKind === "booking") {
        const editingThis = bkResendEditingId != null && bkResendEditingId === msgDetailId;
        const logOpenThis = bkEmailLogOpenId != null && bkEmailLogOpenId === msgDetailId;
        if (!editingThis && !logOpenThis) renderBookingDetail(msgDetailId);
      }
      else renderMsgDetail(msgDetailId);
    } else {
      listArea.classList.remove("hidden");
      detailArea.classList.remove("show");
      detailArea.innerHTML = "";
      renderMsgList();
    }
  }

  const MSG_VIEW_META = {
    inbox:         { ico: "📥", header: "msg.inbox",         emptySub: "msg.empty.inbox" },
    bookings:      { ico: "🛎️", header: "msg.bookings",      emptySub: "msg.empty.bookings" },
    sent:          { ico: "📤", header: "msg.sent",          emptySub: "msg.empty.sent" },
    announcements: { ico: "📢", header: "msg.announcements", emptySub: "msg.empty.ann" },
    starred:       { ico: "⭐", header: "msg.starred",       emptySub: "msg.empty.starred" },
    trash:         { ico: "🗑️", header: "msg.trash",         emptySub: "msg.empty.trash" }
  };

  function getStarredMsgs() {
    const msgs = getActiveMsgs().filter((m) => m.starred).sort((a, b) => b.createdAt - a.createdAt);
    const bookings = visibleBookings(S.list("guestBookings")).filter((b) => b.starred).sort((a, b) => b.createdAt - a.createdAt);
    return { msgs, bookings };
  }

  function renderStarredList() {
    const listArea = document.getElementById("msgListArea");
    const { msgs, bookings } = getStarredMsgs();
    const total = msgs.length + bookings.length;
    const countLabel = total ? '<span class="mlh-count">' + total + "</span>" : "";
    listArea.innerHTML = '<div class="msg-list-header">' + esc(t("msg.starred")) + countLabel + "</div>";

    if (!total) {
      listArea.innerHTML +=
        '<div class="msg-empty"><div class="me-ico">⭐</div>' +
        '<div class="me-title">' + esc(t("msg.empty.title")) + "</div>" +
        '<div class="me-sub">' + esc(t("msg.empty.starred")) + "</div></div>";
      return;
    }

    const combined = [
      ...msgs.map((m) => ({ item: m, kind: "message" })),
      ...bookings.map((b) => ({ item: b, kind: "booking" }))
    ].sort((a, b) => b.item.createdAt - a.item.createdAt);

    combined.forEach(({ item: m, kind }) => {
      const row = document.createElement("div");
      if (kind === "booking") {
        const unread = isBookingUnread(m);
        row.className = "msg-row booking channel-" + m.channel + (unread ? " unread" : " read");
        row.innerHTML =
          '<div class="mr-avatar bk-avatar"><span>' + esc((m.channelName || "?").charAt(0).toUpperCase()) + "</span></div>" +
          '<div class="mr-sender">' + esc(m.channelName) + "</div>" +
          '<div class="mr-subject-preview"><span class="mr-subject">' + esc(m.guestName) + "</span>" +
          '<span class="mr-sep">—</span><span class="mr-preview">' + esc((m.room ? m.room + " · " : "") + bookingDateRange(m) + " · " + m.ref) + "</span></div>" +
          '<div class="mr-time">' + esc(formatMsgTime(m.createdAt)) + "</div>";
        row.addEventListener("click", () => {
          msgPrevView = "starred"; msgDetailId = m.id; msgDetailKind = "booking";
          msgView = "detail"; markBookingRead(m.id); renderMessages();
        });
      } else {
        const isSent = m.fromId === session.id;
        const unread = !isSent && isUnread(m);
        const displayName = isSent
          ? (m.to === "all" ? t("staff.compose.everyone") : (Array.isArray(m.toNames) ? m.toNames.join(", ") : (m.toNames || "—")))
          : m.fromName;
        row.className = "msg-row" + (unread ? " unread" : " read") + (m.to === "all" ? " announcement" : "");
        row.innerHTML =
          '<div class="mr-avatar">' + makeAvatarHtml(displayName, isSent ? session.id : m.fromId) + "</div>" +
          '<div class="mr-sender">' + esc(displayName) + "</div>" +
          '<div class="mr-subject-preview"><span class="mr-subject">' + esc(m.subject || "(no subject)") + "</span>" +
          '<span class="mr-sep">—</span><span class="mr-preview">' + esc((m.body || "").replace(/\n/g, " ").slice(0, 100)) + "</span></div>" +
          '<div class="mr-time">' + esc(formatMsgTime(m.createdAt)) + "</div>";
        row.addEventListener("click", () => {
          msgPrevView = "starred"; msgDetailId = m.id; msgDetailKind = "message";
          msgView = "detail"; markMsgRead(m.id); renderMessages();
        });
      }
      listArea.appendChild(row);
    });
  }

  function renderMsgList() {
    if (msgView === "bookings") { renderBookingList(); return; }
    if (msgView === "payments") { loadPaymentsLedger(false); renderPaymentsLedger(); return; }
    if (msgView === "resets") { renderResetList(); return; }
    if (msgView === "starred") { renderStarredList(); return; }
    if (msgView === "trash") { renderTrashList(); return; }

    const listArea = document.getElementById("msgListArea");
    const meta = MSG_VIEW_META[msgView] || MSG_VIEW_META.inbox;
    let msgs = [];
    if (msgView === "inbox") msgs = getInboxMsgs();
    else if (msgView === "sent") msgs = getSentMsgs();
    else if (msgView === "announcements") msgs = getAnnouncementMsgs();

    // Keep only IDs still in this list when in multi-select mode
    if (msgMultiSelect) {
      const currentIds = new Set(msgs.map((m) => m.id));
      selectedMsgIds = new Set([...selectedMsgIds].filter((id) => currentIds.has(id)));
    }

    const countLabel = msgs.length ? '<span class="mlh-count">' + msgs.length + "</span>" : "";
    const selectBtnHtml = msgs.length
      ? (msgMultiSelect
        ? '<button class="mlh-select-btn active" id="msgSelectToggle">✕ ' + esc(t("msg.deselect.all")) + "</button>"
        : '<button class="mlh-select-btn" id="msgSelectToggle">' + esc(t("msg.select")) + "</button>")
      : "";
    listArea.innerHTML = '<div class="msg-list-header">' + esc(t(meta.header)) + countLabel + selectBtnHtml + "</div>";

    // Bulk action bar
    if (msgMultiSelect && msgs.length) {
      const n = selectedMsgIds.size;
      const allSelected = n === msgs.length;
      const bulkBar = document.createElement("div");
      bulkBar.className = "msg-bulk-bar";
      bulkBar.innerHTML =
        '<span class="mbb-count">' + n + " " + esc(t("msg.select")) + "ed</span>" +
        '<button class="mbb-btn" id="mbbSelectAll">' + esc(t(allSelected ? "msg.deselect.all" : "msg.select.all")) + "</button>" +
        '<button class="mbb-btn mbb-delete" id="mbbDelete"' + (n === 0 ? " disabled" : "") + ">🗑 " + esc(t("msg.bulk.delete")) + "</button>" +
        '<button class="mbb-btn mbb-star" id="mbbStar"' + (n === 0 ? " disabled" : "") + ">☆ " + esc(t("msg.bulk.star")) + "</button>" +
        '<button class="mbb-btn mbb-report" id="mbbReport"' + (n === 0 ? " disabled" : "") + ">⚑ " + esc(t("msg.bulk.report")) + "</button>";
      listArea.appendChild(bulkBar);
    }

    if (!msgs.length) {
      listArea.innerHTML +=
        '<div class="msg-empty">' +
        '<div class="me-ico">' + meta.ico + "</div>" +
        '<div class="me-title">' + esc(t("msg.empty.title")) + "</div>" +
        '<div class="me-sub">' + esc(t(meta.emptySub)) + "</div>" +
        "</div>";
    } else {
      msgs.forEach((m) => {
        const isSent = msgView === "sent";
        const isAnn = m.to === "all";
        const unread = !isSent && isUnread(m);
        const displayName = isSent
          ? (isAnn ? t("staff.compose.everyone") : (Array.isArray(m.toNames) ? m.toNames.join(", ") : (m.toNames || "—")))
          : m.fromName;
        const avatarUserId = isSent ? session.id : m.fromId;
        const isSelected = selectedMsgIds.has(m.id);

        const row = document.createElement("div");
        const isReported = isAdmin() && Array.isArray(m.reportedBy) && m.reportedBy.length > 0;
        row.className = "msg-row" + (unread ? " unread" : " read") + (isAnn ? " announcement" : "") +
          (isReported ? " reported" : "") + (isSelected ? " selected" : "") + (msgMultiSelect ? " selectable" : "");
        row.dataset.id = m.id;

        const firstCol = msgMultiSelect
          ? '<div class="mr-check"><input type="checkbox" class="mr-checkbox" tabindex="-1"' + (isSelected ? " checked" : "") + "></div>"
          : '<div class="mr-avatar">' + makeAvatarHtml(displayName, avatarUserId) + "</div>";

        row.innerHTML =
          firstCol +
          '<div class="mr-sender">' + esc(displayName) + "</div>" +
          '<div class="mr-subject-preview">' +
            '<span class="mr-subject">' + esc(m.subject || "(no subject)") + "</span>" +
            '<span class="mr-sep">—</span>' +
            '<span class="mr-preview">' + esc((m.body || "").replace(/\n/g, " ").slice(0, 100)) + "</span>" +
          "</div>" +
          '<div class="mr-time">' + (isReported ? '<span class="mr-flag" title="Reported">⚑ </span>' : "") + esc(formatMsgTime(m.createdAt)) + "</div>";

        if (!msgMultiSelect) {
          maybeTranslateInto(row.querySelector(".mr-subject"), m.subject || "", m.lang);
          maybeTranslateInto(row.querySelector(".mr-preview"), (m.body || "").replace(/\n/g, " ").slice(0, 100), m.lang);
        }

        row.addEventListener("click", () => {
          if (msgMultiSelect) {
            if (selectedMsgIds.has(m.id)) selectedMsgIds.delete(m.id);
            else selectedMsgIds.add(m.id);
            renderMessages();
            return;
          }
          msgPrevView = msgView;
          msgDetailId = m.id;
          msgDetailKind = "message";
          msgView = "detail";
          markMsgRead(m.id);
          renderMessages();
        });
        listArea.appendChild(row);
      });
    }

    // Wire up select-toggle and bulk-bar buttons
    const selectToggle = document.getElementById("msgSelectToggle");
    if (selectToggle) {
      selectToggle.addEventListener("click", () => {
        msgMultiSelect = !msgMultiSelect;
        if (!msgMultiSelect) selectedMsgIds.clear();
        renderMessages();
      });
    }
    if (msgMultiSelect) {
      const mbbSelectAll = document.getElementById("mbbSelectAll");
      if (mbbSelectAll) {
        mbbSelectAll.addEventListener("click", () => {
          if (selectedMsgIds.size === msgs.length) selectedMsgIds.clear();
          else msgs.forEach((m) => selectedMsgIds.add(m.id));
          renderMessages();
        });
      }
      const mbbDelete = document.getElementById("mbbDelete");
      if (mbbDelete) {
        mbbDelete.addEventListener("click", () => {
          if (!selectedMsgIds.size) return;
          if (!confirm(t("msg.delete.confirm"))) return;
          selectedMsgIds.forEach((id) => trashMsg(id));
          selectedMsgIds.clear();
          msgMultiSelect = false;
          renderMessages();
        });
      }
      const mbbStar = document.getElementById("mbbStar");
      if (mbbStar) {
        mbbStar.addEventListener("click", () => {
          if (!selectedMsgIds.size) return;
          selectedMsgIds.forEach((id) => toggleStar(id, "message"));
          renderMessages();
        });
      }
      const mbbReport = document.getElementById("mbbReport");
      if (mbbReport) {
        mbbReport.addEventListener("click", () => {
          if (!selectedMsgIds.size) return;
          if (!confirm(t("msg.report.confirm"))) return;
          const all = S.list("messages");
          const API = window.JPark && window.JPark.api;
          selectedMsgIds.forEach((id) => {
            const i = all.findIndex((x) => x.id === id);
            if (i < 0 || all[i].fromId === session.id) return;
            const already = (all[i].reportedBy || []).includes(session.id);
            if (!already) all[i] = Object.assign({}, all[i], { reportedBy: (all[i].reportedBy || []).concat([session.id]) });
            if (API && typeof id === "string" && id.indexOf("srv_") === 0) {
              API.patch("/api/messages/" + id.slice(4) + "/report", {}).catch(function () {});
            }
          });
          S.write("messages", all);
          selectedMsgIds.clear();
          msgMultiSelect = false;
          renderMessages();
        });
      }
    }
  }

  function renderTrashList() {
    const listArea = document.getElementById("msgListArea");
    const msgs = getTrashedMsgs();

    // Keep only IDs still in trash when in multi-select mode
    if (msgMultiSelect) {
      const currentIds = new Set(msgs.map((m) => m.id));
      selectedMsgIds = new Set([...selectedMsgIds].filter((id) => currentIds.has(id)));
    }

    const countLabel = msgs.length ? '<span class="mlh-count">' + msgs.length + "</span>" : "";
    const selectBtnHtml = msgs.length
      ? (msgMultiSelect
        ? '<button class="mlh-select-btn active" id="msgSelectToggle">✕ ' + esc(t("msg.deselect.all")) + "</button>"
        : '<button class="mlh-select-btn" id="msgSelectToggle">' + esc(t("msg.select")) + "</button>")
      : "";
    listArea.innerHTML = '<div class="msg-list-header">🗑️ ' + esc(t("msg.trash")) + countLabel + selectBtnHtml + "</div>";

    // Bulk action bar (trash-specific)
    if (msgMultiSelect && msgs.length) {
      const n = selectedMsgIds.size;
      const allSelected = n === msgs.length;
      const bulkBar = document.createElement("div");
      bulkBar.className = "msg-bulk-bar";
      bulkBar.innerHTML =
        '<span class="mbb-count">' + n + " " + esc(t("msg.select")) + "ed</span>" +
        '<button class="mbb-btn" id="mbbSelectAll">' + esc(t(allSelected ? "msg.deselect.all" : "msg.select.all")) + "</button>" +
        '<button class="mbb-btn mbb-restore" id="mbbRestore"' + (n === 0 ? " disabled" : "") + ">↩ " + esc(t("msg.bulk.restore")) + "</button>" +
        '<button class="mbb-btn mbb-delete" id="mbbDeleteForever"' + (n === 0 ? " disabled" : "") + ">🗑 " + esc(t("msg.bulk.delete.forever")) + "</button>";
      listArea.appendChild(bulkBar);
    }

    // Trash info line
    const infoBar = document.createElement("div");
    infoBar.className = "msg-trash-info";
    infoBar.textContent = t("msg.trash.info");
    listArea.appendChild(infoBar);

    if (!msgs.length) {
      const empty = document.createElement("div");
      empty.className = "msg-empty";
      empty.innerHTML =
        '<div class="me-ico">🗑️</div>' +
        '<div class="me-title">' + esc(t("msg.empty.title")) + "</div>" +
        '<div class="me-sub">' + esc(t("msg.empty.trash")) + "</div>";
      listArea.appendChild(empty);
    } else {
      msgs.forEach((m) => {
        const isSent = m.fromId === session.id;
        const displayName = isSent
          ? (m.to === "all" ? t("staff.compose.everyone") : (Array.isArray(m.toNames) ? m.toNames.join(", ") : (m.toNames || "—")))
          : m.fromName;
        const avatarUserId = isSent ? session.id : m.fromId;
        const isSelected = selectedMsgIds.has(m.id);
        const trashedWhen = (m.trashedAt || {})[session.id] || 0;
        const daysLeft = Math.max(0, 30 - Math.floor((Date.now() - trashedWhen) / 86400000));

        const row = document.createElement("div");
        row.className = "msg-row read trash-row" + (isSelected ? " selected" : "") + (msgMultiSelect ? " selectable" : "");
        row.dataset.id = m.id;

        const firstCol = msgMultiSelect
          ? '<div class="mr-check"><input type="checkbox" class="mr-checkbox" tabindex="-1"' + (isSelected ? " checked" : "") + "></div>"
          : '<div class="mr-avatar">' + makeAvatarHtml(displayName, avatarUserId) + "</div>";

        row.innerHTML =
          firstCol +
          '<div class="mr-sender">' + esc(displayName) + "</div>" +
          '<div class="mr-subject-preview">' +
            '<span class="mr-subject">' + esc(m.subject || "(no subject)") + "</span>" +
            '<span class="mr-sep">—</span>' +
            '<span class="mr-preview">' + esc((m.body || "").replace(/\n/g, " ").slice(0, 100)) + "</span>" +
          "</div>" +
          '<div class="mr-time mr-days-left">' + daysLeft + "d</div>";

        row.addEventListener("click", () => {
          if (msgMultiSelect) {
            if (selectedMsgIds.has(m.id)) selectedMsgIds.delete(m.id);
            else selectedMsgIds.add(m.id);
            renderMessages();
            return;
          }
          msgPrevView = "trash";
          msgDetailId = m.id;
          msgDetailKind = "message";
          msgView = "detail";
          renderMessages();
        });
        listArea.appendChild(row);
      });
    }

    // Wire up buttons
    const selectToggle = document.getElementById("msgSelectToggle");
    if (selectToggle) {
      selectToggle.addEventListener("click", () => {
        msgMultiSelect = !msgMultiSelect;
        if (!msgMultiSelect) selectedMsgIds.clear();
        renderMessages();
      });
    }
    if (msgMultiSelect) {
      const mbbSelectAll = document.getElementById("mbbSelectAll");
      if (mbbSelectAll) {
        mbbSelectAll.addEventListener("click", () => {
          if (selectedMsgIds.size === msgs.length) selectedMsgIds.clear();
          else msgs.forEach((m) => selectedMsgIds.add(m.id));
          renderMessages();
        });
      }
      const mbbRestore = document.getElementById("mbbRestore");
      if (mbbRestore) {
        mbbRestore.addEventListener("click", () => {
          if (!selectedMsgIds.size) return;
          selectedMsgIds.forEach((id) => restoreMsg(id));
          selectedMsgIds.clear();
          msgMultiSelect = false;
          renderMessages();
        });
      }
      const mbbDeleteForever = document.getElementById("mbbDeleteForever");
      if (mbbDeleteForever) {
        mbbDeleteForever.addEventListener("click", () => {
          if (!selectedMsgIds.size) return;
          if (!confirm(t("msg.delete.forever.confirm"))) return;
          selectedMsgIds.forEach((id) => { permaForgetMsg(id); S.remove("messages", id); });
          selectedMsgIds.clear();
          msgMultiSelect = false;
          renderMessages();
        });
      }
    }
  }

  function renderMsgDetail(id) {
    const m = getAllMsgs().find((x) => x.id === id);
    const detailArea = document.getElementById("msgDetail");
    if (!m) { detailArea.innerHTML = ""; return; }

    const isAnn = m.to === "all";
    const toLabel = isAnn ? t("staff.compose.allStaff") : (Array.isArray(m.toNames) ? m.toNames.join(", ") : (m.toNames || ""));
    const _nameParts = (m.fromName || "").toLowerCase().trim().split(/\s+/);
    const emailAlias = (_nameParts.length > 1 ? _nameParts[0][0] + _nameParts[_nameParts.length - 1] : (_nameParts[0] || "staff")) + "@jpark.hotel";
    const avatarClass = isAnn ? "mda-avatar announcement-avatar" : "mda-avatar";

    const canReply = !!(m.fromId && m.fromId !== session.id);
    const isStarred = !!m.starred;
    const isInTrash = msgPrevView === "trash";
    const alreadyReported = Array.isArray(m.reportedBy) && m.reportedBy.includes(session.id);
    const canReport = !isInTrash && m.fromId !== session.id;

    detailArea.innerHTML =
      '<button class="msg-detail-back" id="msgDetailBack">' + esc(t("staff.back")) + '</button>' +
      '<div class="msg-detail-subject"></div>' +
      '<div class="msg-detail-meta">' +
        '<div class="' + avatarClass + '">' + makeAvatarHtml(m.fromName, m.fromId) + "</div>" +
        '<div class="mda-info">' +
          '<div class="mda-from">' + esc(m.fromName) +
            ' <span class="mda-email">&lt;' + esc(emailAlias) + "&gt;</span></div>" +
          '<div class="mda-to">to <b>' + esc(toLabel) + "</b></div>" +
        "</div>" +
        '<div class="mda-time">' + esc(new Date(m.createdAt).toLocaleString()) + "</div>" +
      "</div>" +
      '<div class="tr-note msg-tr-note" style="display:none"></div>' +
      '<div class="msg-detail-body"></div>' +
      '<div class="msg-detail-actions">' +
        (isInTrash
          ? ('<button class="mda-action-btn mda-restore-btn" id="mdaRestore">↩ ' + esc(t("msg.restore")) + "</button>" +
             '<button class="mda-action-btn mda-delete-btn" id="mdaDeleteForever">🗑 ' + esc(t("msg.delete.forever")) + "</button>")
          : ((!canReply ? "" : '<button class="mda-action-btn" id="mdaReply">↩ ' + esc(t("msg.reply")) + "</button>") +
             '<button class="mda-action-btn" id="mdaForward">↪ ' + esc(t("msg.forward")) + "</button>" +
             '<button class="mda-action-btn mda-star-btn' + (isStarred ? " starred" : "") + '" id="mdaStar">' +
               (isStarred ? "★ " + esc(t("msg.unstar")) : "☆ " + esc(t("msg.star"))) +
             "</button>" +
             (canReport ? '<button class="mda-action-btn mda-report-btn' + (alreadyReported ? " reported" : "") + '" id="mdaReport">' +
               (alreadyReported ? "⚠ " + esc(t("msg.report.already")) : "⚑ " + esc(t("msg.report"))) + "</button>" : "") +
             '<button class="mda-action-btn mda-delete-btn" id="mdaDelete">🗑 ' + esc(t("msg.delete")) + "</button>")) +
      "</div>";

    // Subject + body: show original immediately, then auto-translate to the
    // reader's language with a single "translated from X" note.
    const subjEl = detailArea.querySelector(".msg-detail-subject");
    const bodyEl = detailArea.querySelector(".msg-detail-body");
    const noteEl = detailArea.querySelector(".msg-tr-note");
    subjEl.textContent = m.subject || "(no subject)";
    bodyEl.textContent = m.body || "";
    const cur = I.getLang();
    if (!m.lang || m.lang !== cur) {
      J.translate.text(m.subject || "", cur).then((res) => {
        if (subjEl.isConnected && res.src && res.src !== cur && res.text && res.text !== (m.subject || "")) {
          subjEl.textContent = res.text;
        }
      });
      J.translate.text(m.body || "", cur).then((res) => {
        if (bodyEl.isConnected && res.src && res.src !== cur && res.text && res.text !== (m.body || "")) {
          bodyEl.textContent = res.text;
          noteEl.textContent = t("tr.from") + " " + J.translate.langName(res.src);
          noteEl.style.display = "";
        }
      });
    }

    const replyBtn = detailArea.querySelector("#mdaReply");
    if (replyBtn) replyBtn.addEventListener("click", () => openReply(m));
    const fwdBtn = detailArea.querySelector("#mdaForward");
    if (fwdBtn) fwdBtn.addEventListener("click", () => openForwardMsg(m));
    const starBtn = detailArea.querySelector("#mdaStar");
    if (starBtn) {
      starBtn.addEventListener("click", () => {
        const nowStarred = toggleStar(m.id, "message");
        starBtn.className = "mda-action-btn mda-star-btn" + (nowStarred ? " starred" : "");
        starBtn.textContent = (nowStarred ? "★ " : "☆ ") + t(nowStarred ? "msg.unstar" : "msg.star");
        updateBadges();
      });
    }

    const reportBtn = detailArea.querySelector("#mdaReport");
    if (reportBtn) {
      reportBtn.addEventListener("click", () => {
        if (!confirm(t("msg.report.confirm"))) return;
        const cur = getAllMsgs().find((x) => x.id === m.id);
        const reportedBy = cur ? (cur.reportedBy || []).concat([session.id]) : [session.id];
        S.update("messages", m.id, { reportedBy });
        reportBtn.className = "mda-action-btn mda-report-btn reported";
        reportBtn.textContent = "⚠ " + t("msg.report.done");
        reportBtn.disabled = true;
        if (typeof m.id === "string" && m.id.indexOf("srv_") === 0) {
          const API = window.JPark && window.JPark.api;
          if (API) API.patch("/api/messages/" + m.id.slice(4) + "/report", {}).catch(function () {});
        }
      });
    }

    const restoreBtn = detailArea.querySelector("#mdaRestore");
    if (restoreBtn) {
      restoreBtn.addEventListener("click", () => {
        restoreMsg(m.id);
        msgView = "inbox";
        msgDetailId = null;
        renderMessages();
      });
    }

    const deleteForeverBtn = detailArea.querySelector("#mdaDeleteForever");
    if (deleteForeverBtn) {
      deleteForeverBtn.addEventListener("click", () => {
        if (!confirm(t("msg.delete.forever.confirm"))) return;
        permaForgetMsg(m.id);
        S.remove("messages", m.id);
        msgView = "trash";
        msgDetailId = null;
        renderMessages();
      });
    }

    const deleteBtn = detailArea.querySelector("#mdaDelete");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        if (!confirm(t("msg.delete.confirm"))) return;
        trashMsg(m.id);
        msgView = msgPrevView;
        msgDetailId = null;
        renderMessages();
      });
    }

    document.getElementById("msgDetailBack").addEventListener("click", () => {
      msgView = msgPrevView;
      msgDetailId = null;
      renderMessages();
    });
  }

  /* ====================  GUEST BOOKINGS  ==================== */
  // Dates arrive either as "YYYY-MM-DD" (local seed) or as a full ISO
  // timestamp — the API serialises DATE columns as e.g.
  // "2026-07-25T00:00:00.000Z". Slice to the date part before formatting so
  // the raw timestamp never leaks into the list, and both render in the
  // reader's locale (formatDate expects a bare YYYY-MM-DD).
  function fmtBookingDate(x, lang) {
    // `lang` is only ever passed by the receipt, which may be rendering for a
    // guest whose language is not the console's. Everywhere else omits it and
    // gets the console language, exactly as before.
    return x ? U.formatDate(String(x).slice(0, 10), lang) : "?";
  }
  function bookingDateRange(b) {
    return fmtBookingDate(b.checkIn) + " → " + fmtBookingDate(b.checkOut);
  }

  // Local (per-browser) display preferences for the archive sections — which
  // are collapsed, and any custom rename. Deliberately not synced to the
  // server: this is cosmetic staff-console layout, not shared business data
  // (unlike starred/staffLabel, which are real per-booking data and do live
  // server-side — see routes/guestBookings.js PATCH /:id).
  function loadBkSectionPrefs() {
    try {
      const raw = localStorage.getItem(BK_SECTIONS_KEY);
      const v = raw ? JSON.parse(raw) : null;
      return {
        labels: (v && v.labels) || {},
        collapsed: (v && v.collapsed) || { older2: true, older6: true },
      };
    } catch (_) {
      return { labels: {}, collapsed: { older2: true, older6: true } };
    }
  }
  function saveBkSectionPrefs() {
    try { localStorage.setItem(BK_SECTIONS_KEY, JSON.stringify(bkSectionPrefs)); } catch (_) {}
  }
  function bkSectionLabel(key) {
    return (bkSectionPrefs.labels && bkSectionPrefs.labels[key]) || t("msg.bk.section." + key);
  }

  // Which archive bucket a booking belongs to, based on check-out date (a
  // future or recently-completed stay is "recent" even if the record was
  // imported long ago — see BK_AGE_OLDER2_DAYS/BK_AGE_OLDER6_DAYS above).
  function bookingAgeBucket(b) {
    if (!b.checkOut) return "recent";
    // Slice first: checkOut may be a full ISO timestamp, and
    // "2026-07-25T00:00:00.000Z" + "T00:00:00" is an unparseable date (every
    // such booking then wrongly bucketed as "recent").
    const checkOut = new Date(String(b.checkOut).slice(0, 10) + "T00:00:00");
    if (isNaN(checkOut.getTime())) return "recent";
    const ageDays = (Date.now() - checkOut.getTime()) / 86400000;
    if (ageDays >= BK_AGE_OLDER6_DAYS) return "older6";
    if (ageDays >= BK_AGE_OLDER2_DAYS) return "older2";
    return "recent";
  }
  function bkStatusLabel(s) {
    if (!s) return "";
    const k = "msg.bk.status." + s;
    const v = t(k);
    return v === k ? (s.charAt(0).toUpperCase() + s.slice(1)) : v;
  }
  // Payment method + status for bookings taken through the site's own online
  // checkout — blank for OTA/manual bookings (paymentStatus "n/a"), so staff
  // can tell at a glance whether a "direct" booking was actually paid.
  // A genuine online gateway charge and a front-desk-recorded in-person card
  // payment both carry paymentMethod "card" — the "(online)" qualifier is
  // what disambiguates them, since otherwise they'd render as an identical
  // "Card — Paid" label. PromptPay doesn't need this: "promptpay" (online)
  // and "promptpay_instore" (front-desk) are already distinct values.
  //
  // "Online" is any provider that isn't the front desk, rather than a named
  // gateway. This previously tested paymentProvider === "omise", which
  // silently mislabelled every booking once the hotel changed acquirer — see
  // isOnlineProvider() in backend/routes/guestBookings.js for the same rule
  // server-side.
  function bkIsOnlineProvider(p) {
    return !!p && p !== "in_person";
  }
  function bkPaymentLabel(b) {
    if (!b.paymentStatus || b.paymentStatus === "n/a") return "";
    const methodKey = b.paymentMethod === "cash" ? "msg.bk.payment.cash"
      : b.paymentMethod === "card" ? "msg.bk.payment.card"
      : b.paymentMethod === "promptpay_instore" ? "msg.bk.payment.promptpay_instore"
      : b.paymentMethod === "pay_at_checkin" ? "msg.bk.payment.pay_at_checkin"
      : b.paymentMethod === "promptpay" ? "msg.bk.payment.promptpay"
      : "";
    let method = methodKey ? t(methodKey) : (b.paymentProvider || "");
    if (bkIsOnlineProvider(b.paymentProvider) && b.paymentMethod === "card") {
      method = method + " " + t("msg.bk.payment.onlineSuffix");
    }
    const statusKey = "msg.bk.payment.status." + b.paymentStatus;
    const statusVal = t(statusKey);
    const status = statusVal === statusKey ? b.paymentStatus : statusVal;
    return method ? (method + " — " + status) : status;
  }

  /* ── The full payment record ───────────────────────────────────────────
     The booking board has always shown WHETHER a booking was paid. This shows
     WHAT was paid: which card, whose bank, what the gateway kept, what
     actually reaches the hotel's account, and — when a charge failed — the
     issuer's own reason.

     It is fetched per booking rather than carried on the list. The list is
     polled every ten seconds and written to localStorage in full; adding
     twenty payment columns to it, multiplied by the whole booking history, is
     the shape of database egress that took this API down once (2026-07-13)
     and would push the console toward its storage quota besides. So the
     server deliberately leaves `payment` out of the list projection, and it
     arrives only when somebody opens a booking. */
  const bkPaymentCache = new Map();
  const BK_PAYMENT_CACHE_MAX = 60;

  function bkPaymentCacheKey(b) {
    // Keyed on the status too, so a booking that flips pending -> paid
    // refetches instead of showing a stale "awaiting payment" record.
    return b.id + "|" + (b.paymentStatus || "") + "|" + (b.paymentChargeId || "");
  }

  function ensureBookingPayment(b) {
    if (!b || !b.id) return Promise.resolve(null);
    // A booking that never went through the gateway has nothing to fetch.
    if (!b.paymentStatus || b.paymentStatus === "n/a") return Promise.resolve(null);
    const key = bkPaymentCacheKey(b);
    if (bkPaymentCache.has(key)) return Promise.resolve(bkPaymentCache.get(key));
    const API = window.JPark && window.JPark.api;
    if (!API) return Promise.resolve(null);
    return API.get("/api/guest-bookings/" + encodeURIComponent(b.id)).then(function (full) {
      if (!full || full.error) return null;
      const payment = full.payment || null;
      if (bkPaymentCache.size >= BK_PAYMENT_CACHE_MAX) {
        // Plain FIFO eviction — this only exists so a long shift browsing
        // hundreds of bookings cannot grow it without bound.
        bkPaymentCache.delete(bkPaymentCache.keys().next().value);
      }
      bkPaymentCache.set(key, payment);
      return payment;
    }).catch(function () { return null; });
  }

  /* Does this booking have a gateway charge but no record of what it was?

     True for every booking taken before the payment detail columns existed.
     Their receipt renders as "Paid by: card" and a charge id — technically
     accurate, useless at a front desk. Rather than telling staff to go and
     run a backfill, the console notices and asks the gateway itself. */
  function bkPaymentIncomplete(pay) {
    return !!(pay && pay.chargeId && pay.amount == null);
  }

  // One attempt per booking per session. Without this, a booking whose charge
  // the gateway genuinely cannot answer for would re-ask on every ten-second
  // re-render of the open detail panel, forever.
  const bkPaymentRefreshed = new Set();

  function refreshBookingPayment(b, slot, force) {
    const API = window.JPark && window.JPark.api;
    if (!API || !b || !b.id) return Promise.resolve(null);
    if (!force && bkPaymentRefreshed.has(b.id)) return Promise.resolve(null);
    bkPaymentRefreshed.add(b.id);
    return API.post("/api/v1/payments/refresh/" + encodeURIComponent(b.id), {}).then((r) => {
      if (!r || r.error || !r.refreshed || !r.payment) return null;
      // Re-key the cache: the record changed, so the entry stored against the
      // old status must not win the next render.
      bkPaymentCache.set(bkPaymentCacheKey(b), r.payment);
      if (r.paymentStatus && r.paymentStatus !== b.paymentStatus) {
        updateBookingLocal(b.id, { paymentStatus: r.paymentStatus });
        b.paymentStatus = r.paymentStatus;
        bkPaymentCache.set(bkPaymentCacheKey(b), r.payment);
      }
      if (slot && slot.isConnected) {
        slot.innerHTML = bkPaymentBlockHTML(b, r.payment);
        wireBkReceiptButton(slot, b, r.payment);
      }
      return r.payment;
    }).catch(() => null);
  }

  function bkPayMoney(v, currency, lang) {
    if (v == null) return "";
    // Grouping and decimal marks differ by locale; a receipt in Japanese that
    // formats its total the English way reads as a template somebody forgot.
    return (currency || "THB") + " " + Number(v).toLocaleString(lang || undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }

  // "MasterCard •••• 8858" — the most of a card number that exists anywhere in
  // this system. The full number is tokenised in the guest's browser and never
  // reaches the hotel's server at all.
  function bkPayCardLabel(card) {
    if (!card || !card.last4) return "";
    return (card.brand || "Card") + " •••• " + card.last4;
  }

  // Times are always shown in Bangkok. Staff, guests and the owner are all in
  // ICT, and a receipt showing a 15:50 payment as 08:50 is a support call.
  function bkPayTime(iso, withSeconds, lang) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    try {
      return d.toLocaleString(lang || undefined, {
        timeZone: "Asia/Bangkok", year: "numeric", month: "short", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
        second: withSeconds ? "2-digit" : undefined, hour12: false,
      }) + " ICT";
    } catch (e) {
      return d.toLocaleString();
    }
  }

  function bkPayRow(label, value, cls) {
    if (value == null || value === "") return "";
    return '<div class="bk-pay-row' + (cls ? " " + cls : "") + '">' +
      '<span class="bk-pay-k">' + esc(label) + "</span>" +
      '<span class="bk-pay-v">' + esc(value) + "</span></div>";
  }

  function bkPaymentBlockHTML(b, pay) {
    if (!pay) {
      return '<div class="bk-pay-block bk-pay-empty">' + esc(t("msg.bk.pay.none")) + "</div>";
    }
    const cur = pay.currency || b.currency || "THB";
    const card = pay.card || {};
    const settle = pay.settlement || null;
    let rows = "";

    // "Amount charged" on an unpaid charge is what was ATTEMPTED, not taken.
    const settled = pay.state === "paid" || b.paymentStatus === "paid";
    rows += bkPayRow(settled ? t("msg.bk.pay.amountCharged") : t("msg.bk.pay.amountAttempted"),
      bkPayMoney(pay.amount, cur), "bk-pay-strong");
    /* Fee and net only once the money actually moved. The gateway quotes both
       on every charge — they are what it would have kept — so showing them on
       a refused or in-flight charge reports takings the hotel does not have. */
    if (settled && pay.fee != null) {
      rows += bkPayRow(t("msg.bk.pay.fee"), bkPayMoney(pay.fee, cur) +
        (pay.feeVat != null ? " (+ " + bkPayMoney(pay.feeVat, cur) + " VAT)" : ""));
    }
    // The figure that will appear on the hotel's bank statement.
    if (settled) rows += bkPayRow(t("msg.bk.pay.net"), bkPayMoney(pay.net, cur), "bk-pay-strong");
    if (pay.refundedAmount) rows += bkPayRow(t("msg.bk.pay.refunded"), bkPayMoney(pay.refundedAmount, cur));

    rows += bkPayRow(t("msg.bk.pay.paidBy"),
      bkPayCardLabel(card) || (pay.method === "promptpay" ? t("msg.bk.pay.promptpay") : pay.method || ""));
    rows += bkPayRow(t("msg.bk.pay.cardExpiry"), card.expiry);
    rows += bkPayRow(t("msg.bk.pay.cardholder"), card.name);
    rows += bkPayRow(t("msg.bk.pay.bank"), card.bank ? card.bank + (card.country ? " (" + card.country + ")" : "") : "");
    rows += bkPayRow(t("msg.bk.pay.cardType"), card.funding);
    if (pay.threeDS) rows += bkPayRow(t("msg.bk.pay.3ds"), t("msg.bk.pay.3ds." + pay.threeDS));

    rows += bkPayRow(t("msg.bk.pay.guestPaidAt"), bkPayTime(pay.paidAt, true));
    rows += bkPayRow(t("msg.bk.pay.chargeId"), pay.chargeId);
    rows += bkPayRow(t("msg.bk.pay.transactionId"), pay.transactionId);

    /* Where the money is, kept as its own group. "The guest paid" and "the
       hotel has the money" are different days, and running the two together
       in one list is how an owner comes to believe a settled charge is
       withdrawable when it is still clearing. */
    let settleHtml = "";
    if (settle) {
      let sr = "";
      sr += bkPayRow(t("msg.bk.pay.clearsHold"), bkPayTime(settle.transferableAt));
      sr += bkPayRow(t("msg.bk.pay.bankPaidAt"), bkPayTime(settle.paidAt));
      if (settle.transferId) {
        sr += bkPayRow(t("msg.bk.pay.transfer"), settle.transferId +
          (settle.bank ? " → " + settle.bank : "") + (settle.last4 ? " ••••" + settle.last4 : ""));
      }
      settleHtml =
        '<div class="bk-pay-settle bk-pay-settle-' + esc(settle.state || "on_hold") + '">' +
          '<div class="bk-pay-settle-head">' + esc(t("msg.bk.pay.settleTitle")) + ": <b>" +
            esc(t("msg.bk.pay.settle." + (settle.state || "on_hold"))) + "</b></div>" +
          sr +
        "</div>";
    }

    const failHtml = pay.failure
      ? '<div class="bk-pay-fail">' +
          "<b>" + esc(t("msg.bk.pay.failureReason")) + ":</b> " +
          esc(pay.failure.text || pay.failure.message || pay.failure.code || "") +
        "</div>"
      : "";

    // livemode === false means the gateway was on test keys. A test charge is
    // identical to a real one in every visible field, so this has to be loud.
    const testHtml = pay.livemode === false
      ? '<div class="bk-pay-test">⚠ ' + esc(t("msg.bk.pay.testMode")) + "</div>"
      : "";

    // An incomplete record says so rather than presenting its gaps as facts —
    // a receipt printed from a half-filled record is worse than one refused.
    const incompleteHtml = bkPaymentIncomplete(pay)
      ? '<div class="bk-pay-incomplete">' + esc(t("msg.bk.pay.incomplete")) + "</div>"
      : "";

    return '<div class="bk-pay-block">' +
      '<div class="bk-pay-head">' + esc(t("msg.bk.pay.title")) +
        '<span class="bk-pay-head-actions">' +
          '<button class="mda-action-btn bk-pay-refresh-btn" id="bkPayRefreshBtn" title="' +
            esc(t("msg.bk.pay.refresh")) + '">↻</button>' +
          '<button class="mda-action-btn bk-pay-receipt-btn" id="bkPayReceiptBtn">🧾 ' +
            esc(t("msg.bk.pay.receipt")) + "</button>" +
        "</span>" +
      "</div>" +
      testHtml + incompleteHtml + failHtml +
      '<div class="bk-pay-rows">' + rows + "</div>" +
      settleHtml +
    "</div>";
  }

  function renderBkPaymentBlock(slot, b) {
    if (!slot) return;
    if (!b.paymentStatus || b.paymentStatus === "n/a") { slot.innerHTML = ""; return; }
    const key = bkPaymentCacheKey(b);
    // Painted straight from cache when we already have it, so the ten-second
    // poll re-render does not flash a loading line over a filled-in panel.
    if (bkPaymentCache.has(key)) {
      const cached = bkPaymentCache.get(key);
      slot.innerHTML = bkPaymentBlockHTML(b, cached);
      wireBkReceiptButton(slot, b, cached);
      if (bkPaymentIncomplete(cached)) refreshBookingPayment(b, slot, false);
      return;
    }
    slot.innerHTML = '<div class="bk-pay-block bk-pay-empty">' + esc(t("msg.bk.pay.loading")) + "</div>";
    ensureBookingPayment(b).then(function (pay) {
      if (!slot.isConnected) return;
      slot.innerHTML = bkPaymentBlockHTML(b, pay);
      wireBkReceiptButton(slot, b, pay);
      // A booking from before these columns shipped: ask the gateway once,
      // now, rather than showing a half-empty record and leaving it there.
      if (bkPaymentIncomplete(pay)) refreshBookingPayment(b, slot, false);
    });
  }

  function wireBkReceiptButton(slot, b, pay) {
    const btn = slot.querySelector("#bkPayReceiptBtn");
    if (btn) btn.addEventListener("click", () => openBkReceipt(b, pay));
    const refresh = slot.querySelector("#bkPayRefreshBtn");
    if (refresh) {
      refresh.addEventListener("click", () => {
        refresh.disabled = true;
        refresh.textContent = "…";
        // force:true — a human pressing it means "ask again", even if this
        // session already tried once.
        refreshBookingPayment(b, slot, true).then((fresh) => {
          if (!fresh) {
            refresh.disabled = false;
            refresh.textContent = "↻";
            U.toast(t("msg.bk.pay.refreshFailed"), "error");
          }
        });
      });
    }
  }

  /* ── A printable receipt ────────────────────────────────────────────────
     A guest who paid online and wants something on paper at the desk, and the
     hotel's own copy for the accounts.

     Rendered into an overlay on document.body and printed with `body`
     carrying `bk-printing`, which is what lets the print rules out-specify
     help.css's own @media print block — that block hides .dash-panel and
     shows the whole staff handbook for every print from this page, so a
     receipt printed without beating it would come out with the handbook
     behind it. */
  /* The gateway's own accounting, laid out the way the gateway lays it out.

     Staff comparing this against the Omise dashboard should not have to
     translate between two vocabularies or do arithmetic in their head, so
     this mirrors that screen line for line: transaction amount, the fee split
     into its rate and the VAT ON THE FEE, and the net amount, with the
     transaction id underneath.

     The fee split is worth being explicit about. The hotel's own staff read
     "3.65% + VAT 7%" as a 10.65% deduction and said so in writing; it is not.
     The 7% is VAT charged on the FEE, not on the sale. On a 5,550 charge that
     is 202.58 + 14.18 = 216.76, which is 3.91% — not 10.65%. Showing the
     effective percentage next to the total removes the question. */
  /* `surcharge` is the online payment fee this booking charged the guest —
     what the hotel INTENDED to recover. The gateway's actual deduction is on
     the charge object. Showing both, and the difference between them, is what
     turns "we think our rate is 3.65%" into something the front desk can
     check on a single receipt: if the acquirer quietly moves its rate, the
     shortfall line says so on the next receipt anybody prints. */
  function bkReceiptInternalHTML(b, pay, grand, cur, lang, surcharge) {
    if (!pay) return "";
    const line = (k, v, cls) => (v == null || v === "" ? "" :
      '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th>' + esc(k) + "</th><td>" + esc(v) + "</td></tr>");
    const card = pay.card || {};
    const settle = pay.settlement || null;

    // Rates derived from the amounts rather than hard-coded: the acquirer's
    // rate is negotiable and a hard-coded 3.65% would quietly become a lie.
    const feeRate = (pay.fee != null && pay.amount) ? (pay.fee / pay.amount * 100) : null;
    const vatRate = (pay.feeVat != null && pay.fee) ? (pay.feeVat / pay.fee * 100) : null;
    const totalDeducted = (pay.fee != null || pay.feeVat != null)
      ? (Number(pay.fee || 0) + Number(pay.feeVat || 0)) : null;
    const effectiveRate = (totalDeducted != null && pay.amount) ? (totalDeducted / pay.amount * 100) : null;
    const pct = (v) => (v == null ? "" : v.toFixed(2).replace(/\.00$/, "") + "%");

    let money = "";
    money += line(tl("msg.bk.pay.txnAmount", lang), bkPayMoney(pay.amount, cur, lang));
    // Same rule as the board: a charge that did not settle has no fee and no
    // net, whatever the gateway quotes against it.
    const settled = pay.state === "paid";
    if (settled && totalDeducted != null) {
      money += line(tl("msg.bk.pay.txnFee", lang),
        "− " + bkPayMoney(totalDeducted, cur, lang) + (effectiveRate != null ? "  (" + pct(effectiveRate) + " " + tl("msg.bk.pay.ofSale", lang) + ")" : ""));
      money += line("  " + tl("msg.bk.pay.feeRate", lang).replace("{rate}", pct(feeRate)),
        "− " + bkPayMoney(pay.fee, cur, lang), "bk-rc-sub");
      money += line("  " + tl("msg.bk.pay.vatRate", lang).replace("{rate}", pct(vatRate)),
        "− " + bkPayMoney(pay.feeVat, cur, lang), "bk-rc-sub");
    }
    if (settled) money += line(tl("msg.bk.pay.netAmount", lang), bkPayMoney(pay.net, cur, lang), "bk-rc-net");

    /* Did the pass-through work? Three lines, only when a fee was actually
       charged to the guest and the charge actually settled:
         what the room earns · what the guest paid for the fee · net − room.

       That last number is the whole point of the feature. It should be a
       small positive figure (the gross-up rounds up to a whole Baht, so the
       hotel lands a little over rather than a little under). A negative one
       means the acquirer is deducting more than the configured rate — a fact
       nobody would otherwise notice until the bank balance disagreed with the
       books by an amount too small to chase and too regular to ignore. */
    const feeToGuest = Number(surcharge || 0);
    if (settled && feeToGuest > 0) {
      const roomRevenue = Number(grand) - feeToGuest;
      money += line(tl("msg.bk.pay.roomRevenue", lang), bkPayMoney(roomRevenue, cur, lang), "bk-rc-sub");
      money += line(tl("msg.bk.pay.feeToGuest", lang), "+ " + bkPayMoney(feeToGuest, cur, lang), "bk-rc-sub");
      if (pay.net != null) {
        const delta = Number(pay.net) - roomRevenue;
        const amt = bkPayMoney(Math.abs(delta), cur, lang);
        money += line("",
          delta >= 0
            ? tl("msg.bk.pay.recoverySurplus", lang).replace("{amount}", amt)
            : tl("msg.bk.pay.recoveryShort", lang).replace("{amount}", amt),
          delta >= 0 ? "bk-rc-recovered" : "bk-rc-short");
      }
    }

    if (pay.refundedAmount) money += line(tl("msg.bk.pay.refunded", lang), bkPayMoney(pay.refundedAmount, cur, lang));

    let detail = "";
    detail += line(tl("msg.bk.pay.paidBy", lang), bkPayCardLabel(card) ||
      (pay.method === "promptpay" ? tl("msg.bk.pay.promptpay", lang) : pay.method));
    detail += line(tl("msg.bk.pay.cardExpiry", lang), card.expiry);
    detail += line(tl("msg.bk.pay.cardholder", lang), card.name);
    detail += line(tl("msg.bk.pay.bank", lang), card.bank ? card.bank + (card.country ? " (" + card.country + ")" : "") : "");
    detail += line(tl("msg.bk.pay.cardType", lang), card.funding);
    detail += line(tl("msg.bk.pay.3ds", lang), pay.threeDS ? tl("msg.bk.pay.3ds." + pay.threeDS, lang) : "");
    detail += line(tl("msg.bk.pay.chargeStatus", lang), pay.status || pay.state);
    detail += line(tl("msg.bk.pay.created", lang), bkPayTime(pay.createdAt, true, lang));
    detail += line(tl("msg.bk.pay.guestPaidAt", lang), bkPayTime(pay.paidAt, true, lang));
    detail += line(tl("msg.bk.pay.chargeId", lang), pay.chargeId);
    detail += line(tl("msg.bk.pay.transactionId", lang), pay.transactionId);
    if (pay.failure) detail += line(tl("msg.bk.pay.failureReason", lang), pay.failure.text || pay.failure.message || pay.failure.code);

    let settleRows = "";
    if (settle) {
      settleRows += line(tl("msg.bk.pay.settleTitle", lang), tl("msg.bk.pay.settle." + (settle.state || "on_hold"), lang));
      settleRows += line(tl("msg.bk.pay.clearsHold", lang), bkPayTime(settle.transferableAt, lang));
      settleRows += line(tl("msg.bk.pay.bankPaidAt", lang), bkPayTime(settle.paidAt, lang));
      settleRows += line(tl("msg.bk.pay.transfer", lang), settle.transferId
        ? settle.transferId + (settle.bank ? " → " + settle.bank : "") + (settle.last4 ? " ••••" + settle.last4 : "")
        : "");
    }

    /* The booking total and the charge should agree. When they do not — a
       group booking charged as one, a partial refund, a price amended after
       payment — say so rather than printing two numbers side by side and
       leaving somebody to notice.

       SETTLED CHARGES ONLY. An unsettled charge's amount is what was
       ATTEMPTED, not what was taken, and the two are now expected to differ:
       when a PromptPay QR expires or a guest walks away from 3-D Secure, the
       reconciler drops the online payment fee off the bill (the guest is
       going to pay at the desk, where there is no gateway cut), leaving a
       booking total that is deliberately lower than the amount the gateway
       was asked for. Flagging that as a discrepancy would put a red warning
       on every abandoned-payment receipt and teach staff to ignore the one
       banner that exists to catch real ones. */
    const mismatch = (settled && pay.amount != null && Math.abs(Number(pay.amount) - Number(grand)) > 0.01)
      ? '<div class="bk-rc-mismatch">' + esc(tl("msg.bk.receipt.mismatch", lang)
          .replace("{booking}", bkPayMoney(grand, cur, lang))
          .replace("{charged}", bkPayMoney(pay.amount, cur, lang))) + "</div>"
      : "";

    return '<div class="bk-rc-internal">' +
      '<div class="bk-rc-internal-head">' + esc(tl("msg.bk.receipt.internalTitle", lang)) + "</div>" +
      '<div class="bk-rc-internal-note">' + esc(tl("msg.bk.receipt.internalNote", lang)) + "</div>" +
      (pay.livemode === false ? '<div class="bk-rc-test">' + esc(tl("msg.bk.pay.testMode", lang)) + "</div>" : "") +
      mismatch +
      '<table class="bk-rc-meta bk-rc-money">' + money + "</table>" +
      '<table class="bk-rc-meta">' + detail + "</table>" +
      (settleRows ? '<table class="bk-rc-meta">' + settleRows + "</table>" : "") +
    "</div>";
  }

  /* ── The receipt ─────────────────────────────────────────────────────────
     A hotel receipt is the last piece of paper a guest takes home, and for
     the hotel's own accounts it is a record somebody may have to produce
     years later. It is laid out as a document rather than as a screen: the
     letterhead and the seal are the parts that make it read as issued BY a
     business rather than printed FROM a website.

     The hotel's address here is the one the website, the privacy policy and
     every system email already use, so a guest comparing their receipt
     against the site sees one company. Kept as a single constant for that
     reason — three copies of an address is three chances to disagree. */
  const RECEIPT_HOTEL = {
    address: "88/88 Thanon Sukprayun, Na Pa, Mueang Chonburi District, Chon Buri 20000, Thailand",
    phones: ["+66 38 448 111", "+66 86 326 0664"],
    email: "jparkhotel1@gmail.com",
    site: "jparkhotel.com",
  };

  function bkReceiptHTML(b, pay, siblings, internal, lang) {
    const cur = (pay && pay.currency) || b.currency || "THB";
    const rows = siblings && siblings.length > 1 ? siblings : [b];
    const grand = rows.reduce((s, r) => s + Number(r.total || 0), 0);
    /* The folio's two halves. Each room is priced at its ACCOMMODATION rate —
       what the room cost — and the one online payment fee is a single line
       beneath, exactly where a hotel folio puts a service charge. Printing
       each room at its share of the charge instead would spread one fee in
       fractions across the rooms and give a guest three prices that match
       nothing they were quoted.

       roomTotal falls back to total for anything with no breakdown stored:
       every booking taken before the fee existed, every OTA and manual row.
       Those two numbers are the same there, so the receipt is unchanged. */
    const roomOnly = (r) => Number(r.roomTotal != null ? r.roomTotal : r.total || 0);
    const accommodation = rows.reduce((s, r) => s + roomOnly(r), 0);
    const surcharge = rows.reduce((s, r) => s + Number(r.paymentSurcharge || 0), 0);
    const card = (pay && pay.card) || {};

    const line = (k, v) => (v == null || v === "" ? "" :
      '<tr><th>' + esc(k) + "</th><td>" + esc(v) + "</td></tr>");

    /* One line per room, carrying what a guest actually checks a hotel
       receipt for: which room, which nights, how many people, and whether
       breakfast was in the price. Without that last one a guest cannot tell a
       room-only rate from one including breakfast — the most common question
       asked of a receipt at this desk. */
    const roomLines = rows.map((r) => {
      const nights = r.nights ? tl("msg.bk.receipt.nights", lang).replace("{n}", String(r.nights)) : "";
      const guests = [
        r.adults ? tl("msg.bk.receipt.adults", lang).replace("{n}", String(r.adults)) : "",
        r.children ? tl("msg.bk.receipt.children", lang).replace("{n}", String(r.children)) : "",
      ].filter(Boolean).join(", ");
      const extras = [
        r.breakfast ? tl("msg.bk.receipt.withBreakfast", lang) : tl("msg.bk.receipt.roomOnly", lang),
        r.extraBed ? tl("msg.bk.extraBed", lang) : "",
      ].filter(Boolean).join(" · ");
      return "<tr>" +
        "<td>" +
          '<span class="bk-rc-room">' + esc(r.room || "") + "</span>" +
          (r.roomNumber ? ' <span class="bk-rc-room-no">' + esc(tl("msg.bk.roomNumber", lang)) + " " + esc(r.roomNumber) + "</span>" : "") +
          '<div class="bk-rc-sub-line">' + esc([guests, extras].filter(Boolean).join(" · ")) + "</div>" +
        "</td>" +
        "<td>" + esc(fmtBookingDate(r.checkIn, lang) + " → " + fmtBookingDate(r.checkOut, lang)) +
          (nights ? '<div class="bk-rc-sub-line">' + esc(nights) + "</div>" : "") +
        "</td>" +
        '<td class="bk-rc-amt">' + esc(bkPayMoney(roomOnly(r), cur, lang)) + "</td>" +
      "</tr>";
    }).join("");

    /* The closing rows of the room table. One line when there is no fee —
       byte-for-byte the receipt this desk has been printing — and three when
       there is, so the guest can follow the arithmetic from the room rate
       they booked to the amount that left their card. */
    const totalRows = surcharge > 0
      ? '<tr class="bk-rc-subtotal">' +
          '<td colspan="2">' + esc(tl("msg.bk.roomTotal", lang)) + "</td>" +
          '<td class="bk-rc-amt">' + esc(bkPayMoney(accommodation, cur, lang)) + "</td>" +
        "</tr>" +
        '<tr class="bk-rc-subtotal">' +
          '<td colspan="2">' + esc(tl("msg.bk.surcharge", lang)) + "</td>" +
          '<td class="bk-rc-amt">' + esc(bkPayMoney(surcharge, cur, lang)) + "</td>" +
        "</tr>" +
        '<tr class="bk-rc-total">' +
          '<td colspan="2">' + esc(tl("msg.bk.receipt.totalPaid", lang)) + "</td>" +
          '<td class="bk-rc-amt">' + esc(bkPayMoney(grand, cur, lang)) + "</td>" +
        "</tr>"
      : '<tr class="bk-rc-total">' +
          '<td colspan="2">' + esc(tl("msg.bk.receipt.totalPaid", lang)) + "</td>" +
          '<td class="bk-rc-amt">' + esc(bkPayMoney(grand, cur, lang)) + "</td>" +
        "</tr>";

    const paidLabel = bkPayCardLabel(card) ||
      (pay && pay.method === "promptpay" ? tl("msg.bk.pay.promptpay", lang) : (pay && pay.method) || "");

    /* The receipt's own number. Derived from the confirmation reference
       rather than minted fresh, so reprinting the same booking gives the same
       document — a receipt whose number changes each time it is printed is
       not a receipt. */
    const receiptNo = "R-" + String(b.groupRef || b.ref || "").replace(/^JP-/, "");

    return '<div class="bk-receipt-sheet">' +

      // ── Letterhead ──────────────────────────────────────────────────────
      '<div class="bk-rc-head">' +
        '<img class="bk-rc-logo" src="images/logo-full.png" alt="J Park Hotel" ' +
          'onerror="this.style.display=\'none\'">' +
        '<div class="bk-rc-contact">' +
          "<div>" + esc(RECEIPT_HOTEL.address) + "</div>" +
          "<div>" + esc(tl("msg.bk.receipt.tel", lang)) + " " + esc(RECEIPT_HOTEL.phones.join(" · ")) +
            "  ·  " + esc(RECEIPT_HOTEL.email) + "  ·  " + esc(RECEIPT_HOTEL.site) + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="bk-rc-rule"></div>' +
      '<h1 class="bk-rc-title">' + esc(tl("msg.bk.receipt.title", lang)) + "</h1>" +

      (pay && pay.livemode === false
        ? '<div class="bk-rc-test">' + esc(tl("msg.bk.pay.testMode", lang)) + "</div>" : "") +

      // ── Guest, and the document's own particulars, side by side ─────────
      '<div class="bk-rc-parties">' +
        '<div class="bk-rc-party">' +
          '<div class="bk-rc-label">' + esc(tl("msg.bk.receipt.for", lang)) + "</div>" +
          '<div class="bk-rc-party-name">' + esc([b.guestName, b.guestLastName].filter(Boolean).join(" ")) + "</div>" +
          (b.guestEmail ? "<div>" + esc(b.guestEmail) + "</div>" : "") +
          (b.guestPhone ? "<div>" + esc(b.guestPhone) + "</div>" : "") +
        "</div>" +
        '<div class="bk-rc-party bk-rc-party-right">' +
          '<table class="bk-rc-meta">' +
            line(tl("msg.bk.receipt.no", lang), receiptNo) +
            line(tl("msg.bk.ref", lang), b.groupRef || b.ref) +
            line(tl("msg.bk.receipt.issued", lang), bkPayTime(pay && pay.paidAt ? pay.paidAt : b.createdAt, false, lang)) +
            line(tl("msg.bk.receipt.issuedBy", lang), session ? session.name : "") +
          "</table>" +
        "</div>" +
      "</div>" +

      // ── What was bought ─────────────────────────────────────────────────
      '<table class="bk-rc-rooms">' +
        "<thead><tr>" +
          "<th>" + esc(tl("msg.bk.receipt.rooms", lang)) + "</th>" +
          "<th>" + esc(tl("msg.bk.receipt.stay", lang)) + "</th>" +
          // "Amount", not "Total paid": each row is now the room's own
          // accommodation charge, and the amount actually paid is the tfoot
          // line beneath the fee. A column headed "Total paid" over a room
          // price is a receipt that argues with itself.
          '<th class="bk-rc-amt">' + esc(tl("msg.bk.receipt.amount", lang)) + "</th>" +
        "</tr></thead>" +
        "<tbody>" + roomLines + "</tbody>" +
        "<tfoot>" + totalRows + "</tfoot>" +
      "</table>" +

      // ── How it was paid ─────────────────────────────────────────────────
      (pay
        ? '<div class="bk-rc-section">' + esc(tl("msg.bk.pay.title", lang)) + "</div>" +
          '<table class="bk-rc-meta bk-rc-meta-wide">' +
            line(tl("msg.bk.pay.paidBy", lang), paidLabel) +
            line(tl("msg.bk.pay.cardholder", lang), card.name) +
            line(tl("msg.bk.pay.bank", lang), card.bank) +
            line(tl("msg.bk.pay.amountCharged", lang), bkPayMoney(pay.amount, cur, lang)) +
            line(tl("msg.bk.pay.guestPaidAt", lang), bkPayTime(pay.paidAt, true, lang)) +
            line(tl("msg.bk.pay.chargeId", lang), pay.chargeId) +
          "</table>"
        : "") +

      // One sentence naming the fee, on BOTH copies — the guest copy is this
      // sheet with the internal block removed, so without it the fee line on
      // the folio would be a number the guest has no explanation for.
      (surcharge > 0
        ? '<div class="bk-rc-fee-note">' + esc(tl("msg.bk.receipt.feeNote", lang)) + "</div>"
        : "") +

      // The key-card deposit is separate from the room charge and is still
      // cash at the desk, however the room itself was paid for. On the receipt
      // it is what stops a guest who prepaid online arriving believing there
      // is nothing left to hand over.
      '<div class="bk-rc-note">' + esc(tl("msg.bk.receipt.deposit", lang)) + "</div>" +

      // ── Signature and seal ──────────────────────────────────────────────
      '<div class="bk-rc-sign">' +
        '<div class="bk-rc-thanks">' + esc(tl("msg.bk.receipt.thanks", lang)) + "</div>" +
        '<div class="bk-rc-sign-block">' +
          '<img class="bk-rc-stamp" src="images/company-stamp.png" alt="" ' +
            'onerror="this.style.display=\'none\'">' +
          '<div class="bk-rc-sign-line"></div>' +
          '<div class="bk-rc-sign-cap">' + esc(tl("msg.bk.receipt.authorised", lang)) + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="bk-rc-legal">' + esc(tl("msg.bk.receipt.legal", lang)) + "</div>" +

      // Everything the gateway knows, for staff. Appended after the document
      // proper rather than woven in, so the guest copy is exactly the pages
      // above with this section removed — not a different layout.
      (internal ? bkReceiptInternalHTML(b, pay, grand, cur, lang, surcharge) : "") +
    "</div>";
  }

  /* What "Save as PDF" will call the file.

     Browsers take the suggested filename straight from document.title, so
     that is the only lever there is — there is no print API that sets it.
     Left alone the title is "J Park Hotel — Staff", which turns a folder of
     saved receipts into a folder of identically-named files that overwrite
     each other on the second save.

     Named for the guest and the moment they paid, in Bangkok time, so a
     folder sorts chronologically per guest and two receipts can never
     collide. Colons are illegal in filenames on Windows and macOS alike, so
     the time is hyphenated rather than punctuated. */
  function bkReceiptFileName(b, pay) {
    const when = (pay && pay.paidAt) || b.createdAt;
    const d = when ? new Date(when) : new Date();
    let stamp;
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(d).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
      stamp = parts.year + "-" + parts.month + "-" + parts.day + " " + parts.hour + "-" + parts.minute;
    } catch (e) {
      // Intl without full tz data must not cost us a filename.
      stamp = new Date(d).toISOString().slice(0, 16).replace("T", " ").replace(":", "-");
    }
    const guest = [b.guestName, b.guestLastName].filter(Boolean).join(" ").trim();
    // Strip rather than substitute the characters a filesystem refuses, so
    // the name stays readable instead of gaining underscores.
    return (guest ? guest + " " : "")
      .concat(stamp)
      .replace(/[\/:*?"<>|]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function openBkReceipt(b, pay) {
    const siblings = b.groupRef
      ? getBookingMsgs().filter((x) => x.groupRef === b.groupRef)
          .sort((a, c) => (a.groupIndex || 0) - (c.groupIndex || 0))
      : [];
    /* Two copies of one document.

       INTERNAL is the default, because this lives in the staff console and the
       question it usually answers is an accounting one — what did the gateway
       actually keep, and has the money landed. It carries the hotel's fees and
       net takings.

       GUEST COPY is the same document with that section removed, for when the
       receipt is printed and handed across the desk. A guest has no business
       seeing the hotel's acquiring costs, so the toggle exists rather than one
       compromise document that is wrong for both readers. */
    /* One receipt window at a time.

       Every click used to append another overlay to <body>. While they were
       correctly positioned they stacked invisibly on top of each other, so
       nothing looked wrong and Close only dismissed the topmost — leaving
       copies behind that a later style change made visible all at once. Close
       any open one first, so pressing Receipt twice re-opens rather than
       accumulates. */
    const existing = document.querySelector(".bk-receipt-overlay");
    if (existing) existing.remove();
    document.body.classList.remove("bk-printing");

    let internal = true;

    /* Each copy remembers its own language, because they are read by different
       people.

       The GUEST copy defaults to the language the guest actually booked in —
       booking.html records it on the reservation, and it is auto-detected from
       their device on a first visit — so handing over a readable document is
       the default rather than something staff must remember to select.

       The INTERNAL copy defaults to the console language, because the person
       reading it is the one logged in.

       Both are overridable: a guest may ask for English, and a Thai
       receptionist may want to check what the Japanese copy actually says
       before printing it. */
    const consoleLang = I.getLang();
    const guestLang = I.SUPPORTED.indexOf(b.lang) >= 0 ? b.lang : consoleLang;
    const langFor = { internal: consoleLang, guest: guestLang };

    const overlay = document.createElement("div");
    overlay.className = "bk-receipt-overlay";
    const paint = () => {
      const copy = internal ? "internal" : "guest";
      const lang = langFor[copy];
      // Every label in the toolbar stays in the CONSOLE's language — it is
      // chrome for the member of staff, not part of the document.
      overlay.innerHTML =
        '<div class="bk-receipt-modal' + (internal ? " is-internal" : "") + '">' +
          '<div class="bk-receipt-bar">' +
            '<div class="bk-rc-toggle" role="group">' +
              '<button class="bk-rc-tab' + (internal ? " active" : "") + '" id="bkRcInternal">' +
                esc(t("msg.bk.receipt.internal")) + "</button>" +
              '<button class="bk-rc-tab' + (internal ? "" : " active") + '" id="bkRcGuest">' +
                esc(t("msg.bk.receipt.guestCopy")) + "</button>" +
            "</div>" +
            '<label class="bk-rc-lang">' +
              '<span class="bk-rc-lang-cap">' + esc(t("msg.bk.receipt.language")) + "</span>" +
              '<select id="bkRcLang">' +
                I.SUPPORTED.map(function (l) {
                  return '<option value="' + esc(l) + '"' + (l === lang ? " selected" : "") + ">" +
                    esc(I.LANG_NAMES[l] || l) + "</option>";
                }).join("") +
              "</select>" +
            "</label>" +
            '<button class="mda-action-btn" id="bkRcPrint">🖨 ' + esc(t("msg.bk.receipt.print")) + "</button>" +
            '<button class="mda-action-btn" id="bkRcClose">' + esc(t("msg.bk.receipt.close")) + "</button>" +
          "</div>" +
          bkReceiptHTML(b, pay, siblings, internal, lang) +
        "</div>";
      wire();
    };
    document.body.appendChild(overlay);

    /* `bk-printing` is added for the WHOLE life of the receipt window, not
       just around the Print button.

       Two reasons, both of which produced a printed dashboard. Adding it only
       on the button meant Ctrl+P — which is what people actually press —
       printed the console instead of the receipt. And removing it on a 500ms
       timer raced Chrome's print preview: the preview stays open long after
       window.print() returns, so the class was stripped while the user was
       still looking at it, and the layout reverted mid-preview.

       Every rule keyed on it lives inside @media print, so carrying it on the
       body while the window is open changes nothing on screen. */
    document.body.classList.add("bk-printing");

    // Set for as long as the window is open, for the same reason the print
    // class is: whichever way the guest's copy is saved — the Print button,
    // Ctrl+P, "Save as PDF" from the preview — it gets the same name.
    document.title = bkReceiptFileName(b, pay);

    const close = () => {
      document.body.classList.remove("bk-printing");
      // Let the badge updater recompute it rather than restoring the string
      // captured on open, which may be several polls out of date by now.
      try { updateBadges(); } catch (e) { document.title = "Staff Console · J Park Hotel"; }
      overlay.remove();
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    function wire() {
      overlay.querySelector("#bkRcClose").addEventListener("click", close);
      overlay.querySelector("#bkRcInternal").addEventListener("click", () => {
        if (!internal) { internal = true; paint(); }
      });
      overlay.querySelector("#bkRcGuest").addEventListener("click", () => {
        if (internal) { internal = false; paint(); }
      });
      overlay.querySelector("#bkRcLang").addEventListener("change", (e) => {
        // Remembered per copy, so switching to the guest copy and back does
        // not lose the language either was set to.
        langFor[internal ? "internal" : "guest"] = e.target.value;
        paint();
      });
      overlay.querySelector("#bkRcPrint").addEventListener("click", () => window.print());
    }
    paint();
  }

  /* Front-desk-only actions on a direct/pay-at-checkin booking: assign the
     physical room number, and record how in-person payment was received.
     OTA-sourced bookings never go through this flow, so these controls are
     scoped to b.channel === "direct" in renderBookingDetail(). */
  function updateBookingLocal(id, patch) {
    const all = S.list("guestBookings");
    const i = all.findIndex((x) => x.id === id);
    if (i >= 0) {
      all[i] = Object.assign({}, all[i], patch);
      S.write("guestBookings", all);
    }
  }

  function bkFrontDeskHTML(b) {
    const paid = b.paymentStatus === "paid";
    const roomRow =
      '<div class="bk-frontdesk-row">' +
        '<label class="bkd-label">' + esc(t("msg.bk.roomNumber")) + '</label>' +
        '<input type="text" class="bk-frontdesk-input" id="bkdRoomNumberInput" maxlength="10" ' +
          'placeholder="' + esc(t("msg.bk.roomNumberPlaceholder")) + '" value="' + esc(b.roomNumber || "") + '">' +
        '<button class="mda-action-btn" id="bkdSaveRoomBtn">' + esc(t("msg.bk.assignRoom")) + "</button>" +
      "</div>" +
      // Why it matters: an assigned room number is what lets an in-house guest
      // reach Guest Services by name + room, and what makes their requests and
      // chats show the physical room. Without it the desk only ever has the type.
      '<div class="bk-frontdesk-hint">' + esc(t("msg.bk.roomNumberHint")) + "</div>";
    const paymentRow = paid
      ? '<div class="bk-frontdesk-row bk-frontdesk-paid">✓ ' + esc(t("msg.bk.paymentReceivedConfirm")) + ": " + esc(bkPaymentLabel(b)) + "</div>"
      : '<div class="bk-frontdesk-row">' +
          '<label class="bkd-label">' + esc(t("msg.bk.payment")) + '</label>' +
          '<select class="bk-frontdesk-select" id="bkdPaymentMethodSelect">' +
            '<option value="cash">' + esc(t("msg.bk.payment.cash")) + "</option>" +
            '<option value="card">' + esc(t("msg.bk.payment.card")) + "</option>" +
            '<option value="promptpay_instore">' + esc(t("msg.bk.payment.promptpay_instore")) + "</option>" +
          "</select>" +
          '<button class="mda-action-btn" id="bkdMarkPaidBtn">' + esc(t("msg.bk.markPaymentReceived")) + "</button>" +
        "</div>";
    return '<div class="bk-frontdesk">' + roomRow + paymentRow + "</div>";
  }

  // Shown in place of the front-desk controls once a booking is cancelled —
  // assigning a room / recording payment on a cancelled booking makes no
  // sense, so this replaces bkFrontDeskHTML() rather than sitting beside it.
  function bkCancellationSummaryHTML(b) {
    const when = b.cancelledAt ? new Date(b.cancelledAt).toLocaleString() : "";
    const by = b.cancelledByName || t("msg.bk.cancelledAuto").replace("{channel}", b.channelName || b.channel || "");
    let html = '<div class="bk-cancel-summary">';
    html += '<div class="bk-cancel-row"><b>' + esc(t("msg.bk.cancelledBy")) + ":</b> " + esc(by) + "</div>";
    if (when) html += '<div class="bk-cancel-row"><b>' + esc(t("msg.bk.cancelledAt")) + ":</b> " + esc(when) + "</div>";
    if (b.cancellationReason) html += '<div class="bk-cancel-row"><b>' + esc(t("msg.bk.cancellationReason")) + ":</b> " + esc(b.cancellationReason) + "</div>";
    html += "</div>";
    return html;
  }

  function wireBkFrontDesk(detailArea, b) {
    const saveRoomBtn = detailArea.querySelector("#bkdSaveRoomBtn");
    if (saveRoomBtn) {
      saveRoomBtn.addEventListener("click", () => {
        const input = detailArea.querySelector("#bkdRoomNumberInput");
        const roomNumber = input ? input.value.trim() : "";
        const API = window.JPark && window.JPark.api;
        if (!API) return;
        saveRoomBtn.disabled = true;
        API.patch("/api/guest-bookings/" + b.id, { roomNumber }).then((r) => {
          if (r && !r.error) {
            updateBookingLocal(b.id, { roomNumber: r.roomNumber });
            renderBookingDetail(b.id);
          } else {
            saveRoomBtn.disabled = false;
          }
        }).catch(() => { saveRoomBtn.disabled = false; });
      });
    }
    const markPaidBtn = detailArea.querySelector("#bkdMarkPaidBtn");
    if (markPaidBtn) {
      markPaidBtn.addEventListener("click", () => {
        const select = detailArea.querySelector("#bkdPaymentMethodSelect");
        const paymentMethod = select ? select.value : "cash";
        const API = window.JPark && window.JPark.api;
        if (!API) return;
        markPaidBtn.disabled = true;
        API.patch("/api/guest-bookings/" + b.id, { paymentMethod }).then((r) => {
          if (r && !r.error) {
            updateBookingLocal(b.id, { paymentMethod: r.paymentMethod, paymentStatus: r.paymentStatus });
            renderBookingDetail(b.id);
          } else {
            markPaidBtn.disabled = false;
          }
        }).catch(() => { markPaidBtn.disabled = false; });
      });
    }
  }

  // "All" sinks cancelled bookings to the bottom rather than interleaving
  // them chronologically with active ones — a dedicated filter tab still
  // sorts purely by recency within its own status.
  //
  // needsReview bookings used to unconditionally float to the very top,
  // ahead of everything else — reasonable when they were rare exceptions,
  // but once auto-imported OTA emails start generating needsReview rows in
  // volume (garbled dates, misread channels, etc.) that buries every clean,
  // already-correct booking — including every Direct (Website) one — under
  // an ever-growing pile, to the point they're effectively unreachable
  // without scrolling past hundreds of rows. Sorting by recency like every
  // other booking keeps needsReview items visible via their existing ⚠
  // row pill / "Needs review" banner instead of via forced position.
  function sortBookings(bookings) {
    // "Needs action" is a worklist, not an inbox: soonest arrival first, so the
    // guest standing at the desk today outranks one arriving next month. Every
    // other tab stays newest-first.
    if (bkFilter === "attention") {
      return bookings.slice().sort((a, b) => {
        const ad = a.checkIn || "9999-12-31";
        const bd = b.checkIn || "9999-12-31";
        if (ad !== bd) return ad < bd ? -1 : 1;
        return b.createdAt - a.createdAt;
      });
    }
    return bookings.slice().sort((a, b) => {
      if (bkFilter === "all") {
        const ac = a.status === "cancelled" ? 1 : 0;
        const bc = b.status === "cancelled" ? 1 : 0;
        if (ac !== bc) return ac - bc;
      }
      return b.createdAt - a.createdAt;
    });
  }

  /* What is still outstanding on a booking, as a list of reason keys (empty
     means nothing needs doing). Each reason is something a person at the desk
     can actually act on, which is why the ordinary pay-at-check-in balance is
     NOT one of them: this property takes payment at check-in by default, so
     "not paid yet" describes almost every future booking and would drown the
     tab in rows nobody needs to touch. It only becomes work once the guest is
     due — or once they chose to pay online and the payment never completed. */
  const BK_ROOM_LEAD_DAYS = 1; // pre-assign a room the day before arrival

  function bookingActionReasons(b) {
    if (!b || b.status === "cancelled") return [];
    const reasons = [];
    // A day-use request is the one booking type that waits on a human to say yes.
    if (b.status === "pending") reasons.push("confirm");
    if (b.needsReview) reasons.push("review");

    // Slice to the date part first — checkIn arrives as a full ISO timestamp,
    // and "2026-07-27T00:00:00.000Z" + "T00:00:00" parses to NaN. Same trap
    // bookingAgeBucket() documents; an unnoticed NaN here silently answers
    // "not due yet" for every booking, emptying this whole tab.
    const today = startOfToday();
    const parsed = b.checkIn ? new Date(String(b.checkIn).slice(0, 10) + "T00:00:00").getTime() : NaN;
    const checkIn = isNaN(parsed) ? null : parsed;
    // An unreadable or absent date is treated as due: better to put one row in
    // front of the desk than to hide a booking nobody can see is unfinished.
    const dueWithin = (days) => checkIn == null || checkIn <= today + days * 86400000;

    if (!b.roomNumber && dueWithin(BK_ROOM_LEAD_DAYS)) reasons.push("room");

    const paid = b.paymentStatus === "paid";
    const onlineIncomplete = bkIsOnlineProvider(b.paymentProvider) && b.paymentStatus === "pending";
    if (onlineIncomplete) reasons.push("payment");
    else if (!paid && dueWithin(0)) reasons.push("payment");

    return reasons;
  }

  /* Settled and ready to walk in: the money is in and a physical room has
     been put against the booking.

     Cancelled bookings are excluded even when they were paid — a cancelled
     reservation nobody is arriving for is not "ready", and leaving it here
     would make the tab's count read as arrivals the desk should expect.

     Note `roomNumber` is the PHYSICAL room. `room` is the room TYPE
     ("Studio Single") and is set on every booking, so testing that instead
     would mark everything ready. */
  function isBookingReady(b) {
    return b.paymentStatus === "paid" && !!b.roomNumber && b.status !== "cancelled";
  }

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function filterBookings(bookings) {
    let out = bookings;
    if (bkFilter === "resent") out = out.filter((b) => !!b.lastAmendedAt);
    else if (bkFilter === "attention") out = out.filter((b) => bookingActionReasons(b).length > 0);
    else if (bkFilter === "ready") out = out.filter(isBookingReady);
    else if (bkFilter !== "all") out = out.filter((b) => b.status === bkFilter);
    const q = bkSearchQuery.trim().toLowerCase();
    if (q) {
      out = out.filter((b) =>
        [b.guestName, b.ref, b.room, b.channelName, b.guestEmail]
          .some((v) => v && String(v).toLowerCase().includes(q))
      );
    }
    return out;
  }

  // How many bookings each tab holds, from the same visible set the list is
  // built from. Shown on the tabs so an empty tab reads as "there are none"
  // rather than "this is broken" — the Guest Requests board already labels its
  // filters this way.
  function bookingFilterCounts() {
    const counts = { all: 0, attention: 0, ready: 0, confirmed: 0, cancelled: 0, resent: 0 };
    getBookingMsgs().forEach((b) => {
      counts.all++;
      if (b.status === "confirmed") counts.confirmed++;
      if (b.status === "cancelled") counts.cancelled++;
      if (b.lastAmendedAt) counts.resent++;
      if (bookingActionReasons(b).length) counts.attention++;
      if (isBookingReady(b)) counts.ready++;
    });
    return counts;
  }

  function renderBookingFilters(container) {
    const bar = document.createElement("div");
    bar.className = "req-filters bk-filters";
    const counts = bookingFilterCounts();
    BK_FILTERS.forEach((f) => {
      const b = document.createElement("button");
      b.className = (f === bkFilter ? "active" : "");
      b.textContent = (f === "all" ? t("staff.requests.filterAll") : t("msg.bk.filter." + f)) +
        " (" + (counts[f] || 0) + ")";
      // Switching status tabs clears any leftover search text — otherwise a
      // search typed while on one tab keeps silently filtering every other
      // tab (e.g. "All" looking like it's missing bookings) with no visible
      // explanation beyond the search box itself still holding the old text.
      b.addEventListener("click", () => {
        if (f !== bkFilter) bkSearchQuery = "";
        bkFilter = f;
        renderBookingList();
      });
      bar.appendChild(b);
    });
    container.appendChild(bar);

    const searchWrap = document.createElement("div");
    searchWrap.className = "bk-search-wrap";
    const search = document.createElement("input");
    search.type = "search";
    search.className = "bk-search-input";
    search.placeholder = t("msg.bk.search.placeholder");
    search.value = bkSearchQuery;
    search.addEventListener("input", () => { bkSearchQuery = search.value; renderBookingList(); });
    searchWrap.appendChild(search);
    container.appendChild(searchWrap);
  }

  // One row, shared by every section (Recent / Older Than 2 Months / Older
  // Than 6 Months) so the row markup and its behavior (open detail, quick
  // star, multi-select) only exist in one place.
  function buildBookingRow(b) {
    const unread = isBookingUnread(b);
    const cancelled = b.status === "cancelled";
    const isSelected = selectedBookingIds.has(b.id);
    const row = document.createElement("div");
    row.className = "msg-row booking channel-" + b.channel +
      (unread ? " unread" : " read") + (cancelled ? " cancelled" : "") +
      (b.needsReview ? " needs-review" : "") + (b.starred ? " starred-row" : "") +
      (isSelected ? " selected" : "") + (bkMultiSelect ? " selectable" : "");
    row.dataset.id = b.id;
    const initial = (b.channelName || "?").charAt(0).toUpperCase();
    const preview = (b.room ? b.room + " · " : "") + bookingDateRange(b) + " · " + b.ref;
    // Icon-only in the fixed-width sender column (a full-text pill can get
    // silently clipped by its overflow:hidden alongside a long channel
    // name) — the full "Needs review" wording is always shown in the
    // detail view's banner, this is just a scan-the-list flag.
    const reviewBadge = b.needsReview
      ? '<span class="bk-row-pill review" title="' + esc(t("msg.bk.needsReview")) + '">⚠</span>' : "";
    const statusPill = cancelled ? '<span class="bk-row-pill">' + esc(t("msg.bk.status.cancelled")) + "</span>" : "";
    const labelTag = b.staffLabel
      ? '<span class="bk-row-pill label" title="' + esc(b.staffLabel) + '">🏷 ' + esc(b.staffLabel) + "</span>" : "";
    const amendedTag = b.lastAmendedAt
      ? '<span class="bk-row-pill amended" title="' + esc(t("msg.bk.amended")) + '">✎ ' + esc(t("msg.bk.amended")) + "</span>" : "";
    // Multi-room booking: a "Room X/N" link pill so staff can see at a glance
    // that this row is one room of a larger booking (they all share groupRef).
    const groupTag = b.groupRef
      ? '<span class="bk-row-pill group" title="' + esc(b.groupRef) + '">🔗 ' +
          esc(t("msg.bk.groupRoomOf").replace("{i}", String(b.groupIndex || "?")).replace("{n}", String(b.groupSize || "?"))) + "</span>"
      : "";
    // Room-assigned / payment-recorded pills — front-desk-only concept, so
    // scoped to direct-channel bookings (same scoping as wireBkFrontDesk)
    // and skipped once cancelled (nothing left to follow up on).
    let frontDeskPills = "";
    if (b.channel === "direct" && !cancelled) {
      const roomOk = !!b.roomNumber;
      const paidOk = b.paymentStatus === "paid";
      // An outstanding item that has become the desk's problem — the guest is
      // arriving, or an online payment stalled — is drawn as overdue rather
      // than merely "not done yet", so scanning the list shows what is actually
      // late instead of every future booking looking equally unfinished.
      const reasons = bookingActionReasons(b);
      const roomCls = roomOk ? "ok" : (reasons.indexOf("room") >= 0 ? "due" : "pending");
      const paidCls = paidOk ? "ok" : (reasons.indexOf("payment") >= 0 ? "due" : "pending");
      const confirmPill = reasons.indexOf("confirm") >= 0
        ? '<span class="bk-row-pill fd-status due" title="' + esc(t("msg.bk.why.confirm")) + '">⏳ ' +
            esc(t("msg.bk.why.confirmShort")) + "</span>"
        : "";
      frontDeskPills = confirmPill +
        '<span class="bk-row-pill fd-status ' + roomCls + '" title="' +
          esc(t(roomOk ? "msg.bk.roomAssigned" : "msg.bk.roomPending")) + '">' +
          (roomOk ? "✓" : "—") + " " + esc(t("msg.bk.roomShort")) + "</span>" +
        '<span class="bk-row-pill fd-status ' + paidCls + '" title="' +
          esc(t(paidOk ? "msg.bk.paymentRecorded" : "msg.bk.paymentPending")) + '">' +
          (paidOk ? "✓" : "—") + " " + esc(t("msg.bk.paidShort")) + "</span>";
    }

    const firstCol = bkMultiSelect
      ? '<div class="mr-check"><input type="checkbox" class="mr-checkbox" tabindex="-1"' + (isSelected ? " checked" : "") + "></div>"
      : '<div class="mr-avatar bk-avatar"><span>' + esc(initial) + "</span></div>";

    // The pills live in their own column rather than trailing the channel name
    // in the fixed 180px sender cell, where everything past "Direct (Website)"
    // was silently cut off by that cell's overflow:hidden — the room/payment
    // state was in the DOM but invisible on every row, which is no use to
    // someone scanning the list for what still needs doing.
    row.innerHTML =
      firstCol +
      '<div class="mr-sender">' + reviewBadge + esc(b.channelName) + "</div>" +
      '<div class="mr-subject-preview">' +
        '<span class="mr-subject">' + esc(b.guestName) + "</span>" +
        '<span class="mr-sep">—</span>' +
        '<span class="mr-preview">' + esc(preview) + "</span>" +
      "</div>" +
      '<div class="mr-flags">' + statusPill + labelTag + amendedTag + groupTag + frontDeskPills + "</div>" +
      '<div class="mr-time">' +
        '<button type="button" class="bk-row-star' + (b.starred ? " starred" : "") + '" title="' +
          esc(t(b.starred ? "msg.bk.unstar" : "msg.bk.star")) + '">' + (b.starred ? "★" : "☆") + "</button>" +
        '<span class="mr-time-text">' + esc(formatMsgTime(b.createdAt)) + "</span>" +
      "</div>";

    const starBtn = row.querySelector(".bk-row-star");
    starBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const nowStarred = toggleStar(b.id, "booking");
      starBtn.className = "bk-row-star" + (nowStarred ? " starred" : "");
      starBtn.textContent = nowStarred ? "★" : "☆";
      starBtn.title = t(nowStarred ? "msg.bk.unstar" : "msg.bk.star");
      row.classList.toggle("starred-row", nowStarred);
    });

    row.addEventListener("click", () => {
      if (bkMultiSelect) {
        if (selectedBookingIds.has(b.id)) selectedBookingIds.delete(b.id);
        else selectedBookingIds.add(b.id);
        renderBookingList();
        return;
      }
      msgPrevView = "bookings";
      msgDetailId = b.id;
      msgDetailKind = "booking";
      msgView = "detail";
      markBookingRead(b.id);
      renderMessages();
    });
    return row;
  }

  // Collapsible header for the "Older Than N Months" archive sections —
  // click anywhere to expand/collapse, click the pencil to rename. Built
  // entirely with real nodes/appendChild (never innerHTML on a container
  // that already holds listener-bearing children — see the list-lockup fix
  // above for why that matters).
  function buildBkSectionHeader(key, count) {
    const collapsed = !!bkSectionPrefs.collapsed[key];
    const header = document.createElement("div");
    header.className = "bk-section-header" + (collapsed ? " collapsed" : "");

    const chevron = document.createElement("span");
    chevron.className = "bsh-chevron";
    chevron.textContent = collapsed ? "▸" : "▾";
    const labelSpan = document.createElement("span");
    labelSpan.className = "bsh-label";
    labelSpan.textContent = bkSectionLabel(key);
    const countSpan = document.createElement("span");
    countSpan.className = "bsh-count";
    countSpan.textContent = String(count);
    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "bsh-rename";
    renameBtn.title = t("msg.bk.section.rename");
    renameBtn.textContent = "✎";

    header.appendChild(chevron);
    header.appendChild(labelSpan);
    header.appendChild(countSpan);
    header.appendChild(renameBtn);

    header.addEventListener("click", (e) => {
      if (e.target === renameBtn || e.target.tagName === "INPUT") return;
      bkSectionPrefs.collapsed[key] = !collapsed;
      saveBkSectionPrefs();
      renderBookingList();
    });
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startBkSectionRename(key, labelSpan);
    });
    return header;
  }

  function startBkSectionRename(key, labelSpan) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "bsh-rename-input";
    input.maxLength = 40;
    input.value = bkSectionLabel(key);
    input.addEventListener("click", (e) => e.stopPropagation());
    labelSpan.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    function save() {
      if (done) return;
      done = true;
      const val = input.value.trim();
      if (val) bkSectionPrefs.labels[key] = val;
      else delete bkSectionPrefs.labels[key];
      saveBkSectionPrefs();
      renderBookingList();
    }
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); save(); }
      else if (e.key === "Escape") { e.preventDefault(); done = true; renderBookingList(); }
    });
    input.addEventListener("blur", save);
  }

  function renderBookingList() {
    const listArea = document.getElementById("msgListArea");
    const allBookings = getBookingMsgs();
    const bookings = sortBookings(filterBookings(allBookings));

    const buckets = { recent: [], older2: [], older6: [] };
    bookings.forEach((b) => { buckets[bookingAgeBucket(b)].push(b); });

    const countLabel = allBookings.length ? '<span class="mlh-count">' + allBookings.length + "</span>" : "";
    const selectBtnHtml = bookings.length
      ? (bkMultiSelect
        ? '<button class="mlh-select-btn active" id="bkSelectToggle">✕ ' + esc(t("msg.deselect.all")) + "</button>"
        : '<button class="mlh-select-btn" id="bkSelectToggle">' + esc(t("msg.select")) + "</button>")
      : "";
    listArea.innerHTML = '<div class="msg-list-header">' + esc(t("msg.bookings")) + countLabel + selectBtnHtml + "</div>" +
      // Says what this inbox holds. Staff kept reading an empty list as a
      // failure to pull in Agoda/Booking.com reservations, which this view
      // deliberately does not show (see SHOW_OTA_BOOKINGS).
      '<div class="msg-list-lede">' + esc(t("msg.bk.lede")) + "</div>";
    renderBookingFilters(listArea);

    if (bkMultiSelect && bookings.length) {
      const n = selectedBookingIds.size;
      const allSelected = n === bookings.length;
      const bulkBar = document.createElement("div");
      bulkBar.className = "msg-bulk-bar";
      bulkBar.innerHTML =
        '<span class="mbb-count">' + n + " " + esc(t("msg.select")) + "ed</span>" +
        '<button class="mbb-btn" id="bkMbbSelectAll">' + esc(t(allSelected ? "msg.deselect.all" : "msg.select.all")) + "</button>" +
        '<button class="mbb-btn mbb-star" id="bkMbbStar"' + (n === 0 ? " disabled" : "") + ">☆ " + esc(t("msg.bulk.star")) + "</button>" +
        (isAdmin() ? '<button class="mbb-btn mbb-delete" id="bkMbbDelete"' + (n === 0 ? " disabled" : "") + ">🗑 " + esc(t("msg.bulk.delete")) + "</button>" : "");
      listArea.appendChild(bulkBar);
    }

    // Built as real nodes and appendChild'd throughout (never `innerHTML +=`
    // after renderBookingFilters()/the bulk bar above have appended live
    // listener-bearing DOM — see the list-lockup fix for why that matters).
    if (!bookings.length) {
      const empty = document.createElement("div");
      empty.className = "msg-empty";
      // Say why THIS tab is empty. The old text explained the inbox as a whole
      // ("bookings from Agoda, Booking.com, Airbnb…") on every tab, which read
      // as a fault on any of the status tabs — an empty Pending tab appeared to
      // be failing to load OTA bookings, when in truth nothing was awaiting
      // confirmation and OTA rows are deliberately not shown here at all.
      const emptySubKey = bkSearchQuery.trim()
        ? "msg.bk.empty.noMatch"
        : "msg.bk.empty." + bkFilter;
      empty.innerHTML =
        '<div class="me-ico">🛎️</div>' +
        '<div class="me-title">' + esc(t("msg.empty.title")) + "</div>" +
        '<div class="me-sub">' + esc(t(emptySubKey)) + "</div>";
      listArea.appendChild(empty);
      wireBookingListControls(listArea, bookings);
      return;
    }

    const hasOlder = buckets.older2.length > 0 || buckets.older6.length > 0;
    if (hasOlder && buckets.recent.length) {
      const recentLabel = document.createElement("div");
      recentLabel.className = "bk-section-label-only";
      recentLabel.textContent = bkSectionLabel("recent");
      listArea.appendChild(recentLabel);
    }
    buckets.recent.forEach((b) => listArea.appendChild(buildBookingRow(b)));

    ["older2", "older6"].forEach((key) => {
      const items = buckets[key];
      if (!items.length) return;
      listArea.appendChild(buildBkSectionHeader(key, items.length));
      if (!bkSectionPrefs.collapsed[key]) {
        items.forEach((b) => listArea.appendChild(buildBookingRow(b)));
      }
    });

    wireBookingListControls(listArea, bookings);
  }

  function wireBookingListControls(listArea, bookings) {
    const selectToggle = document.getElementById("bkSelectToggle");
    if (selectToggle) {
      selectToggle.addEventListener("click", () => {
        bkMultiSelect = !bkMultiSelect;
        if (!bkMultiSelect) selectedBookingIds.clear();
        renderBookingList();
      });
    }
    if (!bkMultiSelect) return;

    const selectAllBtn = document.getElementById("bkMbbSelectAll");
    if (selectAllBtn) {
      selectAllBtn.addEventListener("click", () => {
        if (selectedBookingIds.size === bookings.length) selectedBookingIds.clear();
        else bookings.forEach((b) => selectedBookingIds.add(b.id));
        renderBookingList();
      });
    }
    const starBtn = document.getElementById("bkMbbStar");
    if (starBtn) {
      starBtn.addEventListener("click", () => {
        if (!selectedBookingIds.size) return;
        selectedBookingIds.forEach((id) => toggleStar(id, "booking"));
        renderBookingList();
      });
    }
    const deleteBtn = document.getElementById("bkMbbDelete");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        if (!selectedBookingIds.size || !isAdmin()) return;
        if (!confirm(t("msg.bk.bulk.delete.confirm"))) return;
        const API = window.JPark && window.JPark.api;
        const ids = Array.from(selectedBookingIds);
        deleteBtn.disabled = true;
        Promise.all(ids.map((id) =>
          (API ? API.del("/api/guest-bookings/" + id) : Promise.resolve({ error: "offline" })).then((r) => {
            if (!r || !r.error || r.offline) S.remove("guestBookings", id);
          })
        )).then(() => {
          selectedBookingIds.clear();
          bkMultiSelect = false;
          renderMessages();
        });
      });
    }
  }

  function bookingField(labelKey, value) {
    if (value == null || value === "") return "";
    return '<div class="bkd-row"><span class="bkd-label">' + esc(t(labelKey)) + "</span>" +
      '<span class="bkd-value">' + esc(value) + "</span></div>";
  }

  // A short, private, staff-only note/nickname on a booking (e.g. "VIP —
  // call before arrival"), purely for internal organization — never sent to
  // the guest or included in any OTA-facing data. Click-to-edit inline;
  // built with appendChild throughout (not innerHTML +=) so re-rendering the
  // view never strips a listener bound earlier in the same render pass (see
  // the Guest Booking list-lockup fix for why that matters).
  function renderBkLabelBlock(container, b) {
    if (!container) return;
    container.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "bk-staff-label";

    function showView() {
      wrap.innerHTML = "";
      const icon = document.createElement("span");
      icon.className = "bkl-icon";
      icon.textContent = "🏷";
      const text = document.createElement("span");
      text.className = "bkl-text" + (b.staffLabel ? "" : " bkl-placeholder");
      text.textContent = b.staffLabel || t("msg.bk.label.placeholder");
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "bkl-edit";
      editBtn.title = t("msg.bk.label.edit");
      editBtn.textContent = "✎";
      editBtn.addEventListener("click", showEdit);
      wrap.appendChild(icon);
      wrap.appendChild(text);
      wrap.appendChild(editBtn);
    }

    function showEdit() {
      wrap.innerHTML = "";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "bkl-input";
      input.maxLength = 120;
      input.placeholder = t("msg.bk.label.placeholder");
      input.value = b.staffLabel || "";
      wrap.appendChild(input);
      input.focus();
      input.select();

      let saved = false;
      function save() {
        if (saved) return;
        saved = true;
        const val = input.value.trim();
        if (val !== (b.staffLabel || "")) {
          b.staffLabel = val || null;
          updateBookingLocal(b.id, { staffLabel: b.staffLabel });
          const API = window.JPark && window.JPark.api;
          if (API) {
            API.patch("/api/guest-bookings/" + b.id, { staffLabel: val }).then((r) => {
              if (r && !r.error) updateBookingLocal(b.id, r);
            }).catch(() => {});
          }
        }
        showView();
      }
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); save(); }
        else if (e.key === "Escape") { e.preventDefault(); saved = true; showView(); }
      });
      input.addEventListener("blur", save);
    }

    showView();
    container.appendChild(wrap);
  }

  // The guest's special request on a booking (late arrival, high floor,
  // allergies…). Unlike the private staff label above, this is guest-facing:
  // it's what the confirmation email shows and what a resend would include.
  // Editable inline so front desk can capture a request phoned in after
  // booking, or surface one that arrived buried in an OTA confirmation.
  // Same appendChild-only rebuild discipline as renderBkLabelBlock().
  function renderBkSpecialRequestBlock(container, b) {
    if (!container) return;
    container.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "bk-special-req";

    function showView() {
      wrap.innerHTML = "";
      const icon = document.createElement("span");
      icon.className = "bksr-icon";
      icon.textContent = "📝";
      const body = document.createElement("div");
      body.className = "bksr-body";
      const label = document.createElement("span");
      label.className = "bksr-label";
      label.textContent = t("msg.bk.specialRequests");
      const text = document.createElement("span");
      text.className = "bksr-text" + (b.specialRequests ? "" : " bksr-placeholder");
      text.textContent = b.specialRequests || t("msg.bk.specialReq.placeholder");
      body.appendChild(label);
      body.appendChild(text);
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "bksr-edit";
      editBtn.title = t("msg.bk.specialReq.edit");
      editBtn.textContent = "✎";
      editBtn.addEventListener("click", showEdit);
      wrap.appendChild(icon);
      wrap.appendChild(body);
      wrap.appendChild(editBtn);
    }

    function showEdit() {
      wrap.innerHTML = "";
      const input = document.createElement("textarea");
      input.className = "bksr-input";
      input.maxLength = 1000;
      input.rows = 2;
      input.placeholder = t("msg.bk.specialReq.placeholder");
      input.value = b.specialRequests || "";
      wrap.appendChild(input);
      input.focus();
      input.select();

      let saved = false;
      function save() {
        if (saved) return;
        saved = true;
        const val = input.value.trim();
        if (val === (b.specialRequests || "")) { showView(); return; }
        b.specialRequests = val || null;
        updateBookingLocal(b.id, { specialRequests: b.specialRequests });
        showView();
        const API = window.JPark && window.JPark.api;
        if (!API) return;
        const patchP = API.patch("/api/guest-bookings/" + b.id, { specialRequests: val })
          .then((r) => { if (r && !r.error) updateBookingLocal(b.id, r); return r; })
          .catch(() => {});
        // Editing the request doesn't email the guest by itself — the request
        // shows on the confirmation, so offer to resend it (with the updated
        // text) once the edit is saved. Only when there's an address to send to
        // and the booking is still active.
        if (b.guestEmail && b.status !== "cancelled" && confirm(t("msg.bk.specialReq.resendPrompt"))) {
          patchP
            .then(() => API.post("/api/guest-bookings/" + b.id + "/resend-confirmation", {}))
            .then((r) => {
              if (r && !r.error) {
                if (r.booking) updateBookingLocal(b.id, r.booking);
                renderBookingDetail(b.id);
                U.toast(t("msg.bk.resend.sent").replace("{email}", b.guestEmail || ""), "success");
              } else {
                U.toast((r && r.error) || t("msg.bk.resend.failed"), "error");
              }
            })
            .catch(() => U.toast(t("msg.bk.resend.failed"), "error"));
        }
      }
      // Enter inserts a newline in a request (multi-line is fine); save on blur,
      // Escape cancels — mirrors the resend editor's textarea handling.
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); saved = true; showView(); }
      });
      input.addEventListener("blur", save);
    }

    showView();
    container.appendChild(wrap);
  }

  // Renders the "Sent Emails" list for one booking. Each entry is a
  // collapsible row (mirrors the Account Logs session-group pattern) that
  // expands to the exact subject/body that was sent, so staff can verify
  // what a guest actually received instead of just that a send was attempted.
  function renderEmailLogList(listEl, rows) {
    if (!rows.length) {
      listEl.innerHTML = '<div class="bk-emaillog-empty">' + esc(t("msg.bk.emailLog.empty")) + "</div>";
      return;
    }
    listEl.innerHTML = rows.map((e) => {
      const statusClass = e.status === "sent" ? "sent" : (e.status === "failed" ? "failed" : "skipped");
      const kindLabel = t("msg.bk.emailLog.kind." + (e.kind || "other")) || t("msg.bk.emailLog.kind.other");
      const by = e.sentByName ? esc(e.sentByName) : esc(t("msg.bk.emailLog.systemSender"));
      return (
        '<details class="bk-emaillog-row">' +
          "<summary>" +
            '<span class="bk-emaillog-status ' + statusClass + '">' + esc(t("msg.bk.emailLog.status." + statusClass)) + "</span>" +
            '<span class="bk-emaillog-subject">' + esc(e.subject || "") + "</span>" +
            '<span class="bk-emaillog-time">' + esc(new Date(e.createdAt).toLocaleString()) + "</span>" +
          "</summary>" +
          '<div class="bk-emaillog-meta">' +
            esc(kindLabel) + " · " + esc(t("msg.bk.emailLog.to")) + " " + esc(e.to || "") +
            " · " + esc(t("msg.bk.emailLog.by")) + " " + by +
            (statusClass === "failed" && e.error ? " · " + esc(t("msg.bk.emailLog.error")) + " " + esc(e.error) : "") +
          "</div>" +
          '<div class="bk-emaillog-body">' + esc(e.body || "") + "</div>" +
        "</details>"
      );
    }).join("");
  }

  // Banner at the top of a multi-room booking's detail: names the booking
  // group + its grand total, with a clickable chip per room so staff can jump
  // between the rooms of one booking. Cancelled rooms are marked.
  function bkGroupBannerHTML(b, siblings, grandTotal) {
    const chips = siblings.map(function (s) {
      const idx = s.groupIndex || "?";
      const label = idx + ". " + esc(s.room || "—") + (s.status === "cancelled" ? " ✕" : "");
      const cls = "bk-group-chip" + (s.id === b.id ? " active" : "") + (s.status === "cancelled" ? " cancelled" : "");
      return '<button type="button" class="' + cls + '" data-group-open="' + esc(s.id) + '"' + (s.id === b.id ? " disabled" : "") + ">" + label + "</button>";
    }).join("");
    const totalStr = grandTotal ? (b.currency || "THB") + " " + Number(grandTotal).toLocaleString() : "";
    return '<div class="bk-group-banner">' +
      '<div class="bk-group-banner-title">🔗 ' +
        esc(t("msg.bk.groupBanner").replace("{n}", String(siblings.length))) + " — " + esc(b.groupRef) +
        (totalStr ? ' · <span class="bk-group-grand">' + esc(t("msg.bk.groupGrandTotal")) + ": " + esc(totalStr) + "</span>" : "") +
      "</div>" +
      '<div class="bk-group-chips">' + chips + "</div>" +
    "</div>";
  }

  function renderBookingDetail(id) {
    // Self-heal: navigating to a different booking (or one no longer open
    // for editing) always clears any stale in-progress-edit guard.
    if (bkResendEditingId !== id) bkResendEditingId = null;
    if (bkEmailLogOpenId !== id) bkEmailLogOpenId = null;
    const b = getBookingMsgs().find((x) => x.id === id);
    const detailArea = document.getElementById("msgDetail");
    if (!b) { detailArea.innerHTML = ""; return; }

    const totalStr = b.total != null ? (b.currency || "THB") + " " + Number(b.total).toLocaleString() : "";
    const initial = (b.channelName || "?").charAt(0).toUpperCase();
    const recipientName = session ? session.name : "";
    const bkIsStarred = !!b.starred;

    // Every room of a multi-room booking shares one groupRef. Gather the
    // siblings (from the same local store) so the detail can show the whole
    // booking and offer a cancel-the-whole-booking action.
    const groupSiblings = b.groupRef
      ? getBookingMsgs().filter((x) => x.groupRef === b.groupRef).sort((a, c) => (a.groupIndex || 0) - (c.groupIndex || 0))
      : [];
    const groupHasActive = groupSiblings.some((s) => s.status !== "cancelled");
    const groupGrandTotal = groupSiblings.reduce((s, x) => s + (x.total != null ? Number(x.total) : 0), 0);

    let fields = "";
    fields += bookingField("msg.bk.guest", b.guestName);
    fields += bookingField("msg.bk.email", b.guestEmail);
    fields += bookingField("msg.bk.phone", b.guestPhone);
    fields += bookingField("msg.bk.ref", b.ref);
    if (b.groupRef) {
      fields += bookingField("msg.bk.group",
        b.groupRef + " · " + t("msg.bk.groupRoomOf").replace("{i}", String(b.groupIndex || "?")).replace("{n}", String(b.groupSize || "?")));
    }
    fields += bookingField("msg.bk.room", b.room);
    fields += bookingField("msg.bk.roomNumber", b.roomNumber);
    fields += bookingField("msg.bk.checkin", fmtBookingDate(b.checkIn));
    fields += bookingField("msg.bk.checkout", fmtBookingDate(b.checkOut));
    fields += bookingField("msg.bk.nights", b.nights);
    fields += bookingField("msg.bk.adults", b.adults);
    if (b.children) {
      const ages = Array.isArray(b.childAges) && b.childAges.length ? " (" + b.childAges.join(", ") + ")" : "";
      fields += bookingField("msg.bk.children", b.children + ages);
    }
    fields += bookingField("msg.bk.smokingPref", t("msg.bk.smokingPref." + (b.smokingPreference || "non_smoking")));
    fields += bookingField("msg.bk.breakfast", t(b.breakfast ? "msg.bk.breakfast.yes" : "msg.bk.breakfast.no"));
    if (b.extraBed) fields += bookingField("msg.bk.extraBed", t("msg.bk.breakfast.yes"));
    if (b.nonRefundable) fields += bookingField("msg.bk.nonRefundable", t("msg.bk.breakfast.yes"));
    /* The bill split, shown only when there is a split to show. `total` is
       what the guest was charged; `roomTotal` is what the hotel earns on the
       stay. A front-desk conversation about a price is always about the room
       rate, so it has to be on the panel next to the amount that reached the
       card — otherwise staff are left subtracting. */
    if (Number(b.paymentSurcharge || 0) > 0 && b.roomTotal != null) {
      const cur = (b.currency || "THB") + " ";
      fields += bookingField("msg.bk.roomTotal", cur + Number(b.roomTotal).toLocaleString());
      fields += bookingField("msg.bk.surcharge", cur + Number(b.paymentSurcharge).toLocaleString());
    }
    fields += bookingField("msg.bk.total", totalStr);
    fields += bookingField("msg.bk.payment", bkPaymentLabel(b));
    fields += bookingField("msg.bk.statusLabel", bkStatusLabel(b.status));

    detailArea.innerHTML =
      '<button class="msg-detail-back" id="msgDetailBack">← ' + esc(t("msg.back")) + "</button>" +
      '<div class="msg-detail-subject">' + esc(t("msg.bk.subject") + " · " + b.channelName) + "</div>" +
      '<div class="msg-detail-meta">' +
        '<div class="mda-avatar bk-avatar channel-' + esc(b.channel) + '"><span>' + esc(initial) + "</span></div>" +
        '<div class="mda-info">' +
          '<div class="mda-from">' + esc(b.channelName) +
            ' <span class="mda-email">&lt;' + esc(b.channelEmail || "") + "&gt;</span></div>" +
          '<div class="mda-to">' + esc(t("msg.bk.to")) + " <b>" + esc(recipientName) + "</b></div>" +
        "</div>" +
        '<div class="mda-time">' + esc(new Date(b.createdAt).toLocaleString()) + "</div>" +
      "</div>" +
      (b.needsReview ? '<div class="bk-review-banner">⚠ ' + esc(t("msg.bk.needsReview")) + ' — ' + esc(t("msg.bk.needsReview.note")) + "</div>" : "") +
      (b.lastAmendedAt ? '<div class="bk-amended-banner">✎ ' + esc(t("msg.bk.amended")) + ' — ' + esc(t("msg.bk.amended.note")) + " " + esc(new Date(b.lastAmendedAt).toLocaleString()) + "</div>" : "") +
      (b.groupRef && groupSiblings.length > 1 ? bkGroupBannerHTML(b, groupSiblings, groupGrandTotal) : "") +
      '<div class="bk-staff-label-slot"></div>' +
      '<div class="bk-special-req-slot"></div>' +
      '<div class="bk-detail-grid">' + fields + "</div>" +
      // The full payment record — filled in asynchronously, because it is
      // deliberately not carried on the polled list. See renderBkPaymentBlock.
      '<div class="bk-payment-slot"></div>' +
      (b.status === "cancelled" ? bkCancellationSummaryHTML(b) : (b.channel === "direct" ? bkFrontDeskHTML(b) : "")) +
      '<div class="bk-confirm-label">' + esc(t("msg.bk.confirmation")) + "</div>" +
      '<div class="tr-note msg-tr-note" style="display:none"></div>' +
      '<div class="msg-detail-body bk-confirm-body"></div>' +
      '<div class="msg-detail-actions">' +
        '<button class="mda-action-btn" id="mdaBkForward">↪ ' + esc(t("msg.forward")) + "</button>" +
        '<button class="mda-action-btn mda-star-btn' + (bkIsStarred ? " starred" : "") + '" id="mdaBkStar">' +
          (bkIsStarred ? "★ " + esc(t("msg.unstar")) : "☆ " + esc(t("msg.star"))) +
        "</button>" +
        (b.guestEmail && b.status !== "cancelled"
          ? '<button class="mda-action-btn" id="mdaBkResend">✉ ' + esc(t("msg.bk.resend")) + "</button>" : "") +
        (b.guestEmail
          ? '<button class="mda-action-btn" id="mdaBkEmailLog">📧 ' + esc(t("msg.bk.emailLog")) + "</button>" : "") +
        (b.status === "cancelled"
          ? '<button class="mda-action-btn mda-reopen-btn" id="mdaBkCancel">↺ ' + esc(t("msg.bk.reopen")) + "</button>"
          : '<button class="mda-action-btn mda-cancel-btn" id="mdaBkCancel">✕ ' + esc(t("msg.bk.cancel")) + "</button>") +
        (b.groupRef && groupHasActive
          ? '<button class="mda-action-btn mda-cancel-btn" id="mdaBkCancelGroup">✕ ' + esc(t("msg.bk.cancelAll")) + "</button>" : "") +
        (isAdmin() ? '<button class="mda-action-btn mda-delete-btn" id="mdaBkDelete">🗑 ' + esc(t("msg.delete")) + "</button>" : "") +
      "</div>" +
      (isAdmin() ? '<div class="mda-delete-hint">' + esc(t("msg.bk.delete.adminHint")) + "</div>" : "") +
      '<div class="bk-resend-editor" id="bkResendEditor" hidden>' +
        '<div class="bk-resend-header">' +
          '<div class="bk-resend-header-icon">✉</div>' +
          '<div class="bk-resend-header-text">' +
            '<div class="bk-resend-title">' + esc(t("msg.bk.resend.title")) + "</div>" +
            '<p class="bk-resend-hint">' + esc(t("msg.bk.resend.editHint")) + "</p>" +
          "</div>" +
        "</div>" +
        '<div class="bk-resend-to">' + esc(t("msg.bk.resend.sendingTo")) +
          ' <span class="bk-resend-to-email">' + esc(b.guestEmail || "") + "</span></div>" +
        '<div class="bk-resend-field">' +
          '<label for="bkResendSubject">' + esc(t("msg.bk.resend.subject")) + "</label>" +
          '<input type="text" class="bk-resend-subject" id="bkResendSubject">' +
        "</div>" +
        '<div class="bk-resend-field bk-resend-field-body">' +
          '<label for="bkResendBody">' + esc(t("msg.bk.resend.body")) + "</label>" +
          '<textarea class="bk-resend-body" id="bkResendBody" rows="12"></textarea>' +
        "</div>" +
        '<div class="bk-resend-actions">' +
          '<button type="button" class="bk-resend-btn bk-resend-btn-ghost" id="bkResendCancel">' + esc(t("msg.bk.resend.cancel")) + "</button>" +
          '<button type="button" class="bk-resend-btn bk-resend-btn-gold" id="bkResendSend">' + esc(t("msg.bk.resend.send")) + "</button>" +
        "</div>" +
      "</div>" +
      '<div class="bk-emaillog-panel" id="bkEmailLogPanel"' + (bkEmailLogOpenId === id ? "" : " hidden") + '>' +
        '<div class="bk-emaillog-list" id="bkEmailLogList"></div>' +
      "</div>";

    // Confirmation body: show the original text, then auto-translate it into
    // the reader's language with a single "translated from X" note.
    const bodyEl = detailArea.querySelector(".bk-confirm-body");
    const noteEl = detailArea.querySelector(".msg-tr-note");
    ensureBookingConfirmation(b).then(function (confirmation) {
      if (!bodyEl.isConnected) return;
      bodyEl.textContent = confirmation || "";
      const cur = I.getLang();
      if (confirmation && (!b.lang || b.lang !== cur)) {
        J.translate.text(confirmation, cur).then((res) => {
          if (bodyEl.isConnected && res.src && res.src !== cur && res.text && res.text !== confirmation) {
            bodyEl.textContent = res.text;
            noteEl.textContent = t("tr.from") + " " + J.translate.langName(res.src);
            noteEl.style.display = "";
          }
        });
      }
    });

    renderBkPaymentBlock(detailArea.querySelector(".bk-payment-slot"), b);
    renderBkLabelBlock(detailArea.querySelector(".bk-staff-label-slot"), b);
    renderBkSpecialRequestBlock(detailArea.querySelector(".bk-special-req-slot"), b);

    if (b.status !== "cancelled" && b.channel === "direct") wireBkFrontDesk(detailArea, b);

    detailArea.querySelector("#mdaBkForward").addEventListener("click", () => openForwardBooking(b));
    detailArea.querySelector("#mdaBkStar").addEventListener("click", () => {
      const nowStarred = toggleStar(b.id, "booking");
      const btn = detailArea.querySelector("#mdaBkStar");
      if (btn) {
        btn.className = "mda-action-btn mda-star-btn" + (nowStarred ? " starred" : "");
        btn.textContent = (nowStarred ? "★ " : "☆ ") + t(nowStarred ? "msg.unstar" : "msg.star");
      }
      updateBadges();
    });

    const bkCancelBtn = detailArea.querySelector("#mdaBkCancel");
    if (bkCancelBtn) {
      bkCancelBtn.addEventListener("click", () => {
        const API = window.JPark && window.JPark.api;
        if (!API) return;
        if (b.status === "cancelled") {
          if (!confirm(t("msg.bk.reopen.confirm"))) return;
          bkCancelBtn.disabled = true;
          API.post("/api/guest-bookings/" + b.id + "/reopen", {}).then((r) => {
            if (r && !r.error) {
              updateBookingLocal(b.id, r);
              renderBookingDetail(b.id);
            } else {
              bkCancelBtn.disabled = false;
              U.toast(r && r.status === 409 ? t("msg.bk.reopen.unavailable") : ((r && r.error) || t("msg.bk.reopen.unavailable")), "error");
            }
          }).catch(() => { bkCancelBtn.disabled = false; });
        } else {
          if (!confirm(t("msg.bk.cancel.confirm"))) return;
          const reason = prompt(t("msg.bk.cancel.reasonPrompt"), "") || undefined;
          bkCancelBtn.disabled = true;
          API.post("/api/guest-bookings/" + b.id + "/cancel", { reason }).then((r) => {
            if (r && !r.error) {
              const booking = r.booking || r;
              updateBookingLocal(b.id, booking);
              renderBookingDetail(b.id);
            } else {
              bkCancelBtn.disabled = false;
            }
          }).catch(() => { bkCancelBtn.disabled = false; });
        }
      });
    }

    // Multi-room: chips in the group banner jump between the rooms of this booking.
    detailArea.querySelectorAll("[data-group-open]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        const targetId = chip.getAttribute("data-group-open");
        msgDetailId = targetId;
        msgDetailKind = "booking";
        markBookingRead(targetId);
        renderBookingDetail(targetId);
      });
    });

    // Cancel the ENTIRE booking (every room) in one action — the backend group
    // cancel route sends the guest ONE cancellation email for the whole booking
    // instead of one per room, and marks each room cancelled in a transaction.
    const bkCancelGroupBtn = detailArea.querySelector("#mdaBkCancelGroup");
    if (bkCancelGroupBtn) {
      bkCancelGroupBtn.addEventListener("click", () => {
        const API = window.JPark && window.JPark.api;
        if (!API || !b.groupRef) return;
        if (!confirm(t("msg.bk.cancelAll.confirm"))) return;
        const reason = prompt(t("msg.bk.cancel.reasonPrompt"), "") || undefined;
        bkCancelGroupBtn.disabled = true;
        API.post("/api/guest-bookings/group/" + encodeURIComponent(b.groupRef) + "/cancel", { reason }).then((r) => {
          if (r && !r.error) {
            if (Array.isArray(r.bookings)) r.bookings.forEach((bk) => updateBookingLocal(bk.id, bk));
            renderBookingDetail(b.id);
          } else {
            bkCancelGroupBtn.disabled = false;
            U.toast((r && r.error) || t("msg.bk.resend.failed"), "error");
          }
        }).catch(() => { bkCancelGroupBtn.disabled = false; });
      });
    }

    // Resend confirmation now opens an editable preview instead of sending
    // immediately — lets staff correct an error (e.g. a wrong price, like
    // the 2026-07 breakfast-pricing bug) before the guest sees it, rather
    // than only being able to re-fire the auto-generated template verbatim.
    const bkResendBtn = detailArea.querySelector("#mdaBkResend");
    const bkResendEditor = detailArea.querySelector("#bkResendEditor");
    if (bkResendBtn && bkResendEditor) {
      const subjectEl = bkResendEditor.querySelector("#bkResendSubject");
      const bodyEl2 = bkResendEditor.querySelector("#bkResendBody");
      const sendBtn = bkResendEditor.querySelector("#bkResendSend");
      const cancelBtn = bkResendEditor.querySelector("#bkResendCancel");

      bkResendBtn.addEventListener("click", () => {
        const API = window.JPark && window.JPark.api;
        if (!API) return;
        bkResendBtn.disabled = true;
        bkResendEditor.hidden = false;
        bkResendEditingId = b.id;
        subjectEl.value = "";
        bodyEl2.value = t("msg.bk.resend.loading");
        bodyEl2.disabled = true;
        API.get("/api/guest-bookings/" + b.id + "/confirmation-preview").then((r) => {
          bodyEl2.disabled = false;
          bkResendBtn.disabled = false;
          if (r && !r.error) {
            subjectEl.value = r.subject || "";
            bodyEl2.value = r.text || "";
          } else {
            bkResendEditor.hidden = true;
            bkResendEditingId = null;
            U.toast((r && r.error) || t("msg.bk.resend.failed"), "error");
          }
        }).catch(() => {
          bodyEl2.disabled = false;
          bkResendBtn.disabled = false;
          bkResendEditor.hidden = true;
          bkResendEditingId = null;
          U.toast(t("msg.bk.resend.failed"), "error");
        });
      });

      cancelBtn.addEventListener("click", () => { bkResendEditor.hidden = true; bkResendEditingId = null; });

      sendBtn.addEventListener("click", () => {
        const API = window.JPark && window.JPark.api;
        if (!API) return;
        sendBtn.disabled = true;
        API.post("/api/guest-bookings/" + b.id + "/resend-confirmation", {
          subject: subjectEl.value,
          text: bodyEl2.value,
        }).then((r) => {
          sendBtn.disabled = false;
          if (r && !r.error) {
            bkResendEditor.hidden = true;
            bkResendEditingId = null;
            if (r.booking) updateBookingLocal(b.id, r.booking);
            renderBookingDetail(b.id);
            U.toast(t("msg.bk.resend.sent").replace("{email}", b.guestEmail || ""), "success");
          } else {
            U.toast((r && r.error) || t("msg.bk.resend.failed"), "error");
          }
        }).catch(() => {
          sendBtn.disabled = false;
          U.toast(t("msg.bk.resend.failed"), "error");
        });
      });
    }

    // "Sent Emails" — a read-only history of every guest-facing email
    // actually logged for this booking (backend email_log via GET
    // .../email-log), so staff can check what a guest was told without
    // digging through server logs. Fetched lazily on first open, not on
    // every renderBookingDetail() call/poll tick.
    const bkEmailLogBtn = detailArea.querySelector("#mdaBkEmailLog");
    const bkEmailLogPanel = detailArea.querySelector("#bkEmailLogPanel");
    if (bkEmailLogBtn && bkEmailLogPanel) {
      let emailLogLoaded = false;
      const loadEmailLog = () => {
        const API = window.JPark && window.JPark.api;
        if (!API || emailLogLoaded) return;
        const listEl = bkEmailLogPanel.querySelector("#bkEmailLogList");
        listEl.textContent = t("msg.bk.emailLog.loading");
        API.get("/api/guest-bookings/" + b.id + "/email-log").then((r) => {
          emailLogLoaded = true;
          renderEmailLogList(listEl, Array.isArray(r) ? r : []);
        }).catch(() => { listEl.textContent = t("msg.bk.emailLog.failed"); });
      };
      // If this booking's log panel was already open before this render (a
      // cancel/reopen action re-renders the detail pane in place), keep it
      // open and re-fetch into the freshly-built (empty) list element —
      // the poll-tick guard above prevents this path from firing every 6s.
      if (bkEmailLogOpenId === b.id) loadEmailLog();
      bkEmailLogBtn.addEventListener("click", () => {
        const opening = bkEmailLogPanel.hidden;
        bkEmailLogPanel.hidden = !opening;
        bkEmailLogOpenId = opening ? b.id : null;
        if (opening) loadEmailLog();
      });
    }

    const bkDeleteBtn = detailArea.querySelector("#mdaBkDelete");
    if (bkDeleteBtn) {
      bkDeleteBtn.addEventListener("click", () => {
        if (!confirm(t("msg.bk.delete.confirm"))) return;
        const API = window.JPark && window.JPark.api;
        bkDeleteBtn.disabled = true;
        (API ? API.del("/api/guest-bookings/" + b.id) : Promise.resolve({ error: "offline" })).then((r) => {
          if (r && r.error && !r.offline) {
            bkDeleteBtn.disabled = false;
            U.toast(r.error, "error");
            return;
          }
          S.remove("guestBookings", b.id);
          msgView = msgPrevView;
          msgDetailId = null;
          msgDetailKind = "message";
          renderMessages();
        }).catch(() => { bkDeleteBtn.disabled = false; });
      });
    }

    document.getElementById("msgDetailBack").addEventListener("click", () => {
      msgView = msgPrevView;
      msgDetailId = null;
      msgDetailKind = "message";
      bkResendEditingId = null;
      bkEmailLogOpenId = null;
      renderMessages();
    });
  }

  /* ====================  PASSWORD RESET REQUESTS (admin)  ==================== */
  /* ── The payments ledger (admin) ────────────────────────────────────────
     Charges read straight from the payment gateway, lined up against this
     hotel's own booking records.

     It exists because the two halves of the truth live in different systems.
     The gateway knows every charge ever attempted; the booking board knows
     every reservation. Everything that can go wrong with a payment lives in
     the gap: money taken with no booking behind it, a booking still saying
     "awaiting payment" for a charge that settled days ago, a card refused
     without anyone at the hotel being told.

     Answering "was there a payment today?" used to mean opening the acquirer's
     dashboard in one tab and the booking board in another and comparing by
     eye. It also meant knowing that a dashboard's "last 7 days" summary can
     END yesterday — so a payment taken this morning is missing from it while
     being perfectly real.

     Deliberately NOT polled. It fires gateway calls and a database read, and
     nothing here is urgent enough to run on a timer — Neon bills compute time
     and any query wakes it for a full autosuspend window. It loads when the
     view is opened and when somebody presses Refresh. */
  let paymentsLedger = null;      // last response, in memory only
  let paymentsLedgerLoading = false;
  let paymentsLedgerError = null;

  function payLedgerMoney(v, cur) {
    if (v == null) return "—";
    return (cur || "THB") + " " + Number(v).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }

  function loadPaymentsLedger(force) {
    const API = window.JPark && window.JPark.api;
    if (!API || paymentsLedgerLoading) return;
    if (paymentsLedger && !force) return;
    paymentsLedgerLoading = true;
    paymentsLedgerError = null;
    renderPaymentsLedger();
    API.get("/api/v1/payments/ledger?limit=40").then((r) => {
      paymentsLedgerLoading = false;
      if (!r || r.error) {
        paymentsLedgerError = (r && r.error) || t("msg.payments.unavailable");
        paymentsLedger = null;
      } else {
        paymentsLedger = r;
      }
      renderPaymentsLedger();
    }).catch(() => {
      paymentsLedgerLoading = false;
      paymentsLedgerError = t("msg.payments.unavailable");
      renderPaymentsLedger();
    });
  }

  function payLedgerBalanceHTML(bal) {
    if (!bal) return "";
    const cell = (labelKey, value, cls) =>
      '<div class="pay-bal-cell' + (cls ? " " + cls : "") + '">' +
        '<div class="pay-bal-k">' + esc(t(labelKey)) + "</div>" +
        '<div class="pay-bal-v">' + esc(payLedgerMoney(value, bal.currency)) + "</div>" +
      "</div>";
    return '<div class="pay-balance">' +
      cell("msg.payments.bal.total", bal.total) +
      // On hold and transferable are the two an owner actually acts on:
      // one means wait, the other means the money can be withdrawn today.
      cell("msg.payments.bal.onHold", bal.onHold, "pay-bal-hold") +
      cell("msg.payments.bal.transferable", bal.transferable, "pay-bal-free") +
      cell("msg.payments.bal.reserve", bal.reserve) +
    "</div>";
  }

  function payLedgerRowHTML(c) {
    const cur = c.currency || "THB";
    const card = c.card || {};
    const who = c.guest
      ? [c.guest.name, c.guest.roomType].filter(Boolean).join(" · ")
      : t("msg.payments.noGuest");
    const refs = (c.bookings || []).map((b) => b.groupRef || b.ref).filter(Boolean);
    const uniqueRefs = refs.filter((v, i) => refs.indexOf(v) === i);

    /* The server sends each flag with a machine-readable `code` as well as its
       English prose. Translate by the code and keep the prose only as a
       fallback for a code this console does not know yet — otherwise a Thai
       member of staff reads English sentences on the one screen that tells
       them money is missing. */
    const flags = (c.flags || []).map((f) => {
      const key = "msg.payments.flag." + (f.code || "");
      const translated = f.code ? t(key) : "";
      return '<div class="pay-flag pay-flag-' + esc(f.level) + '">' +
        esc(translated && translated !== key ? translated : f.text) + "</div>";
    }).join("");

    // Only offer the button where pressing it could change something. A
    // settled, fully-recorded charge has nothing to reconcile, and a button
    // that does nothing invites pressing it repeatedly.
    const needsAction = (c.flags || []).some((f) =>
      f.code === "paid_not_recorded" || f.code === "paid_no_booking" ||
      f.code === "detail_missing" || f.code === "pending");

    return '<div class="pay-row pay-state-' + esc(c.state || "unknown") + '" data-charge="' + esc(c.chargeId) + '">' +
      '<div class="pay-row-top">' +
        '<span class="pay-state">' + esc(t("msg.payments.state." + (c.state || "unknown"))) + "</span>" +
        '<span class="pay-amt">' + esc(payLedgerMoney(c.amount, cur)) + "</span>" +
        '<span class="pay-when">' + esc(bkPayTime(c.paidAt || c.createdAt, false)) + "</span>" +
      "</div>" +
      '<div class="pay-row-mid">' +
        '<span class="pay-who">' + esc(who) + "</span>" +
        (uniqueRefs.length ? '<span class="pay-ref">' + esc(uniqueRefs.join(", ")) + "</span>" : "") +
        '<span class="pay-card">' + esc(bkPayCardLabel(card) ||
          (c.method === "promptpay" ? t("msg.bk.pay.promptpay") : (c.method || ""))) + "</span>" +
      "</div>" +
      /* Net is shown ONLY for a charge that actually settled.

         The gateway reports fee and net on every charge object, paid or not —
         they are what it WOULD have kept. Printing "Net to the hotel" against
         a charge the bank refused states income that does not exist and never
         will, on the row whose whole purpose is to say the money did not
         arrive. Same for one still in flight: it has not been earned yet. */
      (c.net != null && c.state === "paid"
        ? '<div class="pay-row-net">' + esc(t("msg.bk.pay.net")) + ": " + esc(payLedgerMoney(c.net, cur)) +
          (c.settlement ? " · " + esc(t("msg.bk.pay.settle." + (c.settlement.state || "on_hold"))) : "") +
          (c.settlement && c.settlement.paidAt ? " · " + esc(bkPayTime(c.settlement.paidAt, false)) : "") +
          "</div>"
        : "") +
      flags +
      '<div class="pay-row-foot">' +
        '<code class="pay-id">' + esc(c.chargeId || "") + "</code>" +
        (needsAction
          ? '<button class="btn-activate pay-reconcile-btn" data-charge="' + esc(c.chargeId) + '">' +
              esc(t("msg.payments.reconcile")) + "</button>"
          : "") +
      "</div>" +
    "</div>";
  }

  function renderPaymentsLedger() {
    const listArea = document.getElementById("msgListArea");
    if (!listArea) return;
    // Open to every signed-in member of staff, not just administrators — the
    // people who take payments at the desk are the people who need to see
    // whether one landed. The server agrees (requireAuth on these routes), so
    // this is not a client-side gate doing security work.

    const bar =
      '<div class="msg-list-header">' + esc(t("msg.payments")) +
        '<span class="pay-actions">' +
          '<button class="btn-activate" id="payRefreshBtn">↻ ' + esc(t("msg.payments.refresh")) + "</button>" +
          '<button class="btn-activate" id="payBackfillBtn">' + esc(t("msg.payments.backfill")) + "</button>" +
          '<button class="btn-activate" id="paySettleBtn">' + esc(t("msg.payments.settle")) + "</button>" +
        "</span>" +
      "</div>";

    let body;
    if (paymentsLedgerLoading) {
      body = '<div class="msg-empty"><div class="me-ico">💳</div><div class="me-sub">' +
        esc(t("msg.payments.loading")) + "</div></div>";
    } else if (paymentsLedgerError) {
      body = '<div class="pay-error">' + esc(paymentsLedgerError) + "</div>";
    } else if (!paymentsLedger || !paymentsLedger.available) {
      body = '<div class="msg-empty"><div class="me-ico">💳</div><div class="me-sub">' +
        // Same rule as the flags: prefer our own translated sentence, and only
        // fall back to the server's English if it said something we have no
        // wording for.
        esc(t("msg.payments.unavailable")) + "</div></div>";
    } else if (!paymentsLedger.charges.length) {
      body = '<div class="msg-empty"><div class="me-ico">💳</div>' +
        '<div class="me-title">' + esc(t("msg.empty.title")) + "</div>" +
        '<div class="me-sub">' + esc(t("msg.payments.empty")) + "</div></div>";
    } else {
      body =
        (paymentsLedger.mode === "test"
          ? '<div class="pay-testbanner">⚠ ' + esc(t("msg.bk.pay.testMode")) + "</div>"
          : "") +
        payLedgerBalanceHTML(paymentsLedger.balance) +
        paymentsLedger.charges.map(payLedgerRowHTML).join("");
    }

    listArea.innerHTML = bar + body;

    const refresh = listArea.querySelector("#payRefreshBtn");
    if (refresh) refresh.addEventListener("click", () => loadPaymentsLedger(true));

    const runAction = (path, btn) => {
      const API = window.JPark && window.JPark.api;
      if (!API) return;
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = t("msg.payments.working");
      API.post(path, {}).then((r) => {
        btn.disabled = false;
        btn.textContent = original;
        if (!r || r.error) { U.toast((r && r.error) || t("msg.payments.unavailable"), "error"); return; }
        // Report what actually happened rather than a bare "done" — the
        // interesting outcome of a backfill is usually zero, and a person
        // needs to be able to tell "nothing to do" from "it did not run".
        const parts = [];
        if (r.settled) parts.push(r.settled + " " + t("msg.payments.res.settled"));
        if (r.filled) parts.push(r.filled + " " + t("msg.payments.res.filled"));
        if (r.closed) parts.push(r.closed + " " + t("msg.payments.res.closed"));
        if (r.updated) parts.push(r.updated + " " + t("msg.payments.res.updated"));
        U.toast(parts.length ? parts.join(" · ") : t("msg.payments.res.none"), "success");
        loadPaymentsLedger(true);
      }).catch(() => {
        btn.disabled = false;
        btn.textContent = original;
        U.toast(t("msg.payments.unavailable"), "error");
      });
    };

    const backfill = listArea.querySelector("#payBackfillBtn");
    if (backfill) backfill.addEventListener("click", () => runAction("/api/v1/payments/backfill", backfill));
    const settle = listArea.querySelector("#paySettleBtn");
    if (settle) settle.addEventListener("click", () => runAction("/api/v1/payments/settlement-refresh", settle));

    listArea.querySelectorAll(".pay-reconcile-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const API = window.JPark && window.JPark.api;
        if (!API) return;
        const chargeId = btn.getAttribute("data-charge");
        btn.disabled = true;
        btn.textContent = t("msg.payments.working");
        API.post("/api/v1/payments/ledger/reconcile", { chargeId }).then((r) => {
          if (!r || r.error || r.ok === false) {
            btn.disabled = false;
            U.toast((r && r.error) || t("msg.payments.unavailable"), "error");
            return;
          }
          U.toast(r.message || t("msg.payments.res.none"), "success");
          // A reconcile can flip a booking to paid, so the board is stale too.
          bkPaymentCache.clear();
          loadPaymentsLedger(true);
        }).catch(() => {
          btn.disabled = false;
          U.toast(t("msg.payments.unavailable"), "error");
        });
      });
    });
  }

  function renderResetList() {
    const listArea = document.getElementById("msgListArea");
    if (!isAdmin()) { listArea.innerHTML = ""; return; }
    const reqs = getResetRequests();
    const countLabel = reqs.length ? '<span class="mlh-count">' + reqs.length + "</span>" : "";
    listArea.innerHTML = '<div class="msg-list-header">' + esc(t("msg.resets")) + countLabel + "</div>";

    if (!reqs.length) {
      listArea.innerHTML +=
        '<div class="msg-empty">' +
        '<div class="me-ico">🔑</div>' +
        '<div class="me-title">' + esc(t("msg.empty.title")) + "</div>" +
        '<div class="me-sub">' + esc(t("msg.empty.resets")) + "</div>" +
        "</div>";
      return;
    }

    reqs.forEach((r) => {
      const isPass = r.kind === "password";
      const who = isPass ? (r.username || "") : (r.name || "");
      const meta = isPass ? (r.note || "") : (r.contact || "");
      const row = document.createElement("div");
      row.className = "reset-row" + (r.handled ? " handled" : "");
      row.innerHTML =
        '<div class="rr-ico">' + (isPass ? "🔑" : "👤") + "</div>" +
        '<div class="rr-main">' +
          '<div class="rr-title"></div>' +
          '<div class="rr-who"></div>' +
          (meta ? '<div class="rr-meta"></div>' : "") +
        "</div>" +
        '<div class="rr-time"></div>' +
        '<div class="rr-actions"></div>';
      row.querySelector(".rr-title").textContent = t(isPass ? "msg.reset.passReq" : "msg.reset.userReq") + (r.handled ? " · " + t("msg.reset.done") : "");
      row.querySelector(".rr-who").textContent = who;
      if (meta) row.querySelector(".rr-meta").textContent = meta;
      row.querySelector(".rr-time").textContent = formatMsgTime(r.createdAt);

      const actions = row.querySelector(".rr-actions");
      if (isPass && !r.handled) {
        const resetBtn = document.createElement("button");
        resetBtn.className = "btn-activate";
        resetBtn.textContent = t("msg.reset.toDefault");
        resetBtn.addEventListener("click", async () => {
          const u = S.list("staff").find((x) => x.username.toLowerCase() === (r.username || "").toLowerCase());
          if (!u) { U.toast(t("msg.reset.noUser"), "error"); return; }
          const API = window.JPark && window.JPark.api;
          if (API) {
            const res = await API.post("/api/auth/staff/" + encodeURIComponent(u.id) + "/reset-password", {});
            if (res && res.error && !res.offline) { U.toast(res.error, "error"); return; }
            // The server now issues a fresh RANDOM temp password and returns it
            // exactly once (it is only stored hashed). Show it in a blocking,
            // copyable alert so the admin can relay it — a missed toast would
            // leave it unrecoverable. Fall back to the legacy default only if an
            // old/offline backend didn't return one.
            if (res && res.tempPassword) {
              S.update("staff", u.id, { password: res.tempPassword, mustChange: true });
              S.update("resetRequests", r.id, { handled: true });
              window.alert(t("msg.reset.tempPw") + "\n\n" + res.tempPassword);
              U.toast(t("msg.reset.didReset"), "success");
              renderMessages();
              return;
            }
          }
          S.update("staff", u.id, { password: DEFAULT_STAFF_PASSWORD, mustChange: true });
          S.update("resetRequests", r.id, { handled: true });
          U.toast(t("msg.reset.didReset"), "success");
          renderMessages();
        });
        actions.appendChild(resetBtn);
      }
      if (!r.handled) {
        const doneBtn = document.createElement("button");
        doneBtn.textContent = t("msg.reset.markDone");
        doneBtn.addEventListener("click", () => { S.update("resetRequests", r.id, { handled: true }); renderMessages(); });
        actions.appendChild(doneBtn);
      }
      const delBtn = document.createElement("button");
      delBtn.className = "rr-del";
      delBtn.textContent = t("common.delete");
      delBtn.addEventListener("click", () => { S.remove("resetRequests", r.id); renderMessages(); });
      actions.appendChild(delBtn);

      listArea.appendChild(row);
    });
  }

  /* ====================  COMPOSE  ==================== */
  function openCompose(opts) {
    msgToRecipients = (opts && opts.to) ? opts.to : [];
    msgToAllSelected = false;
    const modal = document.getElementById("msgComposeModal");
    if (!modal) return;
    modal.classList.add("open");
    document.getElementById("msgToInput").value = "";
    document.getElementById("msgSubjectInput").value = (opts && opts.subject) || "";
    document.getElementById("msgBodyInput").value = (opts && opts.body) || "";
    renderToTags();
    hideToDropdown();
    // Pull a fresh directory so accounts created since the last poll tick show
    // up in autocomplete immediately. Fire-and-forget — the input listener will
    // re-render the dropdown whenever the user types.
    _syncStaffList();
    if (opts && opts.to && opts.to.length) document.getElementById("msgSubjectInput").focus();
    else document.getElementById("msgToInput").focus();
  }

  function openReply(m) {
    if (!m || !m.fromId || m.fromId === session.id) return;
    const pfx = t("msg.replyPrefix");
    const subj = (m.subject || "").startsWith(pfx) ? (m.subject || "") : pfx + " " + (m.subject || "");
    openCompose({ to: [{ id: m.fromId, name: m.fromName }], subject: subj });
  }

  function openForwardMsg(m) {
    const pfx = t("msg.fwdPrefix");
    const subj = (m.subject || "").startsWith(pfx) ? (m.subject || "") : pfx + " " + (m.subject || "");
    const sep = t("msg.fwdBody");
    const body = "\n\n" + sep + "\nFrom: " + (m.fromName || "") +
      "\nDate: " + new Date(m.createdAt).toLocaleString() +
      "\nSubject: " + (m.subject || "") + "\n\n" + (m.body || "");
    openCompose({ subject: subj, body });
  }

  // The bookings list poll no longer carries each booking's raw `confirmation`
  // email (that large column is fetched on demand, not on every poll — see
  // backend/routes/guestBookings.js). Pull it once, when a booking is actually
  // opened or forwarded, and cache it on the in-memory object so repeat opens
  // don't re-fetch. Resolves to "" if unavailable so callers never block.
  function ensureBookingConfirmation(b) {
    if (!b) return Promise.resolve("");
    if (typeof b.confirmation === "string") return Promise.resolve(b.confirmation);
    const API = window.JPark && window.JPark.api;
    if (!API || !b.id) return Promise.resolve("");
    return API.get("/api/guest-bookings/" + encodeURIComponent(b.id)).then(function (full) {
      if (full && !full.error && typeof full.confirmation === "string") {
        b.confirmation = full.confirmation;
        return full.confirmation;
      }
      return "";
    }).catch(function () { return ""; });
  }

  function openForwardBooking(b) {
    ensureBookingConfirmation(b).then(function (confirmation) {
      const pfx = t("msg.fwdPrefix");
      const subj = pfx + " " + t("msg.bk.subject") + " · " + (b.channelName || "") + " · " + (b.guestName || "");
      const sep = t("msg.fwdBody");
      const info = "Channel: " + (b.channelName || "") +
        "\nGuest: " + (b.guestName || "") + "\nRef: " + (b.ref || "") +
        "\nRoom: " + (b.room || "") + "\nCheck-in: " + (b.checkIn ? String(b.checkIn).slice(0, 10) : "") +
        "\nCheck-out: " + (b.checkOut ? String(b.checkOut).slice(0, 10) : "") +
        "\nTotal: " + ((b.currency || "THB") + " " + (b.total || ""));
      const body = "\n\n" + sep + "\n" + info + "\n\n" + (confirmation || "");
      openCompose({ subject: subj, body });
    });
  }

  function toggleStar(id, kind) {
    if (kind === "booking") {
      const all = S.list("guestBookings");
      const i = all.findIndex((b) => b.id === id);
      if (i < 0) return false;
      const starred = !all[i].starred;
      // Optimistic local update so the icon flips immediately, then persist
      // server-side — bookings are re-fetched wholesale every 6s
      // (_pollGuestBookings), which would otherwise silently wipe a
      // local-only starred flag back to false on the very next poll.
      updateBookingLocal(id, { starred });
      const API = window.JPark && window.JPark.api;
      if (API) {
        API.patch("/api/guest-bookings/" + id, { starred }).then((r) => {
          if (r && !r.error) updateBookingLocal(id, r);
          else if (r && !r.offline) U.toast(r.error || t("msg.bk.starFailed"), "error");
        }).catch(() => {});
      }
      return starred;
    }
    const all = getAllMsgs();
    const i = all.findIndex((m) => m.id === id);
    if (i < 0) return false;
    const starred = !all[i].starred;
    all[i] = Object.assign({}, all[i], { starred });
    S.write("messages", all);
    return starred;
  }
  function closeCompose() {
    const modal = document.getElementById("msgComposeModal");
    if (modal) modal.classList.remove("open");
    hideToDropdown();
  }
  function hideToDropdown() {
    const dd = document.getElementById("msgToDropdown");
    if (dd) dd.style.display = "none";
  }
  function renderToTags() {
    const wrap = document.getElementById("msgToTags");
    const input = document.getElementById("msgToInput");
    if (!wrap || !input) return;
    wrap.innerHTML = "";
    if (msgToAllSelected) {
      const tag = document.createElement("span");
      tag.className = "msg-to-tag everyone-tag";
      tag.innerHTML = esc(t("staff.compose.everyoneAll")) + " ";
      const rm = document.createElement("button");
      rm.type = "button"; rm.textContent = "✕";
      rm.addEventListener("click", () => { msgToAllSelected = false; renderToTags(); updateMsgLimit(); });
      tag.appendChild(rm);
      wrap.appendChild(tag);
    } else {
      msgToRecipients.forEach((r, i) => {
        const tag = document.createElement("span");
        tag.className = "msg-to-tag";
        const nm = document.createTextNode(r.name + " ");
        const rm = document.createElement("button");
        rm.type = "button"; rm.textContent = "✕";
        rm.addEventListener("click", () => { msgToRecipients.splice(i, 1); renderToTags(); updateMsgLimit(); });
        tag.appendChild(nm); tag.appendChild(rm);
        wrap.appendChild(tag);
      });
    }
    wrap.appendChild(input);
    updateMsgLimit();
  }
  function updateMsgLimit() {
    const el = document.getElementById("msgToLimit");
    if (!el) return;
    if (msgToAllSelected) {
      el.textContent = "Sending to all staff";
      el.className = "mf-limit";
    } else if (!isAdmin()) {
      const n = msgToRecipients.length;
      el.textContent = n + " / 10 recipients";
      el.className = "mf-limit" + (n >= 10 ? " over" : "");
    } else {
      el.textContent = msgToRecipients.length ? msgToRecipients.length + " recipients" : "";
      el.className = "mf-limit";
    }
  }
  function renderToDropdown(query) {
    const dd = document.getElementById("msgToDropdown");
    if (!dd) return;
    // "All Users" = staff table only — guests are never included
    let staffList = S.list("staff").filter((u) => u.active && u.id !== session.id);
    if (query) {
      const q = query.toLowerCase();
      staffList = staffList.filter((u) =>
        u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
      );
    }
    const selectedIds = msgToRecipients.map((r) => r.id);
    staffList = staffList.filter((u) => !selectedIds.includes(u.id));
    dd.innerHTML = "";
    let hasItems = false;
    if (isAdmin() && !msgToAllSelected && !query) {
      const item = document.createElement("div");
      item.className = "msg-to-dropdown-item";
      item.innerHTML =
        '<div class="mdi-avatar" style="background:linear-gradient(135deg,var(--gold),#e8a800);color:var(--teal-deep)">🌐</div>' +
        '<span class="mdi-name">' + esc(t("staff.compose.everyone")) + '</span>' +
        '<span class="mdi-role">' + esc(t("staff.compose.allStaff")) + '</span>';
      item.addEventListener("click", () => {
        msgToAllSelected = true; msgToRecipients = [];
        document.getElementById("msgToInput").value = "";
        renderToTags(); hideToDropdown();
      });
      dd.appendChild(item); hasItems = true;
    }
    staffList.forEach((u) => {
      const item = document.createElement("div");
      item.className = "msg-to-dropdown-item";
      item.innerHTML =
        '<div class="mdi-avatar">' + makeAvatarHtml(u.name, u.id) + "</div>" +
        '<span class="mdi-name">' + esc(u.name) + "</span>" +
        // The raw store token ("admin"/"staff") was printed straight into
        // the dropdown, so every language showed English role names even
        // though staff.role.* is defined in all five.
        '<span class="mdi-role">' + esc(t("staff.role." + u.role)) + "</span>";
      item.addEventListener("click", () => {
        if (!isAdmin() && msgToRecipients.length >= 10) {
          U.toast("Maximum 10 recipients for staff.", "error"); return;
        }
        msgToRecipients.push({ id: u.id, name: u.name });
        document.getElementById("msgToInput").value = "";
        renderToTags(); hideToDropdown();
      });
      dd.appendChild(item); hasItems = true;
    });
    dd.style.display = hasItems ? "block" : "none";
  }
  async function sendMessage() {
    const subject = document.getElementById("msgSubjectInput").value.trim();
    const body = document.getElementById("msgBodyInput").value.trim();
    if (!msgToAllSelected && msgToRecipients.length === 0) {
      U.toast("Please add at least one recipient.", "error"); return;
    }
    if (!subject) { U.toast("Please add a subject.", "error"); return; }
    if (!body) { U.toast("Please write a message.", "error"); return; }

    const toAll = msgToAllSelected;
    const toIds = toAll ? [] : msgToRecipients.map((r) => r.id);
    const toNames = toAll ? [] : msgToRecipients.map((r) => r.name);

    // Sync path: POST to the server so the recipient sees it on their next
    // poll tick (~6s). The server stamps the canonical id and createdAt,
    // and we mirror the row locally for instant UI feedback.
    const API = window.JPark && window.JPark.api;
    if (API) {
      const res = await API.post("/api/messages", {
        subject, body, lang: I.getLang(), toAll, toIds, toNames,
      });
      if (res && !res.error) {
        const all = S.list("messages");
        all.push(_mapServerMsg(res));
        S.write("messages", all);
        closeCompose();
        U.toast("Message sent!", "success");
        if (panel === "messages") { msgView = "sent"; renderMessages(); }
        return;
      }
      if (res && res.error && !res.offline) {
        U.toast("Could not send: " + res.error, "error");
        return;
      }
      // Fall through on offline — store locally so it isn't lost.
    }

    // Offline / no API fallback — local-only insert. (Survives until the
    // server comes back; not auto-replayed today.)
    S.insert("messages", {
      fromId: session.id, fromName: session.name, fromRole: session.role,
      subject, body, lang: I.getLang(),
      to: toAll ? "all" : toIds,
      toNames: toAll ? t("staff.compose.everyone") : toNames,
      readBy: [session.id],
    });
    closeCompose();
    U.toast("Message saved offline — will send when reconnected.", "success");
    if (panel === "messages") { msgView = "sent"; renderMessages(); }
  }

  /* ====================  SITE EDITOR (admin)  ==================== */
  function renderSite() {
    if (!isAdmin()) return;
    if (!edLang) edLang = I.getLang();
    // Some browsers restore a previously-typed value into this field on
    // reload/back-navigation even though it's never set from state; force
    // it back in sync with edSearchQ so the editor never looks pre-filtered.
    const searchEl = document.getElementById("edSearch");
    if (searchEl && searchEl.value !== edSearchQ) searchEl.value = edSearchQ;
    renderGuideState();
    renderEditTabs();
    renderEditLang();
    renderContentGroups();
    renderMediaSets();
    renderColors();
    renderRates();
    renderChatConfig();
    renderAnnouncements();
    renderSectionToggles();
    renderRoomAvailability();
    renderRoomCounts();
    renderDayUseAvailability();
    renderHistory();
  }

  function renderEditTabs() {
    document.querySelectorAll("#edTabs .ed-tab").forEach((b) =>
      b.classList.toggle("active", b.dataset.edtab === edTab));
    document.querySelectorAll("#panel-site .ed-tabpane").forEach((p) =>
      p.classList.toggle("show", p.dataset.edpane === edTab));
  }

  /* ---- tutorial guide show/hide (persisted) ---- */
  function renderGuideState() {
    const body = document.getElementById("guideBody");
    const btn = document.getElementById("guideToggle");
    if (!body || !btn) return;
    const hidden = localStorage.getItem(GUIDE_HIDDEN_KEY) === "1";
    body.style.display = hidden ? "none" : "";
    btn.textContent = t(hidden ? "staff.guide.show" : "staff.guide.hide");
  }
  function toggleGuide() {
    const hidden = localStorage.getItem(GUIDE_HIDDEN_KEY) === "1";
    localStorage.setItem(GUIDE_HIDDEN_KEY, hidden ? "0" : "1");
    renderGuideState();
  }

  /* ---- editing-language selector ---- */
  function renderEditLang() {
    const sel = document.getElementById("edLangSel");
    if (!sel) return;
    sel.innerHTML = "";
    I.SUPPORTED.forEach((l) => {
      const o = document.createElement("option");
      o.value = l;
      o.textContent = I.LANG_NAMES[l] || l;
      if (l === edLang) o.selected = true;
      sel.appendChild(o);
    });
  }

  /* ---- publishing Site Editor edits to the live site ----
     Everything the Content / Photos / Colours / Sections / Announcements tabs
     write goes into localStorage first (instant, works offline) and is then
     PUT to /api/content by assets/js/content-sync.js. Before this existed the
     first half was the WHOLE story: an edit lived in the editing admin's own
     browser profile and nothing on jparkhotel.com ever read it. From the
     admin's chair that looks exactly like a broken button — the photo tiles
     renumber, the set says "edited", and the website keeps its old order.

     Every editor action therefore ends in publish(), and — just as important —
     a failed publish says so instead of toasting "Saved". */
  function publish() {
    const CS = J.contentSync;
    if (!CS) return Promise.resolve({ ok: true }); // module absent: local-only, as before
    return CS.push().then((res) => {
      if (res && res.ok) return res;
      let msg;
      if (res && res.offline) msg = t("staff.site.publishOffline");
      // The server refuses a content row too big to serve to every guest on
      // every page load — say so in the admin's language, and say what to do.
      else if (res && res.code === "CONTENT_TOO_LARGE") msg = t("staff.site.publishTooLarge");
      else msg = t("staff.site.publishFailed").replace("{error}", (res && res.error) || "");
      U.toast(msg, "error");
      return res;
    });
  }

  /* Saves + publishes, and only claims success once the server has it. */
  function publishToast(okKey) {
    publish().then((res) => {
      if (res && res.ok) U.toast(t(okKey || "staff.site.saved"), "success");
    });
  }

  /* Adopt whatever is already published before the admin edits anything.
     Without this, a second admin's browser would open the editor showing its
     own (empty) local copy and the next save would publish that over the first
     admin's work — the PUT is a full replace. */
  let siteContentPulled = false;
  async function syncSiteContent() {
    const CS = J.contentSync;
    if (!CS || siteContentPulled) return;
    siteContentPulled = true;
    // full: skip the ?since= shortcut so the Previous-edits history comes down
    // even when this browser already cached a (history-free) guest response.
    const res = await CS.pull({ full: true });
    if (res && res.localAhead) {
      // Nothing published yet, but this browser holds edits from before the
      // Site Editor could publish at all. Push them live rather than lose them.
      const up = await CS.push();
      if (up && up.ok) U.toast(t("staff.site.publishedLocal"), "success");
      return;
    }
    if (res && res.changed && panel === "site") renderSite();
  }

  /* ---- content overrides store helpers ---- */
  function getOverride(lang, key) {
    const c = S.read("content", {}) || {};
    return (c.overrides && c.overrides[lang] && c.overrides[lang][key] != null)
      ? c.overrides[lang][key] : null;
  }
  function setOverride(lang, key, val) {
    const c = S.read("content", {}) || {};
    c.overrides = c.overrides || {};
    c.overrides[lang] = c.overrides[lang] || {};
    const base = I.base(key, lang);
    if (val == null || val === "" || val === base) delete c.overrides[lang][key];
    else c.overrides[lang][key] = val;
    if (c.overrides[lang] && !Object.keys(c.overrides[lang]).length) delete c.overrides[lang];
    if (c.overrides && !Object.keys(c.overrides).length) delete c.overrides;
    S.write("content", c);
  }

  /* ---- edit history (audit log) ---- */
  const EDIT_LOG_MAX = 250;
  function logEdit(entry) {
    const c = S.read("content", {}) || {};
    c.editLog = Array.isArray(c.editLog) ? c.editLog : [];
    c.editLog.push(Object.assign({
      ts: Date.now(),
      userId: session ? session.id : null,
      userName: session ? session.name : "—"
    }, entry));
    if (c.editLog.length > EDIT_LOG_MAX) c.editLog = c.editLog.slice(c.editLog.length - EDIT_LOG_MAX);
    S.write("content", c);
  }

  /* Translate a freshly edited string into the other four languages so every
     language stays in sync. Best-effort: if the service is unavailable the
     other languages keep whatever they had. Resetting (empty / back to the
     original) clears the matching override in every language too. */
  function autoTranslateField(key, srcLang, val, statusEl) {
    const targets = I.SUPPORTED.filter((l) => l !== srcLang);
    const isReset = !val || val === I.base(key, srcLang);
    if (isReset) {
      targets.forEach((l) => setOverride(l, key, ""));
      publish();
      return;
    }
    if (statusEl) { statusEl.textContent = t("staff.site.translating"); statusEl.className = "ed-field-status translating"; }
    Promise.all(targets.map((l) =>
      J.translate.text(val, l).then((res) => {
        const out = (res && res.text) ? res.text : val;
        setOverride(l, key, out);
        return true;
      }).catch(() => false)
    )).then(() => {
      publish().then((res) => {
        if (!statusEl) return;
        if (res && !res.ok) {
          statusEl.textContent = t("staff.site.publishFailedShort");
          statusEl.className = "ed-field-status error";
          return;
        }
        statusEl.textContent = t("staff.site.translatedAll");
        statusEl.className = "ed-field-status saved";
        setTimeout(() => { statusEl.textContent = ""; statusEl.className = "ed-field-status"; }, 2200);
      });
    });
  }

  // Open the public site and tell it what the editor is looking at, so index.html
  // skips the brand intro and instead highlights exactly that spot:
  //   #hl=<key>[&sec=<section>]  → flash one text string (falls back to its section)
  //   #sec=<section>             → glow the whole section
  function siteUrl(section, key) {
    let url = "index.html";
    if (key) url += "#hl=" + encodeURIComponent(key) + (section ? "&sec=" + encodeURIComponent(section) : "");
    else if (section) url += "#sec=" + encodeURIComponent(section);
    return url;
  }

  // Turn an i18n key into a human-readable field name, e.g.
  // "rooms.grandSuite1BedName" → "Grand Suite 1 Bed Name",
  // "rooms.studioB4Name"       → "Studio B4 Name".
  // Only a LOWERCASE letter is split from a following digit: "suite1" is a word
  // then a number, but "B4" is the building's actual name and splitting it gave
  // "Studio B 4Name" wherever a field is labelled.
  function humanizeKey(key) {
    const last = String(key).split(".").pop();
    return last
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([a-z])(\d)/g, "$1 $2")
      .replace(/(\d)([A-Za-z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }

  /* ---- the big grouped, searchable text editor ---- */
  function renderContentGroups() {
    const wrap = document.getElementById("edContentGroups");
    if (!wrap) return;
    wrap.innerHTML = "";
    const q = edSearchQ.trim().toLowerCase();
    const allKeys = I.allKeys();
    let anyShown = false;

    EDIT_GROUPS.forEach((group, gi) => {
      const keys = allKeys.filter((k) => group.prefixes.some((p) => k.indexOf(p) === 0));
      // build matching field rows for this group
      const rows = [];
      keys.forEach((key) => {
        const base = I.base(key, edLang);
        const ov = getOverride(edLang, key);
        const cur = ov != null ? ov : base;
        if (q && key.toLowerCase().indexOf(q) < 0 &&
            String(base).toLowerCase().indexOf(q) < 0 &&
            String(cur).toLowerCase().indexOf(q) < 0) return;
        rows.push({ key: key, base: base, cur: cur, overridden: ov != null });
      });
      if (!rows.length) return;
      anyShown = true;

      const det = document.createElement("details");
      det.className = "ed-group";
      if (q) det.open = true; // expand groups while searching
      const sum = document.createElement("summary");
      const thumbSrc = MED && group.thumb ? MED.cover(group.thumb) : null;
      sum.innerHTML =
        '<span class="ed-grp-thumb"></span>' +
        '<span class="ed-grp-title"></span>' +
        '<span class="ed-grp-count">' + rows.length + "</span>";
      const thumbEl = sum.querySelector(".ed-grp-thumb");
      if (thumbSrc) {
        const im = document.createElement("img");
        im.src = encodeURI(thumbSrc);
        im.alt = "";
        im.loading = "lazy";
        im.title = t("staff.site.viewOnSite");
        im.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          window.open(siteUrl(group.section, null), "_blank", "noopener");
        });
        thumbEl.appendChild(im);
      } else {
        thumbEl.classList.add("empty");
      }
      sum.querySelector(".ed-grp-title").textContent = t(group.title);
      det.appendChild(sum);

      rows.forEach((r) => det.appendChild(buildFieldRow(r, group)));
      wrap.appendChild(det);
    });

    const none = document.getElementById("edNoMatch");
    if (none) none.hidden = anyShown;
  }

  function buildFieldRow(r, group) {
    const row = document.createElement("div");
    row.className = "ed-field" + (r.overridden ? " is-edited" : "");

    const head = document.createElement("div");
    head.className = "ed-field-head";
    // Friendly location so the admin knows where this text lives, e.g.
    // "📍 Rooms › Grand Suite Name". The raw i18n key stays as a tooltip.
    const loc = document.createElement("span");
    loc.className = "ed-field-loc";
    loc.textContent = "📍 " + (group ? t(group.title) + " › " : "") + humanizeKey(r.key);
    loc.title = r.key;
    const status = document.createElement("span");
    status.className = "ed-field-status";
    const view = document.createElement("a");
    view.className = "ed-field-view";
    view.href = siteUrl(group ? group.section : null, r.key);
    view.target = "_blank";
    view.rel = "noopener";
    view.textContent = t("staff.site.viewOnSite") + " ↗";
    head.appendChild(loc);
    head.appendChild(status);
    head.appendChild(view);
    row.appendChild(head);

    const multiline = String(r.base).length > 70 || /\n/.test(String(r.base));
    const input = document.createElement(multiline ? "textarea" : "input");
    if (!multiline) input.type = "text";
    input.className = "ed-field-input";
    input.value = r.cur;
    if (multiline) input.rows = Math.min(6, Math.max(2, Math.ceil(String(r.cur).length / 60)));
    row.appendChild(input);

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "ed-field-reset";
    reset.textContent = t("staff.site.revert");
    reset.style.display = r.overridden ? "" : "none";
    row.appendChild(reset);

    function flashSaved() {
      status.textContent = t("staff.site.savedField");
      status.className = "ed-field-status saved";
      setTimeout(() => { if (status.classList.contains("saved")) { status.textContent = ""; status.className = "ed-field-status"; } }, 1600);
    }
    function commit(val, fromReset) {
      const before = getOverride(edLang, r.key);
      const oldEffective = before != null ? before : I.base(r.key, edLang);
      setOverride(edLang, r.key, val);
      const nowOverridden = getOverride(edLang, r.key) != null;
      row.classList.toggle("is-edited", nowOverridden);
      reset.style.display = nowOverridden ? "" : "none";
      if (String(oldEffective) !== String(val)) {
        logEdit({ type: "text", key: r.key, lang: edLang, from: String(oldEffective), to: String(val) });
      }
      flashSaved();
      // keep every language in sync — autoTranslateField publishes once all
      // five languages have landed, so the site never goes live half-translated
      autoTranslateField(r.key, edLang, val, status);
    }
    input.addEventListener("change", () => commit(input.value, false));
    reset.addEventListener("click", () => {
      input.value = I.base(r.key, edLang);
      commit(input.value, true);
    });
    return row;
  }

  /* ---- photo manager (every section's photo set) ---- */
  function isVideoUrl(u) { return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u || ""); }

  /* An uploaded photo is inlined into the content row as a data: URL — there is
     no file store behind this editor — so its size is paid TWICE over: once
     against this browser's ~5MB localStorage quota, and again by every single
     guest who loads a page, on every visit, out of the database. A 4MB phone
     photo is roughly 5.3MB of base64; a couple of those is the 2026-07-13 Neon
     transfer outage all over again, and more than the browser will even keep.
     So re-encode to what a website actually needs, walking the steps below
     until the result comes in under UPLOAD_TARGET_BYTES: a quiet photo clears
     the first pass, while a busy, high-detail one (fine textiles, foliage,
     pool ripples) steps down instead of sailing past the publish cap and
     failing at the very last moment, after the admin thinks they are done.
     Measured: a 3.3MB 3000x2250 phone photo lands at ~270KB in ~100ms, and is
     indistinguishable in a room card or lightbox.
     Videos are passed through untouched (canvas can't re-encode them). */
  const UPLOAD_STEPS = [[1600, 0.82], [1280, 0.74], [1024, 0.66], [800, 0.6]];
  const UPLOAD_TARGET_BYTES = 500 * 1024;

  function downscaleImage(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let best = dataUrl;
        for (let i = 0; i < UPLOAD_STEPS.length; i++) {
          const edge = UPLOAD_STEPS[i][0], q = UPLOAD_STEPS[i][1];
          const scale = Math.min(1, edge / Math.max(img.width, img.height));
          const cv = document.createElement("canvas");
          cv.width = Math.max(1, Math.round(img.width * scale));
          cv.height = Math.max(1, Math.round(img.height * scale));
          let out;
          try {
            cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
            out = cv.toDataURL("image/jpeg", q);
          } catch (_) {
            resolve(dataUrl); // e.g. a tainted canvas — keep the original
            return;
          }
          if (out.length < best.length) best = out;
          if (best.length <= UPLOAD_TARGET_BYTES) break;
        }
        resolve(best);
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  function pickImageFile(cb) {
    const file = document.createElement("input");
    file.type = "file"; file.accept = "image/*,video/*"; file.style.display = "none";
    document.body.appendChild(file);
    file.addEventListener("change", () => {
      const f = file.files[0];
      file.remove();
      if (!f) return;
      if (f.size > 4 * 1024 * 1024) {
        U.toast(t("staff.site.imgTooBig"), "error");
        return;
      }
      const isVideo = f.type.startsWith("video/");
      const reader = new FileReader();
      reader.onload = (e) => {
        if (isVideo) { cb({ src: e.target.result, video: true }); return; }
        downscaleImage(e.target.result).then((src) => cb({ src: src, video: false }));
      };
      reader.onerror = () => U.toast("Upload failed.", "error");
      reader.readAsDataURL(f);
    });
    file.click();
  }

  function openGalleryPicker(cb) {
    const overlay = document.createElement("div");
    overlay.className = "gp-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const box = document.createElement("div");
    box.className = "gp-box";

    const head = document.createElement("div");
    head.className = "gp-head";
    const titleEl = document.createElement("span");
    titleEl.className = "gp-title";
    titleEl.textContent = t("staff.site.galleryPickTitle");
    const closeBtn = document.createElement("button");
    closeBtn.type = "button"; closeBtn.className = "gp-close";
    closeBtn.textContent = "✕"; closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", () => overlay.remove());
    head.appendChild(titleEl); head.appendChild(closeBtn);
    box.appendChild(head);

    const body = document.createElement("div");
    body.className = "gp-body";
    MED.sets().forEach((s) => {
      const its = MED.items(s.id);
      if (!its.length) return;
      const sec = document.createElement("div");
      sec.className = "gp-section";
      const lbl = document.createElement("div");
      lbl.className = "gp-section-label";
      lbl.textContent = setLabel(s);
      sec.appendChild(lbl);
      const grid = document.createElement("div");
      grid.className = "gp-grid";
      its.forEach((it) => {
        const thumb = document.createElement("div");
        thumb.className = "gp-thumb" + (it.video ? " is-video" : "");
        thumb.setAttribute("role", "button");
        thumb.setAttribute("tabindex", "0");
        const media = document.createElement(it.video ? "video" : "img");
        media.src = encodeURI(it.src);
        if (it.video) { media.muted = true; media.setAttribute("preload", "metadata"); }
        else { media.loading = "lazy"; media.alt = ""; }
        thumb.appendChild(media);
        function pick() { overlay.remove(); cb({ src: it.src, video: !!it.video }); }
        thumb.addEventListener("click", pick);
        thumb.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
        grid.appendChild(thumb);
      });
      sec.appendChild(grid);
      body.appendChild(sec);
    });
    box.appendChild(body);
    overlay.appendChild(box);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    closeBtn.focus();
  }

  function commitMedia(det, s, newItems) {
    const stored = MED.setItems(s.id, newItems);
    fillSet(det, s); // repaint from what is genuinely stored, not from newItems
    if (!stored) {
      // Out of browser storage — the set is unchanged. Saying "saved" here is
      // how a just-added photo appears to vanish on the next repaint.
      U.toast(t("staff.site.storageFull"), "error");
      return;
    }
    logEdit({ type: "photo", setId: s.id, label: s.labelKey, count: newItems.length });
    // "Saved" only once the new order is actually live on jparkhotel.com.
    publishToast("staff.site.photoPublished");
  }

  function buildTile(det, s, items, idx) {
    const it = items[idx];
    const tile = document.createElement("div");
    tile.className = "ed-tile" + (it.video ? " is-video" : "");
    tile.draggable = true;
    tile.addEventListener("dragstart", (e) => {
      dragSrc = { det, s, idx };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(idx));
      setTimeout(() => tile.classList.add("is-dragging"), 0);
    });
    tile.addEventListener("dragend", () => {
      tile.classList.remove("is-dragging");
      document.querySelectorAll(".ed-tile.drag-over").forEach((t) => t.classList.remove("drag-over"));
      dragSrc = null;
    });
    tile.addEventListener("dragover", (e) => {
      if (!dragSrc || dragSrc.s.id !== s.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      document.querySelectorAll(".ed-tile.drag-over").forEach((t) => t.classList.remove("drag-over"));
      if (dragSrc.idx !== idx) tile.classList.add("drag-over");
    });
    tile.addEventListener("dragleave", () => tile.classList.remove("drag-over"));
    tile.addEventListener("drop", (e) => {
      e.preventDefault();
      tile.classList.remove("drag-over");
      if (!dragSrc || dragSrc.s.id !== s.id || dragSrc.idx === idx) return;
      const arr = MED.items(s.id);
      const [moved] = arr.splice(dragSrc.idx, 1);
      arr.splice(idx, 0, moved);
      dragSrc = null;
      commitMedia(det, s, arr);
    });
    const media = document.createElement(it.video ? "video" : "img");
    media.src = encodeURI(it.src);
    if (it.video) { media.muted = true; media.setAttribute("playsinline", ""); media.setAttribute("preload", "metadata"); }
    else { media.loading = "lazy"; media.alt = ""; }
    tile.appendChild(media);
    tile.appendChild((function () {
      const n = document.createElement("span");
      n.className = "ed-tile-num"; n.textContent = (idx + 1);
      return n;
    })());
    if (idx === 0) {
      const cb = document.createElement("span");
      cb.className = "ed-tile-cover";
      cb.textContent = "★ " + t("staff.site.coverBadge");
      tile.appendChild(cb);
    }

    const bar = document.createElement("div");
    bar.className = "ed-tile-bar";
    function btn(txt, title, fn, cls) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ed-tile-btn" + (cls ? " " + cls : "");
      b.textContent = txt; b.title = title; b.setAttribute("aria-label", title);
      b.addEventListener("click", fn);
      return b;
    }
    const left = btn("◀", t("staff.site.moveLeft"), () => {
      if (idx === 0) return;
      const arr = items.slice(); const tmp = arr[idx - 1]; arr[idx - 1] = arr[idx]; arr[idx] = tmp;
      commitMedia(det, s, arr);
    });
    const right = btn("▶", t("staff.site.moveRight"), () => {
      if (idx >= items.length - 1) return;
      const arr = items.slice(); const tmp = arr[idx + 1]; arr[idx + 1] = arr[idx]; arr[idx] = tmp;
      commitMedia(det, s, arr);
    });
    const rep = btn("⟳", t("staff.site.replace"), () => {
      if (it.video) {
        const v = (prompt(t("staff.site.replaceVideoPrompt"), it.src) || "").trim();
        if (!v) return;
        const arr = items.slice(); arr[idx] = { src: v, video: isVideoUrl(v) }; commitMedia(det, s, arr);
      } else {
        pickImageFile((item) => { const arr = items.slice(); arr[idx] = item; commitMedia(det, s, arr); });
      }
    });
    const gal = btn("⊞", t("staff.site.fromGallery"), () => {
      openGalleryPicker((item) => { const arr = items.slice(); arr[idx] = item; commitMedia(det, s, arr); });
    });
    const cover = btn("★", t("staff.site.makeCover"), () => {
      if (idx === 0) return;
      const arr = items.slice(); const [m] = arr.splice(idx, 1); arr.unshift(m);
      commitMedia(det, s, arr);
    }, "cover");
    const rem = btn("✕", t("staff.site.remove"), () => {
      const arr = items.slice(); arr.splice(idx, 1); commitMedia(det, s, arr);
    }, "danger");
    if (idx === 0) { left.disabled = true; cover.disabled = true; }
    if (idx === items.length - 1) right.disabled = true;
    bar.appendChild(left); bar.appendChild(right); bar.appendChild(cover); bar.appendChild(rep); bar.appendChild(gal); bar.appendChild(rem);
    tile.appendChild(bar);
    return tile;
  }

  function buildAddTile(det, s) {
    const tile = document.createElement("div");
    tile.className = "ed-tile ed-tile-add";

    const btnRow = document.createElement("div");
    btnRow.className = "ed-add-btns";
    const up = document.createElement("button");
    up.type = "button"; up.className = "ed-add-up";
    up.textContent = "＋ " + t("staff.site.upload");
    up.addEventListener("click", () => {
      pickImageFile((item) => { const arr = MED.items(s.id); arr.push(item); commitMedia(det, s, arr); });
    });
    const gal = document.createElement("button");
    gal.type = "button"; gal.className = "ed-add-gal";
    gal.textContent = "⊞ " + t("staff.site.fromGallery");
    gal.addEventListener("click", () => {
      openGalleryPicker((item) => { const arr = MED.items(s.id); arr.push(item); commitMedia(det, s, arr); });
    });
    btnRow.appendChild(up); btnRow.appendChild(gal);

    const urlForm = document.createElement("form");
    urlForm.className = "ed-add-url";
    const urlInput = document.createElement("input");
    urlInput.type = "text"; urlInput.placeholder = t("staff.site.addUrlPh");
    urlForm.appendChild(urlInput);
    urlForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = urlInput.value.trim();
      if (!v) return;
      const arr = MED.items(s.id);
      arr.push({ src: v, video: isVideoUrl(v) });
      commitMedia(det, s, arr);
    });
    tile.appendChild(btnRow);
    tile.appendChild(urlForm);
    return tile;
  }

  function fillSet(det, s) {
    const open = det.open;
    det.innerHTML = "";
    det.className = "ed-mset" + (MED.isOverridden(s.id) ? " is-edited" : "");
    det.open = open;
    const items = MED.items(s.id);

    const sum = document.createElement("summary");
    sum.innerHTML =
      '<span class="ed-mset-thumb"></span>' +
      '<span class="ed-mset-title"></span>' +
      '<span class="ed-mset-count"></span>';
    const th = sum.querySelector(".ed-mset-thumb");
    if (items[0]) {
      const im = document.createElement(items[0].video ? "video" : "img");
      im.src = encodeURI(items[0].src);
      if (items[0].video) im.muted = true; else im.loading = "lazy";
      th.appendChild(im);
    } else th.classList.add("empty");
    sum.querySelector(".ed-mset-title").textContent = setLabel(s);
    sum.querySelector(".ed-mset-count").textContent =
      items.length + (MED.isOverridden(s.id) ? " · " + t("staff.site.edited") : "");
    det.appendChild(sum);

    const body = document.createElement("div");
    body.className = "ed-mset-body";

    const toolbar = document.createElement("div");
    toolbar.className = "ed-mset-toolbar";
    const viewLink = document.createElement("a");
    viewLink.className = "ed-field-view";
    viewLink.href = siteUrl(s.section, s.labelKey);
    viewLink.target = "_blank"; viewLink.rel = "noopener";
    viewLink.textContent = t("staff.site.viewOnSite") + " ↗";
    toolbar.appendChild(viewLink);
    if (MED.isOverridden(s.id)) {
      const rs = document.createElement("button");
      rs.type = "button"; rs.className = "ed-field-reset";
      rs.textContent = t("staff.site.resetSet");
      rs.addEventListener("click", () => {
        if (!confirm(t("staff.site.resetSetConfirm"))) return;
        MED.reset(s.id);
        logEdit({ type: "photoReset", setId: s.id, label: s.labelKey });
        fillSet(det, s);
        publishToast();
      });
      toolbar.appendChild(rs);
    }
    body.appendChild(toolbar);

    // Cover chooser: the section's main photo (or video) on the live site is the
    // first item. Upload a fresh one or pick from the on-site gallery; either is
    // placed first (and "★" on any tile promotes it to cover).
    const coverBar = document.createElement("div");
    coverBar.className = "ed-cover-bar";
    const coverText = document.createElement("div");
    coverText.className = "ed-cover-text";
    coverText.innerHTML = '<span class="ed-cover-title"></span><span class="ed-cover-hint"></span>';
    coverText.querySelector(".ed-cover-title").textContent = "★ " + t("staff.site.coverLabel");
    coverText.querySelector(".ed-cover-hint").textContent = t("staff.site.coverHint");
    const coverBtns = document.createElement("div");
    coverBtns.className = "ed-cover-btns";
    const cUp = document.createElement("button");
    cUp.type = "button"; cUp.className = "ed-cover-up";
    cUp.textContent = "＋ " + t("staff.site.coverUpload");
    cUp.addEventListener("click", () => {
      pickImageFile((item) => { const arr = MED.items(s.id); arr.unshift(item); commitMedia(det, s, arr); });
    });
    const cGal = document.createElement("button");
    cGal.type = "button"; cGal.className = "ed-cover-gal";
    cGal.textContent = "⊞ " + t("staff.site.coverFromGallery");
    cGal.addEventListener("click", () => {
      openGalleryPicker((item) => { const arr = MED.items(s.id); arr.unshift(item); commitMedia(det, s, arr); });
    });
    coverBtns.appendChild(cUp); coverBtns.appendChild(cGal);
    coverBar.appendChild(coverText); coverBar.appendChild(coverBtns);
    body.appendChild(coverBar);

    const grid = document.createElement("div");
    grid.className = "ed-tiles";
    items.forEach((it, idx) => grid.appendChild(buildTile(det, s, items, idx)));
    grid.appendChild(buildAddTile(det, s));
    body.appendChild(grid);
    det.appendChild(body);
  }

  function renderMediaSets() {
    const wrap = document.getElementById("edMediaSets");
    if (!wrap || !MED) return;
    wrap.innerHTML = "";
    MED.sets().forEach((s) => {
      const det = document.createElement("details");
      det.className = "ed-mset";
      wrap.appendChild(det);
      fillSet(det, s);
    });
  }

  /* ---- previous edits (history) ---- */
  function renderHistory() {
    const wrap = document.getElementById("edHistory");
    if (!wrap) return;
    const c = S.read("content", {}) || {};
    const log = Array.isArray(c.editLog) ? c.editLog.slice().reverse() : [];
    if (!log.length) { wrap.innerHTML = '<p class="muted">' + esc(t("staff.site.historyEmpty")) + "</p>"; return; }
    wrap.innerHTML = "";
    log.forEach((e) => {
      const row = document.createElement("div");
      row.className = "ed-hist-row";
      let desc = "";
      if (e.type === "text") {
        // Name the field the way the editor labels it ("Studio B 4 Name"), not
        // by its raw i18n key — the people reading this history are the front
        // desk, and "rooms.studioB4Name" tells them nothing.
        desc = t("staff.site.histText")
          .replace("{key}", humanizeKey(e.key))
          .replace("{lang}", I.LANG_NAMES[e.lang] || e.lang);
      } else if (e.type === "photo") {
        desc = t("staff.site.histPhoto").replace("{set}", t(e.label)).replace("{n}", e.count);
      } else if (e.type === "photoReset") {
        desc = t("staff.site.histPhotoReset").replace("{set}", t(e.label));
      } else if (e.type === "reset") {
        desc = t("staff.site.histReset");
      } else { desc = e.type; }

      row.innerHTML =
        '<div class="eh-head"><span class="eh-who"></span><span class="eh-time"></span></div>' +
        '<div class="eh-desc"></div>';
      row.querySelector(".eh-who").textContent = e.userName || "—";
      row.querySelector(".eh-time").textContent = new Date(e.ts).toLocaleString();
      row.querySelector(".eh-desc").textContent = desc;
      if (e.type === "text") {
        const diff = document.createElement("div");
        diff.className = "eh-diff";
        diff.innerHTML = '<span class="eh-from"></span><span class="eh-arrow">→</span><span class="eh-to"></span>';
        diff.querySelector(".eh-from").textContent = (e.from || "").slice(0, 90) || "—";
        diff.querySelector(".eh-to").textContent = (e.to || "").slice(0, 90) || "—";
        row.appendChild(diff);
      }
      wrap.appendChild(row);
    });
  }

  /* ---- theme colours ---- */
  function renderColors() {
    const wrap = document.getElementById("edColors");
    if (!wrap) return;
    const c = S.read("content", {}) || {};
    const theme = c.theme || {};
    wrap.innerHTML = "";
    THEME_COLORS.forEach((col) => {
      const row = document.createElement("label");
      row.className = "ed-color";
      const swatch = document.createElement("input");
      swatch.type = "color";
      swatch.value = theme[col.key] || col.def;
      // "change" (not "input") fires once the colour is committed, so we don't
      // flood the store with writes while the user drags the picker.
      swatch.addEventListener("change", () => {
        const cc = S.read("content", {}) || {};
        cc.theme = cc.theme || {};
        cc.theme[col.key] = swatch.value;
        S.write("content", cc);
        publishToast();
      });
      const span = document.createElement("span");
      span.textContent = t(col.label);
      row.appendChild(swatch);
      row.appendChild(span);
      wrap.appendChild(row);
    });
  }
  function resetTheme() {
    const c = S.read("content", {}) || {};
    delete c.theme;
    S.write("content", c);
    renderColors();
    publishToast();
  }

  /* ---- room rates (Site Editor "Rates" tab) ----
     Unlike every other Site Editor tab, this data is server-authoritative
     (site_content.rates via GET/PUT /api/rates, backend/routes/rates.js) —
     it's the real price backend/routes/payments.js charges guests, not a
     cosmetic localStorage-only override. Loaded once and cached; Save
     submits the whole tab's current values in one PUT (not autosave-on-blur,
     so a fat-fingered field can never silently go live). */
  const RATE_MIN = 0;
  const RATE_MAX = 100000;
  let ratesData = null; // { [room]: { maxGuests, extraBedAvailable, variants: [{label, room, bf, overridden}] } }
  let ratesSurcharges = null; // { extraBed, extraBreakfastGuest }
  let dayUseRatesData = null; // { [room]: number } — flat, like ratesSurcharges, not per-variant
  // { enabled, vatRate, rates: { card, promptpay } } — the online payment fee
  // passed on to the guest (backend/lib/paymentFees.js). Stored as
  // PROPORTIONS; the fields below show and accept PERCENTAGES.
  let paymentFeesData = null;
  let ratesWired = false;

  // A percentage a person types (3.65) <-> the proportion the API stores
  // (0.0365). Every crossing of that boundary goes through these two, because
  // one un-converted 3.65 would try to add 365% to every booking.
  function pctToRate(pct) { return Math.round(Number(pct) * 1e6) / 1e8; }
  function rateToPct(rate) { return Math.round(Number(rate) * 1e8) / 1e6; }
  /* Takes the RAW field value, not a Number.

     `Number("")` is 0, and zero is a legitimate fee rate (a gateway that
     charges nothing), so a validator that only saw the number could not tell
     "the hotel takes no cut on cards" from "somebody cleared this box". The
     second saves a 0% rate and the hotel silently absorbs the fee again on
     every online booking from then on — invisible, because the booking page
     simply stops showing a fee line. An empty box is a mistake; reject it. */
  function validPctField(raw, max) {
    if (typeof raw !== "string" || raw.trim() === "") return false;
    const n = Number(raw);
    return isFinite(n) && n >= 0 && n <= max;
  }

  function validRateInput(n) {
    return typeof n === "number" && isFinite(n) && n > RATE_MIN && n <= RATE_MAX;
  }

  async function renderRates() {
    const wrap = document.getElementById("edRates");
    if (!wrap) return;
    if (!ratesData) {
      wrap.innerHTML = '<p class="muted">' + esc(t("staff.site.ratesLoading")) + "</p>";
      const res = await J.api.get("/api/rates");
      if (J.api.isOffline(res) || !res || res.error || !res.rooms) {
        wrap.innerHTML = '<p class="muted">' + esc(t("staff.site.ratesError")) + "</p>";
        return;
      }
      ratesData = res.rooms;
      ratesSurcharges = res.surcharges || { extraBed: 500, extraBreakfastGuest: 190, childBreakfast5to8: 100 };
      dayUseRatesData = res.dayUse || {};
      paymentFeesData = res.paymentFees ||
        { enabled: true, vatRate: 0.07, rates: { card: 0.0365, promptpay: 0.0265 } };
    }
    buildRatesRows(wrap);
    wireRatesSave();
  }

  // Two flat, room-wide surcharges (not per room+variant) applied to a 3rd
  // guest — see backend/lib/roomRates.js's DEFAULT_SURCHARGES. Rendered as
  // their own small section above the per-room rows.
  function buildSurchargeFields(wrap) {
    const section = document.createElement("div");
    section.className = "ed-rate-surcharges";

    const heading = document.createElement("div");
    heading.className = "ed-rate-label";
    heading.textContent = t("staff.site.ratesSurchargesTitle");
    section.appendChild(heading);

    const bedField = document.createElement("label");
    bedField.className = "ed-rate-field";
    const bedInput = document.createElement("input");
    bedInput.type = "number"; bedInput.min = "1"; bedInput.max = String(RATE_MAX);
    bedInput.value = ratesSurcharges.extraBed;
    bedInput.dataset.surcharge = "extraBed";
    bedField.appendChild(document.createTextNode(t("staff.site.ratesSurchargeBed")));
    bedField.appendChild(bedInput);

    const bfField = document.createElement("label");
    bfField.className = "ed-rate-field";
    const bfInput = document.createElement("input");
    bfInput.type = "number"; bfInput.min = "1"; bfInput.max = String(RATE_MAX);
    bfInput.value = ratesSurcharges.extraBreakfastGuest;
    bfInput.dataset.surcharge = "extraBreakfastGuest";
    bfField.appendChild(document.createTextNode(t("staff.site.ratesSurchargeBreakfast")));
    bfField.appendChild(bfInput);

    const childBfField = document.createElement("label");
    childBfField.className = "ed-rate-field";
    const childBfInput = document.createElement("input");
    childBfInput.type = "number"; childBfInput.min = "1"; childBfInput.max = String(RATE_MAX);
    childBfInput.value = ratesSurcharges.childBreakfast5to8;
    childBfInput.dataset.surcharge = "childBreakfast5to8";
    childBfField.appendChild(document.createTextNode(t("staff.site.ratesSurchargeChildBreakfast")));
    childBfField.appendChild(childBfInput);

    section.appendChild(bedField);
    section.appendChild(bfField);
    section.appendChild(childBfField);
    wrap.appendChild(section);
  }

  // Day Use (3-hour short-stay) flat prices — one number per room, no
  // room/breakfast split, so it's rendered like buildSurchargeFields()
  // above rather than the per-variant room rows below.
  function buildDayUseFields(wrap) {
    const section = document.createElement("div");
    section.className = "ed-rate-surcharges";

    const heading = document.createElement("div");
    heading.className = "ed-rate-label";
    heading.textContent = t("staff.site.ratesDayUseTitle");
    section.appendChild(heading);

    Object.keys(dayUseRatesData).forEach((roomName) => {
      const field = document.createElement("label");
      field.className = "ed-rate-field";
      const input = document.createElement("input");
      input.type = "number"; input.min = "1"; input.max = String(RATE_MAX);
      input.value = dayUseRatesData[roomName];
      input.dataset.dayuse = roomName;
      field.appendChild(document.createTextNode(roomName));
      field.appendChild(input);
      section.appendChild(field);
    });

    wrap.appendChild(section);
  }

  /* ── The online payment fee (backend/lib/paymentFees.js) ───────────────
     The one card in this tab that is not a price the hotel sets — it is the
     hotel's own cost, passed on. Three things have to be visible together or
     it cannot be managed at all:

       · the switch, because passing a card fee to a cardholder is a
         commercial decision the hotel must be able to reverse in one tick;
       · the rates the acquirer QUOTES, typed as percentages;
       · what the acquirer has actually been DEDUCTING, derived from settled
         charges — filled in asynchronously below, because "our rate is 3.65%"
         is a belief, and the only way that belief goes wrong is silently. */
  function buildPaymentFeeFields(wrap) {
    const section = document.createElement("div");
    section.className = "ed-rate-surcharges ed-fee-card";

    const heading = document.createElement("div");
    heading.className = "ed-rate-label";
    heading.textContent = t("staff.site.feeTitle");
    section.appendChild(heading);

    const blurb = document.createElement("p");
    blurb.className = "muted ed-fee-note";
    blurb.textContent = t("staff.site.feeNote");
    section.appendChild(blurb);

    const onField = document.createElement("label");
    onField.className = "ed-rate-field ed-fee-toggle";
    const onInput = document.createElement("input");
    onInput.type = "checkbox";
    onInput.checked = paymentFeesData.enabled !== false;
    onInput.id = "edFeeEnabled";
    onField.appendChild(onInput);
    onField.appendChild(document.createTextNode(" " + t("staff.site.feeEnabled")));
    section.appendChild(onField);

    // One row per method, plus VAT. Percentages, with the resulting all-in
    // rate spelled out beside them so nobody adds 3.65 and 7 together — the
    // hotel's own staff have already made that mistake in writing.
    [["card", "staff.site.feeCard"], ["promptpay", "staff.site.feePromptPay"]].forEach(([method, key]) => {
      const field = document.createElement("label");
      field.className = "ed-rate-field";
      const input = document.createElement("input");
      input.type = "number"; input.min = "0"; input.max = "20"; input.step = "0.01";
      input.value = rateToPct(paymentFeesData.rates[method]);
      input.dataset.feeRate = method;
      field.appendChild(document.createTextNode(t(key)));
      field.appendChild(input);
      const eff = document.createElement("span");
      eff.className = "ed-fee-eff";
      eff.dataset.feeEff = method;
      field.appendChild(eff);
      section.appendChild(field);
    });

    const vatField = document.createElement("label");
    vatField.className = "ed-rate-field";
    const vatInput = document.createElement("input");
    vatInput.type = "number"; vatInput.min = "0"; vatInput.max = "30"; vatInput.step = "0.01";
    vatInput.value = rateToPct(paymentFeesData.vatRate);
    vatInput.dataset.feeVat = "1";
    vatField.appendChild(document.createTextNode(t("staff.site.feeVat")));
    vatField.appendChild(vatInput);
    section.appendChild(vatField);

    // Live "so a 1,000 THB room becomes…" line. An abstract percentage is
    // hard to sanity-check; a worked example is not.
    const example = document.createElement("div");
    example.className = "ed-fee-example";
    section.appendChild(example);

    const observed = document.createElement("div");
    observed.className = "ed-fee-observed";
    observed.textContent = t("staff.site.feeObservedLoading");
    section.appendChild(observed);

    const repaint = () => {
      const vat = pctToRate(Number(vatInput.value));
      section.querySelectorAll("input[data-fee-rate]").forEach((inp) => {
        const rate = pctToRate(Number(inp.value));
        const k = rate * (1 + vat);
        const badge = section.querySelector('[data-fee-eff="' + inp.dataset.feeRate + '"]');
        if (badge) badge.textContent = isFinite(k) ? "= " + (Math.round(k * 10000) / 100).toFixed(2) + "%" : "";
      });
      const cardRate = pctToRate(Number((section.querySelector('input[data-fee-rate="card"]') || {}).value || 0));
      const k = cardRate * (1 + vat);
      const gross = (k > 0 && k < 1 && onInput.checked) ? Math.ceil(Number((1000 / (1 - k)).toFixed(6))) : 1000;
      example.textContent = t("staff.site.feeExample").replace("{total}", String(gross)).replace("{fee}", String(gross - 1000));
    };
    section.addEventListener("input", repaint);
    section.addEventListener("change", repaint);
    repaint();

    wrap.appendChild(section);

    /* What the acquirer really kept, from settled charges. Fetched after the
       card is on screen — it is evidence, not a setting, and a slow or failed
       lookup must never hold up editing the numbers above it. */
    J.api.get("/api/rates/observed-fees").then((res) => {
      if (!res || res.error || !res.observed) {
        observed.textContent = t("staff.site.feeObservedNone");
        return;
      }
      const methods = Object.keys(res.observed);
      if (!methods.length) { observed.textContent = t("staff.site.feeObservedNone"); return; }
      observed.innerHTML = "<strong>" + esc(t("staff.site.feeObservedTitle")) + "</strong> " +
        methods.map((m) => {
          const o = res.observed[m];
          return esc(m) + ": " + (Math.round(o.effectiveRate * 10000) / 100).toFixed(2) + "% " +
            esc(t("staff.site.feeObservedOver").replace("{n}", String(o.charges)));
        }).join(" · ");
    }).catch(() => { observed.textContent = t("staff.site.feeObservedNone"); });
  }

  function buildRatesRows(wrap) {
    wrap.innerHTML = "";
    buildPaymentFeeFields(wrap);
    buildSurchargeFields(wrap);
    buildDayUseFields(wrap);
    Object.keys(ratesData).forEach((roomName) => {
      const room = ratesData[roomName];
      (room.variants || []).forEach((v) => {
        const row = document.createElement("div");
        row.className = "ed-rate-row";

        const label = document.createElement("div");
        label.className = "ed-rate-label";
        label.textContent = roomName + " — " + v.label + (v.overridden ? " *" : "");
        row.appendChild(label);

        const roomField = document.createElement("label");
        roomField.className = "ed-rate-field";
        const roomInput = document.createElement("input");
        roomInput.type = "number"; roomInput.min = "1"; roomInput.max = String(RATE_MAX);
        roomInput.value = v.room;
        roomInput.dataset.room = roomName; roomInput.dataset.variant = v.label; roomInput.dataset.field = "room";
        roomField.appendChild(document.createTextNode(t("staff.site.ratesRoomOnly")));
        roomField.appendChild(roomInput);

        const bfField = document.createElement("label");
        bfField.className = "ed-rate-field";
        const bfInput = document.createElement("input");
        bfInput.type = "number"; bfInput.min = "1"; bfInput.max = String(RATE_MAX);
        bfInput.value = v.bf;
        bfInput.dataset.room = roomName; bfInput.dataset.variant = v.label; bfInput.dataset.field = "bf";
        bfField.appendChild(document.createTextNode(t("staff.site.ratesWithBreakfast")));
        bfField.appendChild(bfInput);

        row.appendChild(roomField);
        row.appendChild(bfField);
        wrap.appendChild(row);
      });
    });
  }

  function wireRatesSave() {
    const btn = document.getElementById("edRatesSave");
    if (!btn || ratesWired) return;
    ratesWired = true;
    btn.addEventListener("click", async () => {
      const wrap = document.getElementById("edRates");
      if (!wrap) return;
      let hasError = false;

      const payload = {};
      wrap.querySelectorAll("input[data-room]").forEach((inp) => {
        inp.classList.remove("ed-rate-invalid");
        const val = Number(inp.value);
        if (!validRateInput(val)) { inp.classList.add("ed-rate-invalid"); hasError = true; return; }
        const r = inp.dataset.room, v = inp.dataset.variant, f = inp.dataset.field;
        payload[r] = payload[r] || {};
        payload[r][v] = payload[r][v] || {};
        payload[r][v][f] = val;
      });

      const surchargePayload = {};
      wrap.querySelectorAll("input[data-surcharge]").forEach((inp) => {
        inp.classList.remove("ed-rate-invalid");
        const val = Number(inp.value);
        if (!validRateInput(val)) { inp.classList.add("ed-rate-invalid"); hasError = true; return; }
        surchargePayload[inp.dataset.surcharge] = val;
      });

      const dayUsePayload = {};
      wrap.querySelectorAll("input[data-dayuse]").forEach((inp) => {
        inp.classList.remove("ed-rate-invalid");
        const val = Number(inp.value);
        if (!validRateInput(val)) { inp.classList.add("ed-rate-invalid"); hasError = true; return; }
        dayUsePayload[inp.dataset.dayuse] = val;
      });

      /* The payment fee. Converted from the percentages a person types to
         the proportions the API stores — the one place that conversion can
         be forgotten, and forgetting it would submit a 3.65 that the server
         rejects as "must be a proportion" rather than silently applying.
         Validated here too so a bad value never leaves the browser. */
      const feePayload = { rates: {} };
      const feeToggle = wrap.querySelector("#edFeeEnabled");
      if (feeToggle) feePayload.enabled = !!feeToggle.checked;
      wrap.querySelectorAll("input[data-fee-rate]").forEach((inp) => {
        inp.classList.remove("ed-rate-invalid");
        if (!validPctField(inp.value, 20)) { inp.classList.add("ed-rate-invalid"); hasError = true; return; }
        feePayload.rates[inp.dataset.feeRate] = pctToRate(Number(inp.value));
      });
      const vatInput = wrap.querySelector("input[data-fee-vat]");
      if (vatInput) {
        vatInput.classList.remove("ed-rate-invalid");
        if (!validPctField(vatInput.value, 30)) { vatInput.classList.add("ed-rate-invalid"); hasError = true; }
        else feePayload.vatRate = pctToRate(Number(vatInput.value));
      }

      if (hasError) { U.toast(t("staff.site.ratesError"), "error"); return; }

      btn.disabled = true;
      const res = await J.api.put("/api/rates", {
        rates: payload, surcharges: surchargePayload, dayUse: dayUsePayload, paymentFees: feePayload,
      });
      btn.disabled = false;
      if (J.api.isOffline(res) || !res || res.error) {
        U.toast((res && res.error) || t("staff.site.ratesError"), "error");
        return;
      }
      // Same defensive shape the three lines below already use. A 200 that
      // somehow came back without `rooms` would otherwise throw inside
      // buildRatesRows() and leave the tab blank AFTER a successful save —
      // the one moment an admin most needs to see what was stored.
      ratesData = res.rooms || ratesData;
      ratesSurcharges = res.surcharges || ratesSurcharges;
      dayUseRatesData = res.dayUse || dayUseRatesData;
      paymentFeesData = res.paymentFees || paymentFeesData;
      buildRatesRows(wrap);
      U.toast(t("staff.site.ratesSaved"), "success");
    });
  }

  /* ====================  LIVE CHAT EDITOR (admin)  ====================
     Edits the guest chat assistant's wording, trigger words and answer list,
     in all five languages, and saves it server-side (backend/routes/
     chatConfig.js) so it reaches every guest device — unlike the plain-text
     CMS, which is browser-local. Answers/labels are typed once in the chosen
     editing language and translated into the other four here in the browser
     (same keyless service as the text editor's autoTranslateField). The shape
     written here is exactly what assets/js/chat.js reads and merges over its
     shipped defaults. Everything is kept sparse: only what an admin actually
     changed is stored, so future default wording still flows through. */

  // Default answers the bot ships with. ids/keywords/quick MUST match
  // assets/js/chat.js's TOPICS/QUICK (the answer TEXT itself lives in i18n
  // under chat.a.<id>, read here via I.base). Keywords here only prefill the
  // editor field; the admin can change them.
  const CHAT_BUILTIN = [
    { id: "checkin", quick: true,  kw: ["check-in","check in","checkout","check-out","check out","late check","เช็คอิน","เช็คเอาท์","เลื่อนเช็ค","チェックイン","チェックアウト","入住","退房"] },
    { id: "taxi",    quick: false, kw: ["taxi","cab","แท็กซี่","รถแท็กซี่","เรียกแท็กซี่","รับส่ง","タクシー","空港送迎","送迎","出租车","計程車","打车","叫車"] },
    { id: "wakeup",  quick: false, kw: ["wake up call","wake-up call","wakeup call","wake up","morning call","alarm","ปลุก","โทรปลุก","บริการปลุก","モーニングコール","起こして","叫醒服务","叫醒电话","叫醒服務","喚醒"] },
    { id: "wifi",    quick: true,  kw: ["wifi","wi-fi","internet","password","network","รหัสผ่าน","อินเทอร์เน็ต","ไวไฟ","パスワード","ネット","无线","网络","密码","無線","網路","密碼"] },
    { id: "pool",    quick: true,  kw: ["pool","swim","onsen","spa","สระ","ว่ายน้ำ","ออนเซ็น","プール","温泉","泳池","游泳","溫泉"] },
    { id: "halal",   quick: false, kw: ["halal","non-pork","no pork","pork-free","pork free","pork","muslim","islam","ฮาลาล","ไม่ใส่หมู","ไม่มีหมู","ไม่กินหมู","มุสลิม","อิสลาม","ハラル","ハラール","豚肉","イスラム","ムスリム","清真","穆斯林","猪肉","豬肉"] },
    { id: "dining",  quick: true,  kw: ["dining","restaurant","eat","food","breakfast","dinner","tsubaki","อาหาร","ร้าน","ทาน","อาหารเช้า","レストラン","食事","朝食","餐","吃","用餐","餐廳","餐厅"] },
    { id: "coffee",  quick: true,  kw: ["coffee","cocktail","bar","midnight","drink","กาแฟ","ค็อกเทล","บาร์","コーヒー","カクテル","咖啡","鸡尾酒","雞尾酒","酒吧"] },
    { id: "parking", quick: true,  kw: ["park","parking","car","ที่จอด","รถ","駐車","停车","停車"] },
    { id: "rates",   quick: true,  kw: ["rate","rates","price","prices","cost","how much","nightly","per night","ราคา","เท่าไหร่","ค่าห้อง","料金","値段","价格","价钱","價格","價錢"] }
  ];
  // System messages the bot uses around the scripted answers. def is the
  // shipped i18n key the editor prefills from and falls back to.
  const CHAT_SYS = [
    { key: "greeting",      def: "chat.greeting" },
    { key: "subtitle",      def: "chat.subtitle" },
    { key: "connecting",    def: "chat.connectedTo" },
    { key: "waitTime",      def: "chat.noStaffOnShift" },
    { key: "notUnderstood", def: "chat.a.default" },
    { key: "hello",         def: "chat.a.hello" },
    { key: "thanks",        def: "chat.a.thanks" }
  ];

  let edChatCfg = null;       // working copy { system:{}, topics:[] }
  let edChatLoading = false;

  function chatTopicEntry(id, builtin) {
    let e = edChatCfg.topics.find((tp) => tp.id === id);
    if (!e) { e = { id: id, builtin: !!builtin }; edChatCfg.topics.push(e); }
    return e;
  }
  function chatRemoveTopic(id) {
    edChatCfg.topics = edChatCfg.topics.filter((tp) => tp.id !== id);
  }
  function chatEffText(map, lang) {
    return (map && typeof map[lang] === "string" && map[lang].trim()) ? map[lang] : "";
  }
  // Store one language of a { lang: text } bag (answer/label). Empty, or equal
  // to the shipped default, stores nothing — so unedited languages keep
  // following the default and the saved config stays small.
  function setLangField(obj, field, lang, val, baseText) {
    const m = obj[field] || {};
    if (val == null || !val.trim() || val === baseText) delete m[lang];
    else m[lang] = val;
    if (Object.keys(m).length) obj[field] = m; else delete obj[field];
  }
  function setSysField(key, lang, val, defKey) {
    edChatCfg.system = edChatCfg.system || {};
    const m = edChatCfg.system[key] || {};
    const base = I.base(defKey, lang);
    if (val == null || !val.trim() || val === base) delete m[lang];
    else m[lang] = val;
    if (Object.keys(m).length) edChatCfg.system[key] = m; else delete edChatCfg.system[key];
  }
  // Translate a freshly typed string into the other four languages and hand
  // each to applyFn. Best-effort: a failed translation keeps the source text.
  function chatTranslate(srcLang, val, statusEl, applyFn) {
    const targets = I.SUPPORTED.filter((l) => l !== srcLang);
    if (!val || !val.trim()) { targets.forEach((l) => applyFn(l, "")); return; }
    if (statusEl) { statusEl.textContent = t("staff.chat.translating"); statusEl.className = "ect-status translating"; }
    Promise.all(targets.map((l) =>
      J.translate.text(val, l).then((r) => { applyFn(l, (r && r.text) ? r.text : val); return true; }).catch(() => false)
    )).then(() => {
      if (statusEl) {
        statusEl.textContent = t("staff.chat.translated"); statusEl.className = "ect-status saved";
        setTimeout(() => { statusEl.textContent = ""; statusEl.className = "ect-status"; }, 2000);
      }
    });
  }

  function renderChatLang() {
    const sel = document.getElementById("edChatLangSel");
    if (!sel) return;
    if (!edLang) edLang = I.getLang();
    sel.innerHTML = "";
    I.SUPPORTED.forEach((l) => {
      const o = document.createElement("option");
      o.value = l; o.textContent = I.LANG_NAMES[l] || l;
      if (l === edLang) o.selected = true;
      sel.appendChild(o);
    });
  }

  async function renderChatConfig() {
    const wrap = document.getElementById("edChat");
    if (!wrap) return;
    renderChatLang();
    if (!edChatCfg) {
      if (edChatLoading) return;
      edChatLoading = true;
      wrap.innerHTML = '<p class="muted">' + esc(t("staff.chat.loading")) + "</p>";
      const res = await J.api.get("/api/chat-config");
      edChatLoading = false;
      if (J.api.isOffline(res) || !res || res.error) {
        wrap.innerHTML = '<p class="muted">' + esc(t("staff.chat.error")) + "</p>";
        return;
      }
      const cfg = (res && res.config && typeof res.config === "object") ? res.config : {};
      edChatCfg = {
        system: (cfg.system && typeof cfg.system === "object") ? cfg.system : {},
        topics: Array.isArray(cfg.topics) ? cfg.topics : []
      };
    }
    buildChatEditor(wrap);
  }

  function buildChatEditor(wrap) {
    if (!wrap || !edChatCfg) return;
    wrap.innerHTML = "";
    const lang = edLang || I.getLang();

    // ---- system messages ----
    const sysCard = document.createElement("div");
    sysCard.className = "ed-chat-group";
    const sysH = document.createElement("h4");
    sysH.textContent = t("staff.chat.systemTitle");
    sysCard.appendChild(sysH);
    const sysHint = document.createElement("p");
    sysHint.className = "ed-hint"; sysHint.textContent = t("staff.chat.systemHint");
    sysCard.appendChild(sysHint);
    CHAT_SYS.forEach((m) => {
      const cur = chatEffText(edChatCfg.system[m.key], lang) || I.base(m.def, lang);
      const field = document.createElement("label"); field.className = "ect-field";
      const cap = document.createElement("span"); cap.className = "ect-cap"; cap.textContent = t("staff.chat.sys." + m.key);
      const ta = document.createElement("textarea"); ta.className = "ect-sys"; ta.rows = 2; ta.value = cur;
      const status = document.createElement("span"); status.className = "ect-status";
      ta.addEventListener("change", () => {
        const val = ta.value;
        setSysField(m.key, lang, val, m.def);
        chatTranslate(lang, val, status, (l, txt) => setSysField(m.key, l, txt, m.def));
      });
      field.appendChild(cap); field.appendChild(ta); field.appendChild(status);
      sysCard.appendChild(field);
    });
    wrap.appendChild(sysCard);

    // ---- answers ----
    const ansH = document.createElement("h4");
    ansH.className = "ed-chat-h"; ansH.textContent = t("staff.chat.answersTitle");
    wrap.appendChild(ansH);
    const ansHint = document.createElement("p");
    ansHint.className = "ed-hint"; ansHint.textContent = t("staff.chat.answersHint");
    wrap.appendChild(ansHint);

    CHAT_BUILTIN.forEach((b) => wrap.appendChild(buildTopicCard(b, lang)));
    edChatCfg.topics.forEach((e) => {
      if (e.builtin || CHAT_BUILTIN.some((b) => b.id === e.id)) return;
      wrap.appendChild(buildTopicCard({ id: e.id, custom: true }, lang));
    });
  }

  function buildTopicCard(spec, lang) {
    const id = spec.id;
    const custom = !!spec.custom;
    const entry = edChatCfg.topics.find((tp) => tp.id === id) || null;

    const defKw = custom ? [] : (spec.kw || []);
    const defQuick = custom ? false : !!spec.quick;
    const defAnswerKey = custom ? null : ("chat.a." + id);
    const defLabelKey = custom ? null : ("chat.quick." + id);
    const defAnswer = defAnswerKey ? I.base(defAnswerKey, lang) : "";
    const defLabelRaw = defLabelKey ? I.base(defLabelKey, lang) : "";
    // I.base returns the key itself when there's no dictionary entry (e.g.
    // taxi/wakeup/halal have no quick-button label) — treat that as "no label".
    const defLabel = (defLabelRaw && defLabelRaw !== defLabelKey) ? defLabelRaw : "";

    const enabled = entry ? entry.enabled !== false : true;
    const quick = entry && typeof entry.quick === "boolean" ? entry.quick : defQuick;
    const kw = entry && Array.isArray(entry.keywords) ? entry.keywords : defKw;
    const answer = (entry && chatEffText(entry.answer, lang)) || defAnswer;
    const label = (entry && chatEffText(entry.label, lang)) || defLabel;

    const card = document.createElement("div");
    card.className = "ed-chat-topic" + (enabled ? "" : " disabled");
    card.dataset.id = id;

    const head = document.createElement("div"); head.className = "ect-head";
    const enWrap = document.createElement("label"); enWrap.className = "ect-enable";
    const enCb = document.createElement("input"); enCb.type = "checkbox"; enCb.checked = enabled;
    const title = document.createElement("b");
    title.textContent = custom ? (label || t("staff.chat.newAnswer")) : (defLabel || humanizeKey(id));
    enWrap.appendChild(enCb); enWrap.appendChild(title);
    head.appendChild(enWrap);
    const idTag = document.createElement("span"); idTag.className = "ect-id"; idTag.textContent = id;
    head.appendChild(idTag);
    if (custom) {
      const del = document.createElement("button");
      del.type = "button"; del.className = "ect-del"; del.textContent = t("common.delete");
      del.addEventListener("click", () => { chatRemoveTopic(id); renderChatConfig(); });
      head.appendChild(del);
    }
    card.appendChild(head);
    enCb.addEventListener("change", () => {
      const e = chatTopicEntry(id, !custom);
      e.enabled = enCb.checked;
      card.classList.toggle("disabled", !enCb.checked);
    });

    // keywords
    const kwField = document.createElement("label"); kwField.className = "ect-field";
    const kwCap = document.createElement("span"); kwCap.className = "ect-cap"; kwCap.textContent = t("staff.chat.keywords");
    const kwTa = document.createElement("textarea"); kwTa.className = "ect-kw"; kwTa.rows = 2; kwTa.value = kw.join(", ");
    const kwHint = document.createElement("span"); kwHint.className = "ect-sub"; kwHint.textContent = t("staff.chat.keywordsHint");
    kwField.appendChild(kwCap); kwField.appendChild(kwTa); kwField.appendChild(kwHint);
    card.appendChild(kwField);
    kwTa.addEventListener("change", () => {
      const arr = kwTa.value.split(",").map((s) => s.trim()).filter(Boolean);
      const e = chatTopicEntry(id, !custom);
      if (!custom && JSON.stringify(arr) === JSON.stringify(defKw)) delete e.keywords;
      else e.keywords = arr;
    });

    // answer
    const ansField = document.createElement("label"); ansField.className = "ect-field";
    const ansCap = document.createElement("span"); ansCap.className = "ect-cap"; ansCap.textContent = t("staff.chat.answer");
    const ansTa = document.createElement("textarea"); ansTa.className = "ect-answer"; ansTa.rows = 3; ansTa.value = answer;
    const ansStatus = document.createElement("span"); ansStatus.className = "ect-status";
    ansField.appendChild(ansCap); ansField.appendChild(ansTa); ansField.appendChild(ansStatus);
    if (id === "rates") {
      const tok = document.createElement("span"); tok.className = "ect-sub"; tok.textContent = t("staff.chat.ratesToken");
      ansField.appendChild(tok);
    }
    card.appendChild(ansField);
    ansTa.addEventListener("change", () => {
      const val = ansTa.value;
      const e = chatTopicEntry(id, !custom);
      const base = defAnswerKey ? I.base(defAnswerKey, lang) : "";
      setLangField(e, "answer", lang, val, base);
      chatTranslate(lang, val, ansStatus, (l, txt) =>
        setLangField(e, "answer", l, txt, defAnswerKey ? I.base(defAnswerKey, l) : ""));
    });

    // quick button + its label
    const quickWrap = document.createElement("label"); quickWrap.className = "ect-quick";
    const quickCb = document.createElement("input"); quickCb.type = "checkbox"; quickCb.checked = quick;
    const quickTxt = document.createElement("span"); quickTxt.textContent = t("staff.chat.quick");
    quickWrap.appendChild(quickCb); quickWrap.appendChild(quickTxt);
    card.appendChild(quickWrap);

    const labelField = document.createElement("label"); labelField.className = "ect-field ect-labelfield";
    if (!quick) labelField.style.display = "none";
    const labelCap = document.createElement("span"); labelCap.className = "ect-cap"; labelCap.textContent = t("staff.chat.buttonLabel");
    const labelInput = document.createElement("input"); labelInput.type = "text"; labelInput.className = "ect-label"; labelInput.value = label;
    const labelStatus = document.createElement("span"); labelStatus.className = "ect-status";
    labelField.appendChild(labelCap); labelField.appendChild(labelInput); labelField.appendChild(labelStatus);
    card.appendChild(labelField);

    quickCb.addEventListener("change", () => {
      const e = chatTopicEntry(id, !custom);
      if (!custom && quickCb.checked === defQuick) delete e.quick;
      else e.quick = quickCb.checked;
      labelField.style.display = quickCb.checked ? "" : "none";
    });
    labelInput.addEventListener("change", () => {
      const val = labelInput.value;
      const e = chatTopicEntry(id, !custom);
      const braw = defLabelKey ? I.base(defLabelKey, lang) : "";
      setLangField(e, "label", lang, val, braw === defLabelKey ? "" : braw);
      chatTranslate(lang, val, labelStatus, (l, txt) => {
        const b = defLabelKey ? I.base(defLabelKey, l) : "";
        setLangField(e, "label", l, txt, b === defLabelKey ? "" : b);
      });
    });

    return card;
  }

  // Drop entries that don't actually change anything, so the saved config only
  // carries real edits (built-ins that changed, customs with real content).
  function pruneChatCfg() {
    edChatCfg.topics = edChatCfg.topics.filter((e) => {
      const hasText = (e.answer && Object.keys(e.answer).length) || (e.label && Object.keys(e.label).length);
      const isBuiltin = e.builtin || CHAT_BUILTIN.some((b) => b.id === e.id);
      if (isBuiltin) {
        return hasText || Array.isArray(e.keywords) || e.enabled === false || typeof e.quick === "boolean";
      }
      return hasText || (Array.isArray(e.keywords) && e.keywords.length);
    });
    if (edChatCfg.system && !Object.keys(edChatCfg.system).length) delete edChatCfg.system;
  }

  function addChatAnswer() {
    if (!edChatCfg) return;
    const id = "c_" + S.genId();
    edChatCfg.topics.push({ id: id, builtin: false, enabled: true, quick: false });
    renderChatConfig().then(() => {
      const el = document.querySelector('.ed-chat-topic[data-id="' + id + '"]');
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); const kw = el.querySelector(".ect-kw"); if (kw) kw.focus(); }
    });
  }

  async function saveChatConfig() {
    if (!edChatCfg) return;
    pruneChatCfg();
    const btn = document.getElementById("edChatSave");
    if (btn) btn.disabled = true;
    const res = await J.api.put("/api/chat-config", { config: edChatCfg });
    if (btn) btn.disabled = false;
    if (J.api.isOffline(res) || !res || res.error) {
      U.toast((res && res.error) || t("staff.chat.error"), "error");
      return;
    }
    const cfg = (res && res.config && typeof res.config === "object") ? res.config : {};
    edChatCfg = { system: cfg.system || {}, topics: Array.isArray(cfg.topics) ? cfg.topics : [] };
    buildChatEditor(document.getElementById("edChat"));
    U.toast(t("staff.chat.saved"), "success");
  }

  /* ---- announcements ---- */
  function renderAnnouncements() {
    const annList = document.getElementById("annEditList");
    if (!annList) return;
    const anns = S.list("announcements").slice().sort((a, b) => b.createdAt - a.createdAt);
    if (!anns.length) { annList.innerHTML = '<p class="muted">' + esc(t("staff.site.annEmpty")) + "</p>"; return; }
    annList.innerHTML = "";
    anns.forEach((a) => {
      const row = document.createElement("div");
      row.className = "ann-edit-row";
      row.innerHTML = '<span class="ae-text"></span><button type="button"></button>';
      row.querySelector(".ae-text").textContent = a.text;
      row.querySelector("button").textContent = t("common.delete");
      row.querySelector("button").addEventListener("click", () => {
        S.remove("announcements", a.id);
        renderAnnouncements();
        publish();
      });
      annList.appendChild(row);
    });
  }

  /* ---- show / hide sections ---- */
  function renderSectionToggles() {
    const togWrap = document.getElementById("sectionToggles");
    if (!togWrap) return;
    const c = S.read("content", {}) || {};
    const hidden = c.hidden || {};
    togWrap.innerHTML = "";
    SECTIONS.forEach((s) => {
      const id = "tog_" + s.id;
      const lab = document.createElement("label");
      lab.innerHTML = '<input type="checkbox" id="' + id + '"' + (hidden[s.id] ? "" : " checked") + " /> ";
      lab.appendChild(document.createTextNode(t(s.label)));
      lab.querySelector("input").addEventListener("change", (e) => {
        const cc = S.read("content", {}) || {};
        cc.hidden = cc.hidden || {};
        cc.hidden[s.id] = !e.target.checked;
        S.write("content", cc);
        publishToast();
      });
      togWrap.appendChild(lab);
    });
  }

  /* Per-room-type availability toggle (backend/routes/availability.js).
     Unlike renderSectionToggles() above (localStorage-only), each checkbox
     here saves immediately to the server — matching the Rates tab's
     real-time-save UX rather than the "Undo all my edits" batch/draft
     model, since a delisted room must reliably stay delisted across
     devices, not just in this browser. */
  // { unavailable: string[], rooms: string[], unavailableDayUse: string[],
  //   dayUseRooms: string[] } — one shared fetch feeds both the room- and
  //   day-use-availability cards below. `roomAvailPromise` de-dupes the two
  //   render calls (both fire from renderSite without awaiting each other).
  let roomAvailData = null;
  let roomAvailPromise = null;
  async function loadAvailData() {
    if (roomAvailData) return roomAvailData;
    if (!roomAvailPromise) roomAvailPromise = J.api.get("/api/availability");
    const res = await roomAvailPromise;
    if (J.api.isOffline(res) || !res || res.error || !res.rooms) {
      roomAvailPromise = null; // let a later render retry the fetch
      return null;
    }
    roomAvailData = res;
    return roomAvailData;
  }

  async function renderRoomAvailability() {
    const wrap = document.getElementById("roomAvailToggles");
    if (!wrap) return;
    if (!roomAvailData) {
      wrap.innerHTML = '<p class="muted">' + esc(t("staff.site.roomAvailLoading")) + "</p>";
      if (!(await loadAvailData())) {
        wrap.innerHTML = '<p class="muted">' + esc(t("staff.site.roomAvailError")) + "</p>";
        return;
      }
    }
    wrap.innerHTML = "";
    roomAvailData.rooms.forEach((roomName) => {
      const id = "roomAvail_" + roomName.replace(/\s+/g, "_");
      const lab = document.createElement("label");
      const available = roomAvailData.unavailable.indexOf(roomName) === -1;
      const input = document.createElement("input");
      input.type = "checkbox"; input.id = id; input.checked = available;
      lab.appendChild(input);
      lab.appendChild(document.createTextNode(" " + roomName));
      input.addEventListener("change", async (e) => {
        const isAvailable = e.target.checked;
        const next = roomAvailData.unavailable.filter((r) => r !== roomName);
        if (!isAvailable) next.push(roomName);
        input.disabled = true;
        const res2 = await J.api.put("/api/availability", { unavailable: next });
        input.disabled = false;
        if (J.api.isOffline(res2) || !res2 || res2.error) {
          U.toast((res2 && res2.error) || t("staff.site.roomAvailError"), "error");
          e.target.checked = !isAvailable;
          return;
        }
        roomAvailData.unavailable = res2.unavailable;
        U.toast(t("staff.site.roomAvailSaved"), "success");
      });
      wrap.appendChild(lab);
    });
  }

  /* Per-room-type room COUNT — "How many rooms" (backend/routes/availability.js).
     One input per PHYSICAL POOL, not per room key: Studio/Prestige/Premium
     Single and Twin are the same rooms with a different bed set-up, so the
     server writes any edit across the whole pool and this card shows them on
     one row — two independently editable numbers could disagree, and the
     booking guard reads whichever label the guest picked. Saves on change
     (blur/Enter), matching the availability toggles above. */
  const ROOM_COUNT_MIN = 0;
  const ROOM_COUNT_MAX = 500; // mirrors rateOverrides.MIN/MAX_INVENTORY

  // Local calendar date, NOT toISOString() — that is UTC, and at +07 it reads
  // as yesterday for most of the hotel's evening.
  function ymdLocal(d) {
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  /* How many of each type are still free TONIGHT. The number in the input is
     the total the hotel owns; this is that total minus tonight's bookings,
     which the server works out per date from the bookings themselves — staff
     never adjust a count when a guest books or leaves. Showing it here is what
     makes that obvious: edit the total, watch the free figure follow.
     Best-effort — if the lookup fails the card still works, just without it. */
  async function renderTonightFree() {
    const wrap = document.getElementById("roomCountRows");
    if (!wrap || !wrap.querySelector(".room-count-row")) return;
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86400000);
    const res = await J.api.get(
      "/api/v1/booking-availability?checkIn=" + ymdLocal(today) + "&checkOut=" + ymdLocal(tomorrow)
    );
    if (J.api.isOffline(res) || !res || res.error) return;
    wrap.querySelectorAll(".room-count-row").forEach((row) => {
      const key = row.dataset.room;
      const slot = row.querySelector(".rc-live");
      if (!slot || !key || res[key] == null) return;
      const free = Number(res[key]);
      slot.textContent = free <= 0
        ? t("staff.site.roomCountFullTonight")
        : t("staff.site.roomCountFreeTonight").replace("{n}", free);
      slot.classList.toggle("is-full", free <= 0);
    });
  }

  async function renderRoomCounts() {
    const wrap = document.getElementById("roomCountRows");
    if (!wrap) return;
    if (!roomAvailData) {
      wrap.innerHTML = '<p class="muted">' + esc(t("staff.site.roomAvailLoading")) + "</p>";
      if (!(await loadAvailData())) {
        wrap.innerHTML = '<p class="muted">' + esc(t("staff.site.roomAvailError")) + "</p>";
        return;
      }
    }
    const pools = roomAvailData.pools || [];
    const inventory = roomAvailData.inventory || {};
    wrap.innerHTML = "";
    pools.forEach((pool) => {
      const key = pool[0]; // any key in the pool addresses the whole pool
      const row = document.createElement("div");
      row.className = "room-count-row";
      row.dataset.room = key; // renderTonightFree() matches rows back by this

      const name = document.createElement("span");
      name.className = "rc-name";
      name.textContent = pool.join(" / ");

      const input = document.createElement("input");
      input.type = "number";
      input.min = String(ROOM_COUNT_MIN);
      input.max = String(ROOM_COUNT_MAX);
      input.step = "1";
      input.id = "roomCount_" + key.replace(/\s+/g, "_");
      input.value = String(inventory[key] != null ? inventory[key] : 0);

      const unit = document.createElement("span");
      unit.className = "rc-unit";
      unit.textContent = t("staff.site.roomCountUnit");

      // Filled in by renderTonightFree() once the live figure arrives.
      const live = document.createElement("span");
      live.className = "rc-live";

      row.appendChild(name);
      row.appendChild(input);
      row.appendChild(unit);
      row.appendChild(live);

      // The last number the server actually accepted — a rejected or failed
      // save restores it, so the field never shows a count that isn't live.
      let lastSaved = input.value;
      input.addEventListener("change", async () => {
        const raw = input.value.trim();
        if (raw === "") { input.value = lastSaved; return; } // cleared field: nothing to save
        const n = Number(raw);
        if (!Number.isInteger(n) || n < ROOM_COUNT_MIN || n > ROOM_COUNT_MAX) {
          U.toast(t("staff.site.roomCountInvalid"), "error");
          input.value = lastSaved;
          return;
        }
        if (String(n) === lastSaved) { input.value = lastSaved; return; }
        input.disabled = true;
        const payload = {};
        payload[key] = n;
        const res2 = await J.api.put("/api/availability", { inventory: payload });
        input.disabled = false;
        if (J.api.isOffline(res2) || !res2 || res2.error) {
          U.toast((res2 && res2.error) || t("staff.site.roomCountError"), "error");
          input.value = lastSaved;
          return;
        }
        if (res2.inventory) roomAvailData.inventory = res2.inventory;
        lastSaved = String(n);
        input.value = lastSaved;
        U.toast(t("staff.site.roomCountSaved"), "success");
        renderTonightFree(); // a new total changes how many are free tonight
      });

      wrap.appendChild(row);
    });
    renderTonightFree();
  }

  /* Per-building day-use availability toggle — the day-use counterpart of
     renderRoomAvailability() above. Same immediate server save, same
     endpoint (PUT sends `unavailableDayUse`, which the route updates without
     touching the room list). Building keys (B1…B5) show their friendly
     "Building N" i18n label. */
  async function renderDayUseAvailability() {
    const wrap = document.getElementById("dayUseAvailToggles");
    if (!wrap) return;
    if (!roomAvailData) {
      wrap.innerHTML = '<p class="muted">' + esc(t("staff.site.roomAvailLoading")) + "</p>";
      if (!(await loadAvailData())) {
        wrap.innerHTML = '<p class="muted">' + esc(t("staff.site.roomAvailError")) + "</p>";
        return;
      }
    }
    const dayUseRooms = roomAvailData.dayUseRooms || [];
    const unavailable = roomAvailData.unavailableDayUse || [];
    wrap.innerHTML = "";
    dayUseRooms.forEach((key) => {
      const id = "dayUseAvail_" + key.replace(/\s+/g, "_");
      const label = t("dayuse." + key.toLowerCase());
      const lab = document.createElement("label");
      const available = unavailable.indexOf(key) === -1;
      const input = document.createElement("input");
      input.type = "checkbox"; input.id = id; input.checked = available;
      lab.appendChild(input);
      lab.appendChild(document.createTextNode(" " + label));
      input.addEventListener("change", async (e) => {
        const isAvailable = e.target.checked;
        const next = (roomAvailData.unavailableDayUse || []).filter((k) => k !== key);
        if (!isAvailable) next.push(key);
        input.disabled = true;
        const res2 = await J.api.put("/api/availability", { unavailableDayUse: next });
        input.disabled = false;
        if (J.api.isOffline(res2) || !res2 || res2.error) {
          U.toast((res2 && res2.error) || t("staff.site.roomAvailError"), "error");
          e.target.checked = !isAvailable;
          return;
        }
        roomAvailData.unavailableDayUse = res2.unavailableDayUse || [];
        U.toast(t("staff.site.roomAvailSaved"), "success");
      });
      wrap.appendChild(lab);
    });
  }

  /* ---- undo every content edit (keeps demo data) ---- */
  function resetEdits() {
    if (!confirm(t("staff.site.resetEditsConfirm"))) return;
    const c = S.read("content", {}) || {};
    delete c.overrides; delete c.images; delete c.theme; delete c.media;
    delete c.heroImg; delete c.heroTitle; delete c.heroLede;
    S.write("content", c);
    logEdit({ type: "reset" });
    edSearchQ = "";
    const search = document.getElementById("edSearch");
    if (search) search.value = "";
    renderSite();
    publishToast("staff.site.resetEditsDone");
  }

  /* ====================  STAFF MANAGEMENT (admin)  ==================== */
  // Username convention: first letter of first name + last name, lowercased.
  // Matches the email alias format (initiallastname@jpark.hotel) used everywhere.
  // How many staff accounts the property can hold. Mirrors MAX_STAFF_ACCOUNTS
  // in backend/routes/auth.js, which is the real enforcer — this copy only
  // drives the "x of 100 accounts" counter and lets the form say no before
  // making a round trip.
  const MAX_STAFF_ACCOUNTS = 100;

  function renderTeamCapacity() {
    const el = document.getElementById("teamCapacity");
    if (!el) return;
    const used = S.list("staff").length;
    el.textContent = t("staff.team.accountsUsed")
      .replace("{used}", used).replace("{max}", MAX_STAFF_ACCOUNTS);
    el.classList.toggle("at-limit", used >= MAX_STAFF_ACCOUNTS);
  }

  function autoUsername(name) {
    const parts = (name || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    return parts.length > 1 ? parts[0][0] + parts[parts.length - 1] : parts[0];
  }

  // Pending staff edits: { [id]: { active?, deleted? } }. Applied to the
  // server (and the local store) only when the admin clicks "Save changes".
  let pendingTeamChanges = {};

  function hasPendingTeam() {
    return Object.keys(pendingTeamChanges).length > 0;
  }

  function teamRowEffective(u) {
    const p = pendingTeamChanges[u.id] || {};
    return {
      id: u.id, name: u.name, role: u.role, username: u.username,
      active: p.active !== undefined ? p.active : u.active,
      deleted: !!p.deleted,
    };
  }

  function updateTeamActionsBar() {
    const bar = document.getElementById("teamActions");
    const hint = document.getElementById("teamPendingHint");
    const saveBtn = document.getElementById("teamSaveBtn");
    const undoBtn = document.getElementById("teamUndoBtn");
    if (!bar) return;
    const count = Object.keys(pendingTeamChanges).length;
    bar.hidden = count === 0;
    if (saveBtn) saveBtn.disabled = count === 0;
    if (undoBtn) undoBtn.disabled = count === 0;
    if (hint) hint.textContent = count ? (t("staff.team.pendingHint") + " (" + count + ")") : "";
  }

  function renderTeam() {
    if (!isAdmin()) return;
    const wrap = document.getElementById("teamList");
    wrap.innerHTML = "";
    const live = S.list("staff");
    const liveIds = new Set(live.map((u) => u.id));
    Object.keys(pendingTeamChanges).forEach((id) => {
      if (!liveIds.has(id)) delete pendingTeamChanges[id];
    });
    live.forEach((u) => {
      const eff = teamRowEffective(u);
      const row = document.createElement("div");
      row.className = "team-row" + (eff.deleted ? " pending-remove" : "") +
        (pendingTeamChanges[u.id] ? " pending" : "");
      const isMe = u.id === session.id;
      row.innerHTML =
        '<span class="tr-name">' + esc(eff.name) +
          (eff.deleted ? ' <em class="tr-tag">(' + esc(t("staff.team.pendingRemove")) + ")</em>" : "") +
        "</span>" +
        '<span class="tr-role ' + (eff.role === "admin" ? "admin" : "staff") + '">' + esc(t(eff.role === "admin" ? "staff.role.admin" : "staff.role.staff")) + "</span>" +
        '<span class="tr-status ' + (eff.active ? "active" : "suspended") + '">' + esc(t(eff.active ? "staff.team.active" : "staff.team.suspended")) + "</span>" +
        '<span class="tr-spacer"></span>';
      if (isMe) {
        row.innerHTML += '<span class="you-tag">(' + esc(t("staff.team.you")) + ")</span>";
      } else if (eff.deleted) {
        row.innerHTML +=
          '<button class="btn-activate" data-act="restore">' + esc(t("staff.team.restore")) + "</button>";
      } else {
        const toggleLabel = eff.active ? t("staff.team.suspend") : t("staff.team.activate");
        row.innerHTML +=
          '<button class="' + (eff.active ? "" : "btn-activate") + '" data-act="toggle">' + esc(toggleLabel) + "</button>" +
          '<button data-act="remove">' + esc(t("staff.team.remove")) + "</button>";
      }
      const tg = row.querySelector('[data-act="toggle"]');
      const rm = row.querySelector('[data-act="remove"]');
      const rs = row.querySelector('[data-act="restore"]');
      if (tg) tg.addEventListener("click", () => {
        const cur = teamRowEffective(u);
        const next = !cur.active;
        const p = Object.assign({}, pendingTeamChanges[u.id] || {});
        if (next === u.active) delete p.active; else p.active = next;
        if (Object.keys(p).length === 0) delete pendingTeamChanges[u.id];
        else pendingTeamChanges[u.id] = p;
        renderTeam();
      });
      if (rm) rm.addEventListener("click", () => {
        pendingTeamChanges[u.id] = Object.assign({}, pendingTeamChanges[u.id] || {}, { deleted: true });
        renderTeam();
      });
      if (rs) rs.addEventListener("click", () => {
        const p = Object.assign({}, pendingTeamChanges[u.id] || {});
        delete p.deleted;
        if (Object.keys(p).length === 0) delete pendingTeamChanges[u.id];
        else pendingTeamChanges[u.id] = p;
        renderTeam();
      });
      wrap.appendChild(row);
    });
    renderTeamCapacity();
    updateTeamActionsBar();
  }

  async function saveTeamChanges() {
    if (!hasPendingTeam()) return;
    const API = window.JPark && window.JPark.api;
    const ids = Object.keys(pendingTeamChanges);
    const namesById = {};
    S.list("staff").forEach((u) => { namesById[u.id] = u.name; });
    // Collect the real per-id failure reason instead of just counting
    // failures — the old generic "some changes could not be saved" toast
    // masked the actual HTTP status/error, making any future failure
    // impossible to diagnose from the UI alone.
    const failures = [];
    for (const id of ids) {
      const p = pendingTeamChanges[id];
      if (p.deleted) {
        if (API) {
          const res = await API.del("/api/auth/staff/" + encodeURIComponent(id));
          if (res && res.error && !res.offline) {
            failures.push((namesById[id] || id) + ": " + res.error);
            continue;
          }
        }
        S.remove("staff", id);
        // Also strip from cached Team Status (employees board) so the user
        // disappears immediately on this tab even before the next API fetch.
        try {
          const edits = JSON.parse(localStorage.getItem("jpark.employeeEdits") || "{}") || {};
          if (edits[id]) { delete edits[id]; localStorage.setItem("jpark.employeeEdits", JSON.stringify(edits)); }
        } catch (_) {}
        try { localStorage.removeItem("jpark.db.avatar_" + id); } catch (_) {}
      } else if (p.active !== undefined) {
        if (API) {
          const res = await API.patch("/api/auth/staff/" + encodeURIComponent(id), { active: !!p.active });
          if (res && res.error && !res.offline) {
            failures.push((namesById[id] || id) + ": " + res.error);
            continue;
          }
        }
        S.update("staff", id, { active: !!p.active });
      }
    }
    pendingTeamChanges = {};
    await _syncStaffList();
    // Re-fetch Team Status board if it's mounted, so removed users disappear
    // from the shift board immediately (server rows are gone; cache is purged).
    const board = document.getElementById("empBoardMount");
    if (board && board._empBoard) board._empBoard.load();
    renderTeam();
    if (failures.length) U.toast(t("staff.team.saveErr") + " (" + failures.join("; ") + ")", "error");
    else U.toast(t("staff.team.saved"), "success");
  }

  function undoTeamChanges() {
    if (!hasPendingTeam()) return;
    pendingTeamChanges = {};
    renderTeam();
    U.toast(t("staff.team.undone"), "success");
  }

  function refreshUsernamePreview() {
    const nameInput = document.getElementById("tmName");
    const preview = document.getElementById("tmUserPreview");
    if (!nameInput || !preview) return;
    preview.value = autoUsername(nameInput.value) || "";
  }

  async function addStaff(e) {
    e.preventDefault();
    const err = document.getElementById("teamError");
    err.textContent = "";
    const name = document.getElementById("tmName").value.trim();
    const role = document.getElementById("tmRole").value;
    if (!name) { err.textContent = t("staff.team.needName"); return; }
    const user = autoUsername(name);
    if (!user) { err.textContent = t("staff.team.needName"); return; }
    if (S.list("staff").length >= MAX_STAFF_ACCOUNTS) {
      err.textContent = t("staff.team.accountLimit").replace("{max}", MAX_STAFF_ACCOUNTS);
      return;
    }

    const API = window.JPark && window.JPark.api;
    if (API) {
      const res = await API.post("/api/auth/register", {
        username: user, password: DEFAULT_STAFF_PASSWORD, name: name, role: role,
      });
      if (res.error && !res.offline) {
        // Both of these come back as 409 — `code` is what tells them apart.
        if (res.code === "account_limit") {
          err.textContent = t("staff.team.accountLimit").replace("{max}", MAX_STAFF_ACCOUNTS);
        } else {
          err.textContent = res.status === 409 ? t("staff.team.userTaken") : res.error;
        }
        return;
      }
      if (!res.offline) {
        document.getElementById("teamForm").reset();
        refreshUsernamePreview();
        U.toast(t("staff.team.added"), "success");
        await _syncStaffList();
        renderTeam();
        return;
      }
    }
    // Offline fallback — localStorage only
    if (S.list("staff").some((x) => (x.username || "").toLowerCase() === user.toLowerCase())) {
      err.textContent = t("staff.team.userTaken"); return;
    }
    S.insert("staff", { name: name, username: user, password: DEFAULT_STAFF_PASSWORD, role: role, active: true, mustChange: true });
    document.getElementById("teamForm").reset();
    refreshUsernamePreview();
    U.toast(t("staff.team.added"), "success");
  }

  async function _syncStaffList() {
    const API = window.JPark && window.JPark.api;
    if (!API) return;
    const data = await API.get("/api/auth/staff");
    if (!Array.isArray(data)) return;
    const staff = data.map(function (e) {
      return {
        id: e.id, name: e.name, username: e.username || e.id,
        role: e.role === "admin" ? "admin" : "staff",
        active: e.active !== false, email: e.email,
        avatar_updated_at: e.avatar_updated_at || null,
      };
    });
    S.write("staff", staff);
    _syncAvatars(staff);
  }

  /* ====================  BADGES + NOTIFICATIONS  ==================== */

  /* Blinking "!" beside Guest Requests in the sidebar, and on each unread
     card. Driven by a class rather than a JS interval so it costs nothing
     when idle, and it honours prefers-reduced-motion (see app.css) for
     anyone who can't work with a flashing screen. */
  function updateRequestAlert() {
    const unread = unreadRequests().length;
    const nav = document.querySelector('.nav-item[data-panel="requests"]');
    if (nav) {
      nav.classList.toggle("has-alert", unread > 0);
      let bang = nav.querySelector(".ni-alert");
      if (unread > 0 && !bang) {
        bang = document.createElement("span");
        bang.className = "ni-alert";
        bang.textContent = "!";
        bang.setAttribute("aria-hidden", "true");
        nav.appendChild(bang);
      } else if (!unread && bang) {
        bang.remove();
      }
    }
    // Screen-reader + tab-title signal, so the alert isn't colour/motion only.
    const live = document.getElementById("reqAlertLive");
    if (live) {
      const msg = unread ? t("staff.requests.unread").replace("{n}", unread) : "";
      if (live.textContent !== msg) live.textContent = msg;
    }
    scheduleRequestRechime(unread);
  }

  /* While anything is still unread, ping again every couple of minutes — a
     single chime at 3am gets missed. Silenced as soon as the panel is read,
     and never fires while the front desk is actually looking at the list. */
  function scheduleRequestRechime(unread) {
    if (!unread) {
      if (reqBlinkTimer) { clearInterval(reqBlinkTimer); reqBlinkTimer = null; }
      return;
    }
    if (reqBlinkTimer) return;
    reqBlinkTimer = setInterval(function () {
      if (!unreadRequests().length) {
        clearInterval(reqBlinkTimer); reqBlinkTimer = null; return;
      }
      const looking = panel === "requests" && document.visibilityState === "visible";
      if (looking) return;
      if (Date.now() - lastReqChimeAt < REQ_RECHIME_MS - 500) return;
      lastReqChimeAt = Date.now();
      playChime();
    }, REQ_RECHIME_MS);
  }

  /* "Read" = a human had the Guest Requests panel open, in a visible tab, for
     a few seconds. Acting on a card (Start / Done) counts immediately. */
  function markRequestsRead(immediate) {
    if (reqReadTimer) { clearTimeout(reqReadTimer); reqReadTimer = null; }
    const commit = function () {
      reqReadTimer = null;
      if (panel !== "requests" || document.visibilityState !== "visible") return;
      let changed = false;
      S.list("requests").forEach(function (r) {
        if (!reqAcked.has(String(r.id))) { reqAcked.add(String(r.id)); changed = true; }
      });
      if (changed) {
        saveReqAcked();
        updateRequestAlert();
        updateBadges();
        if (panel === "requests") renderRequests();
      }
    };
    if (immediate) commit();
    else reqReadTimer = setTimeout(commit, REQ_READ_DWELL_MS);
  }

  function updateBadges() {
    // The count is "jobs still open" — it must NOT drop just because someone
    // glanced at the panel. Whether anyone has SEEN them is a separate signal,
    // carried by the blinking "!" (updateRequestAlert).
    const pending = S.list("requests").filter((r) => isLiveRequest(r) && r.status === "pending").length;
    // Live-chat badge is per-user: count only threads assigned to me that
    // still have unread guest messages. That's why a 1/2 only ever shows on
    // the account the guest is currently connected to.
    const chatUnread = myAssignedChats().filter((c) => c.unreadForStaff > 0).length;
    const msgUnread = session ? getMsgUnreadCount().total : 0;
    setCount("countRequests", pending);
    setCount("countChat", chatUnread);
    setCount("countMessages", msgUnread);
    const total = pending + chatUnread + msgUnread;
    /* Keep the browser tab flagged as unread until every request/chat/booking
       is read — the count and the word stay in the title so the front desk
       can tell at a glance from any tab that something is waiting.

       EXCEPT while a receipt is open. The title is also what the browser
       offers as the filename when a receipt is saved as a PDF, and this
       function runs on the ten-second poll — so without this guard a saved
       receipt is called "🔔 3 unread · Staff Console" or, worse, gets a
       different name depending on how long the window was left open. The
       receipt restores the count itself when it closes. */
    if (document.body.classList.contains("bk-printing")) return;
    document.title = (total ? "🔔 " + total + " " + t("staff.notif.unread") + " · " : "") + "Staff Console · J Park Hotel";
  }
  function setCount(id, n) {
    const el = document.getElementById(id);
    if (!el) return;
    if (n > 0) { el.textContent = n; el.classList.add("show"); } else el.classList.remove("show");
  }

  function requestNotifyPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      try { Notification.requestPermission(); } catch (_) {}
    }
  }
  // Reuse a single AudioContext across chimes. Creating a fresh one per ping
  // leaks contexts and browsers cap them (~6 in Chrome), after which the sound
  // silently stops — bad for a console that may chime all shift. We also
  // resume() a context the autoplay policy left "suspended" so the first ping
  // after the page was backgrounded still sounds.
  let chimeCtx = null;
  function playChime() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!chimeCtx) chimeCtx = new AC();
      const ctx = chimeCtx;
      if (ctx.state === "suspended" && ctx.resume) ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.45);
    } catch (_) {}
  }
  function notify(msg) {
    // Show the in-page toast when the console is visible, fall back to the
    // OS-level Notification only when it isn't — otherwise the assigned
    // staff sees the same ping twice (toast + system popup) for one event.
    const visible = typeof document.hidden === "boolean" ? !document.hidden : true;
    if (visible) {
      U.toast(msg);
    } else if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification("J Park Hotel", { body: msg }); } catch (_) {}
    }
  }

  /* ====================  REAL-TIME WIRING  ==================== */
  function onRequestsChange() {
    let newPending = false;
    if (seenReq) {
      S.list("requests").forEach((r) => {
        if (!seenReq.has(r.id)) {
          seenReq.add(r.id);
          // A test filing is recorded but never announced (isLiveRequest).
          if (r.status === "pending" && isLiveRequest(r)) {
            newPending = true;
            notify(t("staff.notif.request") + " · " + t("staff.requests.room") + " " + r.room + ": " + reqTitle(r));
          }
        }
      });
    }
    // Guest requests used to arrive in silence while bookings and chats both
    // chimed — the one queue that means someone has to walk to a room was the
    // easiest to miss. Chime once per batch, like onBookingsChange().
    if (newPending) { lastReqChimeAt = Date.now(); playChime(); }
    if (panel === "requests") { renderRequests(); markRequestsRead(); }
    renderGuestPanel(); // keep an open guest panel in step with the poll
    updateRequestAlert();
    updateBadges();
  }
  function onChatsChange() {
    // Fire sound/notification only when a thread has a genuinely new lastMsg
    // that we haven't seen yet, and only for threads the staff isn't currently
    // viewing. This prevents re-notifying every time the poll restores the
    // server's unread count for the active thread.
    let shouldNotify = false;
    myAssignedChats().forEach(function (c) {
      if (panel === "chat" && c.id === selectedThread) {
        lastSeenChatMsg[c.id] = c.lastMsg;  // actively viewing this thread — no ping
      } else if ((c.unreadForStaff || 0) > 0 && c.lastMsg !== lastSeenChatMsg[c.id]) {
        shouldNotify = true;
        lastSeenChatMsg[c.id] = c.lastMsg;
      }
    });
    if (shouldNotify) { notify(t("staff.notif.chat")); playChime(); }
    lastChatUnread = totalChatUnread();
    if (panel === "chat") renderChat();
    renderGuestPanel(); // a guest signing in mid-chat updates the open panel
    updateBadges();
  }
  function onBookingsChange() {
    // Chime once per change even if several rows land together (a multi-room
    // group booking inserts N rows sharing one group_ref), so the front desk
    // hears one clear ping instead of an overlapping burst.
    let newBooking = false;
    if (seenBookings) {
      visibleBookings(S.list("guestBookings")).forEach((b) => {
        if (!seenBookings.has(b.id)) {
          seenBookings.add(b.id);
          newBooking = true;
          notify(t("staff.notif.booking") + " · " + (b.channelName || "") + " · " + (b.guestName || ""));
        }
      });
    }
    if (newBooking) playChime();
    // renderMessages() itself skips rebuilding the open booking detail pane
    // while a "Resend confirmation" edit is in progress (bkResendEditingId)
    // — badges/counts below are harmless to keep live either way.
    if (panel === "messages") renderMessages();
    updateBadges();
  }
  function onStaffChange() {
    // if our own account was suspended/removed elsewhere, log out
    if (!validSession(session)) { setSession(null); if (J.authToken) J.authToken.clear(); showLogin(); return; }
    if (panel === "team") renderTeam();
  }

  /* ====================  LANGUAGE  ==================== */
  function populateLangSelects() {
    [document.getElementById("staffLang"), document.getElementById("staffLangLogin")].forEach((sel) => {
      if (!sel) return;
      sel.innerHTML = "";
      I.SUPPORTED.forEach((l) => {
        const o = document.createElement("option");
        o.value = l; o.textContent = I.LANG_NAMES[l];
        sel.appendChild(o);
      });
      sel.value = I.getLang();
      sel.addEventListener("change", () => I.applyLang(sel.value));
    });
  }

  /* ====================  PROFILE MODAL  ==================== */
  function openProfileModal() {
    const modal = document.getElementById("profileModal");
    if (!modal || !session) return;
    const pmPhoto = document.getElementById("pmPhoto");
    const dataUrl = getAvatarDataUrl(session.id);
    if (dataUrl) {
      pmPhoto.innerHTML = '<img src="' + esc(dataUrl) + '" alt="Profile photo" />';
    } else {
      pmPhoto.textContent = (session.name || "?").charAt(0).toUpperCase();
    }
    const pmDisplayName = document.getElementById("pmDisplayName");
    if (pmDisplayName) pmDisplayName.textContent = session.name || "";
    const pmDisplayEmail = document.getElementById("pmDisplayEmail");
    if (pmDisplayEmail) {
      const tok = J.authToken && J.authToken.decode();
      pmDisplayEmail.textContent = (tok && tok.email) || "";
    }
    ["pmOldPass", "pmNewPass", "pmConfirmPass"].forEach((id) => {
      const el = document.getElementById(id); if (el) el.value = "";
    });
    document.getElementById("pmPassError").textContent = "";
    modal.hidden = false;
  }

  function closeProfileModal() {
    const modal = document.getElementById("profileModal");
    if (modal) modal.hidden = true;
  }

  async function submitProfilePassword() {
    const err = document.getElementById("pmPassError"); err.textContent = "";
    const oldPass = document.getElementById("pmOldPass").value;
    const p1     = document.getElementById("pmNewPass").value;
    const p2     = document.getElementById("pmConfirmPass").value;
    if (!oldPass) { err.textContent = t("profile.enterOld"); return; }
    if (p1.length < 6) { err.textContent = t("staff.login.passTooShort"); return; }
    if (p1 !== p2)     { err.textContent = t("staff.login.passMismatch"); return; }
    const API = window.JPark && window.JPark.api;
    if (API) {
      const res = await API.post("/api/auth/change-password", { currentPassword: oldPass, newPassword: p1 });
      if (res.error && !res.offline) { err.textContent = res.error; return; }
      if (!res.offline) { U.toast(t("profile.passUpdated"), "success"); closeProfileModal(); return; }
    }
    const u = S.find("staff", session.id);
    if (!u) { err.textContent = t("staff.login.error"); return; }
    if (u.password && u.password !== oldPass) { err.textContent = t("profile.oldIncorrect"); return; }
    S.update("staff", session.id, { password: p1 });
    U.toast(t("profile.passUpdated"), "success");
    closeProfileModal();
  }

  function profileForgotPass() {
    if (!session) return;
    S.insert("resetRequests", {
      kind: "password", username: session.username || session.name,
      note: "Requested from profile page.", handled: false
    });
    U.toast(t("staff.login.requestSent"), "success");
    closeProfileModal();
  }

  /* ====================  INIT  ==================== */
  document.addEventListener("DOMContentLoaded", () => {
    populateLangSelects();

    // login form — async so we can call the server-side auth API
    document.getElementById("loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = document.getElementById("loginError");
      const btn = document.getElementById("loginForm").querySelector('[type="submit"]');
      if (btn) btn.disabled = true;
      const res = await login(
        document.getElementById("loginUser").value,
        document.getElementById("loginPass").value
      );
      if (btn) btn.disabled = false;
      if (res.error) { err.textContent = res.error; return; }
      err.textContent = "";
      if (res.mustChange) {
        // Hand the temporary password straight to the setup step — the
        // backend requires it to authorise replacing itself.
        startPasswordSetup(res.staffId, document.getElementById("loginPass").value);
        return;
      }
      completeLogin(res.user);
    });

    // login self-service: switch between sign in / new staff / forgot views
    document.querySelectorAll("[data-auth-go]").forEach((b) =>
      b.addEventListener("click", () => showAuthView(b.dataset.authGo)));

    // New Staff Account — step 1: verify username + temporary password
    const nsContinue = document.getElementById("nsContinue");
    if (nsContinue) nsContinue.addEventListener("click", () => {
      const err = document.getElementById("nsError"); err.textContent = "";
      const user = document.getElementById("nsUser").value.trim();
      const pass = document.getElementById("nsPass").value;
      const u = S.list("staff").find((x) => x.username.toLowerCase() === user.toLowerCase());
      if (!u) { err.textContent = t("staff.login.noAccount"); return; }
      if (!u.active) { err.textContent = t("staff.login.disabled"); return; }
      if (!u.mustChange) { err.textContent = t("staff.login.alreadySetup"); return; }
      if (pass !== DEFAULT_STAFF_PASSWORD) { err.textContent = t("staff.login.badTempPass"); return; }
      nsUserId = u.id;
      nsCurrentPass = pass;
      nsShowStep(2);
    });

    // New Staff Account — step 2: set the new password and sign in
    document.getElementById("newStaffForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!nsUserId) return; // step 1 not completed yet
      const err = document.getElementById("nsError2"); err.textContent = "";
      const p1 = document.getElementById("nsNew1").value;
      const p2 = document.getElementById("nsNew2").value;
      if (p1.length < 6) { err.textContent = t("staff.login.passTooShort"); return; }
      if (p1 !== p2) { err.textContent = t("staff.login.passMismatch"); return; }
      const u = S.find("staff", nsUserId);
      if (!u && !nsUserId) { err.textContent = t("staff.login.error"); showAuthView("signin"); return; }
      // Persist to backend — JWT already stored from the login step above.
      const API = window.JPark && window.JPark.api;
      if (API) {
        const res = await API.post("/api/auth/change-password", {
          currentPassword: nsCurrentPass,
          newPassword: p1,
        });
        if (res.error && !res.offline) { err.textContent = res.error; return; }
      }
      nsCurrentPass = "";
      if (u) S.update("staff", nsUserId, { password: p1, mustChange: false });
      const userObj = u
        ? { id: u.id, name: u.name, role: u.role, username: u.username }
        : { id: nsUserId, name: "", role: "frontdesk", username: "" };
      nsUserId = null;
      completeLogin(userObj);
    });

    // Forgot Password — file a request to the admin Password Reset Requests inbox
    document.getElementById("forgotPassForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const err = document.getElementById("fpError"); err.textContent = "";
      const user = document.getElementById("fpUser").value.trim();
      if (!user) { err.textContent = t("staff.login.enterUser"); return; }
      S.insert("resetRequests", {
        kind: "password", username: user,
        note: document.getElementById("fpNote").value.trim(), handled: false
      });
      document.getElementById("forgotPassForm").reset();
      U.toast(t("staff.login.requestSent"), "success");
      showAuthView("signin");
    });

    // Forgot Username — file a request to the admin Password Reset Requests inbox
    document.getElementById("forgotUserForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const err = document.getElementById("fuError"); err.textContent = "";
      const name = document.getElementById("fuName").value.trim();
      if (!name) { err.textContent = t("staff.login.enterName"); return; }
      S.insert("resetRequests", {
        kind: "username", name: name,
        contact: document.getElementById("fuContact").value.trim(), handled: false
      });
      document.getElementById("forgotUserForm").reset();
      U.toast(t("staff.login.requestSent"), "success");
      showAuthView("signin");
    });

    // nav
    document.querySelectorAll(".nav-item").forEach((b) =>
      b.addEventListener("click", () => selectPanel(b.dataset.panel)));

    document.getElementById("dsSignout").addEventListener("click", forceLogout);
    // CustomEvent indirection (rather than api.js calling forceLogout()
    // directly) keeps api.js — a generic client also used by
    // employee-card.js — decoupled from staff.js's internals.
    window.addEventListener("jpark:force-logout", forceLogout);

    // avatar / profile
    const avatarWrap = document.getElementById("dsAvatarWrap");
    const avatarInput = document.getElementById("avatarInput");
    if (avatarWrap) {
      avatarWrap.title = "";
      avatarWrap.addEventListener("click", openProfileModal);
    }
    if (avatarInput) {
      avatarInput.addEventListener("change", () => {
        const file = avatarInput.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          U.toast("Image too large — please use a file under 5 MB.", "error");
          avatarInput.value = "";
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          avatarInput.value = "";
          if (!session) { U.toast("Not signed in — photo not saved.", "error"); return; }
          // Downscale to ~256px square JPEG (~20–30KB) before storing, so the
          // server row stays small and teammates can pull it cheaply.
          const img = new Image();
          img.onload = async () => {
            const MAX = 256;
            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const c = document.createElement("canvas");
            c.width = w; c.height = h;
            const ctx = c.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = c.toDataURL("image/jpeg", 0.82);
            let res;
            try {
              res = await setAvatarDataUrl(session.id, dataUrl);
            } catch (_) {
              U.toast("Could not save photo — storage full.", "error");
              return;
            }
            renderAvatarInSidebar();
            const pmPhoto = document.getElementById("pmPhoto");
            const modal = document.getElementById("profileModal");
            if (pmPhoto && modal && !modal.hidden) {
              pmPhoto.innerHTML = '<img src="' + esc(dataUrl) + '" alt="Profile photo" />';
            }
            if (res && res.error && !res.offline) {
              U.toast("Photo saved locally but server upload failed: " + res.error, "error");
            } else if (res && res.offline) {
              U.toast("Photo saved locally — will sync when back online.", "success");
            } else {
              U.toast("Profile photo updated!", "success");
            }
            if (panel === "messages") renderMessages();
          };
          img.onerror = () => { U.toast("Failed to read image. Please try again.", "error"); };
          img.src = e.target.result;
        };
        reader.onerror = () => {
          avatarInput.value = "";
          U.toast("Failed to read image. Please try again.", "error");
        };
        reader.readAsDataURL(file);
      });
    }

    // profile modal
    document.getElementById("profileModalClose").addEventListener("click", closeProfileModal);
    document.getElementById("profileModal").addEventListener("click", (e) => {
      if (e.target === document.getElementById("profileModal")) closeProfileModal();
    });
    // guest panel (shared by the requests board and live chat)
    document.getElementById("guestPanelClose").addEventListener("click", closeGuestPanel);
    document.getElementById("guestPanelOverlay").addEventListener("click", closeGuestPanel);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && guestPanelCtx) closeGuestPanel();
    });

    document.getElementById("pmChangePhoto").addEventListener("click", () => { if (avatarInput) avatarInput.click(); });
    document.getElementById("pmSavePass").addEventListener("click", submitProfilePassword);
    document.getElementById("pmForgotPass").addEventListener("click", profileForgotPass);

    // messages compose
    document.getElementById("msgComposeBtn").addEventListener("click", openCompose);
    document.getElementById("msgComposeClose").addEventListener("click", closeCompose);
    document.getElementById("msgDiscardBtn").addEventListener("click", closeCompose);
    document.getElementById("msgSendBtn").addEventListener("click", sendMessage);

    // messages sidebar nav
    document.querySelectorAll("#msgSidebar .msg-nav-item").forEach((b) => {
      b.addEventListener("click", () => {
        msgView = b.dataset.view;
        msgDetailId = null;
        msgMultiSelect = false;
        selectedMsgIds.clear();
        renderMessages();
      });
    });

    // compose to: input
    const toInput = document.getElementById("msgToInput");
    if (toInput) {
      toInput.addEventListener("input", () => renderToDropdown(toInput.value));
      toInput.addEventListener("focus", () => renderToDropdown(toInput.value));
      toInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") hideToDropdown();
      });
    }
    document.addEventListener("click", (e) => {
      const dd = document.getElementById("msgToDropdown");
      const row = document.getElementById("msgToRow");
      if (dd && row && !row.contains(e.target)) hideToDropdown();
    });

    // site editor handlers
    document.querySelectorAll("#edTabs .ed-tab").forEach((b) => {
      b.addEventListener("click", () => {
        edTab = b.dataset.edtab;
        renderEditTabs();
        if (edTab === "history") renderHistory();
        if (edTab === "chat") renderChatConfig();
      });
    });
    (function wireChatEditor() {
      const langSel = document.getElementById("edChatLangSel");
      if (langSel) langSel.addEventListener("change", (e) => {
        edLang = e.target.value;
        renderEditLang();       // keep the Text tab's language picker in step
        renderChatConfig();
      });
      const saveBtn = document.getElementById("edChatSave");
      if (saveBtn) saveBtn.addEventListener("click", saveChatConfig);
      const addBtn = document.getElementById("edChatAdd");
      if (addBtn) addBtn.addEventListener("click", addChatAnswer);
    })();
    document.getElementById("guideToggle").addEventListener("click", toggleGuide);
    document.getElementById("edLangSel").addEventListener("change", (e) => {
      edLang = e.target.value;
      renderContentGroups();
    });
    document.getElementById("edSearch").addEventListener("input", (e) => {
      edSearchQ = e.target.value;
      renderContentGroups();
    });
    document.getElementById("edResetTheme").addEventListener("click", resetTheme);
    document.getElementById("edResetEdits").addEventListener("click", resetEdits);
    document.getElementById("annForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const inp = document.getElementById("annInput");
      const text = inp.value.trim();
      if (!text) return;
      S.insert("announcements", { text: text, active: true });
      inp.value = "";
      renderAnnouncements();
      publish();
    });
    document.getElementById("edResetAll").addEventListener("click", () => {
      // This wipes the local working copy of requests, chats, messages and
      // content. On a live property that is real work, so a single OK click is
      // far too cheap a way to lose it — the operator has to type the word.
      // (Server-side records are not touched; this only clears what this
      // browser holds. Said plainly, because "reset demo data" reads harmless.)
      const phrase = t("staff.site.resetConfirmWord");
      const typed = prompt(t("staff.site.resetConfirmPrompt").replace("{word}", phrase));
      if (!typed || typed.trim().toLowerCase() !== phrase.toLowerCase()) {
        if (typed !== null) U.toast(t("staff.site.resetCancelled"), "error");
        return;
      }
      S.resetAll();
      if (!validSession(session)) { setSession(null); showLogin(); return; }
      seenReq = new Set(S.list("requests").map((r) => r.id));
      seenBookings = new Set(S.list("guestBookings").map((b) => b.id));
      renderPanel();
      updateBadges();
      U.toast(t("staff.site.saved"), "success");
    });

    // staff management
    document.getElementById("teamForm").addEventListener("submit", addStaff);
    const tmName = document.getElementById("tmName");
    if (tmName) tmName.addEventListener("input", refreshUsernamePreview);
    const teamSaveBtn = document.getElementById("teamSaveBtn");
    if (teamSaveBtn) teamSaveBtn.addEventListener("click", saveTeamChanges);
    const teamUndoBtn = document.getElementById("teamUndoBtn");
    if (teamUndoBtn) teamUndoBtn.addEventListener("click", undoTeamChanges);

    // real-time subscriptions
    S.on("requests", onRequestsChange);
    S.on("chats", onChatsChange);
    S.on("messages", () => { updateBadges(); if (panel === "messages") renderMessages(); });
    S.on("guestBookings", onBookingsChange);
    S.on("resetRequests", () => { updateBadges(); if (panel === "messages") renderMessages(); });
    S.on("staff", onStaffChange);
    S.on("announcements", () => { if (panel === "site") renderAnnouncements(); });
    // The editor saves overrides in place (keeps focus/scroll), so we don't
    // re-render the whole panel on every content write.

    // An edit made a second before the tab closes still has its publish sitting
    // in the debounce window — send it now rather than lose it. pagehide fires
    // on mobile Safari's bfcache path too, which "unload" does not.
    window.addEventListener("pagehide", () => {
      const CS = J.contentSync;
      if (CS && CS.hasUnpublishedEdits()) CS.pushNow();
    });

    // re-render on language change
    document.addEventListener("jpark:langchange", () => {
      [document.getElementById("staffLang"), document.getElementById("staffLangLogin")].forEach((s) => { if (s) s.value = I.getLang(); });
      if (session) {
        document.getElementById("dsUserRole").textContent = t(isAdmin() ? "staff.role.admin" : "staff.role.staff");
        document.getElementById("dsRoleLabel").textContent = t(isAdmin() ? "staff.role.admin" : "staff.role.staff");
        renderPanel();
        updateBadges();
        renderAvatarInSidebar();
      }
    });

    // open requested panel from hash (e.g. staff.html#site)
    const hash = (location.hash || "").replace("#", "");
    if (["requests", "chat", "messages", "company", "roster", "site", "team"].includes(hash)) {
      panel = hash === "company" ? "messages" : hash;
    }

    // boot
    session = validSession(getSession());
    if (session) {
      // Restore (or re-mint) the bearer token for an already-signed-in session.
      if (J.authToken && !J.authToken.isValid()) Promise.resolve(J.authToken.mint(session)).catch(function () {}).then(showDash);
      else showDash();
    } else showLogin();
  });
})();
