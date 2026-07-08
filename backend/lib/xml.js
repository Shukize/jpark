/* ============================================================
   Minimal XML-escaping helper for backend/routes/hotelAds.js's hand-rolled
   template-literal XML. No general-purpose XML-builder dependency is added
   here — see that route file's header comment for why.
   ============================================================ */
function escapeXml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  }[c]));
}

module.exports = { escapeXml };
