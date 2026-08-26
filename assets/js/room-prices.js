/* ============================================================
   J Park Hotel — "from ฿X,XXX / night" on the homepage room cards.

   The room lineup on index.html described every room in detail and never
   named a price; the only numbers on the whole public site lived inside the
   booking modal, behind a date search. That is a gap for guests, and a hard
   requirement for the card acquirer: Omise's merchant checklist asks that the
   website show "Price in Thai Baht".

   Prices come from the SAME source the booking engine charges from, so they
   cannot quietly drift apart:

     1. FROM_RATES below mirrors backend/lib/roomRates.js and paints
        immediately, with no network round trip — a reviewer or a guest sees a
        price the moment the page renders, even if the API is slow to wake.
        backend/test-rate-parity.js diffs this table against roomRates.js on
        every build, exactly as it already does for booking-page.js's mirror,
        so a rate change that misses this file fails the build.
     2. GET /api/rates then corrects them in place with whatever the admin has
        actually saved in the Site Editor's Rates tab, so a live rate override
        shows here as well as in the booking flow.

   The figure shown is the ROOM-ONLY rate for that card's variant — the
   cheapest way to book that room — hence "from". Breakfast rates, extra-bed
   and extra-guest surcharges are all above it, and all shown during booking.
   ============================================================ */
(function () {
  'use strict';

  window.JPark = window.JPark || {};
  var I = window.JPark.i18n || null;

  var STR = {
    en: { 'rooms.fromPrice': 'from {price} / night', 'rooms.perNightNote': 'Room-only rate in Thai Baht (THB) per night. Breakfast, extra bed and extra guests are priced during booking.' },
    th: { 'rooms.fromPrice': 'เริ่มต้น {price} / คืน', 'rooms.perNightNote': 'ราคาเฉพาะห้องพัก (ไม่รวมอาหารเช้า) เป็นเงินบาท (THB) ต่อคืน ค่าอาหารเช้า เตียงเสริม และผู้เข้าพักเพิ่มจะแสดงในขั้นตอนการจอง' },
    ja: { 'rooms.fromPrice': '{price} / 泊〜', 'rooms.perNightNote': '1泊あたりの室料のみの料金（タイバーツ／THB）です。朝食、エキストラベッド、追加のご宿泊者の料金はご予約時に表示されます。' },
    'zh-Hans': { 'rooms.fromPrice': '{price} / 晚起', 'rooms.perNightNote': '为每晚仅含房费的泰铢（THB）价格。早餐、加床及加人费用将在预订时显示。' },
    'zh-Hant': { 'rooms.fromPrice': '{price} / 晚起', 'rooms.perNightNote': '為每晚僅含房費的泰銖（THB）價格。早餐、加床及加人費用將在訂房時顯示。' },
  };
  if (I) I.registerI18n(STR);

  function TR(key) {
    return I ? I.t(key) : (STR.en[key] || key);
  }

  /* Mirrors backend/lib/roomRates.js — the room-only rate of each variant.
     Guarded by backend/test-rate-parity.js; do not edit one without the
     other. */
  var FROM_RATES = {
    'Studio Single':               { Single: 990 },
    'Studio Twin':                 { Twin: 990 },
    'Prestige Single':             { Single: 1040 },
    'Prestige Twin':               { Twin: 1040 },
    'Studio B4':                   { Single: 1070, Twin: 1070 },
    'Deluxe':                      { Single: 1110 },
    'Premium Single':              { Single: 1160 },
    'Premium Twin':                { Twin: 1160 },
    'Grand Premium':               { Single: 1260 },
    'Corner Suite':                { Single: 1260, Twin: 1260 },
    'Grand Deluxe':                { Single: 1340 },
    'Executive Suite 1 Bedroom':   { '1 Bedroom': 1850, '2 Bedrooms': 2100 },
    'Premium Suite':               { '1 Bedroom': 2100 },
    'Grand Suite':                 { '1 Bedroom': 2700, '2 Bedrooms': 3000 },
  };

  /* A few cards carry a display name that is not the rate key. The lineup was
     split so each bed configuration gets its own photo set (data-media), and
     the Grand Suite's card kept the fuller "…1 Bedroom" label while the rate
     table calls it plain "Grand Suite". */
  var KEY_ALIASES = { 'Grand Suite 1 Bedroom': 'Grand Suite' };

  function rateKeyFor(card) {
    var raw = card.getAttribute('data-room') || '';
    return KEY_ALIASES[raw] || raw;
  }

  /* Which variant this specific card is showing. Cards for the second bed
     configuration of a room are marked with data-media (e.g. "Corner Suite
     Twin", "Grand Suite 2 Bedrooms"), so the variant is whichever label that
     attribute ends with. Without it, the card is the room's first — and
     cheapest — variant. */
  function variantFor(card, variants) {
    var labels = Object.keys(variants || {});
    if (!labels.length) return null;
    var media = String(card.getAttribute('data-media') || '').toLowerCase();
    if (media) {
      var match = labels.filter(function (label) {
        return media.slice(-label.length) === label.toLowerCase();
      }).sort(function (a, b) { return b.length - a.length; })[0];
      if (match) return match;
    }
    return labels[0];
  }

  // Thai Baht, grouped, no decimals — 990 THB is never quoted as 990.00 here.
  function money(amount) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency', currency: 'THB', maximumFractionDigits: 0,
      }).format(amount);
    } catch (e) {
      return '฿' + String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
  }

  var cards = [];

  function paint(rates) {
    cards.forEach(function (entry) {
      var room = rates[entry.key];
      var price = room && room[entry.variant];
      if (!price) return;
      entry.el.textContent = TR('rooms.fromPrice').replace('{price}', money(price));
      entry.el.setAttribute('data-price-thb', String(price));
      entry.el.hidden = false;
    });
  }

  function init() {
    var nodes = document.querySelectorAll('.room-card[data-room]');
    if (!nodes.length) return;

    Array.prototype.forEach.call(nodes, function (card) {
      var key = rateKeyFor(card);
      var variants = FROM_RATES[key];
      if (!variants) return;
      var body = card.querySelector('.room-body');
      if (!body) return;

      var el = document.createElement('span');
      el.className = 'room-from-price';
      el.hidden = true;
      // Above the description, below the room name: the first thing read
      // after "which room is this".
      var heading = body.querySelector('h3');
      if (heading && heading.nextSibling) body.insertBefore(el, heading.nextSibling);
      else body.appendChild(el);

      cards.push({ el: el, card: card, key: key, variant: variantFor(card, variants) });
    });

    if (!cards.length) return;
    paint(FROM_RATES);

    // One clarifying line for the section, so "from" is not doing all the
    // work — it names the currency explicitly and says what the rate excludes.
    var grid = document.querySelector('.room-grid');
    if (grid && grid.parentNode && !document.querySelector('.rooms-price-note')) {
      var note = document.createElement('p');
      note.className = 'rooms-price-note';
      note.setAttribute('data-i18n', 'rooms.perNightNote');
      note.textContent = TR('rooms.perNightNote');
      grid.parentNode.insertBefore(note, grid.nextSibling);
    }

    // Correct the static figures with any live admin rate overrides. Failing
    // is fine and silent: the mirrored defaults above are already painted and
    // are the same numbers the booking engine falls back to.
    var API = window.JPark && window.JPark.api;
    if (!API) return;
    API.get('/api/rates').then(function (res) {
      if (!res || res.error || !res.rooms) return;
      var live = {};
      Object.keys(res.rooms).forEach(function (key) {
        var variants = (res.rooms[key] && res.rooms[key].variants) || [];
        live[key] = {};
        variants.forEach(function (v) { live[key][v.label] = v.room; });
      });
      paint(live);
    }).catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Repaint on a language switch — the "from … / night" wording is
  // translated, and Intl formats the amount per locale.
  document.addEventListener('jpark:langchange', function () {
    paint(FROM_RATES);
    var note = document.querySelector('.rooms-price-note');
    if (note) note.textContent = TR('rooms.perNightNote');
  });
})();
