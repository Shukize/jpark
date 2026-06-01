/* ============================================================
   J Park Hotel — front-end runtime config
   The static site (GitHub Pages / Render static) and the API
   (Render web service) live on different origins, so feature code
   reads the API base from here instead of hard-coding URLs.

   Override at any time before this script runs, e.g. in the page:
     <script>window.JPARK_API_BASE = "https://my-api.example.com";</script>
   ============================================================ */
(function () {
  "use strict";
  window.JPark = window.JPark || {};

  function detectApiBase() {
    if (typeof window.JPARK_API_BASE === "string" && window.JPARK_API_BASE) {
      return window.JPARK_API_BASE.replace(/\/+$/, "");
    }
    const host = location.hostname;
    // Local development — the Express API from /backend runs on :3000.
    if (host === "localhost" || host === "127.0.0.1" || host === "" || host === "0.0.0.0") {
      return "http://localhost:3000";
    }
    // Primary custom domain (jparkhotelchonburi.com): once DNS points the apex
    // and www at GitHub Pages, the site loads here and talks to the Render API
    // directly — no branded api subdomain required. Upgrade to
    // api.jparkhotelchonburi.com later if desired (add it as a Render custom
    // domain + a CNAME, then return it here).
    if (host === "jparkhotelchonburi.com" || host === "www.jparkhotelchonburi.com") {
      return "https://jpark.onrender.com";
    }
    // Custom domain — use the branded API subdomain once it's set up in Render
    // (Render service → Custom Domains → api.jparkhotel.com, + a CNAME at the
    // DNS host pointing api → the Render target). Until that exists, override
    // with window.JPARK_API_BASE = "https://jpark.onrender.com" on the page.
    if (host === "jparkhotel.com" || host === "www.jparkhotel.com") {
      return "https://api.jparkhotel.com";
    }
    // Other deployed origins (GitHub Pages, Render static) — the Render web service.
    return "https://jpark.onrender.com";
  }

  window.JPark.config = { apiBase: detectApiBase() };
})();
