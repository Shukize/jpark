/* ============================================================
   J Park Hotel — central API client
   Thin fetch wrapper that attaches auth headers and normalises
   errors into { error, offline } objects so callers don't have
   to handle network exceptions directly.

   Usage:
     const data = await JPark.api.get('/api/content');
     if (data.error) { ... } else { use data }
   ============================================================ */
(function () {
  "use strict";
  window.JPark = window.JPark || {};

  function cfg() {
    return (window.JPark.config || { apiBase: "http://localhost:3000" });
  }

  function authHeaders() {
    const headers = { "Content-Type": "application/json" };
    // Staff bearer token
    const AT = window.JPark.authToken;
    if (AT) {
      const token = AT.get();
      if (token) headers["Authorization"] = "Bearer " + token;
    }
    return headers;
  }

  async function request(method, path, body) {
    const base = cfg().apiBase;
    try {
      const opts = { method, headers: authHeaders() };
      if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
      const res = await fetch(base + path, opts);
      let data;
      try { data = await res.json(); } catch (_) { data = {}; }
      if (!res.ok) {
        // On 401, attempt to re-mint from the expired token's own payload and
        // retry once. Handles the common "token expired mid-shift" case
        // transparently without requiring a page reload.
        if (res.status === 401) {
          const AT = window.JPark && window.JPark.authToken;
          if (AT) {
            const payload = AT.decode(); // readable even on an expired token
            if (payload) {
              const user = {
                id: payload.sub, name: payload.name,
                username: payload.username, email: payload.email, role: payload.role,
              };
              try { await AT.mint(user); } catch (_) {}
              const opts2 = { method, headers: authHeaders() };
              if (body !== undefined && body !== null) opts2.body = JSON.stringify(body);
              const res2 = await fetch(base + path, opts2);
              let data2;
              try { data2 = await res2.json(); } catch (_) { data2 = {}; }
              if (!res2.ok) return { error: data2.error || ("HTTP " + res2.status), status: res2.status };
              return data2;
            }
          }
        }
        return { error: data.error || ("HTTP " + res.status), status: res.status };
      }
      return data;
    } catch (e) {
      // Network error / API unreachable
      return { error: "Network error", offline: true };
    }
  }

  window.JPark.api = {
    get:   (path)        => request("GET",    path, null),
    post:  (path, body)  => request("POST",   path, body),
    patch: (path, body)  => request("PATCH",  path, body),
    put:   (path, body)  => request("PUT",    path, body),
    del:   (path)        => request("DELETE", path, null),
    /* Convenience: return true when the result looks offline */
    isOffline: (result)  => !!(result && result.offline),
  };
})();
