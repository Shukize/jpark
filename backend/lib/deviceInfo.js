/* ============================================================
   J Park Hotel — minimal User-Agent parser (Account Logs display)
   ------------------------------------------------------------
   Only needs to produce a human-readable "Chrome on Windows" style
   label for the staff console's Account Logs table, not exhaustive
   UA-sniffing precision — a small hand-rolled regex parser matches
   this codebase's zero-heavy-dependency style (bcrypt/express/pg
   are the only runtime deps) rather than pulling in a UA-parsing
   library for one cosmetic column.
   ============================================================ */
'use strict';

const BROWSER_PATTERNS = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Chrome\//, 'Chrome'],
  [/Firefox\//, 'Firefox'],
  [/Version\/.*Safari/, 'Safari'],
  [/MSIE|Trident/, 'Internet Explorer'],
];

const OS_PATTERNS = [
  [/Windows NT/, 'Windows'],
  [/Mac OS X/, 'macOS'],
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod|iOS/, 'iOS'],
  [/Linux/, 'Linux'],
];

function parseUserAgent(ua) {
  const str = ua || '';
  const browserMatch = BROWSER_PATTERNS.find(([re]) => re.test(str));
  const osMatch = OS_PATTERNS.find(([re]) => re.test(str));
  const browser = browserMatch ? browserMatch[1] : 'Unknown browser';
  const os = osMatch ? osMatch[1] : 'Unknown OS';
  return { browser, os, summary: browser + ' on ' + os };
}

module.exports = { parseUserAgent };
