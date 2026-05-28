/* ============================================================
   J Park Hotel — Employee Status & Shift Card
   ------------------------------------------------------------
   A self-contained, framework-free dashboard component for the
   staff/admin console. Mount it into any container:

       JPark.employeeCards.mount(document.getElementById("..."));

   Behaviour:
   • Fetches the live roster from GET /api/employees with a
     Bearer token (no hard-coded data — see assets/js/auth-token.js).
   • Renders one card per employee: profile placeholder, name, a
     colour-coded role tag (admin = red, front desk = blue,
     housekeeping = green), email, shift and on/off-shift status.
   • Edit controls render ONLY when the caller's token carries the
     "admin" permission; everyone else sees a read-only board.
   • If the API can't be reached (e.g. the static site is open with
     the backend offline) it falls back to a cached roster so the
     board still works, and says so.
   ============================================================ */
(function () {
  "use strict";
  window.JPark = window.JPark || {};
  const J = window.JPark;
  const U = J.util;
  const esc = U.escapeHtml;
  const t = (k) => (J.i18n ? J.i18n.t(k) : k);

  // Colour-coded role tags. Anything unknown falls back to a neutral tag.
  const ROLE_META = {
    admin:     { labelKey: "emp.role.admin",     cls: "role-admin" },     // red
    frontdesk: { labelKey: "emp.role.frontdesk", cls: "role-frontdesk" }, // blue
    staff:     { labelKey: "emp.role.staff",     cls: "role-staff" }
  };
  const STATUS_META = {
    on_shift:  { labelKey: "emp.status.on_shift",  cls: "st-on" },
    on_break:  { labelKey: "emp.status.on_break",  cls: "st-break" },
    off_shift: { labelKey: "emp.status.off_shift", cls: "st-off" }
  };
  const ROLE_OPTIONS = ["admin", "frontdesk"];
  const STATUS_OPTIONS = ["on_shift", "on_break", "off_shift"];

  // Resilience fallback only — mirrors the backend seed so the board renders
  // when the API is unreachable. The live fetch above is the real source.
  const FALLBACK_ROSTER = [
    { id: "u_admin", name: "Hotel Admin",    email: "hadmin@jpark.hotel",    role: "admin",     status: "on_shift",  shift: "09:00–18:00" },
    { id: "u_staff", name: "Front Desk",     email: "fdesk@jpark.hotel",     role: "frontdesk", status: "on_shift",  shift: "07:00–15:00" },
    { id: "e_ploy",  name: "Ploy Srisai",   email: "psrisai@jpark.hotel",   role: "frontdesk", status: "on_break",  shift: "15:00–23:00" },
    { id: "e_kenji", name: "Kenji Watanabe", email: "kwatanabe@jpark.hotel", role: "frontdesk", status: "off_shift", shift: "23:00–07:00" }
  ];
  // When offline, admin edits are kept here so the demo still feels live.
  const LOCAL_EDITS_KEY = "jpark.employeeEdits";
  // Last successful /api/employees response — used as offline fallback so the
  // board always reflects real staff rather than the hardcoded seed list.
  const EMP_CACHE_KEY = "jpark.db.empCache";

  function roleMeta(role) { return ROLE_META[role] || { labelKey: "emp.role.staff", cls: "role-staff" }; }
  function statusMeta(s) { return STATUS_META[s] || STATUS_META.off_shift; }
  function initialOf(name) { return (name || "?").trim().charAt(0).toUpperCase() || "?"; }

  function readLocalEdits() {
    try { return JSON.parse(localStorage.getItem(LOCAL_EDITS_KEY) || "{}") || {}; }
    catch (_) { return {}; }
  }
  function writeLocalEdit(id, patch) {
    const all = readLocalEdits();
    all[id] = Object.assign({}, all[id], patch);
    try { localStorage.setItem(LOCAL_EDITS_KEY, JSON.stringify(all)); } catch (_) {}
  }
  function applyLocalEdits(list) {
    const edits = readLocalEdits();
    return list.map((e) => (edits[e.id] ? Object.assign({}, e, edits[e.id]) : e));
  }

  // Profile placeholder: reuse the staff member's uploaded avatar if one exists
  // (keeps the look consistent with the rest of the console), else an initial.
  function avatarHtml(emp) {
    const dataUrl = J.store ? J.store.read("avatar_" + emp.id, null) : null;
    if (dataUrl) return '<img src="' + esc(dataUrl) + '" alt="' + esc(emp.name) + '" />';
    return '<span>' + esc(initialOf(emp.name)) + "</span>";
  }

  /* ====================  COMPONENT  ==================== */
  function EmployeeBoard(container) {
    this.el = container;
    this.data = [];
    this.editingId = null;
    this.live = false;      // did the last load come from the API?
    this.loaded = false;
    this.canEdit = false;   // does the token grant the admin permission?
  }

  EmployeeBoard.prototype.mount = function () {
    // Conditional rendering gate: a valid session token is required to see the
    // board at all; edit affordances are gated separately on the admin perm.
    const token = J.authToken ? J.authToken.get() : null;
    if (!token) {
      this.el.innerHTML = '<div class="emp-board"><p class="emp-note">' + esc(t("emp.signin")) + "</p></div>";
      return;
    }
    this.canEdit = J.authToken.isAdmin();
    this.renderShell();
    this.load();
  };

  EmployeeBoard.prototype.renderShell = function () {
    this.el.innerHTML =
      '<div class="emp-board">' +
        '<div class="emp-board-head">' +
          '<div>' +
            '<h3 class="emp-board-title">' + esc(t("emp.title")) + "</h3>" +
            '<p class="emp-board-lede">' + esc(t("emp.lede")) + "</p>" +
          "</div>" +
          '<button type="button" class="emp-refresh" title="' + esc(t("emp.refresh")) + '">↻</button>' +
        "</div>" +
        (this.canEdit ? "" : '<p class="emp-note emp-readonly">' + esc(t("emp.adminOnly")) + "</p>") +
        '<div class="emp-status-line" id="empStatusLine"></div>' +
        '<div class="emp-grid" id="empGrid"></div>' +
      "</div>";
    const refresh = this.el.querySelector(".emp-refresh");
    if (refresh) refresh.addEventListener("click", () => this.load());
  };

  EmployeeBoard.prototype.setStatusLine = function (html, kind) {
    const line = this.el.querySelector("#empStatusLine");
    if (!line) return;
    line.className = "emp-status-line" + (kind ? " " + kind : "");
    line.innerHTML = html;
  };

  EmployeeBoard.prototype.load = function () {
    const grid = this.el.querySelector("#empGrid");
    if (grid && !this.loaded) grid.innerHTML = '<p class="emp-note">' + esc(t("emp.loading")) + "</p>";
    this.setStatusLine("");

    const base = (J.config && J.config.apiBase) || "";
    const headers = J.authToken ? J.authToken.authHeaders() : {};

    return fetch(base + "/api/employees", { headers: headers })
      .then((res) => {
        if (res.status === 401 || res.status === 403) throw new Error("unauthorized");
        if (!res.ok) throw new Error("http " + res.status);
        return res.json();
      })
      .then((rows) => {
        this.live = true;
        this.loaded = true;
        this.data = Array.isArray(rows) ? rows : [];
        // Keep the cache fresh so offline mode reflects actual staff.
        try { localStorage.setItem(EMP_CACHE_KEY, JSON.stringify(this.data)); } catch (_) {}
        this.render();
      })
      .catch(() => {
        // Offline / no backend: use the last-known live roster (with any local
        // edits applied), falling back to the hardcoded seed only on first run.
        this.live = false;
        this.loaded = true;
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(EMP_CACHE_KEY) || "null"); } catch (_) {}
        this.data = applyLocalEdits(Array.isArray(cached) && cached.length ? cached : FALLBACK_ROSTER);
        this.render();
        this.setStatusLine(esc(t("emp.offline")), "warn");
      });
  };

  EmployeeBoard.prototype.render = function () {
    const grid = this.el.querySelector("#empGrid");
    if (!grid) return;
    if (!this.data.length) {
      grid.innerHTML = '<p class="emp-note">' + esc(t("emp.empty")) + "</p>";
      return;
    }
    grid.innerHTML = "";
    this.data.forEach((emp) => {
      grid.appendChild(this.editingId === emp.id ? this.buildEditor(emp) : this.buildCard(emp));
    });
  };

  EmployeeBoard.prototype.buildCard = function (emp) {
    const rm = roleMeta(emp.role);
    const sm = statusMeta(emp.status);
    const card = document.createElement("div");
    card.className = "emp-card";
    card.innerHTML =
      '<div class="emp-card-top">' +
        '<div class="emp-avatar ' + rm.cls + '">' + avatarHtml(emp) + "</div>" +
        '<div class="emp-id">' +
          '<div class="emp-name">' + esc(emp.name) + "</div>" +
          '<span class="emp-role-tag ' + rm.cls + '">' + esc(t(rm.labelKey)) + "</span>" +
        "</div>" +
        '<span class="emp-status ' + sm.cls + '"><i class="emp-dot"></i>' + esc(t(sm.labelKey)) + "</span>" +
      "</div>" +
      '<a class="emp-email" href="mailto:' + esc(emp.email) + '">' + esc(emp.email) + "</a>" +
      '<div class="emp-shift"><span class="emp-shift-label">' + esc(t("emp.shift")) + "</span>" +
        '<span class="emp-shift-val">' + esc(emp.shift || "—") + "</span></div>" +
      (this.canEdit ? '<div class="emp-card-actions"><button type="button" class="emp-edit-btn">' + esc(t("emp.edit")) + "</button></div>" : "");

    if (this.canEdit) {
      const btn = card.querySelector(".emp-edit-btn");
      btn.addEventListener("click", () => { this.editingId = emp.id; this.render(); });
    }
    return card;
  };

  EmployeeBoard.prototype.buildEditor = function (emp) {
    // Defensive: editor is only ever reached for admins, but never trust the UI alone.
    if (!this.canEdit) return this.buildCard(emp);
    const rm = roleMeta(emp.role);
    const card = document.createElement("div");
    card.className = "emp-card editing";

    const roleOpts = ROLE_OPTIONS.map((r) =>
      '<option value="' + r + '"' + (r === emp.role ? " selected" : "") + ">" + esc(t(roleMeta(r).labelKey)) + "</option>"
    ).join("");
    const statusOpts = STATUS_OPTIONS.map((s) =>
      '<option value="' + s + '"' + (s === emp.status ? " selected" : "") + ">" + esc(t(statusMeta(s).labelKey)) + "</option>"
    ).join("");

    card.innerHTML =
      '<div class="emp-card-top">' +
        '<div class="emp-avatar ' + rm.cls + '">' + avatarHtml(emp) + "</div>" +
        '<div class="emp-id"><div class="emp-name">' + esc(emp.name) + "</div></div>" +
      "</div>" +
      '<label class="emp-field"><span>' + esc(t("emp.roleLabel")) + '</span><select class="emp-in-role">' + roleOpts + "</select></label>" +
      '<label class="emp-field"><span>' + esc(t("emp.statusLabel")) + '</span><select class="emp-in-status">' + statusOpts + "</select></label>" +
      '<label class="emp-field"><span>' + esc(t("emp.shift")) + '</span><input type="text" class="emp-in-shift" value="' + esc(emp.shift || "") + '" placeholder="08:00–16:00" /></label>' +
      '<div class="emp-card-actions">' +
        '<button type="button" class="btn btn-solid emp-save-btn">' + esc(t("emp.save")) + "</button>" +
        '<button type="button" class="emp-cancel-btn">' + esc(t("emp.cancel")) + "</button>" +
      "</div>";

    card.querySelector(".emp-cancel-btn").addEventListener("click", () => { this.editingId = null; this.render(); });
    card.querySelector(".emp-save-btn").addEventListener("click", () => {
      const patch = {
        role: card.querySelector(".emp-in-role").value,
        status: card.querySelector(".emp-in-status").value,
        shift: card.querySelector(".emp-in-shift").value.trim()
      };
      this.save(emp.id, patch);
    });
    return card;
  };

  EmployeeBoard.prototype.save = function (id, patch) {
    const apply = () => {
      const i = this.data.findIndex((e) => e.id === id);
      if (i >= 0) this.data[i] = Object.assign({}, this.data[i], patch);
      this.editingId = null;
      this.render();
      if (U) U.toast(t("emp.saved"), "success");
    };

    if (!this.live) {
      // Offline: persist the edit locally so it survives a re-render/reload.
      writeLocalEdit(id, patch);
      apply();
      return;
    }

    const base = (J.config && J.config.apiBase) || "";
    const headers = J.authToken.authHeaders({ "Content-Type": "application/json" });
    fetch(base + "/api/employees/" + encodeURIComponent(id), {
      method: "PATCH",
      headers: headers,
      body: JSON.stringify(patch)
    })
      .then((res) => {
        if (!res.ok) throw new Error("http " + res.status);
        return res.json();
      })
      .then((updated) => {
        const i = this.data.findIndex((e) => e.id === id);
        if (i >= 0) this.data[i] = updated;
        this.editingId = null;
        this.render();
        if (U) U.toast(t("emp.saved"), "success");
      })
      .catch(() => { if (U) U.toast(t("emp.saveErr"), "error"); });
  };

  /* ====================  PUBLIC API  ==================== */
  // Mount (or re-mount) the board into a container element.
  function mount(container) {
    if (!container) return null;
    const board = new EmployeeBoard(container);
    container._empBoard = board;
    board.mount();
    return board;
  }

  J.employeeCards = { mount };
})();
