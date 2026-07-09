/**
 * J Park Hotel — OTA email → website bridge (Google Apps Script)
 * ----------------------------------------------------------------------------
 * Run this on the Gmail account that receives your OTA confirmation emails.
 * Every 5 minutes it finds new OTA emails and POSTs each one to the hotel API
 * (POST /api/v1/ota-email), which files it in the staff Guest Booking inbox and
 * sends the front-desk notice. This is the permanent receiver (jparkhotel.com's
 * DNS stays on Porkbun, so there's no Cloudflare Email Routing option).
 *
 * SETUP (once):
 *   1. script.google.com → New project → paste this in → Save.
 *   2. Set CONFIG.SECRET = your OTA_WEBHOOK_SECRET (same value as in Render),
 *      and tune CONFIG.QUERY senders to match where your OTA mail comes from.
 *   3. Run installTrigger() once → approve the Gmail + external-request prompt.
 *   4. Test with runOnce(), then check staff console → Messages → Guest Booking.
 *
 * Safe to re-run: labeled threads are skipped, and the endpoint de-dupes on the
 * OTA reference, so a booking is never imported twice.
 */
const CONFIG = {
  API_URL: 'https://jpark.onrender.com/api/v1/ota-email',
  SECRET:  'PASTE_YOUR_OTA_WEBHOOK_SECRET_HERE',   // same value as in Render
  // Sender-restricted to known OTA domains. Previously also matched ANY
  // sender whose subject merely contained "reservation" or "booking
  // confirmed" — that clause pulled in unrelated, non-OTA emails (personal
  // reservations, newsletters, etc.) which then got ingested as garbage
  // "Other Channel" bookings in the staff console with no real guest data.
  // Add more `from:` domains here as new OTA channels are onboarded.
  QUERY:   'newer_than:3d -label:OTA-imported (from:booking.com OR from:agoda.com OR from:airbnb.com OR from:trip.com OR from:expedia.com OR from:traveloka.com OR from:hotels.com)',
  LABEL:   'OTA-imported',
};

function runOnce() { processOtaEmails(); }

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processOtaEmails') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processOtaEmails').timeBased().everyMinutes(5).create();
  Logger.log('Installed: processOtaEmails runs every 5 minutes.');
}

function processOtaEmails() {
  var label = GmailApp.getUserLabelByName(CONFIG.LABEL) || GmailApp.createLabel(CONFIG.LABEL);
  GmailApp.search(CONFIG.QUERY, 0, 25).forEach(function (thread) {
    var ok = true;
    thread.getMessages().forEach(function (msg) {
      var payload = {
        subject: msg.getSubject(),
        from: msg.getFrom(),
        to: msg.getTo(),
        text: msg.getPlainBody(),
        html: msg.getBody(),
      };
      try {
        var res = UrlFetchApp.fetch(CONFIG.API_URL + '?key=' + encodeURIComponent(CONFIG.SECRET), {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        });
        var code = res.getResponseCode();
        if (code < 200 || code >= 300) { ok = false; Logger.log('API ' + code + ': ' + res.getContentText()); }
      } catch (e) { ok = false; Logger.log('POST failed: ' + e); }
    });
    if (ok) thread.addLabel(label); // dedupe marker: labeled threads are skipped next run
  });
}
