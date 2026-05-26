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
    // Deployed — the Render web service defined in render.yaml.
    return "https://jpark-api.onrender.com";
  }

  window.JPark.config = { apiBase: detectApiBase() };
})();
