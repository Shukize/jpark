/* Harness: load the .gs in a stubbed Apps Script environment and exercise the
   real logic (vendor gate, Stripe leak guard, per-message dedupe, per-vendor
   stale check). */
const fs = require('fs');
const vm = require('vm');

const path = require('path');
const SRC = path.join(__dirname, 'render-invoice-forwarder.gs');
const src = fs.readFileSync(SRC, 'utf8');

// FORWARD_TO ships blank (public repo), so every run configures it first.
const RECIPIENT = 'accounts@example.test';

function makeMsg(id, from, subject, body, date) {
  return {
    _fwd: [], _opts: [],
    getId: () => id,
    getFrom: () => from,
    getSubject: () => subject,
    getPlainBody: () => body || '',
    getDate: () => new Date(date || '2026-09-01T00:00:00Z'),
    forward(to, opts) { this._fwd.push(to); this._opts.push(opts || null); },
  };
}

function run(messages, props) {
  const store = Object.assign({}, props);
  const logs = [], mails = [];
  const threads = [{ getMessages: () => messages, addLabel: () => {} }];
  const ctx = {
    GmailApp: {
      _lastQuery: null,
      search(q) { ctx.GmailApp._lastQuery = q; return threads; },
      getUserLabelByName: () => 'L', createLabel: () => 'L',
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = v; },
      }),
    },
    MailApp: { sendEmail: (to, subj, body) => mails.push({ to, subj, body }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@gmail.com' }) },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ create: () => {} }) }) }) },
    Logger: { log: (s) => logs.push(String(s)) },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  // Top-level `const` is a lexical binding, not a global property, so reach the
  // script's real CONFIG object by evaluating it inside the same context.
  ctx.CONFIG = vm.runInContext('CONFIG', ctx);
  if (!(props && props._leaveRecipientUnset)) ctx.CONFIG.FORWARD_TO = RECIPIENT;
  ctx.forwardInvoices();
  return { ctx, store, logs, mails };
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}
const DAY = 86400000;

/* ---- 1. the Stripe leak: personal receipts must never reach the client --- */
console.log('\nStripe guard (the client inbox is a third party):');
{
  const ctx = run([], {}).ctx;
  const ours = [
    ['billing@render.com', 'Your Render receipt', ''],
    ['noreply@stripe.com', 'Your receipt from Render', 'Render Inc. $7.00'],
    ['invoice+statements@stripe.com', 'Your receipt', 'Thanks for your payment to Render'],
    ['noreply@mail.render.com', 'Invoice is past due', ''],
  ];
  const theirs = [
    ['noreply@stripe.com', 'Your receipt from Spotify', 'Spotify AB 199 THB'],
    ['noreply@stripe.com', 'Your receipt', 'Thank you for your purchase from Lazada'],
    ['receipts@stripe.com', 'Invoice paid', 'Adobe Creative Cloud'],
    ['billing@notrender.com', 'Your receipt', ''],
    ['billing@neon.tech', 'Your Neon invoice', ''],
    ['support@porkbun.com', 'Domain renewal receipt', ''],
    ['noreply@stripe.com', 'Your receipt', 'Neon Inc — compute hours'],
  ];
  ours.forEach(([f, s, b]) =>
    check('ours:     ' + s + '  <' + f + '>', ctx.vendorFor(makeMsg('m', f, s, b)) !== null));
  theirs.forEach(([f, s, b]) =>
    check('NOT ours: ' + s + '  <' + f + '>', ctx.vendorFor(makeMsg('m', f, s, b)) === null,
      'leaked as ' + ctx.vendorFor(makeMsg('m', f, s, b))));
}

console.log('\npersonal Stripe receipt sitting in a matched thread:');
{
  const bill = makeMsg('id-1', 'noreply@stripe.com', 'Your receipt from Render', 'Render Inc. $7.00');
  const leak = makeMsg('id-2', 'noreply@stripe.com', 'Your receipt from Spotify', 'Spotify AB');
  run([bill, leak], {});
  check('Render receipt forwarded', bill._fwd.length === 1);
  check("owner's Spotify receipt NOT sent to purchasing", leak._fwd.length === 0, JSON.stringify(leak._fwd));
}

console.log('\nsearch query never uses a bare from:stripe.com:');
{
  const r = run([], {});
  const q = r.ctx.GmailApp._lastQuery;
  check('no unqualified stripe clause', !/[( ]from:stripe\.com[) ]/.test(q.replace(/from:stripe\.com \w+/g, 'X')), q);
  check('covers Render', q.includes('from:render.com'), q);
  check('out-of-scope vendors are not searched for',
    !q.includes('neon') && !q.includes('porkbun'), q);
}

/* ---- 2. subject gate ---------------------------------------------------- */
console.log('\nsubject gate:');
{
  const ctx = run([], {}).ctx;
  ['Your Render receipt', 'Your invoice from Render', 'Your payment failed',
   'Invoice INV-1234 is past due', 'Your subscription renews soon']
    .forEach(s => check('forwards: ' + s, ctx.looksLikeBilling(makeMsg('m', 'x@render.com', s))));
  ['Deploy succeeded for jpark-api', 'Build failed for jpark-api',
   'Your service is live at jpark.onrender.com', 'New feature: Render Postgres backups']
    .forEach(s => check('skips:    ' + s, !ctx.looksLikeBilling(makeMsg('m', 'x@render.com', s))));
}

/* ---- 3. dedupe ---------------------------------------------------------- */
console.log('\ntwo receipts grouped into one Gmail thread:');
{
  const a = makeMsg('id-aug', 'billing@render.com', 'Your Render receipt', '', '2026-08-01');
  const b = makeMsg('id-sep', 'billing@render.com', 'Your Render receipt', '', '2026-09-01');
  const r = run([a, b], {});
  check('August forwarded', a._fwd.length === 1);
  check('September forwarded (thread-level dedupe would lose this)', b._fwd.length === 1);
  check('recipient is the configured accounts address', a._fwd[0] === RECIPIENT, a._fwd[0]);
  check('both ids recorded', JSON.parse(r.store.sentIds).length === 2);
  check('per-vendor timestamp stamped', !!r.store['lastForwardAt:Render']);
}
console.log('\nclient-facing subject:');
{
  const a = makeMsg('id-1', 'billing@render.com', 'Your Render receipt');
  run([a], {});
  check('subject leads with the billed entity and keeps the original tail',
    a._opts[0] && a._opts[0].subject === 'Thai-J Associates — Render invoice (J Park Hotel website) — Your Render receipt',
    JSON.stringify(a._opts[0]));
  check('body and attachments untouched (no body override)',
    a._opts[0] && !('htmlBody' in a._opts[0]) && !('body' in a._opts[0]),
    JSON.stringify(a._opts[0]));

  // A blank template must fall back to a plain forward, never send 'null'.
  const r = run([], {});
  r.ctx.CONFIG.FORWARD_SUBJECT = '';
  const c = makeMsg('id-3', 'billing@render.com', 'Your Render receipt');
  check('blank template falls back to Gmail default',
    r.ctx.forwardSubject('Render', c) === null,
    String(r.ctx.forwardSubject('Render', c)));
}

console.log('\nunconfigured recipient guard:');
{
  const a = makeMsg('id-1', 'billing@render.com', 'Your Render receipt');
  const r = run([a], { _leaveRecipientUnset: true });
  check('placeholder FORWARD_TO forwards nothing', a._fwd.length === 0, JSON.stringify(a._fwd));
  check('and says why in the log',
    r.logs.some(l => l.indexOf('FORWARD_TO is not set') !== -1), JSON.stringify(r.logs));
}

console.log('\nidempotence:');
{
  const a = makeMsg('id-aug', 'billing@render.com', 'Your Render receipt');
  run([a], { sentIds: JSON.stringify(['id-aug']) });
  check('already-sent message is not re-forwarded', a._fwd.length === 0);
}

/* ---- 4. per-vendor stale check ------------------------------------------ */
console.log('\nstale detection respects each vendor\u2019s billing cycle:');
{
  const r1 = run([], { 'lastForwardAt:Render': String(Date.now() - 60 * DAY) });
  check('monthly Render silent 60d -> warns', r1.mails.length === 1);
  check('warning names Render', r1.mails[0] && /Render/.test(r1.mails[0].body));

  // An annually-billed vendor must not warn every month. Nothing is declared
  // annual today, so add one at runtime to keep the cycle logic covered for
  // whenever Porkbun or similar is added back.
  function annual(props) {
    const r = run([], props);
    r.ctx.CONFIG.VENDORS.push({ label: 'Yearly', from: 'yearly.test', everyDays: 365 });
    r.mails.length = 0;
    r.ctx.checkStale();
    return r;
  }
  const r2 = annual({ 'lastForwardAt:Yearly': String(Date.now() - 60 * DAY) });
  check('annual vendor silent 60d -> no false alarm', r2.mails.length === 0,
    JSON.stringify(r2.mails.map(m => m.subj)));

  const r3 = annual({ 'lastForwardAt:Yearly': String(Date.now() - 400 * DAY) });
  check('annual vendor silent 400d -> warns', r3.mails.length === 1);

  const r4 = run([], { 'lastForwardAt:Render': String(Date.now() - 20 * DAY) });
  check('Render silent 20d -> silent', r4.mails.length === 0);

  const r5 = run([], {});
  check('never warns before a vendor has ever delivered', r5.mails.length === 0);

  const stamp = String(Date.now() - 60 * DAY);
  const r6 = run([], { 'lastForwardAt:Render': stamp, staleWarnedFor: 'Render:2' });
  check('no hourly nagging within the same month bucket', r6.mails.length === 0,
    JSON.stringify(r6.mails.map(m => m.subj)));

  const r7 = run([makeMsg('n1', 'billing@render.com', 'Your Render receipt')],
                 { 'lastForwardAt:Render': String(Date.now() - 60 * DAY) });
  check('a vendor that delivers this run is not reported stale', r7.mails.length === 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
