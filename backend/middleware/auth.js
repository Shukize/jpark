/* ============================================================
   J Park Hotel — Bearer-token auth middleware
   ------------------------------------------------------------
   Parses an `Authorization: Bearer <token>` header, verifies the
   token, and exposes the caller on `req.user`. Two guards are
   exported: requireAuth (any signed-in employee) and requireAdmin
   (the token must carry the "admin" permission).

   The token is a compact JWT (header.payload.signature) minted
   server-side by POST /api/auth/login and signed with HS256 using
   AUTH_TOKEN_SECRET — which lives ONLY on the server.

   This is a real trust boundary: tokens must be HS256 and carry a
   signature that verifies against AUTH_TOKEN_SECRET. The "alg: none"
   fallback has been removed, and server.js refuses to start in
   production unless a non-default AUTH_TOKEN_SECRET is set, so the
   browser's offline/demo token (signed with a public placeholder)
   can never authenticate against live data.
   ============================================================ */
const crypto = require('crypto');

const SECRET = process.env.AUTH_TOKEN_SECRET || 'jpark-demo-shared-secret';

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8');
}

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Returns the decoded payload if the token is well-formed, unexpired and
// (when signed) correctly signed; otherwise null.
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let header, payload;
  try {
    header = JSON.parse(b64urlDecode(parts[0]));
    payload = JSON.parse(b64urlDecode(parts[1]));
  } catch (_) {
    return null;
  }

  // Require a valid HS256 signature. Unsigned tokens (alg: "none") and any other
  // algorithm are rejected outright — this is a real trust boundary, so a client
  // can never present a token the server did not sign with AUTH_TOKEN_SECRET.
  if (header.alg !== 'HS256') return null;
  const expected = b64url(
    crypto.createHmac('sha256', SECRET).update(parts[0] + '.' + parts[1]).digest()
  );
  if (!timingSafeEqualStr(parts[2], expected)) return null;

  if (payload.exp && Date.now() / 1000 > payload.exp) return null;
  return payload;
}

// Any authenticated employee.
function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or missing bearer token' });

  req.user = {
    id: payload.sub,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    perms: Array.isArray(payload.perms) ? payload.perms : [],
  };
  next();
}

// Authenticated AND the token carries the "admin" permission.
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user.perms.includes('admin')) {
      return res.status(403).json({ error: 'Administrator permission required' });
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin, verifyToken };
