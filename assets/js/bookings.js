/* ============================================================
   J Park Hotel — external booking intake
   The seam that links OTA bookings (Agoda, Booking.com, Airbnb,
   Trip.com, Expedia …) into the staff "Guest Booking" inbox.

   This site has no backend, so a booking made on an OTA cannot
   reach the browser by itself. A tiny bridge does the linking:
   an email-forwarding rule or channel-manager webhook hands the
   confirmation to this module, which normalises it and stores it
   so it appears — translated — in Admin and Staff Messages.

   Two ways for a bridge to push a booking in:
     1. JS API   — JPark.bookings.ingest({ channel, guestName, ... })
     2. Deep link — open  staff.html#booking=<base64-json>  and the
                    booking is ingested on load (the hash is then
                    cleared so a refresh won't double-insert).
   ============================================================ */
(function () {
  "use strict";
  const J = (window.JPark = window.JPark || {});
  const S = J.store;

  /* Known channels: display name + the address the confirmation
     "email" appears to come from in the inbox. */
  const CHANNELS = {
    agoda:   { name: "Agoda",         email: "bookings@agoda.com" },
    booking: { name: "Booking.com",   email: "noreply@booking.com" },
    airbnb:  { name: "Airbnb",        email: "automated@airbnb.com" },
    trip:    { name: "Trip.com",      email: "hotel@trip.com" },
    expedia: { name: "Expedia",       email: "hotel@expedia.com" },
    other:   { name: "Other channel", email: "noreply@booking-channel.com" }
  };

  /* Fold any incoming channel string ("Agoda", "booking.com", …)
     down to one of the known channel codes. */
  function normChannel(raw) {
    const k = String(raw || "").toLowerCase();
    if (k.indexOf("agoda") >= 0) return "agoda";
    if (k.indexOf("booking") >= 0) return "booking";
    if (k.indexOf("airbnb") >= 0) return "airbnb";
    if (k.indexOf("trip") >= 0) return "trip";
    if (k.indexOf("expedia") >= 0) return "expedia";
    return "other";
  }

  function computeNights(ci, co) {
    if (!ci || !co) return 1;
    const a = new Date(ci), b = new Date(co);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 1;
    const n = Math.round((b - a) / 86400000);
    return n > 0 ? n : 1;
  }

  /* Build a plain-text confirmation body when the bridge didn't
     supply one. English source (lang "en") — the inbox translates
     it into each reader's language on display. */
  function buildConfirmation(rec) {
    const lines = [];
    lines.push("A new reservation has been confirmed through " + rec.channelName + ".");
    lines.push("");
    lines.push("Confirmation: " + rec.ref);
    lines.push("Guest: " + rec.guestName);
    if (rec.guestEmail) lines.push("Guest email: " + rec.guestEmail);
    if (rec.room) lines.push("Room: " + rec.room);
    if (rec.checkIn) lines.push("Check-in: " + rec.checkIn);
    if (rec.checkOut) lines.push("Check-out: " + rec.checkOut);
    const guests = rec.adults + " adult" + (rec.adults === 1 ? "" : "s") +
      (rec.children ? ", " + rec.children + " child" + (rec.children === 1 ? "" : "ren") : "");
    lines.push("Guests: " + guests);
    if (rec.total != null) lines.push("Total: " + rec.currency + " " + rec.total);
    return lines.join("\n");
  }

  /* Accept a (possibly partial) booking payload from any source,
     normalise it, and store it in the Guest Booking inbox.
     Returns the stored record, or the existing one if a booking
     with the same channel + reference was already ingested. */
  function ingest(payload) {
    if (!S) { console.error("[bookings] store not loaded"); return null; }
    if (!payload || typeof payload !== "object") {
      console.warn("[bookings] ingest() needs a booking object"); return null;
    }

    const channel = normChannel(payload.channel || payload.source);
    const meta = CHANNELS[channel];
    const checkIn = payload.checkIn || payload.checkin || "";
    const checkOut = payload.checkOut || payload.checkout || "";

    const rec = {
      channel: channel,
      channelName: payload.channelName || meta.name,
      channelEmail: payload.channelEmail || meta.email,
      ref: payload.ref || payload.bookingId || payload.confirmationCode || ("OTA-" + S.genId().toUpperCase()),
      guestName: payload.guestName || payload.name || "Guest",
      guestEmail: payload.guestEmail || payload.email || "",
      guestPhone: payload.guestPhone || payload.phone || "",
      room: payload.room || payload.roomType || "",
      checkIn: checkIn,
      checkOut: checkOut,
      nights: payload.nights || computeNights(checkIn, checkOut),
      adults: payload.adults != null ? payload.adults : (payload.guests != null ? payload.guests : 1),
      children: payload.children != null ? payload.children : 0,
      total: payload.total != null ? payload.total : null,
      currency: payload.currency || "THB",
      status: payload.status || "confirmed",
      lang: payload.lang || "en",
      readBy: []
    };
    rec.confirmation = payload.confirmation || payload.body || buildConfirmation(rec);

    // De-dupe: a bridge that retries shouldn't create duplicates.
    const dup = S.list("guestBookings").find(
      (b) => b.channel === rec.channel && b.ref === rec.ref
    );
    if (dup) return dup;

    return S.insert("guestBookings", rec);
  }

  /* Deep-link intake: a forwarding bridge can open
       staff.html#booking=<base64-encoded JSON>
     The bridge should encode with: btoa(unescape(encodeURIComponent(json))) */
  function ingestFromUrl() {
    try {
      const m = (location.hash || "").match(/[#&]booking=([^&]+)/);
      if (!m) return;
      const json = decodeURIComponent(escape(atob(decodeURIComponent(m[1]))));
      ingest(JSON.parse(json));
      // strip the param so a reload doesn't re-ingest
      history.replaceState(null, "", location.pathname + location.search);
    } catch (e) {
      console.warn("[bookings] could not parse #booking= payload", e);
    }
  }

  J.bookings = { ingest: ingest, channels: CHANNELS, normChannel: normChannel };

  document.addEventListener("DOMContentLoaded", ingestFromUrl);
})();
