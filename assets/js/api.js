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
      if (!res.ok) return { error: data.error || ("HTTP " + res.status), status: res.status };
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
