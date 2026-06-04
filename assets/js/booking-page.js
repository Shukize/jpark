(function () {
  'use strict';

  // Room types and 2026 General rates (per room / night, THB).
  // Each variant: { label, room: Room-only, bf: Room + American Breakfast }.
  var ROOMS = [
    {
      name: 'Studio',
      size: '37 m²',
      maxGuests: 2,
      img: 'images/Studio/room_01.jpg',
      desc: 'A bright, apartment-style studio in single or twin bedding — with a work desk, smart living nook and rainfall shower for an easy stay.',
      amenities: ['Single or Twin', 'Work Desk', 'Rainfall Shower', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Single', room: 990, bf: 1110 }, { label: 'Twin', room: 990, bf: 1300 }],
    },
    {
      name: 'Studio B4',
      size: '37 m²',
      maxGuests: 2,
      img: 'images/Studio%20B4/room_01.jpg',
      desc: 'A refreshed Studio in our B4 wing — single or twin bedding, a full kitchenette and a relaxed living corner for comfortable longer stays.',
      amenities: ['Single or Twin', 'Full Kitchenette', 'Living Corner', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Single', room: 1070, bf: 1190 }, { label: 'Twin', room: 1070, bf: 1380 }],
    },
    {
      name: 'Deluxe',
      size: '44 m²',
      maxGuests: 2,
      img: 'images/Deluxe/room_01.jpg',
      desc: 'A spacious deluxe room with a plush bed, lounge seating and a sleek bathroom, dressed in a warm, contemporary palette.',
      amenities: ['Single or Double', 'Lounge Seating', 'Sleek Bathroom', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Single', room: 1110, bf: 1230 }, { label: 'Double', room: 1110, bf: 1420 }],
    },
    {
      name: 'Grand Deluxe',
      size: '54 m²',
      maxGuests: 2,
      img: 'images/Grand%20Deluxe/room_01.jpg',
      desc: 'A generously sized deluxe room with a king bed, plush furnishings and premium finishes — perfect for guests seeking elevated comfort.',
      amenities: ['Single or Double', 'Plush Furnishings', 'Premium Finishes', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Single', room: 1340, bf: 1460 }, { label: 'Double', room: 1340, bf: 1650 }],
    },
    {
      name: 'Premiere',
      size: '49 m²',
      maxGuests: 2,
      img: 'images/Premiere/room_01.jpg',
      desc: 'An elevated room in single or twin bedding, with premium linens, a spacious work area and a calm, refined ambience throughout.',
      amenities: ['Single or Twin', 'Premium Linens', 'Spacious Work Area', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Single', room: 1160, bf: 1280 }, { label: 'Twin', room: 1160, bf: 1470 }],
    },
    {
      name: 'Grand Premiere',
      size: '49 m²',
      maxGuests: 2,
      img: 'images/Grand%20Premiere/room_01.jpg',
      desc: 'Our most generous Premiere — single or twin bedding, upgraded amenities and a wide lounge area framed by quiet city views.',
      amenities: ['Single or Twin', 'Wide Lounge Area', 'Upgraded Amenities', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Single', room: 1260, bf: 1380 }, { label: 'Twin', room: 1260, bf: 1570 }],
    },
    {
      name: 'Premiere Suite',
      size: '73 m²',
      maxGuests: 3,
      img: 'images/Premiere%20Suite/room_01.jpg',
      desc: 'A one- or two-bedroom suite with a full living and dining area, a separate bedroom and premium finishes — made for relaxed, longer stays.',
      amenities: ['1 or 2 Bedrooms', 'Living & Dining Area', 'Premium Finishes', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: '1 Bedroom', room: 2100, bf: 2220 }, { label: '2 Bedrooms', room: 2100, bf: 2410 }],
    },
    {
      name: 'Executive Suite',
      size: '75 m²',
      maxGuests: 4,
      img: 'images/Executive%20Suite/room_01.jpg',
      desc: 'A refined one- or two-bedroom residence with expansive living and dining spaces, a kitchen and elegant finishes throughout.',
      amenities: ['1 or 2 Bedrooms', 'Living & Dining Room', 'Kitchen', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: '1 Bedroom', room: 1850, bf: 1970 }, { label: '2 Bedrooms', room: 2100, bf: 2410 }],
    },
    {
      name: 'Grand Suite',
      size: '75 m²',
      maxGuests: 4,
      img: 'images/Grand%20Suite/room_01.jpg',
      desc: 'Our flagship residence in one- or two-bedroom layouts — full living and dining areas, a kitchen and the finest finishes, made for families and long stays.',
      amenities: ['1 or 2 Bedrooms', 'Full Kitchen', 'Living & Dining Room', 'Onsen Access', 'Smart TV', 'Free Wi-Fi'],
      variants: [{ label: '1 Bedroom', room: 2700, bf: 2820 }, { label: '2 Bedrooms', room: 3000, bf: 3310 }],
    },
    {
      name: 'Prestige',
      size: '45 m²',
      maxGuests: 2,
      img: 'images/Prestige/room_01.jpg',
      desc: 'A polished room in single or twin bedding, with premium bedding, a generous work area and upgraded amenities for an easy, restful stay.',
      amenities: ['Single or Twin', 'Premium Bedding', 'Generous Work Area', 'Smart TV', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Single', room: 1040, bf: 1160 }, { label: 'Twin', room: 1040, bf: 1350 }],
    },
    {
      name: 'Corner Suite',
      size: '55 m²',
      maxGuests: 2,
      img: 'images/Corner%20Suite/room_01.jpg',
      desc: 'A wraparound corner retreat in single or twin bedding, with a separate living room, dual-aspect windows and a deep-soaking marble bathroom.',
      amenities: ['Single or Twin', 'Dual-Aspect Views', 'Marble Bathroom', 'Separate Living Room', 'Air Conditioning', 'Free Wi-Fi'],
      variants: [{ label: 'Single', room: 1260, bf: 1380 }, { label: 'Twin', room: 1260, bf: 1570 }],
    },
  ];

  // Laundry Package (2026) — pieces : price (THB).
  var LAUNDRY = [
    { pieces: 3, price: 55 }, { pieces: 4, price: 70 }, { pieces: 5, price: 85 },
    { pieces: 6, price: 100 }, { pieces: 7, price: 110 },
    { pieces: 60, price: 900 }, { pieces: 120, price: 1500 },
  ];

  // Day-use rates (2026) — short 3-hour stays, room : price (THB).
  var DAYUSE = [
    { room: 'Studio', price: 500 },
    { room: 'Deluxe', price: 600 },
    { room: 'Premiere', price: 700 },
    { room: 'Grand Premiere', price: 800 },
    { room: 'Prestige', price: 800 },
    { room: 'Premiere Suite', price: 900 },
  ];

  // --- DOM ---
  var checkinEl     = document.getElementById('bkCheckin');
  var checkoutEl    = document.getElementById('bkCheckout');
  var adultsValEl   = document.getElementById('adultsVal');
  var childrenValEl = document.getElementById('childrenVal');
  var searchBtn     = document.getElementById('bkSearchBtn');
  var errorEl       = document.getElementById('bkError');
  var statusEl      = document.getElementById('bkStatus');
  var statusTextEl  = document.getElementById('bkStatusText');
  var clearBtn      = document.getElementById('bkClearBtn');
  var hintEl        = document.getElementById('bkHint');
  var gridEl        = document.getElementById('bkRoomsGrid');
  var noRoomsEl     = document.getElementById('bkNoRooms');

  var adults   = 2;
  var children = 0;

  // --- Date helpers ---
  function todayISO() {
    var d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function shiftDate(iso, days) {
    var d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function nightCount(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }

  function fmtDate(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  // --- Init date constraints ---
  var todayStr = todayISO();
  checkinEl.min  = todayStr;
  checkoutEl.min = shiftDate(todayStr, 1);

  // Make the whole date field open the calendar on desktop (not just the tiny
  // picker icon). showPicker() works on click and keyboard activation.
  function openPicker(inp) {
    if (typeof inp.showPicker === 'function') {
      try { inp.showPicker(); } catch (e) { /* needs gesture / unsupported */ }
    }
  }
  [checkinEl, checkoutEl].forEach(function (inp) {
    inp.addEventListener('click', function () { openPicker(inp); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openPicker(inp);
      }
    });
  });

  checkinEl.addEventListener('change', function () {
    var ci = checkinEl.value;
    if (!ci) return;
    var minCo = shiftDate(ci, 1);
    checkoutEl.min = minCo;
    if (checkoutEl.value && checkoutEl.value <= ci) {
      checkoutEl.value = minCo;
    }
  });

  // --- Steppers ---
  function wire(downId, upId, displayEl, getVal, setVal, min, max) {
    document.getElementById(downId).addEventListener('click', function () {
      var v = getVal();
      if (v > min) setVal(v - 1);
    });
    document.getElementById(upId).addEventListener('click', function () {
      var v = getVal();
      if (v < max) setVal(v + 1);
    });
  }

  wire('adultsDown', 'adultsUp', adultsValEl,
    function () { return adults; },
    function (v) { adults = v; adultsValEl.textContent = v; },
    1, 8
  );
  wire('childrenDown', 'childrenUp', childrenValEl,
    function () { return children; },
    function (v) { children = v; childrenValEl.textContent = v; },
    0, 6
  );

  function baht(n) {
    return '฿' + n.toLocaleString('en-US');
  }

  // --- Build a room card ---
  function buildCard(room, nights) {
    var article = document.createElement('article');
    article.className = 'rr-card';

    var amenityHTML = room.amenities
      .map(function (a) { return '<li>' + a + '</li>'; })
      .join('');

    var nightNote = nights ? ' · ' + plural(nights, 'night') : '';

    var fromRoom = Math.min.apply(null, room.variants.map(function (v) { return v.room; }));
    var ratesHTML = room.variants.map(function (v) {
      return '<div class="rr-rate">' +
               '<span class="rr-rate-label">' + v.label + '</span>' +
               '<span class="rr-rate-val">' +
                 '<strong>' + baht(v.room) + '</strong> room only · ' + baht(v.bf) + ' with breakfast' +
               '</span>' +
             '</div>';
    }).join('');

    article.innerHTML =
      '<div class="rr-img">' +
        '<img src="' + room.img + '" alt="' + room.name + '" loading="lazy" />' +
        '<div class="rr-badges">' +
          '<span class="rr-badge">' + room.size + '</span>' +
          '<span class="rr-badge gold">Up to ' + plural(room.maxGuests, 'guest') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="rr-body">' +
        '<h2 class="rr-name">' + room.name + '</h2>' +
        '<p class="rr-desc">' + room.desc + '</p>' +
        '<ul class="rr-amenities">' + amenityHTML + '</ul>' +
        '<div class="rr-price-block">' +
          '<p class="rr-price-label">From <strong class="rr-price-from">' + baht(fromRoom) + '</strong> per room / night' + nightNote + '</p>' +
          '<div class="rr-rates">' + ratesHTML + '</div>' +
        '</div>' +
        '<div class="rr-price-row">' +
          '<span class="rr-price-note">2026 general rate · taxes &amp; service included</span>' +
          '<a href="index.html#contact" class="btn btn-solid rr-enquire-btn">Enquire to Book</a>' +
        '</div>' +
      '</div>';

    return article;
  }

  // --- Render rooms ---
  function renderRooms(rooms, nights) {
    gridEl.innerHTML = '';
    if (rooms.length === 0) {
      gridEl.hidden  = true;
      noRoomsEl.hidden = false;
      return;
    }
    noRoomsEl.hidden = true;
    rooms.forEach(function (r) {
      gridEl.appendChild(buildCard(r, nights));
    });
    gridEl.hidden = false;
  }

  // --- Render the laundry package price list ---
  function renderLaundry() {
    var host = document.getElementById('bkLaundryGrid');
    if (!host) return;
    host.innerHTML = LAUNDRY.map(function (l) {
      return '<div class="bk-laundry-item">' +
               '<span class="bk-laundry-pcs">' + l.pieces + ' ' + (l.pieces === 1 ? 'piece' : 'pieces') + '</span>' +
               '<span class="bk-laundry-price">' + baht(l.price) + '</span>' +
             '</div>';
    }).join('');
  }
  renderLaundry();

  // --- Render the day-use (3-hour) rate list ---
  function renderDayUse() {
    var host = document.getElementById('bkDayUseGrid');
    if (!host) return;
    host.innerHTML = DAYUSE.map(function (d) {
      return '<div class="bk-dayuse-item">' +
               '<span class="bk-dayuse-room">' + d.room + '</span>' +
               '<span class="bk-dayuse-price">' + baht(d.price) + '</span>' +
             '</div>';
    }).join('');
  }
  renderDayUse();

  // Show all rooms on initial load
  renderRooms(ROOMS, null);

  // --- Search ---
  searchBtn.addEventListener('click', function () {
    var ci = checkinEl.value;
    var co = checkoutEl.value;

    if (!ci || !co) {
      errorEl.textContent = 'Please select both a check-in and check-out date.';
      errorEl.hidden = false;
      checkinEl.focus();
      return;
    }
    if (co <= ci) {
      errorEl.textContent = 'Check-out must be after check-in.';
      errorEl.hidden = false;
      checkoutEl.focus();
      return;
    }
    errorEl.hidden = true;

    var nights = nightCount(ci, co);
    var totalGuests = adults + children;
    var filtered = ROOMS.filter(function (r) { return r.maxGuests >= totalGuests; });

    var guestStr = plural(adults, 'adult') +
      (children > 0 ? ' · ' + plural(children, 'child') : '');
    statusTextEl.textContent =
      fmtDate(ci) + ' → ' + fmtDate(co) +
      ' · ' + plural(nights, 'night') +
      ' · ' + guestStr;

    statusEl.hidden = false;
    hintEl.hidden   = true;

    renderRooms(filtered, nights);

    setTimeout(function () {
      gridEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  });

  // Also trigger search on Enter in date fields
  [checkinEl, checkoutEl].forEach(function (el) {
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') searchBtn.click();
    });
  });

  // --- Clear / reset ---
  clearBtn.addEventListener('click', function () {
    checkinEl.value  = '';
    checkoutEl.value = '';
    adults   = 2;
    children = 0;
    adultsValEl.textContent   = '2';
    childrenValEl.textContent = '0';

    statusEl.hidden  = true;
    hintEl.hidden    = false;
    errorEl.hidden   = true;
    noRoomsEl.hidden = true;

    renderRooms(ROOMS, null);

    checkinEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    checkinEl.focus();
  });

  // --- Pre-fill from URL params (when arriving from hero booking bar) ---
  (function () {
    var p = new URLSearchParams(window.location.search);
    var ci = p.get('checkin');
    var co = p.get('checkout');
    var g  = parseInt(p.get('guests'), 10);

    if (ci) {
      checkinEl.value = ci;
      checkoutEl.min  = shiftDate(ci, 1);
    }
    if (co) checkoutEl.value = co;
    if (!isNaN(g) && g >= 1 && g <= 8) {
      adults = g;
      adultsValEl.textContent = g;
    }

    if (ci && co && co > ci) {
      searchBtn.click();
    }
  }());

})();
