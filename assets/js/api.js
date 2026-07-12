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

  // Real server round-trip that renews the SAME session's access token
  // (see backend/routes/auth.js's POST /refresh). Replaces the old
  // client-side self-signing "recovery," which the hardened server always
  // rejected — that mismatch is what silently froze the whole staff
  // console for days once the old 12h token expired. De-duplicated via a
  // shared in-flight promise so the several 6s pollers that can all hit a
  // 401 on the same tick don't each independently call /refresh.
  let refreshPromise = null;
  function refreshToken() {
    const AT = window.JPark && window.JPark.authToken;
    if (!AT || !AT.get()) return Promise.resolve(false); // nothing to refresh
    if (refreshPromise) return refreshPromise;
    const base = cfg().apiBase;
    refreshPromise = fetch(base + "/api/auth/refresh", {
      method: "POST",
      headers: authHeaders(),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        if (data && data.token) AT.setToken(data.token);
        return true;
      })
      .catch(() => {
        // Refresh was denied (revoked/banned/absolute-expiry) or the
        // network failed outright — either way, stop retrying silently
        // and send the user back to a real login screen.
        window.dispatchEvent(new CustomEvent("jpark:force-logout"));
        return false;
      })
      .finally(() => { refreshPromise = null; });
    return refreshPromise;
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
        // On 401, try a real refresh and retry once. Handles the common
        // "access token expired mid-shift" case transparently, with no
        // visible interruption, as long as the session itself is still
        // valid server-side.
        if (res.status === 401) {
          const refreshed = await refreshToken();
          if (refreshed) {
            const opts2 = { method, headers: authHeaders() };
            if (body !== undefined && body !== null) opts2.body = JSON.stringify(body);
            const res2 = await fetch(base + path, opts2);
            let data2;
            try { data2 = await res2.json(); } catch (_) { data2 = {}; }
            if (!res2.ok) return { error: data2.error || ("HTTP " + res2.status), status: res2.status };
            return data2;
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
