/* ============================================================
   J Park Hotel — auth token helper
   ------------------------------------------------------------
   Mints a compact JWT (header.payload.signature) at login and
   stores it for API calls. The payload carries the signed-in
   user's role and a `perms` list; admins receive the "admin"
   permission, which the UI and the API both gate edit features on.

   Feature code reads the token with get() and sends it as
   `Authorization: Bearer <token>`. The backend verifies the HS256
   signature with the same shared secret (see backend/middleware/auth.js).

   ⚠️  DEMO ONLY: a real deployment must issue and sign tokens on the
   server and keep the secret off the client. The browser cannot keep
   a secret, so this proves the flow, not production security.
   ============================================================ */
(function () {
  "use strict";
  window.JPark = window.JPark || {};

  const TOKEN_KEY = "jpark.staff.token";
  const SECRET = window.JPARK_AUTH_SECRET || "jpark-demo-shared-secret";
  const TTL_SECONDS = 12 * 60 * 60; // 12h — a typical shift

  /* ---- base64url helpers (UTF-8 safe) ---- */
  function b64urlFromBytes(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64url(str) {
    return b64urlFromBytes(new TextEncoder().encode(str));
  }
  function b64urlDecode(str) {
    const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
    const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function hmacSha256(signingInput) {
    const subtle = window.crypto && window.crypto.subtle;
    if (!subtle) return null; // insecure context / old browser — fall back to unsigned
    const key = await subtle.importKey(
      "raw", new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
    return b64urlFromBytes(new Uint8Array(sig));
  }

  // Front desk staff use their work alias; matches the messaging convention.
  function emailFor(user) {
    if (user.email) return user.email;
    const parts = (user.name || user.username || "staff").toLowerCase().trim().split(/\s+/);
    const slug = parts.length > 1 ? parts[0][0] + "." + parts[parts.length - 1] : parts[0];
    return slug + "@jpark.hotel";
  }

  /* ---- public API ---- */
  async function mint(user) {
    const subtle = window.crypto && window.crypto.subtle;
    const header = { alg: subtle ? "HS256" : "none", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: user.id,
      name: user.name,
      username: user.username,
      email: emailFor(user),
      role: user.role,
      // The permission the UI and API check for edit access.
      perms: user.role === "admin" ? ["admin", "staff"] : ["staff"],
      iat: now,
      exp: now + TTL_SECONDS,
    };
    const signingInput = b64url(JSON.stringify(header)) + "." + b64url(JSON.stringify(payload));
    const sig = (await hmacSha256(signingInput)) || "";
    const token = signingInput + "." + sig;
    try { localStorage.setItem(TOKEN_KEY, token); } catch (_) {}
    return token;
  }

  function get() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (_) { return null; }
  }
  function clear() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
  }

  // Decode the payload (no verification — the server verifies; this is for the UI).
  function decode(token) {
    const tok = token || get();
    if (!tok) return null;
    const parts = tok.split(".");
    if (parts.length < 2) return null;
    try { return JSON.parse(b64urlDecode(parts[1])); } catch (_) { return null; }
  }

  function hasPermission(perm) {
    const p = decode();
    return !!(p && Array.isArray(p.perms) && p.perms.includes(perm));
  }
  function isAdmin() { return hasPermission("admin"); }

  function authHeaders(extra) {
    const token = get();
    const headers = Object.assign({}, extra || {});
    if (token) headers["Authorization"] = "Bearer " + token;
    return headers;
  }

  window.JPark.authToken = { mint, get, clear, decode, hasPermission, isAdmin, authHeaders };
})();
