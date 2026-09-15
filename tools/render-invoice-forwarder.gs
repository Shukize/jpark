/**
 * J Park Hotel — hosting invoices → accounts inbox (Google Apps Script)
 * ----------------------------------------------------------------------------
 * Purpose: the client needs to see what the site costs to run each month.
 *
 * Render emails its invoice to ONE address — the workspace owner's account
 * email. There is no "extra invoice recipient" field; the only built-in second
 * recipient is a member with the Billing role, and that needs a Scale workspace
 * (~$29/user/mo to CC a $7/mo bill). So we forward from the mailbox that
 * already receives them. Scope is deliberately Render only — other vendors can
 * be added to CONFIG.VENDORS later if the client ever wants the full picture.
 *
 * Run this on the Gmail account the vendors bill (the Render login email).
 * Every hour it finds new billing email and forwards it — body and attachments
 * intact — to CONFIG.FORWARD_TO.
 *
 * SETUP (once):
 *   1. script.google.com → New project → paste this in → Save.
 *   2. Run  listBillingSenders()  → check the Execution log. Confirm the real
 *      sender and subject of a past invoice from each vendor, and correct
 *      CONFIG.VENDORS if any of them differ.
 *   3. Run  previewMatches()      → logs exactly what WOULD be forwarded.
 *      Nothing is sent. Check every line is a hotel bill.
 *   4. Run  installTrigger()      → approve the Gmail prompt. Done.
 *   5. Optional: run  forwardPastInvoices()  once to send the back catalogue.
 *
 * Safe to re-run: every forwarded message id is recorded, so nothing is ever
 * sent twice — even when Gmail groups several months into one thread.
 */
const CONFIG = {
  // Where invoices land: the client's accounts/purchasing address.
  // Deliberately NOT written down here — this repo is public and served at
  // jparkhotel.com/tools/, and that address belongs to the client. Fill it in
  // inside the Apps Script project, which is private to the mailbox owner.
  FORWARD_TO: 'PASTE_THE_ACCOUNTS_EMAIL_HERE',

  // Subject the client sees. `Fwd: Your Render receipt` is ambiguous arriving in
  // a purchasing inbox, so say whose bill it is up front. {vendor} and {subject}
  // are filled in. Set to '' to forward with Gmail's default "Fwd: …" instead.
  // Only the subject line changes — the body and the PDF are never touched.
  FORWARD_SUBJECT: 'J Park Hotel — {vendor} invoice — {subject}',

  /**
   * Every vendor whose bill the hotel pays for this site.
   *   from        — the vendor's own sending domain
   *   stripeName  — set when the vendor bills THROUGH Stripe. The word must
   *                 appear in the mail for it to count as ours.
   *   everyDays   — how often this vendor bills, used by the stale check.
   *
   * The stripeName requirement is not optional. A bare `from:stripe.com` also
   * matches the mailbox owner's personal receipts from every other Stripe
   * merchant on earth — and would mail them to a third party's purchasing
   * inbox.
   */
  VENDORS: [
    { label: 'Render', from: 'render.com', stripeName: 'render', everyDays: 30 },
  ],

  // Keeps deploy notices and service alerts — same senders — out of accounts.
  SUBJECT_TERMS: 'subject:receipt OR subject:invoice OR subject:payment'
               + ' OR subject:billing OR subject:charged OR subject:subscription',

  LABEL: 'Hosting-invoices-forwarded',

  // Where selfTest() sends its rehearsal copy. Blank = this mailbox. Leave it
  // blank: a test must never land in the client's purchasing inbox.
  TEST_FORWARD_TO: '',

  WINDOW: '45d',          // how far back a routine run looks
  BACKFILL_WINDOW: '2y',  // how far back forwardPastInvoices() looks

  // Grace period on top of a vendor's own billing cycle before we assume the
  // search has stopped matching — so Render's monthly bill warns at ~45 days.
  // Each vendor carries its own everyDays because an annually-billed one would
  // otherwise cry wolf for eleven months of every year.
  STALE_GRACE_DAYS: 15,
};

/**
 * True when FORWARD_TO is still the committed placeholder. Re-pasting a fresh
 * copy from the repo resets it, so every entry point checks — otherwise the
 * next code update would quietly aim the forwards at nothing.
 */
function recipientMissing() {
  var to = CONFIG.FORWARD_TO || '';
  if (to && to.indexOf('@') !== -1) return false;
  Logger.log('✗ STOP: CONFIG.FORWARD_TO is not set. Put the accounts email in it '
    + '(top of this file) and run again. It is left blank in the repo on purpose '
    + '— the repo is public.');
  return true;
}

/** Forward anything new. This is what the hourly trigger calls. */
function forwardInvoices(window) {
  if (recipientMissing()) return;
  var sent = loadSentIds();
  var label = GmailApp.getUserLabelByName(CONFIG.LABEL) || GmailApp.createLabel(CONFIG.LABEL);
  var props = PropertiesService.getScriptProperties();
  var forwarded = 0;

  GmailApp.search(buildQuery(window || CONFIG.WINDOW), 0, 50).forEach(function (thread) {
    var allOk = true;
    thread.getMessages().forEach(function (msg) {
      var id = msg.getId();
      // Per-MESSAGE dedupe, not per-thread: Gmail groups consecutive monthly
      // receipts into one thread, and a thread-level marker would forward the
      // first invoice and silently swallow every month after it.
      if (sent.indexOf(id) !== -1) return;
      // Re-check the sender per message. Walking a thread surfaces messages the
      // search never scored, and one of them could be a personal Stripe receipt.
      var vendor = vendorFor(msg);
      if (!vendor || !looksLikeBilling(msg)) return;
      try {
        // Keeps the original body + attachments; only the subject is restyled.
        var subject = forwardSubject(vendor, msg);
        if (subject) msg.forward(CONFIG.FORWARD_TO, { subject: subject });
        else msg.forward(CONFIG.FORWARD_TO);
        sent.push(id);
        forwarded++;
        props.setProperty('lastForwardAt:' + vendor, String(Date.now()));
        Logger.log('Forwarded [' + vendor + '] ' + msg.getSubject());
      } catch (e) {
        allOk = false;
        Logger.log('Forward FAILED for "' + msg.getSubject() + '": ' + e);
      }
    });
    if (allOk) thread.addLabel(label);
  });

  saveSentIds(sent);
  checkStale();
  Logger.log('Done. Forwarded ' + forwarded + ' message(s) to ' + CONFIG.FORWARD_TO + '.');
}

/**
 * Which hotel vendor sent this, or null if it isn't ours.
 *
 * Vendor-domain mail is matched on the domain. Stripe-relayed mail must also
 * name the vendor somewhere in the subject or body — that check is the only
 * thing standing between the owner's personal Stripe receipts and the client's
 * purchasing inbox.
 */
function vendorFor(msg) {
  var from = (msg.getFrom() || '').toLowerCase();
  var i;
  for (i = 0; i < CONFIG.VENDORS.length; i++) {
    var d = CONFIG.VENDORS[i].from;
    if (from.indexOf('@' + d) !== -1 || from.indexOf('.' + d) !== -1) return CONFIG.VENDORS[i].label;
  }
  if (from.indexOf('stripe.com') !== -1) {
    var hay = ((msg.getSubject() || '') + ' ' + bodyOf(msg)).toLowerCase();
    for (i = 0; i < CONFIG.VENDORS.length; i++) {
      var name = CONFIG.VENDORS[i].stripeName;
      if (name && hay.indexOf(name) !== -1) return CONFIG.VENDORS[i].label;
    }
  }
  return null;
}

/**
 * Second gate, applied per message. Gmail's `subject:` matching is fuzzy and a
 * thread can pull in messages the query never scored, so re-check each one:
 * deploy and service-health mail comes from the same senders, and the accounts
 * inbox should only ever see money. Genuinely billing-adjacent mail ("update
 * your payment method", "past due") is forwarded on purpose.
 */
function looksLikeBilling(msg) {
  var subject = (msg.getSubject() || '').toLowerCase();
  var BILLING = ['receipt', 'invoice', 'payment', 'billing', 'charged', 'subscription', 'past due'];
  var NOT_BILLING = ['deploy', 'build failed', 'service is live', 'suspended your service'];
  var blocked = NOT_BILLING.some(function (w) { return subject.indexOf(w) !== -1; });
  if (blocked) return false;
  return BILLING.some(function (w) { return subject.indexOf(w) !== -1; });
}

/** Dry run — logs what would be forwarded, sends nothing. */
function previewMatches() {
  if (recipientMissing()) return;
  var sent = loadSentIds();
  var n = 0;
  GmailApp.search(buildQuery(CONFIG.WINDOW), 0, 50).forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var already = sent.indexOf(msg.getId()) !== -1;
      var vendor = vendorFor(msg);
      var send = !already && vendor && looksLikeBilling(msg);
      var tag = already ? '[already sent] ' : send ? '[WOULD SEND]   ' : '[skipped]      ';
      Logger.log(tag + msg.getDate().toISOString().slice(0, 10)
        + '  ' + (vendor || '—') + '  ' + msg.getFrom() + '  |  ' + msg.getSubject());
      if (send) n++;
    });
  });
  Logger.log('--- ' + n + ' message(s) would be forwarded to ' + CONFIG.FORWARD_TO + '.');
}

/**
 * Discovery helper. Ignores the vendor list and shows ALL mail from the vendor
 * domains plus anything Stripe-sent, so you can read the real sender + subject
 * off a genuine invoice and correct CONFIG.VENDORS before trusting it. The
 * "not ours" column is what the Stripe guard is rejecting — it should be
 * personal receipts only.
 */
function listBillingSenders() {
  var doms = CONFIG.VENDORS.map(function (v) { return 'from:' + v.from; });
  doms.push('from:stripe.com');
  var seen = {};
  GmailApp.search('newer_than:2y (' + doms.join(' OR ') + ')', 0, 200).forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var key = (vendorFor(msg) || 'not ours') + '  |  ' + msg.getFrom()
        + '  |  ' + msg.getSubject().replace(/[0-9]{2,}/g, '#');
      seen[key] = (seen[key] || 0) + 1;
    });
  });
  var keys = Object.keys(seen).sort();
  Logger.log('Distinct vendor/Stripe sender + subject patterns (last 2 years):');
  keys.forEach(function (k) { Logger.log('  x' + seen[k] + '  ' + k); });
  if (!keys.length) Logger.log('  (none found — is this the mailbox the vendors bill?)');
}

/** One-off catch-up: forwards the invoices that arrived before this was set up. */
function forwardPastInvoices() { forwardInvoices(CONFIG.BACKFILL_WINDOW); }

/**
 * End-to-end rehearsal, safe to run any time.
 *
 * Plants a message in this mailbox that mimics a Render invoice, runs it
 * through the real subject gate, forwards it to CONFIG.TEST_FORWARD_TO (this
 * mailbox by default — never the client), then bins the plant.
 *
 * What it proves: the OAuth scopes are granted, Gmail search finds new mail,
 * the subject gate accepts a real invoice subject, and forwarding actually
 * delivers. What it CANNOT prove: that Render's genuine invoice email matches
 * the sender rules — the plant comes from this mailbox, not from Render. Only
 * a real invoice settles that, which is why previewMatches() exists.
 */
function selfTest() {
  if (recipientMissing()) return;
  var me = Session.getEffectiveUser().getEmail();
  var to = CONFIG.TEST_FORWARD_TO || me;
  var nonce = 'JPARK-SELFTEST-' + Date.now();
  var subject = 'Your Render receipt [' + nonce + ']';

  GmailApp.sendEmail(me, subject,
    'Rehearsal only — this is NOT a real invoice.\n\n'
    + 'Render Services, Inc — $7.00 USD\n' + nonce);
  Logger.log('1/4  planted a test message, waiting for delivery…');

  var thread = null;
  for (var i = 0; i < 10 && !thread; i++) {
    Utilities.sleep(3000);
    var found = GmailApp.search('subject:"' + nonce + '"', 0, 1);
    if (found.length) thread = found[0];
  }
  if (!thread) {
    Logger.log('✗ FAILED: the planted message never arrived. Check Gmail sending limits.');
    return;
  }
  Logger.log('2/4  found it in the mailbox.');

  var msg = thread.getMessages()[0];
  Logger.log('3/4  subject gate: ' + (looksLikeBilling(msg) ? '✓ PASS' : '✗ FAIL'));

  try {
    // Same path a real invoice takes, so the rehearsal also shows you the exact
    // subject line the client will receive.
    var subject = forwardSubject('Render', msg);
    if (subject) msg.forward(to, { subject: subject });
    else msg.forward(to);
    Logger.log('4/4  ✓ forwarded to ' + to + ' — go and check that inbox now.');
    Logger.log('     the client would see: "' + (subject || 'Fwd: ' + msg.getSubject()) + '"');
  } catch (e) {
    Logger.log('4/4  ✗ FAILED to forward: ' + e);
  }

  thread.moveToTrash();
  Logger.log('Cleaned up (plant moved to Trash).');
  Logger.log('NOTE: this proves permissions, the subject gate and delivery. It does '
    + 'NOT prove Render\'s real sender matches — run previewMatches() once a '
    + 'genuine invoice has landed.');
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'forwardInvoices') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('forwardInvoices').timeBased().everyHours(1).create();
  Logger.log('Installed: forwardInvoices runs every hour.');
}

/* --- internals ------------------------------------------------------------ */

/** The subject the client sees, or null to leave Gmail's default "Fwd: …". */
function forwardSubject(vendor, msg) {
  if (!CONFIG.FORWARD_SUBJECT) return null;
  return CONFIG.FORWARD_SUBJECT
    .replace('{vendor}', vendor)
    .replace('{subject}', msg.getSubject() || '');
}

function buildQuery(window) {
  var parts = [];
  CONFIG.VENDORS.forEach(function (v) {
    parts.push('from:' + v.from);
    // Never a bare from:stripe.com — see the note on CONFIG.VENDORS.
    if (v.stripeName) parts.push('(from:stripe.com ' + v.stripeName + ')');
  });
  return 'newer_than:' + window + ' -label:' + CONFIG.LABEL
    + ' (' + parts.join(' OR ') + ')'
    + ' (' + CONFIG.SUBJECT_TERMS + ')';
}

function bodyOf(msg) {
  try { return msg.getPlainBody() || ''; } catch (e) { return ''; }
}

function loadSentIds() {
  var raw = PropertiesService.getScriptProperties().getProperty('sentIds');
  try { return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}

function saveSentIds(ids) {
  // Keep the tail only. Script properties cap at 9KB per value; a couple of
  // hundred ids is years of monthly invoices and leaves plenty of headroom.
  PropertiesService.getScriptProperties().setProperty('sentIds', JSON.stringify(ids.slice(-200)));
}

/**
 * Per-vendor silence check. A vendor that quietly stops matching is invisible
 * otherwise — the client just sees a smaller bill and assumes costs went down.
 * Only vendors that have successfully forwarded at least once are checked, so
 * this never fires before setup is proven.
 */
function checkStale() {
  var props = PropertiesService.getScriptProperties();
  var stale = [];
  CONFIG.VENDORS.forEach(function (v) {
    var last = Number(props.getProperty('lastForwardAt:' + v.label) || 0);
    if (!last) return;
    var days = (Date.now() - last) / 86400000;
    if (days > v.everyDays + CONFIG.STALE_GRACE_DAYS) {
      stale.push({ label: v.label, days: Math.floor(days) });
    }
  });
  if (!stale.length) return;

  // At most one warning per vendor per month, so a genuinely dead feed doesn't
  // turn into an hourly nag.
  var bucket = stale.map(function (s) { return s.label + ':' + Math.floor(s.days / 30); }).join(',');
  if (props.getProperty('staleWarnedFor') === bucket) return;
  props.setProperty('staleWarnedFor', bucket);

  MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
    'Hosting invoice forwarding may have stopped',
    'These vendors have not had an invoice forwarded to ' + CONFIG.FORWARD_TO + ' recently:\n\n'
    + stale.map(function (s) { return '  - ' + s.label + ': ' + s.days + ' days ago'; }).join('\n')
    + '\n\nThat usually means the search no longer matches their billing email '
    + '(changed sender or subject line), so the client is seeing an incomplete '
    + 'picture of what the site costs.\n\n'
    + 'Fix: open the Apps Script project, run listBillingSenders(), and update '
    + 'CONFIG.VENDORS to match what a real invoice looks like now.');
}
